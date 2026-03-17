/**
 * Task configurations for the "User Interaction" capability.
 *
 * Contains:
 *   - error-message   — Logs an error or warning message to the execution log.
 *   - value-input     — Pauses execution and waits for user-provided input.
 */

module.exports =
[
	// ── error-message ──────────────────────────────────────────
	{
		Definition: require('./definitions/error-message.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpMessage = pResolvedSettings.MessageTemplate || 'An error occurred.';
			let tmpLevel = (pResolvedSettings.Level || 'error').toLowerCase();

			if (tmpLevel === 'warning')
			{
				pTask.log.warn(`ErrorMessage task [${pExecutionContext.NodeHash}]: ${tmpMessage}`);
			}
			else if (tmpLevel === 'info')
			{
				pTask.log.info(`ErrorMessage task [${pExecutionContext.NodeHash}]: ${tmpMessage}`);
			}
			else if (tmpLevel === 'debug')
			{
				pTask.log.debug(`ErrorMessage task [${pExecutionContext.NodeHash}]: ${tmpMessage}`);
			}
			else
			{
				pTask.log.error(`ErrorMessage task [${pExecutionContext.NodeHash}]: ${tmpMessage}`);
			}

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: {},
				Log: [`ERROR: ${tmpMessage}`]
			});
		}
	},

	// ── value-input ────────────────────────────────────────────
	{
		Definition: require('./definitions/value-input.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpPromptMessage = pResolvedSettings.PromptMessage || 'Please provide a value:';
			let tmpOutputAddress = pResolvedSettings.OutputAddress || '';

			return fCallback(null, {
				WaitingForInput: true,
				PromptMessage: tmpPromptMessage,
				OutputAddress: tmpOutputAddress,
				InputType: pResolvedSettings.InputType || 'text',
				DefaultValue: pResolvedSettings.DefaultValue || '',
				Options: pResolvedSettings.Options || '',
				Outputs: {},
				Log: [`Waiting for input: "${tmpPromptMessage}" (-> ${tmpOutputAddress})`]
			});
		}
	}
];
