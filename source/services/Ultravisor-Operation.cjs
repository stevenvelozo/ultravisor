const libPictService = require(`pict-serviceproviderbase`);

class UltravisorOperation extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
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

		let tmpManifest = tmpManifestService.createManifest(pOperationDefinition);

		// Gather the task GUIDs for this operation
		let tmpTaskGUIDs = pOperationDefinition.Tasks || [];
		if (!Array.isArray(tmpTaskGUIDs) || tmpTaskGUIDs.length === 0)
		{
			tmpManifest.Log.push(`Operation has no tasks to execute.`);
			tmpManifestService.finalizeManifest(tmpManifest);
			return fCallback(null, tmpManifest);
		}

		let tmpContext = {
			GlobalState: pOperationDefinition.GlobalState || {},
			NodeState: pOperationDefinition.NodeState || {},
			StagingPath: pOperationDefinition.StagingPath || ''
		};

		this.log.info(`Ultravisor Operation: executing operation ${pOperationDefinition.GUIDOperation} with ${tmpTaskGUIDs.length} task(s).`);

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
								return fNext();
							}

							tmpTaskService.executeTask(pTaskDefinition, tmpContext,
								(pTaskError, pTaskResult) =>
								{
									if (pTaskError)
									{
										tmpManifest.Log.push(`Error executing task ${tmpTaskGUID}: ${pTaskError.message}`);
										return fNext();
									}

									tmpManifestService.addTaskResult(tmpManifest, pTaskResult);
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

				tmpManifestService.finalizeManifest(tmpManifest);

				this.log.info(`Ultravisor Operation: operation ${pOperationDefinition.GUIDOperation} completed. Status: ${tmpManifest.Status}`);

				return fCallback(null, tmpManifest);
			});
	}
}

module.exports = UltravisorOperation;
