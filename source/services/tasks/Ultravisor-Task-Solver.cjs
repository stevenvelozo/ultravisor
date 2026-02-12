const libUltravisorTaskBase = require('./Ultravisor-Task-Base.cjs');

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
		let tmpExpression = pTaskDefinition.Expression || '';

		if (!tmpExpression || typeof(tmpExpression) !== 'string' || tmpExpression.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`Solver: missing or empty Expression field.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`Solver: evaluating expression: ${tmpExpression}`);

		try
		{
			// Get or create an ExpressionParser instance
			let tmpParser = this.fable.instantiateServiceProviderIfNotExists('ExpressionParser');

			// Build the record from GlobalState so the expression can
			// reference any value in the operation's shared state.
			if (!pContext.GlobalState || typeof(pContext.GlobalState) !== 'object')
			{
				pContext.GlobalState = {};
			}

			let tmpRecord = pContext.GlobalState;
			let tmpResultObject = {};
			let tmpDestinationObject = {};

			let tmpResult = tmpParser.solve(tmpExpression, tmpRecord, tmpResultObject, false, tmpDestinationObject);

			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = (typeof(tmpResult) === 'string') ? tmpResult : JSON.stringify(tmpResult);
			pManifestEntry.Log.push(`Solver: result = ${pManifestEntry.Output}`);

			// Store the raw result at the Destination address
			this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpResult);

			// If the expression contained assignments (e.g. "Area = X * Y"),
			// merge assigned values from the destination object back into
			// GlobalState so subsequent tasks can use them.
			let tmpDestKeys = Object.keys(tmpDestinationObject);
			if (tmpDestKeys.length > 0)
			{
				for (let i = 0; i < tmpDestKeys.length; i++)
				{
					let tmpKey = tmpDestKeys[i];
					this._Manyfest.setValueAtAddress(pContext.GlobalState, tmpKey, tmpDestinationObject[tmpKey]);
				}
				pManifestEntry.Log.push(`Solver: merged ${tmpDestKeys.length} assigned value(s) into GlobalState: ${tmpDestKeys.join(', ')}`);
			}
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`Solver: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskSolver;
