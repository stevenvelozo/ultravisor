/**
 * Task configurations for the "User Interaction" capability.
 *
 * Contains:
 *   - add-option      — Accumulator: appends one option to a growing list.
 *   - error-message   — Logs an error or warning message to the execution log.
 *   - value-input     — Pauses execution and waits for user-provided input.
 */

module.exports =
[
	// ── add-option (accumulator) ──────────────────────────────
	{
		Definition: require('./definitions/add-option.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpLabel = pResolvedSettings.Label || '';
			let tmpValue = pResolvedSettings.Value || '';
			let tmpListAddress = pResolvedSettings.ListAddress;

			if (!tmpListAddress)
			{
				return fCallback(null, {
					EventToFire: 'Complete',
					Outputs: { Options: [] },
					Log: ['AddOption: no ListAddress specified.']
				});
			}

			// Read existing accumulated list from state
			let tmpList = [];
			if (pExecutionContext.StateManager)
			{
				let tmpExisting = pExecutionContext.StateManager.resolveAddress(tmpListAddress, pExecutionContext, pExecutionContext.NodeHash);
				if (Array.isArray(tmpExisting))
				{
					tmpList = tmpExisting.slice();
				}
			}

			// Append new option
			tmpList.push({ Label: tmpLabel || tmpValue, Value: tmpValue });

			let tmpStateWrites = {};
			tmpStateWrites[tmpListAddress] = tmpList;

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: { Options: tmpList },
				StateWrites: tmpStateWrites,
				Log: [`AddOption: appended "${tmpLabel || tmpValue}" (${tmpList.length} options total)`]
			});
		}
	},

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

			// Options: accept array (accumulator pattern) or JSON string (legacy)
			let tmpOptions = pResolvedSettings.Options || '';
			if (Array.isArray(tmpOptions))
			{
				tmpOptions = JSON.stringify(tmpOptions);
			}

			return fCallback(null, {
				WaitingForInput: true,
				PromptMessage: tmpPromptMessage,
				OutputAddress: tmpOutputAddress,
				InputType: pResolvedSettings.InputType || 'text',
				DefaultValue: pResolvedSettings.DefaultValue || '',
				Options: tmpOptions,
				Outputs: {},
				Log: [`Waiting for input: "${tmpPromptMessage}" (-> ${tmpOutputAddress})`]
			});
		}
	}
];
