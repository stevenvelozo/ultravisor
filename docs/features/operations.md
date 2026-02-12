# Operations

Operations compose multiple tasks into a sequential pipeline. When an
operation executes, its tasks run in order and a unified manifest tracks the
results of the entire run.

## Operation Model

```json
{
    "GUIDOperation": "data-pipeline",
    "Name": "Daily Data Pipeline",
    "Tasks": [
        "fetch-api-data",
        "transform-data",
        "load-into-db"
    ]
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `GUIDOperation` | Yes | Unique identifier for the operation |
| `Name` | No | Human-readable name |
| `Tasks` | No | Ordered array of task GUIDs to execute |
| `GlobalState` | No | JSON object passed as context to all tasks |
| `NodeState` | No | Node-specific context passed to tasks |
| `StagingPath` | No | Override for the operation staging folder (see below) |

## Execution Flow

1. The operation's staging folder is created (or an explicit `StagingPath` is used)
2. A manifest is created via the Manifest service
3. `GlobalState` is exposed at `fable.AppData.GlobalState` so fable
   services (e.g. ExpressionParser in Solver tasks) can access it
4. Each task GUID in the `Tasks` array is looked up from state
5. Tasks execute sequentially, with the staging folder set as context
6. Each task result is added to the manifest
7. After all tasks complete, the manifest is finalized
8. A `Manifest_{GUIDOperation}.json` file is written to the staging folder
9. Overall success is `true` only if every task succeeded

## Per-Operation Staging Folder

Every operation automatically gets its own staging folder. This keeps
each operation's intermediate files, output and manifest isolated from
other operations.

The staging folder is created at:

```
{UltravisorStagingRoot}/{GUIDOperation}/
```

By default, `UltravisorStagingRoot` is `./dist/ultravisor_staging`
relative to the working directory. This can be changed in
`.ultravisor.json`:

```json
{
    "UltravisorStagingRoot": "/var/data/ultravisor_staging"
}
```

All file-based task types (`WriteJSON`, `WriteText`, `WriteBinary`,
`ReadJSON`, `ReadText`, `ReadBinary`, `ListFiles`) resolve their `File`
paths relative to this staging folder. This means a task with
`"File": "output/report.json"` will write to
`{UltravisorStagingRoot}/{GUIDOperation}/output/report.json`.

When the operation completes, the manifest is written to:

```
{UltravisorStagingRoot}/{GUIDOperation}/Manifest_{GUIDOperation}.json
```

This provides a persistent on-disk record of everything the operation
produced.

### Overriding the Staging Path

You can set an explicit `StagingPath` on the operation definition to
bypass the automatic per-GUID folder:

```json
{
    "GUIDOperation": "custom-output",
    "Name": "Custom Output Location",
    "Tasks": ["write-report"],
    "StagingPath": "/mnt/shared/reports/2026-02"
}
```

When `StagingPath` is set, the operation uses that path directly instead
of creating a subfolder under `UltravisorStagingRoot`.

If a task GUID is not found in state, the operation logs a warning and
continues with the next task. Task execution errors are captured in the
manifest without halting subsequent tasks.

## Managing Operations

### Via Configuration File

```json
{
    "Tasks": {
        "pull-data": {
            "GUIDTask": "pull-data",
            "Name": "Pull Data from API",
            "Type": "Request",
            "URL": "https://api.example.com/export"
        },
        "process-data": {
            "GUIDTask": "process-data",
            "Name": "Process Downloaded Data",
            "Type": "Command",
            "Command": "python3 /scripts/process.py"
        },
        "notify": {
            "GUIDTask": "notify",
            "Name": "Send Notification",
            "Type": "Command",
            "Command": "echo 'Pipeline complete' | mail -s 'Done' admin@example.com"
        }
    },
    "Operations": {
        "etl-pipeline": {
            "GUIDOperation": "etl-pipeline",
            "Name": "ETL Pipeline",
            "Tasks": ["pull-data", "process-data", "notify"]
        }
    }
}
```

### Via CLI

```bash
# Run an operation immediately
ultravisor singleoperation etl-pipeline

# Dry run
ultravisor singleoperation etl-pipeline --dry_run
```

### Via API

```bash
# Create an operation
curl -X POST http://localhost:54321/Operation \
  -H "Content-Type: application/json" \
  -d '{
    "GUIDOperation": "etl-pipeline",
    "Name": "ETL Pipeline",
    "Tasks": ["pull-data", "process-data", "notify"]
  }'

# Get one
curl http://localhost:54321/Operation/etl-pipeline

# List all
curl http://localhost:54321/Operation

# Update
curl -X PUT http://localhost:54321/Operation/etl-pipeline \
  -H "Content-Type: application/json" \
  -d '{"Name": "Updated ETL Pipeline", "Tasks": ["pull-data", "process-data"]}'

# Delete
curl -X DELETE http://localhost:54321/Operation/etl-pipeline

# Execute
curl http://localhost:54321/Operation/etl-pipeline/Execute
```

## Operation Execution Result

Executing an operation returns a manifest. The `StagingPath` field shows
where the operation's files were written, and `ManifestFilePath` shows
the location of the manifest JSON on disk:

```json
{
    "GUIDOperation": "etl-pipeline",
    "GUIDRun": "etl-pipeline-1707566400000",
    "Name": "ETL Pipeline",
    "StagingPath": "/var/data/ultravisor_staging/etl-pipeline",
    "ManifestFilePath": "/var/data/ultravisor_staging/etl-pipeline/Manifest_etl-pipeline.json",
    "StartTime": "2026-02-10T12:00:00.000Z",
    "StopTime": "2026-02-10T12:00:05.200Z",
    "Status": "Complete",
    "Success": true,
    "Summary": "Operation etl-pipeline Complete: 3 task(s) executed.",
    "TaskResults": [
        {
            "GUIDTask": "pull-data",
            "Status": "Complete",
            "Success": true,
            "StartTime": "...",
            "StopTime": "..."
        },
        {
            "GUIDTask": "process-data",
            "Status": "Complete",
            "Success": true,
            "StartTime": "...",
            "StopTime": "..."
        },
        {
            "GUIDTask": "notify",
            "Status": "Complete",
            "Success": true,
            "StartTime": "...",
            "StopTime": "..."
        }
    ],
    "Log": [
        "Operation etl-pipeline started at 2026-02-10T12:00:00.000Z",
        "Task pull-data completed with status: Complete",
        "Task process-data completed with status: Complete",
        "Task notify completed with status: Complete",
        "Operation etl-pipeline Complete: 3 task(s) executed."
    ]
}
```

## Examples

### System health check

```json
{
    "Tasks": {
        "check-disk": {
            "GUIDTask": "check-disk",
            "Type": "Command",
            "Command": "df -h /"
        },
        "check-memory": {
            "GUIDTask": "check-memory",
            "Type": "Command",
            "Command": "vm_stat"
        },
        "check-load": {
            "GUIDTask": "check-load",
            "Type": "Command",
            "Command": "uptime"
        }
    },
    "Operations": {
        "health-check": {
            "GUIDOperation": "health-check",
            "Name": "System Health Check",
            "Tasks": ["check-disk", "check-memory", "check-load"]
        }
    }
}
```

### Image generation pipeline

```json
{
    "Tasks": {
        "generate-prompt": {
            "GUIDTask": "generate-prompt",
            "Type": "Command",
            "Command": "python3 /scripts/random_prompt.py > /tmp/prompt.txt"
        },
        "generate-image": {
            "GUIDTask": "generate-image",
            "Type": "Command",
            "Command": "python3 /scripts/generate_image.py --prompt-file /tmp/prompt.txt --output /output/image.png"
        },
        "upload-image": {
            "GUIDTask": "upload-image",
            "Type": "Command",
            "Command": "aws s3 cp /output/image.png s3://my-bucket/images/"
        }
    },
    "Operations": {
        "image-gen": {
            "GUIDOperation": "image-gen",
            "Name": "Generate and Upload Image",
            "Tasks": ["generate-prompt", "generate-image", "upload-image"]
        }
    }
}
```
