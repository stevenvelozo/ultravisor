# Content Read File

Reads a markdown or content file from a remote Content System beacon.

## Settings

- **FilePath** — Relative path within the content directory on the beacon.
- **Destination** — State address to store the file content.
- **AffinityKey** — Worker affinity key to route to a specific beacon.
- **TimeoutMs** — Timeout in milliseconds (default `300000`).

## Outputs

- **Content** — The file content as a string.
- **StdOut** — Status message from the beacon.

## Events

- **Complete** — Fires after a successful read.
- **Error** — Fires if the file is not found or the beacon is unreachable.

## Tips

Content System cards operate on remote Beacon workers, not the local file system. Use AffinityKey to ensure reads and writes go to the same beacon instance. For local file operations, use **Read File** instead.
