# Follow-up: Phase emission for `/Beacon/Work/Dispatch` (sync path)

**Status:** deferred — the synchronous dispatch path bypasses the
scheduler and therefore never populates `Settings.QueueMetadata`.
Workers routed via `/Beacon/Work/Dispatch` still write their own
phases, but the hub-owned `queue_wait` / `worker_spinup` /
`asset_capture` records are skipped.

## Background

There are three dispatch paths in the hub today:

| Path | Route | Queue/metadata? | Phases? |
|---|---|---|---|
| Async queue | `POST /Beacon/Work/Enqueue` | Yes (via Scheduler) | Yes — beacon-side emits all three |
| Polling claim | `POST /Beacon/Work/Poll` | Yes (Coordinator stamps metadata in `_sanitizeWorkItemForBeacon`) | Yes — same |
| **Direct dispatch** | `POST /Beacon/Work/Dispatch` | **No** — calls `Coordinator.dispatchAndWait` which builds the work item inline and blocks the caller on the response | **No** — Settings.QueueMetadata is never set |

The direct-dispatch path is used for synchronous RPC-style calls
where the caller wants the result inline. It's rare but real — a
handful of retold-labs call sites and any external integration that
chose the sync contract for simplicity.

## Why this is separate from the main work

`dispatchAndWait` constructs the work item in a hot request handler
and resolves to the caller via `_DirectDispatchCallbacks`. It
intentionally skips the scheduler tick because the caller is
blocked waiting. Retrofitting it requires either:

1. Routing it through the same scheduler pass (adds latency — the
   whole point of direct dispatch is "don't queue"), or
2. Populating `QueueMetadata` inline in the Coordinator when building
   the work item and calling the beacon-side phase emit path directly.

Option 2 is correct. The queue wait for this path is near-zero by
definition, so the `queue_wait` record will almost always be `0ms`,
but the `worker_spinup` and `asset_capture` records still have
real durations worth capturing.

## Work to do

### 1. Populate `QueueMetadata` inline in `dispatchAndWait`

**File:** [`Ultravisor-Beacon-Coordinator.cjs`](../../source/services/Ultravisor-Beacon-Coordinator.cjs)

Find `dispatchAndWait` (search for the method definition). Where it
constructs the work item, set `Settings.QueueMetadata` the same way
`_sanitizeWorkItemForBeacon` does it now, but with the sync-path
timestamps:

```javascript
let tmpNowIso = new Date().toISOString();
tmpWorkItem.EnqueuedAt = tmpNowIso;
tmpWorkItem.DispatchedAt = tmpNowIso;
tmpWorkItem.QueueWaitMs = 0;
tmpWorkItem.AttemptNumber = 1;
tmpWorkItem.RunID = pWorkItemInfo.RunID || '';
tmpWorkItem.Settings = tmpWorkItem.Settings || {};
tmpWorkItem.Settings.QueueMetadata = {
  RunID: tmpWorkItem.RunID,
  WorkItemHash: tmpWorkItem.WorkItemHash,
  EnqueuedAt: tmpNowIso,
  DispatchedAt: tmpNowIso,
  QueueWaitMs: 0,
  AttemptNumber: 1,
  HubInstanceID: (this.fable.settings && this.fable.settings.UltravisorHubInstanceID) || '',
  DispatchPath: 'sync'
};
```

Note the extra `DispatchPath: 'sync'` marker — useful for analytics
that want to separate sync-call latency from async-queue latency.

### 2. Stream the same metadata through `DispatchStream`

**File:** [`Ultravisor-API-Server.cjs`](../../source/web_server/Ultravisor-API-Server.cjs)

`POST /Beacon/Work/DispatchStream` is the binary-framed variant. It
calls the coordinator's streaming-dispatch machinery, which also
builds a work item inline. Same fix pattern: set `QueueMetadata` on
the work item before the first beacon frame is sent. Look for the
method that parallels `dispatchAndWait` for streams (grep for
`_StreamDispatchHandlers`).

### 3. Add a `POST /Beacon/Work/Dispatch` body field for `RunID`

The sync path doesn't call `/Beacon/Run/Start` before dispatching —
it's a one-shot. Either:

- Accept an optional `RunID` in the request body; if absent, mint one
  on the fly via `RunManager.startRun({ SubmitterTag: 'sync' })` so
  the sync call still lands in `BeaconRun` for observability; **or**
- Skip run registration for sync calls entirely and emit phases with
  `RunID=""`.

The first option keeps the `/queue` UI's event stream complete. Lean
toward (a).

### 4. Accept that retold-labs capability handlers already DTRT

Once (1) lands, `Settings.QueueMetadata` is populated on every work
item regardless of dispatch path.
[`RetoldLabs-BeaconSetup.cjs`](../../../retold-labs/source/RetoldLabs-BeaconSetup.cjs)
already checks `pWorkItem.Settings.QueueMetadata` before emitting;
the sync path will automatically start producing phases with no
retold-labs changes needed.

## Verification

1. Issue `POST /Beacon/Work/Dispatch` with `{ Capability: "Shell",
   Action: "Execute", Settings: { Command: "sleep 1" } }`.
2. The response comes back synchronously (same as today).
3. In the beacon's staging dir, the resulting `phases.jsonl`
   contains `queue_wait` (duration ≤ 5ms), `worker_spinup`,
   worker-emitted `run_start` / `phase` / `run_end`, and
   `asset_capture`.
4. The `BeaconRun` table has a new row with `SubmitterTag='sync'`.
5. The `BeaconWorkItemEvent` table has the `dispatched` event
   with `Payload.Path='sync'` (add this marker in step 1 if you want
   to separate it from poll-path dispatches in analytics).

## Non-goals

- Retrofitting existing direct-dispatch callers to switch to async
  enqueue. Sync contracts exist for a reason — let callers choose.
- Differentiating `queue_wait` reason for sync vs. async in the UI.
  0ms queue waits tell the right story on their own.
