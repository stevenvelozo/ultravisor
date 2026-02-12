const libPictService = require(`pict-serviceproviderbase`);

const libFS = require('fs');
const libPath = require('path');

class UltravisorOperation extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
	}

	/**
	 * Resolve the base staging root folder.
	 *
	 * Priority:
	 *   1. UltravisorStagingRoot from ProgramConfiguration
	 *   2. ./dist/ultravisor_staging (relative to cwd)
	 *
	 * @returns {string} Absolute path to the staging root.
	 */
	resolveStagingRoot()
	{
		return (this.fable?.ProgramConfiguration?.UltravisorStagingRoot)
			|| libPath.resolve(process.cwd(), 'dist', 'ultravisor_staging');
	}

	/**
	 * Generate a timestamp suffix for unique folder naming.
	 *
	 * Format: YYYY-MM-DD-HH-MM-SS-MS_SALT
	 * where SALT is a random two-digit number (00–99).
	 *
	 * @returns {string} The formatted timestamp suffix.
	 */
	generateOperationTimestamp()
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
	 * Build and ensure the per-operation staging folder exists.
	 *
	 * Creates:  {StagingRoot}/{GUIDOperation}-{Timestamp}_{Salt}/
	 *
	 * @param {string} pGUIDOperation - The operation GUID.
	 * @returns {string} Absolute path to the operation staging folder.
	 */
	ensureOperationStagingFolder(pGUIDOperation)
	{
		let tmpStagingRoot = this.resolveStagingRoot();
		let tmpTimestamp = this.generateOperationTimestamp();
		let tmpFolderName = `${pGUIDOperation}-${tmpTimestamp}`;
		let tmpOperationStagingPath = libPath.resolve(tmpStagingRoot, tmpFolderName);

		if (!libFS.existsSync(tmpOperationStagingPath))
		{
			libFS.mkdirSync(tmpOperationStagingPath, { recursive: true });
		}

		return tmpOperationStagingPath;
	}

	/**
	 * Execute an operation (a set of tasks run in sequence).
	 *
	 * @param {object} pOperationDefinition - The operation definition from state.
	 * @param {function} fCallback - Callback with (pError, pManifest).
	 */
	executeOperation(pOperationDefinition, fCallback)
	{
		if (typeof(pOperationDefinition) !== 'object' || pOperationDefinition === null)
		{
			return fCallback(new Error(`Ultravisor Operation: executeOperation requires a valid operation definition.`));
		}
		if (!pOperationDefinition.GUIDOperation)
		{
			return fCallback(new Error(`Ultravisor Operation: executeOperation requires GUIDOperation.`));
		}

		let tmpManifestService = this.fable['Ultravisor-Operation-Manifest'];
		let tmpTaskService = this.fable['Ultravisor-Task'];
		let tmpStateService = this.fable['Ultravisor-Hypervisor-State'];

		// Create the per-operation staging folder
		let tmpStagingPath = pOperationDefinition.StagingPath || '';

		if (!tmpStagingPath || tmpStagingPath.length === 0)
		{
			tmpStagingPath = this.ensureOperationStagingFolder(pOperationDefinition.GUIDOperation);
		}

		let tmpManifest = tmpManifestService.createManifest(pOperationDefinition);
		tmpManifest.StagingPath = tmpStagingPath;

		// Gather the task GUIDs for this operation
		let tmpTaskGUIDs = pOperationDefinition.Tasks || [];
		if (!Array.isArray(tmpTaskGUIDs) || tmpTaskGUIDs.length === 0)
		{
			tmpManifest.Log.push(`Operation has no tasks to execute.`);
			tmpManifestService.finalizeManifest(tmpManifest, tmpStagingPath);
			return fCallback(null, tmpManifest);
		}

		let tmpContext = {
			GlobalState: pOperationDefinition.GlobalState || {},
			NodeState: pOperationDefinition.NodeState || {},
			StagingPath: tmpStagingPath
		};

		// Expose GlobalState via AppData so that fable services
		// (e.g. ExpressionParser) can resolve addresses against it.
		if (!this.fable.AppData || typeof(this.fable.AppData) !== 'object')
		{
			this.fable.AppData = {};
		}
		this.fable.AppData.GlobalState = tmpContext.GlobalState;

		this.log.info(`Ultravisor Operation: executing operation ${pOperationDefinition.GUIDOperation} with ${tmpTaskGUIDs.length} task(s).`);

		// Set up progress tracking for the operation
		let tmpProgressTrackerSet = this.fable.instantiateServiceProviderIfNotExists('ProgressTrackerSet');
		let tmpProgressTrackerHash = `Op-${tmpManifest.GUIDRun}`;
		tmpProgressTrackerSet.createProgressTracker(tmpProgressTrackerHash, tmpTaskGUIDs.length);
		tmpProgressTrackerSet.startProgressTracker(tmpProgressTrackerHash);

		// Execute tasks in sequence using anticipate
		let tmpAnticipate = this.fable.newAnticipate();

		for (let i = 0; i < tmpTaskGUIDs.length; i++)
		{
			let tmpTaskGUID = tmpTaskGUIDs[i];

			tmpAnticipate.anticipate(
				function (fNext)
				{
					tmpStateService.getTask(tmpTaskGUID,
						(pError, pTaskDefinition) =>
						{
							if (pError)
							{
								tmpManifest.Log.push(`Could not find task ${tmpTaskGUID}: ${pError.message}`);
								tmpProgressTrackerSet.incrementProgressTracker(tmpProgressTrackerHash);
								return fNext();
							}

							tmpTaskService.executeTask(pTaskDefinition, tmpContext,
								(pTaskError, pTaskResult) =>
								{
									if (pTaskError)
									{
										tmpManifest.Log.push(`Error executing task ${tmpTaskGUID}: ${pTaskError.message}`);
										tmpProgressTrackerSet.incrementProgressTracker(tmpProgressTrackerHash);
										return fNext();
									}

									tmpManifestService.addTaskResult(tmpManifest, pTaskResult);
									tmpProgressTrackerSet.incrementProgressTracker(tmpProgressTrackerHash);
									tmpProgressTrackerSet.logProgressTrackerStatus(tmpProgressTrackerHash);
									return fNext();
								});
						});
				});
		}

		tmpAnticipate.wait(
			(pError) =>
			{
				if (pError)
				{
					tmpManifest.Log.push(`Error during operation execution: ${pError.message}`);
				}

				tmpProgressTrackerSet.endProgressTracker(tmpProgressTrackerHash);
				let tmpTrackerData = tmpProgressTrackerSet.getProgressTrackerData(tmpProgressTrackerHash);
				tmpManifest.ElapsedMs = tmpTrackerData.ElapsedTime;
				tmpManifest.ElapsedFormatted = this.fable.ProgressTime.formatTimeDuration(tmpTrackerData.ElapsedTime);
				tmpManifest.AverageTaskMs = tmpTrackerData.AverageOperationTime;
				tmpManifest.Log.push(tmpProgressTrackerSet.getProgressTrackerStatusString(tmpProgressTrackerHash));

				tmpManifestService.finalizeManifest(tmpManifest, tmpStagingPath);

				this.log.info(`Ultravisor Operation: operation ${pOperationDefinition.GUIDOperation} completed in ${tmpManifest.ElapsedFormatted}. Status: ${tmpManifest.Status}`);

				return fCallback(null, tmpManifest);
			});
	}
}

module.exports = UltravisorOperation;
