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


// ═══════════════════════════════════════════════════════════════════
//  FLOW CONTROL TASK CONFIGS
// ═══════════════════════════════════════════════════════════════════

module.exports =
[
	// ── if-conditional ─────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'if-conditional',
			Type: 'if-conditional',
			Name: 'If Conditional',
			Description: 'Evaluates a condition and branches execution to True or False.',
			Category: 'control',
			Capability: 'Flow Control',
			Action: 'Branch',
			Tier: 'Engine',
			EventInputs: [{ Name: 'Evaluate' }],
			EventOutputs: [
				{ Name: 'True' },
				{ Name: 'False' }
			],
			SettingsInputs: [
				{ Name: 'DataAddress', DataType: 'String', Required: false },
				{ Name: 'CompareValue', DataType: 'String', Required: false },
				{ Name: 'Operator', DataType: 'String', Required: false },
				{ Name: 'Expression', DataType: 'String', Required: false }
			],
			StateOutputs: [
				{ Name: 'Result', DataType: 'Boolean' }
			],
			DefaultSettings: { DataAddress: '', CompareValue: '', Operator: '==', Expression: '' }
		},
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
		Definition:
		{
			Hash: 'split-execute',
			Type: 'split-execute',
			Name: 'Split Execute',
			Description: 'Splits a string by delimiter and processes each token through a sub-graph.',
			Category: 'control',
			Capability: 'Flow Control',
			Action: 'Iterate',
			Tier: 'Engine',
			EventInputs: [
				{ Name: 'PerformSplit' },
				{ Name: 'StepComplete' }
			],
			EventOutputs: [
				{ Name: 'TokenDataSent' },
				{ Name: 'CompletedAllSubtasks' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'InputString', DataType: 'String', Required: true },
				{ Name: 'SplitDelimiter', DataType: 'String', Required: true }
			],
			StateOutputs: [
				{ Name: 'CurrentToken', DataType: 'String' },
				{ Name: 'TokenIndex', DataType: 'Number' },
				{ Name: 'TokenCount', DataType: 'Number' },
				{ Name: 'CompletedCount', DataType: 'Number' }
			],
			DefaultSettings: { InputString: '', SplitDelimiter: '\n' }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			if (pExecutionContext.TriggeringEventName === 'StepComplete')
			{
				return _handleStepComplete(pExecutionContext, fCallback);
			}

			return _handlePerformSplit(pResolvedSettings, pExecutionContext, fCallback);
		}
	},

	// ── launch-operation ───────────────────────────────────────
	{
		Definition:
		{
			Hash: 'launch-operation',
			Type: 'launch-operation',
			Name: 'Launch Operation',
			Description: 'Executes a child operation by hash, with isolated operation state.',
			Category: 'control',
			Capability: 'Flow Control',
			Action: 'LaunchOperation',
			Tier: 'Engine',
			EventInputs: [{ Name: 'Launch' }],
			EventOutputs: [
				{ Name: 'Completed' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'OperationHash', DataType: 'String', Required: true },
				{ Name: 'InputData', DataType: 'String' }
			],
			StateOutputs: [
				{ Name: 'Result', DataType: 'String' },
				{ Name: 'Status', DataType: 'String' },
				{ Name: 'ElapsedMs', DataType: 'Number' }
			],
			DefaultSettings: { OperationHash: '', InputData: '' }
		},
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
						GlobalState: JSON.parse(JSON.stringify(pExecutionContext.GlobalState || {})),
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

					tmpEngine.executeOperation(pOperation, tmpInitialState,
						function (pExecError, pContext)
						{
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
