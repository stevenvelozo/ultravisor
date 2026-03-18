# Template String

Processes a Pict template string against the current operation state, resolving expressions like `{~D:Record.Name~}` into their runtime values.

## Settings

- **Template** — A Pict template string containing `{~D:...~}` expressions that reference state addresses.
- **Destination** — State address to store the rendered result. If empty, the result is available at the default output.

## Outputs

- **Result** — The fully rendered template output.

## Events

- **Complete** — Fires after rendering.
- **Error** — Fires if template parsing fails.

## Tips

Template String is the workhorse for building dynamic URLs, file paths, messages, and prompts. Any Pict template expression is supported, including conditionals and joins. Chain multiple Template String cards to build complex content from intermediate values.
