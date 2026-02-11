# CLI Commands

Ultravisor provides a command-line interface for managing tasks, operations,
schedules, and the API server. The CLI is invoked via the `ultravisor`
command (or `node source/cli/Ultravisor-Run.cjs`).

## Command Reference

### start

Start the API server.

```bash
ultravisor start
ultravisor start --verbose
```

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Enable verbose console output |

The server starts on the port configured in `.ultravisor.json`
(`UltravisorAPIServerPort`, default `54321`).

### stop

Stop the Hypervisor scheduler. Deactivates all running cron jobs.

```bash
ultravisor stop
```

### updatetask

Add or update a task definition. The task is persisted to
`.ultravisor.json`.

```bash
ultravisor updatetask -g disk-check -n "Check Disk" -t Command -p "df -h"
```

| Option | Description | Default |
|--------|-------------|---------|
| `-g, --guid` | Task GUID | (none) |
| `-c, --code` | Task code | (none) |
| `-n, --name` | Task name | (none) |
| `-t, --type` | Task type | `CRON` |
| `-p, --parameters` | Task parameters | `0 0 * * * *` |
| `-f, --file` | Path to JSON task definition file | (none) |

When `-f` is provided, the JSON file is loaded and then any CLI parameters
override the file values:

```bash
# Load from file, but override the GUID
ultravisor updatetask -f ./my-task.json -g custom-guid
```

Example JSON file:

```json
{
    "GUIDTask": "api-health",
    "Name": "API Health Check",
    "Type": "Request",
    "URL": "https://api.example.com/health"
}
```

### singletask (alias: task)

Execute a single task immediately.

```bash
ultravisor singletask disk-check
ultravisor task disk-check
ultravisor singletask disk-check --dry_run
```

| Argument | Description |
|----------|-------------|
| `<task>` | The task GUID to execute |

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --operation` | Scope task to an operation | `Default` |
| `-d, --dry_run` | Print what would happen without executing | `false` |

### singleoperation (alias: operation)

Execute a single operation immediately.

```bash
ultravisor singleoperation etl-pipeline
ultravisor operation etl-pipeline
ultravisor singleoperation etl-pipeline --dry_run
```

| Argument | Description |
|----------|-------------|
| `<operation>` | The operation GUID to execute |

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --dry_run` | Print what would happen without executing | `false` |

### schedule (alias: cal)

View the current schedule.

```bash
ultravisor schedule
ultravisor cal
```

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format` | Visualization format (day, week, month) | `day` |

Example output:

```
=== Ultravisor Schedule (2 entries) ===

  [INACTIVE] Task: disk-check
           Schedule: cron (*/5 * * * *)
           GUID: sched-task-disk-check-1707566400000

  [INACTIVE] Operation: etl-pipeline
           Schedule: daily (0 2 * * *)
           GUID: sched-op-etl-pipeline-1707566400001
```

### schedule_task (alias: st)

Add a task to the schedule.

```bash
ultravisor schedule_task disk-check -t cron -p "*/5 * * * *"
ultravisor st disk-check -t hourly
```

| Argument | Description |
|----------|-------------|
| `<task_guid>` | The task GUID to schedule |

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --type` | Schedule type (cron, daily, hourly, solver) | `cron` |
| `-p, --parameters` | Cron expression or schedule parameters | (empty) |

### schedule_operation (alias: so)

Add an operation to the schedule.

```bash
ultravisor schedule_operation etl-pipeline -t daily -p "0 2 * * *"
ultravisor so etl-pipeline -t cron -p "0 6 * * 1-5"
```

| Argument | Description |
|----------|-------------|
| `<operation_guid>` | The operation GUID to schedule |

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --type` | Schedule type (cron, daily, hourly, solver) | `cron` |
| `-p, --parameters` | Cron expression or schedule parameters | (empty) |

### configuration

Auto-generated command that explains how Ultravisor resolved its
configuration (which files were loaded, what values came from where).

```bash
ultravisor configuration
```

## Exit Codes

- `0` -- command completed successfully
- Non-zero -- an error occurred during execution
