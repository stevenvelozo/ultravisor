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
		return require('./definitions/replace-string.json');
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

		let tmpUseRegex = pResolvedSettings.UseRegex;
		let tmpCaseSensitive = pResolvedSettings.CaseSensitive !== false;
		let tmpResult;
		let tmpReplacementCount = 0;

		if (tmpUseRegex)
		{
			let tmpFlags = 'g' + (tmpCaseSensitive ? '' : 'i');
			let tmpRegex = new RegExp(tmpSearchString, tmpFlags);
			tmpReplacementCount = (tmpInputString.match(tmpRegex) || []).length;
			tmpResult = tmpInputString.replace(tmpRegex, tmpReplaceString);
		}
		else if (!tmpCaseSensitive)
		{
			let tmpEscaped = tmpSearchString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			let tmpRegex = new RegExp(tmpEscaped, 'gi');
			tmpReplacementCount = (tmpInputString.match(tmpRegex) || []).length;
			tmpResult = tmpInputString.replace(tmpRegex, tmpReplaceString);
		}
		else
		{
			tmpReplacementCount = tmpInputString.split(tmpSearchString).length - 1;
			tmpResult = tmpInputString.split(tmpSearchString).join(tmpReplaceString);
		}

		return fCallback(null, {
			EventToFire: 'ReplaceComplete',
			Outputs: { ReplacedString: tmpResult, ReplacementCount: tmpReplacementCount },
			Log: [`Replaced "${tmpSearchString}" with "${tmpReplaceString}" (${tmpReplacementCount} occurrences).`]
		});
	}
}

module.exports = UltravisorTaskTypeReplaceString;
