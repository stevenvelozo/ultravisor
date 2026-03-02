const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

class UltravisorTaskConditional extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Evaluate an address and execute one task if truthy, another if falsy.
	 *
	 * The "Address" field is resolved from pContext.GlobalState (dot-notation).
	 * Alternatively, the "Value" field can provide a literal to test.
	 *
	 * Task definition fields:
	 *   - Address: dot-notation path into pContext.GlobalState
	 *   - Value (optional): literal value to evaluate instead of Address
	 *   - TrueTask: GUID of the task to run when the value is truthy
	 *   - FalseTask: GUID of the task to run when the value is falsy
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskConditional;
