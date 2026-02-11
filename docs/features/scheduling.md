# Scheduling

Ultravisor uses cron expressions to schedule recurring execution of tasks
and operations. The Hypervisor service manages schedule entries, and the
Cron Event service creates the actual cron jobs.

## Schedule Types

| Type | Default Expression | Description |
|------|-------------------|-------------|
| `cron` | `0 * * * *` | Standard cron expression |
| `hourly` | `0 * * * *` | Every hour at minute 0 |
| `daily` | `0 0 * * *` | Every day at midnight |

When you specify `daily` or `hourly`, the parameters field is still used as
the actual cron expression if provided. The type mainly sets the default
fallback.

## Cron Expression Format

Ultravisor uses the standard 5-field cron format:

```
*    *    *    *    *
|    |    |    |    |
|    |    |    |    +--- Day of week (0-7, Sun=0 or 7)
|    |    |    +-------- Month (1-12)
|    |    +------------- Day of month (1-31)
|    +------------------ Hour (0-23)
+----------------------- Minute (0-59)
```

The `cron` library also supports a 6-field format with seconds:

```
*    *    *    *    *    *
|    |    |    |    |    |
|    |    |    |    |    +--- Day of week
|    |    |    |    +-------- Month
|    |    |    +------------- Day of month
|    |    +------------------ Hour
|    +----------------------- Minute
+---------------------------- Second (0-59)
```

### Common Expressions

| Expression | Meaning |
|------------|---------|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour |
| `0 */6 * * *` | Every 6 hours |
| `0 0 * * *` | Daily at midnight |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 0 1 * *` | First day of each month |
| `30 2 * * 0` | Sundays at 2:30 AM |

## Schedule Entry Model

Each schedule entry has this structure:

```json
{
    "GUID": "sched-task-disk-usage-1707566400000",
    "TargetType": "Task",
    "TargetGUID": "disk-usage",
    "ScheduleType": "cron",
    "Parameters": "*/5 * * * *",
    "CronExpression": "*/5 * * * *",
    "Active": false,
    "CreatedAt": "2026-02-10T12:00:00.000Z"
}
```

| Field | Description |
|-------|-------------|
| `GUID` | Auto-generated unique ID for this schedule entry |
| `TargetType` | `Task` or `Operation` |
| `TargetGUID` | The GUID of the task or operation to execute |
| `ScheduleType` | `cron`, `daily`, or `hourly` |
| `Parameters` | The raw parameters (usually a cron expression) |
| `CronExpression` | The resolved cron expression used for scheduling |
| `Active` | Whether the cron job is currently running |
| `CreatedAt` | ISO timestamp of when the entry was created |

## Managing the Schedule

### Via CLI

```bash
# Schedule a task
ultravisor schedule_task disk-usage -t cron -p "*/5 * * * *"

# Schedule an operation
ultravisor schedule_operation etl-pipeline -t daily -p "0 2 * * *"

# View schedule
ultravisor schedule

# Stop all scheduled jobs
ultravisor stop
```

### Via API

```bash
# View schedule
curl http://localhost:54321/Schedule

# Schedule a task
curl -X POST http://localhost:54321/Schedule/Task \
  -H "Content-Type: application/json" \
  -d '{
    "GUIDTask": "disk-usage",
    "ScheduleType": "cron",
    "Parameters": "*/5 * * * *"
  }'

# Schedule an operation
curl -X POST http://localhost:54321/Schedule/Operation \
  -H "Content-Type: application/json" \
  -d '{
    "GUIDOperation": "etl-pipeline",
    "ScheduleType": "daily",
    "Parameters": "0 2 * * *"
  }'

# Remove a schedule entry
curl -X DELETE http://localhost:54321/Schedule/sched-task-disk-usage-1707566400000

# Start all scheduled jobs
curl http://localhost:54321/Schedule/Start

# Stop all scheduled jobs
curl http://localhost:54321/Schedule/Stop
```

## Lifecycle

1. **Create** -- `scheduleTask()` or `scheduleOperation()` adds an entry to
   the in-memory schedule with `Active: false`
2. **Start** -- `startSchedule()` iterates all inactive entries, marks them
   active, and creates a cron job for each
3. **Tick** -- on each cron tick, the target task or operation is looked up
   from state and executed
4. **Stop** -- `stopSchedule()` stops all cron jobs and marks entries inactive
5. **Remove** -- `removeScheduleEntry()` stops the job (if active) and
   removes the entry from the schedule

## Examples

### Run a backup every night at 2 AM

```bash
ultravisor schedule_task nightly-backup -t cron -p "0 2 * * *"
```

### Monitor disk every 10 minutes

```json
{
    "GUIDTask": "disk-monitor",
    "ScheduleType": "cron",
    "Parameters": "*/10 * * * *"
}
```

```bash
curl -X POST http://localhost:54321/Schedule/Task \
  -H "Content-Type: application/json" \
  -d '{"GUIDTask":"disk-monitor","ScheduleType":"cron","Parameters":"*/10 * * * *"}'
```

### Run an ETL pipeline on weekdays at 6 AM

```bash
ultravisor schedule_operation etl-pipeline -t cron -p "0 6 * * 1-5"
```
