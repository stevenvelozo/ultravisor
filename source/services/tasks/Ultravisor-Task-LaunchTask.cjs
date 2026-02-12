const libUltravisorTaskBase = require('./Ultravisor-Task-Base.cjs');

class UltravisorTaskLaunchTask extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Asynchronously launch an isolated task.
	 *
	 * The parent task completes immediately without waiting for the
	 * child task to finish.  The child runs in the background and
	 * its result is logged when it completes.
	 *
	 * Task definition fields:
	 *   - TargetTask (required): GUID of the task to launch.
	 *   - InitialState (optional): JSON object or dot-notation address
	 *       string to resolve from the parent's GlobalState.  Used as
	 *       the child task's GlobalState.
	 *   - MergeParentState (optional, default false): if true, the
	 *       parent's GlobalState is deep-cloned as the base and
	 *       InitialState is merged on top.
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpTargetGUID = pTaskDefinition.TargetTask;

		if (!tmpTargetGUID || typeof(tmpTargetGUID) !== 'string' || tmpTargetGUID.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`LaunchTask: TargetTask is required.`);
			return fCallback(null, pManifestEntry);
		}

		let tmpStateService = this.fable['Ultravisor-Hypervisor-State'];
		let tmpTaskService = this.fable['Ultravisor-Task'];

		tmpStateService.getTask(tmpTargetGUID,
			(pError, pTargetTaskDefinition) =>
			{
				if (pError || !pTargetTaskDefinition)
				{
					pManifestEntry.StopTime = new Date().toISOString();
					pManifestEntry.Status = 'Error';
					pManifestEntry.Log.push(`LaunchTask: could not find task "${tmpTargetGUID}": ${pError ? pError.message : 'not found'}.`);
					return fCallback(null, pManifestEntry);
				}

				// Build child GlobalState
				let tmpChildState = this.buildChildState(pTaskDefinition, pContext, pManifestEntry);

				// Build an isolated execution context for the child task
				let tmpChildContext = {
					GlobalState: tmpChildState,
					NodeState: {},
					StagingPath: pContext.StagingPath || ''
				};

				pManifestEntry.Log.push(`LaunchTask: launching task "${tmpTargetGUID}" asynchronously.`);

				// Fire and forget -- launch the task but do not wait for it
				tmpTaskService.executeTask(pTargetTaskDefinition, tmpChildContext,
					(pExecError, pChildManifestEntry) =>
					{
						if (pExecError)
						{
							this.log.error(`LaunchTask: async task "${tmpTargetGUID}" errored: ${pExecError.message}`);
						}
						else
						{
							this.log.info(`LaunchTask: async task "${tmpTargetGUID}" completed. Status: ${pChildManifestEntry.Status}, Success: ${pChildManifestEntry.Success}`);
						}
					});

				// Complete the parent task immediately
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Complete';
				pManifestEntry.Success = true;
				pManifestEntry.Output = JSON.stringify({
					TargetTask: tmpTargetGUID,
					Async: true
				});

				return fCallback(null, pManifestEntry);
			});
	}

	/**
	 * Build the child GlobalState from InitialState and MergeParentState.
	 *
	 * @param {object} pTaskDefinition - Task definition with InitialState / MergeParentState.
	 * @param {object} pContext - Parent execution context.
	 * @param {object} pManifestEntry - For logging.
	 * @returns {object} The assembled child GlobalState.
	 */
	buildChildState(pTaskDefinition, pContext, pManifestEntry)
	{
		let tmpChildState = {};

		// Optionally start from a deep clone of the parent's GlobalState
		if (pTaskDefinition.MergeParentState)
		{
			try
			{
				tmpChildState = JSON.parse(JSON.stringify(pContext.GlobalState || {}));
				pManifestEntry.Log.push(`LaunchTask: merged parent GlobalState into child.`);
			}
			catch (pCloneError)
			{
				pManifestEntry.Log.push(`LaunchTask: warning: could not clone parent GlobalState: ${pCloneError.message}`);
			}
		}

		// Resolve InitialState
		let tmpInitialState = pTaskDefinition.InitialState;

		if (typeof(tmpInitialState) === 'string' && tmpInitialState.length > 0)
		{
			// Resolve from GlobalState address
			let tmpResolved = this.resolveAddress(tmpInitialState, pContext);
			if (typeof(tmpResolved) === 'object' && tmpResolved !== null)
			{
				tmpInitialState = tmpResolved;
				pManifestEntry.Log.push(`LaunchTask: resolved InitialState from address "${pTaskDefinition.InitialState}".`);
			}
			else
			{
				pManifestEntry.Log.push(`LaunchTask: warning: InitialState address "${pTaskDefinition.InitialState}" did not resolve to an object.`);
				tmpInitialState = null;
			}
		}

		if (typeof(tmpInitialState) === 'object' && tmpInitialState !== null)
		{
			Object.assign(tmpChildState, tmpInitialState);
			pManifestEntry.Log.push(`LaunchTask: applied InitialState to child GlobalState.`);
		}

		return tmpChildState;
	}
}

module.exports = UltravisorTaskLaunchTask;
