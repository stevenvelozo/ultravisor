const libCommandLineCommand = require('pict-service-commandlineutility').ServiceCommandLineCommand;

class UltravisorCommandSingleOperationRun extends libCommandLineCommand
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.options.CommandKeyword = 'singleoperation';
		this.options.Description = 'Execute a single ultravisor operation immediately, no matter what.';

		this.options.CommandArguments.push({ Name: '<operation>', Description: 'The operation hash to run.' });
		this.options.CommandOptions.push({ Name: '-d, --dry_run', Description: 'Dry run the operation.', Default: false });

		this.options.Aliases.push('operation');

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
		let tmpOperationHash = this.ArgumentString;

		if (!tmpOperationHash)
		{
			console.log(`Error: operation argument is required.`);
			return fCallback();
		}

		let tmpDryRun = this.CommandOptions.dry_run || false;

		if (tmpDryRun)
		{
			console.log(`[DRY RUN] Would execute operation: ${tmpOperationHash}`);
			return fCallback();
		}

		console.log(`Executing operation: ${tmpOperationHash}`);

		let tmpStateService = this._getService('UltravisorHypervisorState');
		let tmpEngine = this._getService('UltravisorExecutionEngine');

		tmpStateService.getOperation(tmpOperationHash,
			function (pError, pOperation)
			{
				if (pError)
				{
					console.log(`Error: ${pError.message}`);
					return fCallback();
				}

				tmpEngine.executeOperation(pOperation,
					function (pExecError, pContext)
					{
						if (pExecError)
						{
							console.log(`Execution error: ${pExecError.message}`);
							return fCallback();
						}

						console.log(`\nOperation Result:`);
						console.log(`  Status: ${pContext.Status}`);
						console.log(`  Start: ${pContext.StartTime}`);
						console.log(`  Stop: ${pContext.StopTime}`);
						console.log(`  Elapsed: ${pContext.ElapsedMs}ms`);
						let tmpTaskCount = pContext.TaskManifests ? Object.keys(pContext.TaskManifests).length : 0;
						console.log(`  Tasks Executed: ${tmpTaskCount}`);
						if (pContext.Errors && pContext.Errors.length > 0)
						{
							console.log(`  Errors: ${pContext.Errors.length}`);
						}
						return fCallback();
					});
			});
	}
}

module.exports = UltravisorCommandSingleOperationRun;
