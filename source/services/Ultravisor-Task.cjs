const libPictService = require(`pict-serviceproviderbase`);

const _TaskTypes = {
	'command': require('./tasks/Ultravisor-Task-Command.cjs'),
	'request': require('./tasks/Ultravisor-Task-Request.cjs'),
	'conditional': require('./tasks/Ultravisor-Task-Conditional.cjs'),
	'solver': require('./tasks/Ultravisor-Task-Solver.cjs'),
	'linematch': require('./tasks/Ultravisor-Task-LineMatch.cjs'),

	'listfiles': require('./tasks/stagingfiles/Ultravisor-Task-ListFiles.cjs'),
	'readjson': require('./tasks/stagingfiles/Ultravisor-Task-ReadJSON.cjs'),
	'writejson': require('./tasks/stagingfiles/Ultravisor-Task-WriteJSON.cjs'),
	'readtext': require('./tasks/stagingfiles/Ultravisor-Task-ReadText.cjs'),
	'writetext': require('./tasks/stagingfiles/Ultravisor-Task-WriteText.cjs'),
	'readxml': require('./tasks/stagingfiles/Ultravisor-Task-ReadXML.cjs'),
	'writexml': require('./tasks/stagingfiles/Ultravisor-Task-WriteXML.cjs'),
	'readbinary': require('./tasks/stagingfiles/Ultravisor-Task-ReadBinary.cjs'),
	'writebinary': require('./tasks/stagingfiles/Ultravisor-Task-WriteBinary.cjs'),
	'copyfile': require('./tasks/stagingfiles/Ultravisor-Task-CopyFile.cjs'),

	'getjson': require('./tasks/rest/Ultravisor-Task-GetJSON.cjs'),
	'getbinary': require('./tasks/rest/Ultravisor-Task-GetBinary.cjs'),
	'gettext': require('./tasks/rest/Ultravisor-Task-GetText.cjs'),
	'getxml': require('./tasks/rest/Ultravisor-Task-GetXML.cjs'),
	'sendjson': require('./tasks/rest/Ultravisor-Task-SendJSON.cjs'),
	'restrequest': require('./tasks/rest/Ultravisor-Task-RestRequest.cjs'),

	'generatepagedoperation': require('./tasks/Ultravisor-Task-GeneratePagedOperation.cjs'),

	'collectvalues': require('./tasks/Ultravisor-Task-CollectValues.cjs'),
	'commandeach': require('./tasks/Ultravisor-Task-CommandEach.cjs'),

	'datewindow': require('./tasks/Ultravisor-Task-DateWindow.cjs'),
	'templatestring': require('./tasks/Ultravisor-Task-TemplateString.cjs'),

	'launchoperation': require('./tasks/Ultravisor-Task-LaunchOperation.cjs'),
	'launchtask': require('./tasks/Ultravisor-Task-LaunchTask.cjs'),
};

class UltravisorTask extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
	}

	/**
	 * Execute a task based on its type, then run any subsequent task sets.
	 *
	 * Subsequent task sets are optional arrays of task GUIDs on the task
	 * definition.  They run in order after the core task completes:
	 *
	 *   onBefore      -- runs before the core task executes
	 *   onCompletion  -- runs after the core task succeeds (Status === 'Complete')
	 *   onSubsequent  -- runs after the core task regardless of outcome
	 *   onFailure     -- runs after the core task when Success is false
	 *   onError       -- runs after the core task when Status is 'Error'
	 *
	 * Each set is an array of task GUIDs executed sequentially.
	 *
	 * @param {object} pTaskDefinition - The task definition object from state.
	 * @param {object} pContext - Execution context (GlobalState, NodeState, StagingPath).
	 * @param {function} fCallback - Callback with (pError, pManifestEntry).
	 */
	executeTask(pTaskDefinition, pContext, fCallback)
	{
		if (typeof(pTaskDefinition) !== 'object' || pTaskDefinition === null)
		{
			return fCallback(new Error(`Ultravisor Task: executeTask requires a valid task definition object.`));
		}
		if (!pTaskDefinition.GUIDTask)
		{
			return fCallback(new Error(`Ultravisor Task: executeTask requires the task definition to have a GUIDTask.`));
		}

		let tmpManifestEntry = {
			GUIDTask: pTaskDefinition.GUIDTask,
			Name: pTaskDefinition.Name || pTaskDefinition.GUIDTask,
			Type: pTaskDefinition.Type || 'Command',
			StartTime: new Date().toISOString(),
			StopTime: null,
			Status: 'Running',
			Success: false,
			Output: null,
			Log: [],
			SubsequentResults: {}
		};

		tmpManifestEntry.Log.push(`Task ${tmpManifestEntry.GUIDTask} started at ${tmpManifestEntry.StartTime}`);

		// Set up per-task progress timing
		let tmpProgressTrackerSet = this.fable.instantiateServiceProviderIfNotExists('ProgressTrackerSet');
		let tmpTaskTimerHash = `Task-${pTaskDefinition.GUIDTask}-${Date.now()}`;
		tmpProgressTrackerSet.createProgressTracker(tmpTaskTimerHash, 1);
		tmpProgressTrackerSet.startProgressTracker(tmpTaskTimerHash);

		// Ensure GlobalState is accessible via AppData for fable services
		if (!pContext.GlobalState || typeof(pContext.GlobalState) !== 'object')
		{
			pContext.GlobalState = {};
		}
		if (!this.fable.AppData || typeof(this.fable.AppData) !== 'object')
		{
			this.fable.AppData = {};
		}
		this.fable.AppData.GlobalState = pContext.GlobalState;

		// --- onBefore ---
		this.executeSubsequentSet(pTaskDefinition, 'onBefore', pContext, tmpManifestEntry,
			(pBeforeError) =>
			{
				if (pBeforeError)
				{
					tmpManifestEntry.Log.push(`Error in onBefore: ${pBeforeError.message}`);
				}

				// --- Core task execution ---
				this.executeCoreTask(pTaskDefinition, pContext, tmpManifestEntry,
					(pCoreError) =>
					{
						if (pCoreError)
						{
							tmpManifestEntry.Log.push(`Core task error: ${pCoreError.message}`);
						}

						// --- Determine which subsequent sets to run ---
						let tmpSubsequentPhases = [];

						// onCompletion: only when core task succeeded
						if (tmpManifestEntry.Status === 'Complete' && tmpManifestEntry.Success)
						{
							tmpSubsequentPhases.push('onCompletion');
						}

						// onFailure: when the task did not succeed
						if (!tmpManifestEntry.Success)
						{
							tmpSubsequentPhases.push('onFailure');
						}

						// onError: specifically when Status is 'Error'
						if (tmpManifestEntry.Status === 'Error')
						{
							tmpSubsequentPhases.push('onError');
						}

						// onSubsequent: always runs after core task
						tmpSubsequentPhases.push('onSubsequent');

						this.executeSubsequentPhases(pTaskDefinition, tmpSubsequentPhases, pContext, tmpManifestEntry,
							() =>
							{
								// Record task timing
								tmpProgressTrackerSet.endProgressTracker(tmpTaskTimerHash);
								let tmpTrackerData = tmpProgressTrackerSet.getProgressTrackerData(tmpTaskTimerHash);
								tmpManifestEntry.ElapsedMs = tmpTrackerData.ElapsedTime;
								tmpManifestEntry.ElapsedFormatted = this.fable.ProgressTime.formatTimeDuration(tmpTrackerData.ElapsedTime);
								tmpManifestEntry.Log.push(`Task ${tmpManifestEntry.Name} completed in ${tmpManifestEntry.ElapsedFormatted}`);
								this.log.info(`Ultravisor Task: ${tmpManifestEntry.Name} [${tmpManifestEntry.Status}] completed in ${tmpManifestEntry.ElapsedFormatted}`);
								return fCallback(null, tmpManifestEntry);
							});
					});
			});
	}

	/**
	 * Execute the core task logic by dispatching to the appropriate task type service.
	 */
	executeCoreTask(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpType = (pTaskDefinition.Type || 'Command').toLowerCase();

		let tmpTaskTypeClass = _TaskTypes[tmpType];

		if (!tmpTaskTypeClass)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Unsupported';
			pManifestEntry.Log.push(`Task type "${pTaskDefinition.Type}" is not yet implemented.`);
			return fCallback(null);
		}

		let tmpTaskTypeInstance = new tmpTaskTypeClass(this.fable);
		tmpTaskTypeInstance.execute(pTaskDefinition, pContext, pManifestEntry,
			() => { return fCallback(null); });
	}

	/**
	 * Execute a list of subsequent phases in order.
	 *
	 * @param {object} pTaskDefinition - The parent task definition.
	 * @param {array} pPhases - Array of phase names to execute in order.
	 * @param {object} pContext - Execution context.
	 * @param {object} pManifestEntry - The parent manifest entry.
	 * @param {function} fCallback - Callback when all phases are done.
	 */
	executeSubsequentPhases(pTaskDefinition, pPhases, pContext, pManifestEntry, fCallback)
	{
		if (!Array.isArray(pPhases) || pPhases.length === 0)
		{
			return fCallback();
		}

		let tmpPhaseIndex = 0;

		let fRunNextPhase = () =>
		{
			if (tmpPhaseIndex >= pPhases.length)
			{
				return fCallback();
			}

			let tmpPhaseName = pPhases[tmpPhaseIndex];
			tmpPhaseIndex++;

			this.executeSubsequentSet(pTaskDefinition, tmpPhaseName, pContext, pManifestEntry,
				() =>
				{
					fRunNextPhase();
				});
		};

		fRunNextPhase();
	}

	/**
	 * Execute a single subsequent task set by name (e.g. "onBefore",
	 * "onCompletion").
	 *
	 * The set is an array of task GUIDs on the task definition keyed by
	 * pSetName.  Each GUID is looked up from state and executed sequentially.
	 * Results are stored in pManifestEntry.SubsequentResults[pSetName].
	 *
	 * @param {object} pTaskDefinition - The parent task definition.
	 * @param {string} pSetName - The subsequent set name.
	 * @param {object} pContext - Execution context.
	 * @param {object} pManifestEntry - The parent manifest entry.
	 * @param {function} fCallback - Callback when done.
	 */
	executeSubsequentSet(pTaskDefinition, pSetName, pContext, pManifestEntry, fCallback)
	{
		let tmpTaskGUIDs = pTaskDefinition[pSetName];

		if (!Array.isArray(tmpTaskGUIDs) || tmpTaskGUIDs.length === 0)
		{
			return fCallback();
		}

		pManifestEntry.Log.push(`Executing subsequent set "${pSetName}" with ${tmpTaskGUIDs.length} task(s).`);
		pManifestEntry.SubsequentResults[pSetName] = [];

		let tmpStateService = this.fable['Ultravisor-Hypervisor-State'];
		let tmpIndex = 0;

		let fRunNext = () =>
		{
			if (tmpIndex >= tmpTaskGUIDs.length)
			{
				pManifestEntry.Log.push(`Subsequent set "${pSetName}" complete.`);
				return fCallback();
			}

			let tmpGUID = tmpTaskGUIDs[tmpIndex];
			tmpIndex++;

			tmpStateService.getTask(tmpGUID,
				(pError, pSubTaskDefinition) =>
				{
					if (pError)
					{
						pManifestEntry.Log.push(`${pSetName}: could not find task ${tmpGUID}: ${pError.message}`);
						pManifestEntry.SubsequentResults[pSetName].push(
							{
								GUIDTask: tmpGUID,
								Status: 'Error',
								Success: false,
								Log: [`Task not found: ${pError.message}`]
							});
						return fRunNext();
					}

					// Execute the subsequent task (without its own subsequent
					// chains to avoid infinite recursion)
					this.executeCoreTaskStandalone(pSubTaskDefinition, pContext,
						(pExecError, pResult) =>
						{
							if (pExecError)
							{
								pManifestEntry.Log.push(`${pSetName}: error executing task ${tmpGUID}: ${pExecError.message}`);
								pManifestEntry.SubsequentResults[pSetName].push(
									{
										GUIDTask: tmpGUID,
										Status: 'Error',
										Success: false,
										Log: [`Execution error: ${pExecError.message}`]
									});
							}
							else
							{
								pManifestEntry.Log.push(`${pSetName}: task ${tmpGUID} completed with status: ${pResult.Status}`);
								pManifestEntry.SubsequentResults[pSetName].push(pResult);
							}

							return fRunNext();
						});
				});
		};

		fRunNext();
	}

	/**
	 * Execute a task as a standalone core task (no subsequent chains).
	 * Used for subsequent tasks to avoid recursive subsequent execution.
	 */
	executeCoreTaskStandalone(pTaskDefinition, pContext, fCallback)
	{
		if (typeof(pTaskDefinition) !== 'object' || pTaskDefinition === null)
		{
			return fCallback(new Error(`Invalid task definition.`));
		}
		if (!pTaskDefinition.GUIDTask)
		{
			return fCallback(new Error(`Task definition missing GUIDTask.`));
		}

		let tmpManifestEntry = {
			GUIDTask: pTaskDefinition.GUIDTask,
			Name: pTaskDefinition.Name || pTaskDefinition.GUIDTask,
			Type: pTaskDefinition.Type || 'Command',
			StartTime: new Date().toISOString(),
			StopTime: null,
			Status: 'Running',
			Success: false,
			Output: null,
			Log: []
		};

		tmpManifestEntry.Log.push(`Task ${tmpManifestEntry.GUIDTask} started at ${tmpManifestEntry.StartTime}`);

		this.executeCoreTask(pTaskDefinition, pContext, tmpManifestEntry,
			(pError) =>
			{
				return fCallback(null, tmpManifestEntry);
			});
	}
}

module.exports = UltravisorTask;
