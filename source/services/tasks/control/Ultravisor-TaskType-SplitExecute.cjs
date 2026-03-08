const libTaskTypeBase = require('../Ultravisor-TaskType-Base.cjs');

/**
 * SplitExecute Task Type
 *
 * Splits an input string by a delimiter and fires an event for each token.
 * Uses the fFireIntermediateEvent callback to process the downstream
 * sub-graph for each token before moving to the next.
 *
 * Flow:
 *   PerformSplit -> (for each token) TokenDataSent -> downstream sub-graph
 *                   (waits for StepComplete from sub-graph)
 *                -> CompletedAllSubtasks
 *
 * The StepComplete event input is used to signal that the downstream
 * sub-graph has finished processing the current token.
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
		return {
			Hash: 'split-execute',
			Type: 'split-execute',
			Name: 'Split Execute',
			Description: 'Splits a string by delimiter and processes each token through a sub-graph.',
			Category: 'control',

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
		};
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
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
		let tmpTokenCount = tmpTokens.length;
		let tmpCompletedCount = 0;
		let tmpLog = [`Splitting input (${tmpInputString.length} chars) by "${tmpDelimiter}" into ${tmpTokenCount} tokens.`];

		if (tmpTokenCount === 0)
		{
			return fCallback(null, {
				EventToFire: 'CompletedAllSubtasks',
				Outputs: { CurrentToken: '', TokenIndex: 0, TokenCount: 0, CompletedCount: 0 },
				Log: tmpLog.concat(['No tokens to process.'])
			});
		}

		if (typeof(fFireIntermediateEvent) !== 'function')
		{
			// Without intermediate event support, just fire the completion
			return fCallback(null, {
				EventToFire: 'CompletedAllSubtasks',
				Outputs: {
					CurrentToken: tmpTokens[tmpTokens.length - 1],
					TokenIndex: tmpTokenCount - 1,
					TokenCount: tmpTokenCount,
					CompletedCount: tmpTokenCount
				},
				Log: tmpLog.concat(['No intermediate event handler available; skipping per-token processing.'])
			});
		}

		// Process tokens sequentially via fFireIntermediateEvent
		let fProcessToken = (pIndex) =>
		{
			if (pIndex >= tmpTokenCount)
			{
				// All tokens processed
				return fCallback(null, {
					EventToFire: 'CompletedAllSubtasks',
					Outputs: {
						CurrentToken: tmpTokens[tmpTokenCount - 1],
						TokenIndex: tmpTokenCount - 1,
						TokenCount: tmpTokenCount,
						CompletedCount: tmpCompletedCount
					},
					Log: tmpLog
				});
			}

			let tmpCurrentToken = tmpTokens[pIndex];
			let tmpOutputs = {
				CurrentToken: tmpCurrentToken,
				TokenIndex: pIndex,
				TokenCount: tmpTokenCount,
				CompletedCount: tmpCompletedCount
			};

			tmpLog.push(`Processing token ${pIndex + 1}/${tmpTokenCount}: "${tmpCurrentToken.substring(0, 50)}"`);

			// Fire intermediate event and wait for sub-graph to complete
			fFireIntermediateEvent('TokenDataSent', tmpOutputs,
				() =>
				{
					tmpCompletedCount++;
					// Process next token
					fProcessToken(pIndex + 1);
				});
		};

		// Start processing from the first token
		fProcessToken(0);
	}
}

module.exports = UltravisorTaskTypeSplitExecute;
