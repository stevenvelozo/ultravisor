# Ultravisor Overview

Ultravisor is a cyclic process execution tool with AI integration. It runs commands, HTTP requests and other tasks on schedule, producing structured output manifests that track timing, success/failure and logs for every execution.

## What It Does

Ultravisor manages two core primitives -- **Tasks** and **Operations** -- and provides multiple ways to run them: immediately via CLI or API, or on a recurring schedule via cron expressions.

**Tasks** are individual units of work: shell commands, HTTP requests or other executable actions. **Operations** compose multiple tasks into a sequential pipeline with a unified output manifest.

## How It Runs

Ultravisor can be used in three modes:

1. **CLI** -- run individual tasks or operations from the command line
2. **API Server** -- start a Restify-based HTTP server exposing full CRUD and execution endpoints for tasks, operations, schedules and manifests
3. **Scheduled** -- define cron schedules that automatically execute tasks or operations at the configured intervals

## Configuration

Ultravisor uses a layered configuration system. The default configuration ships with the module and can be overridden by a `.ultravisor.json` file in the working directory. Tasks and operations are persisted into this same configuration file.

```json
{
    "UltravisorAPIServerPort": 54321,
    "UltravisorFileStorePath": "/path/to/datastore",
    "UltravisorTickIntervalMilliseconds": 60000,
    "Tasks": {},
    "Operations": {}
}
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| Task | A single executable unit (shell command, HTTP request, etc.) |
| Operation | An ordered set of tasks executed sequentially |
| Schedule | A cron-based trigger that runs a task or operation on a timer |
| Manifest | The output record from executing an operation |
| Hypervisor | The central scheduler that manages the schedule and dispatches executions |
| State | Persistent storage of task and operation definitions in `.ultravisor.json` |

## Module Dependencies

Ultravisor is built on the Retold ecosystem:

- **pict** / **pict-serviceproviderbase** -- service provider pattern and CLI framework
- **pict-service-commandlineutility** -- CLI command registration
- **orator** / **orator-serviceserver-restify** -- REST API server
- **cron** -- cron expression scheduling

## Documentation Map

- [Architecture](architecture.md) -- service structure and data flow
- [Quick Start](quickstart.md) -- get running in five minutes
- [Tasks](features/tasks.md) -- task types, model and execution
- [Operations](features/operations.md) -- composing tasks into pipelines
- [Scheduling](features/scheduling.md) -- cron-based recurring execution
- [API Server](features/api.md) -- REST endpoint reference
- [CLI Commands](features/cli.md) -- command line interface reference
- [Manifests](features/manifests.md) -- execution output and logging
- [Configuration](features/configuration.md) -- configuration file format and options
