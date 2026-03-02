const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

class UltravisorTaskSolver extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Evaluate an expression using the fable ExpressionParser.
	 *
	 * The solver runs pTaskDefinition.Expression through
	 * ExpressionParser.solve(), using pContext.GlobalState as the
	 * Record (data source object).  This means any address accessible
	 * via AppData.GlobalState is also available inside expressions.
	 *
	 * Task definition fields:
	 *   - Expression: the expression string to solve
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the result is stored (defaults to "Output")
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskSolver;
