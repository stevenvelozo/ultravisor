/**
 * Ultravisor Observer (Phase 3)
 *
 * Single in-process service that fuses raw lifecycle signals from the
 * Coordinator, Scheduler, ExecutionManifest, and the API server's
 * WebSocket layer into a coherent system view.  Where Phase 2 had
 * each subsystem make local stall decisions, Phase 3 funnels every
 * raw signal here and lets the Observer + ObserverPolicy do the
 * classification once.
 *
 * Phase 3 is **additive** — Phase 2's stall logic in the Scheduler,
 * the work-release branch in Coordinator.deregisterBeacon, and the
 * `_Stalled` marker scan in Manifest.finalizeExecution all keep
 * running.  The Observer publishes `observer.*` events alongside
 * those legacy paths so consumers can migrate at their own pace.
 *
 * Subscribed signals (no new event bus introduced):
 *
 *   - Beacon registration / deregistration / heartbeat
 *       wired by the API server through registerBeaconEvent()
 *   - Scheduler queue.* topics
 *       wired via setUpstreamBroadcast() — the Observer becomes the
 *       Scheduler's broadcast handler and forwards to the existing
 *       _broadcastQueueTopic in the API server
 *   - Manifest execution events
 *       subscribed via addExecutionEventListener
 *   - WebSocket connect / close
 *       reported by the API server through onBeaconWSOpen/Close()
 *
 * @module Ultravisor-Observer
 */

const libPictService = require('pict-serviceproviderbase');
const libObserverPolicy = require('./observer/ObserverPolicy.cjs');
const libObserverSnapshot = require('./observer/ObserverSnapshot.cjs');

const TICK_INTERVAL_MS = 5000;

class UltravisorObserver extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.serviceType = 'UltravisorObserver';

		// --- Internal state — built from raw signals.  Source of truth
		//     for the Observer's classification decisions; the snapshot
		//     projection reads these maps via the getters below.
		this._Beacons         = {}; // BeaconID -> beacon record (with Liveness)
		this._WorkQueue       = {}; // WorkItemHash -> work item record (mirror)
		this._Operations      = {}; // RunHash -> run record (mirror)
		this._RecentTerminal  = []; // bounded ring buffer of terminated items + ops
		this._History         = []; // observer.* event journal (bounded)

		this._Policy = libObserverPolicy.getDefaults();

		this._Tick = null;
		this._Running = false;

		// Upstream broadcast (the API server's _broadcastQueueTopic) —
		// the Observer forwards every queue.* envelope it sees here.
		// Setting this is how the Scheduler's broadcasts continue to
		// reach WebSocket subscribers transparently.
		this._UpstreamBroadcast = null;

		// Optional listener for observer.* events — the API server
		// installs one of these so observer.* topics ride the same
		// WebSocket fan-out the queue.* topics already use.
		this._ObserverBroadcastHandler = null;

		// Throttle map for noisy classifications: BeaconID -> last
		// emitted Liveness label.  Skips duplicates so the WS feed
		// doesn't pile up identical beacon-liveness frames.
		this._LastBeaconLiveness = {};
		this._LastWorkItemLabel = {};
	}

	// ====================================================================
	// Service registry / public accessors used by ObserverSnapshot
	// ====================================================================

	getBeacons()         { return this._Beacons; }
	getWorkQueue()       { return this._WorkQueue; }
	getOperations()      { return this._Operations; }
	getRecentTerminal()  { return this._RecentTerminal; }
	getHistory()         { return this._History; }
	getPolicy()          { return Object.assign({}, this._Policy); }
	getPolicyModule()    { return libObserverPolicy; }
	getHubInstanceID()
	{
		return (this.fable && this.fable.settings && this.fable.settings.UltravisorHubInstanceID) || '';
	}

	getWorkItemsForRun(pRunHash)
	{
		if (!pRunHash) return [];
		let tmpOut = [];
		let tmpKeys = Object.keys(this._WorkQueue);
		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpItem = this._WorkQueue[tmpKeys[i]];
			if (tmpItem && tmpItem.RunHash === pRunHash) tmpOut.push(tmpItem);
		}
		return tmpOut;
	}

	// ====================================================================
	// Wiring — called by CLI / API server during startup
	// ====================================================================

	setUpstreamBroadcast(fHandler)
	{
		this._UpstreamBroadcast = (typeof fHandler === 'function') ? fHandler : null;
	}

	setObserverBroadcastHandler(fHandler)
	{
		this._ObserverBroadcastHandler = (typeof fHandler === 'function') ? fHandler : null;
	}

	/**
	 * The Scheduler calls this for every queue.* topic.  We update our
	 * mirror of the work-item map and forward upstream so the API
	 * server's WebSocket fan-out keeps working.
	 */
	handleQueueBroadcast(pTopic, pPayload)
	{
		try
		{
			this._ingestQueueTopic(pTopic, pPayload);
		}
		catch (pErr)
		{
			this.log.warn(`Observer: ingest of ${pTopic} threw: ${pErr.message}`);
		}

		if (typeof this._UpstreamBroadcast === 'function')
		{
			try { this._UpstreamBroadcast(pTopic, pPayload); }
			catch (pErr) { /* upstream owns its own error logging */ }
		}
	}

	/**
	 * API server calls this whenever a beacon's WebSocket opens.
	 */
	onBeaconWSOpen(pBeaconID, pBeaconRecord)
	{
		if (!pBeaconID) return;
		let tmpRec = this._beaconUpsert(pBeaconID, pBeaconRecord);
		tmpRec.WSConnected = true;
		this._classifyAndAnnounceBeacon(tmpRec);
	}

	/**
	 * API server calls this whenever a beacon's WebSocket closes.
	 * The Phase-3 win: this lets the Observer classify the beacon as
	 * Dead within the next tick, instead of waiting for the heartbeat
	 * timeout 120s later.
	 */
	onBeaconWSClose(pBeaconID)
	{
		if (!pBeaconID) return;
		let tmpRec = this._Beacons[pBeaconID];
		if (!tmpRec) return;
		tmpRec.WSConnected = false;
		tmpRec.LastWSCloseAt = new Date().toISOString();
		this._classifyAndAnnounceBeacon(tmpRec);

		// Re-classify any in-flight work items pinned to this beacon —
		// they're now stalled by definition.  Phase 2's polling-based
		// stall path will catch the same items 120s later as a backstop.
		let tmpKeys = Object.keys(this._WorkQueue);
		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpItem = this._WorkQueue[tmpKeys[i]];
			if (!tmpItem) continue;
			if (tmpItem.AssignedBeaconID === pBeaconID
				&& (tmpItem.Status === 'Dispatched' || tmpItem.Status === 'Running'))
			{
				this._classifyAndAnnounceWorkItem(tmpItem);
			}
		}
	}

	/**
	 * API server / Coordinator calls this on every register / reconnect.
	 */
	onBeaconRegistered(pBeaconRecord)
	{
		if (!pBeaconRecord || !pBeaconRecord.BeaconID) return;
		let tmpRec = this._beaconUpsert(pBeaconRecord.BeaconID, pBeaconRecord);
		tmpRec.RegisteredAt = pBeaconRecord.RegisteredAt || tmpRec.RegisteredAt || new Date().toISOString();
		tmpRec.WSConnected = true;
		this._classifyAndAnnounceBeacon(tmpRec);

		// Newly registered beacon may unblock stranded items — re-scan.
		let tmpKeys = Object.keys(this._WorkQueue);
		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpItem = this._WorkQueue[tmpKeys[i]];
			if (!tmpItem) continue;
			if (tmpItem.Status === 'Pending' || tmpItem.Status === 'Queued' || tmpItem.Status === 'Assigned')
			{
				this._maybeAnnounceUpcoming(tmpItem);
			}
		}
	}

	onBeaconHeartbeat(pBeaconID)
	{
		if (!pBeaconID) return;
		let tmpRec = this._Beacons[pBeaconID];
		if (!tmpRec) return;
		tmpRec.LastHeartbeatAt = new Date().toISOString();
		this._classifyAndAnnounceBeacon(tmpRec);
	}

	onBeaconDeregistered(pBeaconID)
	{
		if (!pBeaconID) return;
		let tmpRec = this._Beacons[pBeaconID];
		if (!tmpRec) return;
		tmpRec.WSConnected = false;
		tmpRec.DeregisteredAt = new Date().toISOString();
		this._classifyAndAnnounceBeacon(tmpRec);
	}

	/**
	 * Manifest event listener entry point.  Called via
	 * addExecutionEventListener(this.handleExecutionEvent.bind(this)).
	 */
	handleExecutionEvent(pEventType, pRunHash, pEventData)
	{
		if (!pRunHash) return;
		let tmpManifest = this._getService('UltravisorExecutionManifest');
		let tmpRun = tmpManifest ? tmpManifest.getRun(pRunHash) : null;
		if (tmpRun)
		{
			this._Operations[pRunHash] = this._cloneRunSummary(tmpRun);
		}
		if (pEventType === 'ExecutionComplete' && tmpRun)
		{
			let tmpStatus = (pEventData && pEventData.Status) || tmpRun.Status;
			if (tmpStatus === 'Stalled' || tmpStatus === 'Failed' || tmpStatus === 'Error')
			{
				this._appendTerminalOperation(tmpRun, tmpStatus);
			}
		}
	}

	// ====================================================================
	// Lifecycle
	// ====================================================================

	start()
	{
		if (this._Running) return;
		this._Running = true;

		// Hydrate from the Coordinator's existing maps so a UV restart
		// (or a Phase 3 deploy onto a running queue) has accurate state
		// before the first tick.
		this._hydrateFromCoordinator();

		this._Tick = setInterval(() => this._tick(), TICK_INTERVAL_MS);
		this.log.info(`Observer: started (tick=${TICK_INTERVAL_MS}ms).`);
	}

	stop()
	{
		if (!this._Running) return;
		this._Running = false;
		if (this._Tick) { clearInterval(this._Tick); this._Tick = null; }
		this.log.info('Observer: stopped.');
	}

	_tick()
	{
		try
		{
			this._hydrateFromCoordinator();

			// Periodic re-classification — picks up cases the event
			// stream missed (heartbeat-driven stale, freshly registered
			// beacon unblocking a stranded item, etc).
			let tmpBeaconKeys = Object.keys(this._Beacons);
			for (let i = 0; i < tmpBeaconKeys.length; i++)
			{
				this._classifyAndAnnounceBeacon(this._Beacons[tmpBeaconKeys[i]]);
			}

			let tmpWorkKeys = Object.keys(this._WorkQueue);
			for (let i = 0; i < tmpWorkKeys.length; i++)
			{
				let tmpItem = this._WorkQueue[tmpWorkKeys[i]];
				if (!tmpItem) continue;
				if (tmpItem.Status === 'Pending' || tmpItem.Status === 'Queued' || tmpItem.Status === 'Assigned')
				{
					this._maybeAnnounceUpcoming(tmpItem);
				}
				else
				{
					this._classifyAndAnnounceWorkItem(tmpItem);
				}
			}

			// Periodic snapshot tick lets push-style consumers refresh.
			this._announceObserver('observer.snapshot.tick', { GeneratedAt: new Date().toISOString() }, false);
		}
		catch (pErr)
		{
			this.log.warn(`Observer: tick threw: ${pErr.message}`);
		}
	}

	_hydrateFromCoordinator()
	{
		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
		if (!tmpCoordinator) return;

		// Beacons.  Don't blow away Observer-only fields (Liveness,
		// LastWSCloseAt, RecentDurations) — merge instead.
		let tmpBeacons = tmpCoordinator._Beacons || {};
		let tmpBeaconIDs = Object.keys(tmpBeacons);
		for (let i = 0; i < tmpBeaconIDs.length; i++)
		{
			let tmpExisting = this._Beacons[tmpBeaconIDs[i]];
			let tmpFresh = tmpBeacons[tmpBeaconIDs[i]];
			let tmpMerged = this._beaconUpsert(tmpFresh.BeaconID, tmpFresh);
			tmpMerged.LastHeartbeatAt = tmpFresh.LastHeartbeat || tmpMerged.LastHeartbeatAt;
			if (tmpExisting && tmpExisting.WSConnected != null && !tmpFresh.WSConnected)
			{
				tmpMerged.WSConnected = tmpExisting.WSConnected;
			}
		}
		// Garbage collect Observer beacon records that the Coordinator dropped.
		let tmpObsKeys = Object.keys(this._Beacons);
		for (let i = 0; i < tmpObsKeys.length; i++)
		{
			if (!tmpBeacons[tmpObsKeys[i]])
			{
				let tmpStale = this._Beacons[tmpObsKeys[i]];
				if (tmpStale)
				{
					tmpStale.WSConnected = false;
					tmpStale.DeregisteredAt = tmpStale.DeregisteredAt || new Date().toISOString();
				}
			}
		}

		// Work queue mirror.
		let tmpQueue = tmpCoordinator._WorkQueue || {};
		this._WorkQueue = tmpQueue;

		// Operations mirror — shallow clone so we control the shape.
		let tmpManifest = this._getService('UltravisorExecutionManifest');
		if (tmpManifest && typeof tmpManifest.listRuns === 'function')
		{
			let tmpRuns = tmpManifest.listRuns();
			let tmpNewOps = {};
			for (let i = 0; i < tmpRuns.length; i++)
			{
				let tmpRun = tmpRuns[i];
				if (!tmpRun || !tmpRun.Hash) continue;
				if (tmpRun.Status === 'Complete' || tmpRun.Status === 'Completed'
					|| tmpRun.Status === 'Failed' || tmpRun.Status === 'Error'
					|| tmpRun.Status === 'Stalled' || tmpRun.Status === 'Abandoned'
					|| tmpRun.Status === 'Canceled') continue;
				tmpNewOps[tmpRun.Hash] = this._cloneRunSummary(tmpRun);
			}
			this._Operations = tmpNewOps;
		}
	}

	// ====================================================================
	// Internal — beacon / workitem upsert + classification
	// ====================================================================

	_beaconUpsert(pBeaconID, pBeaconRecord)
	{
		if (!this._Beacons[pBeaconID])
		{
			this._Beacons[pBeaconID] = {
				BeaconID:               pBeaconID,
				Name:                   (pBeaconRecord && pBeaconRecord.Name) || pBeaconID,
				Capabilities:           (pBeaconRecord && pBeaconRecord.Capabilities) || [],
				MaxConcurrent:          (pBeaconRecord && pBeaconRecord.MaxConcurrent) || 1,
				Liveness:               'Alive',
				LivenessReason:         'just_registered',
				LivenessTransitionAt:   new Date().toISOString(),
				LastHeartbeatAt:        (pBeaconRecord && pBeaconRecord.LastHeartbeat) || null,
				RegisteredAt:           (pBeaconRecord && pBeaconRecord.RegisteredAt) || new Date().toISOString(),
				WSConnected:            true,
				LastWSCloseAt:          null,
				CurrentWorkItems:       (pBeaconRecord && pBeaconRecord.CurrentWorkItems) || [],
				RecentDurations:        {}
			};
		}
		else
		{
			let tmpRec = this._Beacons[pBeaconID];
			if (pBeaconRecord)
			{
				if (pBeaconRecord.Name) tmpRec.Name = pBeaconRecord.Name;
				if (pBeaconRecord.Capabilities) tmpRec.Capabilities = pBeaconRecord.Capabilities;
				if (pBeaconRecord.MaxConcurrent) tmpRec.MaxConcurrent = pBeaconRecord.MaxConcurrent;
				if (pBeaconRecord.LastHeartbeat) tmpRec.LastHeartbeatAt = pBeaconRecord.LastHeartbeat;
				if (pBeaconRecord.CurrentWorkItems) tmpRec.CurrentWorkItems = pBeaconRecord.CurrentWorkItems;
			}
		}
		return this._Beacons[pBeaconID];
	}

	_classifyAndAnnounceBeacon(pBeaconRec)
	{
		if (!pBeaconRec) return;
		let tmpResult = libObserverPolicy.classifyBeacon(pBeaconRec, this._Policy);
		let tmpPrev = pBeaconRec.Liveness;
		pBeaconRec.Liveness = tmpResult.Liveness;
		pBeaconRec.LivenessReason = tmpResult.LivenessReason;

		if (tmpPrev !== tmpResult.Liveness)
		{
			pBeaconRec.LivenessTransitionAt = new Date().toISOString();
			this._announceObserver('observer.beacon.liveness_changed', {
				BeaconID:    pBeaconRec.BeaconID,
				Name:        pBeaconRec.Name,
				From:        tmpPrev || null,
				To:          tmpResult.Liveness,
				Reason:      tmpResult.LivenessReason,
				At:          pBeaconRec.LivenessTransitionAt
			}, true);
		}
		this._LastBeaconLiveness[pBeaconRec.BeaconID] = tmpResult.Liveness;
	}

	_classifyAndAnnounceWorkItem(pItem)
	{
		if (!pItem || !pItem.WorkItemHash) return;
		let tmpBeacon = pItem.AssignedBeaconID ? this._Beacons[pItem.AssignedBeaconID] : null;
		let tmpResult = libObserverPolicy.classifyWorkItem(pItem, tmpBeacon, this._Policy);
		let tmpPrev = this._LastWorkItemLabel[pItem.WorkItemHash];
		if (tmpPrev !== tmpResult.Label)
		{
			this._LastWorkItemLabel[pItem.WorkItemHash] = tmpResult.Label;
			if (tmpResult.Label === 'Stalled')
			{
				this._announceObserver('observer.workitem.stalled', {
					WorkItemHash: pItem.WorkItemHash,
					RunHash:      pItem.RunHash || null,
					NodeHash:     pItem.NodeHash || null,
					Capability:   pItem.Capability || null,
					Action:       pItem.Action || null,
					BeaconID:     pItem.AssignedBeaconID || null,
					Reason:       tmpResult.Reason,
					At:           new Date().toISOString()
				}, true);
				if (pItem.RunHash)
				{
					this._announceObserver('observer.run.stalled', {
						RunHash:  pItem.RunHash,
						NodeHash: pItem.NodeHash || null,
						Reason:   tmpResult.Reason,
						At:       new Date().toISOString()
					}, true);
				}
			}
		}
	}

	_maybeAnnounceUpcoming(pItem)
	{
		if (!pItem || !pItem.WorkItemHash) return;
		let tmpBeacons = Object.values(this._Beacons);
		let tmpResult = libObserverPolicy.classifyUpcoming(pItem, tmpBeacons);
		let tmpKey = `upcoming:${pItem.WorkItemHash}`;
		let tmpPrev = this._LastWorkItemLabel[tmpKey];
		let tmpLabel = tmpResult.BlockingReason || 'eligible';
		if (tmpPrev !== tmpLabel)
		{
			this._LastWorkItemLabel[tmpKey] = tmpLabel;
			if (tmpResult.BlockingReason)
			{
				this._announceObserver('observer.workitem.stranded', {
					WorkItemHash:        pItem.WorkItemHash,
					RunHash:             pItem.RunHash || null,
					Capability:          pItem.Capability || null,
					Action:              pItem.Action || null,
					Reason:              tmpResult.BlockingReason,
					EligibleBeaconCount: (tmpResult.EligibleBeacons || []).length,
					At:                  new Date().toISOString()
				}, true);
			}
		}
	}

	_appendTerminalOperation(pRun, pStatus)
	{
		if (!pRun) return;
		let tmpEntry = {
			Kind:           'Operation',
			RunHash:        pRun.Hash || pRun.RunHash || null,
			OperationName:  pRun.OperationName || null,
			OperationHash:  pRun.OperationHash || null,
			Status:         pStatus || pRun.Status || null,
			TerminatedAt:   pRun.StopTime || new Date().toISOString(),
			TerminalReason: pStatus || 'unknown',
			RetryEligible:  false
		};
		this._appendRecentTerminal(tmpEntry, this._Policy.RecentTerminalOperationsMax);
	}

	_appendTerminalWorkItem(pItem, pReason)
	{
		if (!pItem) return;
		let tmpBeacon = pItem.AssignedBeaconID ? this._Beacons[pItem.AssignedBeaconID] : null;
		let tmpEntry = {
			Kind:                  'WorkItem',
			WorkItemHash:          pItem.WorkItemHash,
			RunHash:               pItem.RunHash || null,
			NodeHash:              pItem.NodeHash || null,
			Capability:            pItem.Capability || null,
			Action:                pItem.Action || null,
			BeaconID:              pItem.AssignedBeaconID || null,
			BeaconLastLiveness:    tmpBeacon ? tmpBeacon.Liveness : null,
			Status:                pItem.Status || null,
			TerminatedAt:          pItem.CompletedAt || pItem.StalledAt || new Date().toISOString(),
			TerminalReason:        pReason || pItem.LastError || pItem.Status || 'unknown',
			RetryEligible:         libObserverPolicy.isRetryEligible(pItem, null)
		};
		this._appendRecentTerminal(tmpEntry, this._Policy.RecentTerminalWorkItemsMax);
	}

	_appendRecentTerminal(pEntry, pCapHint)
	{
		this._RecentTerminal.push(pEntry);
		let tmpCap = (this._Policy.RecentTerminalWorkItemsMax || 100)
			+ (this._Policy.RecentTerminalOperationsMax || 100);
		if (this._RecentTerminal.length > tmpCap)
		{
			this._RecentTerminal.splice(0, this._RecentTerminal.length - tmpCap);
		}
	}

	_cloneRunSummary(pRun)
	{
		if (!pRun) return null;
		return {
			Hash:           pRun.Hash || pRun.RunHash || null,
			OperationHash:  pRun.OperationHash || null,
			OperationName:  pRun.OperationName || null,
			Status:         pRun.Status || null,
			RunMode:        pRun.RunMode || null,
			StartTime:      pRun.StartTime || null,
			StopTime:       pRun.StopTime || null,
			ElapsedMs:      pRun.ElapsedMs || 0,
			ErrorCount:     pRun.ErrorCount || 0,
			Live:           !!pRun.Live
		};
	}

	// ====================================================================
	// Internal — queue.* topic ingestion
	// ====================================================================

	_ingestQueueTopic(pTopic, pPayload)
	{
		if (!pTopic) return;
		// Payload often references a WorkItemHash; pull the live record
		// from the Coordinator (we mirror that map by reference) and
		// run classification on it.
		let tmpHash = pPayload && pPayload.WorkItemHash;
		let tmpItem = tmpHash ? this._WorkQueue[tmpHash] : null;
		switch (pTopic)
		{
			case 'queue.enqueued':
				if (tmpItem) this._maybeAnnounceUpcoming(tmpItem);
				break;
			case 'queue.dispatched':
				if (tmpItem) this._classifyAndAnnounceWorkItem(tmpItem);
				break;
			case 'queue.health':
				if (tmpItem) this._classifyAndAnnounceWorkItem(tmpItem);
				break;
			case 'queue.completed':
				if (tmpItem)
				{
					this._sampleDuration(tmpItem, pPayload.DurationMs);
					this._appendTerminalWorkItem(tmpItem, 'completed');
					this._classifyAndAnnounceWorkItem(tmpItem);
				}
				break;
			case 'queue.failed':
				if (tmpItem)
				{
					this._appendTerminalWorkItem(tmpItem, pPayload.Error || 'failed');
					this._classifyAndAnnounceWorkItem(tmpItem);
				}
				break;
			case 'queue.canceled':
				if (tmpItem) this._appendTerminalWorkItem(tmpItem, pPayload.Reason || 'canceled');
				break;
			case 'queue.stalled':
				if (tmpItem)
				{
					this._appendTerminalWorkItem(tmpItem, 'stalled');
					this._classifyAndAnnounceWorkItem(tmpItem);
				}
				break;
			default:
				break;
		}
	}

	_sampleDuration(pItem, pDurationMs)
	{
		if (!pItem || !pItem.AssignedBeaconID) return;
		let tmpBeacon = this._Beacons[pItem.AssignedBeaconID];
		if (!tmpBeacon) return;
		if (!tmpBeacon.RecentDurations) tmpBeacon.RecentDurations = {};
		let tmpKey = `${pItem.Capability || 'Shell'}/${pItem.Action || ''}`;
		if (!tmpBeacon.RecentDurations[tmpKey]) tmpBeacon.RecentDurations[tmpKey] = [];
		let tmpArr = tmpBeacon.RecentDurations[tmpKey];
		if (typeof pDurationMs === 'number' && pDurationMs >= 0) tmpArr.push(pDurationMs);
		let tmpMax = this._Policy.RecentDurationsPerActionMax || 25;
		if (tmpArr.length > tmpMax)
		{
			tmpArr.splice(0, tmpArr.length - tmpMax);
		}
	}

	// ====================================================================
	// Snapshot + History endpoints
	// ====================================================================

	buildSnapshot()
	{
		// Lazy hydrate so callers that hit /Observer/Snapshot before
		// the first tick still get current state.
		this._hydrateFromCoordinator();
		return libObserverSnapshot.buildSnapshot(this);
	}

	getHistorySince(pSinceISO)
	{
		if (!pSinceISO) return this._History.slice();
		let tmpOut = [];
		for (let i = 0; i < this._History.length; i++)
		{
			let tmpEntry = this._History[i];
			if (tmpEntry && tmpEntry.At && tmpEntry.At > pSinceISO)
			{
				tmpOut.push(tmpEntry);
			}
		}
		return tmpOut;
	}

	// ====================================================================
	// Private — observer.* announcement
	// ====================================================================

	_announceObserver(pTopic, pPayload, pAppendHistory)
	{
		let tmpEnvelope = Object.assign({ Topic: pTopic, At: new Date().toISOString() }, pPayload || {});
		if (pAppendHistory !== false)
		{
			this._History.push(tmpEnvelope);
			let tmpCap = this._Policy.HistoryEventsMax || 1000;
			if (this._History.length > tmpCap)
			{
				this._History.splice(0, this._History.length - tmpCap);
			}
		}
		if (typeof this._ObserverBroadcastHandler === 'function')
		{
			try { this._ObserverBroadcastHandler(pTopic, pPayload || {}); }
			catch (pErr) { /* best effort */ }
		}
	}

	_getService(pTypeName)
	{
		if (!this.fable || !this.fable.servicesMap) return null;
		let tmpMap = this.fable.servicesMap[pTypeName];
		if (!tmpMap) return null;
		return Object.values(tmpMap)[0] || null;
	}
}

module.exports = UltravisorObserver;
