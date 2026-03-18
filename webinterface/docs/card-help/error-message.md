# Error Message

Logs an error, warning, info, or debug message to the execution log. Use this card to emit diagnostic information during flow execution without halting the workflow.

## Settings

- **MessageTemplate** — The message text to log. Supports Pict template expressions for including state values (default: "An error occurred.").
- **Level** — Log level: `error`, `warning`, `info`, or `debug` (default `error`).

## Events

- **Complete** — Fires after the message is logged. Execution continues normally.

## Tips

Error Message does not stop the flow — it only records a log entry. Place it on error branches to capture diagnostic context when failures occur. Use the `info` level for progress markers and `debug` for development-time tracing.
