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

		// Signal that this task is waiting for input
		// The ExecutionEngine will set the run to WaitingForInput status
		return fCallback(null, {
			WaitingForInput: true,
			PromptMessage: tmpPromptMessage,
			OutputAddress: tmpOutputAddress,
			InputType: pResolvedSettings.InputType || 'text',
			DefaultValue: pResolvedSettings.DefaultValue || '',
			Options: pResolvedSettings.Options || '',
			Outputs: {},
			Log: [`Waiting for input: "${tmpPromptMessage}" (-> ${tmpOutputAddress})`]
		});
	}
}

module.exports = UltravisorTaskTypeValueInput;
