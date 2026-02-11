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
| `StagingPath` | No | Temporary storage path for the operation |

## Execution Flow

1. Operation service creates a manifest via the Manifest service
2. Each task GUID in the `Tasks` array is looked up from state
3. Tasks execute sequentially (in order)
4. Each task result is added to the manifest
5. After all tasks complete, the manifest is finalized
6. Overall success is `true` only if every task succeeded

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

Executing an operation returns a manifest:

```json
{
    "GUIDOperation": "etl-pipeline",
    "GUIDRun": "etl-pipeline-1707566400000",
    "Name": "ETL Pipeline",
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
