const libTaskTypeBase = require('../Ultravisor-TaskType-Base.cjs');

/**
 * ValueInput Task Type
 *
 * Pauses operation execution and waits for user input.
 * When triggered, sets the run to WaitingForInput status.
 * The ExecutionEngine resumes when input is provided via
 * POST /Run/:RunHash/Input/:NodeHash.
 *
 * The provided value is written to the specified OutputAddress.
 */
class UltravisorTaskTypeValueInput extends libTaskTypeBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'UltravisorTaskTypeValueInput';
	}

	get definition()
	{
		return require('./definitions/value-input.json');
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		let tmpPromptMessage = pResolvedSettings.PromptMessage || 'Please provide a value:';
		let tmpOutputAddress = pResolvedSettings.OutputAddress || '';

		// Auto-resolve: if the output address already has a value in state
		// (e.g., pre-seeded via /Operation/:Hash/Trigger with Parameters),
		// skip the pause and fire immediately. This lets operations work both
		// interactively (flow editor — pauses for input) and programmatically
		// (API trigger / retold-labs operation runner — runs straight through).
		if (tmpOutputAddress && pExecutionContext.StateManager)
		{
			let tmpExistingValue = pExecutionContext.StateManager.resolveAddress(
				tmpOutputAddress, pExecutionContext, pExecutionContext.NodeHash);
			if (tmpExistingValue !== undefined && tmpExistingValue !== null && tmpExistingValue !== '')
			{
				return fCallback(null, {
					EventToFire: 'complete',
					Outputs: { InputValue: tmpExistingValue },
					Log: [`Auto-resolved from pre-seeded state: "${tmpOutputAddress}" = "${String(tmpExistingValue).substring(0, 100)}"`]
				});
			}
		}

		// If the operation was triggered programmatically (OperationState has pre-seeded values),
		// auto-resolve using the DefaultValue so the whole chain runs without pausing.
		// In interactive mode (empty OperationState), pause for user input.
		let tmpIsProgrammatic = pExecutionContext.OperationState
			&& Object.keys(pExecutionContext.OperationState).length > 0;
		let tmpDefaultValue = pResolvedSettings.DefaultValue
			|| (pResolvedSettings.InputSchema && pResolvedSettings.InputSchema.Default !== undefined
				? String(pResolvedSettings.InputSchema.Default) : undefined);
		if (tmpIsProgrammatic && tmpDefaultValue !== undefined && tmpDefaultValue !== null && tmpDefaultValue !== '')
		{
			return fCallback(null, {
				EventToFire: 'complete',
				Outputs: { InputValue: tmpDefaultValue },
				Log: [`Auto-resolved from default: "${tmpOutputAddress}" = "${String(tmpDefaultValue).substring(0, 100)}"`]
			});
		}

		// For optional fields with no default in programmatic mode, pass empty string
		let tmpIsOptional = pResolvedSettings.InputSchema
			&& pResolvedSettings.InputSchema.Required === false;
		if (tmpIsProgrammatic && tmpIsOptional)
		{
			return fCallback(null, {
				EventToFire: 'complete',
				Outputs: { InputValue: '' },
				Log: [`Auto-resolved optional field: "${tmpOutputAddress}" = "" (no value provided)`]
			});
		}

		// No pre-seeded value and no default — pause and wait for interactive input
		// The ExecutionEngine will set the run to WaitingForInput status
		let tmpOptions = pResolvedSettings.Options || '';
		if (Array.isArray(tmpOptions))
		{
			tmpOptions = JSON.stringify(tmpOptions);
		}

		return fCallback(null, {
			WaitingForInput: true,
			PromptMessage: tmpPromptMessage,
			OutputAddress: tmpOutputAddress,
			InputType: pResolvedSettings.InputType || 'text',
			DefaultValue: pResolvedSettings.DefaultValue || '',
			Options: tmpOptions,
			Outputs: {},
			Log: [`Waiting for input: "${tmpPromptMessage}" (-> ${tmpOutputAddress})`]
		});
	}
}

module.exports = UltravisorTaskTypeValueInput;
