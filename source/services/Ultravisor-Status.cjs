/**
 * Ultravisor canonical operation status enum (Phase 2 of the status
 * migration; see plan in /docs/uv-status-enum-phase2.md).
 *
 * Operation-level Status values that finalizeExecution and the engine
 * write into ExecutionContext.Status.  The 7 canonical names replace
 * the historical Pending/Running/WaitingForInput trio:
 *
 *   Queued       — submitted but not yet running   (was: Pending)
 *   In Progress  — actively executing              (was: Running)
 *   Waiting      — paused for external event/input (was: WaitingForInput)
 *   Error        — per-node soft error (per-node only, not operation rollup)
 *   Complete     — terminal happy path
 *   Stalled      — heartbeat timeout; stuck without progress
 *   Failed       — terminal hard failure (Phase 1)
 *
 * The engine emits canonical names from UV 1.0.34 onward.  Older
 * persisted manifests on disk and any external consumer that still
 * matches the legacy strings keep working because every reader in UV
 * goes through `isTerminal` / `isWaiting` / `equals` here, all of
 * which normalize via STATUS_LEGACY_TO_CANONICAL.
 */

'use strict';

const STATUS = Object.freeze(
{
	QUEUED:       'Queued',
	IN_PROGRESS:  'In Progress',
	WAITING:      'Waiting',
	ERROR:        'Error',
	COMPLETE:     'Complete',
	STALLED:      'Stalled',
	FAILED:       'Failed',
	// Operational substates kept for backward compatibility but not part
	// of the canonical enum:
	ABANDONED:    'Abandoned',
	RETRYING:     'Retrying'
});

// Map legacy strings -> canonical.  Values that already match the new
// names map to themselves so callers can normalize defensively.
const STATUS_LEGACY_TO_CANONICAL = Object.freeze(
{
	'Pending':         STATUS.QUEUED,
	'Queued':          STATUS.QUEUED,
	'Running':         STATUS.IN_PROGRESS,
	'In Progress':     STATUS.IN_PROGRESS,
	'WaitingForInput': STATUS.WAITING,
	'Waiting':         STATUS.WAITING,
	'Error':           STATUS.ERROR,
	'Complete':        STATUS.COMPLETE,
	'Completed':       STATUS.COMPLETE,
	'Stalled':         STATUS.STALLED,
	'Failed':          STATUS.FAILED,
	'Abandoned':       STATUS.ABANDONED,
	'Retrying':        STATUS.RETRYING
});

// Terminal states for the operation rollup.  Stalled is terminal
// because (per the Phase 2 plan) the operation is considered dead
// when its work item has been stuck past the heartbeat threshold;
// recovery requires an explicit retry.
const TERMINAL_STATUSES = Object.freeze(new Set(
[
	STATUS.COMPLETE,
	STATUS.ERROR,
	STATUS.FAILED,
	STATUS.STALLED,
	STATUS.ABANDONED
]));

function normalize(pStatus)
{
	if (!pStatus) return pStatus;
	let tmpCanonical = STATUS_LEGACY_TO_CANONICAL[pStatus];
	return tmpCanonical || pStatus;
}

function equals(pStatusA, pStatusB)
{
	return normalize(pStatusA) === normalize(pStatusB);
}

function isTerminal(pStatus)
{
	return TERMINAL_STATUSES.has(normalize(pStatus));
}

function isWaiting(pStatus)
{
	return normalize(pStatus) === STATUS.WAITING;
}

function isInProgress(pStatus)
{
	return normalize(pStatus) === STATUS.IN_PROGRESS;
}

function isQueued(pStatus)
{
	return normalize(pStatus) === STATUS.QUEUED;
}

module.exports = {
	STATUS,
	STATUS_LEGACY_TO_CANONICAL,
	TERMINAL_STATUSES,
	normalize,
	equals,
	isTerminal,
	isWaiting,
	isInProgress,
	isQueued
};
