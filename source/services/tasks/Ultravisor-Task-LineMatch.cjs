const libUltravisorTaskBase = require('./Ultravisor-Task-Base.cjs');

class UltravisorTaskLineMatch extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Split a string on a separator and apply a regex to each line,
	 * producing a JSON array of match result objects.
	 *
	 * The input string is resolved from either:
	 *   - Address: a manyfest address into pContext.GlobalState
	 *   - Data: an inline string literal
	 *
	 * Task definition fields:
	 *   - Address: dot-notation path into GlobalState for the input string
	 *   - Data: inline string to process (used when Address is not set)
	 *   - Pattern: regular expression string to apply to each line
	 *   - Flags (optional): regex flags (default: "")
	 *   - Separator (optional): string to split on (default: "\n")
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the result array is stored (default: "Output")
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		// --- Resolve the input string ---
		let tmpInput = undefined;

		if (pTaskDefinition.Address && typeof(pTaskDefinition.Address) === 'string')
		{
			tmpInput = this.resolveAddress(pTaskDefinition.Address, pContext);
			pManifestEntry.Log.push(`LineMatch: resolved Address "${pTaskDefinition.Address}".`);
		}
		else if (pTaskDefinition.hasOwnProperty('Data'))
		{
			tmpInput = pTaskDefinition.Data;
			pManifestEntry.Log.push(`LineMatch: using inline Data.`);
		}
		else
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`LineMatch: task requires an Address or Data field.`);
			return fCallback(null, pManifestEntry);
		}

		if (tmpInput === undefined || tmpInput === null)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`LineMatch: input resolved to null or undefined.`);
			return fCallback(null, pManifestEntry);
		}

		// Coerce non-string input to a string
		if (typeof(tmpInput) !== 'string')
		{
			tmpInput = String(tmpInput);
		}

		// --- Validate the pattern ---
		let tmpPatternString = pTaskDefinition.Pattern;

		if (!tmpPatternString || typeof(tmpPatternString) !== 'string' || tmpPatternString.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`LineMatch: missing or empty Pattern field.`);
			return fCallback(null, pManifestEntry);
		}

		let tmpFlags = (pTaskDefinition.Flags && typeof(pTaskDefinition.Flags) === 'string')
			? pTaskDefinition.Flags
			: '';

		let tmpRegex;
		try
		{
			tmpRegex = new RegExp(tmpPatternString, tmpFlags);
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`LineMatch: invalid regex "${tmpPatternString}": ${pError.message}`);
			return fCallback(null, pManifestEntry);
		}

		// --- Split on separator ---
		let tmpSeparator = (pTaskDefinition.hasOwnProperty('Separator') && typeof(pTaskDefinition.Separator) === 'string')
			? pTaskDefinition.Separator
			: '\n';

		let tmpLines = tmpInput.split(tmpSeparator);

		pManifestEntry.Log.push(`LineMatch: split input into ${tmpLines.length} line(s) using separator ${JSON.stringify(tmpSeparator)}.`);
		pManifestEntry.Log.push(`LineMatch: applying pattern /${tmpPatternString}/${tmpFlags}.`);

		// --- Apply regex to each line ---
		let tmpResults = [];

		for (let i = 0; i < tmpLines.length; i++)
		{
			let tmpLine = tmpLines[i];
			let tmpMatch = tmpRegex.exec(tmpLine);

			let tmpEntry = {
				Index: i,
				Line: tmpLine,
				Match: (tmpMatch !== null)
			};

			if (tmpMatch)
			{
				tmpEntry.FullMatch = tmpMatch[0];

				// Collect numbered capture groups
				let tmpGroups = [];
				for (let g = 1; g < tmpMatch.length; g++)
				{
					tmpGroups.push(tmpMatch[g]);
				}
				tmpEntry.Groups = tmpGroups;

				// Include named groups if present
				if (tmpMatch.groups)
				{
					tmpEntry.NamedGroups = tmpMatch.groups;
				}
			}
			else
			{
				tmpEntry.FullMatch = null;
				tmpEntry.Groups = [];
			}

			tmpResults.push(tmpEntry);
		}

		let tmpMatchCount = tmpResults.filter((pEntry) => { return pEntry.Match; }).length;

		pManifestEntry.StopTime = new Date().toISOString();
		pManifestEntry.Status = 'Complete';
		pManifestEntry.Success = true;
		pManifestEntry.Output = JSON.stringify(tmpResults);
		pManifestEntry.Log.push(`LineMatch: ${tmpMatchCount} of ${tmpLines.length} line(s) matched.`);

		// Store via Destination
		this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpResults);

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskLineMatch;
