const libCommandLineCommand = require('pict-service-commandlineutility').ServiceCommandLineCommand;

class UltravisorCommandSingleOperationRun extends libCommandLineCommand
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.options.CommandKeyword = 'singleoperation';
		this.options.Description = 'Execute a single ultravisor operation immediately, no matter what.';

		this.options.CommandArguments.push({ Name: '<operation>', Description: 'The operation(s) to run.' });
		this.options.CommandOptions.push({ Name: '-d, --dry_run', Description: 'Dry run the task.', Default: false });

		this.options.Aliases.push('operation');

		this.addCommand();
	}

	onRunAsync(fCallback)
	{
		let tmpOperationGUID = this.CommandArguments[0];

		if (!tmpOperationGUID)
		{
			console.log(`Error: operation argument is required.`);
			return fCallback();
		}

		let tmpDryRun = this.CommandOptions.dry_run || false;

		if (tmpDryRun)
		{
			console.log(`[DRY RUN] Would execute operation: ${tmpOperationGUID}`);
			return fCallback();
		}

		console.log(`Executing operation: ${tmpOperationGUID}`);

		let tmpStateService = this.fable['Ultravisor-Hypervisor-State'];
		let tmpOperationService = this.fable['Ultravisor-Operation'];

		tmpStateService.getOperation(tmpOperationGUID,
			function (pError, pOperation)
			{
				if (pError)
				{
					console.log(`Error: ${pError.message}`);
					return fCallback();
				}

				tmpOperationService.executeOperation(pOperation,
					function (pExecError, pManifest)
					{
						if (pExecError)
						{
							console.log(`Execution error: ${pExecError.message}`);
							return fCallback();
						}

						console.log(`\nOperation Result:`);
						console.log(`  Status: ${pManifest.Status}`);
						console.log(`  Success: ${pManifest.Success}`);
						console.log(`  Start: ${pManifest.StartTime}`);
						console.log(`  Stop: ${pManifest.StopTime}`);
						console.log(`  Tasks Executed: ${pManifest.TaskResults.length}`);
						console.log(`  Summary: ${pManifest.Summary}`);
						return fCallback();
					});
			});
	}
}

module.exports = UltravisorCommandSingleOperationRun;