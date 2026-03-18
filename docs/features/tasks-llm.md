# LLM Tasks

Tasks for integrating with large language models, including chat completions, embeddings, and tool use. These tasks dispatch work to Beacon workers with LLM capability.

---

## LLM Chat Completion

Sends messages to a large language model and returns the completion. Supports multi-turn conversation history with persistence across operation runs.

### Settings

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

### Conversation History

- **ConversationAddress** — State address to store message history for multi-turn conversations.
- **AppendToConversation** — Append this exchange to history (default `true` when ConversationAddress is set).
- **ConversationMaxMessages** — Sliding window: maximum non-system messages to keep.
- **ConversationMaxTokens** — Token budget for history (approximate, trims oldest messages).
- **PersistConversation** — Copy conversation history to GlobalState for cross-operation persistence.
- **ConversationPersistAddress** — GlobalState address for persistence.

### Dispatch

- **AffinityKey** — Route to a specific Beacon worker for consistent model access.
- **TimeoutMs** — Timeout in milliseconds (default `120000`).

### Outputs

- **Content** — The LLM's response text.
- **Model** — Model that generated the response.
- **PromptTokens** / **CompletionTokens** / **TotalTokens** — Token usage statistics.
- **FinishReason** — Why the completion ended (`stop`, `length`, etc.).
- **BeaconID** — ID of the Beacon worker that executed the request.

### Tips

Use ConversationAddress with PersistConversation to build chatbots that maintain context across multiple operation runs. Set ResponseFormat to `json_object` when you need structured output that downstream cards can parse. Use Temperature `0` for deterministic, reproducible results.

---

## LLM Embedding

Generates vector embeddings for text input using an LLM provider. Dispatches the work to a Beacon with LLM capability.

### Settings

- **Text** — The text to embed. Supports Pict template expressions.
- **Model** — Override the default embedding model.
- **Dimensions** — Requested embedding dimensions (model-dependent).
- **InputAddress** — State address to read text from (alternative to Text setting).
- **Destination** — State address to write the embedding vector to.
- **AffinityKey** — Route to a specific Beacon worker.
- **TimeoutMs** — Timeout in milliseconds (default `60000`).

### Outputs

- **Embedding** — JSON array of floating-point numbers representing the embedding vector.
- **Dimensions** — Number of dimensions in the embedding.
- **Model** — Model used for embedding.
- **BeaconID** — ID of the Beacon that executed the work.

### Tips

Use embeddings for semantic search, clustering, or similarity comparisons. Store embeddings in a database via **Meadow Create** for later retrieval. Combine with **Expression Solver** or downstream processing to compute cosine similarity between vectors.

---

## LLM Tool Use

Sends messages to a large language model with tool (function) definitions, enabling the LLM to request tool calls that your flow can execute.

### Settings

- **SystemPrompt** — System prompt text.
- **UserPrompt** — User prompt text.
- **Messages** — JSON array of messages for direct conversation control.
- **Tools** — JSON array of tool definitions describing available functions the LLM can call.
- **Model** — Override model name.
- **ToolChoice** — `auto` (LLM decides), `none` (no tools), or a specific tool name (default `auto`).
- **Temperature** — Sampling temperature.
- **MaxTokens** — Maximum tokens to generate.
- **ConversationAddress** — State address for multi-turn history.
- **AppendToConversation** — Append this exchange to history.
- **InputAddress** — State address to read context data from.
- **Destination** — State address to write completion content.
- **AffinityKey** — Route to a specific Beacon worker.
- **TimeoutMs** — Timeout in milliseconds (default `120000`).

### Outputs

- **Content** — The LLM's text response (may be empty if tool calls were made).
- **ToolCalls** — JSON array of tool call objects with function names and arguments.
- **Model** — Model that generated the response.
- **FinishReason** — `stop` for normal completion, `tool_calls` when tools were invoked.
- **PromptTokens** / **CompletionTokens** — Token usage.
- **BeaconID** — Beacon worker ID.

### Events

- **Complete** — Fires when the LLM responds.
- **ToolCall** — Fires when the LLM requests a tool call.
- **Error** — Fires on failure.

### Tips

Use the ToolCall event to route tool invocations to the appropriate processing cards, then feed results back for another LLM turn. This enables agent-style workflows where the LLM can gather information and take actions through your defined tools.
