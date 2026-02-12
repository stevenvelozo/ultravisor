const libUltravisorTaskBase = require('./Ultravisor-Task-Base.cjs');

class UltravisorTaskLaunchOperation extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Asynchronously launch another operation.
	 *
	 * The parent task completes immediately without waiting for the
	 * child operation to finish.  The child runs in the background
	 * and its result is logged when it completes.
	 *
	 * Task definition fields:
	 *   - TargetOperation (required): GUID of the operation to launch.
	 *   - InitialState (optional): JSON object or dot-notation address
	 *       string to resolve from the parent's GlobalState.  Used as
	 *       the child operation's initial GlobalState.
	 *   - MergeParentState (optional, default false): if true, the
	 *       parent's GlobalState is deep-cloned as the base and
	 *       InitialState is merged on top.
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpTargetGUID = pTaskDefinition.TargetOperation;

		if (!tmpTargetGUID || typeof(tmpTargetGUID) !== 'string' || tmpTargetGUID.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`LaunchOperation: TargetOperation is required.`);
			return fCallback(null, pManifestEntry);
		}

		let tmpStateService = this.fable['Ultravisor-Hypervisor-State'];
		let tmpOperationService = this.fable['Ultravisor-Operation'];

		tmpStateService.getOperation(tmpTargetGUID,
			(pError, pOperationDefinition) =>
			{
				if (pError || !pOperationDefinition)
				{
					pManifestEntry.StopTime = new Date().toISOString();
					pManifestEntry.Status = 'Error';
					pManifestEntry.Log.push(`LaunchOperation: could not find operation "${tmpTargetGUID}": ${pError ? pError.message : 'not found'}.`);
					return fCallback(null, pManifestEntry);
				}

				// Build child GlobalState
				let tmpChildState = this.buildChildState(pTaskDefinition, pContext, pManifestEntry);

				// Clone the operation definition so we don't mutate the original
				let tmpChildOperationDef = JSON.parse(JSON.stringify(pOperationDefinition));
				tmpChildOperationDef.GlobalState = tmpChildState;

				pManifestEntry.Log.push(`LaunchOperation: launching operation "${tmpTargetGUID}" asynchronously.`);

				// Fire and forget -- launch the operation but do not wait for it
				tmpOperationService.executeOperation(tmpChildOperationDef,
					(pExecError, pChildManifest) =>
					{
						if (pExecError)
						{
							this.log.error(`LaunchOperation: async operation "${tmpTargetGUID}" errored: ${pExecError.message}`);
						}
						else
						{
							this.log.info(`LaunchOperation: async operation "${tmpTargetGUID}" completed. Status: ${pChildManifest.Status}, Success: ${pChildManifest.Success}`);
						}
					});

				// Complete the parent task immediately
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Complete';
				pManifestEntry.Success = true;
				pManifestEntry.Output = JSON.stringify({
					TargetOperation: tmpTargetGUID,
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
				pManifestEntry.Log.push(`LaunchOperation: merged parent GlobalState into child.`);
			}
			catch (pCloneError)
			{
				pManifestEntry.Log.push(`LaunchOperation: warning: could not clone parent GlobalState: ${pCloneError.message}`);
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
				pManifestEntry.Log.push(`LaunchOperation: resolved InitialState from address "${pTaskDefinition.InitialState}".`);
			}
			else
			{
				pManifestEntry.Log.push(`LaunchOperation: warning: InitialState address "${pTaskDefinition.InitialState}" did not resolve to an object.`);
				tmpInitialState = null;
			}
		}

		if (typeof(tmpInitialState) === 'object' && tmpInitialState !== null)
		{
			Object.assign(tmpChildState, tmpInitialState);
			pManifestEntry.Log.push(`LaunchOperation: applied InitialState to child GlobalState.`);
		}

		return tmpChildState;
	}
}

module.exports = UltravisorTaskLaunchOperation;
