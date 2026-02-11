const libCommandLineCommand = require('pict-service-commandlineutility').ServiceCommandLineCommand;

class UltravisorCommandScheduleOperation extends libCommandLineCommand
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.options.CommandKeyword = 'schedule_operation';
		this.options.Description = 'Add an operation to the schedule.';

		this.options.CommandArguments.push({ Name: '<operation_guid>', Description: 'The operation to add to the schedule.' });

		this.options.CommandOptions.push({ Name: '-t, --type [event_schedule_type]', Description: 'The event schedule type (cron, daily, hourly, solver).', Default: 'cron' });
		this.options.CommandOptions.push({ Name: '-p, --parameters [event_schedule_parameters]', Description: 'The parameters for the schedule (e.g. the crontab entry or solver string).', Default: '' });

		this.options.Aliases.push('so');

		this.addCommand();
	}

	onRunAsync(fCallback)
	{
		let tmpOperationGUID = this.CommandArguments[0];
		let tmpType = this.CommandOptions.event_schedule_type || 'cron';
		let tmpParameters = this.CommandOptions.event_schedule_parameters || '';

		if (!tmpOperationGUID)
		{
			console.log(`Error: operation_guid argument is required.`);
			return fCallback();
		}

		let tmpHypervisor = this.fable['Ultravisor-Hypervisor'];

		tmpHypervisor.scheduleOperation(tmpOperationGUID, tmpType, tmpParameters,
			function (pError, pEntry)
			{
				if (pError)
				{
					console.log(`Error scheduling operation: ${pError.message}`);
					return fCallback();
				}
				console.log(`Operation ${tmpOperationGUID} scheduled successfully.`);
				console.log(`  Schedule GUID: ${pEntry.GUID}`);
				console.log(`  Cron Expression: ${pEntry.CronExpression}`);
				return fCallback();
			});
	}
}

module.exports = UltravisorCommandScheduleOperation;