/**
 * Task configurations for the "LLM" capability.
 *
 * Contains:
 *   - llm-chat-completion   — Send messages to an LLM with conversation management.
 *   - llm-embedding         — Generate embeddings for text.
 *   - llm-tool-use          — Chat completion with tool/function definitions.
 *
 * All three tasks dispatch work to a remote Beacon with LLM capability
 * using the WaitingForInput/resume pattern from beacon-dispatch.
 */


/**
 * Get a named service from the Fable services map.
 */
function _getService(pTask, pTypeName)
{
	return pTask.fable.servicesMap[pTypeName]
		? Object.values(pTask.fable.servicesMap[pTypeName])[0]
		: null;
}

/**
 * Build the Messages array for the LLM from resolved settings,
 * incorporating conversation history if configured.
 *
 * @param {object} pResolvedSettings - The resolved task settings.
 * @param {object} pExecutionContext - The runtime execution context.
 * @param {object} pStateManager - The Ultravisor StateManager service.
 * @param {string} pCurrentNodeHash - Current node hash for state resolution.
 * @returns {Array} The messages array to send to the LLM.
 */
function _buildMessages(pResolvedSettings, pExecutionContext, pStateManager, pCurrentNodeHash)
{
	let tmpMessages = [];

	// 1. Load conversation history if ConversationAddress is set
	let tmpConversationAddress = pResolvedSettings.ConversationAddress || '';

	if (tmpConversationAddress)
	{
		let tmpHistory = pStateManager.resolveAddress(tmpConversationAddress, pExecutionContext, pCurrentNodeHash);

		if (Array.isArray(tmpHistory))
		{
			tmpMessages = tmpHistory.slice();
		}
	}

	// 2. If Messages JSON is provided, use it (overrides history for direct control)
	if (pResolvedSettings.Messages)
	{
		let tmpParsed = _safeParseJSON(pResolvedSettings.Messages, null);

		if (Array.isArray(tmpParsed))
		{
			// If we have conversation history, append these messages to it
			if (tmpMessages.length > 0)
			{
				tmpMessages = tmpMessages.concat(tmpParsed);
			}
			else
			{
				tmpMessages = tmpParsed;
			}
		}
	}

	// 3. SystemPrompt convenience — prepend if not already present
	if (pResolvedSettings.SystemPrompt)
	{
		let tmpHasSystem = tmpMessages.some(function (pMsg) { return pMsg.role === 'system'; });

		if (!tmpHasSystem)
		{
			tmpMessages.unshift({ role: 'system', content: pResolvedSettings.SystemPrompt });
		}
	}

	// 4. UserPrompt convenience — append as user message
	if (pResolvedSettings.UserPrompt)
	{
		let tmpUserContent = pResolvedSettings.UserPrompt;

		// If InputAddress is set, read context data and inject it
		if (pResolvedSettings.InputAddress)
		{
			let tmpInputData = pStateManager.resolveAddress(
				pResolvedSettings.InputAddress, pExecutionContext, pCurrentNodeHash);

			if (tmpInputData !== undefined)
			{
				let tmpInputStr = (typeof tmpInputData === 'string')
					? tmpInputData
					: JSON.stringify(tmpInputData);
				tmpUserContent = tmpUserContent + '\n\n' + tmpInputStr;
			}
		}

		tmpMessages.push({ role: 'user', content: tmpUserContent });
	}
	else if (pResolvedSettings.InputAddress && !pResolvedSettings.Messages)
	{
		// InputAddress without UserPrompt — send input data as the user message
		let tmpInputData = pStateManager.resolveAddress(
			pResolvedSettings.InputAddress, pExecutionContext, pCurrentNodeHash);

		if (tmpInputData !== undefined)
		{
			let tmpInputStr = (typeof tmpInputData === 'string')
				? tmpInputData
				: JSON.stringify(tmpInputData);
			tmpMessages.push({ role: 'user', content: tmpInputStr });
		}
	}

	// 5. Apply conversation limits
	tmpMessages = _applyConversationLimits(tmpMessages, pResolvedSettings);

	return tmpMessages;
}

/**
 * Apply conversation history limits (max messages, max tokens).
 * Preserves system messages and trims from the oldest non-system messages.
 */
function _applyConversationLimits(pMessages, pSettings)
{
	let tmpMaxMessages = parseInt(pSettings.ConversationMaxMessages, 10);
	let tmpMaxTokens = parseInt(pSettings.ConversationMaxTokens, 10);

	if (!tmpMaxMessages && !tmpMaxTokens)
	{
		return pMessages;
	}

	// Separate system messages from the rest
	let tmpSystemMessages = [];
	let tmpOtherMessages = [];

	for (let i = 0; i < pMessages.length; i++)
	{
		if (pMessages[i].role === 'system')
		{
			tmpSystemMessages.push(pMessages[i]);
		}
		else
		{
			tmpOtherMessages.push(pMessages[i]);
		}
	}

	// Apply max messages limit (trim oldest first)
	if (tmpMaxMessages > 0 && tmpOtherMessages.length > tmpMaxMessages)
	{
		tmpOtherMessages = tmpOtherMessages.slice(tmpOtherMessages.length - tmpMaxMessages);
	}

	// Apply rough token limit (estimate ~4 chars per token)
	if (tmpMaxTokens > 0)
	{
		let tmpCharBudget = tmpMaxTokens * 4;
		let tmpTotalChars = 0;

		// Count backwards from newest, keep messages that fit
		let tmpKeptMessages = [];

		for (let i = tmpOtherMessages.length - 1; i >= 0; i--)
		{
			let tmpContentLength = (tmpOtherMessages[i].content || '').length;
			tmpTotalChars += tmpContentLength;

			if (tmpTotalChars > tmpCharBudget)
			{
				break;
			}

			tmpKeptMessages.unshift(tmpOtherMessages[i]);
		}

		tmpOtherMessages = tmpKeptMessages;
	}

	return tmpSystemMessages.concat(tmpOtherMessages);
}

/**
 * After receiving a response, update conversation history in state.
 */
function _updateConversationHistory(pResolvedSettings, pExecutionContext, pStateManager, pCurrentNodeHash, pUserMessages, pAssistantContent)
{
	let tmpConversationAddress = pResolvedSettings.ConversationAddress || '';

	if (!tmpConversationAddress)
	{
		return;
	}

	let tmpAppend = pResolvedSettings.AppendToConversation;

	// Default to true if ConversationAddress is set
	if (tmpAppend === undefined || tmpAppend === '')
	{
		tmpAppend = true;
	}
	else
	{
		tmpAppend = (tmpAppend === true || tmpAppend === 'true');
	}

	if (!tmpAppend)
	{
		return;
	}

	// Get current history (may have been modified by _buildMessages limits)
	let tmpHistory = pStateManager.resolveAddress(tmpConversationAddress, pExecutionContext, pCurrentNodeHash);

	if (!Array.isArray(tmpHistory))
	{
		tmpHistory = [];
	}

	// Find user messages that were added in this turn (after existing history)
	// We reconstruct by adding the UserPrompt and assistant response
	if (pResolvedSettings.UserPrompt || pResolvedSettings.InputAddress)
	{
		let tmpUserContent = pResolvedSettings.UserPrompt || '';

		if (pResolvedSettings.InputAddress)
		{
			let tmpInputData = pStateManager.resolveAddress(
				pResolvedSettings.InputAddress, pExecutionContext, pCurrentNodeHash);
			if (tmpInputData !== undefined)
			{
				let tmpInputStr = (typeof tmpInputData === 'string')
					? tmpInputData
					: JSON.stringify(tmpInputData);
				tmpUserContent = tmpUserContent
					? (tmpUserContent + '\n\n' + tmpInputStr)
					: tmpInputStr;
			}
		}

		if (tmpUserContent)
		{
			tmpHistory.push({ role: 'user', content: tmpUserContent });
		}
	}

	// Add the assistant response
	if (pAssistantContent)
	{
		tmpHistory.push({ role: 'assistant', content: pAssistantContent });
	}

	// Ensure system prompt is in history if not already
	if (pResolvedSettings.SystemPrompt)
	{
		let tmpHasSystem = tmpHistory.some(function (pMsg) { return pMsg.role === 'system'; });
		if (!tmpHasSystem)
		{
			tmpHistory.unshift({ role: 'system', content: pResolvedSettings.SystemPrompt });
		}
	}

	// Write updated history back to state
	pStateManager.setAddress(tmpConversationAddress, tmpHistory, pExecutionContext, pCurrentNodeHash);

	// Persist to GlobalState if configured
	if (pResolvedSettings.PersistConversation === true || pResolvedSettings.PersistConversation === 'true')
	{
		let tmpPersistAddress = pResolvedSettings.ConversationPersistAddress || '';

		if (tmpPersistAddress)
		{
			pStateManager.setAddress(tmpPersistAddress, tmpHistory, pExecutionContext, pCurrentNodeHash);
		}
	}
}

/**
 * Safely parse JSON, returning fallback on failure.
 */
function _safeParseJSON(pString, pFallback)
{
	if (!pString || typeof pString !== 'string')
	{
		return pFallback;
	}

	try
	{
		return JSON.parse(pString);
	}
	catch (pError)
	{
		return pFallback;
	}
}


module.exports =
[
	// ── llm-chat-completion ───────────────────────────────────
	{
		Definition: require('./definitions/llm-chat-completion.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpCoordinator = _getService(pTask, 'UltravisorBeaconCoordinator');

			if (!tmpCoordinator)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { Content: 'BeaconCoordinator service not available.', Model: '', PromptTokens: 0, CompletionTokens: 0, FinishReason: 'error', BeaconID: '' },
					Log: ['LLM Chat Completion: BeaconCoordinator service not found.']
				});
			}

			let tmpBeacons = tmpCoordinator.listBeacons();

			if (tmpBeacons.length === 0)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { Content: 'No Beacon workers are registered.', Model: '', PromptTokens: 0, CompletionTokens: 0, FinishReason: 'error', BeaconID: '' },
					Log: ['LLM Chat Completion: no Beacon workers registered.']
				});
			}

			let tmpStateManager = _getService(pTask, 'UltravisorStateManager');

			// Build messages with conversation history
			let tmpMessages = tmpStateManager
				? _buildMessages(pResolvedSettings, pExecutionContext, tmpStateManager, pExecutionContext.NodeHash)
				: _safeParseJSON(pResolvedSettings.Messages, []);

			if (!tmpMessages || tmpMessages.length === 0)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { Content: 'No messages to send.', Model: '', PromptTokens: 0, CompletionTokens: 0, FinishReason: 'error', BeaconID: '' },
					Log: ['LLM Chat Completion: no messages assembled. Provide UserPrompt, Messages, or ConversationAddress with existing history.']
				});
			}

			// Build work item for the Beacon
			let tmpWorkItemInfo = {
				RunHash: pExecutionContext.RunHash,
				NodeHash: pExecutionContext.NodeHash,
				OperationHash: pExecutionContext.OperationHash,
				Capability: 'LLM',
				Action: 'ChatCompletion',
				Settings: {
					Messages: JSON.stringify(tmpMessages),
					SystemPrompt: '', // Already incorporated into messages
					Model: pResolvedSettings.Model || '',
					Temperature: pResolvedSettings.Temperature,
					MaxTokens: pResolvedSettings.MaxTokens,
					TopP: pResolvedSettings.TopP,
					StopSequences: pResolvedSettings.StopSequences || '',
					ResponseFormat: pResolvedSettings.ResponseFormat || ''
				},
				AffinityKey: pResolvedSettings.AffinityKey || '',
				TimeoutMs: pResolvedSettings.TimeoutMs || 120000
			};

			let tmpWorkItem = tmpCoordinator.enqueueWorkItem(tmpWorkItemInfo);

			pTask.log.info(`LLM Chat Completion: enqueued work item [${tmpWorkItem.WorkItemHash}] with ${tmpMessages.length} messages` +
				(pResolvedSettings.AffinityKey ? ` (affinity: ${pResolvedSettings.AffinityKey})` : ''));

			// Store settings context for post-completion processing
			// The execution engine will call this task's onResume handler
			pExecutionContext._LLMChatSettings = pExecutionContext._LLMChatSettings || {};
			pExecutionContext._LLMChatSettings[pExecutionContext.NodeHash] = {
				ResolvedSettings: pResolvedSettings,
				MessagesBeforeResponse: tmpMessages
			};

			return fCallback(null, {
				WaitingForInput: true,
				ResumeEventName: 'Complete',
				PromptMessage: `Waiting for LLM response (${tmpMessages.length} messages)`,
				OutputAddress: '',
				Outputs: {},
				Log: [
					`LLM Chat Completion: dispatched to work queue as [${tmpWorkItem.WorkItemHash}].`,
					`Messages: ${tmpMessages.length}, Model: ${pResolvedSettings.Model || '(default)'}`,
					pResolvedSettings.ConversationAddress ? `Conversation: ${pResolvedSettings.ConversationAddress}` : ''
				].filter(Boolean),
				// Post-completion handler: update conversation history and write to destination
				OnResumeWithOutputs: function (pOutputs)
				{
					if (tmpStateManager && pResolvedSettings.ConversationAddress)
					{
						_updateConversationHistory(
							pResolvedSettings, pExecutionContext, tmpStateManager,
							pExecutionContext.NodeHash, tmpMessages,
							(pOutputs && pOutputs.Content) ? pOutputs.Content : '');
					}

					// Write to destination if configured
					if (tmpStateManager && pResolvedSettings.Destination && pOutputs && pOutputs.Content)
					{
						tmpStateManager.setAddress(
							pResolvedSettings.Destination, pOutputs.Content,
							pExecutionContext, pExecutionContext.NodeHash);
					}
				}
			});
		}
	},

	// ── llm-embedding ─────────────────────────────────────────
	{
		Definition: require('./definitions/llm-embedding.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpCoordinator = _getService(pTask, 'UltravisorBeaconCoordinator');

			if (!tmpCoordinator)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { Embedding: '[]', Dimensions: 0, Model: '', BeaconID: '' },
					Log: ['LLM Embedding: BeaconCoordinator service not found.']
				});
			}

			let tmpBeacons = tmpCoordinator.listBeacons();

			if (tmpBeacons.length === 0)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { Embedding: '[]', Dimensions: 0, Model: '', BeaconID: '' },
					Log: ['LLM Embedding: no Beacon workers registered.']
				});
			}

			// Resolve text from InputAddress or direct Text setting
			let tmpText = pResolvedSettings.Text || '';
			let tmpStateManager = _getService(pTask, 'UltravisorStateManager');

			if (!tmpText && pResolvedSettings.InputAddress && tmpStateManager)
			{
				let tmpInputData = tmpStateManager.resolveAddress(
					pResolvedSettings.InputAddress, pExecutionContext, pExecutionContext.NodeHash);

				if (tmpInputData !== undefined)
				{
					tmpText = (typeof tmpInputData === 'string')
						? tmpInputData
						: JSON.stringify(tmpInputData);
				}
			}

			if (!tmpText)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { Embedding: '[]', Dimensions: 0, Model: '', BeaconID: '' },
					Log: ['LLM Embedding: no text provided. Set Text or InputAddress.']
				});
			}

			let tmpWorkItemInfo = {
				RunHash: pExecutionContext.RunHash,
				NodeHash: pExecutionContext.NodeHash,
				OperationHash: pExecutionContext.OperationHash,
				Capability: 'LLM',
				Action: 'Embedding',
				Settings: {
					Text: tmpText,
					Model: pResolvedSettings.Model || '',
					Dimensions: pResolvedSettings.Dimensions || 0
				},
				AffinityKey: pResolvedSettings.AffinityKey || '',
				TimeoutMs: pResolvedSettings.TimeoutMs || 60000
			};

			let tmpWorkItem = tmpCoordinator.enqueueWorkItem(tmpWorkItemInfo);

			pTask.log.info(`LLM Embedding: enqueued work item [${tmpWorkItem.WorkItemHash}]`);

			return fCallback(null, {
				WaitingForInput: true,
				ResumeEventName: 'Complete',
				PromptMessage: 'Waiting for LLM embedding generation',
				OutputAddress: '',
				Outputs: {},
				Log: [`LLM Embedding: dispatched to work queue as [${tmpWorkItem.WorkItemHash}].`],
				OnResumeWithOutputs: function (pOutputs)
				{
					if (tmpStateManager && pResolvedSettings.Destination && pOutputs && pOutputs.Embedding)
					{
						tmpStateManager.setAddress(
							pResolvedSettings.Destination, pOutputs.Embedding,
							pExecutionContext, pExecutionContext.NodeHash);
					}
				}
			});
		}
	},

	// ── llm-tool-use ──────────────────────────────────────────
	{
		Definition: require('./definitions/llm-tool-use.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpCoordinator = _getService(pTask, 'UltravisorBeaconCoordinator');

			if (!tmpCoordinator)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { Content: 'BeaconCoordinator service not available.', ToolCalls: '[]', Model: '', FinishReason: 'error', PromptTokens: 0, CompletionTokens: 0, BeaconID: '' },
					Log: ['LLM Tool Use: BeaconCoordinator service not found.']
				});
			}

			let tmpBeacons = tmpCoordinator.listBeacons();

			if (tmpBeacons.length === 0)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { Content: 'No Beacon workers are registered.', ToolCalls: '[]', Model: '', FinishReason: 'error', PromptTokens: 0, CompletionTokens: 0, BeaconID: '' },
					Log: ['LLM Tool Use: no Beacon workers registered.']
				});
			}

			let tmpStateManager = _getService(pTask, 'UltravisorStateManager');

			// Build messages with conversation history
			let tmpMessages = tmpStateManager
				? _buildMessages(pResolvedSettings, pExecutionContext, tmpStateManager, pExecutionContext.NodeHash)
				: _safeParseJSON(pResolvedSettings.Messages, []);

			if (!tmpMessages || tmpMessages.length === 0)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { Content: 'No messages to send.', ToolCalls: '[]', Model: '', FinishReason: 'error', PromptTokens: 0, CompletionTokens: 0, BeaconID: '' },
					Log: ['LLM Tool Use: no messages assembled.']
				});
			}

			let tmpWorkItemInfo = {
				RunHash: pExecutionContext.RunHash,
				NodeHash: pExecutionContext.NodeHash,
				OperationHash: pExecutionContext.OperationHash,
				Capability: 'LLM',
				Action: 'ToolUse',
				Settings: {
					Messages: JSON.stringify(tmpMessages),
					Tools: pResolvedSettings.Tools || '[]',
					Model: pResolvedSettings.Model || '',
					ToolChoice: pResolvedSettings.ToolChoice || 'auto',
					Temperature: pResolvedSettings.Temperature,
					MaxTokens: pResolvedSettings.MaxTokens
				},
				AffinityKey: pResolvedSettings.AffinityKey || '',
				TimeoutMs: pResolvedSettings.TimeoutMs || 120000
			};

			let tmpWorkItem = tmpCoordinator.enqueueWorkItem(tmpWorkItemInfo);

			pTask.log.info(`LLM Tool Use: enqueued work item [${tmpWorkItem.WorkItemHash}] with ${tmpMessages.length} messages`);

			return fCallback(null, {
				WaitingForInput: true,
				ResumeEventName: 'Complete',
				PromptMessage: `Waiting for LLM tool use response (${tmpMessages.length} messages)`,
				OutputAddress: '',
				Outputs: {},
				Log: [
					`LLM Tool Use: dispatched to work queue as [${tmpWorkItem.WorkItemHash}].`,
					`Messages: ${tmpMessages.length}, Model: ${pResolvedSettings.Model || '(default)'}`,
					pResolvedSettings.ConversationAddress ? `Conversation: ${pResolvedSettings.ConversationAddress}` : ''
				].filter(Boolean),
				OnResumeWithOutputs: function (pOutputs)
				{
					if (tmpStateManager && pResolvedSettings.ConversationAddress)
					{
						_updateConversationHistory(
							pResolvedSettings, pExecutionContext, tmpStateManager,
							pExecutionContext.NodeHash, tmpMessages,
							(pOutputs && pOutputs.Content) ? pOutputs.Content : '');
					}

					if (tmpStateManager && pResolvedSettings.Destination && pOutputs && pOutputs.Content)
					{
						tmpStateManager.setAddress(
							pResolvedSettings.Destination, pOutputs.Content,
							pExecutionContext, pExecutionContext.NodeHash);
					}
				}
			});
		}
	}
];
