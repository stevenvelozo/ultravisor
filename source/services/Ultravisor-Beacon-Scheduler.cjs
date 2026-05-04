/**
 * Ultravisor Beacon Scheduler
 *
 * Drives the queue forward between ticks:
 *   - Promotes Queued work items to Dispatched by matching available
 *     beacons to pending items (affinity → priority → FIFO EnqueuedAt).
 *   - Recomputes Health and HealthLabel for every non-terminal item
 *     using the min-of-dimensions formula (weakest link wins).
 *   - Broadcasts queue.* deltas + a rolled-up queue.summary snapshot
 *     to any subscribed WebSocket client.
 *
 * All mutations flow through the QueueStore so durability and the
 * in-memory view stay aligned.  The Coordinator remains the sole
 * owner of _WorkQueue/_Beacons state; the scheduler calls into it for
 * assignment and asks the store for historical queries.
 *
 * @module Ultravisor-Beacon-Scheduler
 */

const libPictService = require('pict-serviceproviderbase');

// Accept both the new queueing-era status names (Completed/Failed/Canceled)
// and the legacy Coordinator names (Complete/Error/Timeout) so an in-flight
// upgrade doesn't drop items.
const TERMINAL_STATUSES = new Set(['Completed', 'Complete', 'Failed', 'Error', 'Timeout', 'Canceled']);
const NONTERMINAL_STATUSES = ['Queued', 'Pending', 'Assigned', 'Dispatched', 'Running'];

// Health label thresholds (on the 0.0..1.0 score)
const THRESHOLD_HEALTHY = 0.6;
const THRESHOLD_UNCERTAIN = 0.3;

// Items younger than this have no meaningful health signal yet.
const FRESH_GRACE_MS = 2000;

// Stalled detection: minimum multiplier on the action's HeartbeatExpectedMs
// before flipping a Dispatched/Running item to Stalled. Tunable per-action
// via BeaconActionDefault.HeartbeatExpectedMs (a quick shell command and a
// long LLM call have very different baselines). Two heartbeat windows is
// the same "weakest link" threshold the freshness dimension uses, so an
// item that's already Unhealthy on event_freshness rolls into Stalled
// without re-deriving a separate threshold.
const STALL_HEARTBEAT_MULTIPLIER = 2;

class UltravisorBeaconScheduler extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.serviceType = 'UltravisorBeaconScheduler';

		this._DispatchTickMs = (this.fable.settings && this.fable.settings.UltravisorSchedulerDispatchTickMs) || 500;
		this._HealthTickMs   = (this.fable.settings && this.fable.settings.UltravisorSchedulerHealthTickMs)   || 5000;
		this._SummaryTickMs  = (this.fable.settings && this.fable.settings.UltravisorSchedulerSummaryTickMs)  || 1000;

		this._DispatchInterval = null;
		this._HealthInterval = null;
		this._SummaryInterval = null;
		this._Running = false;

		this._BroadcastHandler = null;

		// Last-broadcast snapshots so we only emit health deltas that move the label
		// or move the score by more than DELTA threshold.
		this._LastHealthBroadcast = {};
	}

	setBroadcastHandler(fHandler)
	{
		this._BroadcastHandler = (typeof fHandler === 'function') ? fHandler : null;
	}

	_broadcast(pTopic, pPayload)
	{
		if (!this._BroadcastHandler) return;
		try { this._BroadcastHandler(pTopic, pPayload); }
		catch (pError) { this.log.warn(`Scheduler broadcast failed (${pTopic}): ${pError.message}`); }
	}

	_getCoordinator()
	{
		let tmpMap = this.fable.servicesMap && this.fable.servicesMap.UltravisorBeaconCoordinator;
		return tmpMap ? Object.values(tmpMap)[0] : null;
	}

	_getStore()
	{
		let tmpMap = this.fable.servicesMap && this.fable.servicesMap.UltravisorBeaconQueueStore;
		if (!tmpMap) return null;
		let tmpStore = Object.values(tmpMap)[0];
		return (tmpStore && tmpStore.isEnabled()) ? tmpStore : null;
	}

	/**
	 * Persistence bridge — beacon-or-local fallback. Same shape the
	 * Coordinator uses; the scheduler funnels every write through it
	 * so a connected QueuePersistence beacon sees the full event log
	 * (dispatched, canceled, health updates, reorders).
	 */
	_getBridge()
	{
		let tmpMap = this.fable.servicesMap && this.fable.servicesMap.UltravisorQueuePersistenceBridge;
		if (!tmpMap) return null;
		return Object.values(tmpMap)[0] || null;
	}

	_isMetaCapability(pCapability)
	{
		// Mirror the coordinator's gate. Kept as a per-class method
		// rather than a shared module so both classes can independently
		// add their own meta-capabilities later.
		return pCapability === 'QueuePersistence' || pCapability === 'ManifestStore';
	}

	_persistBest(pPromise, pLabel)
	{
		if (!pPromise || typeof pPromise.then !== 'function') return;
		pPromise.then((pResult) =>
		{
			if (pResult && pResult.Success === false && pResult.Reason)
			{
				this.log.warn(`BeaconScheduler: ${pLabel}: ${pResult.Reason}`);
			}
		}).catch((pErr) =>
		{
			this.log.warn(`BeaconScheduler: ${pLabel} threw: ${(pErr && pErr.message) || pErr}`);
		});
	}

	_getDefaults()
	{
		let tmpMap = this.fable.servicesMap && this.fable.servicesMap.UltravisorBeaconActionDefaults;
		return tmpMap ? Object.values(tmpMap)[0] : null;
	}

	// ====================================================================
	// Lifecycle
	// ====================================================================

	start()
	{
		if (this._Running) return;
		this._Running = true;

		this._DispatchInterval = setInterval(() => this._dispatchTick(), this._DispatchTickMs);
		this._HealthInterval = setInterval(() => this._healthTick(), this._HealthTickMs);
		this._SummaryInterval = setInterval(() => this._summaryTick(), this._SummaryTickMs);

		this.log.info(`BeaconScheduler: started (dispatch=${this._DispatchTickMs}ms health=${this._HealthTickMs}ms summary=${this._SummaryTickMs}ms).`);
	}

	stop()
	{
		if (!this._Running) return;
		this._Running = false;
		if (this._DispatchInterval) { clearInterval(this._DispatchInterval); this._DispatchInterval = null; }
		if (this._HealthInterval)   { clearInterval(this._HealthInterval);   this._HealthInterval = null; }
		if (this._SummaryInterval)  { clearInterval(this._SummaryInterval);  this._SummaryInterval = null; }
		this.log.info('BeaconScheduler: stopped.');
	}

	// ====================================================================
	// Dispatch tick — promote Queued → Dispatched
	// ====================================================================

	_dispatchTick()
	{
		let tmpCoordinator = this._getCoordinator();
		if (!tmpCoordinator) return;

		let tmpQueue = tmpCoordinator._WorkQueue || {};
		let tmpPending = [];
		for (let tmpHash of Object.keys(tmpQueue))
		{
			let tmpItem = tmpQueue[tmpHash];
			if (tmpItem.Status === 'Queued' || tmpItem.Status === 'Pending')
			{
				tmpPending.push(tmpItem);
			}
		}
		if (tmpPending.length === 0) return;

		tmpPending.sort(this._compareDispatchPriority);

		for (let tmpItem of tmpPending)
		{
			if (tmpItem.CancelRequested)
			{
				this._markCanceled(tmpItem, tmpCoordinator, 'Canceled before dispatch');
				continue;
			}
			let tmpBeacon = this._pickBeacon(tmpItem, tmpCoordinator);
			if (!tmpBeacon) continue;
			this._dispatchItemToBeacon(tmpItem, tmpBeacon, tmpCoordinator);
		}
	}

	_compareDispatchPriority(pA, pB)
	{
		// Affinity-bound first (already Status=Assigned by coordinator)
		let tmpAAssigned = pA.Status === 'Assigned' ? 1 : 0;
		let tmpBAssigned = pB.Status === 'Assigned' ? 1 : 0;
		if (tmpAAssigned !== tmpBAssigned) return tmpBAssigned - tmpAAssigned;

		// Then higher priority
		let tmpAPri = pA.Priority || 0;
		let tmpBPri = pB.Priority || 0;
		if (tmpAPri !== tmpBPri) return tmpBPri - tmpAPri;

		// Then FIFO on EnqueuedAt (CreatedAt fallback)
		let tmpATs = pA.EnqueuedAt || pA.CreatedAt || '';
		let tmpBTs = pB.EnqueuedAt || pB.CreatedAt || '';
		if (tmpATs < tmpBTs) return -1;
		if (tmpATs > tmpBTs) return 1;
		return 0;
	}

	_pickBeacon(pItem, pCoordinator)
	{
		if (pItem.AssignedBeaconID)
		{
			let tmpBeacon = pCoordinator._Beacons[pItem.AssignedBeaconID];
			if (tmpBeacon && this._beaconCanTake(tmpBeacon, pItem))
			{
				return tmpBeacon;
			}
			return null;
		}

		// Name-based routing: AffinityKey may designate a specific
		// beacon by Name. Mirrors the resolution Coordinator does at
		// enqueue time; we repeat it here so paths that bypass
		// enqueueWorkItem (e.g. requeue) still honor it.
		if (pItem.AffinityKey && typeof pCoordinator.findBeaconByName === 'function')
		{
			let tmpNamed = pCoordinator.findBeaconByName(pItem.AffinityKey);
			if (tmpNamed)
			{
				return this._beaconCanTake(tmpNamed, pItem) ? tmpNamed : null;
			}
		}

		let tmpBestBeacon = null;
		let tmpBestLoad = Infinity;
		let tmpBeacons = pCoordinator._Beacons || {};
		for (let tmpID of Object.keys(tmpBeacons))
		{
			let tmpBeacon = tmpBeacons[tmpID];
			if (!this._beaconCanTake(tmpBeacon, pItem)) continue;
			let tmpLoad = (tmpBeacon.CurrentWorkItems || []).length;
			if (tmpLoad < tmpBestLoad)
			{
				tmpBestLoad = tmpLoad;
				tmpBestBeacon = tmpBeacon;
			}
		}
		return tmpBestBeacon;
	}

	_beaconCanTake(pBeacon, pItem)
	{
		if (!pBeacon) return false;
		if (pBeacon.Status && pBeacon.Status !== 'Online' && pBeacon.Status !== 'Active') return false;

		let tmpCaps = pBeacon.Capabilities || [];
		let tmpCapName = pItem.Capability || 'Shell';
		let tmpHasCap = false;
		for (let tmpCap of tmpCaps)
		{
			if (typeof tmpCap === 'string' && tmpCap === tmpCapName) { tmpHasCap = true; break; }
			if (tmpCap && tmpCap.Capability === tmpCapName) { tmpHasCap = true; break; }
		}
		if (!tmpHasCap) return false;

		let tmpMax = pBeacon.MaxConcurrent || 1;
		let tmpActive = (pBeacon.CurrentWorkItems || []).length;
		return tmpActive < tmpMax;
	}

	_dispatchItemToBeacon(pItem, pBeacon, pCoordinator)
	{
		let tmpNow = Date.now();
		let tmpNowIso = new Date(tmpNow).toISOString();
		let tmpEnqueuedMs = pItem.EnqueuedAt ? Date.parse(pItem.EnqueuedAt) : tmpNow;
		let tmpQueueWaitMs = Math.max(0, tmpNow - tmpEnqueuedMs);

		let tmpFromStatus = pItem.Status;
		pItem.Status = 'Dispatched';
		pItem.AssignedBeaconID = pBeacon.BeaconID;
		pItem.AssignedAt = pItem.AssignedAt || tmpNowIso;
		pItem.DispatchedAt = tmpNowIso;
		// Phase 4 — Pillar 1 follow-up: reset LastEventAt on dispatch.
		// _maybeMarkStalled reads LastEventAt || DispatchedAt; without
		// this reset, an item that sat Pending for >120s gets stalled
		// the same tick it dispatches because LastEventAt still points
		// to the original enqueue. The huge-stress workload (~600 ops
		// queued for a single-slot DI beacon) makes that queue wait
		// the norm, not the exception, and the false stalls cascade
		// into Operation-level Stalled finalization.
		pItem.LastEventAt = tmpNowIso;
		pItem.QueueWaitMs = tmpQueueWaitMs;
		pItem.LastEventAt = tmpNowIso;
		pItem.AttemptNumber = (pItem.AttemptNumber || 0) + 1;

		// Pre-compute QueueMetadata envelope so the submitter side
		// (retold-labs capability handlers) can emit phases.jsonl
		// without having to call back to the hub.
		pItem.Settings = pItem.Settings || {};
		pItem.Settings.QueueMetadata = {
			RunID: pItem.RunID || '',
			WorkItemHash: pItem.WorkItemHash,
			EnqueuedAt: pItem.EnqueuedAt || tmpNowIso,
			DispatchedAt: tmpNowIso,
			QueueWaitMs: tmpQueueWaitMs,
			AttemptNumber: pItem.AttemptNumber,
			HubInstanceID: (this.fable.settings && this.fable.settings.UltravisorHubInstanceID) || ''
		};

		// Track beacon load.
		if (!pBeacon.CurrentWorkItems) pBeacon.CurrentWorkItems = [];
		if (pBeacon.CurrentWorkItems.indexOf(pItem.WorkItemHash) === -1)
		{
			pBeacon.CurrentWorkItems.push(pItem.WorkItemHash);
		}

		let tmpDispatchBridge = this._getBridge();
		if (tmpDispatchBridge && !this._isMetaCapability(pItem.Capability))
		{
			this._persistBest(tmpDispatchBridge.updateWorkItem(pItem.WorkItemHash, {
				Status: 'Dispatched',
				AssignedBeaconID: pBeacon.BeaconID,
				AssignedAt: pItem.AssignedAt,
				DispatchedAt: pItem.DispatchedAt,
				QueueWaitMs: tmpQueueWaitMs,
				AttemptNumber: pItem.AttemptNumber,
				LastEventAt: pItem.LastEventAt,
				Settings: pItem.Settings
			}), 'dispatch update');
			this._persistBest(tmpDispatchBridge.appendEvent({
				WorkItemHash: pItem.WorkItemHash,
				RunID: pItem.RunID,
				EventType: 'dispatched',
				FromStatus: tmpFromStatus,
				ToStatus: 'Dispatched',
				BeaconID: pBeacon.BeaconID,
				Payload: { QueueWaitMs: tmpQueueWaitMs }
			}), 'dispatched event');
			this._persistBest(tmpDispatchBridge.insertAttempt({
				WorkItemHash: pItem.WorkItemHash,
				AttemptNumber: pItem.AttemptNumber,
				BeaconID: pBeacon.BeaconID,
				DispatchedAt: pItem.DispatchedAt,
				Outcome: 'Dispatched'
			}), 'dispatch attempt');
		}

		this.log.info(`BeaconScheduler: dispatched [${pItem.WorkItemHash}] to beacon [${pBeacon.BeaconID}] (queue_wait=${tmpQueueWaitMs}ms, attempt=${pItem.AttemptNumber}).`);

		// Try WebSocket push first; fall back to HTTP poll pickup.
		let tmpPushed = false;
		if (typeof pCoordinator._WorkItemPushHandler === 'function'
			&& typeof pCoordinator._sanitizeWorkItemForBeacon === 'function')
		{
			try
			{
				let tmpSanitized = pCoordinator._sanitizeWorkItemForBeacon(pItem);
				tmpPushed = !!pCoordinator._WorkItemPushHandler(pBeacon.BeaconID, tmpSanitized);
			}
			catch (pErr)
			{
				this.log.warn(`BeaconScheduler: push handler threw: ${pErr.message}`);
			}
		}

		this._broadcast('queue.dispatched', {
			WorkItemHash: pItem.WorkItemHash,
			RunID: pItem.RunID,
			BeaconID: pBeacon.BeaconID,
			Capability: pItem.Capability,
			Action: pItem.Action,
			QueueWaitMs: tmpQueueWaitMs,
			AttemptNumber: pItem.AttemptNumber,
			Pushed: tmpPushed,
			DispatchedAt: pItem.DispatchedAt
		});
	}

	_markCanceled(pItem, pCoordinator, pReason)
	{
		let tmpNowIso = new Date().toISOString();
		let tmpFromStatus = pItem.Status;
		pItem.Status = 'Canceled';
		pItem.CanceledAt = pItem.CanceledAt || tmpNowIso;
		pItem.CancelReason = pItem.CancelReason || pReason || '';
		pItem.LastEventAt = tmpNowIso;

		let tmpCancelBridge = this._getBridge();
		if (tmpCancelBridge && !this._isMetaCapability(pItem.Capability))
		{
			this._persistBest(tmpCancelBridge.updateWorkItem(pItem.WorkItemHash, {
				Status: 'Canceled',
				CanceledAt: pItem.CanceledAt,
				CancelReason: pItem.CancelReason,
				LastEventAt: tmpNowIso
			}), 'cancel update');
			this._persistBest(tmpCancelBridge.appendEvent({
				WorkItemHash: pItem.WorkItemHash,
				RunID: pItem.RunID,
				EventType: 'canceled',
				FromStatus: tmpFromStatus,
				ToStatus: 'Canceled',
				Payload: { Reason: pItem.CancelReason }
			}), 'canceled event');
		}

		this._broadcast('queue.canceled', {
			WorkItemHash: pItem.WorkItemHash,
			RunID: pItem.RunID,
			Reason: pItem.CancelReason
		});
	}

	// ====================================================================
	// Health tick — recompute Health/HealthLabel on every non-terminal item
	// ====================================================================

	_healthTick()
	{
		let tmpCoordinator = this._getCoordinator();
		if (!tmpCoordinator) return;
		let tmpQueue = tmpCoordinator._WorkQueue || {};
		for (let tmpHash of Object.keys(tmpQueue))
		{
			let tmpItem = tmpQueue[tmpHash];
			if (TERMINAL_STATUSES.has(tmpItem.Status)) continue;
			// Stalled is a non-terminal but already-flagged state.  Skip
			// the health recompute (it would just thrash the score) and
			// only check for recovery (heartbeat resumed before the
			// Coordinator's stall-finalize landed).
			if (tmpItem.Status === 'Stalled')
			{
				this._maybeRecoverStalled(tmpItem);
				continue;
			}
			this._updateHealth(tmpItem);
			this._maybeMarkStalled(tmpItem, tmpCoordinator);
		}
	}

	/**
	 * Flip a previously-active item to Stalled when its beacon stops
	 * sending heartbeats past HeartbeatExpectedMs × STALL_HEARTBEAT_MULTIPLIER.
	 *
	 * Catches two scenarios:
	 *   - Status=Dispatched/Running with stale LastEventAt: the beacon
	 *     is wedged but the WebSocket hasn't dropped yet.
	 *   - Status=Pending after a prior dispatch (LastEventAt set and old):
	 *     the Coordinator's deregisterBeacon path resets in-flight items
	 *     to Pending when their beacon's WebSocket closes.  If no other
	 *     beacon picks it up before the heartbeat threshold elapses, the
	 *     item is effectively stuck and rolls up to Stalled.
	 *
	 * HealthLabel isn't part of the gate — a Pending item with no wait
	 * baseline scores as Unknown, not Unhealthy, so requiring Unhealthy
	 * would miss the post-deregister case.  LastEventAt + the heartbeat
	 * threshold is a sharper signal anyway.
	 */
	_maybeMarkStalled(pItem, pCoordinator)
	{
		// Skip items that were never dispatched.  A Pending item is
		// only a stall candidate if it was previously running (i.e.
		// the deregister path bounced it back to Pending after the
		// beacon's WS dropped).  Without this gate, ordinary queue
		// backlog (Transformer busy with one item, more in queue
		// behind it) gets misclassified as Stalled within 120s.
		let tmpEligibleStatuses = ['Dispatched', 'Running', 'Pending', 'Assigned'];
		if (tmpEligibleStatuses.indexOf(pItem.Status) < 0) return;
		let tmpEverDispatched = !!pItem.DispatchedAt;
		if ((pItem.Status === 'Pending' || pItem.Status === 'Assigned') && !tmpEverDispatched) return;

		let tmpLastEventStr = pItem.LastEventAt || pItem.DispatchedAt;
		if (!tmpLastEventStr) return;
		let tmpLastEventMs = Date.parse(tmpLastEventStr);
		if (isNaN(tmpLastEventMs)) return;

		let tmpDefaults = this._getDefaults();
		let tmpResolved = tmpDefaults
			? tmpDefaults.resolve(pItem.Capability, pItem.Action)
			: { HeartbeatExpectedMs: 60000 };
		let tmpHeartbeat = tmpResolved.HeartbeatExpectedMs || 60000;
		let tmpStallThreshold = tmpHeartbeat * STALL_HEARTBEAT_MULTIPLIER;

		let tmpSinceEvent = Date.now() - tmpLastEventMs;
		if (tmpSinceEvent <= tmpStallThreshold) return;

		let tmpFromStatus = pItem.Status;
		let tmpNowIso = new Date().toISOString();
		pItem.PriorStatusBeforeStall = tmpFromStatus;
		pItem.Status = 'Stalled';
		pItem.StalledAt = tmpNowIso;
		pItem.StalledSinceMs = tmpSinceEvent;

		let tmpStallBridge = this._getBridge();
		if (tmpStallBridge && !this._isMetaCapability(pItem.Capability))
		{
			this._persistBest(tmpStallBridge.updateWorkItem(pItem.WorkItemHash, {
				Status: 'Stalled',
				StalledAt: pItem.StalledAt
			}), 'stall update');
			this._persistBest(tmpStallBridge.appendEvent({
				WorkItemHash: pItem.WorkItemHash,
				RunID: pItem.RunID,
				EventType: 'stalled',
				FromStatus: tmpFromStatus,
				ToStatus: 'Stalled',
				BeaconID: pItem.AssignedBeaconID,
				Payload: { LastEventAt: pItem.LastEventAt, StalledSinceMs: tmpSinceEvent }
			}), 'stalled event');
		}

		this.log.warn(`BeaconScheduler: work item [${pItem.WorkItemHash}] flipped to Stalled (no event for ${tmpSinceEvent}ms, threshold ${tmpStallThreshold}ms).`);

		this._broadcast('queue.stalled', {
			WorkItemHash: pItem.WorkItemHash,
			RunID: pItem.RunID,
			Capability: pItem.Capability,
			Action: pItem.Action,
			BeaconID: pItem.AssignedBeaconID,
			LastEventAt: pItem.LastEventAt,
			StalledSince: pItem.StalledAt,
			StalledSinceMs: tmpSinceEvent
		});

		// Drive the operation rollup. The Coordinator owns the
		// engine-resume path; ask it to mark the work item as a
		// Stalled outcome (analogous to failWorkItem but with a
		// distinct terminal label that finalizeExecution rolls up
		// to operation Status='Stalled').
		if (pCoordinator && typeof pCoordinator.stallWorkItem === 'function')
		{
			pCoordinator.stallWorkItem(pItem.WorkItemHash, function (pErr)
			{
				// stallWorkItem already journals; swallow callback errors
				// so a bad rollup doesn't tear down the health tick.
			});
		}
	}

	/**
	 * Heartbeat resumed on an item still parked in Stalled.  Flip
	 * back to its prior status and emit queue.unstalled so the UI
	 * can clear the alert.  In practice this is rare: stall detection
	 * triggers the Coordinator's stall-finalize path immediately, so
	 * by the next health tick the item is usually already removed.
	 * It still fires for the narrow window between stall detection
	 * and the rollup callback, plus any standalone (no-RunHash) work
	 * items the rollup path skips.
	 */
	_maybeRecoverStalled(pItem)
	{
		let tmpDefaults = this._getDefaults();
		let tmpResolved = tmpDefaults
			? tmpDefaults.resolve(pItem.Capability, pItem.Action)
			: { HeartbeatExpectedMs: 60000 };
		let tmpHeartbeat = tmpResolved.HeartbeatExpectedMs || 60000;
		let tmpStallThreshold = tmpHeartbeat * STALL_HEARTBEAT_MULTIPLIER;

		let tmpLastEventStr = pItem.LastEventAt || pItem.DispatchedAt;
		if (!tmpLastEventStr) return;
		let tmpLastEventMs = Date.parse(tmpLastEventStr);
		if (isNaN(tmpLastEventMs)) return;
		let tmpSinceEvent = Date.now() - tmpLastEventMs;
		if (tmpSinceEvent > tmpStallThreshold) return;

		let tmpPrior = pItem.PriorStatusBeforeStall || 'Running';
		pItem.Status = tmpPrior;
		delete pItem.PriorStatusBeforeStall;
		delete pItem.StalledAt;
		delete pItem.StalledSinceMs;

		let tmpRecoverBridge = this._getBridge();
		if (tmpRecoverBridge && !this._isMetaCapability(pItem.Capability))
		{
			this._persistBest(tmpRecoverBridge.updateWorkItem(pItem.WorkItemHash, {
				Status: tmpPrior
			}), 'unstall update');
			this._persistBest(tmpRecoverBridge.appendEvent({
				WorkItemHash: pItem.WorkItemHash,
				RunID: pItem.RunID,
				EventType: 'unstalled',
				FromStatus: 'Stalled',
				ToStatus: tmpPrior,
				BeaconID: pItem.AssignedBeaconID
			}), 'unstalled event');
		}

		this.log.info(`BeaconScheduler: work item [${pItem.WorkItemHash}] recovered from Stalled, back to ${tmpPrior}.`);

		this._broadcast('queue.unstalled', {
			WorkItemHash: pItem.WorkItemHash,
			RunID: pItem.RunID,
			BeaconID: pItem.AssignedBeaconID,
			Status: tmpPrior,
			RecoveredAt: new Date().toISOString()
		});
	}

	/**
	 * Compute the min-of-dimensions health score for a single item.
	 * Public on the instance so the API server can request an
	 * on-demand refresh for the /queue view.
	 */
	computeHealth(pItem)
	{
		let tmpNow = Date.now();
		let tmpReasons = [];
		let tmpScore = 1.0;
		let tmpUnknown = false;

		let tmpDefaults = this._getDefaults();
		let tmpResolved = tmpDefaults
			? tmpDefaults.resolve(pItem.Capability, pItem.Action)
			: { HeartbeatExpectedMs: 60000, ExpectedWaitP95Ms: 0, MinSamplesForBaseline: 20 };

		// Dimension 1: retry burn — always applicable
		let tmpMaxAttempts = pItem.MaxAttempts || 1;
		let tmpAttemptNum = pItem.AttemptNumber || 0;
		if (tmpMaxAttempts > 0)
		{
			let tmpRetryScore = Math.max(0, 1 - (tmpAttemptNum / tmpMaxAttempts));
			if (tmpRetryScore < tmpScore)
			{
				tmpScore = tmpRetryScore;
				tmpReasons = ['retry_burn'];
			}
		}

		if (pItem.Status === 'Queued' || pItem.Status === 'Pending' || pItem.Status === 'Assigned')
		{
			let tmpEnq = pItem.EnqueuedAt ? Date.parse(pItem.EnqueuedAt) : tmpNow;
			let tmpWait = Math.max(0, tmpNow - tmpEnq);

			// Need a baseline to judge wait health.
			if (tmpResolved.ExpectedWaitP95Ms > 0)
			{
				let tmpCeiling = tmpResolved.ExpectedWaitP95Ms * 3;
				let tmpWaitScore = Math.max(0, Math.min(1, 1 - (tmpWait / tmpCeiling)));
				if (tmpWaitScore < tmpScore)
				{
					tmpScore = tmpWaitScore;
					tmpReasons = ['queue_wait'];
				}
			}
			else
			{
				// No baseline yet.  If we also have no signal from
				// retry burn (first attempt), we can't judge — Unknown.
				if (tmpAttemptNum <= 1) tmpUnknown = true;
			}
		}
		else if (pItem.Status === 'Dispatched' || pItem.Status === 'Running')
		{
			let tmpStarted = pItem.StartedAt ? Date.parse(pItem.StartedAt)
				: (pItem.DispatchedAt ? Date.parse(pItem.DispatchedAt) : tmpNow);
			let tmpElapsed = Math.max(0, tmpNow - tmpStarted);

			if (tmpElapsed < FRESH_GRACE_MS && !pItem.LastEventAt)
			{
				tmpUnknown = true;
			}
			else
			{
				// Dimension 2: timeout proximity
				let tmpTimeout = pItem.TimeoutMs || 300000;
				let tmpTimeoutScore = Math.max(0, 1 - (tmpElapsed / tmpTimeout));
				if (tmpTimeoutScore < tmpScore)
				{
					tmpScore = tmpTimeoutScore;
					tmpReasons = ['timeout_proximity'];
				}

				// Dimension 3: event freshness
				let tmpLastEvent = pItem.LastEventAt
					? Date.parse(pItem.LastEventAt)
					: tmpStarted;
				let tmpSinceEvent = Math.max(0, tmpNow - tmpLastEvent);
				let tmpHeartbeat = tmpResolved.HeartbeatExpectedMs || 60000;
				let tmpFreshnessScore = Math.max(0, Math.min(1, 1 - (tmpSinceEvent / (tmpHeartbeat * 2))));
				if (tmpFreshnessScore < tmpScore)
				{
					tmpScore = tmpFreshnessScore;
					tmpReasons = ['event_freshness'];
				}
			}
		}

		if (tmpUnknown)
		{
			return { Score: null, Label: 'Unknown', Reason: 'insufficient_signal' };
		}

		let tmpLabel;
		if (tmpScore >= THRESHOLD_HEALTHY) tmpLabel = 'Healthy';
		else if (tmpScore >= THRESHOLD_UNCERTAIN) tmpLabel = 'Uncertain';
		else tmpLabel = 'Unhealthy';

		return {
			Score: Number(tmpScore.toFixed(4)),
			Label: tmpLabel,
			Reason: tmpReasons[0] || 'nominal'
		};
	}

	_updateHealth(pItem)
	{
		let tmpHealth = this.computeHealth(pItem);
		let tmpNowIso = new Date().toISOString();

		let tmpPrevLabel = pItem.HealthLabel || 'Unknown';
		let tmpPrevScore = (pItem.Health == null) ? null : Number(pItem.Health);

		pItem.Health = tmpHealth.Score;
		pItem.HealthLabel = tmpHealth.Label;
		pItem.HealthReason = tmpHealth.Reason;
		pItem.HealthComputedAt = tmpNowIso;

		let tmpHealthBridge = this._getBridge();
		if (tmpHealthBridge && !this._isMetaCapability(pItem.Capability))
		{
			this._persistBest(tmpHealthBridge.updateWorkItem(pItem.WorkItemHash, {
				Health: tmpHealth.Score,
				HealthLabel: tmpHealth.Label,
				HealthReason: tmpHealth.Reason,
				HealthComputedAt: tmpNowIso
			}), 'health update');
		}

		// Only broadcast on label change or meaningful score delta.
		let tmpLabelChanged = (tmpPrevLabel !== tmpHealth.Label);
		let tmpScoreDelta = (tmpPrevScore != null && tmpHealth.Score != null)
			? Math.abs(tmpPrevScore - tmpHealth.Score)
			: 1;
		let tmpShouldBroadcast = tmpLabelChanged || (tmpScoreDelta >= 0.1);
		if (!tmpShouldBroadcast) return;

		this._LastHealthBroadcast[pItem.WorkItemHash] = { Label: tmpHealth.Label, Score: tmpHealth.Score };
		this._broadcast('queue.health', {
			WorkItemHash: pItem.WorkItemHash,
			RunID: pItem.RunID,
			Status: pItem.Status,
			Health: tmpHealth.Score,
			HealthLabel: tmpHealth.Label,
			HealthReason: tmpHealth.Reason
		});
	}

	// ====================================================================
	// Summary tick — bucket counts + p50/p95 per capability
	// ====================================================================

	_summaryTick()
	{
		let tmpSummary = this.summarize();
		this._broadcast('queue.summary', tmpSummary);
	}

	summarize()
	{
		let tmpCoordinator = this._getCoordinator();
		let tmpQueue = tmpCoordinator ? (tmpCoordinator._WorkQueue || {}) : {};

		let tmpBuckets = { Upcoming: 0, InProgress: 0, Stalled: 0, Completed: 0, Errored: 0 };
		let tmpByCapability = {};

		for (let tmpHash of Object.keys(tmpQueue))
		{
			let tmpItem = tmpQueue[tmpHash];
			let tmpBucket = this.bucketFor(tmpItem);
			tmpBuckets[tmpBucket] = (tmpBuckets[tmpBucket] || 0) + 1;

			let tmpCapKey = `${tmpItem.Capability || 'Shell'}|${tmpItem.Action || ''}`;
			if (!tmpByCapability[tmpCapKey])
			{
				tmpByCapability[tmpCapKey] = {
					Capability: tmpItem.Capability || 'Shell',
					Action: tmpItem.Action || '',
					Queued: 0, Running: 0, Stalled: 0
				};
			}
			let tmpRow = tmpByCapability[tmpCapKey];
			if (tmpBucket === 'Upcoming') tmpRow.Queued++;
			else if (tmpBucket === 'InProgress') tmpRow.Running++;
			else if (tmpBucket === 'Stalled') tmpRow.Stalled++;
		}

		return {
			At: new Date().toISOString(),
			Buckets: tmpBuckets,
			ByCapability: Object.values(tmpByCapability)
		};
	}

	bucketFor(pItem)
	{
		let tmpStatus = pItem.Status;
		if (tmpStatus === 'Queued' || tmpStatus === 'Pending' || tmpStatus === 'Assigned')
		{
			return 'Upcoming';
		}
		if (tmpStatus === 'Completed' || tmpStatus === 'Complete') return 'Completed';
		if (tmpStatus === 'Failed' || tmpStatus === 'Error'
			|| tmpStatus === 'Timeout' || tmpStatus === 'Canceled') return 'Errored';
		// 'Stalled' is its own explicit status now (Phase 2).  Items
		// flipped to Stalled by _maybeMarkStalled bucket here without
		// needing to also be Unhealthy.
		if (tmpStatus === 'Stalled') return 'Stalled';
		if (tmpStatus === 'Dispatched' || tmpStatus === 'Running')
		{
			return (pItem.HealthLabel === 'Unhealthy') ? 'Stalled' : 'InProgress';
		}
		return 'Upcoming';
	}

	// ====================================================================
	// Broadcast hooks for Coordinator / API server to call on events we
	// don't directly observe (completion, failure, explicit enqueue).
	// ====================================================================

	notifyEnqueued(pItem)
	{
		this._broadcast('queue.enqueued', {
			WorkItemHash: pItem.WorkItemHash,
			RunID: pItem.RunID,
			Capability: pItem.Capability,
			Action: pItem.Action,
			Priority: pItem.Priority,
			EnqueuedAt: pItem.EnqueuedAt,
			AffinityKey: pItem.AffinityKey || ''
		});
	}

	notifyCompleted(pItem, pDurationMs)
	{
		this._broadcast('queue.completed', {
			WorkItemHash: pItem.WorkItemHash,
			RunID: pItem.RunID,
			BeaconID: pItem.AssignedBeaconID,
			DurationMs: pDurationMs || 0,
			CompletedAt: pItem.CompletedAt
		});
	}

	notifyFailed(pItem, pError)
	{
		this._broadcast('queue.failed', {
			WorkItemHash: pItem.WorkItemHash,
			RunID: pItem.RunID,
			BeaconID: pItem.AssignedBeaconID,
			Attempt: pItem.AttemptNumber,
			Error: pError || pItem.LastError || 'unknown'
		});
	}

	// ====================================================================
	// Cancellation
	// ====================================================================

	requestCancel(pWorkItemHash, pReason)
	{
		let tmpCoordinator = this._getCoordinator();
		if (!tmpCoordinator) return { Canceled: false, Error: 'coordinator unavailable' };
		let tmpItem = tmpCoordinator._WorkQueue[pWorkItemHash];
		if (!tmpItem) return { Canceled: false, Error: 'not found' };

		if (tmpItem.Status === 'Queued' || tmpItem.Status === 'Pending' || tmpItem.Status === 'Assigned')
		{
			this._markCanceled(tmpItem, tmpCoordinator, pReason);
			return { Canceled: true, Status: 'Canceled' };
		}
		if (tmpItem.Status === 'Dispatched' || tmpItem.Status === 'Running')
		{
			tmpItem.CancelRequested = true;
			tmpItem.CancelReason = pReason || 'cancel requested';
			let tmpCancelReqBridge = this._getBridge();
			if (tmpCancelReqBridge && !this._isMetaCapability(tmpItem.Capability))
			{
				this._persistBest(tmpCancelReqBridge.updateWorkItem(pWorkItemHash, {
					CancelRequested: true,
					CancelReason: tmpItem.CancelReason
				}), 'cancel-requested update');
				this._persistBest(tmpCancelReqBridge.appendEvent({
					WorkItemHash: pWorkItemHash,
					RunID: tmpItem.RunID,
					EventType: 'cancel_requested',
					FromStatus: tmpItem.Status,
					ToStatus: tmpItem.Status,
					Payload: { Reason: tmpItem.CancelReason }
				}), 'cancel-requested event');
			}
			this._broadcast('queue.cancel_requested', {
				WorkItemHash: pWorkItemHash,
				RunID: tmpItem.RunID,
				Reason: tmpItem.CancelReason
			});
			return { Canceled: false, CancelRequested: true, Status: tmpItem.Status };
		}
		return { Canceled: false, Status: tmpItem.Status, Error: 'terminal status' };
	}

	// ====================================================================
	// Reorder (move one slot up or down within the Upcoming bucket)
	// ====================================================================
	//
	// Sorting here is `Priority DESC, then FIFO EnqueuedAt ASC` (see
	// _compareDispatchPriority). To "move up" we need to land ahead of
	// the neighbor regardless of tie behavior, so we bump our Priority
	// to neighbor.Priority ± 1. "Down" mirrors. This drifts Priority
	// numbers slightly over many reorders but stays O(1) per click and
	// never reshuffles other items.
	//
	// Reordering is only sensible for Upcoming work — once dispatched,
	// a worker already has it. Pause/resume (separate feature) covers
	// the running-slot case.
	reorderWorkItem(pWorkItemHash, pDirection)
	{
		let tmpCoordinator = this._getCoordinator();
		if (!tmpCoordinator) return { Reordered: false, Error: 'coordinator unavailable' };
		let tmpItem = tmpCoordinator._WorkQueue[pWorkItemHash];
		if (!tmpItem) return { Reordered: false, Error: 'not found' };
		if (this.bucketFor(tmpItem) !== 'Upcoming')
		{
			return { Reordered: false, Error: 'only Upcoming items can be reordered' };
		}

		let tmpUpcoming = this.listBuckets('Upcoming', 5000);
		tmpUpcoming.sort(this._compareDispatchPriority);
		let tmpIdx = -1;
		for (let i = 0; i < tmpUpcoming.length; i++)
		{
			if (tmpUpcoming[i].WorkItemHash === pWorkItemHash) { tmpIdx = i; break; }
		}
		if (tmpIdx < 0) return { Reordered: false, Error: 'not in Upcoming' };

		let tmpNeighborIdx;
		if (pDirection === 'up')
		{
			if (tmpIdx === 0) return { Reordered: false, Error: 'already at top' };
			tmpNeighborIdx = tmpIdx - 1;
		}
		else if (pDirection === 'down')
		{
			if (tmpIdx === tmpUpcoming.length - 1) return { Reordered: false, Error: 'already at bottom' };
			tmpNeighborIdx = tmpIdx + 1;
		}
		else
		{
			return { Reordered: false, Error: 'invalid direction' };
		}

		let tmpNeighborHash = tmpUpcoming[tmpNeighborIdx].WorkItemHash;
		let tmpNeighbor = tmpCoordinator._WorkQueue[tmpNeighborHash];
		if (!tmpNeighbor) return { Reordered: false, Error: 'neighbor missing' };

		let tmpOldPriority = tmpItem.Priority || 0;
		let tmpNewPriority = (pDirection === 'up')
			? ((tmpNeighbor.Priority || 0) + 1)
			: ((tmpNeighbor.Priority || 0) - 1);
		tmpItem.Priority = tmpNewPriority;

		let tmpReorderBridge = this._getBridge();
		if (tmpReorderBridge && !this._isMetaCapability(tmpItem.Capability))
		{
			this._persistBest(tmpReorderBridge.updateWorkItem(pWorkItemHash, { Priority: tmpNewPriority }), 'reorder update');
			this._persistBest(tmpReorderBridge.appendEvent({
				WorkItemHash: pWorkItemHash,
				RunID: tmpItem.RunID,
				EventType: 'reordered',
				FromStatus: tmpItem.Status,
				ToStatus: tmpItem.Status,
				Payload: { Direction: pDirection, OldPriority: tmpOldPriority, NewPriority: tmpNewPriority }
			}), 'reordered event');
		}

		// Two broadcasts: a targeted reorder event so the UI can update
		// the one row's Priority badge immediately, plus a full summary
		// so any client that sorts by Priority re-renders the list in
		// the new order without waiting for the periodic summary tick.
		this._broadcast('queue.reordered', {
			WorkItemHash: pWorkItemHash,
			Priority: tmpNewPriority,
			Direction: pDirection
		});
		this._broadcast('queue.summary', this.summarize());

		return {
			Reordered: true,
			WorkItemHash: pWorkItemHash,
			OldPriority: tmpOldPriority,
			NewPriority: tmpNewPriority
		};
	}

	// ====================================================================
	// Dispatcher aid for external callers (API /queue endpoint etc.)
	// ====================================================================

	listBuckets(pBucket, pLimit)
	{
		let tmpCoordinator = this._getCoordinator();
		let tmpQueue = tmpCoordinator ? (tmpCoordinator._WorkQueue || {}) : {};
		let tmpLimit = Math.max(1, Math.min(parseInt(pLimit, 10) || 500, 5000));
		let tmpOut = [];
		for (let tmpHash of Object.keys(tmpQueue))
		{
			let tmpItem = tmpQueue[tmpHash];
			let tmpBucket = this.bucketFor(tmpItem);
			if (pBucket && tmpBucket !== pBucket) continue;
			tmpOut.push(Object.assign({ Bucket: tmpBucket }, tmpItem));
			if (tmpOut.length >= tmpLimit) break;
		}
		return tmpOut;
	}

	get TERMINAL_STATUSES() { return TERMINAL_STATUSES; }
	get NONTERMINAL_STATUSES() { return NONTERMINAL_STATUSES; }
}

module.exports = UltravisorBeaconScheduler;
