# Ultravisor Architecture

## Service Provider Pattern

Ultravisor is built on the Retold `fable-serviceproviderbase` pattern. Each
major component is a service registered with a Fable instance via
`addAndInstantiateServiceTypeIfNotExists`. Services access each other through
the shared `this.fable[ServiceName]` namespace.

## Service Map

```
Ultravisor-CLIProgram (Pict CLI entrypoint)
  |
  +-- Ultravisor-Hypervisor          Scheduler / orchestrator
  |     |
  |     +-- Ultravisor-Hypervisor-Event-Cron   Cron job management
  |     +-- Ultravisor-Hypervisor-Event-Solver  Condition-based triggers (future)
  |
  +-- Ultravisor-Hypervisor-State    Task/operation CRUD + persistence
  |
  +-- Ultravisor-Task                Task execution engine
  +-- Ultravisor-Operation           Operation execution (sequential task runner)
  +-- Ultravisor-Operation-Manifest  Execution output tracking
  |
  +-- Ultravisor-API-Server          REST API (Orator + Restify)
```

## Data Flow

### Immediate Execution

```
CLI Command or API Request
  --> Hypervisor-State.getTask() or getOperation()
  --> Task.executeTask() or Operation.executeOperation()
  --> Operation-Manifest tracks results
  --> Manifest returned to caller
```

### Scheduled Execution

```
Hypervisor.startSchedule()
  --> For each schedule entry:
      --> Event-Cron creates a CronJob
      --> On tick: look up target from State
      --> Execute via Task or Operation service
      --> Results logged
```

### State Persistence

```
State.updateTask() or updateOperation()
  --> In-memory hash updated
  --> persistState() writes merged JSON to .ultravisor.json
```

## File Structure

```
source/
  Ultravisor.cjs                          Module entry point
  cli/
    Ultravisor-CLIProgram.cjs             CLI bootstrap + service init
    Ultravisor-Run.cjs                    Executable entry (shebang)
    commands/
      Ultravisor-Command-Start.cjs        Start API server
      Ultravisor-Command-Stop.cjs         Stop scheduler
      Ultravisor-Command-ScheduleView.cjs View schedule
      Ultravisor-Command-ScheduleOperation.cjs  Schedule an operation
      Ultravisor-Command-ScheduleTask.cjs       Schedule a task
      Ultravisor-Command-UpdateTask.cjs         Add/update a task definition
      Ultravisor-Command-SingleOperation.cjs    Run operation immediately
      Ultravisor-Command-SingleTask.cjs         Run task immediately
  config/
    Ultravisor-Default-Command-Configuration.cjs  Default config values
  services/
    Ultravisor-Hypervisor.cjs             Scheduler + schedule management
    Ultravisor-Hypervisor-State.cjs       CRUD + persistence
    Ultravisor-Task.cjs                   Task execution engine
    Ultravisor-Operation.cjs              Operation runner
    Ultravisor-Operation-Manifest.cjs     Manifest lifecycle
    Ultravisor-Hypervisor-Event-Base.cjs  Base event class
    events/
      Ultravisor-Hypervisor-Event-Cron.cjs    Cron scheduling
      Ultravisor-Hypervisor-Event-Solver.cjs  Condition-based (future)
  web_server/
    Ultravisor-API-Server.cjs             REST endpoint definitions
```

## Configuration Layering

Configuration is gathered automatically by Pict in this order:

1. **Default Program Configuration** -- hardcoded defaults in
   `Ultravisor-Default-Command-Configuration.cjs`
2. **`.ultravisor.json`** -- project-level overrides (searched from cwd upward)

The final merged result is available as `fable.ProgramConfiguration`. Tasks
and operations are stored in this same file under the `Tasks` and
`Operations` keys.
