# Capabilities and Actions

Every task type in Ultravisor belongs to a **Capability** and performs an
**Action** within that capability. This two-level taxonomy drives how work
is matched to workers and makes it straightforward to reason about what any
given task needs from its execution environment.

## Concepts

### Capability

A Capability describes _what_ a worker or environment can do. Examples
include accessing the local file system, making HTTP requests, executing
shell commands, or running a machine-learning model.

When a worker connects it advertises the set of capabilities it supports.
The execution engine uses these advertisements to route each task to a
worker that can handle it.

### Action

An Action is a verb within a capability. For example the **File System**
capability has actions like Read, Write, List, and Copy. A capability may
have one action (Shell &rarr; Execute) or many (Data Transform has nine).

### Tier

Capabilities are grouped into four tiers that describe how available the
capability is likely to be at runtime.

| Tier | Description |
|------|-------------|
| **Engine** | Always available. Pure in-memory computation with no I/O. These tasks run inside the execution engine itself and never need an external worker. |
| **Platform** | Standard on any Node.js worker. Uses built-in Node.js modules (`fs`, `child_process`, `http`). Any worker running on Node.js provides these automatically. |
| **Service** | Requires a specific external service to be reachable. The worker must be configured with the right endpoint and credentials. |
| **Extension** | Provided by specialized workers. These capabilities do not ship with Ultravisor and are added by connecting purpose-built workers (e.g. machine-learning inference, headless browser automation, media playback). |

## Capability Reference

### Data Transform

| | |
|---|---|
| **Tier** | Engine |
| **Description** | In-memory data manipulation &mdash; setting values, string operations, template rendering, expression evaluation, and tabular transforms. No I/O required. |

| Action | Task Type | What it Does |
|--------|-----------|--------------|
| SetValues | `set-values` | Writes one or more key/value pairs into state |
| ReplaceString | `replace-string` | Find-and-replace within a string |
| AppendString | `string-appender` | Appends text to a state address |
| Template | `template-string` | Renders a Pict template against state |
| EvaluateExpression | `expression-solver` | Evaluates a math or logic expression |
| ParseCSV | `parse-csv` | Parses CSV text into an array of records |
| TransformCSV | `csv-transform` | Transforms CSV data between formats |
| Intersect | `comprehension-intersect` | Computes the intersection of two data sets |
| Histogram | `histogram` | Buckets values into a histogram |

### Flow Control

| | |
|---|---|
| **Tier** | Engine |
| **Description** | Orchestration primitives &mdash; branching, looping, sub-operation dispatch, and operation entry/exit markers. |

| Action | Task Type | What it Does |
|--------|-----------|--------------|
| Begin | `start` | Operation entry point |
| End | `end` | Operation termination point |
| Branch | `if-conditional` | Evaluates a condition and fires True or False |
| Iterate | `split-execute` | Splits input by delimiter and loops over each token |
| LaunchOperation | `launch-operation` | Executes a child operation by hash |

### File System

| | |
|---|---|
| **Tier** | Platform |
| **Description** | Local file system access &mdash; reading, writing, listing, and copying files. Paths can be absolute or relative to the operation staging folder. |

| Action | Task Type | What it Does |
|--------|-----------|--------------|
| Read | `read-file` | Reads a file from disk into state |
| Write | `write-file` | Writes state content to a file |
| ReadJSON | `read-json` | Reads and parses a JSON file |
| WriteJSON | `write-json` | Serializes state to a JSON file |
| List | `list-files` | Lists files in a directory with glob pattern |
| Copy | `copy-file` | Copies a file from source to target |

### Shell

| | |
|---|---|
| **Tier** | Platform |
| **Description** | Operating system command execution via `child_process`. |

| Action | Task Type | What it Does |
|--------|-----------|--------------|
| Execute | `command` | Runs a shell command and captures stdout/stderr |

### HTTP Client

| | |
|---|---|
| **Tier** | Platform |
| **Description** | Outbound HTTP requests using Node.js built-in modules. |

| Action | Task Type | What it Does |
|--------|-----------|--------------|
| GetJSON | `get-json` | HTTP GET, parse response as JSON |
| GetText | `get-text` | HTTP GET, return response as text |
| SendJSON | `send-json` | Send JSON payload via configurable HTTP method |
| Request | `rest-request` | Fully configurable REST request with retries |

### User Interaction

| | |
|---|---|
| **Tier** | Platform |
| **Description** | Interactions with an end user &mdash; displaying messages and requesting input. |

| Action | Task Type | What it Does |
|--------|-----------|--------------|
| ShowError | `error-message` | Logs an error or warning message |
| RequestInput | `value-input` | Pauses execution and waits for user input |

### Meadow API

| | |
|---|---|
| **Tier** | Service |
| **Description** | CRUD operations against a Meadow ORM endpoint. The worker must be configured with the Meadow API base URL. |

| Action | Task Type | What it Does |
|--------|-----------|--------------|
| Read | `meadow-read` | Read a single record by ID |
| ReadMany | `meadow-reads` | Read multiple records with optional filter |
| Create | `meadow-create` | Create a new record |
| Update | `meadow-update` | Update an existing record |
| Delete | `meadow-delete` | Delete a record by ID |
| Count | `meadow-count` | Count records matching a filter |

## Task Type Definition Fields

Every task type definition includes these capability-related fields alongside
the existing `Category`:

```json
{
    "Hash": "read-file",
    "Name": "Read File",
    "Category": "file-io",
    "Capability": "File System",
    "Action": "Read",
    "Tier": "Platform"
}
```

| Field | Purpose |
|-------|---------|
| `Category` | Visual grouping and color-coding in the flow editor |
| `Capability` | Semantic grouping for worker dispatch |
| `Action` | Verb within the capability |
| `Tier` | Availability classification (Engine, Platform, Service, Extension) |

`Category` and `Capability` overlap but serve different purposes. For
example `template-string` has Category `core` (for UI grouping) but
Capability `Data Transform` (because it is a pure in-memory operation).

## Execution Manifests

When an operation executes, each task's manifest now includes `Capability`,
`Action`, and `Tier` alongside the existing `Category`. The timing summary
includes a `ByCapability` aggregate in addition to `ByCategory` and
`ByTaskType`.

## Future: Worker Capability Matching

The tier and capability system lays the groundwork for a distributed
execution model:

1. Workers connect to Ultravisor and advertise their capabilities.
2. When the engine needs to execute a task, it looks up the task's
   `Capability` and `Tier`.
3. **Engine** tier tasks always run locally &mdash; no worker required.
4. **Platform** and higher tasks are dispatched to a connected worker
   that advertises the matching capability.
5. If no capable worker is available the task enters a waiting state.

Extension-tier capabilities will be the primary mechanism for adding new
types of work &mdash; machine-learning inference, headless browser
automation, hardware control, media processing, and anything else that
requires a specialized runtime environment.
