/**
 * Ultravisor Observer Policy
 *
 * Pure classification functions used by the Observer to derive
 * lifecycle state from raw signals.  No `this` state, no I/O —
 * each function takes the relevant inputs and returns a label
 * with a Reason.
 *
 * Phase 3 introduces this module as the single home for classification
 * rules that previously lived scattered across:
 *   - Ultravisor-Beacon-Scheduler (_maybeMarkStalled / _maybeRecoverStalled)
 *   - Ultravisor-Beacon-Coordinator (deregisterBeacon work-release branch)
 *   - Ultravisor-ExecutionManifest (finalizeExecution _Stalled scan)
 *
 * Phase 3 is additive — those legacy paths still run as a safety net.
 * The Observer reasons through this policy module independently and
 * emits derived events so a future migration can flip consumers over.
 *
 * @module ObserverPolicy
 */

// --- Defaults — every threshold appears in the snapshot's Policy block
//     so an AI agent can read the limits without parsing source. ---
const DEFAULT_POLICY = {
	// Beacon liveness
	HeartbeatExpectedMs: 60000,
	BeaconSuspectMultiplier: 1.5,    // > Expected * this  => Suspect
	BeaconDeadMultiplier: 3,         // > Expected * this  => Dead
	WSCloseImmediatelyDead: true,    // socket close => Dead within one tick

	// Work item stall
	StallHeartbeatMultiplier: 2,     // matches Phase 2 scheduler value
	StalledTimeoutMs: 300000,        // hard cap regardless of heartbeat baseline

	// Stranded queue items
	StrandedAfterMs: 0,              // 0 => classify immediately at enqueue

	// Recent terminal ring buffer caps
	RecentTerminalWorkItemsMax: 100,
	RecentTerminalOperationsMax: 100,

	// History buffer
	HistoryEventsMax: 1000,

	// Beacon recent-duration sample window per Action
	RecentDurationsPerActionMax: 25
};

const NONTERMINAL_WORK_STATUSES = ['Queued', 'Pending', 'Assigned', 'Dispatched', 'Running'];
const TERMINAL_WORK_STATUSES = ['Completed', 'Complete', 'Failed', 'Error', 'Timeout', 'Canceled', 'Stalled'];

function getDefaults()
{
	return Object.assign({}, DEFAULT_POLICY);
}

/**
 * Classify a beacon's liveness from its observed signals.
 *
 * @param {object} pBeacon - { LastHeartbeatAt, RegisteredAt, WSConnected, ManualOverrideLiveness? }
 * @param {object} pPolicy - merged policy thresholds
 * @returns {{ Liveness: 'Alive'|'Suspect'|'Dead', LivenessReason: string }}
 */
function classifyBeacon(pBeacon, pPolicy)
{
	let tmpPolicy = pPolicy || DEFAULT_POLICY;

	if (!pBeacon)
	{
		return { Liveness: 'Dead', LivenessReason: 'beacon_missing' };
	}

	// Manual override (operator force-marked) wins.
	if (pBeacon.ManualOverrideLiveness)
	{
		return {
			Liveness: pBeacon.ManualOverrideLiveness,
			LivenessReason: 'manual_override'
		};
	}

	// WebSocket close => Dead immediately.  This is the Phase 3 win:
	// instead of waiting 120s for stale-heartbeat math to flip the
	// label, the Observer reads `WSConnected: false` and dispatches
	// the same conclusion in the next tick (≤ 5s).
	if (tmpPolicy.WSCloseImmediatelyDead && pBeacon.WSConnected === false)
	{
		return { Liveness: 'Dead', LivenessReason: 'ws_closed' };
	}

	let tmpHeartbeatExpected = tmpPolicy.HeartbeatExpectedMs || DEFAULT_POLICY.HeartbeatExpectedMs;
	let tmpLastBeatAt = pBeacon.LastHeartbeatAt
		? Date.parse(pBeacon.LastHeartbeatAt)
		: (pBeacon.RegisteredAt ? Date.parse(pBeacon.RegisteredAt) : null);

	if (!tmpLastBeatAt || isNaN(tmpLastBeatAt))
	{
		// Brand new beacon; no signal yet.  Treat as Alive — consumers
		// that want to gate on "have we ever seen a heartbeat" can read
		// LastHeartbeatAt directly.
		return { Liveness: 'Alive', LivenessReason: 'just_registered' };
	}

	let tmpAgeMs = Date.now() - tmpLastBeatAt;

	if (tmpAgeMs > tmpHeartbeatExpected * (tmpPolicy.BeaconDeadMultiplier || DEFAULT_POLICY.BeaconDeadMultiplier))
	{
		return { Liveness: 'Dead', LivenessReason: 'heartbeat_timeout' };
	}
	if (tmpAgeMs > tmpHeartbeatExpected * (tmpPolicy.BeaconSuspectMultiplier || DEFAULT_POLICY.BeaconSuspectMultiplier))
	{
		return { Liveness: 'Suspect', LivenessReason: 'heartbeat_late' };
	}
	return { Liveness: 'Alive', LivenessReason: 'nominal' };
}

/**
 * Classify an in-flight work item.  Returns a label that the Observer
 * promotes into observer.workitem.* events.  Mirrors Phase 2's
 * Scheduler stall logic but reads liveness from the Observer's beacon
 * map, so a WS-closed beacon flips the work item to 'Stalled' on the
 * next tick rather than after the heartbeat window expires.
 *
 * @param {object} pItem - work item record
 * @param {object|null} pBeacon - assigned beacon (Observer-tracked liveness)
 * @param {object} pPolicy - merged policy thresholds
 * @returns {{ Label: 'Healthy'|'Stalled', Reason: string }}
 */
function classifyWorkItem(pItem, pBeacon, pPolicy)
{
	let tmpPolicy = pPolicy || DEFAULT_POLICY;

	if (!pItem) return { Label: 'Healthy', Reason: 'noop' };
	if (TERMINAL_WORK_STATUSES.indexOf(pItem.Status) >= 0)
	{
		return { Label: 'Healthy', Reason: 'terminal' };
	}

	// Already-flagged Stalled — don't re-classify (the Scheduler's
	// recovery path can flip it back if heartbeats resume).
	if (pItem.Status === 'Stalled')
	{
		return { Label: 'Stalled', Reason: pItem.StalledReason || 'previously_stalled' };
	}

	// If the assigned beacon is Dead, flip the work item to Stalled
	// immediately.  This is the cross-subsystem fusion the plan calls
	// out: the Scheduler's _maybeMarkStalled relies on LastEventAt,
	// but the Observer also sees WSConnected and can decide faster.
	if (pBeacon && pBeacon.Liveness === 'Dead' && (pItem.Status === 'Dispatched' || pItem.Status === 'Running'))
	{
		return { Label: 'Stalled', Reason: 'beacon_dead' };
	}

	let tmpEligibleStatuses = ['Dispatched', 'Running', 'Pending', 'Assigned'];
	if (tmpEligibleStatuses.indexOf(pItem.Status) < 0)
	{
		return { Label: 'Healthy', Reason: 'inactive' };
	}

	let tmpEverDispatched = !!pItem.DispatchedAt;
	if ((pItem.Status === 'Pending' || pItem.Status === 'Assigned') && !tmpEverDispatched)
	{
		return { Label: 'Healthy', Reason: 'queued' };
	}

	let tmpLastEventStr = pItem.LastEventAt || pItem.DispatchedAt;
	if (!tmpLastEventStr) return { Label: 'Healthy', Reason: 'no_signal' };

	let tmpLastEventMs = Date.parse(tmpLastEventStr);
	if (isNaN(tmpLastEventMs)) return { Label: 'Healthy', Reason: 'bad_timestamp' };

	let tmpHeartbeat = (pItem.HeartbeatExpectedMs || tmpPolicy.HeartbeatExpectedMs) || DEFAULT_POLICY.HeartbeatExpectedMs;
	let tmpStallThreshold = tmpHeartbeat * (tmpPolicy.StallHeartbeatMultiplier || DEFAULT_POLICY.StallHeartbeatMultiplier);
	let tmpSinceEvent = Date.now() - tmpLastEventMs;

	if (tmpSinceEvent > tmpStallThreshold)
	{
		return { Label: 'Stalled', Reason: 'heartbeat_timeout' };
	}
	return { Label: 'Healthy', Reason: 'nominal' };
}

/**
 * Classify an upcoming (non-dispatched) work item to find capacity
 * gaps.  Returns the BlockingReason that goes into the snapshot's
 * UpcomingQueue so an AI / operator can see why an item is parked.
 *
 * @param {object} pItem - work item record
 * @param {Array<object>} pBeacons - beacon records (Observer-tracked)
 * @returns {{ BlockingReason: string|null, EligibleBeacons: Array<string> }}
 */
function classifyUpcoming(pItem, pBeacons)
{
	if (!pItem) return { BlockingReason: null, EligibleBeacons: [] };
	if (TERMINAL_WORK_STATUSES.indexOf(pItem.Status) >= 0)
	{
		return { BlockingReason: null, EligibleBeacons: [] };
	}

	let tmpCap = pItem.Capability || 'Shell';
	let tmpEligible = [];
	let tmpEligibleAlive = [];
	let tmpEligibleBusy = [];
	let tmpAffinityTarget = pItem.AssignedBeaconID || pItem.AffinityKey || null;
	let tmpAffinityMatch = null;

	let tmpBeacons = Array.isArray(pBeacons) ? pBeacons : [];
	for (let i = 0; i < tmpBeacons.length; i++)
	{
		let tmpBeacon = tmpBeacons[i];
		if (!tmpBeacon) continue;
		if (!_beaconHasCapability(tmpBeacon, tmpCap)) continue;

		// Eligibility means "could in principle take this work" — that
		// requires capability match AND a live (Alive | Suspect) beacon.
		// A Dead beacon's capability list is a corpse: the operator
		// should see "no_eligible_beacon" not "all_eligible_busy".
		let tmpAlive = (tmpBeacon.Liveness === 'Alive' || tmpBeacon.Liveness === 'Suspect');
		if (!tmpAlive) continue;

		tmpEligible.push(tmpBeacon.BeaconID);

		let tmpMax = tmpBeacon.MaxConcurrent || 1;
		let tmpActive = (tmpBeacon.CurrentWorkItems || []).length;
		if (tmpActive >= tmpMax)
		{
			tmpEligibleBusy.push(tmpBeacon.BeaconID);
			continue;
		}
		tmpEligibleAlive.push(tmpBeacon.BeaconID);

		if (tmpAffinityTarget && (tmpBeacon.BeaconID === tmpAffinityTarget || tmpBeacon.Name === tmpAffinityTarget))
		{
			tmpAffinityMatch = tmpBeacon;
		}
	}

	if (tmpEligible.length === 0)
	{
		return {
			BlockingReason: 'no_eligible_beacon',
			EligibleBeacons: []
		};
	}

	if (tmpAffinityTarget)
	{
		// We have eligible beacons by capability.  If the affinity
		// target itself is unreachable the item is pinned to a corpse.
		if (!tmpAffinityMatch)
		{
			let tmpAffinityAliveAnywhere = false;
			for (let j = 0; j < tmpBeacons.length; j++)
			{
				let tmpB = tmpBeacons[j];
				if (!tmpB) continue;
				if ((tmpB.BeaconID === tmpAffinityTarget || tmpB.Name === tmpAffinityTarget)
					&& (tmpB.Liveness === 'Alive' || tmpB.Liveness === 'Suspect'))
				{
					tmpAffinityAliveAnywhere = true;
					break;
				}
			}
			if (!tmpAffinityAliveAnywhere)
			{
				return {
					BlockingReason: 'affinity_pinned_to_offline',
					EligibleBeacons: tmpEligible
				};
			}
		}
	}

	if (tmpEligibleAlive.length === 0)
	{
		return {
			BlockingReason: 'all_eligible_busy',
			EligibleBeacons: tmpEligible
		};
	}

	return { BlockingReason: null, EligibleBeacons: tmpEligible };
}

function _beaconHasCapability(pBeacon, pCapability)
{
	let tmpCaps = (pBeacon && pBeacon.Capabilities) || [];
	for (let i = 0; i < tmpCaps.length; i++)
	{
		let tmpEntry = tmpCaps[i];
		if (typeof tmpEntry === 'string' && tmpEntry === pCapability) return true;
		if (tmpEntry && tmpEntry.Capability === pCapability) return true;
	}
	return false;
}

/**
 * Roll up a run/operation status from the work items it owns.  Mirrors
 * ExecutionManifest.finalizeExecution's _Stalled-marker scan but reads
 * directly from the Observer's work-item map so it doesn't depend on
 * TaskOutputs being populated.
 *
 * @param {object} pRun - execution context summary
 * @param {object} pObserver - the Observer instance (for cross-lookup)
 * @returns {{ Status: string, Reason: string }}
 */
function classifyOperation(pRun, pObserver)
{
	if (!pRun) return { Status: 'Unknown', Reason: 'no_run' };

	let tmpStatus = pRun.Status || 'Unknown';
	if (tmpStatus === 'Stalled' || tmpStatus === 'Failed'
		|| tmpStatus === 'Complete' || tmpStatus === 'Completed'
		|| tmpStatus === 'Abandoned' || tmpStatus === 'Canceled')
	{
		return { Status: tmpStatus, Reason: 'terminal' };
	}

	if (pObserver && typeof pObserver.getWorkItemsForRun === 'function')
	{
		let tmpItems = pObserver.getWorkItemsForRun(pRun.Hash || pRun.RunHash);
		for (let i = 0; i < tmpItems.length; i++)
		{
			let tmpItem = tmpItems[i];
			if (tmpItem && tmpItem.Status === 'Stalled')
			{
				return { Status: 'Stalled', Reason: 'stalled_workitem' };
			}
		}
	}
	return { Status: tmpStatus, Reason: 'in_flight' };
}

/**
 * Decide whether a terminal item should be retried.  Conservative
 * default: items that hit MaxAttempts don't retry; heartbeat-driven
 * stalls do retry once a fresh beacon shows up.
 */
function isRetryEligible(pItem, pHistory)
{
	if (!pItem) return false;
	if (pItem.Status !== 'Stalled' && pItem.Status !== 'Failed' && pItem.Status !== 'Error') return false;
	let tmpAttempts = pItem.AttemptNumber || 0;
	let tmpMax = pItem.MaxAttempts || 1;
	if (tmpAttempts >= tmpMax) return false;
	return true;
}

module.exports = {
	DEFAULT_POLICY,
	NONTERMINAL_WORK_STATUSES,
	TERMINAL_WORK_STATUSES,
	getDefaults,
	classifyBeacon,
	classifyWorkItem,
	classifyUpcoming,
	classifyOperation,
	isRetryEligible
};
