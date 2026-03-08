const libCommandLineCommand = require('pict-service-commandlineutility').ServiceCommandLineCommand;

class UltravisorCommandSingleTaskRun extends libCommandLineCommand
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.options.CommandKeyword = 'singletask';
		this.options.Description = 'Execute a single ultravisor task immediately, no matter what.';

		this.options.CommandArguments.push({ Name: '<task>', Description: 'The task hash to run.' });
		this.options.CommandOptions.push({ Name: '-d, --dry_run', Description: 'Dry run the task.', Default: false });

		this.options.Aliases.push('task');

		this.addCommand();
	}

	_getService(pTypeName)
	{
		return this.fable.servicesMap[pTypeName]
			? Object.values(this.fable.servicesMap[pTypeName])[0]
			: null;
	}

	onRunAsync(fCallback)
	{
		let tmpTaskHash = this.ArgumentString;

		if (!tmpTaskHash)
		{
			console.log(`Error: task argument is required.`);
			return fCallback();
		}

		let tmpDryRun = this.CommandOptions.dry_run || false;

		if (tmpDryRun)
		{
			console.log(`[DRY RUN] Would execute task: ${tmpTaskHash}`);
			return fCallback();
		}

		console.log(`Executing task: ${tmpTaskHash}`);

		let tmpStateService = this._getService('UltravisorHypervisorState');
		let tmpEngine = this._getService('UltravisorExecutionEngine');

		tmpStateService.getTaskDefinition(tmpTaskHash,
			function (pError, pTaskDef)
			{
				if (pError)
				{
					console.log(`Error: ${pError.message}`);
					return fCallback();
				}

				// Wrap single task in a minimal operation graph and execute
				let tmpAdHocOperation = {
					Hash: `ADHOC-${pTaskDef.Hash}`,
					Name: `Ad-hoc: ${pTaskDef.Name || pTaskDef.Hash}`,
					Graph:
					{
						Nodes:
						[
							{ Hash: 'start-node', Type: 'start', X: 0, Y: 100 },
							{ Hash: pTaskDef.Hash, Type: pTaskDef.Type, DefinitionHash: pTaskDef.Type, Settings: pTaskDef.Settings || {}, X: 200, Y: 100 },
							{ Hash: 'end-node', Type: 'end', X: 400, Y: 100 }
						],
						Connections:
						[
							{
								SourceNodeHash: 'start-node',
								SourcePortHash: 'start-node-eo-Start',
								TargetNodeHash: pTaskDef.Hash,
								TargetPortHash: pTaskDef.Hash + '-ei-Execute',
								ConnectionType: 'Event'
							},
							{
								SourceNodeHash: pTaskDef.Hash,
								SourcePortHash: pTaskDef.Hash + '-eo-Complete',
								TargetNodeHash: 'end-node',
								TargetPortHash: 'end-node-ei-Finish',
								ConnectionType: 'Event'
							}
						],
						ViewState: {}
					}
				};

				tmpEngine.executeOperation(tmpAdHocOperation,
					function (pExecError, pContext)
					{
						if (pExecError)
						{
							console.log(`Execution error: ${pExecError.message}`);
							return fCallback();
						}

						console.log(`\nTask Result:`);
						console.log(`  Status: ${pContext.Status}`);
						console.log(`  Start: ${pContext.StartTime}`);
						console.log(`  Stop: ${pContext.StopTime}`);
						console.log(`  Elapsed: ${pContext.ElapsedMs}ms`);
						if (pContext.TaskOutputs && pContext.TaskOutputs[pTaskDef.Hash])
						{
							console.log(`  Output: ${JSON.stringify(pContext.TaskOutputs[pTaskDef.Hash]).substring(0, 1000)}`);
						}
						if (pContext.Errors && pContext.Errors.length > 0)
						{
							console.log(`  Errors: ${pContext.Errors.length}`);
						}
						return fCallback();
					});
			});
	}
}

module.exports = UltravisorCommandSingleTaskRun;
