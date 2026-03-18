# Content Create Folder

Creates a folder in the content directory on a remote Content System beacon.

## Settings

- **Path** — Relative folder path to create.
- **AffinityKey** — Worker affinity key to route to a specific beacon.
- **TimeoutMs** — Timeout in milliseconds (default `300000`).

## Outputs

- **StdOut** — Status message from the beacon.

## Events

- **Complete** — Fires after the folder is created.
- **Error** — Fires on failure.

## Tips

Use Content Create Folder before **Content Save File** to ensure the target directory structure exists. The operation is idempotent — creating a folder that already exists succeeds without error.
