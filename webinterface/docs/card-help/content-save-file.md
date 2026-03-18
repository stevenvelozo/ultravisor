# Content Save File

Saves content to a file on a remote Content System beacon.

## Settings

- **FilePath** — Relative path within the content directory.
- **Content** — The file content to write. Supports Pict template expressions.
- **AffinityKey** — Worker affinity key to route to a specific beacon.
- **TimeoutMs** — Timeout in milliseconds (default `300000`).

## Outputs

- **FilePath** — Path of the saved file.
- **StdOut** — Status message from the beacon.

## Events

- **Complete** — Fires after a successful save.
- **Error** — Fires on failure.

## Tips

Use Content Save File to publish generated content (reports, processed data, rendered templates) to a Content System. Pair with **Content Read File** to read-modify-write content files on a beacon.
