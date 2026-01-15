const libCommandLineCommand = require('pict-service-commandlineutility').ServiceCommandLineCommand;

class UltravisorCommandScheduleView extends libCommandLineCommand
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.options.CommandKeyword = 'schedule';
		this.options.Description = 'View the schedule.';

		this.options.CommandOptions.push({ Name: '-f, --format [schedule_format]', Description: 'The visualization format (day, week, month) to output.', Default: 'day' });

		this.options.Aliases.push('cal');

		this.addCommand();
	}

	onRunAsync(fCallback)
	{
		return fCallback();
	}
}

module.exports = UltravisorCommandScheduleView;