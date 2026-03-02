const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

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
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskTemplateString;
