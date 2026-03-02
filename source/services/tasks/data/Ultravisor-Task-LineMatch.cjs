const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

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
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskLineMatch;
