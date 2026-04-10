# Content System Tasks

Tasks for reading, writing, and managing files on remote Content System beacon workers. These tasks operate on remote content directories rather than the local file system.

---

## Content Read File

Reads a markdown or content file from a remote Content System beacon.

### Settings

- **FilePath** -- Relative path within the content directory on the beacon.
- **Destination** -- State address to store the file content.
- **AffinityKey** -- Worker affinity key to route to a specific beacon.
- **TimeoutMs** -- Timeout in milliseconds (default `300000`).

### Outputs

- **Content** -- The file content as a string.
- **StdOut** -- Status message from the beacon.

### Events

- **Complete** -- Fires after a successful read.
- **Error** -- Fires if the file is not found or the beacon is unreachable.

### Tips

Content System cards operate on remote Beacon workers, not the local file system. Use AffinityKey to ensure reads and writes go to the same beacon instance. For local file operations, use **Read File** instead.

---

## Content Save File

Saves content to a file on a remote Content System beacon.

### Settings

- **FilePath** -- Relative path within the content directory.
- **Content** -- The file content to write. Supports Pict template expressions.
- **AffinityKey** -- Worker affinity key to route to a specific beacon.
- **TimeoutMs** -- Timeout in milliseconds (default `300000`).

### Outputs

- **FilePath** -- Path of the saved file.
- **StdOut** -- Status message from the beacon.

### Events

- **Complete** -- Fires after a successful save.
- **Error** -- Fires on failure.

### Tips

Use Content Save File to publish generated content (reports, processed data, rendered templates) to a Content System. Pair with **Content Read File** to read-modify-write content files on a beacon.

---

## Content List Files

Lists files in a directory on a remote Content System beacon.

### Settings

- **Path** -- Relative directory path within the content directory. Leave empty for the root.
- **Pattern** -- Glob pattern filter (e.g. `*.md`, `*.json`).
- **Recursive** -- When `true`, lists files in subdirectories.
- **AffinityKey** -- Worker affinity key to route to a specific beacon.
- **TimeoutMs** -- Timeout in milliseconds (default `300000`).

### Outputs

- **Files** -- JSON array of file entries.
- **StdOut** -- Status message from the beacon.

### Events

- **Complete** -- Fires after listing.
- **Error** -- Fires on failure.

### Tips

Use Content List Files to discover available content on a beacon before processing. Combine with **Split Execute** to iterate over the file list and read or transform each file.

---

## Content Create Folder

Creates a folder in the content directory on a remote Content System beacon.

### Settings

- **Path** -- Relative folder path to create.
- **AffinityKey** -- Worker affinity key to route to a specific beacon.
- **TimeoutMs** -- Timeout in milliseconds (default `300000`).

### Outputs

- **StdOut** -- Status message from the beacon.

### Events

- **Complete** -- Fires after the folder is created.
- **Error** -- Fires on failure.

### Tips

Use Content Create Folder before **Content Save File** to ensure the target directory structure exists. The operation is idempotent -- creating a folder that already exists succeeds without error.
