# Universal Data Addressing

Ultravisor's universal addressing system provides a single, human-readable scheme for referencing files and resources across the beacon mesh, regardless of where they physically reside.

## Address Format

```
>BeaconName/Context/Path/to/resource
```

- **`>`** -- Prefix indicating a universal address
- **BeaconName** -- Human-readable beacon name (e.g., `retold-remote`, `orator-conversion`)
- **Context** -- A named namespace on the beacon (e.g., `File`, `Cache`, `Staging`)
- **Path** -- Resource path within the context

### Examples

```
>retold-remote/File/Pictures/vacation/beach.jpg
>retold-remote/Cache/thumbnails/abc123.webp
>opr-run-abc123/stage/Output.png
```

## How Resolution Works

The `resolve-address` platform card resolves a universal address to a concrete URL that downstream cards (like `file-transfer`) can use to fetch the resource.

<!-- bespoke diagram: edit diagrams/how-resolution-works.mmd or .hints.json, then: npx pict-renderer-graph build modules/apps/ultravisor/docs/features -->
![How Resolution Works](diagrams/how-resolution-works.svg)

### Resolution Steps

1. **Parse** -- Strip the `>` prefix, split into `BeaconName/Context/Path`
2. **Beacon Lookup** -- Find the beacon by name (or ID) in the coordinator's registry
3. **Context Lookup** -- Retrieve the context definition from the beacon record (contains `BaseURL`, `BasePath`, `Writable`, `Description`)
4. **URL Construction** -- Combine `BaseURL` with URL-encoded path segments
5. **Strategy Resolution** (optional) -- If `RequestingBeaconID` is provided, consult the reachability matrix to determine the best transfer strategy

## Contexts

Beacons register named contexts during registration. Each context maps a logical namespace to a physical location:

| Context | Description | Example BaseURL |
|---------|-------------|-----------------|
| `File` | Content root (media library) | `http://192.168.1.50:7827/content/` |
| `Cache` | Cache storage (thumbnails, previews) | `/cache/` |
| `Staging` | Temporary processing area | `/staging/` |

Contexts are defined by the beacon application. For example, retold-remote registers:

```javascript
beacon.registerContext('File', {
    BasePath: '/path/to/media',
    BaseURL: 'http://localhost:7827/content/',
    Writable: false,
    Description: 'Content root (media library)'
});
```

## Operations as Universal Data Locators

Operation pipelines use universal addresses as their primary input mechanism. When a caller triggers an operation, it passes addresses as parameters -- the operation graph handles resolution, transfer, processing, and result delivery automatically.

<!-- bespoke diagram: edit diagrams/operations-as-universal-data-locators.mmd or .hints.json, then: npx pict-renderer-graph build modules/apps/ultravisor/docs/features -->
![Operations as Universal Data Locators](diagrams/operations-as-universal-data-locators.svg)

This decouples the caller from knowing where files are or how to reach them. The address `>retold-remote/File/photo.jpg` works whether the beacon is on localhost, across a LAN, or behind a proxy -- the resolve-address card and reachability matrix handle the routing.

## resolve-address Card Reference

### Settings

| Setting | Type | Required | Description |
|---------|------|----------|-------------|
| `Address` | String | Yes | Universal address (e.g., `>retold-remote/File/photo.jpg`) |
| `Destination` | String | No | State address to write the resolved object |
| `RequestingBeaconID` | String | No | BeaconID of the requesting beacon (enables strategy resolution) |

### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `URL` | String | Best URL for the resource (chosen by strategy) |
| `BeaconID` | String | ID of the beacon that owns the resource |
| `BeaconName` | String | Human-readable beacon name |
| `Context` | String | Context name (e.g., `File`, `Cache`) |
| `Path` | String | Path within the context |
| `Filename` | String | Filename portion of the path |
| `Strategy` | String | Transfer strategy: `local`, `direct`, or `proxy` |
| `DirectURL` | String | Direct beacon-to-beacon URL (when strategy is `direct`) |
| `ProxyURL` | String | Proxy URL through Ultravisor (when strategy is `proxy`) |
