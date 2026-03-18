# Write File

Writes text content to a file on disk.

## Settings

- **FilePath** — Path to the output file. Intermediate directories are created automatically.
- **Content** — The text content to write. Supports Pict template expressions.
- **Encoding** — Character encoding (default `utf8`).
- **Append** — When `true`, appends to an existing file instead of overwriting it.
- **LineEnding** — Force a line ending style: `lf`, `crlf`, or leave empty for no conversion.

## Outputs

- **FileLocation** — The path as specified (may be relative).
- **FileName** — The base file name only.
- **FilePath** — The fully resolved absolute path.
- **BytesWritten** — Number of bytes written.

## Events

- **WriteComplete** — Fires on success.
- **Error** — Fires on write failure.

## Tips

Use Append mode with a **String Appender** to build log files or accumulate output across loop iterations.
