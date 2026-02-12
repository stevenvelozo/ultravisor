# Manifests (Metaoutput)

Manifests track the output from executing operations. Every operation
execution produces a manifest that records timing, success/failure, task
results and logs.

## Manifest Model

```json
{
    "GUIDOperation": "etl-pipeline",
    "GUIDRun": "etl-pipeline-1707566400000",
    "Name": "ETL Pipeline",
    "StagingPath": "/var/data/ultravisor_staging/etl-pipeline",
    "ManifestFilePath": "/var/data/ultravisor_staging/etl-pipeline/Manifest_etl-pipeline.json",
    "StartTime": "2026-02-10T02:00:00.000Z",
    "StopTime": "2026-02-10T02:00:12.500Z",
    "Status": "Complete",
    "Success": true,
    "Summary": "Operation etl-pipeline Complete: 3 task(s) executed.",
    "TaskResults": [
        {
            "GUIDTask": "pull-data",
            "Name": "Pull Data from API",
            "Type": "Request",
            "StartTime": "2026-02-10T02:00:00.100Z",
            "StopTime": "2026-02-10T02:00:03.200Z",
            "Status": "Complete",
            "Success": true,
            "Output": "{\"records\": 150}",
            "Log": ["..."]
        },
        {
            "GUIDTask": "process-data",
            "Name": "Process Downloaded Data",
            "Type": "Command",
            "StartTime": "2026-02-10T02:00:03.300Z",
            "StopTime": "2026-02-10T02:00:10.100Z",
            "Status": "Complete",
            "Success": true,
            "Output": "Processed 150 records\n",
            "Log": ["..."]
        },
        {
            "GUIDTask": "notify",
            "Name": "Send Notification",
            "Type": "Command",
            "StartTime": "2026-02-10T02:00:10.200Z",
            "StopTime": "2026-02-10T02:00:12.400Z",
            "Status": "Complete",
            "Success": true,
            "Output": "",
            "Log": ["..."]
        }
    ],
    "Log": [
        "Operation etl-pipeline started at 2026-02-10T02:00:00.000Z",
        "Task pull-data completed with status: Complete",
        "Task process-data completed with status: Complete",
        "Task notify completed with status: Complete",
        "Operation etl-pipeline Complete: 3 task(s) executed."
    ]
}
```

### Fields

| Field | Description |
|-------|-------------|
| `GUIDOperation` | The operation that was executed |
| `GUIDRun` | Unique ID for this specific execution run |
| `Name` | Operation name |
| `StartTime` | ISO timestamp when the operation started |
| `StopTime` | ISO timestamp when the operation finished |
| `Status` | `Running`, `Complete`, or `Error` |
| `Success` | `true` if all tasks succeeded, `false` otherwise |
| `Summary` | Human-readable one-line summary |
| `StagingPath` | Absolute path to the operation's staging folder |
| `ManifestFilePath` | Absolute path to the manifest JSON file on disk |
| `TaskResults` | Array of task manifest entries (see below) |
| `Log` | Array of log messages from the operation lifecycle |

### Task Result Fields

| Field | Description |
|-------|-------------|
| `GUIDTask` | The task that was executed |
| `Name` | Task name |
| `Type` | Task type (Command, Request, etc.) |
| `StartTime` | ISO timestamp when the task started |
| `StopTime` | ISO timestamp when the task finished |
| `Status` | `Running`, `Complete`, `Error`, or `Unsupported` |
| `Success` | `true` if the task succeeded |
| `Output` | stdout or response body from the execution |
| `Log` | Array of log messages from the task execution |

## Manifest Lifecycle

1. **Create** -- `createManifest()` initializes a new manifest with status
   `Running` and assigns a `GUIDRun`
2. **Add Results** -- as each task completes, `addTaskResult()` appends the
   task result to `TaskResults`
3. **Finalize** -- `finalizeManifest()` sets `StopTime`, calculates overall
   `Success` (all tasks must succeed), sets `Status` and `Summary`, and
   writes the manifest JSON to the operation's staging folder

## Success Determination

An operation manifest is marked as `Success: true` only if **every** task
in the `TaskResults` array has `Success: true`. If any task has
`Success: false`, the entire operation is marked as failed.

## Storage

Manifests are stored in two places:

1. **In memory** -- for the duration of the server session, accessible via
   the API. Restarting the server clears the in-memory manifest store.

2. **On disk** -- when an operation completes, a
   `Manifest_{GUIDOperation}.json` file is written to the operation's
   staging folder. This provides a persistent record that survives
   restarts. The file path is recorded in the manifest's
   `ManifestFilePath` field.

The on-disk manifest contains the complete manifest object including all
task results, timing data and logs. It is written as pretty-printed JSON
(4-space indentation).

The staging folder location defaults to
`./dist/ultravisor_staging/{GUIDOperation}/` and can be configured via
`UltravisorStagingRoot` in `.ultravisor.json` (see
[Configuration](configuration.md)).

## Accessing Manifests

### Via API

```bash
# List all manifests
curl http://localhost:54321/Manifest

# Get a specific manifest
curl http://localhost:54321/Manifest/etl-pipeline-1707566400000
```

### Example: Checking if the last run succeeded

```bash
# Get the manifest list and check the last entry
curl -s http://localhost:54321/Manifest | jq '.[-1].Success'
```

## Example: Partial Failure

When one task fails in an operation, the manifest captures it:

```json
{
    "GUIDOperation": "data-sync",
    "Status": "Error",
    "Success": false,
    "Summary": "Operation data-sync Error: 2 task(s) executed.",
    "TaskResults": [
        {
            "GUIDTask": "fetch-data",
            "Status": "Complete",
            "Success": true
        },
        {
            "GUIDTask": "upload-data",
            "Status": "Error",
            "Success": false
        }
    ]
}
```
