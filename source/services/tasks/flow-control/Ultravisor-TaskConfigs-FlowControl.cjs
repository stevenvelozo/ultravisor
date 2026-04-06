/**
 * Flow Control task configurations for Ultravisor.
 *
 * Contains task types for controlling execution flow:
 *   if-conditional, split-execute, launch-operation
 *
 * Each entry defines a task type as a config object with:
 *   Definition  {object}   - Port schema, metadata, default settings
 *   Execute     {function} - Runtime logic: function(pTask, pSettings, pContext, fCb, fFireEvent)
 */


// ── Module-scoped helpers ───────────────────────────────────────────

/**
 * Get a service instance from the fable services map.
 */
function _getService(pTask, pTypeName)
{
	if (pTask.fable.servicesMap[pTypeName])
	{
		return Object.values(pTask.fable.servicesMap[pTypeName])[0];
	}
	return null;
}

/**
 * Compare two values using an operator (used by if-conditional).
 */
function _compare(pLeft, pRight, pOperator)
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

/**
 * Handle PerformSplit event for split-execute.
 */
function _handlePerformSplit(pSettings, pContext, fCallback)
{
	let tmpInputString = pSettings.InputString;
	let tmpDelimiter = pSettings.SplitDelimiter;

	if (typeof(tmpInputString) !== 'string')
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { CurrentToken: '', TokenIndex: 0, TokenCount: 0, CompletedCount: 0 },
			Log: ['InputString is not a string.']
		});
	}

	if (tmpDelimiter === undefined || tmpDelimiter === null)
	{
		tmpDelimiter = '\n';
	}

	let tmpTokens = tmpInputString.split(tmpDelimiter);
	if (pSettings.TrimTokens)
	{
		tmpTokens = tmpTokens.map(function (pT) { return pT.trim(); });
	}
	if (pSettings.SkipEmpty)
	{
		tmpTokens = tmpTokens.filter(function (pT) { return pT.length > 0; });
	}
	let tmpTokenCount = tmpTokens.length;
	let tmpLog = [`Splitting input (${tmpInputString.length} chars) by "${tmpDelimiter}" into ${tmpTokenCount} tokens.`];

	if (tmpTokenCount === 0)
	{
		return fCallback(null, {
			EventToFire: 'CompletedAllSubtasks',
			Outputs: { CurrentToken: '', TokenIndex: 0, TokenCount: 0, CompletedCount: 0 },
			Log: tmpLog.concat(['No tokens to process.'])
		});
	}

	let tmpFirstToken = tmpTokens[0];
	tmpLog.push(`Emitting token 1/${tmpTokenCount}: "${tmpFirstToken.substring(0, 50)}"`);

	return fCallback(null, {
		EventToFire: 'TokenDataSent',
		Outputs: {
			_Tokens: tmpTokens,
			CurrentToken: tmpFirstToken,
			TokenIndex: 0,
			TokenCount: tmpTokenCount,
			CompletedCount: 0
		},
		Log: tmpLog
	});
}

/**
 * Handle StepComplete event for split-execute.
 */
function _handleStepComplete(pContext, fCallback)
{
	let tmpStoredState = pContext.TaskOutputs[pContext.NodeHash] || {};
	let tmpTokens = tmpStoredState._Tokens;

	if (!Array.isArray(tmpTokens))
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { CurrentToken: '', TokenIndex: 0, TokenCount: 0, CompletedCount: 0 },
			Log: ['StepComplete received but no stored tokens found. Was PerformSplit called first?']
		});
	}

	let tmpTokenCount = tmpTokens.length;
	let tmpPreviousIndex = tmpStoredState.TokenIndex || 0;
	let tmpCompletedCount = (tmpStoredState.CompletedCount || 0) + 1;
	let tmpNextIndex = tmpPreviousIndex + 1;

	if (tmpNextIndex >= tmpTokenCount)
	{
		return fCallback(null, {
			EventToFire: 'CompletedAllSubtasks',
			Outputs: {
				_Tokens: tmpTokens,
				CurrentToken: tmpTokens[tmpTokenCount - 1],
				TokenIndex: tmpTokenCount - 1,
				TokenCount: tmpTokenCount,
				CompletedCount: tmpCompletedCount
			},
			Log: [`All ${tmpTokenCount} tokens processed (${tmpCompletedCount} completed).`]
		});
	}

	let tmpNextToken = tmpTokens[tmpNextIndex];

	return fCallback(null, {
		EventToFire: 'TokenDataSent',
		Outputs: {
			_Tokens: tmpTokens,
			CurrentToken: tmpNextToken,
			TokenIndex: tmpNextIndex,
			TokenCount: tmpTokenCount,
			CompletedCount: tmpCompletedCount
		},
		Log: [`Emitting token ${tmpNextIndex + 1}/${tmpTokenCount}: "${tmpNextToken.substring(0, 50)}"`]
	});
}


/**
 * Flatten a parameter set object into string-valued output fields.
 * { seed: 42, guidance: 5.0 } → { seed: "42", guidance: "5.0" }
 * This allows direct state wiring: ParameterSweep.seed → Denoise.seed
 */
function _flattenParams(pObj)
{
	let tmpResult = {};
	let tmpKeys = Object.keys(pObj || {});
	for (let i = 0; i < tmpKeys.length; i++)
	{
		let tmpVal = pObj[tmpKeys[i]];
		tmpResult[tmpKeys[i]] = (tmpVal === null || tmpVal === undefined) ? '' : String(tmpVal);
	}
	return tmpResult;
}


// ═══════════════════════════════════════════════════════════════════
//  FLOW CONTROL TASK CONFIGS
// ═══════════════════════════════════════════════════════════════════

module.exports =
[
	// ── if-conditional ─────────────────────────────────────────
	{
		Definition: require('./definitions/if-conditional.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpResult = false;

			if (pResolvedSettings.Expression && typeof(pResolvedSettings.Expression) === 'string')
			{
				try
				{
					if (pTask.fable.ExpressionParser)
					{
						tmpResult = pTask.fable.ExpressionParser.resolve(pResolvedSettings.Expression, pExecutionContext);
					}
					else
					{
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
				let tmpDataValue = undefined;
				let tmpStateManager = pExecutionContext.StateManager;

				if (tmpStateManager)
				{
					tmpDataValue = tmpStateManager.resolveAddress(pResolvedSettings.DataAddress, pExecutionContext, pExecutionContext.NodeHash);
				}

				tmpResult = _compare(tmpDataValue, pResolvedSettings.CompareValue, pResolvedSettings.Operator || '==');
			}

			return fCallback(null, {
				EventToFire: tmpResult ? 'True' : 'False',
				Outputs: { Result: tmpResult },
				Log: [`Condition evaluated to ${tmpResult}.`]
			});
		}
	},

	// ── split-execute ──────────────────────────────────────────
	{
		Definition: require('./definitions/split-execute.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			if (pExecutionContext.TriggeringEventName === 'StepComplete')
			{
				return _handleStepComplete(pExecutionContext, fCallback);
			}

			return _handlePerformSplit(pResolvedSettings, pExecutionContext, fCallback);
		}
	},

	// ── parameter-sweep ───────────────────────────────────────
	{
		Definition: require('./definitions/parameter-sweep.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			if (pExecutionContext.TriggeringEventName === 'StepComplete')
			{
				// Read stored iteration state from prior invocations
				let tmpStoredState = pExecutionContext.TaskOutputs[pExecutionContext.NodeHash] || {};
				let tmpSets = tmpStoredState._ParameterSets;

				if (!Array.isArray(tmpSets))
				{
					return fCallback(null, {
						EventToFire: 'Error',
						Outputs: { CurrentParameters: '{}', CurrentIndex: 0, TotalCount: 0, CompletedCount: 0 },
						Log: ['StepComplete fired but no stored parameter sets found. Was BeginSweep called?']
					});
				}

				let tmpCurrentIndex = tmpStoredState.CurrentIndex || 0;
				let tmpCompletedCount = (tmpStoredState.CompletedCount || 0) + 1;
				let tmpNextIndex = tmpCurrentIndex + 1;
				let tmpTotalCount = tmpSets.length;

				if (tmpNextIndex >= tmpTotalCount)
				{
					let tmpLast = tmpSets[tmpTotalCount - 1] || {};
					let tmpOutputs = Object.assign(
						{ _ParameterSets: tmpSets, CurrentParameters: JSON.stringify(tmpLast), CurrentIndex: tmpTotalCount - 1, TotalCount: tmpTotalCount, CompletedCount: tmpCompletedCount },
						_flattenParams(tmpLast));
					return fCallback(null, {
						EventToFire: 'SweepComplete',
						Outputs: tmpOutputs,
						Log: ['Parameter sweep complete. Processed ' + tmpCompletedCount + '/' + tmpTotalCount + ' set(s).']
					});
				}

				let tmpNext = tmpSets[tmpNextIndex] || {};
				let tmpOutputs = Object.assign(
					{ _ParameterSets: tmpSets, CurrentParameters: JSON.stringify(tmpNext), CurrentIndex: tmpNextIndex, TotalCount: tmpTotalCount, CompletedCount: tmpCompletedCount },
					_flattenParams(tmpNext));
				return fCallback(null, {
					EventToFire: 'ParameterSetReady',
					Outputs: tmpOutputs,
					Log: ['Emitting parameter set ' + (tmpNextIndex + 1) + '/' + tmpTotalCount + '.']
				});
			}

			// BeginSweep — parse the array and emit the first set
			let tmpRawSets = pResolvedSettings.ParameterSets;
			let tmpSets;
			if (typeof tmpRawSets === 'string')
			{
				try { tmpSets = JSON.parse(tmpRawSets); }
				catch (pErr)
				{
					return fCallback(null, {
						EventToFire: 'Error',
						Outputs: { CurrentParameters: '{}', CurrentIndex: 0, TotalCount: 0, CompletedCount: 0 },
						Log: ['ParameterSets is not valid JSON: ' + pErr.message]
					});
				}
			}
			else if (Array.isArray(tmpRawSets))
			{
				tmpSets = tmpRawSets;
			}
			else
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { CurrentParameters: '{}', CurrentIndex: 0, TotalCount: 0, CompletedCount: 0 },
					Log: ['ParameterSets must be a JSON array.']
				});
			}

			if (!Array.isArray(tmpSets) || tmpSets.length === 0)
			{
				return fCallback(null, {
					EventToFire: 'SweepComplete',
					Outputs: { CurrentParameters: '{}', CurrentIndex: 0, TotalCount: 0, CompletedCount: 0 },
					Log: ['ParameterSets is empty. Nothing to sweep.']
				});
			}

			let tmpFirst = tmpSets[0] || {};
			let tmpOutputs = Object.assign(
				{ _ParameterSets: tmpSets, CurrentParameters: JSON.stringify(tmpFirst), CurrentIndex: 0, TotalCount: tmpSets.length, CompletedCount: 0 },
				_flattenParams(tmpFirst));
			return fCallback(null, {
				EventToFire: 'ParameterSetReady',
				Outputs: tmpOutputs,
				Log: ['Parameter sweep started: ' + tmpSets.length + ' set(s). Emitting set 1/' + tmpSets.length + '.']
			});
		}
	},

	// ── launch-operation ───────────────────────────────────────
	{
		Definition: require('./definitions/launch-operation.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpOperationHash = pResolvedSettings.OperationHash;

			if (!tmpOperationHash || typeof(tmpOperationHash) !== 'string' || tmpOperationHash.length === 0)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: { Result: '', Status: 'Error', ElapsedMs: 0 }, Log: ['No OperationHash specified.'] });
			}

			let tmpStateService = _getService(pTask, 'UltravisorHypervisorState');
			if (!tmpStateService)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: { Result: '', Status: 'Error', ElapsedMs: 0 }, Log: ['UltravisorHypervisorState service not found.'] });
			}

			let tmpEngine = _getService(pTask, 'UltravisorExecutionEngine');
			if (!tmpEngine)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: { Result: '', Status: 'Error', ElapsedMs: 0 }, Log: ['UltravisorExecutionEngine service not found.'] });
			}

			tmpStateService.getOperation(tmpOperationHash,
				function (pError, pOperation)
				{
					if (pError)
					{
						return fCallback(null, { EventToFire: 'Error', Outputs: { Result: '', Status: 'Error', ElapsedMs: 0 }, Log: [`Operation [${tmpOperationHash}] not found: ${pError.message}`] });
					}

					let tmpInitialState = {
						GlobalState: (pResolvedSettings.InheritGlobalState === false) ? {} : JSON.parse(JSON.stringify(pExecutionContext.GlobalState || {})),
						OperationState: {},
						RunMode: pExecutionContext.RunMode || 'standard'
					};

					if (pResolvedSettings.InputData && typeof(pResolvedSettings.InputData) === 'string' && pResolvedSettings.InputData.length > 0)
					{
						try
						{
							let tmpInputData = JSON.parse(pResolvedSettings.InputData);
							if (typeof(tmpInputData) === 'object' && tmpInputData !== null)
							{
								tmpInitialState.OperationState = tmpInputData;
							}
						}
						catch (pParseError)
						{
							tmpInitialState.OperationState.InputData = pResolvedSettings.InputData;
						}
					}

					let tmpStartTime = Date.now();
					let tmpTimeoutMs = parseInt(pResolvedSettings.TimeoutMs, 10) || 0;
					let tmpCompleted = false;
					let tmpTimeoutHandle = null;

					if (tmpTimeoutMs > 0)
					{
						tmpTimeoutHandle = setTimeout(function()
						{
							if (!tmpCompleted)
							{
								tmpCompleted = true;
								let tmpElapsedMs = Date.now() - tmpStartTime;
								return fCallback(null, {
									EventToFire: 'Error',
									Outputs: { Result: 'Operation timed out', Status: 'Timeout', ElapsedMs: tmpElapsedMs },
									Log: [`Child operation [${tmpOperationHash}] timed out after ${tmpTimeoutMs}ms`]
								});
							}
						}, tmpTimeoutMs);
					}

					tmpEngine.executeOperation(pOperation, tmpInitialState,
						function (pExecError, pContext)
						{
							if (tmpCompleted) { return; }
							tmpCompleted = true;
							if (tmpTimeoutHandle) { clearTimeout(tmpTimeoutHandle); }

							let tmpElapsedMs = Date.now() - tmpStartTime;

							if (pExecError)
							{
								return fCallback(null, {
									EventToFire: 'Error',
									Outputs: { Result: pExecError.message, Status: 'Error', ElapsedMs: tmpElapsedMs },
									Log: [`Child operation [${tmpOperationHash}] failed: ${pExecError.message}`]
								});
							}

							let tmpStatus = pContext.Status || 'Unknown';
							let tmpResultSummary = JSON.stringify({ Status: tmpStatus, TaskOutputs: pContext.TaskOutputs || {}, Errors: pContext.Errors || [] });

							return fCallback(null, {
								EventToFire: 'Completed',
								Outputs: { Result: tmpResultSummary, Status: tmpStatus, ElapsedMs: tmpElapsedMs },
								Log: [`Child operation [${tmpOperationHash}] completed with status: ${tmpStatus} (${tmpElapsedMs}ms)`]
							});
						});
				});
		}
	}
];
