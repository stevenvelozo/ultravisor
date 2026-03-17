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
		return require('./definitions/error-message.json');
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		let tmpMessage = pResolvedSettings.MessageTemplate || 'An error occurred.';
		let tmpLevel = (pResolvedSettings.Level || 'error').toLowerCase();

		if (tmpLevel === 'warning')
		{
			this.log.warn(`ErrorMessage task [${pExecutionContext.NodeHash}]: ${tmpMessage}`);
		}
		else if (tmpLevel === 'info')
		{
			this.log.info(`ErrorMessage task [${pExecutionContext.NodeHash}]: ${tmpMessage}`);
		}
		else if (tmpLevel === 'debug')
		{
			this.log.debug(`ErrorMessage task [${pExecutionContext.NodeHash}]: ${tmpMessage}`);
		}
		else
		{
			this.log.error(`ErrorMessage task [${pExecutionContext.NodeHash}]: ${tmpMessage}`);
		}

		return fCallback(null, {
			EventToFire: 'Complete',
			Outputs: {},
			Log: [`ERROR: ${tmpMessage}`]
		});
	}
}

module.exports = UltravisorTaskTypeErrorMessage;
