const libCommandLineCommand = require('pict-service-commandlineutility').ServiceCommandLineCommand;

class UltravisorCommandScheduleTask extends libCommandLineCommand
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.options.CommandKeyword = 'schedule_task';
		this.options.Description = 'Add a task to the schedule.';

		this.options.CommandArguments.push({ Name: '<task_guid>', Description: 'The task to add to the schedule.' });

		this.options.CommandOptions.push({ Name: '-t, --type [event_schedule_type]', Description: 'The event schedule type (cron, daily, hourly, solver).', Default: 'cron' });
		this.options.CommandOptions.push({ Name: '-p, --parameters [event_schedule_parameters]', Description: 'The parameters for the schedule (e.g. the crontab entry or solver string).', Default: '' });

		this.options.Aliases.push('st');

		this.addCommand();
	}

	onRunAsync(fCallback)
	{
		let tmpTaskGUID = this.ArgumentString;
		let tmpType = this.CommandOptions.event_schedule_type || 'cron';
		let tmpParameters = this.CommandOptions.event_schedule_parameters || '';

		if (!tmpTaskGUID)
		{
			console.log(`Error: task_guid argument is required.`);
			return fCallback();
		}

		let tmpHypervisor = this.fable['Ultravisor-Hypervisor'];

		tmpHypervisor.scheduleTask(tmpTaskGUID, tmpType, tmpParameters,
			function (pError, pEntry)
			{
				if (pError)
				{
					console.log(`Error scheduling task: ${pError.message}`);
					return fCallback();
				}
				console.log(`Task ${tmpTaskGUID} scheduled successfully.`);
				console.log(`  Schedule GUID: ${pEntry.GUID}`);
				console.log(`  Cron Expression: ${pEntry.CronExpression}`);
				return fCallback();
			});
	}
}

module.exports = UltravisorCommandScheduleTask;