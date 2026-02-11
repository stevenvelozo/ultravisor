const libCommandLineCommand = require('pict-service-commandlineutility').ServiceCommandLineCommand;

class UltravisorCommandSingleTaskRun extends libCommandLineCommand
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.options.CommandKeyword = 'singletask';
		this.options.Description = 'Execute a single ultravisor task immediately, no matter what.';

		this.options.CommandArguments.push({ Name: '<task>', Description: 'The task(s) to run.' });
		this.options.CommandOptions.push({ Name: '-o, --operation [operation]', Description: 'The operation to scope the task(s) to.', Default: 'Default' });
		this.options.CommandOptions.push({ Name: '-d, --dry_run', Description: 'Dry run the task.', Default: false });

		this.options.Aliases.push('task');

		this.addCommand();
	}

	onRunAsync(fCallback)
	{
		let tmpTaskGUID = this.CommandArguments[0];

		if (!tmpTaskGUID)
		{
			console.log(`Error: task argument is required.`);
			return fCallback();
		}

		let tmpDryRun = this.CommandOptions.dry_run || false;

		if (tmpDryRun)
		{
			console.log(`[DRY RUN] Would execute task: ${tmpTaskGUID}`);
			return fCallback();
		}

		console.log(`Executing task: ${tmpTaskGUID}`);

		let tmpStateService = this.fable['Ultravisor-Hypervisor-State'];
		let tmpTaskService = this.fable['Ultravisor-Task'];

		tmpStateService.getTask(tmpTaskGUID,
			function (pError, pTask)
			{
				if (pError)
				{
					console.log(`Error: ${pError.message}`);
					return fCallback();
				}

				tmpTaskService.executeTask(pTask, {},
					function (pExecError, pResult)
					{
						if (pExecError)
						{
							console.log(`Execution error: ${pExecError.message}`);
							return fCallback();
						}

						console.log(`\nTask Result:`);
						console.log(`  Status: ${pResult.Status}`);
						console.log(`  Success: ${pResult.Success}`);
						console.log(`  Start: ${pResult.StartTime}`);
						console.log(`  Stop: ${pResult.StopTime}`);
						if (pResult.Output)
						{
							console.log(`  Output: ${pResult.Output.substring(0, 1000)}`);
						}
						return fCallback();
					});
			});
	}
}

module.exports = UltravisorCommandSingleTaskRun;