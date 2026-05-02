/**
 * Ultravisor Timeline Projector (Phase 5 — Pillar 2)
 *
 * Pure-functional projection of the Coordinator's WorkQueue into
 * present-tense and future-tense TimelineRecord instances. Imported by
 * the /Timeline endpoint at request time. Doesn't write anything; the
 * historical store handles persistence.
 *
 *   projectPresent(coordinator, now)
 *     → in-flight items (Dispatched / Running) projected as Phase=present.
 *
 *   projectFuture(coordinator, observer, now, futureLimitPerCapability)
 *     → predicted dispatch records for Pending / Queued / Assigned items,
 *       capped per-capability so a 5K-deep queue doesn't return 5K rows.
 *
 * Both functions emit records that share the wire shape with stored
 * TimelineRecords (At, EndAt, EventType, RunHash, ...) plus optional
 * future-only fields (PredictedAtIso, PredictionConfidence).
 *
 * @module Ultravisor-TimelineProjector
 */

const FUTURE_LIMIT_PER_CAPABILITY_DEFAULT = 32;

function projectPresent(pCoordinator, pNowIso)
{
	if (!pCoordinator || typeof pCoordinator.listWorkItems !== 'function') { return []; }
	let tmpItems = pCoordinator.listWorkItems();
	let tmpOut = [];
	for (let i = 0; i < tmpItems.length; i++)
	{
		let tmpI = tmpItems[i];
		if (!tmpI) continue;
		if (tmpI.Status !== 'Dispatched' && tmpI.Status !== 'Running') continue;
		let tmpAt = tmpI.DispatchedAt || tmpI.AssignedAt || tmpI.EnqueuedAt || pNowIso;
		// Present records are open-ended until the entity transitions
		// to a terminal state. The endpoint sets EndAt=now so range
		// queries treat them as overlapping the live window.
		tmpOut.push({
			Phase:         'present',
			At:            tmpAt,
			EndAt:         pNowIso,
			EventType:     'Running',
			RunHash:       tmpI.RunHash || tmpI.RunID || '',
			OperationHash: tmpI.OperationHash || '',
			WorkItemHash:  tmpI.WorkItemHash || '',
			Capability:    tmpI.Capability || '',
			Action:        tmpI.Action || '',
			BeaconID:      tmpI.AssignedBeaconID || '',
			Status:        tmpI.Status,
			DurationMs:    null,
			RawRefHash:    tmpI.WorkItemHash || ''
		});
	}
	return tmpOut;
}

function projectFuture(pCoordinator, pObserver, pNowIso, pLimitPerCap)
{
	if (!pCoordinator || typeof pCoordinator.listWorkItems !== 'function') { return []; }
	let tmpLimit = Number.isFinite(pLimitPerCap) && pLimitPerCap > 0
		? pLimitPerCap
		: FUTURE_LIMIT_PER_CAPABILITY_DEFAULT;

	let tmpItems = pCoordinator.listWorkItems();

	// Group pending items by capability. Sort each group by EnqueuedAt
	// asc so position-in-queue lines up with what the scheduler will
	// dispatch (priority would refine this; out of scope for the
	// projection's first pass — predictions are advisory).
	let tmpByCap = new Map();
	for (let i = 0; i < tmpItems.length; i++)
	{
		let tmpI = tmpItems[i];
		if (!tmpI) continue;
		if (tmpI.Status !== 'Pending' && tmpI.Status !== 'Queued' && tmpI.Status !== 'Assigned') continue;
		let tmpKey = tmpI.Capability || '_unspecified';
		if (!tmpByCap.has(tmpKey)) { tmpByCap.set(tmpKey, []); }
		tmpByCap.get(tmpKey).push(tmpI);
	}

	let tmpOut = [];
	let tmpNowMs = Date.parse(pNowIso) || Date.now();

	tmpByCap.forEach((pGroup, pCap) =>
	{
		pGroup.sort((pA, pB) =>
		{
			let tmpAEn = pA.EnqueuedAt || '';
			let tmpBEn = pB.EnqueuedAt || '';
			return tmpAEn < tmpBEn ? -1 : tmpAEn > tmpBEn ? 1 : 0;
		});

		let tmpStats = _capabilityDurationStats(pObserver, pCap);
		let tmpEligibleCount = _eligibleBeaconCount(pObserver, pCap);
		let tmpConfidence = _confidence(tmpStats, tmpEligibleCount);

		// Predicted dispatch for the i-th queued item ≈
		// now + ceil(i / eligibleSlots) * medianDurationMs.
		// If there are no eligible slots, the queue is structurally
		// blocked — emit records with PredictedAtIso=null and confidence=0.
		let tmpSlots = tmpEligibleCount > 0 ? tmpEligibleCount : 0;
		for (let i = 0; i < pGroup.length && i < tmpLimit; i++)
		{
			let tmpItem = pGroup[i];
			let tmpPredictedIso = null;
			if (tmpSlots > 0 && tmpStats.MedianMs > 0)
			{
				let tmpRoundsAhead = Math.floor(i / tmpSlots);
				let tmpPredictedMs = tmpNowMs + tmpRoundsAhead * tmpStats.MedianMs;
				tmpPredictedIso = new Date(tmpPredictedMs).toISOString();
			}
			tmpOut.push({
				Phase:                'future',
				At:                   pNowIso,
				EndAt:                tmpPredictedIso || pNowIso,
				EventType:            'Dispatch.Predicted',
				RunHash:              tmpItem.RunHash || tmpItem.RunID || '',
				OperationHash:        tmpItem.OperationHash || '',
				WorkItemHash:         tmpItem.WorkItemHash || '',
				Capability:           tmpItem.Capability || '',
				Action:               tmpItem.Action || '',
				BeaconID:             '',
				Status:               tmpItem.Status,
				DurationMs:           tmpStats.MedianMs > 0 ? tmpStats.MedianMs : null,
				PredictedAtIso:       tmpPredictedIso,
				PredictionConfidence: tmpSlots > 0 ? tmpConfidence : 0.0,
				RawRefHash:           tmpItem.WorkItemHash || ''
			});
		}
	});

	return tmpOut;
}

// ─────────────────────────────────────────────────────────────────────
// Internal helpers — pull duration samples + eligibility from the
// Observer. Tolerant of missing data: returns sensible defaults so
// projectFuture stays callable even before the Observer has any signal.
// ─────────────────────────────────────────────────────────────────────

function _capabilityDurationStats(pObserver, pCapability)
{
	if (!pObserver || typeof pObserver.getBeacons !== 'function')
	{
		return { Samples: 0, MedianMs: 0, P95Ms: 0 };
	}
	if (typeof pObserver.getCapabilityDurationStats === 'function')
	{
		return pObserver.getCapabilityDurationStats(pCapability)
			|| { Samples: 0, MedianMs: 0, P95Ms: 0 };
	}
	// Fallback: derive directly from the beacon records' RecentDurations.
	let tmpAll = [];
	let tmpBeacons = pObserver.getBeacons() || {};
	let tmpKeys = Object.keys(tmpBeacons);
	for (let i = 0; i < tmpKeys.length; i++)
	{
		let tmpRD = tmpBeacons[tmpKeys[i]] && tmpBeacons[tmpKeys[i]].RecentDurations;
		if (!tmpRD) continue;
		let tmpRDKeys = Object.keys(tmpRD);
		for (let j = 0; j < tmpRDKeys.length; j++)
		{
			if (tmpRDKeys[j].indexOf(pCapability + '/') !== 0) continue;
			let tmpArr = tmpRD[tmpRDKeys[j]];
			for (let k = 0; k < tmpArr.length; k++) { tmpAll.push(tmpArr[k]); }
		}
	}
	if (tmpAll.length === 0) { return { Samples: 0, MedianMs: 0, P95Ms: 0 }; }
	tmpAll.sort((pA, pB) => pA - pB);
	let tmpMid = Math.floor(tmpAll.length / 2);
	let tmpP95Idx = Math.min(tmpAll.length - 1, Math.floor(tmpAll.length * 0.95));
	return { Samples: tmpAll.length, MedianMs: tmpAll[tmpMid], P95Ms: tmpAll[tmpP95Idx] };
}

function _eligibleBeaconCount(pObserver, pCapability)
{
	if (!pObserver || typeof pObserver.getBeacons !== 'function') { return 0; }
	let tmpBeacons = pObserver.getBeacons() || {};
	let tmpKeys = Object.keys(tmpBeacons);
	let tmpCount = 0;
	for (let i = 0; i < tmpKeys.length; i++)
	{
		let tmpB = tmpBeacons[tmpKeys[i]];
		if (!tmpB) continue;
		if (tmpB.Liveness !== 'Alive' && tmpB.Liveness !== 'Suspect') continue;
		// Eligibility = capability match. Be tolerant of where the
		// capability list lives — older snapshots have it on top-level
		// .Capability; current ones may use Capabilities[].
		let tmpHasCap = false;
		if (tmpB.Capability === pCapability) { tmpHasCap = true; }
		if (!tmpHasCap && Array.isArray(tmpB.Capabilities)
			&& tmpB.Capabilities.indexOf(pCapability) >= 0) { tmpHasCap = true; }
		if (!tmpHasCap) continue;
		tmpCount += tmpB.MaxConcurrent || 1;
	}
	return tmpCount;
}

function _confidence(pStats, pEligibleCount)
{
	if (!pStats || pStats.Samples === 0) return 0.0;
	if (pEligibleCount === 0) return 0.0;
	let tmpBase;
	if (pStats.Samples < 3)       tmpBase = 0.0;
	else if (pStats.Samples < 10) tmpBase = 0.4 + (pStats.Samples - 3) * 0.05;  // 0.4–0.7
	else                          tmpBase = 0.8 + Math.min(0.2, (pStats.Samples - 10) * 0.01);
	if (tmpBase > 1.0) tmpBase = 1.0;
	return tmpBase;
}

module.exports = { projectPresent, projectFuture };
