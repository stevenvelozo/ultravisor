const libUltravisorTaskBase = require('./Ultravisor-Task-Base.cjs');

class UltravisorTaskTemplateString extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Build a string by resolving {Address} placeholders from GlobalState.
	 *
	 * Scans the Template string for patterns like {Some.Address} and
	 * replaces each one with the value found at that address in
	 * GlobalState (or NodeState).  Useful for constructing URLs,
	 * filter strings, or any dynamic text from operation state.
	 *
	 * Task definition fields:
	 *   - Template (required): the template string with {Address}
	 *       placeholders.  Placeholders use dot-notation addresses
	 *       into GlobalState (e.g. {DateWindow.WindowStart}).
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the resolved string is stored (defaults to "Output")
	 *
	 * Unresolved placeholders (where the address resolves to undefined)
	 * are left in place and logged as warnings.
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpTemplate = pTaskDefinition.Template || '';

		if (!tmpTemplate || typeof(tmpTemplate) !== 'string' || tmpTemplate.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`TemplateString: missing or empty Template field.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`TemplateString: template="${tmpTemplate}"`);

		// Find all {Address} placeholders
		let tmpResult = tmpTemplate;
		let tmpPattern = /\{([^}]+)\}/g;
		let tmpMatch;
		let tmpResolvedCount = 0;
		let tmpUnresolvedCount = 0;

		// Collect all matches first, then replace (to avoid regex state issues)
		let tmpMatches = [];
		while ((tmpMatch = tmpPattern.exec(tmpTemplate)) !== null)
		{
			tmpMatches.push({ full: tmpMatch[0], address: tmpMatch[1] });
		}

		for (let i = 0; i < tmpMatches.length; i++)
		{
			let tmpAddress = tmpMatches[i].address;
			let tmpValue = this.resolveAddress(tmpAddress, pContext);

			if (tmpValue !== undefined && tmpValue !== null)
			{
				let tmpStringValue = String(tmpValue);
				// Replace all occurrences of this placeholder
				while (tmpResult.indexOf(tmpMatches[i].full) !== -1)
				{
					tmpResult = tmpResult.replace(tmpMatches[i].full, tmpStringValue);
				}
				tmpResolvedCount++;
				pManifestEntry.Log.push(`TemplateString: {${tmpAddress}} = "${tmpStringValue.substring(0, 100)}"`);
			}
			else
			{
				tmpUnresolvedCount++;
				pManifestEntry.Log.push(`TemplateString: WARNING {${tmpAddress}} could not be resolved, left in place.`);
			}
		}

		pManifestEntry.StopTime = new Date().toISOString();
		pManifestEntry.Status = 'Complete';
		pManifestEntry.Success = true;
		pManifestEntry.Output = tmpResult;

		pManifestEntry.Log.push(`TemplateString: resolved ${tmpResolvedCount} placeholder(s)${tmpUnresolvedCount > 0 ? `, ${tmpUnresolvedCount} unresolved` : ''}.`);
		pManifestEntry.Log.push(`TemplateString: result="${tmpResult.substring(0, 500)}"`);

		this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpResult);

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskTemplateString;
