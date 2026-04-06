/**
 * Parameter Sweep — Iterates over a JSON array of parameter sets.
 *
 * Each entry in the array becomes one execution of downstream tasks.
 * Individual fields from each parameter set are exposed as state outputs
 * so they can be wired into downstream card settings.
 *
 * Graph pattern (identical to split-execute):
 *   ParameterSweep.ParameterSetReady → [downstream tasks] → ParameterSweep.StepComplete
 *   ParameterSweep.SweepComplete → [whatever follows the loop]
 *
 * Example ParameterSets input:
 *   [{"seed": 42, "guidance": 5.0}, {"seed": 123, "guidance": 7.0}]
 *
 * State outputs per iteration:
 *   CurrentParameters: '{"seed": 42, "guidance": 5.0}'  (full object as JSON string)
 *   CurrentIndex: 0
 *   TotalCount: 2
 *   CompletedCount: 0
 *   Plus: each key from the current parameter set is also exposed directly
 *         e.g., "seed" = "42", "guidance" = "5.0" (all coerced to strings)
 *
 * @license MIT
 * @author Steven Velozo <steven@velozo.com>
 */

'use strict';

const libTaskTypeBase = require('../Ultravisor-TaskType-Base.cjs');
const libPath = require('path');

class TaskTypeParameterSweep extends libTaskTypeBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'TaskType-ParameterSweep';
	}

	get definition()
	{
		return require('./definitions/parameter-sweep.json');
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		let tmpTrigger = pExecutionContext.TriggeringEventName || 'BeginSweep';

		if (tmpTrigger === 'StepComplete')
		{
			return this._handleStepComplete(pResolvedSettings, pExecutionContext, fCallback);
		}

		return this._handleBeginSweep(pResolvedSettings, pExecutionContext, fCallback);
	}

	_handleBeginSweep(pSettings, pContext, fCallback)
	{
		let tmpRawSets = pSettings.ParameterSets;

		// Parse the parameter array
		let tmpSets;
		if (typeof tmpRawSets === 'string')
		{
			try
			{
				tmpSets = JSON.parse(tmpRawSets);
			}
			catch (pError)
			{
				return fCallback(null,
					{
						EventToFire: 'Error',
						Outputs: { CurrentParameters: '{}', CurrentIndex: 0, TotalCount: 0, CompletedCount: 0 },
						Log: ['ParameterSets is not valid JSON: ' + pError.message]
					});
			}
		}
		else if (Array.isArray(tmpRawSets))
		{
			tmpSets = tmpRawSets;
		}
		else
		{
			return fCallback(null,
				{
					EventToFire: 'Error',
					Outputs: { CurrentParameters: '{}', CurrentIndex: 0, TotalCount: 0, CompletedCount: 0 },
					Log: ['ParameterSets must be a JSON array string or an array.']
				});
		}

		if (!Array.isArray(tmpSets) || tmpSets.length === 0)
		{
			return fCallback(null,
				{
					EventToFire: 'Error',
					Outputs: { CurrentParameters: '{}', CurrentIndex: 0, TotalCount: 0, CompletedCount: 0 },
					Log: ['ParameterSets is empty or not an array.']
				});
		}

		// Emit the first parameter set
		let tmpFirst = tmpSets[0] || {};
		let tmpOutputs = this._buildOutputs(tmpSets, tmpFirst, 0, 0);

		return fCallback(null,
			{
				EventToFire: 'ParameterSetReady',
				Outputs: tmpOutputs,
				Log: ['Parameter sweep started: ' + tmpSets.length + ' set(s). Emitting set 1/' + tmpSets.length + '.']
			});
	}

	_handleStepComplete(pSettings, pContext, fCallback)
	{
		// Read stored iteration state from prior invocations
		let tmpStoredState = pContext.TaskOutputs[pContext.NodeHash] || {};
		let tmpSets = tmpStoredState._ParameterSets;

		if (!tmpSets || !Array.isArray(tmpSets))
		{
			return fCallback(null,
				{
					EventToFire: 'Error',
					Outputs: { CurrentParameters: '{}', CurrentIndex: 0, TotalCount: 0, CompletedCount: 0 },
					Log: ['StepComplete fired but no stored parameter sets found. Was BeginSweep called?']
				});
		}

		let tmpCurrentIndex = (tmpStoredState.CurrentIndex || 0);
		let tmpCompletedCount = (tmpStoredState.CompletedCount || 0) + 1;
		let tmpNextIndex = tmpCurrentIndex + 1;
		let tmpTotalCount = tmpSets.length;

		if (tmpNextIndex >= tmpTotalCount)
		{
			// All parameter sets have been processed
			let tmpLast = tmpSets[tmpTotalCount - 1] || {};
			let tmpOutputs = this._buildOutputs(tmpSets, tmpLast, tmpTotalCount - 1, tmpCompletedCount);

			return fCallback(null,
				{
					EventToFire: 'SweepComplete',
					Outputs: tmpOutputs,
					Log: ['Parameter sweep complete. Processed ' + tmpCompletedCount + '/' + tmpTotalCount + ' set(s).']
				});
		}

		// Emit the next parameter set
		let tmpNext = tmpSets[tmpNextIndex] || {};
		let tmpOutputs = this._buildOutputs(tmpSets, tmpNext, tmpNextIndex, tmpCompletedCount);

		return fCallback(null,
			{
				EventToFire: 'ParameterSetReady',
				Outputs: tmpOutputs,
				Log: ['Emitting parameter set ' + (tmpNextIndex + 1) + '/' + tmpTotalCount + '.']
			});
	}

	/**
	 * Build the output object for a given parameter set.
	 * Includes internal state (_ParameterSets), iteration counters,
	 * the full current set as JSON, and each individual field flattened.
	 */
	_buildOutputs(pSets, pCurrentSet, pIndex, pCompletedCount)
	{
		let tmpOutputs =
		{
			// Internal state (prefixed with _ so it doesn't show in the flow editor)
			_ParameterSets: pSets,

			// Iteration counters
			CurrentParameters: JSON.stringify(pCurrentSet),
			CurrentIndex: pIndex,
			TotalCount: pSets.length,
			CompletedCount: pCompletedCount
		};

		// Flatten each field from the current parameter set as a top-level output.
		// This allows direct state wiring: ParameterSweep.seed → Denoise.seed
		// without the downstream card needing to parse JSON.
		let tmpKeys = Object.keys(pCurrentSet);
		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpKey = tmpKeys[i];
			let tmpVal = pCurrentSet[tmpKey];
			// Coerce to string for consistent state wiring (the engine handles type coercion downstream)
			tmpOutputs[tmpKey] = (tmpVal === null || tmpVal === undefined) ? '' : String(tmpVal);
		}

		return tmpOutputs;
	}
}

module.exports = TaskTypeParameterSweep;
