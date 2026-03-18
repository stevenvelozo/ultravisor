# Read File Buffered

Reads a file in chunks up to a maximum buffer size, splitting on a preferred character boundary. Ideal for processing large files that should not be loaded entirely into memory.

## Settings

- **FilePath** — Path to the file to read.
- **Encoding** — Character encoding (default `utf8`).
- **MaxBufferSize** — Maximum bytes per chunk (default `65536`).
- **SplitCharacter** — Preferred character to split on (default newline). The chunk is trimmed to the last occurrence of this character within the buffer so records are not broken mid-line.
- **ByteOffset** — Byte offset to start reading from. Use `0` for the first chunk and feed the output ByteOffset back for continuation.

## Outputs

- **FileContent** — Content of the current chunk.
- **BytesRead** — Bytes in this chunk.
- **ByteOffset** — Updated byte offset for the next read.
- **IsComplete** — `true` when the entire file has been read.
- **FileName** — Base name of the file.
- **TotalFileSize** — Total size of the file in bytes.

## Events

- **ReadComplete** — Fires when a chunk is read successfully.
- **Error** — Fires on read failure.

## Tips

Wire the ByteOffset output back to the ByteOffset setting input and use an **If Conditional** on IsComplete to create a read loop. This pattern lets you process files of any size line-by-line or paragraph-by-paragraph.
