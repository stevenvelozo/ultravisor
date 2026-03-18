# Extension Tasks

Tasks for dispatching work to remote Beacon worker nodes, providing low-level access to the distributed execution infrastructure.

---

## Beacon Dispatch

Dispatches a work item to a remote Beacon worker node. The task pauses until the Beacon completes execution and reports results back.

### Settings

- **RemoteCapability** — Required capability on the Beacon (e.g. `Shell`, `FileSystem`, `LLM`).
- **RemoteAction** — Specific action within the capability (e.g. `Execute`, `Read`).
- **Command** — Shell command to execute on the Beacon (when using Shell capability).
- **Parameters** — Command-line parameters for the shell command.
- **AffinityKey** — Worker affinity routing key. Requests with the same key are routed to the same Beacon.
- **TimeoutMs** — Work item timeout in milliseconds (default `300000`).
- **InputData** — JSON data to pass to the Beacon worker.
- **Destination** — State address to write results to on completion.

### Outputs

- **StdOut** — Standard output from the Beacon execution.
- **Result** — Result data from the Beacon.
- **ExitCode** — Exit code of the remote command.
- **BeaconID** — ID of the Beacon that executed the work.

### Events

- **Complete** — Fires when the Beacon finishes.
- **Error** — Fires on failure or timeout.

### Tips

Beacon Dispatch is the low-level card for sending arbitrary work to remote workers. Use AffinityKey to ensure related work items run on the same Beacon instance. For common patterns, prefer the specialized cards (LLM Chat Completion, Content Read File, etc.) which use Beacon Dispatch internally with appropriate defaults.
