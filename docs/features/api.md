# API Server

Ultravisor includes a REST API server built on Orator (Restify). Start it
with `ultravisor start` and it exposes endpoints for managing tasks,
operations, schedules and manifests.

## Server Configuration

The API server port is configured in `.ultravisor.json`:

```json
{
    "UltravisorAPIServerPort": 54321
}
```

Default port: `54321`. Fallback if not configured: `55555`.

## Starting the Server

```bash
ultravisor start
```

Or with verbose logging:

```bash
ultravisor start --verbose
```

## Endpoint Reference

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/package` | Returns the package.json metadata |
| `GET` | `/status` | Returns server and schedule status |
| `GET` | `/stop` | Stops the scheduler and shuts down the server |

#### GET /status

```json
{
    "Status": "Running",
    "ScheduleEntries": 3,
    "ScheduleRunning": true
}
```

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/Task` | List all tasks |
| `GET` | `/Task/:GUIDTask` | Get a single task |
| `POST` | `/Task` | Create or update a task |
| `PUT` | `/Task/:GUIDTask` | Update a task |
| `DELETE` | `/Task/:GUIDTask` | Delete a task |
| `GET` | `/Task/:GUIDTask/Execute` | Execute a task immediately |

#### POST /Task

```bash
curl -X POST http://localhost:54321/Task \
  -H "Content-Type: application/json" \
  -d '{
    "GUIDTask": "my-task",
    "Name": "My Task",
    "Type": "Command",
    "Command": "echo hello"
  }'
```

Response:

```json
{
    "GUIDTask": "my-task",
    "Name": "My Task",
    "Type": "Command",
    "Command": "echo hello"
}
```

#### GET /Task/:GUIDTask/Execute

```bash
curl http://localhost:54321/Task/my-task/Execute
```

Response:

```json
{
    "GUIDTask": "my-task",
    "Name": "My Task",
    "Type": "Command",
    "StartTime": "2026-02-10T12:00:00.000Z",
    "StopTime": "2026-02-10T12:00:00.025Z",
    "Status": "Complete",
    "Success": true,
    "Output": "hello\n",
    "Log": ["..."]
}
```

### Operations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/Operation` | List all operations |
| `GET` | `/Operation/:GUIDOperation` | Get a single operation |
| `POST` | `/Operation` | Create or update an operation |
| `PUT` | `/Operation/:GUIDOperation` | Update an operation |
| `DELETE` | `/Operation/:GUIDOperation` | Delete an operation |
| `GET` | `/Operation/:GUIDOperation/Execute` | Execute an operation |

#### POST /Operation

```bash
curl -X POST http://localhost:54321/Operation \
  -H "Content-Type: application/json" \
  -d '{
    "GUIDOperation": "my-pipeline",
    "Name": "My Pipeline",
    "Tasks": ["task-a", "task-b", "task-c"]
  }'
```

#### GET /Operation/:GUIDOperation/Execute

Returns a full manifest with results for each task in the operation.

### Schedule

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/Schedule` | List all schedule entries |
| `POST` | `/Schedule/Task` | Schedule a task |
| `POST` | `/Schedule/Operation` | Schedule an operation |
| `DELETE` | `/Schedule/:GUID` | Remove a schedule entry |
| `GET` | `/Schedule/Start` | Start all scheduled cron jobs |
| `GET` | `/Schedule/Stop` | Stop all scheduled cron jobs |

#### POST /Schedule/Task

```bash
curl -X POST http://localhost:54321/Schedule/Task \
  -H "Content-Type: application/json" \
  -d '{
    "GUIDTask": "disk-check",
    "ScheduleType": "cron",
    "Parameters": "*/5 * * * *"
  }'
```

Response:

```json
{
    "GUID": "sched-task-disk-check-1707566400000",
    "TargetType": "Task",
    "TargetGUID": "disk-check",
    "ScheduleType": "cron",
    "Parameters": "*/5 * * * *",
    "CronExpression": "*/5 * * * *",
    "Active": false,
    "CreatedAt": "2026-02-10T12:00:00.000Z"
}
```

#### POST /Schedule/Operation

```bash
curl -X POST http://localhost:54321/Schedule/Operation \
  -H "Content-Type: application/json" \
  -d '{
    "GUIDOperation": "nightly-etl",
    "ScheduleType": "daily",
    "Parameters": "0 2 * * *"
  }'
```

### Manifests

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/Manifest` | List all operation run manifests |
| `GET` | `/Manifest/:GUIDRun` | Get a specific manifest by run GUID |

#### GET /Manifest

Returns an array of all operation manifests from the current session.

#### GET /Manifest/:GUIDRun

```json
{
    "GUIDOperation": "my-pipeline",
    "GUIDRun": "my-pipeline-1707566400000",
    "Name": "My Pipeline",
    "StartTime": "2026-02-10T12:00:00.000Z",
    "StopTime": "2026-02-10T12:00:02.500Z",
    "Status": "Complete",
    "Success": true,
    "Summary": "Operation my-pipeline Complete: 3 task(s) executed.",
    "TaskResults": [],
    "Log": []
}
```

## Error Responses

All error responses follow this format:

```json
{
    "Error": "Description of what went wrong"
}
```

HTTP status codes used:

| Code | Meaning |
|------|---------|
| `200` | Success |
| `400` | Bad request (invalid input) |
| `404` | Resource not found |
| `500` | Server error |
