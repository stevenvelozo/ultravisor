/**
 * Ultravisor Task Helper — Beacon Dispatch
 *
 * Shared helper function for system-specific task types that dispatch
 * work to beacon workers.  Encapsulates the "enqueue to Beacon
 * Coordinator + return WaitingForInput" pattern.
 *
 * Usage (from a task config Execute function):
 *
 *   const beaconDispatch = require('../Ultravisor-TaskHelper-BeaconDispatch.cjs');
 *
 *   Execute: function(pTask, pResolvedSettings, pExecutionContext, fCallback)
 *   {
 *     beaconDispatch(pTask, {
 *       Capability: 'ContentSystem',
 *       Action: 'ReadFile',
 *       Settings: { FilePath: pResolvedSettings.FilePath },
 *       AffinityKey: pResolvedSettings.AffinityKey,
 *       TimeoutMs: pResolvedSettings.TimeoutMs
 *     }, pExecutionContext, fCallback);
 *   }
 */


/**
 * Get a named service from the Fable services map.
 */
function _getService(pTask, pTypeName)
{
	return pTask.fable.servicesMap[pTypeName]
		? Object.values(pTask.fable.servicesMap[pTypeName])[0]
		: null;
}


/**
 * Dispatch work to a beacon via the BeaconCoordinator.
 *
 * @param {object} pTask - The task instance (has pTask.fable, pTask.log)
 * @param {object} pWorkInfo - Work item description:
 *   {
 *     Capability: 'ContentSystem',
 *     Action: 'ReadFile',
 *     Settings: { FilePath: '/docs/README.md' },
 *     AffinityKey: '',       // optional
 *     TimeoutMs: 300000      // optional
 *   }
 * @param {object} pExecutionContext - Has RunHash, NodeHash, OperationHash
 * @param {function} fCallback - Standard task callback
 */
function beaconDispatch(pTask, pWorkInfo, pExecutionContext, fCallback)
{
	let tmpCoordinator = _getService(pTask, 'UltravisorBeaconCoordinator');

	if (!tmpCoordinator)
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { StdOut: 'BeaconCoordinator service not available.', Result: '', BeaconID: '' },
			Log: ['Beacon dispatch: BeaconCoordinator service not found.']
		});
	}

	// Check if any beacons are registered
	let tmpBeacons = tmpCoordinator.listBeacons();
	if (tmpBeacons.length === 0)
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { StdOut: 'No Beacon workers are registered.', Result: '', BeaconID: '' },
			Log: ['Beacon dispatch: no Beacon workers registered. Cannot dispatch work.']
		});
	}

	// Build work item
	let tmpWorkItemInfo = {
		RunHash: pExecutionContext.RunHash,
		NodeHash: pExecutionContext.NodeHash,
		OperationHash: pExecutionContext.OperationHash,
		Capability: pWorkInfo.Capability || 'Unknown',
		Action: pWorkInfo.Action || '',
		Settings: pWorkInfo.Settings || {},
		AffinityKey: pWorkInfo.AffinityKey || '',
		TimeoutMs: pWorkInfo.TimeoutMs || 300000
	};

	// Enqueue the work item
	let tmpWorkItem = tmpCoordinator.enqueueWorkItem(tmpWorkItemInfo);

	pTask.log.info(`Beacon dispatch [${pWorkInfo.Capability}/${pWorkInfo.Action}]: enqueued [${tmpWorkItem.WorkItemHash}]` +
		(tmpWorkItemInfo.AffinityKey ? ` with affinity [${tmpWorkItemInfo.AffinityKey}]` : ''));

	// Pause execution — the BeaconCoordinator will call resumeOperation when the beacon reports back
	return fCallback(null, {
		WaitingForInput: true,
		ResumeEventName: 'Complete',
		PromptMessage: `Waiting for Beacon (${pWorkInfo.Capability}/${pWorkInfo.Action})`,
		OutputAddress: '',
		Outputs: {},
		Log: [
			`Beacon dispatch: dispatched as [${tmpWorkItem.WorkItemHash}].`,
			`Capability: ${tmpWorkItemInfo.Capability}, Action: ${tmpWorkItemInfo.Action}`
		]
	});
}

module.exports = beaconDispatch;
