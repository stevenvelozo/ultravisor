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
		return fCallback();
	}
}

module.exports = UltravisorCommandSingleOperationRun;