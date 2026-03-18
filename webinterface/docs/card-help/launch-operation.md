# Launch Operation

Executes a child operation by its hash, with isolated operation state. This enables modular flow composition by calling one operation from within another.

## Settings

- **OperationHash** — The hash identifier of the operation to launch.
- **InputData** — JSON data to pass as input to the child operation.
- **TimeoutMs** — Maximum execution time in milliseconds. Set to `0` for unlimited.
- **InheritGlobalState** — When `true` (default), copies the parent's GlobalState into the child operation.

## Outputs

- **Result** — The result data returned by the child operation.
- **Status** — Final status of the child operation.
- **ElapsedMs** — Execution time of the child operation in milliseconds.

## Events

- **Completed** — Fires when the child operation finishes.
- **Error** — Fires if the child operation fails or times out.

## Tips

Use Launch Operation to break complex workflows into reusable sub-operations. The child operation runs with its own isolated state, so it cannot accidentally modify the parent's local state. Use InheritGlobalState to share configuration and credentials.
