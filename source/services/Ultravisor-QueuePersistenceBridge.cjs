/**
 * Ultravisor-QueuePersistenceBridge
 *
 * Single front door for "where does the work-queue history live?".
 * Two backends, picked at call time:
 *
 *   1. The optional ultravisor-queue-beacon (capability =
 *      QueuePersistence). When connected, every write dispatches to
 *      the beacon and reads come back from it.
 *
 *   2. The in-process UltravisorBeaconQueueStore. Used as the fallback
 *      whenever the beacon isn't connected — the existing behavior the
 *      coordinator + scheduler had before this bridge existed.
 *
 * Why a bridge instead of always going through the beacon?
 * ========================================================
 * Two reasons:
 *
 *   (a) Chicken-and-egg. Ultravisor's scheduler runs work items
 *       (including the queue beacon's own registration / heartbeat
 *       traffic). If queue persistence MUST be a beacon, the hub
 *       can't even start until the beacon is up. The bridge lets
 *       the hub run with in-process persistence by default and
 *       upgrade to beacon-backed persistence whenever the beacon
 *       arrives.
 *
 *   (b) Operator opt-in. The queue beacon is OPTIONAL — most lab
 *       deployments don't want a separate persistence process.
 *       Defaulting to in-process means a vanilla `ultravisor start`
 *       still works.
 *
 * All write methods return Promises and are fire-and-await — they
 * resolve to {Success} so the caller can log a warning on failure
 * but never block the dispatch path on persistence. The local
 * fallback is synchronous (calls into UltravisorBeaconQueueStore
 * directly); we wrap it in Promise.resolve to keep a uniform
 * interface.
 *
 * Loop prevention: the coordinator gates every persistence call on
 * `_isMetaCapability(work.Capability)`. QueuePersistence dispatches
 * are themselves work items routed through the queue, but they
 * skip the bridge so we don't end up writing the QP_RecordEvent
 * event for the QP_RecordEvent event for the QP_RecordEvent event...
 */

const libPictService = require('pict-serviceproviderbase');
const libFs = require('fs');
const libPath = require('path');

// Conservative timeout — persistence calls should be quick. Long
// timeouts here block the coordinator's dispatch path and back up
// the queue. 5s is enough for SQLite/Postgres on a healthy network.
const DEFAULT_TIMEOUT_MS = 5000;

// Cap a single flush sweep so a beacon coming online doesn't get
// hammered by a years-long backlog all at once. Successive
// reconnects (or the next operator-triggered re-flush hook) can
// drain the rest. 5000 items at ~5ms each is ~25s of beacon time.
const FLUSH_BATCH_LIMIT = 5000;

// Filename for persisted high-water-marks. Stored under the
// ultravisor data path so it survives process restarts. Schema:
// { Queue: { <beaconID>: <ISO timestamp> }, Manifest: { ... } }.
// Both bridges share the same file so operators have one place
// to inspect / reset; each bridge owns its own top-level key.
const HWM_FILENAME = 'persistence-bridge-hwm.json';

// Filename for the persisted persistence-beacon assignment. Set by
// the lab via setPersistenceAssignment; survives UV restarts so a
// rebooted UV resumes routing through the same databeacon without
// the lab having to re-push. Schema:
// { Queue: { BeaconID, IDBeaconConnection, AssignedAt } | null,
//   Manifest: { ... } | null }.
// Bridges share one file; each owns its top-level key.
const ASSIGNMENT_FILENAME = 'persistence-assignment.json';

// Beacon Tag the lab stamps on a databeacon when assigning it as a
// UV's persistence backend. Carries the IDBeaconConnection (in the
// databeacon's internal SQLite) of the live external connection that
// hosts the UV* tables. Bridges scan registered beacons for this tag
// to discover the MeadowProxy persistence path; absence falls back
// to legacy QueuePersistence dispatch (or local store).
const PERSISTENCE_TAG = 'PersistenceConnectionID';

// Schema descriptor for the UV tables. Loaded once at bridge
// construction so onBeaconConnected can fire EnsureSchema without
// re-reading from disk on every reconnect. Path is relative to the
// ultravisor module root.
const SCHEMA_DESCRIPTOR_PATH = libPath.join(__dirname, '..', 'persistence', 'UltravisorPersistenceSchema.json');

const QUEUE_TABLES = ['UVQueueWorkItem', 'UVQueueWorkItemEvent', 'UVQueueWorkItemAttempt'];

// Path patterns the lab pushes to the databeacon's MeadowProxy when
// assigning UV persistence — extends the default lowercase-only
// allowlist so the PascalCase /1.0/.../UV*/ paths can pass through.
// The leading `^/?1\.0/` match keeps it scoped to the meadow REST
// surface; the wildcard middle segment accepts the databeacon's
// connection-namespaced route hash.
const UV_PROXY_PATH_PATTERNS = ['^/?1\\.0/[^/]+/UV[A-Za-z0-9]*'];

class UltravisorQueuePersistenceBridge extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
		this.serviceType = 'UltravisorQueuePersistenceBridge';
		this._TimeoutMs = (pOptions && pOptions.TimeoutMs) || DEFAULT_TIMEOUT_MS;
		// Bootstrap-flush state: HWM per-beacon, plus a guard so a
		// second connect notification doesn't race a flush already
		// in flight. HWM survives ultravisor restarts; the guard
		// is process-local.
		this._FlushHWMs = this._loadHWMs();
		this._FlushInFlight = new Set();
		// MeadowProxy bootstrap state. Once a databeacon's schema +
		// allowlist has been confirmed, the bridge stops re-running
		// the bootstrap on subsequent reconnects of the same beacon
		// — both EnsureSchema and UpdateProxyConfig are idempotent
		// but the round-trip is wasted work. Per-beacon endpoint base
		// strings (returned by EnableEndpoint, e.g. /1.0/<hash>/UVQueueWorkItem)
		// are cached so dispatch doesn't have to re-discover the
		// connection's route hash on each call.
		this._BootstrappedBeacons = new Set();
		this._BootstrapInFlight = new Set();
		this._EndpointBaseByBeacon = {};
		// Loaded once. If the file is missing or unreadable the
		// bridge keeps working in legacy / local-fallback mode and
		// just declines to bootstrap any MeadowProxy beacon.
		this._SchemaDescriptor = this._loadSchemaDescriptor();
		// Explicit lab assignment (Session 3). Tag-scan stays as the
		// CLI-only fallback for sidecar deployments where the operator
		// configures the databeacon via env vars + tags.
		this._PersistenceAssignment = this._loadAssignment();
		this._LastBootstrapError = null;
		this._BootstrappedAt = null;
	}

	_loadSchemaDescriptor()
	{
		try
		{
			let tmpRaw = libFs.readFileSync(SCHEMA_DESCRIPTOR_PATH, 'utf8');
			return JSON.parse(tmpRaw);
		}
		catch (pErr)
		{
			if (this.log)
			{
				this.log.warn(`QueuePersistenceBridge: schema descriptor not loadable at ${SCHEMA_DESCRIPTOR_PATH} (${pErr.message}). MeadowProxy persistence path disabled.`);
			}
			return null;
		}
	}

	/**
	 * @returns {string|null}  BeaconID of the connected QueuePersistence
	 *   beacon, or null if none is registered.
	 */
	getBeaconID()
	{
		let tmpCoord = this._coord();
		if (!tmpCoord) return null;
		let tmpBeacons = tmpCoord.listBeacons() || [];
		for (let i = 0; i < tmpBeacons.length; i++)
		{
			let tmpCaps = tmpBeacons[i].Capabilities || [];
			if (tmpCaps.indexOf('QueuePersistence') >= 0)
			{
				return tmpBeacons[i].BeaconID;
			}
		}
		return null;
	}

	/**
	 * @returns {boolean}  true iff a QueuePersistence beacon is connected.
	 */
	isBeaconAvailable()
	{
		return this.getBeaconID() !== null;
	}

	/**
	 * Locate a MeadowProxy persistence beacon. Two sources, explicit
	 * lab assignment wins:
	 *
	 *   1. `_PersistenceAssignment` — set by setPersistenceAssignment
	 *      from the lab API. Returned as-is regardless of online state;
	 *      the dispatch path gates on `isMeadowProxyMode()` (which
	 *      requires a successful bootstrap), so a "set but offline"
	 *      assignment doesn't accidentally route writes to nowhere.
	 *   2. Tag scan — for CLI-only deployments where an operator
	 *      stamps a sidecar databeacon with `Tags.PersistenceConnectionID`
	 *      via env vars. Online status filtered here because there's
	 *      no other gate for tag-scan callers.
	 *
	 * @returns {object|null} { BeaconID, IDBeaconConnection } or null.
	 */
	getPersistenceBeacon()
	{
		if (!this._SchemaDescriptor) return null;
		if (this._PersistenceAssignment && this._PersistenceAssignment.BeaconID)
		{
			return {
				BeaconID: this._PersistenceAssignment.BeaconID,
				IDBeaconConnection: this._PersistenceAssignment.IDBeaconConnection
			};
		}
		let tmpCoord = this._coord();
		if (!tmpCoord) return null;
		let tmpBeacons = tmpCoord.listBeacons() || [];
		for (let i = 0; i < tmpBeacons.length; i++)
		{
			let tmpBeacon = tmpBeacons[i];
			if (tmpBeacon.Status !== 'Online' && tmpBeacon.Status !== 'Busy') continue;
			let tmpCaps = tmpBeacon.Capabilities || [];
			if (tmpCaps.indexOf('MeadowProxy') < 0) continue;
			let tmpConnID = tmpBeacon.Tags && tmpBeacon.Tags[PERSISTENCE_TAG];
			if (tmpConnID === undefined || tmpConnID === null || tmpConnID === '') continue;
			return { BeaconID: tmpBeacon.BeaconID, IDBeaconConnection: tmpConnID };
		}
		return null;
	}

	/**
	 * @returns {boolean} true iff a MeadowProxy beacon is registered AND
	 *   its bootstrap (EnsureSchema + UpdateProxyConfig + EnableEndpoint)
	 *   has completed successfully.
	 */
	isMeadowProxyMode()
	{
		let tmpAssigned = this.getPersistenceBeacon();
		if (!tmpAssigned) return false;
		return this._BootstrappedBeacons.has(tmpAssigned.BeaconID);
	}

	// ============== Write API ==============

	upsertWorkItem(pItem)
	{
		return this._writeOrLocal('QP_UpsertWorkItem', { WorkItem: pItem },
			(pStore) => pStore.upsertWorkItem(pItem));
	}

	updateWorkItem(pHash, pPatch)
	{
		return this._writeOrLocal('QP_UpdateWorkItem',
			{ WorkItemHash: pHash, Patch: pPatch },
			(pStore) => pStore.updateWorkItem(pHash, pPatch));
	}

	appendEvent(pEvent)
	{
		return this._writeOrLocal('QP_AppendEvent', { Event: pEvent },
			(pStore) => pStore.appendEvent(pEvent));
	}

	insertAttempt(pAttempt)
	{
		return this._writeOrLocal('QP_InsertAttempt', { Attempt: pAttempt },
			(pStore) => pStore.insertAttempt(pAttempt));
	}

	updateAttemptOutcome(pHash, pAttemptNumber, pPatch)
	{
		return this._writeOrLocal('QP_UpdateAttemptOutcome',
			{ WorkItemHash: pHash, AttemptNumber: pAttemptNumber, Patch: pPatch },
			(pStore) => pStore.updateAttemptOutcome(pHash, pAttemptNumber, pPatch));
	}

	// ============== Read API ==============

	getWorkItemByHash(pHash)
	{
		return this._readOrLocal('QP_GetWorkItemByHash', { WorkItemHash: pHash },
			(pStore) =>
			{
				let tmpItem = pStore.getWorkItemByHash(pHash);
				return { Success: !!tmpItem, WorkItem: tmpItem };
			});
	}

	listWorkItems(pFilter)
	{
		return this._readOrLocal('QP_ListWorkItems', { Filter: pFilter || {} },
			(pStore) =>
			{
				let tmpList = pStore.listWorkItems(pFilter || {});
				return { Success: true, WorkItems: tmpList || [] };
			});
	}

	getEvents(pHash, pLimit)
	{
		return this._readOrLocal('QP_GetEvents', { WorkItemHash: pHash, Limit: pLimit || 0 },
			(pStore) =>
			{
				let tmpList = pStore.listEventsForWorkItem(pHash, pLimit || 500);
				return { Success: true, Events: tmpList || [] };
			});
	}

	// ============== Bootstrap-flush ==============

	/**
	 * Called by the coordinator when ANY beacon registers (or
	 * re-registers after a reconnect). We filter by capability — the
	 * notification is fan-out, but only QueuePersistence beacons
	 * trigger our flush sweep.
	 *
	 * The sweep walks the local QueueStore for items newer than the
	 * per-beacon HWM and pushes them via QP_UpsertWorkItem. After
	 * each successful push the HWM advances; on any failure the
	 * sweep aborts and the HWM stays put so the next reconnect
	 * picks up from the same spot.
	 */
	onBeaconConnected(pBeaconID)
	{
		if (!pBeaconID) return;
		// First — try the MeadowProxy bootstrap. The two paths are
		// mutually exclusive at the per-beacon level (a single beacon
		// either advertises QueuePersistence or MeadowProxy with the
		// persistence tag, never both), so this can run unconditionally
		// and the helper returns early when the assignment doesn't
		// match.
		this._handleMeadowProxyBootstrap(pBeaconID);
		// Confirm this beacon actually carries QueuePersistence —
		// otherwise we'd flush on every random beacon register.
		let tmpQPID = this.getBeaconID();
		if (tmpQPID !== pBeaconID) return;
		// Already flushing? Don't stack.
		if (this._FlushInFlight.has(pBeaconID)) return;
		let tmpStore = this._localStore();
		if (!tmpStore)
		{
			// No local store means nothing to flush. Common in
			// stateless deployments where the beacon is the sole
			// persistence layer; HWM tracking is a no-op there.
			return;
		}
		this._FlushInFlight.add(pBeaconID);
		this._flushQueueToBeacon(pBeaconID, tmpStore)
			.then((pCount) =>
			{
				this._FlushInFlight.delete(pBeaconID);
				if (pCount > 0)
				{
					this.log.info(`QueuePersistenceBridge: bootstrap-flush pushed ${pCount} item(s) to beacon [${pBeaconID}].`);
				}
			})
			.catch((pErr) =>
			{
				this._FlushInFlight.delete(pBeaconID);
				this.log.warn(`QueuePersistenceBridge: bootstrap-flush failed: ${pErr && pErr.message}`);
			});
	}

	/**
	 * Walk the local store for items newer than the HWM and push
	 * them through the beacon. Returns a Promise resolving to the
	 * count of items successfully pushed.
	 *
	 * Sequential rather than parallel: keeps the beacon's write
	 * load predictable, makes "abort on first failure" semantics
	 * easy, and avoids HWM races between concurrent pushes.
	 */
	async _flushQueueToBeacon(pBeaconID, pStore)
	{
		let tmpHWM = this._FlushHWMs[pBeaconID] || '';
		// Pull a batch in EnqueuedAt ASC order so HWM advances
		// monotonically. Filter is best-effort — the local store
		// doesn't expose a "since timestamp" filter directly, so
		// we skip already-flushed items in JavaScript instead.
		let tmpAll = pStore.listWorkItems({ Limit: FLUSH_BATCH_LIMIT, OrderBy: 'EnqueuedAt ASC' }) || [];
		let tmpPushed = 0;
		for (let i = 0; i < tmpAll.length; i++)
		{
			let tmpItem = tmpAll[i];
			let tmpEnqueuedAt = tmpItem.EnqueuedAt || tmpItem.CreatedAt || '';
			if (tmpHWM && tmpEnqueuedAt && tmpEnqueuedAt <= tmpHWM) continue;
			// Push the work item itself. Idempotent on WorkItemHash
			// (the beacon's QP_UpsertWorkItem uses upsert semantics).
			let tmpUpsertResult = await this._dispatch('QP_UpsertWorkItem', { WorkItem: tmpItem });
			if (!tmpUpsertResult || !tmpUpsertResult.Success)
			{
				// Beacon went away mid-flush, or the action failed.
				// Stop here; HWM stays put; next reconnect retries.
				break;
			}
			// Push any locally-recorded events for this item too,
			// so timeline reads on the beacon match what was
			// captured locally during the outage.
			if (typeof pStore.listEventsForWorkItem === 'function')
			{
				let tmpEvents = pStore.listEventsForWorkItem(tmpItem.WorkItemHash, 1000) || [];
				let tmpEventOK = true;
				for (let e = 0; e < tmpEvents.length; e++)
				{
					let tmpEventResult = await this._dispatch('QP_AppendEvent', { Event: tmpEvents[e] });
					if (!tmpEventResult || !tmpEventResult.Success) { tmpEventOK = false; break; }
				}
				if (!tmpEventOK) break;
			}
			tmpHWM = tmpEnqueuedAt || tmpHWM;
			this._FlushHWMs[pBeaconID] = tmpHWM;
			this._saveHWMs();
			tmpPushed += 1;
		}
		return tmpPushed;
	}

	/**
	 * Read the HWM file from disk, returning the queue subtree
	 * (or {} if absent / corrupt). Other bridges share the same
	 * file with their own top-level key.
	 */
	_loadHWMs()
	{
		try
		{
			let tmpPath = this._hwmPath();
			if (!tmpPath || !libFs.existsSync(tmpPath)) return {};
			let tmpRaw = libFs.readFileSync(tmpPath, 'utf8');
			let tmpDoc = JSON.parse(tmpRaw);
			return (tmpDoc && tmpDoc.Queue) || {};
		}
		catch (pErr) { return {}; }
	}

	/**
	 * Persist the HWM file. Read-modify-write so we don't clobber
	 * the manifest bridge's subtree; both bridges share the file.
	 */
	_saveHWMs()
	{
		try
		{
			let tmpPath = this._hwmPath();
			if (!tmpPath) return;
			let tmpDoc = {};
			if (libFs.existsSync(tmpPath))
			{
				try { tmpDoc = JSON.parse(libFs.readFileSync(tmpPath, 'utf8')) || {}; }
				catch (e) { tmpDoc = {}; }
			}
			tmpDoc.Queue = this._FlushHWMs;
			libFs.writeFileSync(tmpPath, JSON.stringify(tmpDoc, null, '\t'), 'utf8');
		}
		catch (pErr)
		{
			// Best effort — losing the HWM only means the next
			// flush is wider than necessary, not incorrect.
			this.log.warn(`QueuePersistenceBridge: HWM save failed: ${pErr.message}`);
		}
	}

	_hwmPath()
	{
		let tmpDataPath = (this.fable && this.fable.settings && this.fable.settings.UltravisorFileStorePath)
			|| (this.fable && this.fable.settings && this.fable.settings.DataPath)
			|| null;
		if (!tmpDataPath) return null;
		return libPath.join(tmpDataPath, HWM_FILENAME);
	}

	// ============== Persistence assignment (Session 3) ==============

	/**
	 * Apply an explicit lab assignment. Drops bootstrap state for any
	 * previously-assigned beacon, persists the new assignment to disk,
	 * and — if the new beacon is already registered + Online — kicks
	 * the bootstrap state machine immediately. Otherwise the next
	 * `onBeaconConnected` notification will trigger it.
	 *
	 * Pass `pBeaconID = null` (or call `clearPersistenceAssignment`)
	 * to drop the assignment entirely; the bridge falls back to legacy
	 * QueuePersistence dispatch (or local store) on subsequent calls.
	 */
	setPersistenceAssignment(pBeaconID, pIDBeaconConnection)
	{
		let tmpPrev = this._PersistenceAssignment;
		if (tmpPrev && tmpPrev.BeaconID && tmpPrev.BeaconID !== pBeaconID)
		{
			this._BootstrappedBeacons.delete(tmpPrev.BeaconID);
			delete this._EndpointBaseByBeacon[tmpPrev.BeaconID];
		}
		if (!pBeaconID)
		{
			this._PersistenceAssignment = null;
		}
		else
		{
			this._PersistenceAssignment =
			{
				BeaconID: pBeaconID,
				IDBeaconConnection: pIDBeaconConnection || 0,
				AssignedAt: new Date().toISOString()
			};
		}
		this._LastBootstrapError = null;
		this._BootstrappedAt = null;
		this._saveAssignment();
		if (!pBeaconID) return;
		let tmpCoord = this._coord();
		let tmpBeacon = tmpCoord && typeof tmpCoord.getBeacon === 'function' ? tmpCoord.getBeacon(pBeaconID) : null;
		if (tmpBeacon && (tmpBeacon.Status === 'Online' || tmpBeacon.Status === 'Busy'))
		{
			setImmediate(() => this._handleMeadowProxyBootstrap(pBeaconID));
		}
	}

	clearPersistenceAssignment()
	{
		this.setPersistenceAssignment(null, 0);
	}

	/**
	 * Snapshot of the bridge's persistence state for the lab status
	 * pill. Derived from _PersistenceAssignment + the bootstrap state
	 * sets, so it stays in sync without requiring callers to poke
	 * internals.
	 */
	getPersistenceStatus()
	{
		let tmpAssigned = this._PersistenceAssignment || null;
		let tmpBeaconID = tmpAssigned && tmpAssigned.BeaconID || null;
		let tmpState;
		if (!tmpBeaconID)
		{
			tmpState = 'unassigned';
		}
		else if (this._LastBootstrapError)
		{
			tmpState = 'error';
		}
		else if (this._BootstrappedBeacons.has(tmpBeaconID))
		{
			tmpState = 'bootstrapped';
		}
		else if (this._BootstrapInFlight.has(tmpBeaconID))
		{
			tmpState = 'bootstrapping';
		}
		else
		{
			tmpState = 'waiting-for-beacon';
		}
		return {
			State: tmpState,
			AssignedBeaconID: tmpBeaconID,
			IDBeaconConnection: tmpAssigned ? (tmpAssigned.IDBeaconConnection || 0) : 0,
			LastError: this._LastBootstrapError || null,
			BootstrappedAt: this._BootstrappedAt || null,
			AssignedAt: tmpAssigned ? (tmpAssigned.AssignedAt || null) : null
		};
	}

	_loadAssignment()
	{
		try
		{
			let tmpPath = this._assignmentPath();
			if (!tmpPath || !libFs.existsSync(tmpPath)) return null;
			let tmpDoc = JSON.parse(libFs.readFileSync(tmpPath, 'utf8'));
			let tmpEntry = tmpDoc && tmpDoc.Queue;
			if (!tmpEntry || !tmpEntry.BeaconID) return null;
			return tmpEntry;
		}
		catch (pErr) { return null; }
	}

	_saveAssignment()
	{
		try
		{
			let tmpPath = this._assignmentPath();
			if (!tmpPath) return;
			let tmpDoc = {};
			if (libFs.existsSync(tmpPath))
			{
				try { tmpDoc = JSON.parse(libFs.readFileSync(tmpPath, 'utf8')) || {}; }
				catch (e) { tmpDoc = {}; }
			}
			tmpDoc.Queue = this._PersistenceAssignment || null;
			libFs.writeFileSync(tmpPath, JSON.stringify(tmpDoc, null, '\t'), 'utf8');
		}
		catch (pErr)
		{
			if (this.log) this.log.warn(`QueuePersistenceBridge: assignment save failed: ${pErr.message}`);
		}
	}

	_assignmentPath()
	{
		let tmpDataPath = (this.fable && this.fable.settings && this.fable.settings.UltravisorFileStorePath)
			|| (this.fable && this.fable.settings && this.fable.settings.DataPath)
			|| null;
		if (!tmpDataPath) return null;
		return libPath.join(tmpDataPath, ASSIGNMENT_FILENAME);
	}

	// ============== Internals ==============

	_coord()
	{
		let tmpMap = this.fable && this.fable.servicesMap
			&& this.fable.servicesMap.UltravisorBeaconCoordinator;
		return tmpMap ? Object.values(tmpMap)[0] : null;
	}

	_localStore()
	{
		// Resolve lazily: the store can be added/replaced after the
		// bridge is constructed, and not every deployment installs it.
		let tmpMap = this.fable && this.fable.servicesMap
			&& this.fable.servicesMap.UltravisorBeaconQueueStore;
		let tmpStore = tmpMap ? Object.values(tmpMap)[0] : null;
		if (!tmpStore || (typeof tmpStore.isEnabled === 'function' && !tmpStore.isEnabled()))
		{
			return null;
		}
		return tmpStore;
	}

	/**
	 * Write through the beacon when available; otherwise the local
	 * QueueStore. Both paths return {Success}. Beacon dispatch errors
	 * fall through to {Available:true, Success:false, Reason} so the
	 * caller can log without crashing the dispatch path.
	 */
	_writeOrLocal(pAction, pSettings, fLocal)
	{
		if (this.isMeadowProxyMode())
		{
			return this._dispatchViaMeadowProxy(pAction, pSettings);
		}
		if (this.isBeaconAvailable())
		{
			return this._dispatch(pAction, pSettings);
		}
		let tmpStore = this._localStore();
		if (!tmpStore)
		{
			// Fail open: persistence is optional. The coordinator caller
			// only logs a warning on failure; the work item itself
			// still completes via the in-memory queue state.
			return Promise.resolve({ Available: false, Success: false, Reason: 'No persistence backend (beacon or local) available' });
		}
		try
		{
			let tmpResult = fLocal(tmpStore);
			// Local store methods return mixed shapes (sometimes the
			// inserted row, sometimes void). Normalize to {Success}.
			return Promise.resolve({ Available: true, Success: true, LocalResult: tmpResult });
		}
		catch (pErr)
		{
			return Promise.resolve(
			{
				Available: true, Success: false,
				Reason: (pErr && pErr.message) || String(pErr)
			});
		}
	}

	/**
	 * Read through the beacon when available; otherwise the local
	 * QueueStore. The read shape uses {Success, ...payload} from the
	 * beacon and synthesizes the same shape from the synchronous
	 * local result.
	 */
	_readOrLocal(pAction, pSettings, fLocal)
	{
		if (this.isMeadowProxyMode())
		{
			return this._dispatchViaMeadowProxy(pAction, pSettings);
		}
		if (this.isBeaconAvailable())
		{
			return this._dispatch(pAction, pSettings);
		}
		let tmpStore = this._localStore();
		if (!tmpStore)
		{
			return Promise.resolve(
			{
				Available: false, Success: false,
				Reason: 'No persistence backend available',
				WorkItem: null, WorkItems: [], Events: []
			});
		}
		try
		{
			let tmpResult = fLocal(tmpStore);
			return Promise.resolve(Object.assign({ Available: true }, tmpResult));
		}
		catch (pErr)
		{
			return Promise.resolve(
			{
				Available: true, Success: false,
				Reason: (pErr && pErr.message) || String(pErr)
			});
		}
	}

	_dispatch(pAction, pSettings)
	{
		return new Promise((fResolve) =>
		{
			let tmpCoord = this._coord();
			if (!tmpCoord)
			{
				return fResolve(
				{
					Available: false, Success: false,
					Reason: 'BeaconCoordinator not available'
				});
			}
			tmpCoord.dispatchAndWait(
			{
				Capability: 'QueuePersistence',
				Action: pAction,
				Settings: pSettings || {},
				AffinityKey: 'queue-persistence',
				TimeoutMs: this._TimeoutMs
			},
			(pError, pResult) =>
			{
				if (pError)
				{
					return fResolve(
					{
						Available: true, Success: false,
						Reason: pError.message || String(pError)
					});
				}
				let tmpOut = (pResult && pResult.Outputs) || {};
				return fResolve(Object.assign({ Available: true }, tmpOut));
			});
		});
	}

	// ============== MeadowProxy dispatch path ==============

	/**
	 * Translate a QP_* action onto the corresponding MeadowProxy
	 * REST request and dispatch it through the assigned databeacon.
	 *
	 * Translation table (see `docs/features/persistence-via-databeacon.md`):
	 *
	 *   QP_UpsertWorkItem      → POST /1.0/<hash>/UVQueueWorkItem
	 *                            (relies on `WorkItemHash` unique index for
	 *                            idempotency; PUT/PATCH-by-hash require an
	 *                            extra GET-by-hash → IDRecord round-trip
	 *                            that's deferred to Session 3 with the lab
	 *                            UI work).
	 *   QP_UpdateWorkItem      → POST as well — without a hash→ID lookup
	 *                            the bridge can't address the row by its
	 *                            meadow-side primary key. Documented as a
	 *                            known gap; queue's source-of-truth is the
	 *                            event log (QP_AppendEvent) which has full
	 *                            fidelity here.
	 *   QP_AppendEvent         → POST /1.0/<hash>/UVQueueWorkItemEvent
	 *   QP_InsertAttempt       → POST /1.0/<hash>/UVQueueWorkItemAttempt
	 *   QP_UpdateAttemptOutcome→ same caveat as QP_UpdateWorkItem.
	 *   QP_GetWorkItemByHash   → GET  /1.0/<hash>/UVQueueWorkItems/FilteredTo/FBV~WorkItemHash~EQ~<hash>
	 *   QP_ListWorkItems       → GET  /1.0/<hash>/UVQueueWorkItems
	 *   QP_GetEvents           → GET  /1.0/<hash>/UVQueueWorkItemEvents/FilteredTo/FBV~WorkItemHash~EQ~<hash>
	 *
	 * Returns the same `{Available, Success, ...}` shape as `_dispatch`
	 * so the existing call sites don't care which backend fired.
	 */
	_dispatchViaMeadowProxy(pAction, pSettings)
	{
		let tmpAssigned = this.getPersistenceBeacon();
		if (!tmpAssigned)
		{
			return Promise.resolve(
			{
				Available: false, Success: false,
				Reason: 'No MeadowProxy persistence beacon assigned'
			});
		}
		// Two-step actions: meadow's PUT/DELETE addresses rows by PK,
		// not by our natural keys, so we issue a filtered GET first to
		// discover the IDRecord, then mutate.
		if (pAction === 'QP_UpdateWorkItem')
		{
			return this._dispatchUpdateByHash(tmpAssigned.BeaconID,
				'UVQueueWorkItem', 'IDUVQueueWorkItem',
				'WorkItemHash', pSettings && pSettings.WorkItemHash,
				pSettings && pSettings.Patch);
		}
		if (pAction === 'QP_UpdateAttemptOutcome')
		{
			return this._dispatchUpdateByTwoColumns(tmpAssigned.BeaconID,
				'UVQueueWorkItemAttempt', 'IDUVQueueWorkItemAttempt',
				'WorkItemHash', pSettings && pSettings.WorkItemHash,
				'AttemptNumber', pSettings && pSettings.AttemptNumber,
				pSettings && pSettings.Patch);
		}
		return new Promise((fResolve) =>
		{
			let tmpReq;
			try
			{
				tmpReq = this._buildMeadowProxyRequest(pAction, pSettings, tmpAssigned.BeaconID);
			}
			catch (pErr)
			{
				return fResolve(
				{
					Available: true, Success: false,
					Reason: pErr.message || String(pErr)
				});
			}
			if (!tmpReq)
			{
				return fResolve(
				{
					Available: true, Success: false,
					Reason: `Action [${pAction}] is not yet wired through MeadowProxy`
				});
			}

			let tmpCoord = this._coord();
			if (!tmpCoord)
			{
				return fResolve(
				{
					Available: false, Success: false,
					Reason: 'BeaconCoordinator not available'
				});
			}
			tmpCoord.dispatchAndWait(
			{
				Capability: 'MeadowProxy',
				Action: 'Request',
				Settings: tmpReq,
				AffinityKey: 'queue-persistence',
				TimeoutMs: this._TimeoutMs
			},
			(pError, pResult) =>
			{
				if (pError)
				{
					return fResolve(
					{
						Available: true, Success: false,
						Reason: pError.message || String(pError)
					});
				}
				let tmpOut = (pResult && pResult.Outputs) || {};
				let tmpStatus = tmpOut.Status || 0;
				let tmpBody = tmpOut.Body;
				let tmpSuccess = (tmpStatus >= 200 && tmpStatus < 300);
				return fResolve(this._normalizeMeadowProxyResult(pAction, tmpStatus, tmpBody, tmpSuccess));
			});
		});
	}

	_buildMeadowProxyRequest(pAction, pSettings, pBeaconID)
	{
		let tmpBase = this._endpointBase(pBeaconID, 'UVQueueWorkItem');
		let tmpEventsBase = this._endpointBase(pBeaconID, 'UVQueueWorkItemEvent');
		let tmpAttemptsBase = this._endpointBase(pBeaconID, 'UVQueueWorkItemAttempt');
		let tmpUser = this._resolveRemoteUser();
		// Settings carry the bridge-level args; we re-shape them into
		// REST { Method, Path, Body, RemoteUser }. Each branch returns
		// null for actions intentionally unmapped here — the two-step
		// update / remove paths are handled by _dispatchUpdateByHash /
		// _dispatchUpdateByTwoColumns from _dispatchViaMeadowProxy.
		switch (pAction)
		{
			case 'QP_UpsertWorkItem':
			{
				let tmpItem = pSettings && pSettings.WorkItem;
				if (!tmpItem) { throw new Error('QP_UpsertWorkItem: WorkItem is required.'); }
				return { Method: 'POST', Path: tmpBase, Body: JSON.stringify(tmpItem), RemoteUser: tmpUser };
			}
			case 'QP_AppendEvent':
			{
				let tmpEvent = pSettings && pSettings.Event;
				if (!tmpEvent) { throw new Error('QP_AppendEvent: Event is required.'); }
				return { Method: 'POST', Path: tmpEventsBase, Body: JSON.stringify(tmpEvent), RemoteUser: tmpUser };
			}
			case 'QP_InsertAttempt':
			{
				let tmpAttempt = pSettings && pSettings.Attempt;
				if (!tmpAttempt) { throw new Error('QP_InsertAttempt: Attempt is required.'); }
				return { Method: 'POST', Path: tmpAttemptsBase, Body: JSON.stringify(tmpAttempt), RemoteUser: tmpUser };
			}
			case 'QP_GetWorkItemByHash':
			{
				let tmpHash = pSettings && pSettings.WorkItemHash;
				if (!tmpHash) { throw new Error('QP_GetWorkItemByHash: WorkItemHash is required.'); }
				return { Method: 'GET', Path: `${tmpBase}s/FilteredTo/FBV~WorkItemHash~EQ~${encodeURIComponent(tmpHash)}`, RemoteUser: tmpUser };
			}
			case 'QP_ListWorkItems':
			{
				return { Method: 'GET', Path: `${tmpBase}s`, RemoteUser: tmpUser };
			}
			case 'QP_GetEvents':
			{
				let tmpHash = pSettings && pSettings.WorkItemHash;
				if (!tmpHash) { throw new Error('QP_GetEvents: WorkItemHash is required.'); }
				return { Method: 'GET', Path: `${tmpEventsBase}s/FilteredTo/FBV~WorkItemHash~EQ~${encodeURIComponent(tmpHash)}`, RemoteUser: tmpUser };
			}
			default:
				return null;
		}
	}

	_normalizeMeadowProxyResult(pAction, pStatus, pBody, pSuccess)
	{
		// Meadow REST returns:
		//   - GET-by-id  → single object or 404 (we don't hit this path).
		//   - GET-list   → array.
		//   - POST       → the inserted/upserted record (object).
		//   - PUT/DELETE → the affected record (object).
		// Map back into the bridge's QP_* result shapes so callers don't
		// have to special-case the backend.
		let tmpParsed = null;
		if (typeof pBody === 'string' && pBody.length > 0)
		{
			try { tmpParsed = JSON.parse(pBody); }
			catch (pErr) { tmpParsed = null; }
		}
		else if (typeof pBody === 'object')
		{
			tmpParsed = pBody;
		}

		switch (pAction)
		{
			case 'QP_GetWorkItemByHash':
			{
				let tmpItem = Array.isArray(tmpParsed) ? (tmpParsed[0] || null) : null;
				return { Available: true, Success: !!tmpItem, WorkItem: tmpItem };
			}
			case 'QP_ListWorkItems':
				return { Available: true, Success: pSuccess, WorkItems: Array.isArray(tmpParsed) ? tmpParsed : [] };
			case 'QP_GetEvents':
				return { Available: true, Success: pSuccess, Events: Array.isArray(tmpParsed) ? tmpParsed : [] };
			default:
				if (pSuccess)
				{
					return { Available: true, Success: true, Body: tmpParsed };
				}
				return {
					Available: true, Success: false,
					Status: pStatus,
					Reason: (tmpParsed && (tmpParsed.error || tmpParsed.message)) || `MeadowProxy ${pStatus}`
				};
		}
	}

	_endpointBase(pBeaconID, pTableName)
	{
		let tmpCache = this._EndpointBaseByBeacon[pBeaconID] || {};
		if (tmpCache[pTableName]) { return tmpCache[pTableName]; }
		// Fallback when EnableEndpoint hasn't reported back yet — meadow
		// REST routes without a route hash live at /1.0/<TableName>. The
		// databeacon's actual prefix has the connection's sanitized name
		// so this is a best-effort guess; the smoke test uses the cached
		// path populated during bootstrap.
		return `/1.0/${pTableName}`;
	}

	/**
	 * Pass-through value for MeadowProxy.Request's `RemoteUser` field.
	 * Today returns the synthetic `'ultravisor-system'` so the audit
	 * trail can distinguish UV-driven writes from manual mesh activity.
	 * Future: thread the originating session user through from
	 * /Ultravisor/Persistence/* and the dispatch path.
	 */
	_resolveRemoteUser()
	{
		return 'ultravisor-system';
	}

	/**
	 * Issue a filtered GET against a UV* table, return the IDRecord
	 * from the first matching row. Resolves to null on miss (no error)
	 * so callers can choose to no-op or report NotFound.
	 *
	 * @param {string} pBeaconID
	 * @param {string} pTable        — schema scope, e.g. 'UVQueueWorkItem'.
	 * @param {string} pIDColumn     — PK column, e.g. 'IDUVQueueWorkItem'.
	 * @param {string} pHashColumn   — natural-key column to filter on.
	 * @param {string} pHashValue    — filter value.
	 */
	_lookupIDByHash(pBeaconID, pTable, pIDColumn, pHashColumn, pHashValue)
	{
		return new Promise((fResolve) =>
		{
			let tmpCoord = this._coord();
			if (!tmpCoord)
			{
				return fResolve({ Success: false, Reason: 'BeaconCoordinator not available' });
			}
			if (!pHashValue)
			{
				return fResolve({ Success: false, Reason: `${pHashColumn} is required for lookup` });
			}
			let tmpBase = this._endpointBase(pBeaconID, pTable);
			let tmpReq =
			{
				Method: 'GET',
				Path: `${tmpBase}s/FilteredTo/FBV~${pHashColumn}~EQ~${encodeURIComponent(pHashValue)}`,
				RemoteUser: this._resolveRemoteUser()
			};
			tmpCoord.dispatchAndWait(
			{
				Capability: 'MeadowProxy',
				Action: 'Request',
				Settings: tmpReq,
				AffinityKey: 'queue-persistence',
				TimeoutMs: this._TimeoutMs
			},
			(pError, pResult) =>
			{
				if (pError) return fResolve({ Success: false, Reason: pError.message || String(pError) });
				let tmpOut = (pResult && pResult.Outputs) || {};
				let tmpStatus = tmpOut.Status || 0;
				if (tmpStatus < 200 || tmpStatus >= 300)
				{
					return fResolve({ Success: false, Reason: `Lookup failed: HTTP ${tmpStatus}` });
				}
				let tmpParsed = null;
				if (typeof tmpOut.Body === 'string' && tmpOut.Body.length > 0)
				{
					try { tmpParsed = JSON.parse(tmpOut.Body); }
					catch (e) { tmpParsed = null; }
				}
				else if (typeof tmpOut.Body === 'object')
				{
					tmpParsed = tmpOut.Body;
				}
				let tmpRow = Array.isArray(tmpParsed) ? (tmpParsed[0] || null) : null;
				if (!tmpRow)
				{
					return fResolve({ Success: true, Found: false, IDRecord: null });
				}
				return fResolve({ Success: true, Found: true, IDRecord: tmpRow[pIDColumn], Row: tmpRow });
			});
		});
	}

	/**
	 * Two-column variant of _lookupIDByHash. Stacks filters via
	 * meadow's `~FBV~` glue: `FBV~Col1~EQ~v1~FBV~Col2~EQ~v2`.
	 */
	_lookupIDByTwoColumns(pBeaconID, pTable, pIDColumn, pCol1, pVal1, pCol2, pVal2)
	{
		return new Promise((fResolve) =>
		{
			let tmpCoord = this._coord();
			if (!tmpCoord)
			{
				return fResolve({ Success: false, Reason: 'BeaconCoordinator not available' });
			}
			if (pVal1 === undefined || pVal1 === null || pVal2 === undefined || pVal2 === null)
			{
				return fResolve({ Success: false, Reason: 'Both filter values required' });
			}
			let tmpBase = this._endpointBase(pBeaconID, pTable);
			let tmpFilter = `FBV~${pCol1}~EQ~${encodeURIComponent(pVal1)}~FBV~${pCol2}~EQ~${encodeURIComponent(pVal2)}`;
			let tmpReq =
			{
				Method: 'GET',
				Path: `${tmpBase}s/FilteredTo/${tmpFilter}`,
				RemoteUser: this._resolveRemoteUser()
			};
			tmpCoord.dispatchAndWait(
			{
				Capability: 'MeadowProxy',
				Action: 'Request',
				Settings: tmpReq,
				AffinityKey: 'queue-persistence',
				TimeoutMs: this._TimeoutMs
			},
			(pError, pResult) =>
			{
				if (pError) return fResolve({ Success: false, Reason: pError.message || String(pError) });
				let tmpOut = (pResult && pResult.Outputs) || {};
				let tmpStatus = tmpOut.Status || 0;
				if (tmpStatus < 200 || tmpStatus >= 300)
				{
					return fResolve({ Success: false, Reason: `Lookup failed: HTTP ${tmpStatus}` });
				}
				let tmpParsed = null;
				if (typeof tmpOut.Body === 'string' && tmpOut.Body.length > 0)
				{
					try { tmpParsed = JSON.parse(tmpOut.Body); }
					catch (e) { tmpParsed = null; }
				}
				else if (typeof tmpOut.Body === 'object')
				{
					tmpParsed = tmpOut.Body;
				}
				let tmpRow = Array.isArray(tmpParsed) ? (tmpParsed[0] || null) : null;
				if (!tmpRow)
				{
					return fResolve({ Success: true, Found: false, IDRecord: null });
				}
				return fResolve({ Success: true, Found: true, IDRecord: tmpRow[pIDColumn], Row: tmpRow });
			});
		});
	}

	/**
	 * Two-step update: filtered GET to discover IDRecord, then PUT
	 * with the patch (PK included so meadow's update-by-id accepts it).
	 * Resolves to {Available, Success, Reason?} matching the
	 * single-step QP_* result shape.
	 */
	async _dispatchUpdateByHash(pBeaconID, pTable, pIDColumn, pHashColumn, pHashValue, pPatch)
	{
		let tmpLookup = await this._lookupIDByHash(pBeaconID, pTable, pIDColumn, pHashColumn, pHashValue);
		if (!tmpLookup.Success)
		{
			return { Available: true, Success: false, Reason: tmpLookup.Reason };
		}
		if (!tmpLookup.Found)
		{
			return { Available: true, Success: false, Reason: `${pTable} row with ${pHashColumn}=${pHashValue} not found` };
		}
		let tmpBody = Object.assign({}, pPatch || {});
		tmpBody[pIDColumn] = tmpLookup.IDRecord;
		let tmpBase = this._endpointBase(pBeaconID, pTable);
		return this._putByID(pBeaconID, tmpBase, tmpLookup.IDRecord, tmpBody, 'queue-persistence');
	}

	async _dispatchUpdateByTwoColumns(pBeaconID, pTable, pIDColumn, pCol1, pVal1, pCol2, pVal2, pPatch)
	{
		let tmpLookup = await this._lookupIDByTwoColumns(pBeaconID, pTable, pIDColumn, pCol1, pVal1, pCol2, pVal2);
		if (!tmpLookup.Success)
		{
			return { Available: true, Success: false, Reason: tmpLookup.Reason };
		}
		if (!tmpLookup.Found)
		{
			return { Available: true, Success: false, Reason: `${pTable} row with ${pCol1}=${pVal1}, ${pCol2}=${pVal2} not found` };
		}
		let tmpBody = Object.assign({}, pPatch || {});
		tmpBody[pIDColumn] = tmpLookup.IDRecord;
		let tmpBase = this._endpointBase(pBeaconID, pTable);
		return this._putByID(pBeaconID, tmpBase, tmpLookup.IDRecord, tmpBody, 'queue-persistence');
	}

	_putByID(pBeaconID, pEndpointBase, pIDRecord, pBody, pAffinityKey)
	{
		return new Promise((fResolve) =>
		{
			let tmpCoord = this._coord();
			if (!tmpCoord)
			{
				return fResolve({ Available: false, Success: false, Reason: 'BeaconCoordinator not available' });
			}
			// Meadow's Update endpoint is `PUT <base>` (no /:IDRecord) —
			// the PK rides in the body. See meadow-endpoints route table:
			// `putWithBodyParser` only registers '' and 's', not '/:IDRecord'.
			let tmpReq =
			{
				Method: 'PUT',
				Path: pEndpointBase,
				Body: JSON.stringify(pBody),
				RemoteUser: this._resolveRemoteUser()
			};
			tmpCoord.dispatchAndWait(
			{
				Capability: 'MeadowProxy',
				Action: 'Request',
				Settings: tmpReq,
				AffinityKey: pAffinityKey,
				TimeoutMs: this._TimeoutMs
			},
			(pError, pResult) =>
			{
				if (pError)
				{
					return fResolve({ Available: true, Success: false, Reason: pError.message || String(pError) });
				}
				let tmpOut = (pResult && pResult.Outputs) || {};
				let tmpStatus = tmpOut.Status || 0;
				let tmpSuccess = (tmpStatus >= 200 && tmpStatus < 300);
				if (!tmpSuccess)
				{
					return fResolve({ Available: true, Success: false, Status: tmpStatus, Reason: `PUT returned ${tmpStatus}` });
				}
				return fResolve({ Available: true, Success: true });
			});
		});
	}

	// ============== Schema bootstrap state machine ==============

	/**
	 * Fired by the coordinator on every (re)connect. For QueuePersistence
	 * beacons this drives bootstrap-flush as before. For MeadowProxy
	 * persistence beacons it kicks off the EnsureSchema → UpdateProxyConfig
	 * → EnableEndpoint sequence so the bridge can start dispatching
	 * through MeadowProxy. Both flows are idempotent.
	 */
	_handleMeadowProxyBootstrap(pBeaconID)
	{
		if (!pBeaconID) return;
		if (!this._SchemaDescriptor) return;
		if (this._BootstrappedBeacons.has(pBeaconID)) return;
		if (this._BootstrapInFlight.has(pBeaconID)) return;
		let tmpAssigned = this.getPersistenceBeacon();
		if (!tmpAssigned || tmpAssigned.BeaconID !== pBeaconID) return;
		this._BootstrapInFlight.add(pBeaconID);
		this._runBootstrap(pBeaconID, tmpAssigned.IDBeaconConnection)
			.then((pResult) =>
			{
				this._BootstrapInFlight.delete(pBeaconID);
				if (pResult && pResult.Success)
				{
					this._BootstrappedBeacons.add(pBeaconID);
					this._BootstrappedAt = new Date().toISOString();
					this._LastBootstrapError = null;
					this.log.info(`QueuePersistenceBridge: MeadowProxy bootstrap complete for beacon [${pBeaconID}].`);
				}
				else
				{
					this._LastBootstrapError = (pResult && pResult.Reason) || 'Unknown bootstrap error';
					this.log.warn(`QueuePersistenceBridge: MeadowProxy bootstrap failed for beacon [${pBeaconID}]: ${this._LastBootstrapError}`);
				}
			})
			.catch((pErr) =>
			{
				this._BootstrapInFlight.delete(pBeaconID);
				this._LastBootstrapError = (pErr && pErr.message) || String(pErr);
				this.log.warn(`QueuePersistenceBridge: MeadowProxy bootstrap threw for beacon [${pBeaconID}]: ${this._LastBootstrapError}`);
			});
	}

	async _runBootstrap(pBeaconID, pIDBeaconConnection)
	{
		let tmpCoord = this._coord();
		if (!tmpCoord) return { Success: false, Reason: 'BeaconCoordinator not available' };

		// Step 1: EnsureSchema. Idempotent; second call is a no-op.
		let tmpEnsure = await this._mestDispatch(tmpCoord, 'DataBeaconSchema', 'EnsureSchema',
		{
			IDBeaconConnection: pIDBeaconConnection,
			SchemaName: this._SchemaDescriptor.SchemaName || 'ultravisor',
			SchemaJSON: this._SchemaDescriptor
		});
		if (!tmpEnsure.Success)
		{
			return { Success: false, Reason: `EnsureSchema failed: ${tmpEnsure.Reason}` };
		}

		// Step 2: Introspect. Populates the databeacon's IntrospectedTable
		// cache for the newly-created UV* tables. Without this,
		// EnableEndpoint can't find the cached column metadata it needs
		// to wire up meadow REST routes.
		let tmpIntrospect = await this._mestDispatch(tmpCoord, 'DataBeaconManagement', 'Introspect',
		{
			IDBeaconConnection: pIDBeaconConnection
		});
		if (!tmpIntrospect.Success)
		{
			return { Success: false, Reason: `Introspect failed: ${tmpIntrospect.Reason}` };
		}

		// Step 3: UpdateProxyConfig — extend the MeadowProxy allowlist
		// so PascalCase /1.0/.../UV* paths can pass through. Idempotent
		// on the databeacon side.
		let tmpProxy = await this._mestDispatch(tmpCoord, 'DataBeaconManagement', 'UpdateProxyConfig',
		{
			PathAllowlist: UV_PROXY_PATH_PATTERNS
		});
		if (!tmpProxy.Success)
		{
			return { Success: false, Reason: `UpdateProxyConfig failed: ${tmpProxy.Reason}` };
		}

		// Step 4: EnableEndpoint for each queue table. Captures the
		// databeacon-namespaced /1.0/<routeHash>/<Table> base so dispatch
		// doesn't have to discover it.
		this._EndpointBaseByBeacon[pBeaconID] = this._EndpointBaseByBeacon[pBeaconID] || {};
		for (let i = 0; i < QUEUE_TABLES.length; i++)
		{
			let tmpTable = QUEUE_TABLES[i];
			let tmpEnable = await this._mestDispatch(tmpCoord, 'DataBeaconManagement', 'EnableEndpoint',
			{
				IDBeaconConnection: pIDBeaconConnection,
				TableName: tmpTable
			});
			if (!tmpEnable.Success)
			{
				return { Success: false, Reason: `EnableEndpoint(${tmpTable}) failed: ${tmpEnable.Reason}` };
			}
			let tmpBase = (tmpEnable.Outputs && tmpEnable.Outputs.EndpointBase) || `/1.0/${tmpTable}`;
			this._EndpointBaseByBeacon[pBeaconID][tmpTable] = tmpBase;
		}
		return { Success: true };
	}

	/**
	 * Mesh-side dispatch helper used during bootstrap. Wraps
	 * `dispatchAndWait` in a Promise that always resolves so the
	 * bootstrap state machine stays linear. Returns a flat
	 * `{Success, Reason, Outputs}` envelope.
	 */
	_mestDispatch(pCoord, pCapability, pAction, pSettings)
	{
		return new Promise((fResolve) =>
		{
			pCoord.dispatchAndWait(
			{
				Capability: pCapability,
				Action: pAction,
				Settings: pSettings || {},
				AffinityKey: 'queue-persistence-bootstrap',
				TimeoutMs: this._TimeoutMs * 4
			},
			(pError, pResult) =>
			{
				if (pError)
				{
					return fResolve({ Success: false, Reason: pError.message || String(pError) });
				}
				let tmpOut = (pResult && pResult.Outputs) || {};
				let tmpSuccess = (tmpOut.Success !== false);
				return fResolve({ Success: tmpSuccess, Reason: tmpOut.Reason || '', Outputs: tmpOut });
			});
		});
	}
}

module.exports = UltravisorQueuePersistenceBridge;
