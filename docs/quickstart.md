# Ultravisor Quick Start

## Install

```bash
npm install
```

## 1. Define a Task

Create or edit `.ultravisor.json` in your project root:

```json
{
    "UltravisorAPIServerPort": 54321,
    "Tasks": {
        "disk-usage": {
            "GUIDTask": "disk-usage",
            "Name": "Check Disk Usage",
            "Type": "Command",
            "Command": "df -h"
        }
    },
    "Operations": {}
}
```

Or use the CLI:

```bash
ultravisor updatetask -g disk-usage -n "Check Disk Usage" -t Command -p "df -h"
```

## 2. Run a Task Immediately

```bash
ultravisor singletask disk-usage
```

Output:

```
Executing task: disk-usage

Task Result:
  Status: Complete
  Success: true
  Start: 2026-02-10T12:00:00.000Z
  Stop: 2026-02-10T12:00:00.050Z
  Output: Filesystem      Size  Used  Avail  Use%  Mounted on ...
```

Dry run (shows what would happen without executing):

```bash
ultravisor singletask disk-usage --dry_run
```

## 3. Create an Operation

Add an operation that chains multiple tasks:

```json
{
    "Tasks": {
        "check-disk": {
            "GUIDTask": "check-disk",
            "Name": "Check Disk",
            "Type": "Command",
            "Command": "df -h /"
        },
        "check-memory": {
            "GUIDTask": "check-memory",
            "Name": "Check Memory",
            "Type": "Command",
            "Command": "vm_stat"
        }
    },
    "Operations": {
        "system-health": {
            "GUIDOperation": "system-health",
            "Name": "System Health Check",
            "Tasks": ["check-disk", "check-memory"]
        }
    }
}
```

Run it:

```bash
ultravisor singleoperation system-health
```

## 4. Start the API Server

```bash
ultravisor start
```

The server starts on the configured port (default 54321). Now you can
interact via HTTP:

```bash
# List all tasks
curl http://localhost:54321/Task

# Execute a task
curl http://localhost:54321/Task/disk-usage/Execute

# Create a new task via API
curl -X POST http://localhost:54321/Task \
  -H "Content-Type: application/json" \
  -d '{"GUIDTask":"uptime","Name":"Uptime","Type":"Command","Command":"uptime"}'

# Execute an operation
curl http://localhost:54321/Operation/system-health/Execute

# View recent execution manifests
curl http://localhost:54321/Manifest
```

## 5. Schedule Recurring Execution

Schedule a task to run every 5 minutes:

```bash
ultravisor schedule_task check-disk -t cron -p "*/5 * * * *"
```

Schedule an operation to run daily at midnight:

```bash
ultravisor schedule_operation system-health -t daily -p "0 0 * * *"
```

View the current schedule:

```bash
ultravisor schedule
```

Start the schedule (activates all cron jobs):

```bash
# Via API
curl http://localhost:54321/Schedule/Start

# The schedule also runs when the API server is started
```

## 6. Stop

```bash
# Stop the scheduler
ultravisor stop

# Stop the API server
curl http://localhost:54321/stop
```

## Next Steps

- See [Tasks](features/tasks.md) for all task types and options
- See [Operations](features/operations.md) for composing task pipelines
- See [API](features/api.md) for the full endpoint reference
- See [Configuration](features/configuration.md) for all config options
