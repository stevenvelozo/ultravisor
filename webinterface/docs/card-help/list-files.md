# List Files

Lists files in a directory with optional glob pattern filtering.

## Settings

- **Folder** — Directory path to list.
- **Pattern** — Glob pattern filter (e.g. `*.txt`, `*.json`). Default `*` matches all files.
- **Destination** — State address to store the resulting file list.
- **Recursive** — When `true`, includes files in subdirectories.
- **IncludeDirectories** — When `true`, includes directory entries in the results.

## Outputs

- **Files** — Array of file name strings matching the pattern.
- **FileCount** — Number of entries found.

## Events

- **Complete** — Fires after listing is complete.
- **Error** — Fires if the directory cannot be read.

## Tips

Use with **Split Execute** to iterate over the file list and process each file individually. Combine Recursive mode with a specific Pattern to find files deep in a directory tree.
