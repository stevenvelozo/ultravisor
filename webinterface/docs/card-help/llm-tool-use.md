# LLM Tool Use

Sends messages to a large language model with tool (function) definitions, enabling the LLM to request tool calls that your flow can execute.

## Settings

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

## Outputs

- **Content** — The LLM's text response (may be empty if tool calls were made).
- **ToolCalls** — JSON array of tool call objects with function names and arguments.
- **Model** — Model that generated the response.
- **FinishReason** — `stop` for normal completion, `tool_calls` when tools were invoked.
- **PromptTokens** / **CompletionTokens** — Token usage.
- **BeaconID** — Beacon worker ID.

## Events

- **Complete** — Fires when the LLM responds.
- **ToolCall** — Fires when the LLM requests a tool call.
- **Error** — Fires on failure.

## Tips

Use the ToolCall event to route tool invocations to the appropriate processing cards, then feed results back for another LLM turn. This enables agent-style workflows where the LLM can gather information and take actions through your defined tools.
