# Read File

Reads a file from the local file system into operation state.

## Settings

- **FilePath** — Path to the file to read. Supports Pict template expressions for dynamic paths.
- **Encoding** — Character encoding (default `utf8`). Use `binary` for non-text files.
- **MaxBytes** — Maximum bytes to read. Set to `0` for unlimited.

## Outputs

- **FileContent** — The full text content of the file.
- **BytesRead** — Number of bytes that were read.
- **FileName** — The base name of the file (no directory).

## Events

- **ReadComplete** — Fires after a successful read.
- **Error** — Fires if the file cannot be found or read.

## Tips

For very large files, use **Read File Buffered** instead to process content in chunks. Use MaxBytes as a safety limit to avoid loading unexpectedly large files into memory.
