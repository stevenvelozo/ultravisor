const libTaskTypeBase = require('../Ultravisor-TaskType-Base.cjs');

/**
 * ReplaceString Task Type
 *
 * Performs string find-and-replace on InputString.
 * Replaces all occurrences of SearchString with ReplaceString.
 */
class UltravisorTaskTypeReplaceString extends libTaskTypeBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'UltravisorTaskTypeReplaceString';
	}

	get definition()
	{
		return {
			Hash: 'replace-string',
			Type: 'replace-string',
			Name: 'Replace String',
			Description: 'Replaces all occurrences of a search string within the input.',
			Category: 'data',

			EventInputs: [{ Name: 'Replace' }],
			EventOutputs: [
				{ Name: 'ReplaceComplete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'InputString', DataType: 'String', Required: true },
				{ Name: 'SearchString', DataType: 'String', Required: true },
				{ Name: 'ReplaceString', DataType: 'String', Required: false }
			],
			StateOutputs: [
				{ Name: 'ReplacedString', DataType: 'String' }
			],

			DefaultSettings: { InputString: '', SearchString: '', ReplaceString: '' }
		};
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		let tmpInputString = pResolvedSettings.InputString;
		let tmpSearchString = pResolvedSettings.SearchString;
		let tmpReplaceString = pResolvedSettings.ReplaceString || '';

		if (typeof(tmpInputString) !== 'string')
		{
			return fCallback(null, {
				EventToFire: 'Error',
				Outputs: {},
				Log: ['InputString is not a string.']
			});
		}

		if (!tmpSearchString || typeof(tmpSearchString) !== 'string')
		{
			return fCallback(null, {
				EventToFire: 'Error',
				Outputs: {},
				Log: ['SearchString is empty or not a string.']
			});
		}

		// Replace all occurrences
		let tmpResult = tmpInputString.split(tmpSearchString).join(tmpReplaceString);

		return fCallback(null, {
			EventToFire: 'ReplaceComplete',
			Outputs: {
				ReplacedString: tmpResult
			},
			Log: [`Replaced "${tmpSearchString}" with "${tmpReplaceString}" (${tmpInputString.split(tmpSearchString).length - 1} occurrences).`]
		});
	}
}

module.exports = UltravisorTaskTypeReplaceString;
