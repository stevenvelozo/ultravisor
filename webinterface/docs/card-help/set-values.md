# Set Values

Sets one or more values in operation state at specified addresses. This is the primary card for initializing variables, copying data between state locations, and injecting literal values.

## Settings

- **Mappings** — An array of mapping objects. Each mapping has a `To` address (where to write) and either a `Value` (literal) or `From` address (copy from state).

## Events

- **Complete** — Fires after all mappings are applied.
- **Error** — Fires if a mapping fails.

## Tips

Use Set Values at the start of a flow to initialize default values before branching logic. Mappings are applied in order, so later entries can reference values set by earlier ones within the same card.
