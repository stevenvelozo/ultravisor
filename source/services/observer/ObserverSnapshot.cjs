/**
 * Ultravisor Observer Snapshot Projection
 *
 * Pure read-only projection of the Observer's internal maps into the
 * AI-ready wire shape served by GET /Observer/Snapshot.
 *
 * The wire shape (per the Phase 3 plan):
 *   {
 *     SchemaVersion, GeneratedAt, HubInstanceID,
 *     Beacons:        { [BeaconID]: BeaconRecord },
 *     Operations:     { [RunHash]: OperationRecord },
 *     UpcomingQueue:  [ WorkItemRecord, ... ],   // sorted Priority desc, EnqueuedAt asc
 *     RecentTerminal: [ TerminalRecord, ... ],   // sorted TerminatedAt desc
 *     Policy:         { ...thresholds }
 *   }
 *
 * @module ObserverSnapshot
 */

const SCHEMA_VERSION = '1';

function projectBeacon(pBeaconRecord)
{
	if (!pBeaconRecord) return null;
	return {
		BeaconID:                pBeaconRecord.BeaconID,
		Name:                    pBeaconRecord.Name,
		Capabilities:            pBeaconRecord.Capabilities || [],
		MaxConcurrent:           pBeaconRecord.MaxConcurrent || 1,
		Liveness:                pBeaconRecord.Liveness || 'Alive',
		LivenessReason:          pBeaconRecord.LivenessReason || null,
		LivenessTransitionAt:    pBeaconRecord.LivenessTransitionAt || null,
		LastHeartbeatAt:         pBeaconRecord.LastHeartbeatAt || null,
		RegisteredAt:            pBeaconRecord.RegisteredAt || null,
		WSConnected:             !!pBeaconRecord.WSConnected,
		CurrentWorkItems:        Array.isArray(pBeaconRecord.CurrentWorkItems)
		                         ? pBeaconRecord.CurrentWorkItems.slice()
		                         : [],
		RecentDurations:         _projectRecentDurations(pBeaconRecord.RecentDurations)
	};
}

function _projectRecentDurations(pMap)
{
	if (!pMap || typeof pMap !== 'object') return {};
	let tmpOut = {};
	let tmpKeys = Object.keys(pMap);
	for (let i = 0; i < tmpKeys.length; i++)
	{
		let tmpSamples = pMap[tmpKeys[i]];
		tmpOut[tmpKeys[i]] = Array.isArray(tmpSamples) ? tmpSamples.slice(-25) : [];
	}
	return tmpOut;
}

function projectOperation(pRun, pObserver)
{
	if (!pRun) return null;
	let tmpHash = pRun.Hash || pRun.RunHash;
	let tmpStart = pRun.StartTime ? Date.parse(pRun.StartTime) : null;
	let tmpStop = pRun.StopTime ? Date.parse(pRun.StopTime) : null;
	let tmpElapsed = pRun.ElapsedMs;
	if (tmpElapsed == null && tmpStart)
	{
		tmpElapsed = (tmpStop || Date.now()) - tmpStart;
	}

	let tmpActive = [];
	let tmpCompleted = [];
	let tmpWaitingFor = null;
	if (pObserver && typeof pObserver.getWorkItemsForRun === 'function')
	{
		let tmpItems = pObserver.getWorkItemsForRun(tmpHash);
		for (let i = 0; i < tmpItems.length; i++)
		{
			let tmpItem = tmpItems[i];
			if (!tmpItem) continue;
			let tmpEntry = {
				WorkItemHash: tmpItem.WorkItemHash,
				NodeHash: tmpItem.NodeHash || null,
				Capability: tmpItem.Capability || null,
				Action: tmpItem.Action || null,
				Status: tmpItem.Status || null,
				BeaconID: tmpItem.AssignedBeaconID || null
			};
			if (tmpItem.Status === 'Completed' || tmpItem.Status === 'Complete')
			{
				tmpCompleted.push(tmpEntry);
			}
			else if (tmpItem.Status === 'Dispatched' || tmpItem.Status === 'Running')
			{
				tmpActive.push(tmpEntry);
				if (!tmpWaitingFor)
				{
					tmpWaitingFor = `beacon ${tmpItem.AssignedBeaconID || '?'} ${tmpItem.Capability || ''}/${tmpItem.Action || ''}`;
				}
			}
			else if (tmpItem.Status === 'Pending' || tmpItem.Status === 'Queued' || tmpItem.Status === 'Assigned')
			{
				tmpActive.push(tmpEntry);
				if (!tmpWaitingFor)
				{
					tmpWaitingFor = `capability ${tmpItem.Capability || '?'}/${tmpItem.Action || ''}`;
				}
			}
		}
	}

	return {
		RunHash:               tmpHash,
		OperationHash:         pRun.OperationHash || null,
		OperationName:         pRun.OperationName || null,
		Status:                pRun.Status || null,
		StartTime:             pRun.StartTime || null,
		StopTime:              pRun.StopTime || null,
		ElapsedMs:             tmpElapsed || 0,
		ActiveNodes:           tmpActive,
		CompletedNodes:        tmpCompleted,
		RemainingNodeCount:    tmpActive.length,
		WaitingFor:            tmpWaitingFor,
		ExpectedCompletionAt:  null
	};
}

function projectUpcoming(pItem, pBeaconLookup, pPolicyModule, pPolicy)
{
	if (!pItem) return null;
	let tmpEnqueuedMs = pItem.EnqueuedAt ? Date.parse(pItem.EnqueuedAt) : Date.now();
	let tmpAge = Math.max(0, Date.now() - tmpEnqueuedMs);

	let tmpClassification = { BlockingReason: null, EligibleBeacons: [] };
	if (pPolicyModule && typeof pPolicyModule.classifyUpcoming === 'function')
	{
		let tmpBeaconList = [];
		let tmpKeys = Object.keys(pBeaconLookup || {});
		for (let i = 0; i < tmpKeys.length; i++) tmpBeaconList.push(pBeaconLookup[tmpKeys[i]]);
		tmpClassification = pPolicyModule.classifyUpcoming(pItem, tmpBeaconList);
	}

	return {
		WorkItemHash:    pItem.WorkItemHash,
		RunHash:         pItem.RunHash || pItem.RunID || null,
		Capability:      pItem.Capability || null,
		Action:          pItem.Action || null,
		Priority:        pItem.Priority || 0,
		EnqueuedAt:      pItem.EnqueuedAt || null,
		AgeMs:           tmpAge,
		Status:          pItem.Status || null,
		EligibleBeacons: tmpClassification.EligibleBeacons || [],
		BlockingReason:  tmpClassification.BlockingReason || null
	};
}

function projectTerminal(pEntry)
{
	if (!pEntry) return null;
	return Object.assign({}, pEntry);
}

function buildSnapshot(pObserver)
{
	if (!pObserver) return null;

	let tmpPolicyModule = pObserver.getPolicyModule();
	let tmpPolicy = pObserver.getPolicy();

	// --- Beacons ---
	let tmpBeaconRecords = pObserver.getBeacons();
	let tmpBeacons = {};
	let tmpBeaconKeys = Object.keys(tmpBeaconRecords);
	for (let i = 0; i < tmpBeaconKeys.length; i++)
	{
		let tmpRec = tmpBeaconRecords[tmpBeaconKeys[i]];
		tmpBeacons[tmpRec.BeaconID] = projectBeacon(tmpRec);
	}

	// --- Operations ---
	let tmpRuns = pObserver.getOperations();
	let tmpOperations = {};
	let tmpRunKeys = Object.keys(tmpRuns);
	for (let i = 0; i < tmpRunKeys.length; i++)
	{
		let tmpRec = tmpRuns[tmpRunKeys[i]];
		let tmpProj = projectOperation(tmpRec, pObserver);
		if (tmpProj && tmpProj.RunHash)
		{
			tmpOperations[tmpProj.RunHash] = tmpProj;
		}
	}

	// --- Upcoming queue (Pending / Queued / Assigned) ---
	let tmpQueue = pObserver.getWorkQueue();
	let tmpUpcomingArr = [];
	let tmpQKeys = Object.keys(tmpQueue);
	for (let i = 0; i < tmpQKeys.length; i++)
	{
		let tmpItem = tmpQueue[tmpQKeys[i]];
		if (!tmpItem) continue;
		if (tmpItem.Status !== 'Queued' && tmpItem.Status !== 'Pending' && tmpItem.Status !== 'Assigned') continue;
		tmpUpcomingArr.push(projectUpcoming(tmpItem, tmpBeacons, tmpPolicyModule, tmpPolicy));
	}
	tmpUpcomingArr.sort(function (pA, pB)
	{
		let tmpAPri = pA.Priority || 0;
		let tmpBPri = pB.Priority || 0;
		if (tmpAPri !== tmpBPri) return tmpBPri - tmpAPri;
		let tmpATs = pA.EnqueuedAt || '';
		let tmpBTs = pB.EnqueuedAt || '';
		if (tmpATs < tmpBTs) return -1;
		if (tmpATs > tmpBTs) return 1;
		return 0;
	});

	// --- Recent terminal ring ---
	let tmpTerminal = pObserver.getRecentTerminal();
	let tmpTerminalArr = [];
	for (let i = 0; i < tmpTerminal.length; i++)
	{
		tmpTerminalArr.push(projectTerminal(tmpTerminal[i]));
	}
	tmpTerminalArr.sort(function (pA, pB)
	{
		let tmpATs = (pA && pA.TerminatedAt) || '';
		let tmpBTs = (pB && pB.TerminatedAt) || '';
		if (tmpATs > tmpBTs) return -1;
		if (tmpATs < tmpBTs) return 1;
		return 0;
	});

	return {
		SchemaVersion:  SCHEMA_VERSION,
		GeneratedAt:    new Date().toISOString(),
		HubInstanceID:  pObserver.getHubInstanceID() || '',
		Beacons:        tmpBeacons,
		Operations:     tmpOperations,
		UpcomingQueue:  tmpUpcomingArr,
		RecentTerminal: tmpTerminalArr,
		Policy:         tmpPolicy
	};
}

module.exports = {
	SCHEMA_VERSION,
	projectBeacon,
	projectOperation,
	projectUpcoming,
	projectTerminal,
	buildSnapshot
};
