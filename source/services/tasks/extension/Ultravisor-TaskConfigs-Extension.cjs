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
		Definition: require('./definitions/beacon-dispatch.json'),
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

			// Build work item settings from resolved settings
			let tmpSettings = {
				Command: pResolvedSettings.Command || '',
				Parameters: pResolvedSettings.Parameters || '',
				InputData: pResolvedSettings.InputData || ''
			};

			// Resolve universal addresses in InputData (JSON string).
			// Addresses like >retold-remote/File/path become concrete
			// SourceURL values so the beacon executor can download files.
			if (tmpSettings.InputData)
			{
				try
				{
					let tmpInputObj = JSON.parse(tmpSettings.InputData);
					let tmpResolved = tmpCoordinator.scanAndResolveAddresses(tmpInputObj);

					for (let j = 0; j < tmpResolved.length; j++)
					{
						let tmpAddr = tmpResolved[j];
						// Replace the address with the filename in InputData
						tmpInputObj[tmpAddr.Key] = tmpAddr.Resolved.Filename;
						// Set the SourceURL for the beacon executor to download
						tmpSettings.SourceURL = tmpAddr.Resolved.URL;
						tmpSettings.SourceFilename = tmpAddr.Resolved.Filename;
					}

					// Pass all InputData fields as top-level Settings
					// so the provider receives them directly
					let tmpInputKeys = Object.keys(tmpInputObj);
					for (let k = 0; k < tmpInputKeys.length; k++)
					{
						tmpSettings[tmpInputKeys[k]] = tmpInputObj[tmpInputKeys[k]];
					}
				}
				catch (pParseError)
				{
					// InputData is not valid JSON — check if the raw string is an address
					if (tmpSettings.InputData.charAt(0) === '>')
					{
						let tmpResolved = tmpCoordinator.resolveUniversalAddress(tmpSettings.InputData);
						if (tmpResolved)
						{
							tmpSettings.SourceURL = tmpResolved.URL;
							tmpSettings.SourceFilename = tmpResolved.Filename;
						}
					}
				}
			}

			// Also check for OutputFile to enable base64 return
			if (tmpSettings.OutputFile)
			{
				tmpSettings.OutputFilename = tmpSettings.OutputFile;
				tmpSettings.ReturnOutputAsBase64 = true;
			}

			let tmpWorkItemInfo = {
				RunHash: pExecutionContext.RunHash,
				NodeHash: pExecutionContext.NodeHash,
				OperationHash: pExecutionContext.OperationHash,
				Capability: pResolvedSettings.RemoteCapability || 'Shell',
				Action: pResolvedSettings.RemoteAction || 'Execute',
				Settings: tmpSettings,
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
