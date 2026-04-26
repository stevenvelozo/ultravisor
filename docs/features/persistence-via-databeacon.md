# Persistence via retold-databeacon

**Status: planned + foundations in progress.** This doc is the cross-session plan
for routing ultravisor's queue and manifest persistence through retold-databeacon
instead of the specialized `ultravisor-queue-beacon` and `ultravisor-manifest-beacon`
modules. It captures the architectural decision, the work breakdown, and the
hand-off state so a fresh context can resume from here.

If you are picking this up cold, read this doc top-to-bottom before touching
code — the decisions below are load-bearing and the cross-module dependencies
are not obvious from the source.

## What changed and why

Before this redesign:
- `ultravisor-queue-beacon` advertises capability `QueuePersistence` with
  `QP_*` actions. Ships a `QueuePersistenceProviderBase` and a default
  `MemoryQueuePersistenceProvider`.
- `ultravisor-manifest-beacon` advertises `ManifestStore` with `MS_*` actions.
  Ships a `ManifestStoreProviderBase` and `MemoryManifestStoreProvider`.
- `Ultravisor-QueuePersistenceBridge.cjs` and
  `Ultravisor-ManifestStoreBridge.cjs` dispatch into the corresponding
  capability when a beacon is connected, fall back to local storage otherwise.
- `bootstrap-flush` (already shipped) replays locally-buffered writes into a
  newly-connected beacon via per-beacon HWM tracking persisted to
  `<DataPath>/persistence-bridge-hwm.json`.

The redesign:

- **retold-databeacon already provides everything we need.** Its `MeadowProxy`
  capability proxies arbitrary HTTP requests to its connected meadow REST
  surface. Every meadow connector (mysql / mssql / postgres / sqlite /
  mongodb / dgraph / solr / rocksdb) becomes a viable persistence backend
  for free.
- **Ultravisor's bridges translate `QP_*` / `MS_*` semantics to MeadowProxy
  `Request` calls** (Method + Path + Body) instead of dispatching to a
  specialized capability. The schema (table names, column shapes) is owned
  by ultravisor; retold-databeacon is a generic gateway.
- **The two specialized beacon modules are not deleted.** They stay as the
  reference implementation of the Provider pattern, useful for embedded /
  niche deployments that don't want retold-databeacon's REST surface. They
  are no longer the lab's recommended path.
- **The lab's UV detail view gains a "persistence databeacon" picker.** The
  operator picks a running retold-databeacon (which itself has an
  engine+database picker via `lab-engine-database-picker`); ultravisor's
  bridges discover the assignment and route through it.

### Why not a new specialized beacon?

Considered and rejected. retold-databeacon already does generic meadow CRUD
through the mesh; building `ultravisor-persistence-beacon` would duplicate
- The meadow connection layer (already in retold-databeacon).
- The REST endpoint generation (`DataBeacon-DynamicEndpointManager`).
- The lab's engine+database picker integration.
- The Dockerfile / deployment story.

The right unit of work is "make ultravisor talk to retold-databeacon" rather
than "build a parallel persistence beacon."

### Why not collapse all the way — let ultravisor use meadow directly?

Considered and rejected. The bridge architecture exists so ultravisor stays
unopinionated about its persistence layer. Going direct couples ultravisor to
meadow, breaks the pluggable-provider story, and removes the cross-host
deployment option (where the persistence DB is on a different network and
the beacon is the gateway).

## Gaps in retold-databeacon's current surface

Three things needed to make this work — none of which retold-databeacon
provides today:

1. **DDL / schema management.** retold-databeacon's `DataBeaconManagement`
   capability has `Introspect`, `EnableEndpoint`, `DisableEndpoint` — all
   read-or-expose, no create. To bootstrap ultravisor's tables in a fresh
   database we need a new action.

2. **MeadowProxy path allowlist.** The default allowlist
   (`/^\/?1\.0\/[a-z0-9][a-z0-9-]{0,63}\//`) requires the first segment after
   `/1.0/` to be lowercase alphanumeric. This is intentional — it keeps mesh
   clients away from the databeacon's internal entities (`/1.0/User`,
   `/1.0/BeaconConnection`). PascalCase ultravisor tables like
   `BeaconWorkItem` are blocked. The fix is operator-configurable: when the
   lab assigns a databeacon for ultravisor persistence, push a config update
   that extends the allowlist.

3. **Schema migration.** Forward-only ADD COLUMN on existing tables, version
   tracking. Less urgent than (1) — ultravisor can ship without this on day
   one and add it when the schema first changes.

## The new wiring

```
  ┌─ ultravisor (host process) ──────────────────────────────────────┐
  │                                                                  │
  │   QueuePersistenceBridge ──┐                                     │
  │                            ├──► dispatch(MeadowProxy.Request,    │
  │   ManifestStoreBridge ─────┘     {Method, Path, Body})           │
  │                                                                  │
  │   ┌─ persistence-bridge-hwm.json ─┐                              │
  │   │ Queue:    {<beaconID>: HWM}   │  unchanged from              │
  │   │ Manifest: {<beaconID>: HWM}   │  bootstrap-flush             │
  │   └───────────────────────────────┘                              │
  │                                                                  │
  └──────┬───────────────────────────────────────────────────────────┘
         │ beacon protocol
         ▼
  ┌─ retold-databeacon (assigned for persistence) ───────────────────┐
  │                                                                  │
  │   MeadowProxy.Request ──► HTTP to /1.0/<UVTable>/...             │
  │   DataBeaconManagement.Introspect / EnableEndpoint               │
  │   DataBeaconSchema.EnsureSchema  ◄── NEW                         │
  │                                                                  │
  └──────┬───────────────────────────────────────────────────────────┘
         │ meadow connector (mysql/mssql/postgres/sqlite/...)
         ▼
       <user-chosen database>
```

### Bridge dispatch translation

For each existing bridge method, the equivalent MeadowProxy call:

| Bridge method | MeadowProxy.Request shape |
|---|---|
| `upsertWorkItem(item)` | `{Method:'PUT', Path:'/1.0/UVQueueWorkItem/' + item.WorkItemHash, Body: JSON(item)}` |
| `updateWorkItem(hash, patch)` | `{Method:'PATCH', Path:'/1.0/UVQueueWorkItem/' + hash, Body: JSON(patch)}` |
| `appendEvent(event)` | `{Method:'POST', Path:'/1.0/UVQueueWorkItemEvent', Body: JSON(event)}` |
| `insertAttempt(attempt)` | `{Method:'POST', Path:'/1.0/UVQueueWorkItemAttempt', Body: JSON(attempt)}` |
| `getWorkItemByHash(hash)` | `{Method:'GET', Path:'/1.0/UVQueueWorkItem/' + hash}` |
| `listWorkItems(filter)` | `{Method:'GET', Path:'/1.0/UVQueueWorkItems?...'}` (meadow's bulk-read) |
| `getEvents(hash, limit)` | `{Method:'GET', Path:'/1.0/UVQueueWorkItemEvents?WorkItemHash=' + hash + '&...' }` |
| `upsertManifest(manifest)` | `{Method:'PUT', Path:'/1.0/UVManifest/' + manifest.Hash, Body: JSON(manifest)}` |
| `getManifest(hash)` | `{Method:'GET', Path:'/1.0/UVManifest/' + hash}` |
| `listManifests(filter)` | `{Method:'GET', Path:'/1.0/UVManifests?...'}` |
| `removeManifest(hash)` | `{Method:'DELETE', Path:'/1.0/UVManifest/' + hash}` |

Notes:
- Table names use the `UV` prefix to avoid collision with retold-databeacon's
  internal `Beacon*` tables. Confirmed by reading `Retold-DataBeacon.js` —
  it has its own `BeaconConnection` etc.
- Body is JSON-stringified and the Outputs come back as `{Status, Body}`
  where Body is the raw response string the caller parses.
- Filter / limit / order encoding follows meadow REST conventions.
  See `meadow-endpoints` README for the canonical shape.

### Ultravisor persistence schema

Lives at `modules/apps/ultravisor/source/persistence/UltravisorPersistenceSchema.json`
(to be created). Meadow JSON schema format. Tables:

- **`UVQueueWorkItem`** — one row per work item.
  - `IDUVQueueWorkItem` — auto-increment PK
  - `WorkItemHash` — unique, indexed
  - `RunID`, `RunHash`, `NodeHash`, `OperationHash`
  - `Capability`, `Action`
  - `Settings` — JSON column
  - `AffinityKey`, `AssignedBeaconID`
  - `Status`, `Priority`, `EnqueuedAt`, `DispatchedAt`, `CompletedAt`,
    `CanceledAt`, `LastEventAt`
  - `QueueWaitMs`, `Health`, `HealthLabel`, `HealthReason`,
    `HealthComputedAt`
  - `AttemptNumber`, `MaxAttempts`, `RetryBackoffMs`, `RetryAfter`,
    `LastError`, `Result`
  - `CancelRequested`, `CancelReason`
  - Indexes: `(Status, Priority, EnqueuedAt)`, `(AssignedBeaconID, Status)`,
    `RunID`, `WorkItemHash`

- **`UVQueueWorkItemEvent`** — append-only event log per work item.
  - `IDUVQueueWorkItemEvent` — auto-increment PK
  - `EventGUID` — UUID v4, **unique** (idempotency on re-flush)
  - `WorkItemHash` — indexed
  - `EventType`, `Payload` (JSON), `EmittedAt`
  - `Seq` — per-process monotonic ordering hint (NOT identity)
  - Indexes: `WorkItemHash`, `EventGUID` (unique)

- **`UVQueueWorkItemAttempt`** — one row per dispatch attempt.
  - `IDUVQueueWorkItemAttempt` — PK
  - `WorkItemHash`, `AttemptNumber`
  - `BeaconID`, `StartedAt`, `EndedAt`, `Outcome`, `Error`
  - Indexes: `(WorkItemHash, AttemptNumber)` unique

- **`UVManifest`** — one row per execution run.
  - `IDUVManifest` — PK
  - `Hash` — RunHash, **unique**
  - `OperationHash`, `OperationName`, `Status`, `RunMode`
  - `StartTime`, `StopTime`, `ElapsedMs`
  - `ManifestJSON` — full manifest blob (stripped via `_cleanManifestForWire`
    before write)
  - Indexes: `Hash` unique, `(Status, StopTime)`, `OperationHash`

This schema is the **source of truth**. Updates here propagate via the new
`EnsureSchema` action's idempotent ADD COLUMN logic.

### Schema bootstrap flow

When ultravisor first detects a databeacon assigned for persistence:

1. Read the persistence schema descriptor from
   `source/persistence/UltravisorPersistenceSchema.json`.
2. Dispatch `DataBeaconSchema.EnsureSchema` with the descriptor + a
   `SchemaName: 'ultravisor'` discriminator.
3. retold-databeacon hands the descriptor to meadow's per-engine schema
   layer (`meadow-connection-<engine>/source/Meadow-Schema-<engine>.js`),
   which translates it into engine-specific DDL and runs it.
4. Once tables exist, dispatch `DataBeaconManagement.EnableEndpoint` for
   each table so MeadowProxy's REST surface is wired up.
5. Push a `PathAllowlist` config update to the databeacon (or include it in
   the EnsureSchema settings) so MeadowProxy accepts the `/1.0/UV*/` routes.
6. Mark the bridge as "ready for MeadowProxy mode" — subsequent calls go via
   the new path. Bootstrap-flush replays accumulated local writes into the
   freshly-prepared tables.

Failure handling: any step failing leaves the bridge in local-fallback mode.
Retry on next `onBeaconConnected` notification (which fires on every
re-register).

### Lab UI changes

- New `IDPersistenceBeacon` field on the `UltravisorInstance` row.
- Lab API:
  - `GET /api/lab/ultravisors/:id` includes `IDPersistenceBeacon` and the
    inflated beacon record.
  - `POST /api/lab/ultravisors/:id/persistence-beacon` body
    `{IDBeacon: <ref> | null}` to assign / clear.
- UV detail view (`PictView-Lab-Ultravisor.js`):
  - One picker: "Persistence databeacon: [running databeacons w/ engine ▾]".
  - One pill: `Persistence: bootstrapped | bootstrapping | error | none`.
  - On change, calls the assignment endpoint and the lab pushes a config
    update to the chosen databeacon (PathAllowlist, etc.).

The two `addAuthBeacon` / `bootstrapAdmin` shortcuts already on the UV card
stay unchanged. The persistence picker is a sibling row, not a replacement.

### What about beacon-ID HWM tracking?

The bootstrap-flush HWM file already keys by `beaconID`. With this redesign,
the same HWM tracking just happens to point at the assigned databeacon's
beaconID. No code change needed in the HWM logic itself — only in the
*detection* (`getBeaconID()` should return the assigned databeacon's ID
when one is configured, falling back to the legacy QueuePersistence /
ManifestStore lookup otherwise).

## Cross-session work plan

### Session 1 (complete) — foundation

Shipped:

- [x] Architectural decision committed (use retold-databeacon's MeadowProxy +
  add a new `DataBeaconSchema` capability; do NOT build a specialized
  `ultravisor-persistence-beacon`).
- [x] Rolled back the `addQueueBeacon`/`addManifestBeacon` lab shortcuts
  from earlier in the same session (they targeted the wrong abstraction).
  Lab bundle rebuilds clean; zero leftover references.
- [x] This document written and listed in `docs/_sidebar.md` under Features.
- [x] `UltravisorPersistenceSchema.json` written at
  `modules/apps/ultravisor/source/persistence/UltravisorPersistenceSchema.json`.
  Four tables (`UVQueueWorkItem`, `UVQueueWorkItemEvent`,
  `UVQueueWorkItemAttempt`, `UVManifest`) with 11 indexes total. Meadow-style
  type names. Source-of-truth for everything downstream.
- [x] `DataBeaconSchemaManager` shipped at
  `modules/apps/retold-databeacon/source/services/DataBeacon-SchemaManager.js`.
  Public methods `ensureSchema(pSettings, fCallback)` and
  `introspectSchema(pSettings, fCallback)`. The `registerSchemaCapability`
  helper exposes both as a `DataBeaconSchema` beacon capability with
  actions `EnsureSchema` and `IntrospectSchema`.
- [x] Capability registered in
  `modules/apps/retold-databeacon/source/services/DataBeacon-BeaconProvider.js`
  alongside the existing `DataBeaconAccess` / `DataBeaconManagement` /
  `MeadowProxy` capabilities. Same lifecycle.
- [x] Smoke-tested directly against an in-memory SQLite database
  (the smoke runner is gone; all 6 cases passed):
  1. Fresh `ensureSchema` creates all 4 tables + 11 indexes.
  2. Re-running `ensureSchema` is a no-op.
  3. `introspectSchema` reports all tables present after ensure.
  4. Adding a new column to the descriptor and re-running triggers
     forward-only ADD COLUMN.
  5. `introspectSchema` against an empty DB reports all 4 tables missing.
  6. All four error paths surface readable errors (missing
     `IDBeaconConnection`, missing `SchemaJSON`, disconnected connection,
     non-SQLite engine).

What's intentionally narrow today:

- **SQLite-only.** `_columnSqlSqlite`, `_ensureSchemaSqlite`,
  `_introspectSchemaSqlite` emit DDL directly. MySQL / MSSQL / Postgres
  return a clear "not yet supported" error. Session 2 generalizes by
  delegating to each connector's `Meadow-Schema-<engine>.js` service
  (which already exists — see e.g.
  `modules/meadow/meadow-connection-sqlite/source/Meadow-Schema-SQLite.js`,
  methods `createTables` / `createTable` / `createAllIndices` /
  `getIndexDefinitionsFromSchema`).
- **Direct `.exec()` on the SQLite handle.** The smoke test depends on
  `pConn.instance.connection` being a `better-sqlite3` Database. Confirmed
  shape from `DataBeacon-ConnectionBridge.js:100-114`. The Session 2
  refactor to per-engine delegation removes this assumption.
- **Bridges still dispatch to legacy `QP_*` / `MS_*` actions.** Nothing
  in ultravisor uses `DataBeaconSchema` yet — that's Session 2's job.
  Existing bootstrap-flush + resync paths unchanged.
- **No PathAllowlist update yet.** When Session 2 wires up MeadowProxy
  routing for the bridges, the `/1.0/UV*/` paths will be blocked by
  retold-databeacon's default allowlist. Either Session 2 adds a runtime
  config-update mechanism, or it ships an option on the beacon's
  registration config that the lab populates. See "Open question 1" below.

### Session 2 (complete) — bridge dispatch + bootstrap

Shipped:

- [x] `DataBeacon-SchemaManager.js` generalized past SQLite. The
  `_ensureSchemaSqlite` / `_introspectSchemaSqlite` methods are gone;
  in their place is a thin orchestration that resolves the connector's
  `schemaProvider` (every meadow connector exposes one — confirmed for
  sqlite / mysql / mssql / postgresql by inspection), translates our
  descriptor (`Scope/Schema/Indexes` + high-level `Type` values like
  `AutoIdentity`, `Integer`, `Float`, `Deleted`, `CreateDate`) into the
  meadow shape (`TableName/Columns/Indices` + lower-level
  `DataType`), then delegates `createTables` + `createAllIndices` to
  the engine service. Forward-only ADD COLUMN remains SQLite-only —
  Session 4 generalizes that path. Introspect uses the engine-agnostic
  `listTables` + `introspectTableColumns` for all four engines.
- [x] `DataBeaconManagement.UpdateProxyConfig` action added in
  `DataBeacon-BeaconProvider.js`. `DataBeacon-MeadowProxyProvider.js`
  now exposes `extendPathAllowlist`, `setPathAllowlist`,
  `setAllowWrites`, `getActiveConfig` helpers that mutate a closure-
  scoped runtime config the Request handler consults on every call —
  no re-registration needed.
- [x] `EnableEndpoint` / `DisableEndpoint` action handlers in
  `DataBeacon-BeaconProvider.js` now wrap their callbacks in the
  standard `{Outputs, Log}` envelope (they were dropping the result
  before; nothing else read it back, so the bug was latent until the
  bridge bootstrap relied on `EndpointBase`).
- [x] `_dispatchViaMeadowProxy(pAction, pSettings)` shipped on both
  `Ultravisor-QueuePersistenceBridge.cjs` and
  `Ultravisor-ManifestStoreBridge.cjs`. Translation table lives in
  each bridge's source comment and matches the table above with two
  Session-3-deferred items: `QP_UpdateWorkItem` /
  `QP_UpdateAttemptOutcome` / `MS_RemoveManifest` need a
  hash→IDRecord lookup helper that lands with the lab assignment
  endpoint. For Session 2 those branches return null and fall through
  to the legacy bridge's no-op result.
- [x] Detection: bridges scan registered beacons for one that
  advertises `MeadowProxy` AND carries `Tags.PersistenceConnectionID`
  pointing at the IDBeaconConnection inside the assigned databeacon.
  Tag presence (not capability presence alone) is what flips the
  bridge into MeadowProxy mode. `isMeadowProxyMode()` further requires
  `_BootstrappedBeacons.has(beaconID)` so calls don't dispatch before
  EnsureSchema / EnableEndpoint complete.
- [x] Schema bootstrap state machine wired into the existing
  `onBeaconConnected` hook. The bridge loads the descriptor once at
  construction, then on every relevant connect runs
  `EnsureSchema → Introspect → UpdateProxyConfig → EnableEndpoint(per-table)`.
  Per-beacon `_BootstrappedBeacons` set guards against re-running the
  flow on reconnect; `_BootstrapInFlight` guards against concurrent
  notifications. Each step is idempotent on the databeacon side.
  `_EndpointBaseByBeacon[beaconID][tableName]` caches the
  `/1.0/<routeHash>/<TableName>` returned by EnableEndpoint so
  dispatch doesn't have to rediscover the route hash on each call.
- [x] `_isMetaCapability` extended on the coordinator to skip
  persistence-recording for `MeadowProxy`, `DataBeaconSchema`,
  `DataBeaconManagement` work items in addition to the original
  `QueuePersistence` / `ManifestStore`. Without this, every
  MeadowProxy.Request dispatched by the bridge would itself be
  persisted via the bridge → MeadowProxy.Request → ... loop.
- [x] End-to-end smoke test at
  `modules/apps/retold-databeacon/test/Persistence_Bridge_Smoke_tests.js`
  (opt-in — not part of the default mocha spec). Boots a real
  retold-databeacon (with its own internal SQLite + Orator REST surface
  on port 28389), an external SQLite file the UV tables land in, and
  an in-process ultravisor coordinator + bridges. A synchronous push
  handler stitches the two fables: `_WorkItemPushHandler` hands work
  items to the databeacon's `_CapabilityManager` action handlers and
  feeds completions back into `coordinator.completeWorkItem`. Five
  cases pass:
  1. All four databeacon capabilities are registered (the new
     `BeaconProvider.registerCapabilitiesOn` lets tests share the same
     registration path that `connectBeacon` uses, without dialing a
     coordinator).
  2. Bootstrap creates the four UV* tables + 11 indices in the
     external SQLite file (verified via direct better-sqlite3 reads).
  3. `bridge.upsertWorkItem(item)` lands a row in `UVQueueWorkItem`
     via MeadowProxy → loopback HTTP → meadow REST → SQL INSERT.
  4. `bridge.appendEvent(event)` lands a row in
     `UVQueueWorkItemEvent`.
  5. `manifestBridge.upsertManifest(manifest)` lands a row in
     `UVManifest` (with the wire-safe blob in `ManifestJSON`).

Notes / sharp edges encountered:

- `dispatchAndWait` registers its direct-dispatch callback AFTER
  `enqueueWorkItem` returns — the same call that fires the push
  handler. A synchronous push handler that completes the work item
  before `dispatchAndWait` returns will race the registration and
  leave the awaiter hanging forever. The smoke test wraps each
  handler invocation in `setImmediate`. Real WebSocket transports
  don't hit this because they're inherently async, but anything that
  bridges in-process (e.g. a future single-process suite-harness)
  needs the same defer.
- `EnableEndpoint` uses `meadow-connection-manager.sanitizeConnectionName`
  to derive a route hash from the connection's friendly name and
  prefixes routes with `/1.0/<routeHash>/<TableName>`. The bridge's
  default allowlist patch (`UV_PROXY_PATH_PATTERNS`) accommodates
  this with a non-greedy middle segment (`/1.0/[^/]+/UV[A-Za-z0-9]*`).
- `_isMetaCapability` had to be extended on the coordinator (see
  above) — easy to miss when adding new dispatch backends through
  the bridge.

What's still narrow today:

- **Update / remove paths return null.** `QP_UpdateWorkItem`,
  `QP_UpdateAttemptOutcome`, `MS_RemoveManifest` need a hash→IDRecord
  lookup before they can PUT/DELETE. Lands with the lab UI work
  (Session 3), where the assignment endpoint will give us a natural
  spot to wire a small `_lookupIDByHash(beaconID, table, hash)` helper.
- **Detection still capability+tag, no UV row yet.** The `IDPersistenceBeacon`
  field on `UltravisorInstance` and the assignment endpoint are
  Session 3. Today the bridge picks the first registered MeadowProxy
  beacon with the persistence tag — fine for single-UV mode (which
  is all we support per "Open question 2" anyway) but the lab will
  promote this to an explicit per-UV assignment.
- **Forward-only ADD COLUMN is SQLite-only.** MySQL / MSSQL / Postgres
  fresh-bootstrap works (createTables + createAllIndices generalize
  cleanly via the per-engine schema services), but a *changed*
  descriptor against an existing non-SQLite database surfaces a Note
  in the EnsureSchema result and skips the migration. Session 4.

### Session 3 (complete) — lab assignment + UI + remaining bridge surface

Shipped:

- [x] **Bridge API.** `setPersistenceAssignment(BeaconID, IDBeaconConnection)` /
  `clearPersistenceAssignment()` / `getPersistenceStatus()` on both
  `Ultravisor-QueuePersistenceBridge.cjs` and
  `Ultravisor-ManifestStoreBridge.cjs`. Status object shape:
  `{State, AssignedBeaconID, IDBeaconConnection, LastError, BootstrappedAt, AssignedAt}`.
  State machine `unassigned → waiting-for-beacon → bootstrapping → bootstrapped`
  (or `error`) derives from `_PersistenceAssignment` plus the existing
  `_BootstrappedBeacons` / `_BootstrapInFlight` sets and a new
  `_LastBootstrapError` / `_BootstrappedAt` pair. Reassignment to a
  different beacon drops the old beacon's bootstrap state cache and
  re-runs `_handleMeadowProxyBootstrap` if the new beacon is already Online.
- [x] **Assignment file at `<DataPath>/persistence-assignment.json`.**
  Both bridges share one file (`{Queue: {...}|null, Manifest: {...}|null}`),
  loaded once in the constructor and re-written on every
  `setPersistenceAssignment` / `clearPersistenceAssignment`. UV restarts
  resume routing without lab involvement; the lab's UV row remains the
  canonical source.
- [x] **`getPersistenceBeacon` consults explicit assignment first.**
  Tag-scan stays as the CLI-only fallback (sidecar-databeacon
  deployments where an env-var registers the tag). When an assignment is
  set, online-state filtering moves to the bootstrap state machine —
  `getPersistenceBeacon` returns the assignment regardless of the
  beacon's status, but `isMeadowProxyMode()` still gates dispatch on
  `_BootstrappedBeacons`.
- [x] **Deferred translations filled.** `QP_UpdateWorkItem` and
  `QP_UpdateAttemptOutcome` now route through new
  `_dispatchUpdateByHash` / `_dispatchUpdateByTwoColumns` helpers;
  `MS_RemoveManifest` routes through `_dispatchDeleteByHash` (meadow
  auto-soft-deletes when the schema declares a `Deleted` column).
  Lookup helpers `_lookupIDByHash` / `_lookupIDByTwoColumns` issue a
  filtered `GET <base>s/FilteredTo/FBV~<col>~EQ~<val>` (and stack
  `~FBV~` for two-column AND filters), then PUT-by-id (`PUT <base>` —
  meadow's update endpoint takes the PK in the body, NOT the URL).
- [x] **UV runtime endpoints.** `POST /Ultravisor/Persistence/Assign`
  (body `{BeaconID, IDBeaconConnection}`) calls `setPersistenceAssignment`
  / `clearPersistenceAssignment` on both bridges and returns the merged
  `{Success, Queue, Manifest}` status. `GET /Ultravisor/Persistence/Status`
  returns `{Queue, Manifest}`. Both gated by `_requireSession` so they
  refuse anonymous access in Secure mode.
- [x] **Lab data model.** Two new columns on `UltravisorInstance`:
  `IDPersistenceBeacon INTEGER DEFAULT 0` and
  `IDPersistenceConnection INTEGER DEFAULT 0`. Forward-only ADD COLUMN
  via `Service-StateStore._applyColumnMigrations` (mirrors the existing
  pattern for `IDAuthBeacon` / `BootstrapAuthSecret`).
- [x] **Lab service methods.** `Service-UltravisorManager` gained
  `setInstancePersistence(pID, pIDBeacon, pIDBeaconConnection, fCb)`
  (updates the row, looks up the beacon's `Name` as the mesh BeaconID,
  POSTs the Assign payload to the running UV, returns the now-current
  `Persistence` object), `getInstancePersistence(pID, fCb)` (reads the
  row, GETs `/Ultravisor/Persistence/Status` from the running UV with a
  2s timeout, inflates `BeaconRecord` from the lab's Beacon table,
  returns `{IDPersistenceBeacon, IDPersistenceConnection, BeaconRecord,
  ConnectionRecord, Queue, Manifest, State, LastError, BootstrappedAt}`),
  and `listBeaconConnections(pBeaconID, fCb)` (proxies
  `GET /beacon/connections` to a running databeacon).
- [x] **Lab API.** `GET /api/lab/ultravisor-instances/:id` now inflates
  the `Persistence` object inline (with the 2s timeout fallback so a
  stuck UV doesn't hang the response). `POST /api/lab/ultravisor-instances/:id/persistence-beacon`
  (body `{IDBeacon: <ref>|null, IDBeaconConnection}`) wraps
  `setInstancePersistence`; returns 404 on missing UV, 409 on not-running,
  502 on UV unreachable. Sibling `GET /api/lab/ultravisor-instances/:id/persistence-status`
  for fast-poll (decoupled from the heavier list-GET path).
  `GET /api/lab/beacons/:id/connections` proxies to the chosen
  databeacon's `/beacon/connections`. **Note:** route name uses the
  existing `/api/lab/ultravisor-instances/...` convention, not the
  earlier doc's shorter `/api/lab/ultravisors/...`.
- [x] **Lab UI.** `PictView-Lab-Ultravisor.js` gains a `_persistenceRowHTML`
  helper that renders a status pill (`unassigned` / `waiting-for-beacon` /
  `bootstrapping` / `bootstrapped` / `error`, color-coded) plus a
  `Persistence: <pill> ... [Assign|Change persistence]` button.
  `PictRouter-Lab-Configuration.json` gets the new
  `/ultravisor/:id/set-persistence-beacon` route.
  `Lab-Browser-Application.js` ships `setPersistenceBeacon(pID)` —
  modal-driven flow with two dropdowns (databeacon → connection); the
  connection list fetches lazily via `listBeaconConnections` after the
  beacon is picked. Modal carries `Cancel` / `Clear assignment` (when
  one is set) / `Save` buttons. Fast-poll: `_pumpPersistencePollers` /
  `_startPersistencePoller` / `_stopPersistencePoller` keep a per-UV
  2s `setInterval` running while the pill is in a transient state, then
  drop themselves once steady. The global 10s `refreshAll` arms /
  disarms the fast pollers based on the latest row state.
- [x] **RemoteUser pass-through.** Both bridges' `_resolveRemoteUser()`
  returns the literal `'ultravisor-system'` for now and is threaded
  through `_buildMeadowProxyRequest` / `_lookupIDByHash` /
  `_dispatchUpdateByHash` / `_putByID` / `_dispatchDeleteByHash` so
  every dispatched `MeadowProxy.Request` carries it in the audit trail.
  Future work to source the real session user is documented under Open
  question 6 below.
- [x] **Smoke tests.** The Session 2 bridge smoke at
  `modules/apps/retold-databeacon/test/Persistence_Bridge_Smoke_tests.js`
  picked up three new cases (one each for
  `bridge.updateWorkItem`, `bridge.updateAttemptOutcome`,
  `manifestBridge.removeManifest`) plus two assignment-state cases —
  51 passing total. A new lab-side smoke at
  `modules/apps/ultravisor-lab/test/Persistence_Lab_Smoke_tests.js`
  covers `setInstancePersistence` / `getInstancePersistence` /
  `listBeaconConnections` against in-process stub HTTP servers (UV +
  databeacon). 7 passing.

Notes / sharp edges encountered:

- **Meadow's `PUT` endpoint.** Update lives at `PUT <base>` (PK in the body),
  NOT `PUT <base>/<id>`. We discovered this when an early Step-2 attempt
  hit `405 Method Not Allowed` on the per-id path; meadow-endpoints'
  route table only registers `''` and `'s'` for `putWithBodyParser`.
- **Meadow's `Deleted` column type triggers automatic soft-delete on
  `DELETE <base>/:IDRecord`.** Originally we PUT'd with `{Deleted: 1}`
  but meadow returned 500; switching to DELETE made the soft-delete
  work via meadow's standard semantics.
- **`addAndInstantiateServiceType(typeName, classRef)` ignores any
  third argument.** To pass options (e.g. `{DataDir: TEST_DIR}`) you
  must use `addServiceType` + `instantiateServiceProvider(type, opts, hash)`.
  Caught while writing the Session 3 lab smoke when test rows ended up
  in the production `data/lab.db`. The test's StateStore now uses the
  correct two-call pattern.
- **The `addAuthBeacon` lab path uses the lab beacon row's `Name` as
  the mesh BeaconID implicitly** (the spawned ultravisor-beacon
  registers itself under that name). Session 3 reuses the same
  convention for persistence assignment — the lab passes `BeaconRow.Name`
  as `BeaconID` to the UV's `/Ultravisor/Persistence/Assign`. Documented
  inline in `Service-UltravisorManager.setInstancePersistence`.

Deferred to Session 4:

- **Full Docker-driven lab smoke.** The Session 3 lab smoke uses
  in-process stub HTTP servers (UV + databeacon) for fast feedback on
  the lab plumbing. A Docker-driven end-to-end test (spawn real UV +
  retold-databeacon, drive an operation, verify rows in the external
  SQLite via direct query) is more valuable but takes substantial setup
  the bridge-level smoke already covers. Lands with the engine-coverage
  + polish work in Session 4.
- **Real session user threading.** `_resolveRemoteUser()` returns
  `'ultravisor-system'`; passing the originating session user end-to-end
  is Open question 6 territory and not yet wired through the
  `/Ultravisor/Persistence/Assign` path.

#### Goal

Operator opens the UV detail view in the lab, picks a running databeacon
plus an engine/database within it, hits "Save", and watches a status
pill flip `unassigned → waiting-for-beacon → bootstrapping → bootstrapped`.
Subsequent operations on that UV land queue + manifest rows in the
chosen database; operator can SQL into it directly.

#### Architectural decision: explicit assignment, tag-scan as fallback

Session 2's bridges discover persistence beacons by scanning for
`MeadowProxy` capability + `Tags.PersistenceConnectionID`. That
mechanism stays as a CLI-only fallback (bare `ultravisor start` with a
sidecar databeacon configured via env vars), but the lab path uses
**explicit assignment** — the lab pushes `{BeaconID, IDBeaconConnection}`
to the bridge directly. Tag discovery doesn't have a clean cross-process
mutation API today; explicit assignment sidesteps it. The bridge's
`getPersistenceBeacon()` consults the explicit assignment first and
falls through to the tag scan if none is set.

#### Data model — UltravisorInstance row gains two columns

The lab's `UltravisorInstance` table grows:
- `IDPersistenceBeacon` (Number, default 0) — references the lab's
  beacon record (the same `IDBeacon` keyspace `addAuthBeacon` /
  `bootstrapAdmin` already use). 0 = unassigned.
- `IDPersistenceConnection` (Number, default 0) — the
  `IDBeaconConnection` inside that databeacon's internal SQLite. The
  existing `lab-engine-database-picker` writes this.

Forward-only ADD COLUMN; existing rows default to 0/unassigned.

#### Lab API surface

```
GET /api/lab/ultravisor-instances/:id
  Response includes a new `Persistence` object:
    {
      IDPersistenceBeacon, IDPersistenceConnection,
      BeaconRecord:     { Name, Status, ... } | null,
      ConnectionRecord: { Name, Type, ... }   | null,
      Queue:           <bridge status from UV>,
      Manifest:        <bridge status from UV>,
      State:           'unassigned' | 'waiting-for-beacon'
                     | 'bootstrapping' | 'bootstrapped' | 'error',
      LastError:       '<reason>' | null,
      BootstrappedAt:  '<ISO>' | null
    }

POST /api/lab/ultravisor-instances/:id/persistence-beacon
  Body: { IDBeacon: <ref> | null, IDBeaconConnection: <num> | null }
  Effect:
    1. Updates the UltravisorInstance row.
    2. POSTs the assignment to the running UV's runtime endpoint
       (see below).
    3. Returns the new Persistence object.

GET /api/lab/ultravisor-instances/:id/persistence-status
  Fast-poll surface for the lab's status pill while in transient
  states. Returns just the Persistence object (no other UV row data),
  so the pill can refresh every ~2s without dragging the heavier
  list path along.

GET /api/lab/beacons/:id/connections
  Proxies GET /beacon/connections on the chosen retold-databeacon.
  Used by the persistence-beacon picker's connection dropdown.
```

#### UV runtime endpoints

Two new routes on the ultravisor server, sibling to the existing
`/Beacon/*` surface:

```
POST /Ultravisor/Persistence/Assign
  Body: { BeaconID: '<mesh BeaconID>' | null, IDBeaconConnection: <num> | 0 }
  Effect:
    1. QueuePersistenceBridge.setPersistenceAssignment(BeaconID, IDBeaconConnection)
    2. ManifestStoreBridge.setPersistenceAssignment(BeaconID, IDBeaconConnection)
    3. If BeaconID is registered + Online, fire _handleMeadowProxyBootstrap
       on both bridges immediately. Otherwise wait for the next
       onBeaconConnected notification.
    4. Persist the assignment to <DataPath>/persistence-assignment.json.
  Response: { Success, State }

GET  /Ultravisor/Persistence/Status
  Response: same Persistence object the lab API forwards.
```

The lab API is the public surface; the UV runtime endpoint is internal
plumbing the lab pushes to.

#### Bridge API additions

```
QueuePersistenceBridge / ManifestStoreBridge:

  setPersistenceAssignment(pBeaconID, pIDBeaconConnection)
    - Stores assignment as instance state.
    - If pBeaconID is currently registered + Online, runs
      _handleMeadowProxyBootstrap(pBeaconID).
    - Persists to <DataPath>/persistence-assignment.json.
    - On change, drops _BootstrappedBeacons / _EndpointBaseByBeacon
      entries for the old beacon.

  clearPersistenceAssignment()
    - Drops assignment + bootstrap state.
    - Bridge falls back to legacy / local on next dispatch.

  getPersistenceStatus()
    - Returns { State, AssignedBeaconID, IDBeaconConnection,
                LastError, BootstrappedAt }.

  _lookupIDByHash(beaconID, table, hashColumn, hashValue, fCallback)
    - Issues GET /1.0/<routeHash>/UV<Table>s/FilteredTo/FBV~<col>~EQ~<val>
      via MeadowProxy. Plucks row[`IDUV<Table>`].
    - Used by the update / remove translations below.
```

`getPersistenceBeacon()` refactors to consult the explicit assignment
first; the tag scan stays as a backstop.

#### Filling in the deferred translation entries

Session 2 left three actions unmapped because meadow's PUT/DELETE
addresses rows by primary key, not by our natural keys. With
`_lookupIDByHash`:

| Bridge action | Path |
|---|---|
| `QP_UpdateWorkItem(hash, patch)` | `lookup(WorkItemHash) → PUT /1.0/<rh>/UVQueueWorkItem` (body includes `IDUVQueueWorkItem` + patch) |
| `QP_UpdateAttemptOutcome(hash, n, patch)` | `lookup` via two-column filter `(WorkItemHash, AttemptNumber)` → `PUT /1.0/<rh>/UVQueueWorkItemAttempt` |
| `MS_RemoveManifest(runHash)` | `lookup(Hash) → PUT` with `Deleted=1` (soft-delete) |

Each costs two MeadowProxy round-trips. Acceptable for queue / manifest
write rates. Future optimization: if the descriptor declares an
alternate-key constraint matching the natural-key column, meadow's
`PUT .../Upsert` collapses lookup+write into one call. Defer until
we've verified meadow's alternate-key handling against the unique
indexes the schema descriptor already declares.

#### Status pill state machine

| State | Condition |
|---|---|
| `unassigned` | No `IDPersistenceBeacon` set on the UV row. Bridge in legacy/local mode. |
| `waiting-for-beacon` | Assignment set, but `coord.getBeacon(BeaconID)` is null or `Status !== 'Online'`. |
| `bootstrapping` | `_BootstrapInFlight.has(BeaconID)`. |
| `bootstrapped` | `_BootstrappedBeacons.has(BeaconID)`. MeadowProxy mode active. |
| `error` | `_LastBootstrapError` is set. UI shows the reason; re-saving the assignment retries. |

UI re-fetches `/Ultravisor/Persistence/Status` every ~5s while in
transient states (`waiting-for-beacon`, `bootstrapping`), backs off
once steady.

#### UV detail view UI

`PictView-Lab-Ultravisor.js` gains a Persistence row sibling to the
existing `addAuthBeacon` / `bootstrapAdmin` shortcuts:

- **Picker step 1**: dropdown of beacons whose plugin type is
  `retold-databeacon` and `Status === 'Online'`.
- **Picker step 2** (appears once a beacon is picked): the existing
  `lab-engine-database-picker` widget, scoped to the chosen beacon's
  `/beacon/connections` surface.
- **Save / Clear** buttons (explicit commit; no auto-apply on dropdown
  change — too easy to misclick).
- **Status pill** beside the row, color-coded by state.
- **Tooltip** showing `LastError` when `state === 'error'`.

`Lab-Browser-Application.js` gains a `setPersistenceBeacon(uvID,
beaconID, connectionID)` action that POSTs to the lab API and
re-renders. `PictRouter-Lab-Configuration.json` gets the route entry.

#### Persistence of the assignment across UV restarts

Both bridges write `<DataPath>/persistence-assignment.json` on
`setPersistenceAssignment` and read it on construction (alongside the
existing `persistence-bridge-hwm.json` load):

```
{ BeaconID: '<beaconID>', IDBeaconConnection: <num>, AssignedAt: '<iso>' }
```

A UV restart restores the same routing without needing the lab to
re-push. The lab's UV row is the canonical source; the file is a
local cache.

#### Edge cases

1. **Reassignment to a different beacon.** Drop bootstrap state for
   the old beacon, run bootstrap on the new one. Old database's tables
   stay (per Open question 2).
2. **Reassignment within the same beacon to a different connection.**
   Treat as a fresh bootstrap — the new connection's tables may not
   exist yet.
3. **Beacon disappears mid-session.** Bridge falls back to local for
   new writes (existing behavior); pill goes `waiting-for-beacon`. On
   reconnect, bootstrap fires again (idempotent), MeadowProxy mode
   resumes.
4. **Operator clears assignment with rows in flight.** Pending
   MeadowProxy dispatches complete normally; new writes fall back to
   local. No data loss.
5. **Two UVs assigned to the same beacon.** Per Open question 2,
   single-UV mode only. Picker UI surfaces a "this databeacon is
   already in use by UV X" warning but doesn't block — operator can
   override knowingly.

#### RemoteUser pass-through (closes Open question 6)

MeadowProxy.Request takes a `RemoteUser` field; bridges send nothing
today. Wire `_resolveRemoteUser()` on each bridge that prefers
`fable.Authentication.getCurrentUser()` when available, falls back to
the literal `'ultravisor-system'`. Surfaces in the databeacon's audit
log so operators can distinguish UV writes from manual mesh activity.

#### Concrete starting steps

1. **Bridge API + assignment file** (no UI, no lab changes yet).
   Add `setPersistenceAssignment` / `clearPersistenceAssignment` /
   `getPersistenceStatus` / `_lookupIDByHash` to both bridges. Wire
   the assignment file. Refactor `getPersistenceBeacon` to consult
   the explicit assignment first. Unit tests at the bridge level.
2. **Fill the deferred translation entries** (`QP_UpdateWorkItem`,
   `QP_UpdateAttemptOutcome`, `MS_RemoveManifest`) using
   `_lookupIDByHash`. Extend the Session 2 smoke test to cover them.
3. **UV runtime endpoints.** Add `POST /Ultravisor/Persistence/Assign`
   and `GET /Ultravisor/Persistence/Status`. Write the assignment file
   on POST.
4. **Lab data model + API.** Add the two columns to `UltravisorInstance`.
   Add the GET extension + `POST /persistence-beacon` endpoint. Have
   it forward to the UV runtime endpoint.
5. **Lab UI.** Picker + status pill + the `setPersistenceBeacon`
   browser action + transient-state polling.
6. **RemoteUser pass-through.** Add `_resolveRemoteUser` to both
   bridges. Ship at the same time as Session 3 since the lab is the
   source of session-user info.
7. **Lab-driven smoke test.** Spin up lab, spawn UV + databeacon
   (SQLite), assign via the lab API, run a small no-op operation,
   verify rows in `UVQueueWorkItem` / `UVQueueWorkItemEvent` /
   `UVManifest` via direct SQL, verify status pill state via the
   lab API. Replaces the Session 2 bridge-only smoke test as the
   default integration test.

### Session 4 — engine coverage via meadow-migrationmanager + Docker-driven smoke + polish

#### Goal

Take the Session 3 lab workflow from "works against SQLite plus
in-process stubs" to "works against the same engines retold-databeacon
already supports in production". The big shift: instead of building
custom per-engine `addColumn` shims plus a `_UVSchemaVersion` table
inside `DataBeacon-SchemaManager`, embed the existing
`meadow-migrationmanager` services and let them own the
introspect → diff → generate-migration → deploy cycle. Same engine
coverage, less custom code, and we get migration-script auditability
for free. The lab's integration smoke exercises real Docker-spawned
UV + retold-databeacon; the legacy
`ultravisor-queue-beacon` / `ultravisor-manifest-beacon` modules get
marked-and-discouraged; a handful of papercuts surfaced in Session 3
verification get cleaned up. By the end of Session 4, the
persistence-via-databeacon path is the default recommended posture
for any UV that wants beacon-routed persistence.

#### EnsureSchema via meadow-migrationmanager

`meadow-migrationmanager` already ships exactly the services we need:

- `MigrationManager-Service-SchemaIntrospector.js` — reads the current
  column / index / FK shape out of any meadow-supported engine.
- `MigrationManager-Service-SchemaDiff.js` —
  `diffSchemas(introspected, descriptor)` returns a structured diff
  (`TablesAdded`, `TablesModified.{ColumnsAdded, ColumnsRemoved,
  ColumnsModified, IndicesAdded, IndicesRemoved}`, etc.).
- `MigrationManager-Service-MigrationGenerator.js` —
  `generateMigrationStatements(diff, engineType)` emits the
  engine-specific DDL (already handles SQLite / MySQL / MSSQL /
  PostgreSQL — that's the whole point of the module).
- `MigrationManager-Service-SchemaDeployer.js` — runs the DDL via the
  connector's schemaProvider.

The retold-data-service glue at
`source/services/migration-manager/Retold-Data-Service-MigrationManager.js`
is the embed pattern we mirror: instantiate an isolated
`MeadowMigrationManager` Pict context inside retold-databeacon's
`DataBeacon-SchemaManager`, register only the four services we need,
skip everything else (TUI / WebUI / Orator / SchemaLibrary / CLI).
The four meadow connectors `meadow-migrationmanager` brings in are
already retold-databeacon deps; the genuinely-new runtime weight is
small.

EnsureSchema flow becomes:

1. **Translate the descriptor.** The Session 2 inline translator
   (`Scope/Schema/Indexes` + high-level `Type` → `TableName/Columns/Indices`
   + lower-level `DataType`) stays as a thin adapter that produces the
   shape `SchemaDiff` expects.
2. **Introspect the current database** via `SchemaIntrospector` (same
   shape as the descriptor; comparable apples-to-apples).
3. **`diffSchemas(introspected, descriptor)`** → structured diff.
4. **Forward-only filter.** Drop entries from `TablesRemoved`,
   `ColumnsRemoved`, and `ColumnsModified` (where the modification
   isn't purely a default-value change) from the diff before
   generation. Forward-only is enforced at the diff layer, not by
   per-engine DDL guards. Log skipped entries as warnings so an
   operator who actually wants a breaking change knows they need to
   issue it out-of-band.
5. **`generateMigrationStatements(filteredDiff, engineType)`** →
   array of DDL statements.
6. **Execute via the connector's schemaProvider.** For ADD-only diffs
   we can also short-circuit through `SchemaDeployer.deployTable`
   when an entire new table appears; otherwise execute the statements
   in order.
7. **Return** the diff + statement list in the EnsureSchema response
   (currently returns only `{Tables, Indices, Notes}`; gain
   `MigrationStatements: [...]` so operators can see what ran).

Net effect:

- **Per-engine ADD COLUMN comes free.** `MigrationGenerator` already
  knows about SQLite / MySQL / MSSQL / PostgreSQL DDL idioms; we
  delete the SQLite-only `_alterTablesIfChanged` body Session 2
  shipped.
- **Schema versioning isn't needed.** The database is the source of
  truth; introspect-then-diff replaces version tracking. The
  `Version: 1` field in `UltravisorPersistenceSchema.json` becomes
  documentation only.
- **Breaking-change story is "issue the DDL out-of-band, then re-run
  EnsureSchema"** for now. The migration manager has the
  vocabulary for renames / type changes when we want them; we just
  don't use it on the EnsureSchema path because we don't ship destructive
  changes automatically.

#### Embed shape inside DataBeacon-SchemaManager

The `Retold-Data-Service-MigrationManager.js` wrapper is more than we
need (it stands up REST routes, a web UI, DDL file scanning). We
borrow the *embed pattern* but instantiate only the services we
actually use:

```javascript
// Inside DataBeacon-SchemaManager.js constructor:
const libMeadowMigrationManager = require('meadow-migrationmanager');

this._MM = new libMeadowMigrationManager(
{
    Product: 'DataBeacon-SchemaManager',
    LogStreams: pFable.settings.LogStreams || [{ streamtype: 'console' }]
});
this._SchemaIntrospector = this._MM.instantiateServiceProvider('SchemaIntrospector');
this._SchemaDiff         = this._MM.instantiateServiceProvider('SchemaDiff');
this._MigrationGenerator = this._MM.instantiateServiceProvider('MigrationGenerator');
this._SchemaDeployer     = this._MM.instantiateServiceProvider('SchemaDeployer');
```

The existing `_BeaconConnections` cache + connection-routing in
SchemaManager stays unchanged; only the bootstrap body changes.

`package.json` adds `meadow-migrationmanager` as a runtime dep.
`stricture` is already there. The four meadow connectors are already
there. The TUI / pict-section-flow / pict-terminalui / orator deps
inside `meadow-migrationmanager` only load if their services are
instantiated; the four services we use don't reach them.

#### Docker-driven lab smoke

Session 3's `Persistence_Lab_Smoke_tests.js` uses in-process stub HTTP
servers for the UV and databeacon — fast, runs in CI without Docker.
Session 4 ships a sibling `Persistence_Lab_Docker_Smoke_tests.js` that
exercises the full Docker-spawned chain:

1. `before`: skip the suite if Docker isn't reachable (`docker info`
   probe). Otherwise build the lab images if missing.
2. Spin up a real `retold-databeacon` container via the lab's
   `Service-BeaconContainerManager.spawn`. Wait for `/beacon/connections`
   to respond.
3. Spin up a real ultravisor container via
   `Service-UltravisorManager.startInstance`. Wait for `/status`.
4. POST `/beacon/connection` to the databeacon to add an external
   SQLite connection pointing at a host-mounted file.
5. POST `/api/lab/ultravisor-instances/:id/persistence-beacon` with the
   spawned databeacon's `IDBeacon` and the new connection's
   `IDBeaconConnection`.
6. Poll `/api/lab/ultravisor-instances/:id/persistence-status` until
   `Persistence.State === 'bootstrapped'` (timeout 60s — image pulls +
   container cold-start add latency).
7. Trigger a no-op operation through the UV's `/Operation/<hash>/Execute/Async`
   path. Reuse whatever the existing manifest tests use as the no-op
   fixture.
8. Verify rows in the host-mounted SQLite via direct better-sqlite3
   reads (same pattern as Session 2 / Session 3 stubs).
9. Clear the assignment via POST with `IDBeacon: null`. Assert the
   pill flips to `unassigned`.
10. Teardown: stop both containers, prune.

The Session 3 stub smoke stays as the Docker-free integration test
(runs in CI, stays fast). The Docker smoke is opt-in via env var
(`SMOKE_DOCKER=1 npm test` — pattern matches the existing
`test-browser` opt-in for puppeteer tests).

Once the Docker smoke is green, also exercise it against MySQL and
Postgres engines (using the lab's existing engine spawning) so the
ADD COLUMN generalization (#1 above) gets end-to-end coverage in the
same harness.

#### Bootstrap-flush idempotency on appendEvent

Open question 4 made it onto Session 4. The `UVQueueWorkItemEvent.EventGUID`
column is unique; bootstrap-flush re-pushes events on every reconnect.
Today a `409` from the meadow REST endpoint surfaces as
`{Available: true, Success: false, Status: 409}` — the flush sweep
treats that as a hard failure and aborts.

Fix: extend `_normalizeMeadowProxyResult` in
`Ultravisor-QueuePersistenceBridge.cjs` with action-specific logic for
`QP_AppendEvent` (and `QP_InsertAttempt`, which has a similar
`(WorkItemHash, AttemptNumber)` unique constraint). Map a 409 (or
500-with-unique-violation, depending on engine) to
`{Available: true, Success: true, AlreadyPresent: true}`. Other
actions still treat 409 as an error.

Ensure the flush-sweep loop in
`Ultravisor-QueuePersistenceBridge._flushQueueToBeacon` advances the
HWM on `AlreadyPresent: true` results — the row is already on the
beacon, so the HWM should march forward.

#### Read-shape normalization audit (closes Open question 3)

`QP_ListWorkItems` / `QP_GetEvents` / `MS_ListManifests` go through
MeadowProxy → meadow's bulk-read endpoint, which returns a bare array.
Session 2's `_normalizeMeadowProxyResult` already wraps the array into
the `{Available, Success, WorkItems: [...]}` shape `_readOrLocal`'s
callers expect, but the wrapping is duplicated across the queue and
manifest bridges.

Plan:

1. Audit every `_readOrLocal` consumer (mostly in
   `Ultravisor-API-Server.cjs`'s `/Manifest`, `/Beacon/Work/...`, and
   the coordinator's listing paths). Confirm each one consumes the
   wrapped shape and not the raw beacon response.
2. Pull the array-wrapping logic into a shared helper
   (`_arrayResult(pAction, pParsed, pSuccess, pListKey)`) on each
   bridge, replacing the duplicated switch-case branches.
3. Add coverage in the Session 2 bridge smoke for the list + filter
   paths against MeadowProxy mode (currently only the GET-by-hash
   path is exercised end-to-end).

Tangential to Session 4's main thrust but cheap to land alongside the
engine-coverage work — same files get touched.

#### Legacy beacon deprecation

`ultravisor-queue-beacon` and `ultravisor-manifest-beacon` are still
selectable in the lab's beacon-create form. They stay as-is in the
codebase (they're the reference Provider implementations and useful for
embedded deployments that don't want retold-databeacon's REST surface).
Session 4 just makes the recommended path obvious to operators:

- `Service-BeaconTypeRegistry.js` — append `(legacy)` to the
  `DisplayName` of both types and add a `Deprecated: true` field on
  the public descriptor.
- `PictView-Lab-Beacons.js` — when the form's BeaconType dropdown
  shows a deprecated type, render a tooltip / inline note: "Legacy
  type. New deployments should use `retold-databeacon` + the lab's
  Persistence assignment for queue / manifest persistence."
- The seed-dataset and other paths that filter by `BeaconType ===
  'retold-databeacon'` already do the right thing; no other changes.

#### Test-fable cleanup (tangential hygiene)

Session 3 verification surfaced 6 pre-existing failures in
`modules/apps/ultravisor/test/Ultravisor_BeaconQueue_tests.js` and
`Ultravisor_tests.js`:

- **Coordinator integration tests** — `enqueueWorkItem populates new
  fields and persists to store` and `dispatch tick promotes Queued
  items to Dispatched`. Both fail because `buildFable()` doesn't
  register `UltravisorQueuePersistenceBridge`, so the coordinator's
  `_getQueuePersistenceBridge()` returns null and persistence is
  skipped. Fix: register the bridge service alongside the existing
  `UltravisorBeaconQueueStore` / `UltravisorBeaconCoordinator` /
  `UltravisorBeaconScheduler` registrations.
- **TaskTypeRegistry count tests** — three tests asserting
  `registry.size === 56` while the registry now has 57. Fix: bump the
  expected count, or better, derive it from the config array so the
  next addition doesn't break the test.

Tangential to the persistence refactor but lands cleanly in Session 4
since it's pure hygiene work.

#### Concrete starting steps

1. **Embed `meadow-migrationmanager` in `DataBeacon-SchemaManager`.**
   Add the dep, instantiate the four services
   (`SchemaIntrospector` / `SchemaDiff` / `MigrationGenerator` /
   `SchemaDeployer`) on an isolated MM Pict context. Replace the
   Session 2 SQLite-only `_alterTablesIfChanged` body with the
   introspect → diff → forward-only filter → generate → execute
   pipeline. Keep the existing descriptor translator that produces
   the shape SchemaDiff expects.
2. **Per-engine integration tests.** Extend
   `DataBeacon-SchemaManager_tests.js` (the Session 1 / 2 unit
   coverage) with Docker-spawned MySQL / MSSQL / PostgreSQL cases
   that prove fresh-bootstrap + incremental ADD COLUMN both work
   end-to-end. Reuse the connector test suites' existing Docker
   helpers.
3. **Bootstrap-flush idempotency.** Map 409 / unique-violation to
   `Success: true, AlreadyPresent: true` for `QP_AppendEvent` and
   `QP_InsertAttempt`. Advance the HWM on `AlreadyPresent`.
4. **Read-shape normalization.** Pull array-wrapping logic into
   `_arrayResult` on both bridges; audit consumers.
5. **Docker-driven lab smoke.** New
   `Persistence_Lab_Docker_Smoke_tests.js` — opt-in via `SMOKE_DOCKER=1`.
   Skip cleanly when Docker isn't reachable. Run against SQLite +
   MySQL + Postgres via the lab's existing engine spawning.
6. **Legacy beacon deprecation labels.** `(legacy)` suffix in
   BeaconTypeRegistry + tooltip in the beacon form.
7. **Test-fable cleanup.** Register the persistence bridge in
   `Ultravisor_BeaconQueue_tests.js`'s `buildFable`; derive
   TaskTypeRegistry count from the config array.

#### Items deferred past Session 4

- **Real session-user `RemoteUser` threading.** Today's bridges send
  the synthetic `'ultravisor-system'`. Wiring the originating session
  user through the
  `/Ultravisor/Persistence/*` → bridge → MeadowProxy audit path
  requires threading a context arg through the bridge dispatch API
  (currently fire-and-forget). Lands when audit-log fidelity becomes a
  customer-facing requirement.
- **Multi-UV deployment topology** (Open question 2). Today's `UV*`
  table names imply a single-UV-per-databeacon convention; supporting
  N UVs against the same databeacon needs either per-UV table prefixes
  (`UV_<HubID>_QueueWorkItem`) or a `UltravisorInstanceID` discriminator
  column on every row. Defer until multi-UV deployments are concrete
  enough to choose between the two.
- **Hard-delete retention sweep.** Soft-deleted manifests (and
  cancelled work items, once we add a TTL) accumulate forever today.
  A periodic retention sweep with a configurable `RetentionDays` per
  UV is feature work, not refactor cleanup.
- **Cross-table queries** (Open question 5). With both queue + manifest
  in one database, joins like "show me all events for runs of operation
  X" are now possible at the SQL level but the bridges expose only
  single-table operations. A future `MeadowProxy.Query` (raw SQL) or
  `DataBeaconManagement.Join` capability is feature work, not part of
  the refactor.

## Files this work touches (reference)

### retold-databeacon
- `source/services/DataBeacon-BeaconProvider.js` — register the
  `DataBeaconSchema` capability alongside the existing three.
- `source/services/DataBeacon-SchemaManager.js` — Session 4 reshapes
  the EnsureSchema body around `meadow-migrationmanager`'s
  `SchemaIntrospector` + `SchemaDiff` + `MigrationGenerator` +
  `SchemaDeployer` services. The Session 2 inline descriptor translator
  stays as a thin adapter; the SQLite-only `_alterTablesIfChanged`
  body goes away.
- `source/services/DataBeacon-MeadowProxyProvider.js` — accept a
  `PathAllowlist` config update at runtime.
- `package.json` — Session 4 adds `meadow-migrationmanager` as a runtime
  dep. `stricture` is already present (Session 1).

### ultravisor
- `source/persistence/UltravisorPersistenceSchema.json` (new) —
  the schema source-of-truth.
- `source/services/Ultravisor-QueuePersistenceBridge.cjs` —
  add `_dispatchViaMeadowProxy`, schema-bootstrap state machine.
- `source/services/Ultravisor-ManifestStoreBridge.cjs` — same.
- `source/services/Ultravisor-Beacon-Coordinator.cjs` — already calls
  `_notifyPersistenceBridgesOnConnect` from bootstrap-flush; the bridges'
  internal logic just grows new branches. No coordinator changes expected.

### ultravisor-lab
- `source/services/Service-UltravisorManager.js` — add `IDPersistenceBeacon`
  field to the row schema + getter/setter.
- `source/web_server/routes/Lab-Api-Ultravisor.js` — assignment endpoint.
- `source/browser_bundle/views/PictView-Lab-Ultravisor.js` — picker UI.
- `source/browser_bundle/Lab-Browser-Application.js` —
  `setPersistenceBeacon(pUvID, pBeaconID)` action.
- `source/browser_bundle/providers/PictRouter-Lab-Configuration.json` —
  route for the picker change.

## Open questions for future sessions

1. **PathAllowlist push mechanism.** Today retold-databeacon takes the
   allowlist as a constructor option. To update it at runtime we either
   (a) restart the beacon, or (b) add a new `DataBeaconManagement.UpdateConfig`
   action that the BeaconProvider forwards into the MeadowProxy options.
   Probably (b) — but flag this for the implementer.

2. **Shared persistence database vs separate.** When multiple UVs assign
   the same databeacon, do their tables collide? Right now the schema uses
   `UV*` prefixes which would mean all UVs share one set of tables. That's
   wrong if UVs are supposed to be isolated. Two options:
   - Per-UV table prefix (e.g. `UV_<UltravisorInstanceHash>_QueueWorkItem`).
   - Add a `UltravisorInstanceID` column on every row.
   Decision deferred — easier to make once we're closer to multi-UV
   deployments. For now: single-UV mode only.

3. **Read shape on `getEvents` / `listWorkItems`.** Meadow's bulk-read REST
   surface returns an array directly, not the `{Success, ...}` envelope the
   bridge's `_readOrLocal` expects. The MeadowProxy translation will need to
   normalize. Trivial but worth flagging.

4. **Idempotency of `appendEvent`.** Bootstrap-flush re-pushes events on
   reconnect. The schema's `EventGUID` unique constraint catches duplicates,
   but the bridge needs to handle the resulting `409` / unique-violation
   gracefully (treat as success, not error).

5. **Cross-table queries.** With both queue + manifest in one database,
   we can write `SELECT ... FROM UVQueueWorkItem JOIN UVManifest ...` for
   things like "show me all events for runs of operation X". The current
   bridges expose only single-table operations. A future capability could
   add `MeadowProxy.Query` (raw SQL) or `DataBeaconManagement.Join` — but
   that's a feature, not a refactor item.

6. **Auth between ultravisor and the assigned databeacon.** Partially
   addressed in Session 3: the bridges now thread a synthetic
   `'ultravisor-system'` value through `RemoteUser` on every dispatched
   `MeadowProxy.Request`, surfacing in MeadowProxy's audit trail. The
   real session-user pass-through (Secure-mode operator → UV
   `/Ultravisor/Persistence/*` → bridge → databeacon audit log) is still
   deferred — `_resolveRemoteUser()` is the single hook to wire it
   through once the UV API server starts threading the resolved
   session user into bridge dispatches.

## Glossary

- **bootstrap-flush.** The mechanism (already shipped) that replays locally-
  buffered writes into a freshly-connected persistence beacon. See the
  per-bridge `_FlushHWMs` state and `<DataPath>/persistence-bridge-hwm.json`.
- **HWM.** High-water mark — the timestamp of the most recent item
  successfully pushed to a particular beacon. Per-beacon, persisted to disk.
- **MeadowProxy.** Capability on retold-databeacon that proxies HTTP requests
  to its localhost meadow REST API. The mesh-callable equivalent of "make
  any meadow REST call against this database."
- **Persistence beacon.** A retold-databeacon instance assigned via the lab
  UI to be a specific UV's persistence backend. Same software, contextual
  role.
- **EventGUID.** UUID v4 stamped on every queue/manifest event by ultravisor.
  Stable across process restarts. The dedup key for replay; Seq is just an
  ordering hint.
