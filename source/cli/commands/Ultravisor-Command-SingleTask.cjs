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
		return fCallback();
	}
}

module.exports = UltravisorCommandSingleTaskRun;