const libTaskTypeBase = require('../Ultravisor-TaskType-Base.cjs');

/**
 * StringAppender Task Type
 *
 * Appends InputString to the value at OutputAddress.
 * If the target address is empty/undefined, sets it to InputString.
 * Useful for accumulating results across loop iterations (e.g., split-execute).
 */
class UltravisorTaskTypeStringAppender extends libTaskTypeBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'UltravisorTaskTypeStringAppender';
	}

	get definition()
	{
		return require('./definitions/string-appender.json');
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		let tmpInputString = pResolvedSettings.InputString;
		let tmpOutputAddress = pResolvedSettings.OutputAddress;

		if (typeof(tmpInputString) !== 'string')
		{
			tmpInputString = String(tmpInputString !== undefined ? tmpInputString : '');
		}

		if (!tmpOutputAddress || typeof(tmpOutputAddress) !== 'string')
		{
			// No output address — just pass through as output
			return fCallback(null, {
				EventToFire: 'Completed',
				Outputs: {
					AppendedString: tmpInputString
				},
				Log: ['No OutputAddress specified, returning InputString as AppendedString.']
			});
		}

		// Read the existing value at the output address
		let tmpStateManager = pExecutionContext.StateManager;
		let tmpExistingValue = '';

		if (tmpStateManager)
		{
			let tmpResolved = tmpStateManager.resolveAddress(tmpOutputAddress, pExecutionContext, pExecutionContext.NodeHash);

			if (tmpResolved !== undefined && tmpResolved !== null)
			{
				tmpExistingValue = String(tmpResolved);
			}
		}

		let tmpAppendedValue;

		if (pResolvedSettings.Separator)
		{
			tmpAppendedValue = tmpExistingValue + (tmpExistingValue.length > 0 ? pResolvedSettings.Separator : '') + tmpInputString;
		}
		else
		{
			if (pResolvedSettings.AppendNewline)
			{
				tmpInputString = tmpInputString + '\n';
			}

			tmpAppendedValue = tmpExistingValue + tmpInputString;
		}

		let tmpStateWrites = {};
		tmpStateWrites[tmpOutputAddress] = tmpAppendedValue;

		return fCallback(null, {
			EventToFire: 'Completed',
			Outputs: {
				AppendedString: tmpAppendedValue
			},
			StateWrites: tmpStateWrites,
			Log: [`Appended ${tmpInputString.length} chars to [${tmpOutputAddress}] (total: ${tmpAppendedValue.length}).`]
		});
	}
}

module.exports = UltravisorTaskTypeStringAppender;
