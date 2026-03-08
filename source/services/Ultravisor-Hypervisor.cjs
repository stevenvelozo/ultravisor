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

	/**
	 * Get a service instance from the fable services map.
	 */
	_getService(pTypeName)
	{
		return this.fable.servicesMap[pTypeName]
			? Object.values(this.fable.servicesMap[pTypeName])[0]
			: null;
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
	 * Add an operation to the schedule.
	 *
	 * @param {string} pOperationHash - The operation hash to schedule.
	 * @param {string} pType - Schedule type (cron, daily, hourly).
	 * @param {string} pParameters - Schedule parameters.
	 * @param {function} fCallback - Callback.
	 */
	scheduleOperation(pOperationHash, pType, pParameters, fCallback)
	{
		let tmpScheduleEntry = {
			GUID: `sched-op-${pOperationHash}-${Date.now()}`,
			TargetType: 'Operation',
			TargetHash: pOperationHash,
			ScheduleType: pType || 'cron',
			Parameters: pParameters || '0 * * * *',
			CronExpression: this._resolveScheduleExpression(pType, pParameters),
			Active: false,
			CreatedAt: new Date().toISOString()
		};

		this._Schedule.push(tmpScheduleEntry);
		this.log.info(`Ultravisor Hypervisor: scheduled operation ${pOperationHash} as ${tmpScheduleEntry.ScheduleType} (${tmpScheduleEntry.CronExpression})`);

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
		let tmpCronService = this._getService('UltravisorHypervisorEventCron');
		let tmpStateService = this._getService('UltravisorHypervisorState');
		let tmpEngine = this._getService('UltravisorExecutionEngine');

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
					// On tick, execute the target operation
					tmpStateService.getOperation(pScheduleEntry.TargetHash,
						(pError, pOperation) =>
						{
							if (pError)
							{
								this.log.error(`Ultravisor Hypervisor: scheduled operation ${pScheduleEntry.TargetHash} not found: ${pError.message}`);
								return;
							}
							tmpEngine.executeOperation(pOperation,
								(pExecError, pContext) =>
								{
									if (pExecError)
									{
										this.log.error(`Ultravisor Hypervisor: scheduled operation execution error: ${pExecError.message}`);
									}
									else
									{
										this.log.info(`Ultravisor Hypervisor: scheduled operation ${pScheduleEntry.TargetHash} completed: ${pContext.Status}`);
									}
								});
						});
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
		let tmpCronService = this._getService('UltravisorHypervisorEventCron');

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
		let tmpCronService = this._getService('UltravisorHypervisorEventCron');

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
