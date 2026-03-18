# Value Input

Pauses flow execution and prompts the user for input. The flow resumes when the user provides a value or cancels.

## Settings

- **PromptMessage** — The message displayed to the user (default: "Please provide a value:").
- **OutputAddress** — State address where the user's input will be stored.
- **InputType** — Type of input control: `text`, `number`, `boolean`, or `select` (default `text`).
- **DefaultValue** — Pre-filled default value.
- **Options** — JSON array of allowed values when InputType is `select`.

## Outputs

- **InputValue** — The value provided by the user.

## Events

- **ValueInputComplete** — Fires when the user submits a value.
- **Cancelled** — Fires if the user cancels without providing input.

## Tips

Use Value Input for human-in-the-loop workflows: approval gates, manual data entry, or parameter selection at runtime. Wire the Cancelled output to an appropriate fallback path. Use `select` InputType with Options for constrained choices.
