# Copy File

Copies a file from a source path to a target path.

## Settings

- **Source** — Source file path.
- **TargetFile** — Destination file path.
- **Overwrite** — Allow overwriting an existing target file (default `true`).

## Outputs

- **FileLocation** — The target path as specified.
- **FileName** — The target file name only.
- **FilePath** — The fully resolved absolute target path.
- **BytesCopied** — Size of the copied file in bytes.

## Events

- **Done** — Fires on successful copy.
- **Error** — Fires if the source is missing or the target cannot be written.

## Tips

Set Overwrite to `false` to protect existing files from accidental replacement. Both Source and TargetFile support Pict template expressions for dynamic paths.
