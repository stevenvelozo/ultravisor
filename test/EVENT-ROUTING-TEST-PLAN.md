# Event-Routing Fix — Test Plan

Validates the four code paths changed by the event-routing fixes (engine matches
fired/resume event names against ports CASE-SENSITIVELY; mismatches strand all
downstream nodes while the run still reports `Complete`):

| # | Path | Change | Risk class |
|---|------|--------|-----------|
| A | `tasks/extension/Ultravisor-TaskConfigs-Extension.cjs` | `ResumeEventName: 'complete'` → `'Complete'` | case-only |
| B | `Ultravisor-Beacon-Coordinator.cjs` `failWorkItem` | `ResumeEventName = 'error'` → `'Error'` | case-only (error branch) |
| C | `tasks/user-interaction/Ultravisor-TaskConfigs-UserInteraction.cjs` + `Ultravisor-TaskType-ValueInput.cjs` (3 sites each) | `EventToFire: 'complete'` → `'ValueInputComplete'` | **event renamed** — behavioral |
| D | `Ultravisor-ExecutionEngine.cjs` `_enqueueDownstreamEvents` | new unrouted-event warn | new diagnostic |

## Invariants under test

1. **Routing invariant:** every event a task fires or resumes with must reach the
   node wired to the same-named output port (A, B, C).
2. **Convergence invariant (C):** value-input's *auto-resolve* paths and its
   *interactive pause→resume* path must fire the SAME event
   (`ValueInputComplete`), so a graph wired once works in both modes.
3. **Diagnostic invariant (D):** an event matching none of a node's outgoing
   connections logs a warning naming the node and event; legitimately terminal
   nodes (no outgoing event connections) stay silent.

## Layers

### L1 — Unit (executor return values)  ✅ existing
- `Ultravisor_BeaconDispatchResume_tests.js`: A pause result + error precheck
  events ∈ declared EventOutputs; B `failWorkItem` sets `'Error'`.
- `Ultravisor_TaskEventConsistency_tests.js`: sweep of every task tier —
  all `EventToFire`/`ResumeEventName` literals ⊆ declared `EventOutputs`
  (catches the whole bug class statically, incl. all 6 C sites).

### L2 — Engine integration (in-process graphs)  ◀ NEW: `Ultravisor_EventRouting_tests.js`
Graph: `start → input-1 (value-input) → marker (error-message) → end`, run on
the real ExecutionEngine. The marker node's presence in `TaskOutputs` proves
the event routed.

| ID | Branch | Drive | Assert |
|----|--------|-------|--------|
| T1 | C: auto-resolve from **pre-seeded state** | `executeOperation(op, { OperationState: { TestValue } })`, `OutputAddress: 'Operation.TestValue'` | Status `Complete` (no pause), `input-1.InputValue` = seeded value, **marker ran** |
| T2 | C: auto-resolve from **DefaultValue** (programmatic) | non-empty OperationState, node `DefaultValue` | Status `Complete`, InputValue = default, marker ran |
| T3 | C: auto-resolve **optional empty** (programmatic) | non-empty OperationState, `InputSchema.Required: false`, no default | Status `Complete`, InputValue `''`, marker ran |
| T4 | C: **interactive pause → resume** (regression + convergence) | no initial state → expect `Waiting`, marker NOT run; then `resumeOperation(run, 'input-1', value)` | Status `Complete`, InputValue = provided, **marker ran via the same wiring as T1-T3** |
| T5 | D: unrouted-event **warn** | synthetic task type declaring `Complete` but firing `Mismatched`, with a wired downstream | run log contains the warn naming node + event; downstream NOT run |
| T6 | B: **error-path routing end-to-end** | beacon-dispatch graph with `Error` edge → error-marker; real coordinator + stub beacon; `failWorkItem` (MaxAttempts=1) | error-marker ran (the `Error` edge fired through resume), failure recorded |

### L3 — Live lab validation (rebuilt UV in `ultravisor-lab/validation/unnest-validation`)
- **A (done):** `test-generic-dispatch-fix.js` — formerly-stranded generic-dispatch
  graph chains, 3 rows written, replay idempotent.
- **C (new):** `test-valueinput-fix.js` — register an operation-library graph
  containing value-inputs (`expression-calculator`), trigger **programmatically**
  with `Parameters` seeding every value-input's OutputAddress; pre-fix this
  strands at the first input (run `Complete` but downstream TaskOutputs absent);
  post-fix the full chain runs and the expression result is produced.

### L4 — Existing-regression sweep  ✅ run on every change
`Ultravisor_tests.js` (incl. value-input pause/resume + backward-compat scalar
resume) + `Ultravisor_BeaconQueue_tests.js` + `Ultravisor_operation_library_tests.js`
+ the two new suites. Green bar required (356 passing at last full run).

## Out of scope / accepted
- Web UI PendingInput flow (manual; rendering reads the same definitions).
- `Cancelled` output of value-input: no engine path fires it today (UI-driven);
  covered implicitly by the consistency sweep.
- retold-labs experiment runner (external consumer of programmatic triggers):
  benefits from C; validated indirectly by T1-T3 which replicate its drive style.

## Execution results (2026-06-10)

| Layer | Result |
|---|---|
| L1 unit | ✅ `Ultravisor_BeaconDispatchResume_tests.js` 4/4; `Ultravisor_TaskEventConsistency_tests.js` 13/13 |
| L2 engine | ✅ `Ultravisor_EventRouting_tests.js` 6/6 (T1–T6) |
| L3-A lab | ✅ generic-dispatch graph chains end-to-end (3 rows written, replay idempotent) |
| L3-C lab | ✅ programmatic value-input auto-resolve routes downstream (`ec-solve` ran with the seeded value). Bonus negative control: re-running against the pre-fix UV image reproduced the stranding exactly, and the new warn named it in the live log (`Node [ec-input] fired event [complete]…`) |
| L4 sweep | ✅ 362 passing, 0 failing |

**New pre-existing bug found during L3-C — now FIXED (2026-06-10):**
the stock `expression-solver` task failed on every execution with
`pTask.fable.ExpressionParser.resolve is not a function` (fable's API is `solve`).
Fixed in `Ultravisor-TaskConfigs-DataTransform.cjs` (solve + a data-source scope
mirroring the StateManager address roots: `Operation.* / Global.* / TaskOutput.*`);
covered by `Ultravisor_ExpressionSolver_tests.js` (U1-U5 executor + E1 engine
integration). With both fixes in, the stock expression-calculator completes a
programmatic run end-to-end (`ec-input → ec-solve "42" → ec-format → ec-write`,
Status `Complete`) — verified live in the lab (`test-valueinput-fix.js`, strong
full-chain assertion). The operation-library suite does not execute graphs,
which is why this was invisible until a live run — an "execute each library
operation programmatically" suite remains the recommended follow-up.

**Addendum (2026-06-10): two more `ExpressionParser.resolve` call sites** (found
by sweeping for the API-misuse pattern after the solver fix — credit: code
review): the if-conditional's Expression path, in BOTH variants
(`Ultravisor-TaskConfigs-FlowControl.cjs` + `Ultravisor-TaskType-IfConditional.cjs`).
The throw was caught and routed `False`, so every Expression-based conditional
silently took the False branch. Fixed with `solve` + the same StateManager-root
data scope, plus explicit result coercion — `solve` returns `'1'`/`'0'` STRINGS
for comparisons and `'0'` is truthy in JS, so without coercion a false
comparison would have routed True. Covered by `Ultravisor_IfConditional_tests.js`
(C1-C5 config executor incl. the '0' trap + DataAddress regression + throw path;
K1-K2 class twin; E1-E2 engine branch routing). Full sweep: 377 passing.
