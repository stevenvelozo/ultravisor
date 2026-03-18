# Flow Control Tasks

Tasks for branching, looping, launching sub-operations, and executing shell commands to control the flow of execution.

---

## If Conditional

Evaluates a condition and branches execution to the True or False output. This is the primary decision-making card in a flow.

### Settings

- **DataAddress** — State address of the value to test.
- **CompareValue** — Value to compare against.
- **Operator** — Comparison operator: `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `startsWith`, `endsWith`. Default `==`.
- **Expression** — A full expression string. When set, DataAddress/CompareValue/Operator are ignored and the expression is evaluated directly.

### Outputs

- **Result** — Boolean result of the evaluation.

### Events

- **True** — Fires when the condition is true.
- **False** — Fires when the condition is false.

### Tips

Use Expression for complex conditions that combine multiple state values. For simple equality checks, DataAddress + CompareValue + Operator is more readable. The False output is positioned at the bottom of the card for visual clarity in flow diagrams.

---

## Split Execute

Splits a string by a delimiter and processes each token through a sub-graph, acting as a loop iterator within the flow.

### Settings

- **InputString** — The string to split. Supports Pict template expressions.
- **SplitDelimiter** — Delimiter to split on (default newline `\n`).
- **SkipEmpty** — When `true`, skips empty tokens after splitting.
- **TrimTokens** — When `true`, trims whitespace from each token.

### Outputs

- **CurrentToken** — The current token being processed.
- **TokenIndex** — Zero-based index of the current token.
- **TokenCount** — Total number of tokens.
- **CompletedCount** — Number of tokens processed so far.

### Events

- **TokenDataSent** — Fires for each token, sending it through the sub-graph.
- **CompletedAllSubtasks** — Fires after all tokens have been processed.
- **Error** — Fires on failure.

### How It Works

1. The input string is split into tokens by the delimiter.
2. For each token, **TokenDataSent** fires with the token data in state.
3. Connect the downstream processing graph to TokenDataSent.
4. Wire the end of your processing graph back to the **StepComplete** event input to advance to the next token.
5. After all tokens are processed, **CompletedAllSubtasks** fires.

### Tips

Split Execute is the primary looping mechanism in Ultravisor flows. Use it with **List Files** output to process each file, or with newline-delimited text to process line-by-line.

---

## Launch Operation

Executes a child operation by its hash, with isolated operation state. This enables modular flow composition by calling one operation from within another.

### Settings

- **OperationHash** — The hash identifier of the operation to launch.
- **InputData** — JSON data to pass as input to the child operation.
- **TimeoutMs** — Maximum execution time in milliseconds. Set to `0` for unlimited.
- **InheritGlobalState** — When `true` (default), copies the parent's GlobalState into the child operation.

### Outputs

- **Result** — The result data returned by the child operation.
- **Status** — Final status of the child operation.
- **ElapsedMs** — Execution time of the child operation in milliseconds.

### Events

- **Completed** — Fires when the child operation finishes.
- **Error** — Fires if the child operation fails or times out.

### Tips

Use Launch Operation to break complex workflows into reusable sub-operations. The child operation runs with its own isolated state, so it cannot accidentally modify the parent's local state. Use InheritGlobalState to share configuration and credentials.

---

## Command

Executes a shell command on the server and captures its output.

### Settings

- **Command** — The shell command to execute (e.g. `ls`, `git`, `python3`).
- **Parameters** — Command-line arguments as a single string.
- **Description** — Human-readable description of what this command does (for documentation only).
- **WorkingDirectory** — Working directory for the command.
- **TimeoutMs** — Command timeout in milliseconds (default `300000` — 5 minutes).
- **Environment** — JSON object of environment variables to set for the command.

### Outputs

- **StdOut** — Standard output from the command.
- **StdErr** — Standard error output from the command.
- **ExitCode** — Exit code (0 typically indicates success).

### Events

- **Complete** — Fires when the command finishes.
- **Error** — Fires if the command fails to start or times out.

### Tips

Use an **If Conditional** on ExitCode to handle success vs failure. Both Command and Parameters support Pict template expressions, so you can build dynamic commands from state values. Set Environment to inject secrets or configuration without hardcoding them.
