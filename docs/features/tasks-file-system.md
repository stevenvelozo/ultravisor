# File System Tasks

Tasks for reading, writing, copying, and listing files on the local file system.

---

## Read File

Reads a file from the local file system into operation state.

### Settings

- **FilePath** — Path to the file to read. Supports Pict template expressions for dynamic paths.
- **Encoding** — Character encoding (default `utf8`). Use `binary` for non-text files.
- **MaxBytes** — Maximum bytes to read. Set to `0` for unlimited.

### Outputs

- **FileContent** — The full text content of the file.
- **BytesRead** — Number of bytes that were read.
- **FileName** — The base name of the file (no directory).

### Events

- **ReadComplete** — Fires after a successful read.
- **Error** — Fires if the file cannot be found or read.

### Tips

For very large files, use **Read File Buffered** instead to process content in chunks. Use MaxBytes as a safety limit to avoid loading unexpectedly large files into memory.

---

## Read File Buffered

Reads a file in chunks up to a maximum buffer size, splitting on a preferred character boundary. Ideal for processing large files that should not be loaded entirely into memory.

### Settings

- **FilePath** — Path to the file to read.
- **Encoding** — Character encoding (default `utf8`).
- **MaxBufferSize** — Maximum bytes per chunk (default `65536`).
- **SplitCharacter** — Preferred character to split on (default newline). The chunk is trimmed to the last occurrence of this character within the buffer so records are not broken mid-line.
- **ByteOffset** — Byte offset to start reading from. Use `0` for the first chunk and feed the output ByteOffset back for continuation.

### Outputs

- **FileContent** — Content of the current chunk.
- **BytesRead** — Bytes in this chunk.
- **ByteOffset** — Updated byte offset for the next read.
- **IsComplete** — `true` when the entire file has been read.
- **FileName** — Base name of the file.
- **TotalFileSize** — Total size of the file in bytes.

### Events

- **ReadComplete** — Fires when a chunk is read successfully.
- **Error** — Fires on read failure.

### Tips

Wire the ByteOffset output back to the ByteOffset setting input and use an **If Conditional** on IsComplete to create a read loop. This pattern lets you process files of any size line-by-line or paragraph-by-paragraph.

---

## Read JSON

Reads a JSON file from disk, parses it, and stores the resulting object in operation state.

### Settings

- **FilePath** — Path to the JSON file.
- **Destination** — State address to store the parsed data. If empty, data is stored at the default output address.

### Outputs

- **Data** — The parsed JSON object or array.

### Events

- **Complete** — Fires after successful read and parse.
- **Error** — Fires if the file is missing or contains invalid JSON.

### Tips

Pair with **Write JSON** to round-trip configuration or intermediate data. Use the Destination setting to place the parsed data at a specific location in your operation state for downstream tasks.

---

## Write File

Writes text content to a file on disk.

### Settings

- **FilePath** — Path to the output file. Intermediate directories are created automatically.
- **Content** — The text content to write. Supports Pict template expressions.
- **Encoding** — Character encoding (default `utf8`).
- **Append** — When `true`, appends to an existing file instead of overwriting it.
- **LineEnding** — Force a line ending style: `lf`, `crlf`, or leave empty for no conversion.

### Outputs

- **FileLocation** — The path as specified (may be relative).
- **FileName** — The base file name only.
- **FilePath** — The fully resolved absolute path.
- **BytesWritten** — Number of bytes written.

### Events

- **WriteComplete** — Fires on success.
- **Error** — Fires on write failure.

### Tips

Use Append mode with a **String Appender** to build log files or accumulate output across loop iterations.

---

## Write JSON

Serializes a state object to JSON and writes it to a file on disk.

### Settings

- **FilePath** — Path to the output JSON file.
- **DataAddress** — State address of the data to serialize. If empty, uses the full operation state.
- **PrettyFormat** — Pretty-print with indentation (default `true`).
- **IndentType** — Indent character: `tab` or `space` (default `tab`).
- **IndentCount** — Number of indent characters per level (default `1`).
- **SortKeys** — Alphabetically sort object keys for deterministic output.

### Outputs

- **FileLocation** — The path as specified.
- **FileName** — The base file name only.
- **FilePath** — The fully resolved absolute path.
- **BytesWritten** — Number of bytes written.

### Events

- **Done** — Fires on success.
- **Error** — Fires on write failure.

### Tips

Enable SortKeys for config files that will be compared across versions or stored in version control.

---

## Copy File

Copies a file from a source path to a target path.

### Settings

- **Source** — Source file path.
- **TargetFile** — Destination file path.
- **Overwrite** — Allow overwriting an existing target file (default `true`).

### Outputs

- **FileLocation** — The target path as specified.
- **FileName** — The target file name only.
- **FilePath** — The fully resolved absolute target path.
- **BytesCopied** — Size of the copied file in bytes.

### Events

- **Done** — Fires on successful copy.
- **Error** — Fires if the source is missing or the target cannot be written.

### Tips

Set Overwrite to `false` to protect existing files from accidental replacement. Both Source and TargetFile support Pict template expressions for dynamic paths.

---

## List Files

Lists files in a directory with optional glob pattern filtering.

### Settings

- **Folder** — Directory path to list.
- **Pattern** — Glob pattern filter (e.g. `*.txt`, `*.json`). Default `*` matches all files.
- **Destination** — State address to store the resulting file list.
- **Recursive** — When `true`, includes files in subdirectories.
- **IncludeDirectories** — When `true`, includes directory entries in the results.

### Outputs

- **Files** — Array of file name strings matching the pattern.
- **FileCount** — Number of entries found.

### Events

- **Complete** — Fires after listing is complete.
- **Error** — Fires if the directory cannot be read.

### Tips

Use with **Split Execute** to iterate over the file list and process each file individually. Combine Recursive mode with a specific Pattern to find files deep in a directory tree.
