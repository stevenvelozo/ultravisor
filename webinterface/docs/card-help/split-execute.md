# Split Execute

Splits a string by a delimiter and processes each token through a sub-graph, acting as a loop iterator within the flow.

## Settings

- **InputString** — The string to split. Supports Pict template expressions.
- **SplitDelimiter** — Delimiter to split on (default newline `\n`).
- **SkipEmpty** — When `true`, skips empty tokens after splitting.
- **TrimTokens** — When `true`, trims whitespace from each token.

## Outputs

- **CurrentToken** — The current token being processed.
- **TokenIndex** — Zero-based index of the current token.
- **TokenCount** — Total number of tokens.
- **CompletedCount** — Number of tokens processed so far.

## Events

- **TokenDataSent** — Fires for each token, sending it through the sub-graph.
- **CompletedAllSubtasks** — Fires after all tokens have been processed.
- **Error** — Fires on failure.

## How It Works

1. The input string is split into tokens by the delimiter.
2. For each token, **TokenDataSent** fires with the token data in state.
3. Connect the downstream processing graph to TokenDataSent.
4. Wire the end of your processing graph back to the **StepComplete** event input to advance to the next token.
5. After all tokens are processed, **CompletedAllSubtasks** fires.

## Tips

Split Execute is the primary looping mechanism in Ultravisor flows. Use it with **List Files** output to process each file, or with newline-delimited text to process line-by-line.
