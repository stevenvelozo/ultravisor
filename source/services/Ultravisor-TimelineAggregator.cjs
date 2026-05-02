/**
 * Ultravisor Timeline Aggregator (Phase 5 — Pillar 1)
 *
 * Listens to manifest lifecycle events + queue.* / observer.* broadcast
 * envelopes; projects each into a normalized TimelineRecord; buffers
 * the records in memory; batch-flushes through UltravisorTimelineStore
 * every 100ms or every 100 records, whichever comes first.
 *
 * Phase 5 stance: gap-and-recover. If UV crashes mid-flush, in-flight
 * buffered events are lost from the timeline. This is observability
 * data, not transactional data — we only re-architect for crash-safe
 * ingest if the gap proves visible in production.
 *
 * Wiring:
 *   - The API server registers this aggregator's `handleQueueBroadcast`
 *     as a broadcast tap during wireEndpoints; every stamped envelope
 *     flows through us.
 *   - The Manifest service receives this aggregator's
 *     `handleExecutionEvent` via addExecutionEventListener.
 *
 * @module Ultravisor-TimelineAggregator
 */

const libPictService = require('pict-serviceproviderbase');

const FLUSH_INTERVAL_MS_DEFAULT = 100;
const FLUSH_BATCH_SIZE_DEFAULT  = 100;
const HOT_RETENTION_DAYS_DEFAULT = 30;
const ARCHIVE_TICK_INTERVAL_MS_DEFAULT = 6 * 60 * 60 * 1000; // 6h

class UltravisorTimelineAggregator extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
		this.serviceType = 'UltravisorTimelineAggregator';

		this._FlushIntervalMs   = (pOptions && pOptions.FlushIntervalMs) || FLUSH_INTERVAL_MS_DEFAULT;
		this._FlushBatchSize    = (pOptions && pOptions.FlushBatchSize)  || FLUSH_BATCH_SIZE_DEFAULT;
		this._HotRetentionDays  = (pOptions && pOptions.HotRetentionDays)
			|| HOT_RETENTION_DAYS_DEFAULT;
		this._ArchiveIntervalMs = (pOptions && pOptions.ArchiveTickIntervalMs)
			|| ARCHIVE_TICK_INTERVAL_MS_DEFAULT;

		// In-memory ring of pending records waiting to be flushed.
		// Bounded only by the flush cadence; under sustained load the
		// flush keeps it small. Worst case (UV bursts faster than
		// SQLite can drain): the buffer grows but eventually flushes —
		// it's an in-process JS array, not a persistent queue.
		this._PendingBuffer = [];

		this._FlushTimer = null;
		this._ArchiveTimer = null;
		this._Started = false;

		// Counter for diagnostic. Doesn't drive any decision.
		this._TotalIngested = 0;
		this._TotalDropped  = 0;
	}

	_getService(pTypeName)
	{
		if (!this.fable || !this.fable.servicesMap) return null;
		let tmpMap = this.fable.servicesMap[pTypeName];
		if (!tmpMap) return null;
		return Object.values(tmpMap)[0] || null;
	}

	// ====================================================================
	// Lifecycle
	// ====================================================================

	start()
	{
		if (this._Started) return;
		this._Started = true;

		this._FlushTimer = setInterval(() => this._flushBatch(), this._FlushIntervalMs);
		if (this._FlushTimer.unref) { this._FlushTimer.unref(); }

		this._ArchiveTimer = setInterval(() => this._archiveTick(), this._ArchiveIntervalMs);
		if (this._ArchiveTimer.unref) { this._ArchiveTimer.unref(); }

		this.log.info(
			`TimelineAggregator: started (flush=${this._FlushIntervalMs}ms / `
			+ `${this._FlushBatchSize} batch, retention=${this._HotRetentionDays}d).`);
	}

	stop()
	{
		if (!this._Started) return;
		this._Started = false;
		if (this._FlushTimer) { clearInterval(this._FlushTimer); this._FlushTimer = null; }
		if (this._ArchiveTimer) { clearInterval(this._ArchiveTimer); this._ArchiveTimer = null; }
		// One last drain.
		this._flushBatch();
	}

	getStats()
	{
		return {
			Started:         this._Started,
			BufferDepth:     this._PendingBuffer.length,
			TotalIngested:   this._TotalIngested,
			TotalDropped:    this._TotalDropped,
			FlushIntervalMs: this._FlushIntervalMs,
			FlushBatchSize:  this._FlushBatchSize
		};
	}

	// ====================================================================
	// Event ingestion
	// ====================================================================

	/**
	 * Called by the API server's broadcast tap. pEnvelope already has
	 * EventGUID, Topic, Payload, EmittedAt — we project it into a
	 * TimelineRecord and buffer it.
	 */
	handleQueueBroadcast(pEnvelope)
	{
		if (!pEnvelope || !pEnvelope.EventGUID || !pEnvelope.Topic) { return; }
		// Skip control frames (replay_*, queue.summary, queue.reset) —
		// they're session-scoped and don't represent durable events.
		if (this._isControlTopic(pEnvelope.Topic)) { return; }

		let tmpRec = this._projectQueueEnvelope(pEnvelope);
		if (tmpRec) { this._enqueue(tmpRec); }
	}

	/**
	 * Called by the Manifest's execution event listener. pEventType is
	 * one of ExecutionStart, ExecutionComplete, NodeStart, NodeComplete,
	 * etc.; pRunHash + pData identify the run.
	 */
	handleExecutionEvent(pEventType, pRunHash, pData)
	{
		if (!pEventType || !pRunHash) { return; }
		if (this._isControlExecutionType(pEventType)) { return; }
		let tmpRec = this._projectExecutionEvent(pEventType, pRunHash, pData);
		if (tmpRec) { this._enqueue(tmpRec); }
	}

	_isControlTopic(pTopic)
	{
		if (pTopic === 'queue.summary') return true;
		if (pTopic === 'queue.replay_begin') return true;
		if (pTopic === 'queue.replay_complete') return true;
		if (pTopic === 'queue.reset') return true;
		return false;
	}

	_isControlExecutionType(pType)
	{
		if (pType === 'execution.replay_begin') return true;
		if (pType === 'execution.replay_complete') return true;
		if (pType === 'execution.reset') return true;
		return false;
	}

	_enqueue(pRec)
	{
		this._PendingBuffer.push(pRec);
		this._TotalIngested++;
		if (this._PendingBuffer.length >= this._FlushBatchSize)
		{
			// Crossed batch threshold; flush now rather than waiting
			// for the timer.
			this._flushBatch();
		}
	}

	// ====================================================================
	// Flush + archive
	// ====================================================================

	_flushBatch()
	{
		if (this._PendingBuffer.length === 0) { return; }
		let tmpStore = this._getService('UltravisorTimelineStore');
		if (!tmpStore || !tmpStore.isEnabled())
		{
			// Store unavailable — drop the buffer rather than letting
			// it grow unboundedly. Phase 5 is gap-tolerant.
			this._TotalDropped += this._PendingBuffer.length;
			this._PendingBuffer.length = 0;
			return;
		}
		let tmpBatch = this._PendingBuffer;
		this._PendingBuffer = [];
		try
		{
			tmpStore.insertBatch(tmpBatch);
		}
		catch (pErr)
		{
			this._TotalDropped += tmpBatch.length;
			this.log.warn(`TimelineAggregator: flush failed (${tmpBatch.length} dropped): ${pErr.message}`);
		}
	}

	_archiveTick()
	{
		let tmpStore = this._getService('UltravisorTimelineStore');
		if (!tmpStore || !tmpStore.isEnabled()) { return; }
		let tmpCutoff = new Date(Date.now() - this._HotRetentionDays * 86400 * 1000).toISOString();
		try
		{
			let tmpMoved = tmpStore.archiveOlderThan(tmpCutoff);
			if (tmpMoved > 0)
			{
				this.log.info(`TimelineAggregator: archived ${tmpMoved} rows older than ${tmpCutoff}.`);
			}
		}
		catch (pErr)
		{
			this.log.warn(`TimelineAggregator: archive cycle threw: ${pErr.message}`);
		}
	}

	// ====================================================================
	// Projection
	// ====================================================================

	_projectQueueEnvelope(pEnvelope)
	{
		let tmpPayload = pEnvelope.Payload || {};
		let tmpTopic = pEnvelope.Topic;
		let tmpAt = pEnvelope.EmittedAt || new Date().toISOString();
		let tmpEventType = this._topicToEventType(tmpTopic);
		// EndAt: terminal / instantaneous events → equal to At.
		// "Running" lifecycle isn't projected from these envelopes —
		// it's projected at READ time from the live work queue.
		let tmpEndAt = tmpAt;
		// DurationMs: only set on terminal events that carry it.
		let tmpDurationMs = Number.isFinite(tmpPayload.DurationMs) ? tmpPayload.DurationMs : 0;
		// If the broadcast carries DispatchedAt + completion-time we
		// could compute span here; for now keep instantaneous and let
		// the renderer connect Dispatched→Complete by RunHash if it
		// wants spans.
		return {
			EventGUID:     pEnvelope.EventGUID,
			At:            tmpAt,
			EndAt:         tmpEndAt,
			EventType:     tmpEventType,
			RunHash:       tmpPayload.RunHash || tmpPayload.RunID || '',
			OperationHash: tmpPayload.OperationHash || '',
			WorkItemHash:  tmpPayload.WorkItemHash || '',
			Capability:    tmpPayload.Capability || '',
			Action:        tmpPayload.Action || '',
			BeaconID:      tmpPayload.BeaconID || tmpPayload.AssignedBeaconID || '',
			Status:        tmpPayload.Status || '',
			DurationMs:    tmpDurationMs,
			RawRefHash:    pEnvelope.EventGUID
		};
	}

	_topicToEventType(pTopic)
	{
		// queue.enqueued → "Enqueued"; observer.admission.denied →
		// "Admission.Denied"; etc. Title-case after the dot.
		if (!pTopic) return 'Unknown';
		let tmpParts = pTopic.split('.');
		if (tmpParts.length < 2) return pTopic;
		// Drop the prefix ("queue", "observer") and PascalCase the rest.
		let tmpTail = tmpParts.slice(1).join('.');
		return tmpTail
			.split('.')
			.map((pP) => pP.length === 0 ? pP : pP.charAt(0).toUpperCase() + pP.slice(1))
			.join('.');
	}

	_projectExecutionEvent(pEventType, pRunHash, pData)
	{
		let tmpData = pData || {};
		let tmpAt = tmpData.At || tmpData.EmittedAt || new Date().toISOString();
		let tmpEndAt = tmpAt;
		let tmpDurationMs = Number.isFinite(tmpData.DurationMs) ? tmpData.DurationMs
			: (Number.isFinite(tmpData.ElapsedMs) ? tmpData.ElapsedMs : 0);
		// EventGUID for execution events: the manifest emits its own
		// per-run Seq but no globally-unique GUID. Synthesize one from
		// (RunHash, EventType, NodeHash, Seq) deterministically so
		// re-projection is idempotent. Falling back to a generated UUID
		// would break dedup on restart-with-replay.
		let tmpKey = `${pRunHash}|${pEventType}|${tmpData.NodeHash || ''}|${tmpData.Seq || tmpAt}`;
		let tmpEventGUID = tmpData.EventGUID || ('exec-' + this._hash(tmpKey));
		return {
			EventGUID:     tmpEventGUID,
			At:            tmpAt,
			EndAt:         tmpEndAt,
			EventType:     'Execution.' + pEventType.replace(/^execution\./, ''),
			RunHash:       pRunHash,
			OperationHash: tmpData.OperationHash || '',
			WorkItemHash:  tmpData.WorkItemHash || '',
			Capability:    tmpData.Capability || '',
			Action:        tmpData.Action || '',
			BeaconID:      tmpData.BeaconID || '',
			Status:        tmpData.Status || '',
			DurationMs:    tmpDurationMs,
			RawRefHash:    pRunHash + '#' + (tmpData.NodeHash || pEventType)
		};
	}

	// Cheap deterministic short hash; collisions don't matter because
	// the natural key (RunHash|EventType|NodeHash|Seq) is already nearly
	// unique. Falls back to a plain string when crypto isn't available.
	_hash(pStr)
	{
		try
		{
			let libCrypto = require('crypto');
			return libCrypto.createHash('sha1').update(pStr).digest('hex').slice(0, 16);
		}
		catch (pErr)
		{
			return String(pStr).replace(/[^a-z0-9]/gi, '').slice(0, 16);
		}
	}
}

module.exports = UltravisorTimelineAggregator;
