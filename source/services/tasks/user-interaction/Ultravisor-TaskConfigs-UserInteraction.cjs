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
		Definition:
		{
			Hash: 'error-message',
			Type: 'error-message',
			Name: 'Error Message',
			Description: 'Logs an error or warning message to the execution log.',
			Category: 'interaction',
			Capability: 'User Interaction',
			Action: 'ShowError',
			Tier: 'Platform',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [{ Name: 'Complete' }],
			SettingsInputs: [
				{ Name: 'MessageTemplate', DataType: 'String', Required: true }
			],
			StateOutputs: [],
			DefaultSettings: { MessageTemplate: 'An error occurred.' }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpMessage = pResolvedSettings.MessageTemplate || 'An error occurred.';
			pTask.log.error(`ErrorMessage task [${pExecutionContext.NodeHash}]: ${tmpMessage}`);

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: {},
				Log: [`ERROR: ${tmpMessage}`]
			});
		}
	},

	// ── value-input ────────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'value-input',
			Type: 'value-input',
			Name: 'Value Input',
			Description: 'Pauses execution and waits for user-provided input.',
			Category: 'interaction',
			Capability: 'User Interaction',
			Action: 'RequestInput',
			Tier: 'Platform',
			EventInputs: [{ Name: 'RequestInput' }],
			EventOutputs: [{ Name: 'ValueInputComplete' }],
			SettingsInputs: [
				{ Name: 'PromptMessage', DataType: 'String', Required: false },
				{ Name: 'OutputAddress', DataType: 'String', Required: true }
			],
			StateOutputs: [
				{ Name: 'InputValue', DataType: 'String' }
			],
			DefaultSettings: { PromptMessage: 'Please provide a value:', OutputAddress: '' }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpPromptMessage = pResolvedSettings.PromptMessage || 'Please provide a value:';
			let tmpOutputAddress = pResolvedSettings.OutputAddress || '';

			return fCallback(null, {
				WaitingForInput: true,
				PromptMessage: tmpPromptMessage,
				OutputAddress: tmpOutputAddress,
				Outputs: {},
				Log: [`Waiting for input: "${tmpPromptMessage}" (-> ${tmpOutputAddress})`]
			});
		}
	}
];
