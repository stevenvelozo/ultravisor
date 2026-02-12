# Configuration

Ultravisor uses a layered JSON configuration system. Configuration is
gathered automatically at startup and merged into a single object.

## Configuration File

The primary configuration file is `.ultravisor.json`, located in the
working directory. This file stores both runtime settings and persisted
task/operation definitions.

### Minimal Configuration

```json
{
    "UltravisorAPIServerPort": 54321
}
```

### Full Configuration

```json
{
    "UltravisorAPIServerPort": 54321,
    "UltravisorFileStorePath": "/var/data/ultravisor_datastore",
    "UltravisorStagingRoot": "/var/data/ultravisor_staging",
    "UltravisorTickIntervalMilliseconds": 60000,
    "Tasks": {
        "my-task": {
            "GUIDTask": "my-task",
            "Name": "My Task",
            "Type": "Command",
            "Command": "echo hello"
        }
    },
    "Operations": {
        "my-op": {
            "GUIDOperation": "my-op",
            "Name": "My Operation",
            "Tasks": ["my-task"]
        }
    }
}
```

## Configuration Options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `UltravisorAPIServerPort` | Number | `54321` | Port for the REST API server |
| `UltravisorFileStorePath` | String | `${cwd}/dist/ultravisor_datastore` | Path for the output file store |
| `UltravisorStagingRoot` | String | `${cwd}/dist/ultravisor_staging` | Root folder for per-operation staging directories |
| `UltravisorTickIntervalMilliseconds` | Number | `60000` | Base tick interval in milliseconds |
| `UltravisorCommandTimeoutMilliseconds` | Number | `300000` | Timeout for command task execution (5 minutes) |
| `UltravisorCommandMaxBufferBytes` | Number | `10485760` | Max stdout/stderr buffer size for commands (10 MB) |
| `Tasks` | Object | `{}` | Map of task GUIDs to task definitions |
| `Operations` | Object | `{}` | Map of operation GUIDs to operation definitions |

## Configuration Layering

Configuration is resolved in order (later layers override earlier):

1. **Default Program Configuration** -- hardcoded defaults in
   `source/config/Ultravisor-Default-Command-Configuration.cjs`:

   ```json
   {
       "UltravisorAPIServerPort": 54321,
       "UltravisorFileStorePath": "${cwd}/dist/ultravisor_datastore",
       "UltravisorStagingRoot": "${cwd}/dist/ultravisor_staging",
       "UltravisorTickIntervalMilliseconds": 60000,
       "UltravisorCommandTimeoutMilliseconds": 300000,
       "UltravisorCommandMaxBufferBytes": 10485760
   }
   ```

2. **`.ultravisor.json`** -- project-level file searched from the current
   working directory upward through parent directories

The merged result is available as `fable.ProgramConfiguration` within
services.

## Viewing Configuration Resolution

Use the built-in `configuration` command to see how Ultravisor resolved
its configuration:

```bash
ultravisor configuration
```

This shows each gather phase, what file was loaded, and what values came
from where.

## State Persistence

When tasks or operations are created/updated via the CLI (`updatetask`)
or the API (`POST /Task`, `POST /Operation`), the state service merges
the changes back into the `.ultravisor.json` file.

The merge logic:
- The existing file is read
- New or updated tasks/operations are merged (existing fields preserved,
  new fields added)
- The entire configuration is written back to the file

This means the `.ultravisor.json` file serves as both configuration and
persistent storage.

## Example Configurations

### Simple API monitoring

```json
{
    "UltravisorAPIServerPort": 8080,
    "Tasks": {
        "health-check": {
            "GUIDTask": "health-check",
            "Name": "API Health Check",
            "Type": "Request",
            "URL": "https://api.example.com/health"
        }
    },
    "Operations": {}
}
```

### Multi-task data pipeline

```json
{
    "UltravisorAPIServerPort": 54321,
    "UltravisorFileStorePath": "/data/ultravisor",
    "Tasks": {
        "extract": {
            "GUIDTask": "extract",
            "Name": "Extract Data",
            "Type": "Command",
            "Command": "python3 /scripts/extract.py --output /tmp/extract.json"
        },
        "transform": {
            "GUIDTask": "transform",
            "Name": "Transform Data",
            "Type": "Command",
            "Command": "python3 /scripts/transform.py --input /tmp/extract.json --output /tmp/transformed.json"
        },
        "load": {
            "GUIDTask": "load",
            "Name": "Load Data",
            "Type": "Command",
            "Command": "python3 /scripts/load.py --input /tmp/transformed.json"
        }
    },
    "Operations": {
        "etl": {
            "GUIDOperation": "etl",
            "Name": "Full ETL Pipeline",
            "Tasks": ["extract", "transform", "load"]
        }
    }
}
```

### IoT sensor monitoring

```json
{
    "UltravisorAPIServerPort": 9000,
    "Tasks": {
        "read-temp-living": {
            "GUIDTask": "read-temp-living",
            "Name": "Read Living Room Temperature",
            "Type": "Request",
            "URL": "http://192.168.1.100/api/temperature"
        },
        "read-temp-bedroom": {
            "GUIDTask": "read-temp-bedroom",
            "Name": "Read Bedroom Temperature",
            "Type": "Request",
            "URL": "http://192.168.1.101/api/temperature"
        },
        "read-temp-garage": {
            "GUIDTask": "read-temp-garage",
            "Name": "Read Garage Temperature",
            "Type": "Request",
            "URL": "http://192.168.1.102/api/temperature"
        },
        "log-readings": {
            "GUIDTask": "log-readings",
            "Name": "Log Temperature Readings",
            "Type": "Command",
            "Command": "python3 /scripts/log_temps.py"
        }
    },
    "Operations": {
        "temp-sweep": {
            "GUIDOperation": "temp-sweep",
            "Name": "Temperature Sweep",
            "Tasks": [
                "read-temp-living",
                "read-temp-bedroom",
                "read-temp-garage",
                "log-readings"
            ]
        }
    }
}
```

### Media processing

```json
{
    "UltravisorAPIServerPort": 54321,
    "UltravisorFileStorePath": "/media/output",
    "Tasks": {
        "scan-input": {
            "GUIDTask": "scan-input",
            "Name": "Scan Input Directory",
            "Type": "Command",
            "Command": "ls -1 /media/input/*.avi > /tmp/pending_files.txt"
        },
        "transcode-batch": {
            "GUIDTask": "transcode-batch",
            "Name": "Transcode Video Batch",
            "Type": "Command",
            "Command": "bash /scripts/transcode_batch.sh /tmp/pending_files.txt /media/output"
        },
        "generate-thumbnails": {
            "GUIDTask": "generate-thumbnails",
            "Name": "Generate Thumbnails",
            "Type": "Command",
            "Command": "bash /scripts/thumbnails.sh /media/output"
        }
    },
    "Operations": {
        "media-ingest": {
            "GUIDOperation": "media-ingest",
            "Name": "Media Ingest Pipeline",
            "Tasks": ["scan-input", "transcode-batch", "generate-thumbnails"]
        }
    }
}
```
