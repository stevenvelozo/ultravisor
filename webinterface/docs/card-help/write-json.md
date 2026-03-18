# Write JSON

Serializes a state object to JSON and writes it to a file on disk.

## Settings

- **FilePath** — Path to the output JSON file.
- **DataAddress** — State address of the data to serialize. If empty, uses the full operation state.
- **PrettyFormat** — Pretty-print with indentation (default `true`).
- **IndentType** — Indent character: `tab` or `space` (default `tab`).
- **IndentCount** — Number of indent characters per level (default `1`).
- **SortKeys** — Alphabetically sort object keys for deterministic output.

## Outputs

- **FileLocation** — The path as specified.
- **FileName** — The base file name only.
- **FilePath** — The fully resolved absolute path.
- **BytesWritten** — Number of bytes written.

## Events

- **Done** — Fires on success.
- **Error** — Fires on write failure.

## Tips

Enable SortKeys for config files that will be compared across versions or stored in version control.
