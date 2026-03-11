/**
 * Task configurations for the "Extension" capability.
 *
 * Contains:
 *   - beacon-dispatch   — Dispatches work to a remote Beacon worker node.
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


module.exports =
[
	// ── beacon-dispatch ────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'beacon-dispatch',
			Type: 'beacon-dispatch',
			Name: 'Beacon Dispatch',
			Description: 'Dispatches work to a remote Beacon worker node. The task pauses until the Beacon completes execution and reports results.',
			Category: 'extension',
			Capability: 'Extension',
			Action: 'Dispatch',
			Tier: 'Extension',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Complete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'RemoteCapability', DataType: 'String', Required: true, Description: 'Required capability on the Beacon (e.g. Shell, FileSystem)' },
				{ Name: 'RemoteAction', DataType: 'String', Required: false, Description: 'Specific action within the capability (e.g. Execute, Read)' },
				{ Name: 'Command', DataType: 'String', Required: false, Description: 'Shell command to execute on the Beacon' },
				{ Name: 'Parameters', DataType: 'String', Required: false, Description: 'Command-line parameters' },
				{ Name: 'AffinityKey', DataType: 'String', Required: false, Description: 'Key for worker affinity routing (same key → same Beacon)' },
				{ Name: 'TimeoutMs', DataType: 'Number', Required: false, Description: 'Work item timeout in milliseconds (default: 300000)' },
				{ Name: 'InputData', DataType: 'String', Required: false, Description: 'JSON data to pass to the Beacon worker' }
			],
			StateOutputs: [
				{ Name: 'StdOut', DataType: 'String', Description: 'Standard output from the Beacon execution' },
				{ Name: 'Result', DataType: 'String', Description: 'Result data from the Beacon' },
				{ Name: 'ExitCode', DataType: 'Number', Description: 'Exit code of the remote command' },
				{ Name: 'BeaconID', DataType: 'String', Description: 'ID of the Beacon that executed the work' }
			],
			DefaultSettings: { RemoteCapability: 'Shell', RemoteAction: 'Execute', TimeoutMs: 300000 }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpCoordinator = _getService(pTask, 'UltravisorBeaconCoordinator');

			if (!tmpCoordinator)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { StdOut: 'BeaconCoordinator service not available.', ExitCode: -1, Result: '', BeaconID: '' },
					Log: ['Beacon Dispatch: BeaconCoordinator service not found.']
				});
			}

			// Check if any Beacons are registered
			let tmpBeacons = tmpCoordinator.listBeacons();
			if (tmpBeacons.length === 0)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { StdOut: 'No Beacon workers are registered.', ExitCode: -1, Result: '', BeaconID: '' },
					Log: ['Beacon Dispatch: no Beacon workers registered. Cannot dispatch work.']
				});
			}

			// Build work item from resolved settings
			let tmpWorkItemInfo = {
				RunHash: pExecutionContext.RunHash,
				NodeHash: pExecutionContext.NodeHash,
				OperationHash: pExecutionContext.OperationHash,
				Capability: pResolvedSettings.RemoteCapability || 'Shell',
				Action: pResolvedSettings.RemoteAction || 'Execute',
				Settings: {
					Command: pResolvedSettings.Command || '',
					Parameters: pResolvedSettings.Parameters || '',
					InputData: pResolvedSettings.InputData || ''
				},
				AffinityKey: pResolvedSettings.AffinityKey || '',
				TimeoutMs: pResolvedSettings.TimeoutMs || 300000
			};

			// Enqueue the work item
			let tmpWorkItem = tmpCoordinator.enqueueWorkItem(tmpWorkItemInfo);

			pTask.log.info(`Beacon Dispatch: enqueued work item [${tmpWorkItem.WorkItemHash}] for capability [${tmpWorkItemInfo.Capability}/${tmpWorkItemInfo.Action}]` +
				(tmpWorkItemInfo.AffinityKey ? ` with affinity [${tmpWorkItemInfo.AffinityKey}]` : ''));

			// Pause execution — the BeaconCoordinator will call resumeOperation when the Beacon reports back
			return fCallback(null, {
				WaitingForInput: true,
				ResumeEventName: 'Complete',
				PromptMessage: `Waiting for Beacon worker (${tmpWorkItemInfo.Capability}/${tmpWorkItemInfo.Action})`,
				OutputAddress: '',
				Outputs: {},
				Log: [
					`Beacon Dispatch: dispatched to work queue as [${tmpWorkItem.WorkItemHash}].`,
					`Capability: ${tmpWorkItemInfo.Capability}, Action: ${tmpWorkItemInfo.Action}`,
					tmpWorkItemInfo.AffinityKey ? `Affinity: ${tmpWorkItemInfo.AffinityKey}` : 'No affinity key',
					tmpWorkItemInfo.Settings.Command ? `Command: ${tmpWorkItemInfo.Settings.Command} ${tmpWorkItemInfo.Settings.Parameters}` : ''
				].filter(Boolean)
			});
		}
	}
];
