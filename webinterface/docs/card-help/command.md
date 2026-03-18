# Command

Executes a shell command on the server and captures its output.

## Settings

- **Command** — The shell command to execute (e.g. `ls`, `git`, `python3`).
- **Parameters** — Command-line arguments as a single string.
- **Description** — Human-readable description of what this command does (for documentation only).
- **WorkingDirectory** — Working directory for the command.
- **TimeoutMs** — Command timeout in milliseconds (default `300000` — 5 minutes).
- **Environment** — JSON object of environment variables to set for the command.

## Outputs

- **StdOut** — Standard output from the command.
- **StdErr** — Standard error output from the command.
- **ExitCode** — Exit code (0 typically indicates success).

## Events

- **Complete** — Fires when the command finishes.
- **Error** — Fires if the command fails to start or times out.

## Tips

Use an **If Conditional** on ExitCode to handle success vs failure. Both Command and Parameters support Pict template expressions, so you can build dynamic commands from state values. Set Environment to inject secrets or configuration without hardcoding them.
