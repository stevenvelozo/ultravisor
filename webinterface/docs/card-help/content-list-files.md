# Content List Files

Lists files in a directory on a remote Content System beacon.

## Settings

- **Path** — Relative directory path within the content directory. Leave empty for the root.
- **Pattern** — Glob pattern filter (e.g. `*.md`, `*.json`).
- **Recursive** — When `true`, lists files in subdirectories.
- **AffinityKey** — Worker affinity key to route to a specific beacon.
- **TimeoutMs** — Timeout in milliseconds (default `300000`).

## Outputs

- **Files** — JSON array of file entries.
- **StdOut** — Status message from the beacon.

## Events

- **Complete** — Fires after listing.
- **Error** — Fires on failure.

## Tips

Use Content List Files to discover available content on a beacon before processing. Combine with **Split Execute** to iterate over the file list and read or transform each file.
