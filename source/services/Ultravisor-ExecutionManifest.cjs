const libPictService = require('pict-serviceproviderbase');
const libFS = require('fs');
const libPath = require('path');

/**
 * Manages operation execution manifests, staging folders, and run artifacts.
 *
 * Each operation run gets a staging folder containing:
 *   - Manifest JSON (always)
 *   - Task state snapshots (debug mode)
 *   - Operation state snapshot (debug mode)
 *   - Working files (task-created)
 *   - Run log file
 */
class UltravisorExecutionManifest extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.serviceType = 'UltravisorExecutionManifest';

		// In-memory store of recent run contexts keyed by RunHash
		this._Runs = {};

		// Execution event listeners (for WebSocket broadcast, etc.)
		this._ExecutionEventListeners = [];
	}

	/**
	 * Register a listener that will be called on execution events.
	 *
	 * The listener receives (pEventType, pRunHash, pEventData) where
	 * pEventType is one of: 'TaskStart', 'TaskComplete', 'TaskError',
	 * 'ExecutionComplete'.
	 *
	 * @param {function} fListener - The listener function.
	 */
	addExecutionEventListener(fListener)
	{
		if (typeof fListener === 'function')
		{
			this._ExecutionEventListeners.push(fListener);
		}
	}

	/**
	 * Remove a previously registered execution event listener.
	 *
	 * @param {function} fListener - The listener to remove.
	 */
	removeExecutionEventListener(fListener)
	{
		let tmpIndex = this._ExecutionEventListeners.indexOf(fListener);
		if (tmpIndex >= 0)
		{
			this._ExecutionEventListeners.splice(tmpIndex, 1);
		}
	}

	/**
	 * Emit an execution event to all registered listeners.
	 *
	 * @param {string} pEventType - The event type.
	 * @param {string} pRunHash - The execution run hash.
	 * @param {object} pEventData - Event-specific data.
	 */
	_emitExecutionEvent(pEventType, pRunHash, pEventData)
	{
		for (let i = 0; i < this._ExecutionEventListeners.length; i++)
		{
			try
			{
				this._ExecutionEventListeners[i](pEventType, pRunHash, pEventData);
			}
			catch (pError)
			{
				this.log.error(`UltravisorExecutionManifest: execution event listener error: ${pError.message}`);
			}
		}
	}

	/**
	 * Load recent completed manifests from disk into memory.
	 * Called on startup so that the Manifests UI has historical data
	 * across server restarts.
	 *
	 * Scans the staging root for run folders, finds Manifest_*.json
	 * files, parses them, and loads up to pLimit most recent runs
	 * (sorted by StopTime descending).
	 *
	 * @param {number} [pLimit=100] - Maximum number of manifests to load.
	 */
	loadRecentManifests(pLimit)
	{
		let tmpLimit = pLimit || 100;
		let tmpStagingRoot = this.resolveStagingRoot();

		if (!libFS.existsSync(tmpStagingRoot))
		{
			return;
		}

		let tmpEntries;
		try
		{
			tmpEntries = libFS.readdirSync(tmpStagingRoot);
		}
		catch (pError)
		{
			this.log.warn(`UltravisorExecutionManifest: could not read staging root [${tmpStagingRoot}]: ${pError.message}`);
			return;
		}

		// Collect all manifest files with their metadata
		let tmpManifestFiles = [];

		for (let i = 0; i < tmpEntries.length; i++)
		{
			let tmpEntryPath = libPath.resolve(tmpStagingRoot, tmpEntries[i]);

			try
			{
				let tmpStat = libFS.statSync(tmpEntryPath);
				if (!tmpStat.isDirectory())
				{
					continue;
				}
			}
			catch (pError)
			{
				continue;
			}

			// Look for Manifest_*.json in this run folder
			let tmpRunFiles;
			try
			{
				tmpRunFiles = libFS.readdirSync(tmpEntryPath);
			}
			catch (pError)
			{
				continue;
			}

			for (let j = 0; j < tmpRunFiles.length; j++)
			{
				if (tmpRunFiles[j].startsWith('Manifest_') && tmpRunFiles[j].endsWith('.json'))
				{
					let tmpManifestPath = libPath.resolve(tmpEntryPath, tmpRunFiles[j]);
					try
					{
						let tmpFileStat = libFS.statSync(tmpManifestPath);
						tmpManifestFiles.push({
							Path: tmpManifestPath,
							StagingPath: tmpEntryPath,
							ModifiedTime: tmpFileStat.mtimeMs
						});
					}
					catch (pError)
					{
						// Skip unreadable files
					}
				}
			}
		}

		// Sort by modification time descending (most recent first)
		tmpManifestFiles.sort(function (pA, pB) { return pB.ModifiedTime - pA.ModifiedTime; });

		// Load up to the limit
		let tmpLoaded = 0;

		for (let i = 0; i < tmpManifestFiles.length && tmpLoaded < tmpLimit; i++)
		{
			try
			{
				let tmpRawJSON = libFS.readFileSync(tmpManifestFiles[i].Path, 'utf8');
				let tmpManifest = JSON.parse(tmpRawJSON);

				// Skip if this run is already in memory (e.g. currently executing)
				if (this._Runs[tmpManifest.Hash])
				{
					continue;
				}

				// Reconstruct a context-like object from the manifest.
				// Disk-loaded runs are not live — they can't be watched or
				// resumed, so we mark them accordingly.
				let tmpContext = {
					Hash: tmpManifest.Hash,
					OperationHash: tmpManifest.OperationHash,
					OperationName: tmpManifest.OperationName,
					Status: tmpManifest.Status,
					RunMode: tmpManifest.RunMode,
					StagingPath: tmpManifestFiles[i].StagingPath,
					Live: false,

					GlobalState: tmpManifest.GlobalState || {},
					OperationState: tmpManifest.OperationState || {},
					TaskOutputs: tmpManifest.TaskOutputs || {},
					Output: tmpManifest.Output || {},

					PendingEvents: [],
					WaitingTasks: tmpManifest.WaitingTasks || {},

					TaskManifests: tmpManifest.TaskManifests || {},
					EventLog: tmpManifest.EventLog || [],
					Log: tmpManifest.Log || [],
					Errors: tmpManifest.Errors || [],

					StartTime: tmpManifest.StartTime,
					StopTime: tmpManifest.StopTime,
					ElapsedMs: tmpManifest.ElapsedMs,
					TimingSummary: tmpManifest.TimingSummary || null
				};

				this._Runs[tmpContext.Hash] = tmpContext;
				tmpLoaded++;
			}
			catch (pError)
			{
				this.log.warn(`UltravisorExecutionManifest: failed to load manifest [${tmpManifestFiles[i].Path}]: ${pError.message}`);
			}
		}

		if (tmpLoaded > 0)
		{
			this.log.info(`UltravisorExecutionManifest: loaded ${tmpLoaded} recent manifest(s) from disk.`);
		}
	}

	/**
	 * Resolve the base staging root folder.
	 *
	 * @returns {string} Absolute path to the staging root.
	 */
	resolveStagingRoot()
	{
		return (this.fable && this.fable.ProgramConfiguration && this.fable.ProgramConfiguration.UltravisorStagingRoot)
			|| libPath.resolve(process.cwd(), 'dist', 'ultravisor_staging');
	}

	/**
	 * Generate a timestamp suffix for unique folder naming.
	 *
	 * @returns {string} Formatted as YYYY-MM-DD-HH-MM-SS-MS_SALT.
	 */
	generateTimestamp()
	{
		let tmpNow = new Date();
		let tmpYear = tmpNow.getFullYear();
		let tmpMonth = String(tmpNow.getMonth() + 1).padStart(2, '0');
		let tmpDay = String(tmpNow.getDate()).padStart(2, '0');
		let tmpHours = String(tmpNow.getHours()).padStart(2, '0');
		let tmpMinutes = String(tmpNow.getMinutes()).padStart(2, '0');
		let tmpSeconds = String(tmpNow.getSeconds()).padStart(2, '0');
		let tmpMilliseconds = String(tmpNow.getMilliseconds()).padStart(3, '0');
		let tmpSalt = String(Math.floor(Math.random() * 100)).padStart(2, '0');

		return `${tmpYear}-${tmpMonth}-${tmpDay}-${tmpHours}-${tmpMinutes}-${tmpSeconds}-${tmpMilliseconds}_${tmpSalt}`;
	}

	/**
	 * Create a staging folder and execution context for a new operation run.
	 *
	 * @param {object} pOperationDefinition - The operation definition.
	 * @param {string} [pRunMode] - 'production' | 'standard' | 'debug'. Defaults to 'standard'.
	 * @returns {object} The new execution context.
	 */
	createExecutionContext(pOperationDefinition, pRunMode)
	{
		let tmpTimestamp = this.generateTimestamp();
		let tmpRunHash = `run-${pOperationDefinition.Hash}-${Date.now()}`;
		let tmpRunMode = pRunMode || 'standard';

		// Create staging folder
		let tmpStagingRoot = this.resolveStagingRoot();
		let tmpStagingPath = libPath.resolve(tmpStagingRoot, `${pOperationDefinition.Hash}-${tmpTimestamp}`);

		try
		{
			if (!libFS.existsSync(tmpStagingPath))
			{
				libFS.mkdirSync(tmpStagingPath, { recursive: true });
			}
		}
		catch (pError)
		{
			this.log.error(`UltravisorExecutionManifest: failed to create staging folder [${tmpStagingPath}]: ${pError.message}`);
		}

		let tmpContext = {
			Hash: tmpRunHash,
			OperationHash: pOperationDefinition.Hash,
			OperationName: pOperationDefinition.Name || pOperationDefinition.Hash,
			Status: 'Pending',
			RunMode: tmpRunMode,
			StagingPath: tmpStagingPath,
			Live: true,

			GlobalState: {},
			OperationState: {},
			TaskOutputs: {},
			Output: {},

			PendingEvents: [],
			WaitingTasks: {},

			TaskManifests: {},
			EventLog: [],
			Log: [],
			Errors: [],

			StartTime: null,
			StopTime: null,
			ElapsedMs: null,
			TimingSummary: null
		};

		// Store in memory
		this._Runs[tmpRunHash] = tmpContext;

		return tmpContext;
	}

	/**
	 * Record a task execution start in the manifest.
	 *
	 * @param {object} pExecutionContext - The execution context.
	 * @param {string} pNodeHash - The task node hash.
	 * @param {string} pEventName - The triggering event name.
	 * @param {object} [pTaskMeta] - Optional task type metadata (DefinitionHash, TaskTypeName, Category, Capability, Action, Tier).
	 */
	recordTaskStart(pExecutionContext, pNodeHash, pEventName, pTaskMeta)
	{
		let tmpMeta = pTaskMeta || {};

		if (!pExecutionContext.TaskManifests[pNodeHash])
		{
			pExecutionContext.TaskManifests[pNodeHash] = {
				NodeHash: pNodeHash,
				DefinitionHash: tmpMeta.DefinitionHash || '',
				TaskTypeName: tmpMeta.TaskTypeName || '',
				Category: tmpMeta.Category || '',
				Capability: tmpMeta.Capability || '',
				Action: tmpMeta.Action || '',
				Tier: tmpMeta.Tier || '',
				Executions: []
			};
		}
		else if (tmpMeta.DefinitionHash)
		{
			// Update metadata if not already set (e.g. first execution set it)
			if (!pExecutionContext.TaskManifests[pNodeHash].DefinitionHash)
			{
				pExecutionContext.TaskManifests[pNodeHash].DefinitionHash = tmpMeta.DefinitionHash;
			}
			if (!pExecutionContext.TaskManifests[pNodeHash].TaskTypeName)
			{
				pExecutionContext.TaskManifests[pNodeHash].TaskTypeName = tmpMeta.TaskTypeName || '';
			}
			if (!pExecutionContext.TaskManifests[pNodeHash].Category)
			{
				pExecutionContext.TaskManifests[pNodeHash].Category = tmpMeta.Category || '';
			}
			if (!pExecutionContext.TaskManifests[pNodeHash].Capability)
			{
				pExecutionContext.TaskManifests[pNodeHash].Capability = tmpMeta.Capability || '';
			}
			if (!pExecutionContext.TaskManifests[pNodeHash].Action)
			{
				pExecutionContext.TaskManifests[pNodeHash].Action = tmpMeta.Action || '';
			}
			if (!pExecutionContext.TaskManifests[pNodeHash].Tier)
			{
				pExecutionContext.TaskManifests[pNodeHash].Tier = tmpMeta.Tier || '';
			}
		}

		pExecutionContext.TaskManifests[pNodeHash].Executions.push({
			TriggerEvent: pEventName,
			StartTime: new Date().toISOString(),
			StartTimeMs: Date.now(),
			StopTime: null,
			StopTimeMs: null,
			ElapsedMs: null,
			Status: 'Running',
			Log: []
		});

		this._emitExecutionEvent('TaskStart', pExecutionContext.Hash,
		{
			NodeHash: pNodeHash,
			DefinitionHash: tmpMeta.DefinitionHash || '',
			TaskTypeName: tmpMeta.TaskTypeName || '',
			Status: 'Running'
		});
	}

	/**
	 * Record a task execution completion in the manifest.
	 *
	 * @param {object} pExecutionContext - The execution context.
	 * @param {string} pNodeHash - The task node hash.
	 * @param {object} pResult - The task result (EventToFire, Outputs, Log).
	 */
	recordTaskComplete(pExecutionContext, pNodeHash, pResult)
	{
		let tmpTaskManifest = pExecutionContext.TaskManifests[pNodeHash];
		if (!tmpTaskManifest || tmpTaskManifest.Executions.length === 0)
		{
			return;
		}

		let tmpExecution = tmpTaskManifest.Executions[tmpTaskManifest.Executions.length - 1];
		tmpExecution.StopTime = new Date().toISOString();
		tmpExecution.StopTimeMs = Date.now();
		tmpExecution.ElapsedMs = (tmpExecution.StartTimeMs) ? (tmpExecution.StopTimeMs - tmpExecution.StartTimeMs) : 0;
		tmpExecution.Status = 'Complete';
		tmpExecution.EventFired = pResult.EventToFire || '';

		if (Array.isArray(pResult.Log))
		{
			tmpExecution.Log = tmpExecution.Log.concat(pResult.Log);
		}

		this._emitExecutionEvent('TaskComplete', pExecutionContext.Hash,
		{
			NodeHash: pNodeHash,
			Status: 'Complete',
			ElapsedMs: tmpExecution.ElapsedMs,
			EventFired: tmpExecution.EventFired
		});
	}

	/**
	 * Record a task execution error in the manifest.
	 *
	 * @param {object} pExecutionContext - The execution context.
	 * @param {string} pNodeHash - The task node hash.
	 * @param {Error} pError - The error that occurred.
	 */
	recordTaskError(pExecutionContext, pNodeHash, pError)
	{
		let tmpTaskManifest = pExecutionContext.TaskManifests[pNodeHash];
		if (!tmpTaskManifest || tmpTaskManifest.Executions.length === 0)
		{
			return;
		}

		let tmpExecution = tmpTaskManifest.Executions[tmpTaskManifest.Executions.length - 1];
		tmpExecution.StopTime = new Date().toISOString();
		tmpExecution.StopTimeMs = Date.now();
		tmpExecution.ElapsedMs = (tmpExecution.StartTimeMs) ? (tmpExecution.StopTimeMs - tmpExecution.StartTimeMs) : 0;
		tmpExecution.Status = 'Error';
		tmpExecution.Log.push(`[${new Date().toISOString()}] Error: ${pError.message}`);

		pExecutionContext.Errors.push({
			NodeHash: pNodeHash,
			Message: pError.message,
			Timestamp: tmpExecution.StopTime
		});

		this._emitExecutionEvent('TaskError', pExecutionContext.Hash,
		{
			NodeHash: pNodeHash,
			Status: 'Error',
			Message: pError.message
		});
	}

	/**
	 * Record a telemetry event in the EventLog.
	 *
	 * @param {object} pExecutionContext - The execution context.
	 * @param {string} pNodeHash - The task node hash (or null for operation-level events).
	 * @param {string} pEventName - The event name.
	 * @param {string} pMessage - Human-readable description.
	 * @param {number} [pVerbosity] - 0 = normal (default), 1 = verbose, 2 = ultra-verbose.
	 */
	recordEvent(pExecutionContext, pNodeHash, pEventName, pMessage, pVerbosity)
	{
		let tmpVerbosity = (typeof pVerbosity === 'number') ? pVerbosity : 0;

		pExecutionContext.EventLog.push({
			Timestamp: new Date().toISOString(),
			TimestampMs: Date.now(),
			NodeHash: pNodeHash || null,
			EventName: pEventName || '',
			Message: pMessage || '',
			Verbosity: tmpVerbosity
		});
	}

	/**
	 * Finalize the execution context after the operation completes.
	 * Writes manifest, state snapshots, and logs to the staging folder.
	 *
	 * @param {object} pExecutionContext - The execution context.
	 */
	finalizeExecution(pExecutionContext)
	{
		pExecutionContext.StopTime = new Date().toISOString();
		pExecutionContext.ElapsedMs = new Date(pExecutionContext.StopTime).getTime()
			- new Date(pExecutionContext.StartTime).getTime();

		if (pExecutionContext.Errors.length > 0)
		{
			pExecutionContext.Status = 'Error';
		}
		else if (pExecutionContext.Status !== 'WaitingForInput')
		{
			pExecutionContext.Status = 'Complete';
		}

		// Compute timing summary from task manifests
		pExecutionContext.TimingSummary = this._computeTimingSummary(pExecutionContext);

		let tmpStagingPath = pExecutionContext.StagingPath;

		// Always write the manifest
		this._writeManifest(pExecutionContext, tmpStagingPath);

		// Write log file
		this._writeLogFile(pExecutionContext, tmpStagingPath);

		// Debug mode: write state snapshots
		if (pExecutionContext.RunMode === 'debug')
		{
			this._writeStateSnapshots(pExecutionContext, tmpStagingPath);
		}

		// Production mode: clean up working files (but keep manifest and log)
		if (pExecutionContext.RunMode === 'production')
		{
			this._cleanupWorkingFiles(pExecutionContext, tmpStagingPath);
		}

		this.log.info(`UltravisorExecutionManifest: operation [${pExecutionContext.OperationHash}] run [${pExecutionContext.Hash}] ${pExecutionContext.Status} in ${pExecutionContext.ElapsedMs}ms`);

		this._emitExecutionEvent('ExecutionComplete', pExecutionContext.Hash,
		{
			OperationHash: pExecutionContext.OperationHash,
			Status: pExecutionContext.Status,
			ElapsedMs: pExecutionContext.ElapsedMs,
			ErrorCount: pExecutionContext.Errors.length
		});
	}

	/**
	 * Compute a timing summary from the task manifests.
	 *
	 * @param {object} pExecutionContext - The execution context.
	 * @returns {object} TimingSummary with ByCategory, ByCapability, ByTaskType, and Timeline.
	 */
	_computeTimingSummary(pExecutionContext)
	{
		let tmpByCategory = {};
		let tmpByCapability = {};
		let tmpByTaskType = {};
		let tmpTimeline = [];

		let tmpNodeHashes = Object.keys(pExecutionContext.TaskManifests);

		for (let i = 0; i < tmpNodeHashes.length; i++)
		{
			let tmpNodeHash = tmpNodeHashes[i];
			let tmpTaskManifest = pExecutionContext.TaskManifests[tmpNodeHash];
			let tmpDefHash = tmpTaskManifest.DefinitionHash || '';
			let tmpName = tmpTaskManifest.TaskTypeName || tmpDefHash || tmpNodeHash;
			let tmpCategory = tmpTaskManifest.Category || 'Uncategorized';
			let tmpCapability = tmpTaskManifest.Capability || 'Uncategorized';

			for (let j = 0; j < tmpTaskManifest.Executions.length; j++)
			{
				let tmpExec = tmpTaskManifest.Executions[j];
				let tmpElapsed = tmpExec.ElapsedMs || 0;

				// Timeline entry
				tmpTimeline.push({
					NodeHash: tmpNodeHash,
					DefinitionHash: tmpDefHash,
					Name: tmpName,
					Category: tmpCategory,
					Capability: tmpCapability,
					StartTimeMs: tmpExec.StartTimeMs || 0,
					ElapsedMs: tmpElapsed,
					Status: tmpExec.Status || ''
				});

				// Aggregate by category
				if (!tmpByCategory[tmpCategory])
				{
					tmpByCategory[tmpCategory] = { Count: 0, TotalMs: 0, MinMs: Infinity, MaxMs: 0, AvgMs: 0 };
				}
				tmpByCategory[tmpCategory].Count++;
				tmpByCategory[tmpCategory].TotalMs += tmpElapsed;
				if (tmpElapsed < tmpByCategory[tmpCategory].MinMs)
				{
					tmpByCategory[tmpCategory].MinMs = tmpElapsed;
				}
				if (tmpElapsed > tmpByCategory[tmpCategory].MaxMs)
				{
					tmpByCategory[tmpCategory].MaxMs = tmpElapsed;
				}

				// Aggregate by capability
				if (!tmpByCapability[tmpCapability])
				{
					tmpByCapability[tmpCapability] = { Count: 0, TotalMs: 0, MinMs: Infinity, MaxMs: 0, AvgMs: 0 };
				}
				tmpByCapability[tmpCapability].Count++;
				tmpByCapability[tmpCapability].TotalMs += tmpElapsed;
				if (tmpElapsed < tmpByCapability[tmpCapability].MinMs)
				{
					tmpByCapability[tmpCapability].MinMs = tmpElapsed;
				}
				if (tmpElapsed > tmpByCapability[tmpCapability].MaxMs)
				{
					tmpByCapability[tmpCapability].MaxMs = tmpElapsed;
				}

				// Aggregate by task type
				if (tmpDefHash)
				{
					if (!tmpByTaskType[tmpDefHash])
					{
						tmpByTaskType[tmpDefHash] = { Name: tmpName, Category: tmpCategory, Capability: tmpCapability, Count: 0, TotalMs: 0, MinMs: Infinity, MaxMs: 0, AvgMs: 0 };
					}
					tmpByTaskType[tmpDefHash].Count++;
					tmpByTaskType[tmpDefHash].TotalMs += tmpElapsed;
					if (tmpElapsed < tmpByTaskType[tmpDefHash].MinMs)
					{
						tmpByTaskType[tmpDefHash].MinMs = tmpElapsed;
					}
					if (tmpElapsed > tmpByTaskType[tmpDefHash].MaxMs)
					{
						tmpByTaskType[tmpDefHash].MaxMs = tmpElapsed;
					}
				}
			}
		}

		// Compute averages and fix Infinity mins
		let tmpCategoryKeys = Object.keys(tmpByCategory);
		for (let i = 0; i < tmpCategoryKeys.length; i++)
		{
			let tmpCat = tmpByCategory[tmpCategoryKeys[i]];
			tmpCat.AvgMs = (tmpCat.Count > 0) ? (tmpCat.TotalMs / tmpCat.Count) : 0;
			if (tmpCat.MinMs === Infinity)
			{
				tmpCat.MinMs = 0;
			}
		}

		let tmpCapabilityKeys = Object.keys(tmpByCapability);
		for (let i = 0; i < tmpCapabilityKeys.length; i++)
		{
			let tmpCap = tmpByCapability[tmpCapabilityKeys[i]];
			tmpCap.AvgMs = (tmpCap.Count > 0) ? (tmpCap.TotalMs / tmpCap.Count) : 0;
			if (tmpCap.MinMs === Infinity)
			{
				tmpCap.MinMs = 0;
			}
		}

		let tmpTaskTypeKeys = Object.keys(tmpByTaskType);
		for (let i = 0; i < tmpTaskTypeKeys.length; i++)
		{
			let tmpType = tmpByTaskType[tmpTaskTypeKeys[i]];
			tmpType.AvgMs = (tmpType.Count > 0) ? (tmpType.TotalMs / tmpType.Count) : 0;
			if (tmpType.MinMs === Infinity)
			{
				tmpType.MinMs = 0;
			}
		}

		// Sort timeline by start time
		tmpTimeline.sort(function (pA, pB)
		{
			return (pA.StartTimeMs || 0) - (pB.StartTimeMs || 0);
		});

		return {
			ByCategory: tmpByCategory,
			ByCapability: tmpByCapability,
			ByTaskType: tmpByTaskType,
			Timeline: tmpTimeline
		};
	}

	/**
	 * Get an execution context by run hash.
	 *
	 * @param {string} pRunHash - The run hash.
	 * @returns {object|null} The execution context, or null if not found.
	 */
	getRun(pRunHash)
	{
		return this._Runs[pRunHash] || null;
	}

	/**
	 * Wait for a run to reach a terminal state (Complete or Error).
	 *
	 * Polls the run's status at a fixed interval and calls back
	 * when it finishes or the timeout expires.  Used by the sync
	 * Trigger endpoint to block until the operation completes.
	 *
	 * @param {string} pRunHash    - The run hash to wait for
	 * @param {number} pTimeoutMs  - Maximum wait time in milliseconds
	 * @param {function} fCallback - function(pError, pExecutionContext)
	 */
	waitForCompletion(pRunHash, pTimeoutMs, fCallback)
	{
		let tmpSelf = this;
		let tmpStartTime = Date.now();
		let tmpPollMs = 250;

		let tmpInterval = setInterval(() =>
		{
			let tmpRun = tmpSelf._Runs[pRunHash];

			if (!tmpRun)
			{
				clearInterval(tmpInterval);
				return fCallback(new Error('Run not found: ' + pRunHash));
			}

			if (tmpRun.Status === 'Complete' || tmpRun.Status === 'Error')
			{
				clearInterval(tmpInterval);
				return fCallback(null, tmpRun);
			}

			if (Date.now() - tmpStartTime > pTimeoutMs)
			{
				clearInterval(tmpInterval);
				return fCallback(new Error('Trigger timed out after ' + pTimeoutMs + 'ms (run ' + pRunHash + ' status: ' + tmpRun.Status + ')'));
			}
		}, tmpPollMs);

		// Don't keep the process alive just for this timer
		if (tmpInterval.unref)
		{
			tmpInterval.unref();
		}
	}

	/**
	 * List all execution runs.
	 *
	 * @returns {Array} Array of execution context summaries.
	 */
	listRuns()
	{
		let tmpRuns = [];
		let tmpKeys = Object.keys(this._Runs);

		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpRun = this._Runs[tmpKeys[i]];
			let tmpSummary = {
				Hash: tmpRun.Hash,
				OperationHash: tmpRun.OperationHash,
				OperationName: tmpRun.OperationName,
				Status: tmpRun.Status,
				RunMode: tmpRun.RunMode,
				StartTime: tmpRun.StartTime,
				StopTime: tmpRun.StopTime,
				ElapsedMs: tmpRun.ElapsedMs,
				ErrorCount: tmpRun.Errors.length,
				StagingPath: tmpRun.StagingPath,
				Live: tmpRun.Live || false
			};

			// Include WaitingTasks for runs that are waiting, so the UI
			// can render inline awaiting actions without a second API call
			if (tmpRun.Status === 'WaitingForInput' && tmpRun.WaitingTasks)
			{
				tmpSummary.WaitingTasks = tmpRun.WaitingTasks;
			}

			tmpRuns.push(tmpSummary);
		}

		return tmpRuns;
	}

	/**
	 * Abandon a single execution run.
	 * Sets status to 'Abandoned', clears WaitingTasks, persists to disk.
	 *
	 * @param {string} pRunHash - The run hash to abandon.
	 * @returns {object|null} The updated context, or null if not found.
	 */
	abandonRun(pRunHash)
	{
		let tmpContext = this._Runs[pRunHash];
		if (!tmpContext)
		{
			return null;
		}

		// Only abandon non-terminal runs
		if (tmpContext.Status === 'Complete' || tmpContext.Status === 'Abandoned')
		{
			return tmpContext;
		}

		tmpContext.Status = 'Abandoned';
		tmpContext.WaitingTasks = {};
		tmpContext.PendingEvents = [];
		tmpContext.Live = false;
		tmpContext.StopTime = tmpContext.StopTime || new Date().toISOString();

		if (!tmpContext.ElapsedMs && tmpContext.StartTime)
		{
			tmpContext.ElapsedMs = new Date(tmpContext.StopTime).getTime() - new Date(tmpContext.StartTime).getTime();
		}

		tmpContext.Log.push(`[${new Date().toISOString()}] Run abandoned by user.`);

		// Persist the updated status to disk
		if (tmpContext.StagingPath)
		{
			this._writeManifest(tmpContext, tmpContext.StagingPath);
		}

		this.log.info(`UltravisorExecutionManifest: run [${pRunHash}] abandoned.`);
		return tmpContext;
	}

	/**
	 * Abandon all stale runs in impossible states.
	 * Targets: WaitingForInput with no live graph, Running with no live context.
	 *
	 * @returns {number} Count of runs abandoned.
	 */
	abandonStaleRuns()
	{
		let tmpKeys = Object.keys(this._Runs);
		let tmpCount = 0;

		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpRun = this._Runs[tmpKeys[i]];

			// Abandon non-live WaitingForInput runs (orphaned from previous sessions)
			if (tmpRun.Status === 'WaitingForInput' && !tmpRun.Live)
			{
				this.abandonRun(tmpRun.Hash);
				tmpCount++;
				continue;
			}

			// Abandon non-live Running runs (crashed mid-execution)
			if (tmpRun.Status === 'Running' && !tmpRun.Live)
			{
				this.abandonRun(tmpRun.Hash);
				tmpCount++;
				continue;
			}
		}

		if (tmpCount > 0)
		{
			this.log.info(`UltravisorExecutionManifest: abandoned ${tmpCount} stale run(s).`);
		}

		return tmpCount;
	}

	// --- Internal: file writing ---

	_writeManifest(pExecutionContext, pStagingPath)
	{
		try
		{
			let tmpManifestPath = libPath.resolve(pStagingPath, `Manifest_${pExecutionContext.OperationHash}.json`);

			// Build a serializable manifest (exclude large state data in production mode)
			let tmpManifest = {
				Hash: pExecutionContext.Hash,
				OperationHash: pExecutionContext.OperationHash,
				OperationName: pExecutionContext.OperationName,
				Status: pExecutionContext.Status,
				RunMode: pExecutionContext.RunMode,
				StartTime: pExecutionContext.StartTime,
				StopTime: pExecutionContext.StopTime,
				ElapsedMs: pExecutionContext.ElapsedMs,
				Output: pExecutionContext.Output || {},
				TaskManifests: pExecutionContext.TaskManifests,
				TimingSummary: pExecutionContext.TimingSummary,
				EventLog: pExecutionContext.EventLog,
				Errors: pExecutionContext.Errors,
				Log: pExecutionContext.Log
			};

			// Always persist execution state for checkpoint/resume
			tmpManifest.GlobalState = pExecutionContext.GlobalState;
			tmpManifest.OperationState = pExecutionContext.OperationState;
			tmpManifest.TaskOutputs = pExecutionContext.TaskOutputs;

			// Persist WaitingTasks so WaitingForInput runs can resume after restart
			if (pExecutionContext.Status === 'WaitingForInput'
				&& pExecutionContext.WaitingTasks
				&& Object.keys(pExecutionContext.WaitingTasks).length > 0)
			{
				tmpManifest.WaitingTasks = pExecutionContext.WaitingTasks;
			}

			libFS.writeFileSync(tmpManifestPath, JSON.stringify(tmpManifest, null, '\t'), 'utf8');
			pExecutionContext.Log.push(`[${new Date().toISOString()}] Manifest written to ${tmpManifestPath}`);
		}
		catch (pError)
		{
			this.log.error(`UltravisorExecutionManifest: failed to write manifest: ${pError.message}`);
		}
	}

	_writeLogFile(pExecutionContext, pStagingPath)
	{
		try
		{
			let tmpLogPath = libPath.resolve(pStagingPath, 'run.log');
			let tmpLogContent = pExecutionContext.Log.join('\n') + '\n';
			libFS.writeFileSync(tmpLogPath, tmpLogContent, 'utf8');
		}
		catch (pError)
		{
			this.log.error(`UltravisorExecutionManifest: failed to write log file: ${pError.message}`);
		}
	}

	_writeStateSnapshots(pExecutionContext, pStagingPath)
	{
		try
		{
			let tmpStatePath = libPath.resolve(pStagingPath, 'state');
			if (!libFS.existsSync(tmpStatePath))
			{
				libFS.mkdirSync(tmpStatePath, { recursive: true });
			}

			// Write operation state
			let tmpOpStatePath = libPath.resolve(tmpStatePath, 'operation.json');
			libFS.writeFileSync(tmpOpStatePath, JSON.stringify(pExecutionContext.OperationState, null, '\t'), 'utf8');

			// Write per-task output state
			let tmpTaskKeys = Object.keys(pExecutionContext.TaskOutputs);
			for (let i = 0; i < tmpTaskKeys.length; i++)
			{
				let tmpNodeHash = tmpTaskKeys[i];
				let tmpTaskStatePath = libPath.resolve(tmpStatePath, `${tmpNodeHash}.json`);
				libFS.writeFileSync(tmpTaskStatePath,
					JSON.stringify(pExecutionContext.TaskOutputs[tmpNodeHash], null, '\t'), 'utf8');
			}

			// Write operation output state
			let tmpOutputPath = libPath.resolve(tmpStatePath, 'output.json');
			libFS.writeFileSync(tmpOutputPath, JSON.stringify(pExecutionContext.Output || {}, null, '\t'), 'utf8');

			pExecutionContext.Log.push(`[${new Date().toISOString()}] State snapshots written to ${tmpStatePath}`);
		}
		catch (pError)
		{
			this.log.error(`UltravisorExecutionManifest: failed to write state snapshots: ${pError.message}`);
		}
	}

	_cleanupWorkingFiles(pExecutionContext, pStagingPath)
	{
		// In production mode, we keep the manifest and log but remove working files.
		// Working files are anything in the staging folder that isn't the manifest or log.
		try
		{
			let tmpFiles = libFS.readdirSync(pStagingPath);

			for (let i = 0; i < tmpFiles.length; i++)
			{
				let tmpFile = tmpFiles[i];

				// Keep manifest and log files
				if (tmpFile.startsWith('Manifest_') || tmpFile === 'run.log')
				{
					continue;
				}

				let tmpFilePath = libPath.resolve(pStagingPath, tmpFile);
				let tmpStat = libFS.statSync(tmpFilePath);

				if (tmpStat.isDirectory())
				{
					libFS.rmSync(tmpFilePath, { recursive: true, force: true });
				}
				else
				{
					libFS.unlinkSync(tmpFilePath);
				}
			}

			pExecutionContext.Log.push(`[${new Date().toISOString()}] Working files cleaned up from ${pStagingPath}`);
		}
		catch (pError)
		{
			this.log.error(`UltravisorExecutionManifest: failed to clean up working files: ${pError.message}`);
		}
	}
}

module.exports = UltravisorExecutionManifest;
