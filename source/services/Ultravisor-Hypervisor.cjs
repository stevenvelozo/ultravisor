const libPictService = require(`pict-serviceproviderbase`);

const libCron = require('cron');

class UltravisorHypervisor extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.CronJob = libCron.CronJob;

		this._Schedule = [];
		this._Running = false;
	}

	get schedule()
	{
		return this.getSchedule();
	}

	getSchedule()
	{
		return this._Schedule;
	}

	/**
	 * Add a task to the schedule.
	 *
	 * @param {string} pTaskGUID - The task GUID to schedule.
	 * @param {string} pType - Schedule type (cron, daily, hourly).
	 * @param {string} pParameters - Schedule parameters (e.g. cron expression).
	 * @param {function} fCallback - Callback.
	 */
	scheduleTask(pTaskGUID, pType, pParameters, fCallback)
	{
		let tmpScheduleEntry = {
			GUID: `sched-task-${pTaskGUID}-${Date.now()}`,
			TargetType: 'Task',
			TargetGUID: pTaskGUID,
			ScheduleType: pType || 'cron',
			Parameters: pParameters || '0 * * * *',
			CronExpression: this._resolveScheduleExpression(pType, pParameters),
			Active: false,
			CreatedAt: new Date().toISOString()
		};

		this._Schedule.push(tmpScheduleEntry);
		this.log.info(`Ultravisor Hypervisor: scheduled task ${pTaskGUID} as ${tmpScheduleEntry.ScheduleType} (${tmpScheduleEntry.CronExpression})`);

		return fCallback(null, tmpScheduleEntry);
	}

	/**
	 * Add an operation to the schedule.
	 *
	 * @param {string} pOperationGUID - The operation GUID to schedule.
	 * @param {string} pType - Schedule type (cron, daily, hourly).
	 * @param {string} pParameters - Schedule parameters.
	 * @param {function} fCallback - Callback.
	 */
	scheduleOperation(pOperationGUID, pType, pParameters, fCallback)
	{
		let tmpScheduleEntry = {
			GUID: `sched-op-${pOperationGUID}-${Date.now()}`,
			TargetType: 'Operation',
			TargetGUID: pOperationGUID,
			ScheduleType: pType || 'cron',
			Parameters: pParameters || '0 * * * *',
			CronExpression: this._resolveScheduleExpression(pType, pParameters),
			Active: false,
			CreatedAt: new Date().toISOString()
		};

		this._Schedule.push(tmpScheduleEntry);
		this.log.info(`Ultravisor Hypervisor: scheduled operation ${pOperationGUID} as ${tmpScheduleEntry.ScheduleType} (${tmpScheduleEntry.CronExpression})`);

		return fCallback(null, tmpScheduleEntry);
	}

	/**
	 * Resolve a schedule type and parameters into a cron expression.
	 */
	_resolveScheduleExpression(pType, pParameters)
	{
		let tmpType = (pType || 'cron').toLowerCase();

		switch (tmpType)
		{
			case 'daily':
				// Default to midnight, or use the parameters as a time
				return pParameters || '0 0 * * *';
			case 'hourly':
				return pParameters || '0 * * * *';
			case 'cron':
			default:
				return pParameters || '0 * * * *';
		}
	}

	/**
	 * Start all scheduled jobs via the cron event service.
	 */
	startSchedule(fCallback)
	{
		let tmpCronService = this.fable['Ultravisor-Hypervisor-Event-Cron'];
		let tmpTaskService = this.fable['Ultravisor-Task'];
		let tmpOperationService = this.fable['Ultravisor-Operation'];
		let tmpStateService = this.fable['Ultravisor-Hypervisor-State'];

		this._Running = true;

		for (let i = 0; i < this._Schedule.length; i++)
		{
			let tmpEntry = this._Schedule[i];

			if (tmpEntry.Active)
			{
				continue;
			}

			tmpEntry.Active = true;

			tmpCronService.start(tmpEntry,
				(pScheduleEntry) =>
				{
					// On tick, execute the target
					if (pScheduleEntry.TargetType === 'Task')
					{
						tmpStateService.getTask(pScheduleEntry.TargetGUID,
							(pError, pTask) =>
							{
								if (pError)
								{
									this.log.error(`Ultravisor Hypervisor: scheduled task ${pScheduleEntry.TargetGUID} not found: ${pError.message}`);
									return;
								}
								tmpTaskService.executeTask(pTask, {},
									(pTaskError, pResult) =>
									{
										if (pTaskError)
										{
											this.log.error(`Ultravisor Hypervisor: scheduled task execution error: ${pTaskError.message}`);
										}
										else
										{
											this.log.info(`Ultravisor Hypervisor: scheduled task ${pScheduleEntry.TargetGUID} completed: ${pResult.Status}`);
										}
									});
							});
					}
					else if (pScheduleEntry.TargetType === 'Operation')
					{
						tmpStateService.getOperation(pScheduleEntry.TargetGUID,
							(pError, pOperation) =>
							{
								if (pError)
								{
									this.log.error(`Ultravisor Hypervisor: scheduled operation ${pScheduleEntry.TargetGUID} not found: ${pError.message}`);
									return;
								}
								tmpOperationService.executeOperation(pOperation,
									(pOpError, pManifest) =>
									{
										if (pOpError)
										{
											this.log.error(`Ultravisor Hypervisor: scheduled operation execution error: ${pOpError.message}`);
										}
										else
										{
											this.log.info(`Ultravisor Hypervisor: scheduled operation ${pScheduleEntry.TargetGUID} completed: ${pManifest.Status}`);
										}
									});
							});
					}
				});
		}

		this.log.info(`Ultravisor Hypervisor: schedule started with ${this._Schedule.length} entries.`);

		if (typeof(fCallback) === 'function')
		{
			return fCallback();
		}
	}

	/**
	 * Stop all scheduled jobs.
	 */
	stopSchedule(fCallback)
	{
		let tmpCronService = this.fable['Ultravisor-Hypervisor-Event-Cron'];

		tmpCronService.stop();
		this._Running = false;

		for (let i = 0; i < this._Schedule.length; i++)
		{
			this._Schedule[i].Active = false;
		}

		this.log.info(`Ultravisor Hypervisor: schedule stopped.`);

		if (typeof(fCallback) === 'function')
		{
			return fCallback();
		}
	}

	/**
	 * Remove a schedule entry by GUID.
	 */
	removeScheduleEntry(pGUID, fCallback)
	{
		let tmpCronService = this.fable['Ultravisor-Hypervisor-Event-Cron'];

		for (let i = 0; i < this._Schedule.length; i++)
		{
			if (this._Schedule[i].GUID === pGUID)
			{
				if (this._Schedule[i].Active)
				{
					tmpCronService.stopJob(pGUID);
				}
				this._Schedule.splice(i, 1);
				this.log.info(`Ultravisor Hypervisor: removed schedule entry ${pGUID}`);
				return fCallback(null, true);
			}
		}

		return fCallback(new Error(`Schedule entry ${pGUID} not found.`));
	}
}

module.exports = UltravisorHypervisor;
