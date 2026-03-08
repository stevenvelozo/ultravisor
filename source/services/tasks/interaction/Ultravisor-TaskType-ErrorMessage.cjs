const libTaskTypeBase = require('../Ultravisor-TaskType-Base.cjs');

/**
 * ErrorMessage Task Type
 *
 * Logs an error/warning message to the execution context.
 * Useful for dead-end branches or error handling paths.
 * The MessageTemplate can contain {~D:Address~} patterns
 * that are resolved against the execution context.
 */
class UltravisorTaskTypeErrorMessage extends libTaskTypeBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'UltravisorTaskTypeErrorMessage';
	}

	get definition()
	{
		return {
			Hash: 'error-message',
			Type: 'error-message',
			Name: 'Error Message',
			Description: 'Logs an error or warning message to the execution log.',
			Category: 'interaction',

			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [{ Name: 'Complete' }],
			SettingsInputs: [
				{ Name: 'MessageTemplate', DataType: 'String', Required: true }
			],
			StateOutputs: [],

			DefaultSettings: { MessageTemplate: 'An error occurred.' }
		};
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		let tmpMessage = pResolvedSettings.MessageTemplate || 'An error occurred.';

		this.log.error(`ErrorMessage task [${pExecutionContext.NodeHash}]: ${tmpMessage}`);

		return fCallback(null, {
			EventToFire: 'Complete',
			Outputs: {},
			Log: [`ERROR: ${tmpMessage}`]
		});
	}
}

module.exports = UltravisorTaskTypeErrorMessage;
