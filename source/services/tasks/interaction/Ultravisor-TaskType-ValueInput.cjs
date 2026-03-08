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
		return {
			Hash: 'value-input',
			Type: 'value-input',
			Name: 'Value Input',
			Description: 'Pauses execution and waits for user-provided input.',
			Category: 'interaction',

			EventInputs: [{ Name: 'RequestInput' }],
			EventOutputs: [{ Name: 'ValueInputComplete' }],
			SettingsInputs: [
				{ Name: 'PromptMessage', DataType: 'String', Required: false },
				{ Name: 'OutputAddress', DataType: 'String', Required: true }
			],
			StateOutputs: [
				{ Name: 'InputValue', DataType: 'String' }
			],

			DefaultSettings: { PromptMessage: 'Please provide a value:', OutputAddress: '' }
		};
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
			Outputs: {},
			Log: [`Waiting for input: "${tmpPromptMessage}" (-> ${tmpOutputAddress})`]
		});
	}
}

module.exports = UltravisorTaskTypeValueInput;
