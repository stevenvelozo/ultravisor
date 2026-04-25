/**
 * Ultravisor — FleetManager
 *
 * The control-plane brain for the beacon mesh. Owns the lifecycle of
 * "what code/runtime each beacon has, what models each beacon has,
 * which models are enabled for dispatch on each beacon."
 *
 * Composes three lower-level services:
 *   - UltravisorBeaconCoordinator   — to dispatch work items + look
 *                                     up live beacon state
 *   - UltravisorBeaconFleetStore    — to persist installation rows
 *   - UltravisorDirectoryDistributor — to chunk + stream a source
 *                                      directory to a target beacon
 *
 * Design notes:
 *   - Apps (retold-labs, etc.) register their runtime sources and
 *     model catalogs at startup. The FleetManager holds NO hardcoded
 *     knowledge of any particular app's directory layout.
 *   - Install + Enable are deliberately separate operator actions.
 *     Install moves bytes; Enable flips a boolean. Both persist.
 *   - On beacon connect, the manager auto-pushes any registered
 *     runtime whose AutoPushOnConnect is true AND whose worker hash
 *     doesn't match the source hash. Models are NEVER auto-pushed —
 *     that's the operator's call via the fleet UI.
 *   - Models the worker reports via LWM_Inventory at connect time
 *     get auto-imported into the fleet table as Source='discovered',
 *     EnabledForDispatch=true. This preserves backwards-compatible
 *     "I just connected a worker that already has models, dispatch
 *     should still work" behavior without operator intervention.
 *     Operator-installed models default to EnabledForDispatch=false.
 *
 * @module Ultravisor-FleetManager
 */

const libPictService = require('pict-serviceproviderbase');
const libPath = require('path');
const libFs = require('fs');

class UltravisorFleetManager extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
		this.serviceType = 'UltravisorFleetManager';

		// Registered runtimes: Name → { Name, SourceDir, AutoPushOnConnect,
		// PushAction, FinalizeAction, ExpectedHashKey, IgnoreBasenames,
		// CapabilityFilter, BeaconNameFilter }
		this._runtimes = new Map();

		// Registered model catalogs: Name → { Name, RootPath,
		// ManifestFilename, ModelKeyResolver }
		this._modelCatalogs = new Map();

		// Cached available-models scan: ModelKey → { ModelKey, ModelName,
		// ModelSourceDir, CatalogName, Manifest, Hash, BytesOnDisk }
		this._availableModels = new Map();
		this._availableModelsLastScan = 0;
	}

	// ── Service refs ────────────────────────────────────────────

	_coordinator()
	{
		let tmpMap = this.fable && this.fable.servicesMap
			&& this.fable.servicesMap['UltravisorBeaconCoordinator'];
		return tmpMap ? Object.values(tmpMap)[0] : null;
	}

	_fleetStore()
	{
		let tmpMap = this.fable && this.fable.servicesMap
			&& this.fable.servicesMap['UltravisorBeaconFleetStore'];
		return tmpMap ? Object.values(tmpMap)[0] : null;
	}

	_distributor()
	{
		let tmpMap = this.fable && this.fable.servicesMap
			&& this.fable.servicesMap['UltravisorDirectoryDistributor'];
		return tmpMap ? Object.values(tmpMap)[0] : null;
	}

	// ── App-side registration API ───────────────────────────────

	/**
	 * Register a runtime source. retold-labs calls this at boot for
	 * the pipeline-workers directory.
	 *
	 * @param {object} pConfig
	 *   - Name              (required) e.g. 'pipeline-workers'
	 *   - SourceDir         (required) absolute path on hub disk
	 *   - PushAction        (required) LWM action name for chunks
	 *   - FinalizeAction    (required) LWM action name for finalize
	 *   - ExpectedHashKey   (optional) finalize Settings key for hash
	 *                                  (default 'ExpectedRuntimeHash')
	 *   - AutoPushOnConnect (optional) bool, default true
	 *   - CapabilityFilter  (optional) Set<string> — only auto-push to
	 *                                  beacons advertising at least one
	 *                                  of these capabilities. Default:
	 *                                  ['LabsWorkerManagement'] so we
	 *                                  don't push retold-labs' runtime
	 *                                  to beacons that aren't labs
	 *                                  workers. Pass an empty Set to
	 *                                  push to every beacon.
	 *   - IgnoreBasenames   (optional) extra skip names
	 *   - ChunkBytes        (optional) chunk size override
	 */
	registerRuntime(pConfig)
	{
		if (!pConfig || !pConfig.Name || !pConfig.SourceDir
			|| !pConfig.PushAction || !pConfig.FinalizeAction)
		{
			throw new Error('registerRuntime: Name, SourceDir, PushAction, FinalizeAction required');
		}
		let tmpEntry = {
			Name: pConfig.Name,
			SourceDir: pConfig.SourceDir,
			PushAction: pConfig.PushAction,
			FinalizeAction: pConfig.FinalizeAction,
			ExpectedHashKey: pConfig.ExpectedHashKey || 'ExpectedRuntimeHash',
			AutoPushOnConnect: pConfig.AutoPushOnConnect !== false,
			CapabilityFilter: pConfig.CapabilityFilter
				|| new Set(['LabsWorkerManagement']),
			IgnoreBasenames: pConfig.IgnoreBasenames || new Set(),
			ChunkBytes: pConfig.ChunkBytes
		};
		this._runtimes.set(tmpEntry.Name, tmpEntry);
		this.log.info(
			`FleetManager: registered runtime '${tmpEntry.Name}' from ${tmpEntry.SourceDir} `
			+ `(auto-push-on-connect=${tmpEntry.AutoPushOnConnect})`);
		return tmpEntry;
	}

	/**
	 * Register a model catalog. retold-labs calls this at boot pointing
	 * at /Users/steven/Code/models or whatever the operator's models
	 * root is. The manager scans it lazily for available-model lists.
	 *
	 * @param {object} pConfig
	 *   - Name             (required) e.g. 'retold-labs-models'
	 *   - RootPath         (required) absolute path on hub disk
	 *   - ManifestFilename (optional) file marking a model dir
	 *                                 (default 'model.json')
	 *   - PushAction       (required) LWM action used to push a model
	 *                                 (e.g. 'LWM_PushModel')
	 *   - FinalizeAction   (required) LWM action used to finalize
	 *   - ExpectedHashKey  (optional) finalize Settings key for hash
	 *                                 (default 'ExpectedModelHash')
	 *   - IgnoreBasenames  (optional) extra skip names; defaults
	 *                                 include 'venvs' since venvs are
	 *                                 platform-specific.
	 *   - ModelKeyResolver (optional) function(modelDir) → string;
	 *                                 default = libPath.basename(dir)
	 */
	registerModelCatalog(pConfig)
	{
		if (!pConfig || !pConfig.Name || !pConfig.RootPath
			|| !pConfig.PushAction || !pConfig.FinalizeAction)
		{
			throw new Error('registerModelCatalog: Name, RootPath, PushAction, FinalizeAction required');
		}
		let tmpEntry = {
			Name: pConfig.Name,
			RootPath: pConfig.RootPath,
			ManifestFilename: pConfig.ManifestFilename || 'model.json',
			PushAction: pConfig.PushAction,
			FinalizeAction: pConfig.FinalizeAction,
			ExpectedHashKey: pConfig.ExpectedHashKey || 'ExpectedModelHash',
			IgnoreBasenames: pConfig.IgnoreBasenames || new Set(['venvs']),
			ModelKeyResolver: pConfig.ModelKeyResolver
				|| ((pDir) => libPath.basename(pDir)),
			ChunkBytes: pConfig.ChunkBytes
		};
		this._modelCatalogs.set(tmpEntry.Name, tmpEntry);
		this.log.info(
			`FleetManager: registered model catalog '${tmpEntry.Name}' at ${tmpEntry.RootPath}`);
		// Invalidate cache.
		this._availableModelsLastScan = 0;
		return tmpEntry;
	}

	listRegisteredRuntimes()
	{
		return Array.from(this._runtimes.values()).map(r => ({
			Name: r.Name,
			SourceDir: r.SourceDir,
			AutoPushOnConnect: r.AutoPushOnConnect,
			CapabilityFilter: Array.from(r.CapabilityFilter || [])
		}));
	}

	listRegisteredModelCatalogs()
	{
		return Array.from(this._modelCatalogs.values()).map(c => ({
			Name: c.Name,
			RootPath: c.RootPath
		}));
	}

	// ── Available-model catalog scan ─────────────────────────────

	/**
	 * Walk every registered model catalog, find every directory with a
	 * matching manifest file, and produce the global available-models
	 * map keyed by ModelKey. Cached for `pCacheMs` ms (default 30s).
	 */
	scanAvailableModels(pCacheMs)
	{
		let tmpCacheMs = (pCacheMs == null) ? 30_000 : pCacheMs;
		let tmpNow = Date.now();
		if (this._availableModels.size > 0
			&& (tmpNow - this._availableModelsLastScan) < tmpCacheMs)
		{
			return this._availableModels;
		}

		let tmpMap = new Map();
		for (let tmpCatalog of this._modelCatalogs.values())
		{
			if (!libFs.existsSync(tmpCatalog.RootPath)) continue;
			this._walkCatalog(tmpCatalog, tmpCatalog.RootPath, tmpMap);
		}
		this._availableModels = tmpMap;
		this._availableModelsLastScan = tmpNow;
		this.log.info(`FleetManager: scanned ${tmpMap.size} available model(s) across `
			+ `${this._modelCatalogs.size} catalog(s).`);
		return tmpMap;
	}

	_walkCatalog(pCatalog, pDir, pInto)
	{
		let tmpEntries;
		try { tmpEntries = libFs.readdirSync(pDir); }
		catch (e) { return; }

		// Stop recursing once we've found a manifest in this dir.
		if (tmpEntries.indexOf(pCatalog.ManifestFilename) >= 0)
		{
			let tmpManifestPath = libPath.join(pDir, pCatalog.ManifestFilename);
			let tmpManifest = null;
			try { tmpManifest = JSON.parse(libFs.readFileSync(tmpManifestPath, 'utf8')); }
			catch (e)
			{
				this.log.warn(
					`FleetManager: failed to parse manifest ${tmpManifestPath}: ${e.message}`);
				return;
			}
			let tmpModelKey = pCatalog.ModelKeyResolver(pDir);
			if (!tmpModelKey) return;
			pInto.set(tmpModelKey, {
				ModelKey: tmpModelKey,
				ModelName: tmpManifest.Name || tmpModelKey,
				DisplayName: tmpManifest.DisplayName || tmpManifest.Name || tmpModelKey,
				ModelSourceDir: pDir,
				ManifestFilename: pCatalog.ManifestFilename,
				CatalogName: pCatalog.Name,
				Manifest: tmpManifest,
				PushAction: pCatalog.PushAction,
				FinalizeAction: pCatalog.FinalizeAction,
				ExpectedHashKey: pCatalog.ExpectedHashKey,
				IgnoreBasenames: pCatalog.IgnoreBasenames,
				ChunkBytes: pCatalog.ChunkBytes
			});
			return;
		}

		for (let tmpEntry of tmpEntries)
		{
			if (tmpEntry.startsWith('.') || tmpEntry === 'node_modules'
				|| tmpEntry === '__pycache__' || tmpEntry === 'venvs') continue;
			let tmpFull = libPath.join(pDir, tmpEntry);
			let tmpStat;
			try { tmpStat = libFs.statSync(tmpFull); } catch (e) { continue; }
			if (tmpStat.isDirectory())
			{
				this._walkCatalog(pCatalog, tmpFull, pInto);
			}
		}
	}

	getAvailableModel(pModelKey)
	{
		this.scanAvailableModels();
		return this._availableModels.get(pModelKey) || null;
	}

	// ── Beacon lifecycle hooks ───────────────────────────────────

	/**
	 * Call this from the BeaconCoordinator on registerBeacon().
	 *
	 * @param {string} pBeaconID
	 */
	onBeaconConnected(pBeaconID)
	{
		let tmpCoordinator = this._coordinator();
		if (!tmpCoordinator) return;
		let tmpBeacon = tmpCoordinator.getBeacon ? tmpCoordinator.getBeacon(pBeaconID) : null;
		if (!tmpBeacon)
		{
			// Some coordinator implementations expose _Beacons; fall back.
			tmpBeacon = (tmpCoordinator._Beacons || {})[pBeaconID] || null;
		}
		if (!tmpBeacon) return;

		this.log.info(
			`FleetManager: beacon connected ${tmpBeacon.Name || pBeaconID} `
			+ `(caps: ${(tmpBeacon.Capabilities || []).join(', ') || 'none'})`);

		// Fire-and-forget runtime auto-push for any matching registration.
		// Each runtime push happens in its own promise chain so they don't
		// block one another.
		for (let tmpRuntime of this._runtimes.values())
		{
			if (!tmpRuntime.AutoPushOnConnect) continue;
			if (!this._beaconMatchesCapabilityFilter(tmpBeacon, tmpRuntime.CapabilityFilter))
			{
				continue;
			}
			this._autoPushRuntimeToBeacon(tmpBeacon, tmpRuntime).catch((pErr) =>
			{
				this.log.warn(
					`FleetManager: runtime auto-push '${tmpRuntime.Name}' → `
					+ `${tmpBeacon.Name || pBeaconID} threw: ${pErr.message}`);
			});
		}

		// Auto-discover models the beacon already has via LWM_Inventory.
		this._discoverInstalledModelsOnBeacon(tmpBeacon).catch((pErr) =>
		{
			this.log.warn(
				`FleetManager: model auto-discovery on `
				+ `${tmpBeacon.Name || pBeaconID} threw: ${pErr.message}`);
		});
	}

	_beaconMatchesCapabilityFilter(pBeacon, pFilter)
	{
		if (!pFilter || pFilter.size === 0) return true;
		let tmpCaps = pBeacon.Capabilities || [];
		for (let tmpCap of tmpCaps)
		{
			if (pFilter.has(tmpCap)) return true;
		}
		return false;
	}

	async _autoPushRuntimeToBeacon(pBeacon, pRuntime)
	{
		let tmpStore = this._fleetStore();
		let tmpDistributor = this._distributor();
		if (!tmpStore || !tmpDistributor) return;

		// Compute current source hash and check against last-known.
		let tmpScan = tmpDistributor.scan(pRuntime.SourceDir,
			{ IgnoreBasenames: pRuntime.IgnoreBasenames });
		let tmpExisting = tmpStore.getRuntimeInstallation(pBeacon.BeaconID, pRuntime.Name);
		if (tmpExisting && tmpExisting.InstalledRuntimeHash === tmpScan.Hash
			&& tmpExisting.Status === 'installed')
		{
			this.log.info(
				`FleetManager: runtime '${pRuntime.Name}' on ${pBeacon.Name} `
				+ `already at hash ${tmpScan.Hash.slice(0, 12)}; skipping push.`);
			return;
		}

		tmpStore.upsertRuntimeInstallation({
			BeaconID: pBeacon.BeaconID,
			BeaconName: pBeacon.Name,
			RuntimeName: pRuntime.Name,
			ExpectedRuntimeHash: tmpScan.Hash,
			Status: 'pushing'
		});
		this.log.info(
			`FleetManager: pushing runtime '${pRuntime.Name}' to ${pBeacon.Name} `
			+ `(${tmpScan.FileCount} files, ${tmpScan.TotalBytes} B, hash ${tmpScan.Hash.slice(0, 12)})`);

		try
		{
			let tmpResult = await tmpDistributor.pushDirectoryToTarget(
				{
					SourceDir: pRuntime.SourceDir,
					PushAction: pRuntime.PushAction,
					FinalizeAction: pRuntime.FinalizeAction,
					ExpectedHashKey: pRuntime.ExpectedHashKey,
					IgnoreBasenames: pRuntime.IgnoreBasenames
				},
				this._buildDispatcher(pBeacon.BeaconID));
			if (tmpResult.Status === 'Success')
			{
				tmpStore.updateRuntimeInstallationStatus(
					pBeacon.BeaconID, pRuntime.Name, 'installed',
					{
						InstalledRuntimeHash: tmpResult.TreeHash,
						InstalledAt: new Date().toISOString(),
						LastError: null
					});
				this.log.info(
					`FleetManager: runtime '${pRuntime.Name}' → ${pBeacon.Name} `
					+ `installed (${tmpResult.FilesPushed} files, ${tmpResult.DurationMs}ms).`);
			}
			else
			{
				tmpStore.updateRuntimeInstallationStatus(
					pBeacon.BeaconID, pRuntime.Name, 'error',
					{ LastError: tmpResult.Error || 'unknown' });
				this.log.warn(
					`FleetManager: runtime '${pRuntime.Name}' → ${pBeacon.Name} `
					+ `failed: ${tmpResult.Error}`);
			}
		}
		catch (pErr)
		{
			tmpStore.updateRuntimeInstallationStatus(
				pBeacon.BeaconID, pRuntime.Name, 'error',
				{ LastError: pErr.message });
			throw pErr;
		}
	}

	async _discoverInstalledModelsOnBeacon(pBeacon)
	{
		// Skip if the beacon doesn't advertise LabsWorkerManagement —
		// only labs-worker beacons have an LWM_Inventory action.
		if (!(pBeacon.Capabilities || []).includes('LabsWorkerManagement'))
		{
			return;
		}

		let tmpDispatcher = this._buildDispatcher(pBeacon.BeaconID);
		let tmpResp;
		try { tmpResp = await tmpDispatcher('LWM_Inventory', {}); }
		catch (pErr)
		{
			this.log.warn(
				`FleetManager: LWM_Inventory on ${pBeacon.Name} failed: ${pErr.message}`);
			return;
		}

		let tmpOutputs = (tmpResp && tmpResp.Outputs) || {};
		let tmpModels = tmpOutputs.Models || [];
		if (!Array.isArray(tmpModels) || tmpModels.length === 0) return;

		let tmpStore = this._fleetStore();
		if (!tmpStore) return;

		for (let tmpModel of tmpModels)
		{
			let tmpKey = libPath.basename(tmpModel.ModelPath || '');
			if (!tmpKey) continue;
			let tmpExisting = tmpStore.getModelInstallation(pBeacon.BeaconID, tmpKey);
			if (tmpExisting) continue;  // operator-managed; don't clobber
			tmpStore.upsertModelInstallation({
				BeaconID: pBeacon.BeaconID,
				BeaconName: pBeacon.Name,
				ModelKey: tmpKey,
				ModelName: tmpModel.DisplayName || tmpModel.Name || tmpKey,
				ModelSourceDir: tmpModel.ModelPath || '',
				Status: 'installed',
				EnabledForDispatch: true,  // discovered models are enabled by default
				InstalledBytes: tmpModel.BytesOnDisk || 0,
				InstalledTreeHash: '',     // unknown — never pushed via fleet
				InstalledAt: new Date().toISOString(),
				Source: 'discovered'
			});
		}
		this.log.info(
			`FleetManager: discovered ${tmpModels.length} pre-existing model(s) on ${pBeacon.Name}.`);
	}

	// ── Operator actions ─────────────────────────────────────────

	/**
	 * Install a model on a beacon.
	 *
	 * @param {string} pBeaconID
	 * @param {string} pModelKey
	 * @param {object} [pOptions]
	 *   - EnableAfterInstall  bool, default false (separate operator step)
	 * @returns Promise<installation row>
	 */
	async installModel(pBeaconID, pModelKey, pOptions)
	{
		let tmpOptions = pOptions || {};
		let tmpStore = this._fleetStore();
		let tmpCoordinator = this._coordinator();
		let tmpDistributor = this._distributor();
		if (!tmpStore || !tmpCoordinator || !tmpDistributor)
		{
			throw new Error('installModel: required services not available');
		}

		let tmpBeacon = (tmpCoordinator._Beacons || {})[pBeaconID];
		if (!tmpBeacon)
		{
			throw new Error(`installModel: beacon '${pBeaconID}' not registered`);
		}

		let tmpAvail = this.getAvailableModel(pModelKey);
		if (!tmpAvail)
		{
			throw new Error(`installModel: model '${pModelKey}' not in any registered catalog`);
		}

		// Preflight scan to capture totals.
		let tmpScan = tmpDistributor.scan(tmpAvail.ModelSourceDir,
			{ IgnoreBasenames: tmpAvail.IgnoreBasenames });

		tmpStore.upsertModelInstallation({
			BeaconID: pBeaconID,
			BeaconName: tmpBeacon.Name,
			ModelKey: pModelKey,
			ModelName: tmpAvail.ModelName,
			ModelSourceDir: tmpAvail.ModelSourceDir,
			ExpectedTreeHash: tmpScan.Hash,
			PushTotalBytes: tmpScan.TotalBytes,
			PushProgressBytes: 0,
			Status: 'installing',
			Source: 'operator'
		});

		this.log.info(
			`FleetManager: installing '${pModelKey}' (${tmpScan.FileCount} files, `
			+ `${tmpScan.TotalBytes} B) on ${tmpBeacon.Name}.`);

		try
		{
			let tmpResult = await tmpDistributor.pushDirectoryToTarget(
				{
					SourceDir: tmpAvail.ModelSourceDir,
					PushAction: tmpAvail.PushAction,
					FinalizeAction: tmpAvail.FinalizeAction,
					ExpectedHashKey: tmpAvail.ExpectedHashKey,
					DestPathPrefix: pModelKey,
					IgnoreBasenames: tmpAvail.IgnoreBasenames,
					FinalizeExtras: { ModelKey: pModelKey, ModelName: tmpAvail.ModelName }
				},
				this._buildDispatcher(pBeaconID),
				(pProg) =>
				{
					// Persist progress periodically (cheap; better-sqlite3
					// is sync; OK to write per-chunk).
					tmpStore.upsertModelInstallation({
						BeaconID: pBeaconID,
						ModelKey: pModelKey,
						PushProgressBytes: pProg.BytesPushed
					});
				});

			if (tmpResult.Status === 'Success')
			{
				let tmpUpdates = {
					InstalledTreeHash: tmpResult.TreeHash,
					InstalledBytes: tmpResult.BytesPushed,
					PushProgressBytes: tmpResult.BytesPushed,
					InstalledAt: new Date().toISOString(),
					LastError: null
				};
				if (tmpOptions.EnableAfterInstall)
				{
					tmpUpdates.EnabledForDispatch = true;
				}
				tmpStore.updateModelInstallationStatus(
					pBeaconID, pModelKey, 'installed', tmpUpdates);
				this.log.info(
					`FleetManager: '${pModelKey}' installed on ${tmpBeacon.Name} `
					+ `(${tmpResult.DurationMs}ms).`);
			}
			else
			{
				tmpStore.updateModelInstallationStatus(
					pBeaconID, pModelKey, 'error',
					{ LastError: tmpResult.Error || 'unknown' });
			}
			return tmpStore.getModelInstallation(pBeaconID, pModelKey);
		}
		catch (pErr)
		{
			tmpStore.updateModelInstallationStatus(
				pBeaconID, pModelKey, 'error',
				{ LastError: pErr.message });
			throw pErr;
		}
	}

	async uninstallModel(pBeaconID, pModelKey)
	{
		let tmpStore = this._fleetStore();
		let tmpCoordinator = this._coordinator();
		if (!tmpStore || !tmpCoordinator)
		{
			throw new Error('uninstallModel: required services not available');
		}
		tmpStore.updateModelInstallationStatus(pBeaconID, pModelKey, 'uninstalling');
		try
		{
			let tmpDispatcher = this._buildDispatcher(pBeaconID);
			let tmpResp = await tmpDispatcher('LWM_DeleteModel',
				{ ModelKey: pModelKey });
			let tmpOk = !tmpResp || !tmpResp.Outputs || !tmpResp.Outputs.ExitCode
				|| tmpResp.Outputs.Status === 'Success';
			if (tmpOk)
			{
				tmpStore.deleteModelInstallation(pBeaconID, pModelKey);
				this.log.info(
					`FleetManager: '${pModelKey}' uninstalled from beacon ${pBeaconID}.`);
				return { Status: 'Success' };
			}
			let tmpErr = (tmpResp && tmpResp.Outputs && tmpResp.Outputs.Error) || 'unknown';
			tmpStore.updateModelInstallationStatus(pBeaconID, pModelKey, 'error',
				{ LastError: tmpErr });
			return { Status: 'Error', Error: tmpErr };
		}
		catch (pErr)
		{
			tmpStore.updateModelInstallationStatus(pBeaconID, pModelKey, 'error',
				{ LastError: pErr.message });
			throw pErr;
		}
	}

	enableModel(pBeaconID, pModelKey)
	{
		let tmpStore = this._fleetStore();
		if (!tmpStore) throw new Error('enableModel: FleetStore unavailable');
		this.log.info(`FleetManager: enabling '${pModelKey}' on beacon ${pBeaconID}.`);
		return tmpStore.setModelEnabled(pBeaconID, pModelKey, true);
	}

	disableModel(pBeaconID, pModelKey)
	{
		let tmpStore = this._fleetStore();
		if (!tmpStore) throw new Error('disableModel: FleetStore unavailable');
		this.log.info(`FleetManager: disabling '${pModelKey}' on beacon ${pBeaconID}.`);
		return tmpStore.setModelEnabled(pBeaconID, pModelKey, false);
	}

	// ── Read API for the fleet UI ───────────────────────────────

	/**
	 * Returns the full beacons × models grid the operator UI consumes.
	 */
	getFleetSnapshot()
	{
		let tmpStore = this._fleetStore();
		let tmpCoordinator = this._coordinator();
		this.scanAvailableModels();

		let tmpBeacons = [];
		if (tmpCoordinator && tmpCoordinator._Beacons)
		{
			for (let tmpBcn of Object.values(tmpCoordinator._Beacons))
			{
				tmpBeacons.push({
					BeaconID: tmpBcn.BeaconID,
					Name: tmpBcn.Name,
					Status: tmpBcn.Status,
					LastHeartbeat: tmpBcn.LastHeartbeat,
					Capabilities: tmpBcn.Capabilities || [],
					HostID: tmpBcn.HostID
				});
			}
		}

		let tmpAvailableModels = [];
		for (let tmpM of this._availableModels.values())
		{
			tmpAvailableModels.push({
				ModelKey: tmpM.ModelKey,
				ModelName: tmpM.ModelName,
				DisplayName: tmpM.DisplayName,
				CatalogName: tmpM.CatalogName,
				ModelSourceDir: tmpM.ModelSourceDir
			});
		}

		let tmpInstallations = tmpStore ? tmpStore.listModelInstallations() : [];
		let tmpRuntimes = tmpStore ? tmpStore.listRuntimeInstallations() : [];

		return {
			Beacons: tmpBeacons,
			AvailableModels: tmpAvailableModels,
			ModelInstallations: tmpInstallations,
			RuntimeInstallations: tmpRuntimes,
			RegisteredRuntimes: this.listRegisteredRuntimes(),
			RegisteredCatalogs: this.listRegisteredModelCatalogs()
		};
	}

	// ── Dispatch filter ──────────────────────────────────────────

	/**
	 * Called by the BeaconCoordinator's pollForWork to gate work-item
	 * routing on the (BeaconID, model) installation state.
	 *
	 * Returns an OBJECT for explainability:
	 *   { Allowed: true|false, Reason: string|null, MatchedModelKey: string|null }
	 *
	 * Logic:
	 *   - System actions (no model-bound Capability): always allowed
	 *   - Settings.model_path or Settings.ModelKey identifies a model:
	 *       gate on isModelEnabledOn(beaconID, modelKey)
	 *   - No model identifiable + model-bound capability: allowed
	 *     (best-effort; the worker will fail at dispatch if it doesn't
	 *     have the model)
	 */
	checkDispatchAllowed(pBeaconID, pWorkItem)
	{
		// LabsWorkerManagement actions are always allowed — they're how
		// the hub talks to the worker (push, finalize, inventory).
		if (pWorkItem && pWorkItem.Capability === 'LabsWorkerManagement')
		{
			return { Allowed: true, Reason: null, MatchedModelKey: null };
		}

		// Make sure the available-models cache is hot before extraction
		// (otherwise the prefix match against ModelSourceDir comes up empty).
		this.scanAvailableModels();

		let tmpModelKey = this._extractModelKey(pWorkItem);
		if (this.log)
		{
			let tmpModelPath = (pWorkItem && pWorkItem.Settings && (pWorkItem.Settings.model_path || pWorkItem.Settings.ModelPath || pWorkItem.Settings.weights_path)) || '';
			this.log.info(
				`FleetManager: checkDispatchAllowed beacon=${pBeaconID} `
				+ `cap=${pWorkItem && pWorkItem.Capability} modelKey=${tmpModelKey || '(none)'} `
				+ `model_path=${tmpModelPath.slice(0, 80)}`);
		}
		if (!tmpModelKey)
		{
			return { Allowed: true, Reason: null, MatchedModelKey: null };
		}

		let tmpStore = this._fleetStore();
		if (!tmpStore || !tmpStore.isEnabled())
		{
			// Fleet store offline — fall open. The dispatch will work
			// or fail on the worker side as it always has.
			return { Allowed: true, Reason: 'fleet-store-offline', MatchedModelKey: tmpModelKey };
		}

		let tmpEnabled = tmpStore.isModelEnabledOn(pBeaconID, tmpModelKey);
		if (tmpEnabled)
		{
			return { Allowed: true, Reason: null, MatchedModelKey: tmpModelKey };
		}
		let tmpInst = tmpStore.getModelInstallation(pBeaconID, tmpModelKey);
		let tmpReason;
		if (!tmpInst) tmpReason = 'not-installed';
		else if (tmpInst.Status !== 'installed') tmpReason = `status=${tmpInst.Status}`;
		else tmpReason = 'disabled';
		return { Allowed: false, Reason: tmpReason, MatchedModelKey: tmpModelKey };
	}

	_extractModelKey(pWorkItem)
	{
		if (!pWorkItem) return null;
		let tmpSettings = pWorkItem.Settings || {};
		// Explicit ModelKey wins.
		if (tmpSettings.ModelKey) return tmpSettings.ModelKey;
		if (tmpSettings.model_key) return tmpSettings.model_key;
		// Otherwise look up by ModelSourceDir prefix-match against installed
		// models OR by basename heuristic on model_path.
		let tmpModelPath = tmpSettings.model_path
			|| tmpSettings.ModelPath
			|| tmpSettings.weights_path;
		if (!tmpModelPath) return null;
		// Try to match against any registered model's source dir.
		for (let tmpAvail of (this._availableModels || new Map()).values())
		{
			if (tmpModelPath.indexOf(tmpAvail.ModelSourceDir) === 0)
			{
				return tmpAvail.ModelKey;
			}
		}
		// Heuristic fallback: the segment immediately under the catalog
		// root. Walk catalogs.
		for (let tmpCatalog of this._modelCatalogs.values())
		{
			let tmpRoot = tmpCatalog.RootPath;
			if (tmpModelPath.indexOf(tmpRoot) === 0)
			{
				let tmpRel = tmpModelPath.substring(tmpRoot.length).replace(/^[\/\\]+/, '');
				let tmpFirst = tmpRel.split(/[\/\\]/)[0];
				let tmpSecond = tmpRel.split(/[\/\\]/)[1];
				// Catalog roots are commonly category dirs (e.g.
				// 'video-pipeline/wan22-i2v-14b-diffusers/...'); the model
				// dir is at depth 1 under root. If the catalog uses
				// flat layout, use depth-0.
				return tmpSecond || tmpFirst || null;
			}
		}
		return null;
	}

	// ── Dispatcher composition ──────────────────────────────────

	/**
	 * Build a `pDispatch(actionName, settings) -> Promise<response>`
	 * function bound to a specific beacon.
	 *
	 * Routing trick: we pre-create an affinity binding (`fleet-push-<beaconID>`)
	 * so the FIRST chunk + every subsequent chunk + the finalize all
	 * route to the intended beacon, never to some other beacon that
	 * happens to advertise LabsWorkerManagement. The coordinator's
	 * enqueueWorkItem (line ~1014) checks `_AffinityBindings` before
	 * normal capability-match routing, so a pre-existing binding wins.
	 */
	_buildDispatcher(pBeaconID)
	{
		let tmpCoordinator = this._coordinator();
		let tmpAffinityKey = `fleet-push-${pBeaconID}`;

		if (tmpCoordinator && tmpCoordinator._AffinityBindings)
		{
			let tmpExpiresAt = new Date(Date.now() + 3_600_000).toISOString();
			tmpCoordinator._AffinityBindings[tmpAffinityKey] =
			{
				AffinityKey: tmpAffinityKey,
				BeaconID: pBeaconID,
				ExpiresAt: tmpExpiresAt,
				CreatedAt: new Date().toISOString()
			};
		}

		return (pAction, pSettings) =>
		{
			return new Promise((resolve, reject) =>
			{
				if (!tmpCoordinator || typeof tmpCoordinator.dispatchAndWait !== 'function')
				{
					return reject(new Error('FleetManager: coordinator.dispatchAndWait unavailable'));
				}
				tmpCoordinator.dispatchAndWait(
					{
						Capability: 'LabsWorkerManagement',
						Action: pAction,
						Settings: pSettings,
						AffinityKey: tmpAffinityKey,
						TimeoutMs: 600_000  // 10 min per chunk dispatch ceiling
					},
					(pErr, pResult) =>
					{
						if (pErr) return reject(pErr);
						resolve(pResult || {});
					});
			});
		};
	}
}

module.exports = UltravisorFleetManager;
