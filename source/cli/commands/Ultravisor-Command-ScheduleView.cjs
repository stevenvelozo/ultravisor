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
		let tmpHypervisor = this.fable['Ultravisor-Hypervisor'];
		let tmpSchedule = tmpHypervisor.getSchedule();

		if (tmpSchedule.length === 0)
		{
			console.log(`No schedule entries found.`);
			console.log(`Use 'schedule_task' or 'schedule_operation' to add entries.`);
			return fCallback();
		}

		console.log(`\n=== Ultravisor Schedule (${tmpSchedule.length} entries) ===\n`);

		for (let i = 0; i < tmpSchedule.length; i++)
		{
			let tmpEntry = tmpSchedule[i];
			let tmpStatus = tmpEntry.Active ? 'ACTIVE' : 'INACTIVE';
			console.log(`  [${tmpStatus}] ${tmpEntry.TargetType}: ${tmpEntry.TargetGUID}`);
			console.log(`           Schedule: ${tmpEntry.ScheduleType} (${tmpEntry.CronExpression})`);
			console.log(`           GUID: ${tmpEntry.GUID}`);
			console.log(``);
		}

		return fCallback();
	}
}

module.exports = UltravisorCommandScheduleView;