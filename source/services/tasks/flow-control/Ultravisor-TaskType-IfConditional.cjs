const libTaskTypeBase = require('../Ultravisor-TaskType-Base.cjs');

/**
 * IfConditional Task Type
 *
 * Evaluates a simple expression and fires either the True or False event.
 * Supports comparisons via DataAddress and CompareValue, or a direct Expression string.
 *
 * If DataAddress is set, reads the value at that address and compares
 * it to CompareValue using the Operator (default: '==').
 *
 * If Expression is set instead, evaluates it using fable.ExpressionParser.
 */
class UltravisorTaskTypeIfConditional extends libTaskTypeBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'UltravisorTaskTypeIfConditional';
	}

	get definition()
	{
		return require('./definitions/if-conditional.json');
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		let tmpResult = false;

		if (pResolvedSettings.Expression && typeof(pResolvedSettings.Expression) === 'string')
		{
			// Expression-based evaluation using Fable's ExpressionParser
			try
			{
				if (this.fable.ExpressionParser)
				{
					tmpResult = this.fable.ExpressionParser.resolve(pResolvedSettings.Expression, pExecutionContext);
				}
				else
				{
					// Simple truthy evaluation fallback
					tmpResult = !!pResolvedSettings.Expression;
				}
			}
			catch (pError)
			{
				return fCallback(null, {
					EventToFire: 'False',
					Outputs: { Result: false },
					Log: [`Expression error: ${pError.message}`]
				});
			}
		}
		else if (pResolvedSettings.DataAddress)
		{
			// Address-based comparison
			let tmpDataValue = undefined;
			let tmpStateManager = pExecutionContext.StateManager;

			if (tmpStateManager)
			{
				tmpDataValue = tmpStateManager.resolveAddress(
					pResolvedSettings.DataAddress, pExecutionContext, pExecutionContext.NodeHash);
			}

			let tmpCompareValue = pResolvedSettings.CompareValue;
			let tmpOperator = pResolvedSettings.Operator || '==';

			tmpResult = this._compare(tmpDataValue, tmpCompareValue, tmpOperator);
		}

		return fCallback(null, {
			EventToFire: tmpResult ? 'True' : 'False',
			Outputs: { Result: tmpResult },
			Log: [`Condition evaluated to ${tmpResult}.`]
		});
	}

	/**
	 * Compare two values using an operator.
	 *
	 * @param {*} pLeft - Left operand.
	 * @param {*} pRight - Right operand.
	 * @param {string} pOperator - The comparison operator.
	 * @returns {boolean} Result of comparison.
	 */
	_compare(pLeft, pRight, pOperator)
	{
		switch (pOperator)
		{
			case '==':
				return String(pLeft) == String(pRight);
			case '===':
				return pLeft === pRight;
			case '!=':
				return String(pLeft) != String(pRight);
			case '!==':
				return pLeft !== pRight;
			case '>':
				return Number(pLeft) > Number(pRight);
			case '<':
				return Number(pLeft) < Number(pRight);
			case '>=':
				return Number(pLeft) >= Number(pRight);
			case '<=':
				return Number(pLeft) <= Number(pRight);
			case 'contains':
				return String(pLeft).indexOf(String(pRight)) > -1;
			case 'startsWith':
				return String(pLeft).startsWith(String(pRight));
			case 'endsWith':
				return String(pLeft).endsWith(String(pRight));
			case 'truthy':
				return !!pLeft;
			case 'falsy':
				return !pLeft;
			default:
				return String(pLeft) == String(pRight);
		}
	}
}

module.exports = UltravisorTaskTypeIfConditional;
