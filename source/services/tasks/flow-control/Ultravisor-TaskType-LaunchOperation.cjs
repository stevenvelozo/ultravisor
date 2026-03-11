const libTaskTypeBase = require('../Ultravisor-TaskType-Base.cjs');

/**
 * LaunchOperation Task Type
 *
 * Executes a child operation within the current operation's graph.
 * Looks up the target operation by hash from the Hypervisor's state,
 * creates an isolated execution context for it, and runs it via the
 * ExecutionEngine.
 *
 * The child operation gets its own OperationState (optionally seeded
 * from InputData) but shares the parent's GlobalState (as a copy).
 *
 * Flow:
 *   Launch -> (execute child operation) -> Completed or Error
 */
class UltravisorTaskTypeLaunchOperation extends libTaskTypeBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'UltravisorTaskTypeLaunchOperation';
	}

	get definition()
	{
		return {
			Hash: 'launch-operation',
			Type: 'launch-operation',
			Name: 'Launch Operation',
			Description: 'Executes a child operation by hash, with isolated operation state.',
			Category: 'control',
			Capability: 'Flow Control',
			Action: 'LaunchOperation',
			Tier: 'Engine',

			EventInputs: [
				{ Name: 'Launch' }
			],
			EventOutputs: [
				{ Name: 'Completed' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'OperationHash', DataType: 'String', Required: true },
				{ Name: 'InputData', DataType: 'String' }
			],
			StateOutputs: [
				{ Name: 'Result', DataType: 'String' },
				{ Name: 'Status', DataType: 'String' },
				{ Name: 'ElapsedMs', DataType: 'Number' }
			],

			DefaultSettings: { OperationHash: '', InputData: '' }
		};
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		let tmpOperationHash = pResolvedSettings.OperationHash;

		if (!tmpOperationHash || typeof(tmpOperationHash) !== 'string' || tmpOperationHash.length === 0)
		{
			return fCallback(null, {
				EventToFire: 'Error',
				Outputs: { Result: '', Status: 'Error', ElapsedMs: 0 },
				Log: ['No OperationHash specified.']
			});
		}

		// Get the Hypervisor state service to look up the operation
		let tmpStateService = this._getService('UltravisorHypervisorState');

		if (!tmpStateService)
		{
			return fCallback(null, {
				EventToFire: 'Error',
				Outputs: { Result: '', Status: 'Error', ElapsedMs: 0 },
				Log: ['UltravisorHypervisorState service not found.']
			});
		}

		// Get the ExecutionEngine to run the child operation
		let tmpEngine = this._getService('UltravisorExecutionEngine');

		if (!tmpEngine)
		{
			return fCallback(null, {
				EventToFire: 'Error',
				Outputs: { Result: '', Status: 'Error', ElapsedMs: 0 },
				Log: ['UltravisorExecutionEngine service not found.']
			});
		}

		// Look up the target operation
		tmpStateService.getOperation(tmpOperationHash,
			(pError, pOperation) =>
			{
				if (pError)
				{
					return fCallback(null, {
						EventToFire: 'Error',
						Outputs: { Result: '', Status: 'Error', ElapsedMs: 0 },
						Log: [`Operation [${tmpOperationHash}] not found: ${pError.message}`]
					});
				}

				// Build initial state for the child operation
				let tmpInitialState = {
					// Share a copy of the parent's global state
					GlobalState: JSON.parse(JSON.stringify(pExecutionContext.GlobalState || {})),
					// Isolated operation state, optionally seeded from InputData
					OperationState: {},
					RunMode: pExecutionContext.RunMode || 'standard'
				};

				// Parse InputData if provided (expects JSON string)
				if (pResolvedSettings.InputData && typeof(pResolvedSettings.InputData) === 'string' && pResolvedSettings.InputData.length > 0)
				{
					try
					{
						let tmpInputData = JSON.parse(pResolvedSettings.InputData);
						if (typeof(tmpInputData) === 'object' && tmpInputData !== null)
						{
							tmpInitialState.OperationState = tmpInputData;
						}
					}
					catch (pParseError)
					{
						// If not valid JSON, store as a raw string in OperationState.InputData
						tmpInitialState.OperationState.InputData = pResolvedSettings.InputData;
					}
				}

				let tmpStartTime = Date.now();

				// Execute the child operation
				tmpEngine.executeOperation(pOperation, tmpInitialState,
					(pExecError, pContext) =>
					{
						let tmpElapsedMs = Date.now() - tmpStartTime;

						if (pExecError)
						{
							return fCallback(null, {
								EventToFire: 'Error',
								Outputs: {
									Result: pExecError.message,
									Status: 'Error',
									ElapsedMs: tmpElapsedMs
								},
								Log: [`Child operation [${tmpOperationHash}] failed: ${pExecError.message}`]
							});
						}

						let tmpStatus = pContext.Status || 'Unknown';
						let tmpResultSummary = JSON.stringify({
							Status: tmpStatus,
							TaskOutputs: pContext.TaskOutputs || {},
							Errors: pContext.Errors || []
						});

						return fCallback(null, {
							EventToFire: 'Completed',
							Outputs: {
								Result: tmpResultSummary,
								Status: tmpStatus,
								ElapsedMs: tmpElapsedMs
							},
							Log: [`Child operation [${tmpOperationHash}] completed with status: ${tmpStatus} (${tmpElapsedMs}ms)`]
						});
					});
			});
	}

	/**
	 * Get a service instance from the fable services map.
	 */
	_getService(pTypeName)
	{
		if (this.fable.servicesMap[pTypeName])
		{
			return Object.values(this.fable.servicesMap[pTypeName])[0];
		}
		return null;
	}
}

module.exports = UltravisorTaskTypeLaunchOperation;
