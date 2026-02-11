# Tasks

Tasks are the fundamental unit of work in Ultravisor. Each task represents a
single executable action: a shell command, an HTTP request, or another
supported task type.

## Task Model

Every task requires at minimum a `GUIDTask`. All other fields are optional
but recommended.

```json
{
    "GUIDTask": "my-task-001",
    "Code": "MY_TASK",
    "Name": "My First Task",
    "Type": "Command",
    "Command": "echo hello world",
    "Parameters": "",
    "Description": "A simple echo task for testing.",
    "onBefore": [],
    "onCompletion": [],
    "onSubsequent": [],
    "onFailure": [],
    "onError": []
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `GUIDTask` | Yes | Unique identifier for the task |
| `Code` | No | Short code identifier |
| `Name` | No | Human-readable name |
| `Type` | No | Execution type (defaults to `Command`) |
| `Command` | No | Shell command to run (for Command type) |
| `Parameters` | No | Fallback for Command, or type-specific parameters |
| `Description` | No | Markdown description of the task |
| `URL` | No | Target URL (for Request type) |
| `Method` | No | HTTP method (for Request type, defaults to `GET`) |
| `onBefore` | No | Array of task GUIDs to execute before the core task |
| `onCompletion` | No | Array of task GUIDs to execute after a successful core task |
| `onFailure` | No | Array of task GUIDs to execute after a failed core task |
| `onError` | No | Array of task GUIDs to execute after a core task error |
| `onSubsequent` | No | Array of task GUIDs to always execute after the core task |

## Task Types

### Command

Executes a shell command via `child_process.exec`. The command string is
taken from the `Command` field, falling back to `Parameters` if `Command`
is not set.

```json
{
    "GUIDTask": "list-files",
    "Name": "List Files in Home",
    "Type": "Command",
    "Command": "ls -la ~/"
}
```

Default execution limits (configurable in `.ultravisor.json`):
- Timeout: 5 minutes (300,000 ms) — `UltravisorCommandTimeoutMilliseconds`
- Max output buffer: 10 MB — `UltravisorCommandMaxBufferBytes`

### Request

Executes an HTTP request. The URL is taken from `URL`, falling back to
`Parameters`. Method defaults to `GET`.

```json
{
    "GUIDTask": "fetch-weather",
    "Name": "Fetch Weather Data",
    "Type": "Request",
    "URL": "https://api.weather.example/current",
    "Method": "GET"
}
```

Request tasks use `curl` under the hood, so curl must be available on the
system.

### ListFiles

Lists files and directories in the staging folder (or a sub-path within it).
Returns an array of file entries with name, size, type and modification time.

| Field | Required | Description |
|-------|----------|-------------|
| `Path` | No | Sub-directory within the staging folder to list |

```json
{
    "GUIDTask": "list-output",
    "Name": "List Output Files",
    "Type": "ListFiles",
    "Path": "reports"
}
```

Output is a JSON array of entries:

```json
[
    { "Name": "report-2026-02.csv", "Size": 14320, "IsDirectory": false, "Modified": "2026-02-10T08:30:00.000Z" },
    { "Name": "archive", "Size": 4096, "IsDirectory": true, "Modified": "2026-02-09T12:00:00.000Z" }
]
```

### WriteJSON

Serialises an object as pretty-printed JSON and writes it to a file in the
staging folder. Creates intermediate directories automatically.

| Field | Required | Description |
|-------|----------|-------------|
| `File` | Yes | Relative path inside the staging folder |
| `Data` | Yes | Object or value to serialise as JSON |

```json
{
    "GUIDTask": "save-config",
    "Name": "Save Processed Config",
    "Type": "WriteJSON",
    "File": "output/processed-config.json",
    "Data": {
        "version": 3,
        "features": ["scheduling", "manifests"],
        "enabled": true
    }
}
```

### WriteText

Writes a plain text string to a file in the staging folder.
Creates intermediate directories automatically.

| Field | Required | Description |
|-------|----------|-------------|
| `File` | Yes | Relative path inside the staging folder |
| `Data` | Yes | String content to write |

```json
{
    "GUIDTask": "write-log",
    "Name": "Write Status Log",
    "Type": "WriteText",
    "File": "logs/pipeline-status.log",
    "Data": "Pipeline completed at 2026-02-10T12:00:00Z\nAll tasks succeeded."
}
```

### ReadJSON

Reads a JSON file from the staging folder, parses it and returns the
parsed object in `Output`.

| Field | Required | Description |
|-------|----------|-------------|
| `File` | Yes | Relative path inside the staging folder |

```json
{
    "GUIDTask": "load-config",
    "Name": "Load Config",
    "Type": "ReadJSON",
    "File": "config/pipeline.json"
}
```

The parsed JSON is available in `pManifestEntry.Output` as a serialised
JSON string.

### ReadText

Reads a text file from the staging folder and returns its content in
`Output`.

| Field | Required | Description |
|-------|----------|-------------|
| `File` | Yes | Relative path inside the staging folder |

```json
{
    "GUIDTask": "read-template",
    "Name": "Read Email Template",
    "Type": "ReadText",
    "File": "templates/notification.txt"
}
```

### GetJSON

Performs a native HTTP/HTTPS GET request and parses the response body as
JSON. Uses Node.js built-in `http`/`https` modules (no curl dependency).

| Field | Required | Description |
|-------|----------|-------------|
| `URL` | Yes | Endpoint to request |
| `Headers` | No | Object of additional request headers |

```json
{
    "GUIDTask": "fetch-api-data",
    "Name": "Fetch API Data",
    "Type": "GetJSON",
    "URL": "https://api.example.com/v1/status",
    "Headers": {
        "Authorization": "Bearer abc123"
    }
}
```

The parsed JSON response is available in `pManifestEntry.Output`. If the
response body is not valid JSON the task will error.

### SendJSON

Sends JSON data to a REST URL using any HTTP method. Defaults to POST.
Uses Node.js built-in `http`/`https` modules (no curl dependency).

| Field | Required | Description |
|-------|----------|-------------|
| `URL` | Yes | Endpoint to request |
| `Method` | No | HTTP method (defaults to `POST`) |
| `Data` | No | Object to serialise and send as the request body |
| `Headers` | No | Object of additional request headers |

```json
{
    "GUIDTask": "push-metrics",
    "Name": "Push Metrics to Dashboard",
    "Type": "SendJSON",
    "URL": "https://dashboard.example.com/api/metrics",
    "Method": "POST",
    "Data": {
        "source": "ultravisor",
        "cpu": 42.5,
        "memory": 1024
    },
    "Headers": {
        "X-API-Key": "secret-key"
    }
}
```

PUT, PATCH and DELETE are also supported:

```json
{
    "GUIDTask": "update-record",
    "Name": "Update Record",
    "Type": "SendJSON",
    "URL": "https://api.example.com/records/12345",
    "Method": "PUT",
    "Data": { "status": "archived" }
}
```

### Conditional

Evaluates an address from the execution context and branches to one of
two tasks based on whether the value is truthy or falsy.

| Field | Required | Description |
|-------|----------|-------------|
| `Address` | * | Dot-notation path into GlobalState or NodeState |
| `Value` | * | Literal value to test (alternative to Address) |
| `TrueTask` | No | GUID of the task to execute when truthy |
| `FalseTask` | No | GUID of the task to execute when falsy |

\* Either `Address` or `Value` must be provided.

The `Address` field resolves against `pContext.GlobalState` first, then
falls back to `pContext.NodeState`. Use dot-notation for nested paths
(e.g. `Config.Database.Enabled`).

```json
{
    "Tasks": {
        "check-flag": {
            "GUIDTask": "check-flag",
            "Name": "Check Feature Flag",
            "Type": "Conditional",
            "Address": "Flags.UseNewPipeline",
            "TrueTask": "run-new-pipeline",
            "FalseTask": "run-legacy-pipeline"
        },
        "run-new-pipeline": {
            "GUIDTask": "run-new-pipeline",
            "Name": "New Pipeline",
            "Type": "Command",
            "Command": "bash /scripts/new_pipeline.sh"
        },
        "run-legacy-pipeline": {
            "GUIDTask": "run-legacy-pipeline",
            "Name": "Legacy Pipeline",
            "Type": "Command",
            "Command": "bash /scripts/legacy_pipeline.sh"
        }
    }
}
```

When executed as part of an operation with GlobalState:

```json
{
    "GUIDOperation": "pipeline-op",
    "Name": "Pipeline",
    "Tasks": ["check-flag"],
    "GlobalState": {
        "Flags": { "UseNewPipeline": true }
    }
}
```

If neither `TrueTask` nor `FalseTask` matches the branch, the task
completes as a no-op.

Output includes the branch taken and the result of the selected task:

```json
{
    "Branch": "true",
    "Task": "run-new-pipeline",
    "Result": { "GUIDTask": "run-new-pipeline", "Status": "Complete", "Success": true, "..." : "..." }
}
```

### Staging Folder

All file-based task types (`ListFiles`, `WriteJSON`, `WriteText`,
`ReadJSON`, `ReadText`) operate relative to the **staging folder**. The
staging folder is resolved in this order:

1. `pContext.StagingPath` (per-operation override)
2. `UltravisorFileStorePath` from configuration
3. `${cwd}/dist/ultravisor_datastore` (fallback)

Path traversal is blocked -- file paths containing `..` are rejected.

### Future Types

The following types are defined in the README but not yet implemented.
Tasks with these types will return a manifest entry with
`Status: "Unsupported"`:

- **Browser** -- headless browser navigation and interaction
- **Browser Read** -- headless browser data reading
- **Browser Action** -- click, navigate, fill actions
- **Database Table** -- create tables in the output data store
- **Integration** -- Meadow integration tasks

## Task Execution Result

Every task execution produces a manifest entry:

```json
{
    "GUIDTask": "list-files",
    "Name": "List Files in Home",
    "Type": "Command",
    "StartTime": "2026-02-10T12:00:00.000Z",
    "StopTime": "2026-02-10T12:00:00.045Z",
    "Status": "Complete",
    "Success": true,
    "Output": "total 48\ndrwxr-x---  12 user ...",
    "Log": [
        "Task list-files started at 2026-02-10T12:00:00.000Z",
        "Executing command: ls -la ~/",
        "stdout: total 48...",
        "Command completed successfully."
    ],
    "SubsequentResults": {}
}
```

### Status Values

| Status | Meaning |
|--------|---------|
| `Running` | Task is currently executing |
| `Complete` | Task finished successfully |
| `Error` | Task encountered an error or non-zero exit |
| `Unsupported` | Task type is not yet implemented |

## Subsequent Tasks

Subsequent tasks allow you to chain additional tasks around a core task's
execution. Each subsequent task set is an array of task GUIDs that execute
in sequence. Five built-in sets provide hooks into different points of the
task lifecycle:

| Set | When It Runs | Condition |
|-----|-------------|-----------|
| `onBefore` | Before the core task | Always |
| `onCompletion` | After the core task | Only if core task succeeded |
| `onFailure` | After the core task | Only if core task failed |
| `onError` | After the core task | Only if core task errored |
| `onSubsequent` | After all conditional sets | Always (success or failure) |

All five sets are optional. Any set can contain zero or more task GUIDs.
Tasks within a set execute sequentially in array order.

### Execution Order

```
1. onBefore[0], onBefore[1], ...     (always runs)
2. Core task execution
3. If success  → onCompletion[0], onCompletion[1], ...
   If failure  → onFailure[0], onFailure[1], ...
   If error    → onError[0], onError[1], ...
4. onSubsequent[0], onSubsequent[1], ... (always runs)
```

### Basic Example

A task that runs a notification before and cleanup after:

```json
{
    "Tasks": {
        "notify-start": {
            "GUIDTask": "notify-start",
            "Name": "Notify Start",
            "Type": "Command",
            "Command": "echo 'Backup starting...' >> /var/log/ultravisor.log"
        },
        "backup-db": {
            "GUIDTask": "backup-db",
            "Name": "Backup Database",
            "Type": "Command",
            "Command": "pg_dump mydb > /backups/mydb.sql",
            "onBefore": ["notify-start"],
            "onCompletion": ["verify-backup", "notify-success"],
            "onFailure": ["notify-failure"],
            "onSubsequent": ["cleanup-temp"]
        },
        "verify-backup": {
            "GUIDTask": "verify-backup",
            "Name": "Verify Backup",
            "Type": "Command",
            "Command": "test -s /backups/mydb.sql && echo 'OK'"
        },
        "notify-success": {
            "GUIDTask": "notify-success",
            "Name": "Notify Success",
            "Type": "Command",
            "Command": "echo 'Backup completed successfully' >> /var/log/ultravisor.log"
        },
        "notify-failure": {
            "GUIDTask": "notify-failure",
            "Name": "Notify Failure",
            "Type": "Command",
            "Command": "echo 'Backup FAILED' >> /var/log/ultravisor.log"
        },
        "cleanup-temp": {
            "GUIDTask": "cleanup-temp",
            "Name": "Cleanup Temp Files",
            "Type": "Command",
            "Command": "rm -f /tmp/ultravisor-backup-*"
        }
    }
}
```

When `backup-db` executes:
1. `notify-start` runs first (onBefore)
2. `pg_dump mydb > /backups/mydb.sql` runs (core task)
3. If the backup succeeds: `verify-backup` then `notify-success` run (onCompletion)
4. If the backup fails: `notify-failure` runs (onFailure)
5. `cleanup-temp` always runs last (onSubsequent)

### Error Handling Example

Use `onError` for tasks that should run when the core task encounters
an execution error (non-zero exit code, timeout, etc.):

```json
{
    "Tasks": {
        "deploy-app": {
            "GUIDTask": "deploy-app",
            "Name": "Deploy Application",
            "Type": "Command",
            "Command": "kubectl apply -f /deploy/manifest.yaml",
            "onBefore": ["run-tests", "build-image"],
            "onCompletion": ["smoke-test"],
            "onError": ["rollback-deploy", "alert-oncall"],
            "onSubsequent": ["log-deploy-result"]
        },
        "run-tests": {
            "GUIDTask": "run-tests",
            "Name": "Run Test Suite",
            "Type": "Command",
            "Command": "npm test"
        },
        "build-image": {
            "GUIDTask": "build-image",
            "Name": "Build Docker Image",
            "Type": "Command",
            "Command": "docker build -t myapp:latest ."
        },
        "smoke-test": {
            "GUIDTask": "smoke-test",
            "Name": "Run Smoke Tests",
            "Type": "Request",
            "URL": "https://myapp.example.com/health",
            "Method": "GET"
        },
        "rollback-deploy": {
            "GUIDTask": "rollback-deploy",
            "Name": "Rollback Deployment",
            "Type": "Command",
            "Command": "kubectl rollout undo deployment/myapp"
        },
        "alert-oncall": {
            "GUIDTask": "alert-oncall",
            "Name": "Alert On-Call",
            "Type": "Request",
            "URL": "https://hooks.slack.example.com/alert",
            "Method": "POST"
        },
        "log-deploy-result": {
            "GUIDTask": "log-deploy-result",
            "Name": "Log Deploy Result",
            "Type": "Command",
            "Command": "echo \"Deploy finished at $(date)\" >> /var/log/deploys.log"
        }
    }
}
```

### Manifest Entry with Subsequent Results

When a task with subsequent sets executes, the manifest entry includes a
`SubsequentResults` object keyed by set name. Each set contains an array
of manifest entries for the subsequent tasks that ran:

```json
{
    "GUIDTask": "backup-db",
    "Name": "Backup Database",
    "Type": "Command",
    "StartTime": "2026-02-10T12:00:00.000Z",
    "StopTime": "2026-02-10T12:00:02.150Z",
    "Status": "Complete",
    "Success": true,
    "Output": "pg_dump: ...",
    "Log": ["..."],
    "SubsequentResults": {
        "onBefore": [
            {
                "GUIDTask": "notify-start",
                "Status": "Complete",
                "Success": true,
                "Output": "..."
            }
        ],
        "onCompletion": [
            {
                "GUIDTask": "verify-backup",
                "Status": "Complete",
                "Success": true,
                "Output": "OK"
            },
            {
                "GUIDTask": "notify-success",
                "Status": "Complete",
                "Success": true,
                "Output": "..."
            }
        ],
        "onSubsequent": [
            {
                "GUIDTask": "cleanup-temp",
                "Status": "Complete",
                "Success": true,
                "Output": ""
            }
        ]
    }
}
```

Sets that were not executed (e.g., `onFailure` when the task succeeded)
will not appear in `SubsequentResults`.

### Important Notes

- **No recursive chaining.** Subsequent tasks execute their core logic
  only. If a subsequent task itself has subsequent sets defined, those
  nested sets are not executed. This prevents infinite recursion.
- **Missing GUIDs are skipped.** If a subsequent set references a task
  GUID that does not exist in state, it is logged and skipped gracefully.
- **Empty arrays are no-ops.** Setting a subsequent set to `[]` is the
  same as not defining it at all.
- **Order is preserved.** Tasks within a set execute sequentially in the
  order they appear in the array.

## Managing Tasks

### Via CLI

```bash
# Add or update a task
ultravisor updatetask -g my-task -n "My Task" -t Command -p "echo hello"

# Add from a JSON file
ultravisor updatetask -f ./task-definition.json

# Combine file + overrides (CLI params take precedence)
ultravisor updatetask -f ./task-definition.json -g override-guid

# Run immediately
ultravisor singletask my-task

# Dry run
ultravisor singletask my-task --dry_run
```

### Via API

```bash
# Create
curl -X POST http://localhost:54321/Task \
  -H "Content-Type: application/json" \
  -d '{
    "GUIDTask": "my-task",
    "Name": "My Task",
    "Type": "Command",
    "Command": "echo hello"
  }'

# Read one
curl http://localhost:54321/Task/my-task

# List all
curl http://localhost:54321/Task

# Update
curl -X PUT http://localhost:54321/Task/my-task \
  -H "Content-Type: application/json" \
  -d '{"Name": "My Updated Task", "Command": "echo updated"}'

# Delete
curl -X DELETE http://localhost:54321/Task/my-task

# Execute
curl http://localhost:54321/Task/my-task/Execute
```

### Via Configuration File

Tasks defined directly in `.ultravisor.json` are loaded at startup:

```json
{
    "Tasks": {
        "backup-db": {
            "GUIDTask": "backup-db",
            "Name": "Backup Database",
            "Type": "Command",
            "Command": "pg_dump mydb > /backups/mydb.sql"
        },
        "fetch-api-data": {
            "GUIDTask": "fetch-api-data",
            "Name": "Fetch API Data",
            "Type": "Request",
            "URL": "https://api.example.com/data",
            "Method": "GET"
        }
    }
}
```

## Examples

### Fetch public JSON and save locally

This operation pulls user data from the JSONPlaceholder API, saves the
raw response to the staging folder, then lists the folder contents to
confirm the file landed.

```json
{
    "UltravisorFileStorePath": "/var/data/ultravisor",
    "Tasks": {
        "fetch-users": {
            "GUIDTask": "fetch-users",
            "Name": "Fetch Users from JSONPlaceholder",
            "Type": "GetJSON",
            "URL": "https://jsonplaceholder.typicode.com/users"
        },
        "save-users": {
            "GUIDTask": "save-users",
            "Name": "Save Users to Staging",
            "Type": "WriteJSON",
            "File": "api-snapshots/users.json",
            "Data": "<<populated at runtime by the operation>>"
        },
        "verify-snapshot": {
            "GUIDTask": "verify-snapshot",
            "Name": "List Snapshot Directory",
            "Type": "ListFiles",
            "Path": "api-snapshots"
        }
    },
    "Operations": {
        "snapshot-users": {
            "GUIDOperation": "snapshot-users",
            "Name": "Snapshot Users API",
            "Tasks": ["fetch-users", "save-users", "verify-snapshot"]
        }
    }
}
```

Running `ultravisor singleoperation snapshot-users` will:
1. GET `https://jsonplaceholder.typicode.com/users` and parse the JSON
2. Write the result to `/var/data/ultravisor/api-snapshots/users.json`
3. List the `api-snapshots/` directory and confirm the file exists

Each task's output is captured in the operation manifest, so the raw
JSON from step 1 is available in the manifest even if step 2 fails.

### Config-driven conditional pipeline

This configuration uses a `Conditional` task to check a feature flag
before deciding which data pipeline to run. A `WriteJSON` task seeds
a local config file that other tasks can read.

```json
{
    "UltravisorFileStorePath": "/data/pipeline",
    "Tasks": {
        "write-pipeline-config": {
            "GUIDTask": "write-pipeline-config",
            "Name": "Write Pipeline Config",
            "Type": "WriteJSON",
            "File": "config/pipeline.json",
            "Data": {
                "version": 2,
                "useNewParser": true,
                "outputFormat": "parquet"
            }
        },
        "read-pipeline-config": {
            "GUIDTask": "read-pipeline-config",
            "Name": "Read Pipeline Config",
            "Type": "ReadJSON",
            "File": "config/pipeline.json"
        },
        "check-parser-flag": {
            "GUIDTask": "check-parser-flag",
            "Name": "Check Parser Flag",
            "Type": "Conditional",
            "Address": "Flags.useNewParser",
            "TrueTask": "run-new-parser",
            "FalseTask": "run-legacy-parser"
        },
        "run-new-parser": {
            "GUIDTask": "run-new-parser",
            "Name": "Run New Parser",
            "Type": "Command",
            "Command": "python3 /scripts/new_parser.py --format parquet"
        },
        "run-legacy-parser": {
            "GUIDTask": "run-legacy-parser",
            "Name": "Run Legacy Parser",
            "Type": "Command",
            "Command": "python3 /scripts/legacy_parser.py --format csv"
        },
        "log-result": {
            "GUIDTask": "log-result",
            "Name": "Log Pipeline Result",
            "Type": "WriteText",
            "File": "logs/pipeline-run.log",
            "Data": "Pipeline completed successfully."
        }
    },
    "Operations": {
        "data-pipeline": {
            "GUIDOperation": "data-pipeline",
            "Name": "Conditional Data Pipeline",
            "Tasks": [
                "write-pipeline-config",
                "read-pipeline-config",
                "check-parser-flag",
                "log-result"
            ],
            "GlobalState": {
                "Flags": { "useNewParser": true }
            }
        }
    }
}
```

### Webhook relay with error notification

This example uses `SendJSON` to push metrics to a dashboard, with
`onError` and `onCompletion` subsequent tasks for alerting. If the
POST fails, an error report is written to the staging folder.

```json
{
    "UltravisorFileStorePath": "/var/data/ultravisor",
    "Tasks": {
        "push-metrics": {
            "GUIDTask": "push-metrics",
            "Name": "Push Metrics to Dashboard",
            "Type": "SendJSON",
            "URL": "https://dashboard.example.com/api/v1/ingest",
            "Method": "POST",
            "Data": {
                "source": "ultravisor",
                "timestamp": "2026-02-10T12:00:00Z",
                "cpu_percent": 34.2,
                "memory_mb": 2048,
                "disk_free_gb": 120
            },
            "Headers": {
                "X-API-Key": "your-dashboard-api-key"
            },
            "onCompletion": ["log-push-success"],
            "onError": ["write-error-report", "alert-slack"]
        },
        "log-push-success": {
            "GUIDTask": "log-push-success",
            "Name": "Log Success",
            "Type": "WriteText",
            "File": "logs/metrics-push.log",
            "Data": "Metrics pushed successfully."
        },
        "write-error-report": {
            "GUIDTask": "write-error-report",
            "Name": "Write Error Report",
            "Type": "WriteJSON",
            "File": "errors/last-push-failure.json",
            "Data": {
                "event": "metrics-push-failed",
                "action": "investigate dashboard endpoint"
            }
        },
        "alert-slack": {
            "GUIDTask": "alert-slack",
            "Name": "Alert Slack Channel",
            "Type": "SendJSON",
            "URL": "https://hooks.slack.com/services/T00/B00/xxxxx",
            "Method": "POST",
            "Data": {
                "text": "Ultravisor: metrics push to dashboard failed."
            }
        }
    }
}
```

### Multi-format report generator

Combines `GetJSON`, `WriteJSON`, `WriteText` and `ListFiles` into a
reporting pipeline. Fetches data from a public API, stores the raw
JSON, generates a human-readable summary, then lists all output files.

```json
{
    "UltravisorFileStorePath": "/data/reports",
    "Tasks": {
        "fetch-posts": {
            "GUIDTask": "fetch-posts",
            "Name": "Fetch Recent Posts",
            "Type": "GetJSON",
            "URL": "https://jsonplaceholder.typicode.com/posts?_limit=5"
        },
        "save-raw-json": {
            "GUIDTask": "save-raw-json",
            "Name": "Save Raw JSON",
            "Type": "WriteJSON",
            "File": "daily/posts-raw.json",
            "Data": { "note": "Replaced at runtime with fetch output" }
        },
        "write-summary": {
            "GUIDTask": "write-summary",
            "Name": "Write Human Summary",
            "Type": "WriteText",
            "File": "daily/summary.txt",
            "Data": "Daily Report\n============\nGenerated by Ultravisor.\n\nFetched 5 recent posts from JSONPlaceholder API.\nRaw data saved to posts-raw.json."
        },
        "list-output": {
            "GUIDTask": "list-output",
            "Name": "List Daily Output",
            "Type": "ListFiles",
            "Path": "daily"
        }
    },
    "Operations": {
        "daily-report": {
            "GUIDOperation": "daily-report",
            "Name": "Daily Report Pipeline",
            "Tasks": [
                "fetch-posts",
                "save-raw-json",
                "write-summary",
                "list-output"
            ]
        }
    }
}
```

Running `ultravisor singleoperation daily-report` produces:
- `daily/posts-raw.json` -- the raw API response
- `daily/summary.txt` -- a text summary
- The final manifest includes a file listing of the `daily/` directory
