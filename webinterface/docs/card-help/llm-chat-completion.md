# LLM Chat Completion

Sends messages to a large language model and returns the completion. Supports multi-turn conversation history with persistence across operation runs.

## Settings

- **SystemPrompt** — System prompt text that sets the LLM's behavior and context.
- **UserPrompt** — User prompt text for the current turn.
- **Messages** — JSON array of message objects `[{role, content}]` for direct control over the conversation. Overrides SystemPrompt/UserPrompt when set.
- **Model** — Override the default model name.
- **Temperature** — Sampling temperature (0–2). Lower values are more deterministic.
- **MaxTokens** — Maximum tokens to generate (default `4096`).
- **TopP** — Nucleus sampling parameter.
- **StopSequences** — JSON array of sequences that stop generation.
- **ResponseFormat** — Set to `json_object` to force JSON output.
- **InputAddress** — State address to read additional context data from (appended to UserPrompt).
- **Destination** — State address to write the completion text to.

## Conversation History

- **ConversationAddress** — State address to store message history for multi-turn conversations.
- **AppendToConversation** — Append this exchange to history (default `true` when ConversationAddress is set).
- **ConversationMaxMessages** — Sliding window: maximum non-system messages to keep.
- **ConversationMaxTokens** — Token budget for history (approximate, trims oldest messages).
- **PersistConversation** — Copy conversation history to GlobalState for cross-operation persistence.
- **ConversationPersistAddress** — GlobalState address for persistence.

## Dispatch

- **AffinityKey** — Route to a specific Beacon worker for consistent model access.
- **TimeoutMs** — Timeout in milliseconds (default `120000`).

## Outputs

- **Content** — The LLM's response text.
- **Model** — Model that generated the response.
- **PromptTokens** / **CompletionTokens** / **TotalTokens** — Token usage statistics.
- **FinishReason** — Why the completion ended (`stop`, `length`, etc.).
- **BeaconID** — ID of the Beacon worker that executed the request.

## Tips

Use ConversationAddress with PersistConversation to build chatbots that maintain context across multiple operation runs. Set ResponseFormat to `json_object` when you need structured output that downstream cards can parse. Use Temperature `0` for deterministic, reproducible results.
