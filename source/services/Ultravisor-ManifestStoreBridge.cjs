/**
 * Ultravisor-ManifestStoreBridge
 *
 * Single front door for "where do operation execution manifests live?".
 * Two backends, picked at call time:
 *
 *   1. The optional ultravisor-manifest-beacon (capability =
 *      ManifestStore). When connected, every persistence write
 *      dispatches to the beacon and reads come back from it.
 *
 *   2. The in-process UltravisorExecutionManifest service. Used as
 *      the fallback whenever the beacon isn't connected — preserves
 *      the existing on-disk JSON-blob persistence behavior.
 *
 * Symmetric with Ultravisor-QueuePersistenceBridge: same beacon-or-
 * local pattern, same Promise-based API, same fail-open posture.
 *
 * Loop prevention: the coordinator's _isMetaCapability gate skips
 * persistence-recording for ManifestStore dispatches, mirroring how
 * QueuePersistence is skipped. MS_* dispatches are themselves work
 * items routed through the queue, but they don't trigger another
 * round of manifest persistence — otherwise an MS_UpsertManifest
 * write to the beacon would itself create a manifest, which would
 * persist via MS_UpsertManifest, which would create another...
 */

const libPictService = require('pict-serviceproviderbase');
const libFs = require('fs');
const libPath = require('path');

const DEFAULT_TIMEOUT_MS = 5000;

// One sweep can't drain a years-long backlog in a single shot —
// successive reconnects continue from the HWM. Manifests are
// coarser than queue items, so a smaller per-sweep cap is enough.
const FLUSH_BATCH_LIMIT = 1000;

const HWM_FILENAME = 'persistence-bridge-hwm.json';

// Filename for the persisted persistence-beacon assignment (Session 3).
// See Ultravisor-QueuePersistenceBridge.cjs for the schema; this bridge
// owns the Manifest top-level key.
const ASSIGNMENT_FILENAME = 'persistence-assignment.json';

// Beacon Tag the lab stamps on a databeacon when it's been assigned
// as the UV's persistence backend. Same convention as the queue
// bridge — manifests share the connection so they share the tag.
const PERSISTENCE_TAG = 'PersistenceConnectionID';

const SCHEMA_DESCRIPTOR_PATH = libPath.join(__dirname, '..', 'persistence', 'UltravisorPersistenceSchema.json');

const MANIFEST_TABLES = ['UVManifest'];

const UV_PROXY_PATH_PATTERNS = ['^/?1\\.0/[^/]+/UV[A-Za-z0-9]*'];

class UltravisorManifestStoreBridge extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
		this.serviceType = 'UltravisorManifestStoreBridge';
		this._TimeoutMs = (pOptions && pOptions.TimeoutMs) || DEFAULT_TIMEOUT_MS;
		// Bootstrap-flush state: HWM keyed by beaconID. We anchor on
		// each manifest's StopTime (terminal runs) or StartTime (still
		// in flight when ultravisor crashed) so HWM advances
		// monotonically. Idempotency is "free" via MS_UpsertManifest
		// — RunHash is the natural key — so a missed HWM only means
		// redundant uploads on the next sweep, not data corruption.
		this._FlushHWMs = this._loadHWMs();
		this._FlushInFlight = new Set();
		// MeadowProxy bootstrap state. Mirrors the queue bridge — see
		// Ultravisor-QueuePersistenceBridge.cjs for the rationale.
		this._BootstrappedBeacons = new Set();
		this._BootstrapInFlight = new Set();
		this._EndpointBaseByBeacon = {};
		this._SchemaDescriptor = this._loadSchemaDescriptor();
		// Explicit lab assignment (Session 3). Tag-scan stays as the
		// CLI-only fallback for sidecar deployments.
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
				this.log.warn(`ManifestStoreBridge: schema descriptor not loadable at ${SCHEMA_DESCRIPTOR_PATH} (${pErr.message}). MeadowProxy persistence path disabled.`);
			}
			return null;
		}
	}

	getBeaconID()
	{
		let tmpCoord = this._coord();
		if (!tmpCoord) return null;
		let tmpBeacons = tmpCoord.listBeacons() || [];
		for (let i = 0; i < tmpBeacons.length; i++)
		{
			let tmpCaps = tmpBeacons[i].Capabilities || [];
			if (tmpCaps.indexOf('ManifestStore') >= 0)
			{
				return tmpBeacons[i].BeaconID;
			}
		}
		return null;
	}

	isBeaconAvailable()
	{
		return this.getBeaconID() !== null;
	}

	/**
	 * Locate a MeadowProxy persistence beacon. Explicit lab assignment
	 * wins; tag-scan is the CLI-only fallback. Mirrors the queue
	 * bridge — see its getPersistenceBeacon for the rationale.
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

	isMeadowProxyMode()
	{
		let tmpAssigned = this.getPersistenceBeacon();
		if (!tmpAssigned) return false;
		return this._BootstrappedBeacons.has(tmpAssigned.BeaconID);
	}

	// ============== Write API ==============

	upsertManifest(pManifest)
	{
		return this._writeOrLocal('MS_UpsertManifest', { Manifest: pManifest },
			(pSvc) =>
			{
				// Local fallback: the existing UltravisorExecutionManifest
				// _writeManifest writes to disk in the staging path. We
				// invoke that path directly when no beacon is connected.
				// Caller is responsible for passing a manifest that
				// includes a StagingPath — that's how the in-process
				// service knows where to write.
				if (typeof pSvc._writeManifest === 'function' && pManifest && pManifest.StagingPath)
				{
					pSvc._writeManifest(pManifest, pManifest.StagingPath);
					return { Success: true };
				}
				return { Success: false, Reason: 'Local manifest service has no _writeManifest, or manifest missing StagingPath' };
			});
	}

	removeManifest(pRunHash)
	{
		return this._writeOrLocal('MS_RemoveManifest', { RunHash: pRunHash },
			(pSvc) =>
			{
				// In-process: drop from the in-memory _Runs map. Disk
				// staging folders aren't pruned here — abandonRun does
				// that, and operators typically run a separate retention
				// sweep.
				if (pSvc._Runs && pSvc._Runs[pRunHash])
				{
					delete pSvc._Runs[pRunHash];
					return { Success: true };
				}
				return { Success: false, Reason: 'Unknown manifest in local store' };
			});
	}

	// ============== Read API ==============

	getManifest(pRunHash)
	{
		return this._readOrLocal('MS_GetManifest', { RunHash: pRunHash },
			(pSvc) =>
			{
				let tmpRun = pSvc.getRun ? pSvc.getRun(pRunHash) : null;
				return { Success: !!tmpRun, Manifest: tmpRun };
			});
	}

	listManifests(pFilter)
	{
		return this._readOrLocal('MS_ListManifests', { Filter: pFilter || {} },
			(pSvc) =>
			{
				let tmpAll = (pSvc.listRuns ? pSvc.listRuns() : []) || [];
				// Apply the same minimal filtering the memory provider
				// supports, so callers see consistent semantics across
				// backends.
				let tmpFilter = pFilter || {};
				if (tmpFilter.OperationHash)
				{
					tmpAll = tmpAll.filter((pM) => pM.OperationHash === tmpFilter.OperationHash);
				}
				if (tmpFilter.Status)
				{
					tmpAll = tmpAll.filter((pM) => pM.Status === tmpFilter.Status);
				}
				let tmpLimit = tmpFilter.Limit || 100;
				return { Success: true, Manifests: tmpAll.slice(0, tmpLimit) };
			});
	}

	// ============== Bootstrap-flush ==============

	/**
	 * Called by the coordinator when ANY beacon registers (or
	 * re-registers after a reconnect). We filter by capability —
	 * the notification fans out, but only ManifestStore beacons
	 * trigger the flush sweep here.
	 *
	 * Local source of truth is UltravisorExecutionManifest's
	 * in-memory `_Runs` map. Manifests that have already been
	 * dropped from memory (because they were persisted to disk
	 * and never re-loaded) won't be flushed — the operator-facing
	 * /Manifest endpoints already merge live + bridge-historical
	 * reads, so historic manifests stay reachable via the merge
	 * even if the beacon doesn't have them. Documented assumption:
	 * if you crash ultravisor with a finalized-but-not-loaded
	 * manifest, the beacon won't backfill it from disk; for that,
	 * a future "rescan-on-demand" command would walk the staging
	 * dir.
	 */
	onBeaconConnected(pBeaconID)
	{
		if (!pBeaconID) return;
		// Try the MeadowProxy bootstrap first; the helper short-circuits
		// if this beacon isn't the assigned persistence backend.
		this._handleMeadowProxyBootstrap(pBeaconID);
		let tmpMSID = this.getBeaconID();
		if (tmpMSID !== pBeaconID) return;
		if (this._FlushInFlight.has(pBeaconID)) return;
		let tmpSvc = this._localService();
		if (!tmpSvc || typeof tmpSvc.listRuns !== 'function') return;
		this._FlushInFlight.add(pBeaconID);
		this._flushManifestsToBeacon(pBeaconID, tmpSvc)
			.then((pCount) =>
			{
				this._FlushInFlight.delete(pBeaconID);
				if (pCount > 0)
				{
					this.log.info(`ManifestStoreBridge: bootstrap-flush pushed ${pCount} manifest(s) to beacon [${pBeaconID}].`);
				}
			})
			.catch((pErr) =>
			{
				this._FlushInFlight.delete(pBeaconID);
				this.log.warn(`ManifestStoreBridge: bootstrap-flush failed: ${pErr && pErr.message}`);
			});
	}

	async _flushManifestsToBeacon(pBeaconID, pSvc)
	{
		let tmpHWM = this._FlushHWMs[pBeaconID] || '';
		let tmpAll = pSvc.listRuns() || [];
		// StopTime ASC for finalized runs so HWM marches forward
		// monotonically; un-stopped (still-running) runs sort last
		// by falling back to StartTime. _runAnchor() projects the
		// timestamp we use as the HWM key.
		tmpAll.sort((a, b) =>
		{
			let tmpA = this._runAnchor(a);
			let tmpB = this._runAnchor(b);
			if (tmpA < tmpB) return -1;
			if (tmpA > tmpB) return 1;
			return 0;
		});
		if (tmpAll.length > FLUSH_BATCH_LIMIT)
		{
			tmpAll = tmpAll.slice(0, FLUSH_BATCH_LIMIT);
		}
		let tmpPushed = 0;
		for (let i = 0; i < tmpAll.length; i++)
		{
			let tmpRun = tmpAll[i];
			let tmpAnchor = this._runAnchor(tmpRun);
			if (tmpHWM && tmpAnchor && tmpAnchor <= tmpHWM) continue;
			// Build the JSON-serializable shape MS_UpsertManifest
			// expects. Mirrors what UltravisorExecutionManifest's
			// _persistManifestViaBridge produces, kept inline here
			// because the local _Runs entries are full
			// ExecutionContext objects (with closures); we strip to
			// the wire-safe subset.
			let tmpManifest = this._wireSafeManifest(tmpRun);
			if (!tmpManifest) continue;
			let tmpResult = await this._dispatch('MS_UpsertManifest', { Manifest: tmpManifest });
			if (!tmpResult || !tmpResult.Success) break;
			tmpHWM = tmpAnchor || tmpHWM;
			this._FlushHWMs[pBeaconID] = tmpHWM;
			this._saveHWMs();
			tmpPushed += 1;
		}
		return tmpPushed;
	}

	_runAnchor(pRun)
	{
		if (!pRun) return '';
		// Prefer terminal time so finalized runs cluster cleanly at
		// the front of the sweep order. In-flight runs use StartTime
		// — they re-flush on each subsequent sweep until they finalize.
		return pRun.StopTime || pRun.StartTime || '';
	}

	_wireSafeManifest(pRun)
	{
		if (!pRun) return null;
		// Match the projection the existing /Manifest endpoint and
		// _persistManifestViaBridge use. Anything carrying closures
		// (PendingEvents, callback queues) gets dropped here.
		return {
			Hash: pRun.Hash,
			OperationHash: pRun.OperationHash,
			OperationName: pRun.OperationName,
			Status: pRun.Status,
			RunMode: pRun.RunMode,
			Live: pRun.Live || false,
			StartTime: pRun.StartTime,
			StopTime: pRun.StopTime,
			ElapsedMs: pRun.ElapsedMs,
			Output: pRun.Output || {},
			GlobalState: pRun.GlobalState || {},
			OperationState: pRun.OperationState || {},
			TaskOutputs: pRun.TaskOutputs || {},
			TaskManifests: pRun.TaskManifests || {},
			WaitingTasks: pRun.WaitingTasks || {},
			TimingSummary: pRun.TimingSummary || null,
			EventLog: pRun.EventLog || [],
			Errors: pRun.Errors || [],
			Log: pRun.Log || [],
			StagingPath: pRun.StagingPath || ''
		};
	}

	_loadHWMs()
	{
		try
		{
			let tmpPath = this._hwmPath();
			if (!tmpPath || !libFs.existsSync(tmpPath)) return {};
			let tmpDoc = JSON.parse(libFs.readFileSync(tmpPath, 'utf8'));
			return (tmpDoc && tmpDoc.Manifest) || {};
		}
		catch (pErr) { return {}; }
	}

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
			tmpDoc.Manifest = this._FlushHWMs;
			libFs.writeFileSync(tmpPath, JSON.stringify(tmpDoc, null, '\t'), 'utf8');
		}
		catch (pErr)
		{
			this.log.warn(`ManifestStoreBridge: HWM save failed: ${pErr.message}`);
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
			let tmpEntry = tmpDoc && tmpDoc.Manifest;
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
			tmpDoc.Manifest = this._PersistenceAssignment || null;
			libFs.writeFileSync(tmpPath, JSON.stringify(tmpDoc, null, '\t'), 'utf8');
		}
		catch (pErr)
		{
			if (this.log) this.log.warn(`ManifestStoreBridge: assignment save failed: ${pErr.message}`);
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

	_localService()
	{
		// Resolve lazily — the existing UltravisorExecutionManifest
		// service is the local fallback target.
		let tmpMap = this.fable && this.fable.servicesMap
			&& this.fable.servicesMap.UltravisorExecutionManifest;
		return tmpMap ? Object.values(tmpMap)[0] : null;
	}

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
		let tmpSvc = this._localService();
		if (!tmpSvc)
		{
			return Promise.resolve(
			{
				Available: false, Success: false,
				Reason: 'No manifest backend (beacon or local) available'
			});
		}
		try
		{
			let tmpResult = fLocal(tmpSvc);
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
		let tmpSvc = this._localService();
		if (!tmpSvc)
		{
			return Promise.resolve(
			{
				Available: false, Success: false,
				Reason: 'No manifest backend available',
				Manifest: null, Manifests: []
			});
		}
		try
		{
			let tmpResult = fLocal(tmpSvc);
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
				Capability: 'ManifestStore',
				Action: pAction,
				Settings: pSettings || {},
				AffinityKey: 'manifest-store',
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
	 * Translate an MS_* action onto a MeadowProxy REST request and
	 * dispatch it through the assigned databeacon.
	 *
	 * Translation table (see `docs/features/persistence-via-databeacon.md`):
	 *
	 *   MS_UpsertManifest  → POST /1.0/<hash>/UVManifest
	 *                         (relies on `Hash` unique index for
	 *                         idempotency; PUT-by-hash needs a hash→ID
	 *                         lookup that lands with the lab UI work).
	 *   MS_RemoveManifest  → deferred (soft-delete needs the IDRecord).
	 *   MS_GetManifest     → GET  /1.0/<hash>/UVManifests/FilteredTo/FBV~Hash~EQ~<hash>
	 *   MS_ListManifests   → GET  /1.0/<hash>/UVManifests
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
		// MS_RemoveManifest is a soft-delete via meadow's DELETE endpoint —
		// because the schema declares `Deleted` as Type='Deleted', meadow
		// flips the column rather than hard-removing. We still need a
		// hash → IDRecord lookup first because meadow's DELETE-by-id
		// addresses by primary key.
		if (pAction === 'MS_RemoveManifest')
		{
			return this._dispatchDeleteByHash(tmpAssigned.BeaconID,
				'UVManifest', 'IDUVManifest',
				'Hash', pSettings && pSettings.RunHash);
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
				AffinityKey: 'manifest-store',
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
		let tmpBase = this._endpointBase(pBeaconID, 'UVManifest');
		let tmpUser = this._resolveRemoteUser();
		switch (pAction)
		{
			case 'MS_UpsertManifest':
			{
				let tmpManifest = pSettings && pSettings.Manifest;
				if (!tmpManifest) { throw new Error('MS_UpsertManifest: Manifest is required.'); }
				// Project onto the UVManifest schema. Anything not listed
				// here would be rejected by meadow ("table has no column
				// named X") since we only created the columns the schema
				// descriptor declares. The full manifest payload survives
				// in the ManifestJSON blob.
				let tmpRow =
				{
					Hash: tmpManifest.Hash || '',
					OperationHash: tmpManifest.OperationHash || '',
					OperationName: tmpManifest.OperationName || '',
					Status: tmpManifest.Status || '',
					RunMode: tmpManifest.RunMode || '',
					Live: !!tmpManifest.Live,
					StartTime: tmpManifest.StartTime || '',
					StopTime: tmpManifest.StopTime || '',
					ElapsedMs: tmpManifest.ElapsedMs || 0,
					StagingPath: tmpManifest.StagingPath || '',
					ManifestJSON: typeof tmpManifest.ManifestJSON === 'string'
						? tmpManifest.ManifestJSON
						: JSON.stringify(tmpManifest)
				};
				return { Method: 'POST', Path: tmpBase, Body: JSON.stringify(tmpRow), RemoteUser: tmpUser };
			}
			case 'MS_GetManifest':
			{
				let tmpHash = pSettings && pSettings.RunHash;
				if (!tmpHash) { throw new Error('MS_GetManifest: RunHash is required.'); }
				return { Method: 'GET', Path: `${tmpBase}s/FilteredTo/FBV~Hash~EQ~${encodeURIComponent(tmpHash)}`, RemoteUser: tmpUser };
			}
			case 'MS_ListManifests':
			{
				return { Method: 'GET', Path: `${tmpBase}s`, RemoteUser: tmpUser };
			}
			default:
				return null;
		}
	}

	_normalizeMeadowProxyResult(pAction, pStatus, pBody, pSuccess)
	{
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
			case 'MS_GetManifest':
			{
				let tmpRow = Array.isArray(tmpParsed) ? (tmpParsed[0] || null) : null;
				return { Available: true, Success: !!tmpRow, Manifest: tmpRow };
			}
			case 'MS_ListManifests':
				return this._arrayResult(pAction, tmpParsed, pSuccess, 'Manifests');
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

	/**
	 * Wrap a meadow bulk-read array response into the {Available, Success,
	 * <ListKey>: [...]} envelope `_readOrLocal`'s callers expect. Matches
	 * the queue bridge's helper so both sides have identical shape.
	 */
	_arrayResult(pAction, pParsed, pSuccess, pListKey)
	{
		let tmpResult = { Available: true, Success: pSuccess };
		tmpResult[pListKey] = Array.isArray(pParsed) ? pParsed : [];
		return tmpResult;
	}

	_endpointBase(pBeaconID, pTableName)
	{
		let tmpCache = this._EndpointBaseByBeacon[pBeaconID] || {};
		if (tmpCache[pTableName]) { return tmpCache[pTableName]; }
		return `/1.0/${pTableName}`;
	}

	/**
	 * Pass-through value for MeadowProxy.Request's `RemoteUser` field.
	 * See the queue bridge — same rationale, same future plumbing.
	 */
	_resolveRemoteUser()
	{
		return 'ultravisor-system';
	}

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
				AffinityKey: 'manifest-store',
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
		return this._putByID(tmpBase, tmpLookup.IDRecord, tmpBody);
	}

	async _dispatchDeleteByHash(pBeaconID, pTable, pIDColumn, pHashColumn, pHashValue)
	{
		let tmpLookup = await this._lookupIDByHash(pBeaconID, pTable, pIDColumn, pHashColumn, pHashValue);
		if (!tmpLookup.Success)
		{
			return { Available: true, Success: false, Reason: tmpLookup.Reason };
		}
		if (!tmpLookup.Found)
		{
			return { Available: true, Success: true, AlreadyAbsent: true };
		}
		let tmpBase = this._endpointBase(pBeaconID, pTable);
		return new Promise((fResolve) =>
		{
			let tmpCoord = this._coord();
			if (!tmpCoord)
			{
				return fResolve({ Available: false, Success: false, Reason: 'BeaconCoordinator not available' });
			}
			let tmpReq =
			{
				Method: 'DELETE',
				Path: `${tmpBase}/${encodeURIComponent(tmpLookup.IDRecord)}`,
				RemoteUser: this._resolveRemoteUser()
			};
			tmpCoord.dispatchAndWait(
			{
				Capability: 'MeadowProxy',
				Action: 'Request',
				Settings: tmpReq,
				AffinityKey: 'manifest-store',
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
					return fResolve({ Available: true, Success: false, Status: tmpStatus, Reason: `DELETE returned ${tmpStatus}` });
				}
				return fResolve({ Available: true, Success: true });
			});
		});
	}

	_putByID(pEndpointBase, pIDRecord, pBody)
	{
		return new Promise((fResolve) =>
		{
			let tmpCoord = this._coord();
			if (!tmpCoord)
			{
				return fResolve({ Available: false, Success: false, Reason: 'BeaconCoordinator not available' });
			}
			// Meadow's Update endpoint is `PUT <base>` — PK travels in the body.
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
				AffinityKey: 'manifest-store',
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
					this.log.info(`ManifestStoreBridge: MeadowProxy bootstrap complete for beacon [${pBeaconID}].`);
				}
				else
				{
					this._LastBootstrapError = (pResult && pResult.Reason) || 'Unknown bootstrap error';
					this.log.warn(`ManifestStoreBridge: MeadowProxy bootstrap failed for beacon [${pBeaconID}]: ${this._LastBootstrapError}`);
				}
			})
			.catch((pErr) =>
			{
				this._BootstrapInFlight.delete(pBeaconID);
				this._LastBootstrapError = (pErr && pErr.message) || String(pErr);
				this.log.warn(`ManifestStoreBridge: MeadowProxy bootstrap threw for beacon [${pBeaconID}]: ${this._LastBootstrapError}`);
			});
	}

	async _runBootstrap(pBeaconID, pIDBeaconConnection)
	{
		let tmpCoord = this._coord();
		if (!tmpCoord) return { Success: false, Reason: 'BeaconCoordinator not available' };

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

		// Introspect populates the databeacon's IntrospectedTable cache
		// so subsequent EnableEndpoint calls find the columns for our
		// freshly-created UV* tables.
		let tmpIntrospect = await this._mestDispatch(tmpCoord, 'DataBeaconManagement', 'Introspect',
		{
			IDBeaconConnection: pIDBeaconConnection
		});
		if (!tmpIntrospect.Success)
		{
			return { Success: false, Reason: `Introspect failed: ${tmpIntrospect.Reason}` };
		}

		let tmpProxy = await this._mestDispatch(tmpCoord, 'DataBeaconManagement', 'UpdateProxyConfig',
		{
			PathAllowlist: UV_PROXY_PATH_PATTERNS
		});
		if (!tmpProxy.Success)
		{
			return { Success: false, Reason: `UpdateProxyConfig failed: ${tmpProxy.Reason}` };
		}

		this._EndpointBaseByBeacon[pBeaconID] = this._EndpointBaseByBeacon[pBeaconID] || {};
		for (let i = 0; i < MANIFEST_TABLES.length; i++)
		{
			let tmpTable = MANIFEST_TABLES[i];
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

	_mestDispatch(pCoord, pCapability, pAction, pSettings)
	{
		return new Promise((fResolve) =>
		{
			pCoord.dispatchAndWait(
			{
				Capability: pCapability,
				Action: pAction,
				Settings: pSettings || {},
				AffinityKey: 'manifest-store-bootstrap',
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

module.exports = UltravisorManifestStoreBridge;
