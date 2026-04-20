# Follow-up: Migrate per-action config into `BeaconActionDefault`

**Status:** deferred — table and service are live; rows need populating.

## Why this exists

Per-action defaults (timeout, retry policy, priority, expected-wait
baseline) live in scattered Fable settings today. The queueing work
introduced a durable `BeaconActionDefault` table and a resolver
([`Ultravisor-Beacon-ActionDefaults.cjs`](../../source/services/Ultravisor-Beacon-ActionDefaults.cjs))
that an operator can tune live, without a hub restart.

The resolver already falls back in this order:

1. Per-request `Settings` override (`maxRetries`, `timeoutMs`, etc.)
2. Per-action row (`Capability`, `Action`)
3. Per-capability wildcard row (`Capability`, `Action=""`)
4. Fable-setting compatibility shim
   (`UltravisorBeaconWorkItemTimeoutMs`,
   `UltravisorBeaconHeartbeatMs`)
5. Hard defaults in `HARD_DEFAULTS`

So today everything still works via step 4–5. This follow-up replaces
the shim with real rows and retires the Fable settings.

## What's in the table today

Schema at [`Ultravisor-BeaconQueue.json`](../../source/datamodel/Ultravisor-BeaconQueue.json)
(the `BeaconActionDefault` entry). Columns:

| Column | Notes |
|---|---|
| `Capability` | required |
| `Action` | `""` = wildcard for the capability |
| `TimeoutMs` | overrides `UltravisorBeaconWorkItemTimeoutMs` |
| `MaxAttempts` | 1 = no retry |
| `RetryBackoffMs` | multiplied by attempt number |
| `DefaultPriority` | scheduler sort key |
| `ExpectedWaitP95Ms` | powers the `queue_wait` dimension of the health score |
| `HeartbeatExpectedMs` | powers the `event_freshness` dimension |
| `MinSamplesForBaseline` | min samples before `ActionDefaults.recomputeWaitBaseline` commits a p95 |

## Work to do

### 1. Inventory today's scattered settings

Grep the ultravisor tree for the settings that currently drive
per-action behavior:

```sh
grep -rn 'UltravisorBeaconWorkItemTimeoutMs\|UltravisorBeaconHeartbeatMs\|UltravisorBeaconAffinityTTLMs' \
  /Users/steven/Code/retold/modules/apps/ultravisor/source
```

Also check the consumer code for per-action constants in task-type
definitions (`source/services/tasks/**`) and capability providers
(`source/beacon/providers/**`).

### 2. Seed the table at startup

Write `source/services/tasks/extension/Ultravisor-BeaconActionDefault-Seed.cjs`
(or similar) that runs once on hub boot and upserts a row per
(Capability, Action) pair the hub knows about. Source of truth is
the action catalog on the coordinator
([`Ultravisor-Beacon-Coordinator.cjs`](../../source/services/Ultravisor-Beacon-Coordinator.cjs)
`_ActionCatalog`) — iterate it and call
`store.upsertActionDefault({ Capability, Action, ...hard_defaults })`
only when no row exists. Use `getActionDefault` first so operator-set
rows aren't clobbered on every restart.

The seed should **not** overwrite existing rows — it's a bootstrap,
not a reset.

### 3. Admin endpoints (optional, small)

If the `/queue` UI wants live knobs, add:

- `GET /Beacon/ActionDefaults` → `store.listActionDefaults()`
- `PUT /Beacon/ActionDefaults/:Capability/:Action` → upsert
  (call `store.upsertActionDefault` + `defaults.invalidate()`)

Both gated by `_requireSession`.

### 4. Wire up the wait-baseline learner

`ActionDefaults.recomputeWaitBaseline(cap, action)` is implemented
but not called anywhere yet. Trigger it on a slow interval (every 5
minutes) from the scheduler, iterating capabilities that have seen
≥ `MinSamplesForBaseline` completions since last recompute. Add a
counter on the coordinator to track completions per capability so we
don't recompute on no new data.

Rough hook point: end of `UltravisorBeaconScheduler._summaryTick`, or
a dedicated slower interval.

### 5. Retire the Fable-setting shim

Once (2) has been in place for at least one production cycle, remove
the `_fableSettingFallback` in
[`Ultravisor-Beacon-ActionDefaults.cjs`](../../source/services/Ultravisor-Beacon-ActionDefaults.cjs).
Grep-clean the retired setting names from the codebase in the same PR
so nobody reintroduces them. This is the step that makes the
migration irreversible — don't do it in the same PR as the seeder.

## Verification

1. Wipe `~/.local/share/ultravisor/beacon/beacon-queue.sqlite` (or
   wherever the store's DB path resolves for the deployment).
2. Boot the hub. Confirm `BeaconActionDefault` has one row per known
   `Capability:Action` pair with the expected defaults.
3. `UPDATE BeaconActionDefault SET TimeoutMs = 1 WHERE Capability =
   'Shell'`. Enqueue a Shell work item. The next
   `BeaconActionDefaults._Cache` window (≤ 10s) flips it; next
   work item picks up `TimeoutMs=1` without a hub restart.
4. Run 30 Shell work items with genuinely varying queue waits; confirm
   `ExpectedWaitP95Ms` updates on its own after the baseline learner
   tick.

## Non-goals

- UI for editing action defaults (defer until the `/queue` view is
  shipped and operators are asking for it).
- Multi-tenant defaults (single-ultravisor-instance only).
