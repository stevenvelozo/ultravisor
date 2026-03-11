# Beacons

Beacons are remote worker nodes that connect to an Ultravisor server and
execute Extension-tier tasks. They allow you to distribute work across
multiple machines, offloading specialized or resource-intensive operations
to purpose-built workers while the orchestrator manages the overall
operation graph.

A Beacon might be a GPU server running inference, a build machine compiling
code, or a simple shell worker on a different host. The Beacon system is the
bridge between Ultravisor's operation engine and the outside world.

## Architecture

The Beacon system uses the same **WaitingForInput** pause/resume mechanism
that powers interactive tasks like `value-input`. When a `beacon-dispatch`
node executes, it does not block the engine — instead it enqueues a work
item and returns `WaitingForInput`. The operation pauses at that node until
a Beacon picks up the work, executes it remotely, and reports results.

The full cycle looks like this:

```
┌──────────────────┐           ┌──────────────────────┐          ┌──────────────┐
│  Operation Graph │           │  BeaconCoordinator   │          │    Beacon    │
│                  │           │  (server-side)       │          │   (remote)   │
│  beacon-dispatch │──enqueue──▶  Work Queue          │          │              │
│  returns         │           │                      │◀──poll───│  poll loop   │
│  WaitingForInput │           │  assign work item    │──work──▶ │  execute     │
│       ⋮          │           │                      │          │  locally     │
│  (paused)        │           │                      │◀─result──│  report back │
│       ⋮          │           │  resumeOperation()   │          │              │
│  graph continues │◀──resume──│                      │          │              │
└──────────────────┘           └──────────────────────┘          └──────────────┘
```

### Transport Agnostic

The BeaconCoordinator's internal API (`enqueueWorkItem`, `completeWorkItem`,
`failWorkItem`) is transport-agnostic. The built-in REST endpoints drive
those methods via HTTP polling, but the same coordinator can be fronted by
WebSocket push, MQTT messages, email/SMS webhooks, or any other signaling
channel without changing the core dispatch logic.

## Affinity System

Many real-world pipelines require that related tasks execute on the same
worker. For example, a video processing pipeline might split a file across
multiple encoding passes — each pass needs access to the same local copy of
the source footage.

The **AffinityKey** setting on `beacon-dispatch` nodes solves this.

### How It Works

1. The first `beacon-dispatch` task with a given AffinityKey is claimed by
   whichever Beacon picks it up. The coordinator records a binding:
   `AffinityKey → BeaconID`.
2. Subsequent tasks with the **same** AffinityKey are pre-assigned to that
   same Beacon. When the Beacon polls, it receives affinity-assigned items
   first.
3. Bindings expire after a configurable TTL (default: one hour). Once
   expired, a new Beacon may claim the key.

### Dynamic Keys with Templates

AffinityKey values support Pict template syntax, allowing them to resolve
dynamically from operation state at execution time:

```
{~D:Record.TaskOutput.splitter.CurrentToken~}
```

This is useful inside `split-execute` loops where each iteration should
pin to its own worker. The template resolves to a unique value per token,
creating one affinity binding per chunk.

### Manual Clearing

Affinity bindings can be cleared manually through the `GET /Beacon/Affinity`
endpoint (to list them) and will be automatically purged when their TTL
expires. The coordinator's timeout checker cleans up expired bindings every
10 seconds.

## Capabilities

Each Beacon advertises the set of **Capabilities** it supports when it
registers. Capabilities are the same taxonomy used by the task type system
(see [Capabilities and Actions](capabilities.md)).

When the coordinator receives a poll request, it matches the work item's
`Capability` field against the polling Beacon's advertised capabilities.
A Beacon only receives work items it is equipped to handle.

Common capability names:

| Capability | Typical Use |
|------------|-------------|
| `Shell` | Execute operating system commands |
| `FileSystem` | Read, write, copy, and list files |
| `HTTPClient` | Make outbound HTTP requests |
| `MLInference` | Run machine-learning model inference |
| `MediaProcessing` | Transcode video/audio, generate thumbnails |

You can define any capability string you like — the coordinator treats them
as opaque labels for matching purposes.

## API Reference

All Beacon endpoints are served under the `/Beacon` path prefix.

### POST /Beacon/Register

Register a new Beacon worker with the coordinator.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `Name` | string | yes | Human-readable name for the Beacon |
| `Capabilities` | array | yes | List of capability strings |
| `MaxConcurrent` | number | no | Maximum concurrent work items (default: 1) |
| `Tags` | object | no | Arbitrary key-value metadata |

**Response:** The created Beacon record including the assigned `BeaconID`.

---

### GET /Beacon

List all registered Beacons.

**Response:** Array of Beacon records.

---

### GET /Beacon/:BeaconID

Get a specific Beacon by ID.

**Response:** Beacon record, or 404 if not found.

---

### DELETE /Beacon/:BeaconID

Deregister a Beacon. Any work items currently assigned to it are released
back to Pending status so another Beacon can pick them up.

**Response:** `{ Status: "Deregistered", BeaconID: "..." }`

---

### POST /Beacon/:BeaconID/Heartbeat

Send a heartbeat to confirm the Beacon is still alive. The coordinator
marks Beacons as Offline if they miss heartbeats beyond the configured
timeout.

**Response:** Updated Beacon record.

---

### POST /Beacon/Work/Poll

Poll for available work matching the Beacon's capabilities. Also acts as
an implicit heartbeat.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `BeaconID` | string | yes | The polling Beacon's ID |

**Response:** `{ WorkItem: {...} }` with the assigned work item, or
`{ WorkItem: null }` if no work is available.

---

### POST /Beacon/Work/:WorkItemHash/Complete

Report successful completion of a work item. The coordinator calls
`resumeOperation()` to continue the paused graph.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `Outputs` | object | no | Key-value output data (e.g. `StdOut`, `ExitCode`) |
| `Log` | array | no | Array of log strings |

**Response:** `{ Status: "Completed", WorkItemHash: "..." }`

---

### POST /Beacon/Work/:WorkItemHash/Error

Report failure of a work item. The coordinator resumes the graph through
the Error event path.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ErrorMessage` | string | no | Description of the error |
| `Log` | array | no | Array of log strings |

**Response:** `{ Status: "Failed", WorkItemHash: "..." }`

---

### GET /Beacon/Work

List all work items currently in the queue (all statuses).

**Response:** Array of work item records.

---

### GET /Beacon/Affinity

List all active affinity bindings.

**Response:** Array of affinity binding records, each containing
`AffinityKey`, `BeaconID`, `CreatedAt`, and `ExpiresAt`.

## Running a Beacon

### CLI

Start a Beacon worker from the command line:

```bash
node source/beacon/Ultravisor-Beacon-CLI.cjs \
  --server http://orchestrator:54321 \
  --name "GPU-Worker-1" \
  --capabilities Shell,FileSystem
```

#### CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `--server URL` | `http://localhost:54321` | Ultravisor server URL |
| `--name NAME` | `beacon-worker` | Human-readable Beacon name |
| `--capabilities LIST` | `Shell` | Comma-separated capability list |
| `--max-concurrent N` | `1` | Maximum concurrent work items |
| `--poll-interval MS` | `5000` | Poll interval in milliseconds |
| `--staging-path PATH` | current directory | Local staging directory for file operations |

### Config File

Place a `.ultravisor-beacon.json` file in the working directory to set
defaults. CLI arguments override config file values.

```json
{
    "ServerURL": "http://orchestrator:54321",
    "Name": "GPU-Worker-1",
    "Capabilities": ["Shell", "FileSystem", "MLInference"],
    "MaxConcurrent": 4,
    "PollIntervalMs": 3000,
    "HeartbeatIntervalMs": 15000,
    "StagingPath": "/data/staging",
    "Tags": {
        "GPU": "A100",
        "Region": "us-west-2"
    }
}
```

## Configuration

Server-side configuration keys control Beacon timeouts and defaults. Set
these in your Ultravisor configuration file.

| Key | Default | Description |
|-----|---------|-------------|
| `UltravisorBeaconHeartbeatTimeoutMs` | `60000` | Time in ms before a Beacon with no heartbeat is marked Offline |
| `UltravisorBeaconWorkItemTimeoutMs` | `300000` | Time in ms before an in-progress work item is considered timed out |
| `UltravisorBeaconAffinityTTLMs` | `3600000` | Time in ms before an affinity binding expires |
| `UltravisorBeaconPollIntervalMs` | `5000` | Default poll interval for Beacon clients |

The coordinator runs a timeout checker every 10 seconds that:

1. Fails work items that have exceeded their timeout.
2. Marks Beacons as Offline if they have missed their heartbeat window.
3. Purges expired affinity bindings.

## Example: Video Processing Pipeline

Consider a pipeline that transcodes a batch of video files. The source
footage lives on a shared volume, but encoding is CPU/GPU-intensive and
should be distributed across a pool of media workers.

1. **Start** node kicks off the operation.
2. A `list-files` node scans the input directory for `.mp4` files.
3. A `split-execute` node iterates over the file list. For each file:
   - A `beacon-dispatch` node sends the transcode command to a remote
     Beacon with `MediaProcessing` capability. The AffinityKey is set to
     the filename so that if multiple passes are needed (e.g. two-pass
     encoding), both passes land on the same worker that already has the
     file cached locally.
   - The graph pauses at the dispatch node.
   - A Beacon picks up the work, runs `ffmpeg` locally, and reports
     completion.
   - The graph resumes with the output (new file path, duration, etc.).
4. A `template-string` node assembles a summary report.
5. **End** node completes the operation.

Because each iteration's AffinityKey resolves to a unique value
(`{~D:Record.TaskOutput.splitter.CurrentToken~}`), the coordinator
distributes files across available Beacons while keeping multi-pass work
pinned to the same machine.
