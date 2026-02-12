const libUltravisorTaskBase = require('./Ultravisor-Task-Base.cjs');

class UltravisorTaskConditional extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Evaluate an address and execute one task if truthy, another if falsy.
	 *
	 * The "Address" field is resolved from pContext.GlobalState (dot-notation).
	 * Alternatively, the "Value" field can provide a literal to test.
	 *
	 * Task definition fields:
	 *   - Address: dot-notation path into pContext.GlobalState
	 *   - Value (optional): literal value to evaluate instead of Address
	 *   - TrueTask: GUID of the task to run when the value is truthy
	 *   - FalseTask: GUID of the task to run when the value is falsy
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpValue = undefined;

		// Resolve the value to test
		if (pTaskDefinition.hasOwnProperty('Value'))
		{
			tmpValue = pTaskDefinition.Value;
			pManifestEntry.Log.push(`Conditional: evaluating literal Value: ${JSON.stringify(tmpValue)}`);
		}
		else if (pTaskDefinition.Address && typeof(pTaskDefinition.Address) === 'string')
		{
			tmpValue = this.resolveAddress(pTaskDefinition.Address, pContext);
			pManifestEntry.Log.push(`Conditional: resolved Address "${pTaskDefinition.Address}" to: ${JSON.stringify(tmpValue)}`);
		}
		else
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`Conditional: task requires an Address or Value field.`);
			return fCallback(null, pManifestEntry);
		}

		let tmpIsTruthy = !!tmpValue;
		let tmpTargetGUID = tmpIsTruthy ? pTaskDefinition.TrueTask : pTaskDefinition.FalseTask;

		pManifestEntry.Log.push(`Conditional: value is ${tmpIsTruthy ? 'truthy' : 'falsy'}, selected ${tmpIsTruthy ? 'TrueTask' : 'FalseTask'}: ${tmpTargetGUID || '(none)'}`);

		if (!tmpTargetGUID || typeof(tmpTargetGUID) !== 'string' || tmpTargetGUID.length === 0)
		{
			// No task to execute for this branch -- that is a valid no-op
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = JSON.stringify({ Branch: tmpIsTruthy ? 'true' : 'false', Task: null });
			pManifestEntry.Log.push(`Conditional: no task defined for this branch; completing as no-op.`);
			return fCallback(null, pManifestEntry);
		}

		// Look up and execute the selected task
		let tmpStateService = this.fable['Ultravisor-Hypervisor-State'];
		let tmpTaskOrchestrator = this.fable['Ultravisor-Task'];

		tmpStateService.getTask(tmpTargetGUID,
			(pError, pBranchTaskDefinition) =>
			{
				if (pError)
				{
					pManifestEntry.StopTime = new Date().toISOString();
					pManifestEntry.Status = 'Error';
					pManifestEntry.Log.push(`Conditional: could not find task ${tmpTargetGUID}: ${pError.message}`);
					return fCallback(null, pManifestEntry);
				}

				tmpTaskOrchestrator.executeCoreTaskStandalone(pBranchTaskDefinition, pContext,
					(pExecError, pResult) =>
					{
						pManifestEntry.StopTime = new Date().toISOString();

						if (pExecError)
						{
							pManifestEntry.Status = 'Error';
							pManifestEntry.Log.push(`Conditional: error executing branch task ${tmpTargetGUID}: ${pExecError.message}`);
							return fCallback(null, pManifestEntry);
						}

						pManifestEntry.Status = pResult.Status;
						pManifestEntry.Success = pResult.Success;
						pManifestEntry.Output = JSON.stringify(
							{
								Branch: tmpIsTruthy ? 'true' : 'false',
								Task: tmpTargetGUID,
								Result: pResult
							});
						pManifestEntry.Log.push(`Conditional: branch task ${tmpTargetGUID} completed with status ${pResult.Status}.`);

						return fCallback(null, pManifestEntry);
					});
			});
	}
}

module.exports = UltravisorTaskConditional;
