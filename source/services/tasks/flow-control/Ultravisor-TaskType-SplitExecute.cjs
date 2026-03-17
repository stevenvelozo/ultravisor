const libTaskTypeBase = require('../Ultravisor-TaskType-Base.cjs');

/**
 * SplitExecute Task Type
 *
 * Splits an input string by a delimiter and fires an event for each token.
 * Operates as a state machine: each invocation processes exactly one token.
 *
 * Flow (driven by graph connections):
 *   PerformSplit  -> split input, store tokens, emit first token via TokenDataSent
 *   StepComplete  -> advance to next token, emit via TokenDataSent
 *                    (or fire CompletedAllSubtasks when all tokens are done)
 *
 * The loop is driven by explicit graph connections:
 *   SplitExecute.TokenDataSent -> downstream tasks -> ... -> SplitExecute.StepComplete
 *
 * State is persisted between invocations in TaskOutputs[NodeHash]:
 *   _Tokens        {Array}  - the split token array (internal)
 *   CurrentToken   {string} - the current token being processed
 *   TokenIndex     {number} - 0-based index of the current token
 *   TokenCount     {number} - total number of tokens
 *   CompletedCount {number} - number of tokens fully processed
 */
class UltravisorTaskTypeSplitExecute extends libTaskTypeBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'UltravisorTaskTypeSplitExecute';
	}

	get definition()
	{
		return require('./definitions/split-execute.json');
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		let tmpTriggeringEvent = pExecutionContext.TriggeringEventName;

		if (tmpTriggeringEvent === 'StepComplete')
		{
			return this._handleStepComplete(pExecutionContext, fCallback);
		}

		// Default: PerformSplit (initial trigger)
		return this._handlePerformSplit(pResolvedSettings, pExecutionContext, fCallback);
	}

	/**
	 * Handle the PerformSplit event: split input and emit the first token.
	 */
	_handlePerformSplit(pResolvedSettings, pExecutionContext, fCallback)
	{
		let tmpInputString = pResolvedSettings.InputString;
		let tmpDelimiter = pResolvedSettings.SplitDelimiter;

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
		if (pResolvedSettings.TrimTokens)
		{
			tmpTokens = tmpTokens.map(function (pT) { return pT.trim(); });
		}
		if (pResolvedSettings.SkipEmpty)
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
	 * Handle the StepComplete event: advance to the next token or finish.
	 */
	_handleStepComplete(pExecutionContext, fCallback)
	{
		let tmpStoredState = pExecutionContext.TaskOutputs[pExecutionContext.NodeHash] || {};
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
			// All tokens processed
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
}

module.exports = UltravisorTaskTypeSplitExecute;
