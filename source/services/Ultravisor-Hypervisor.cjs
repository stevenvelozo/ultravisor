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
	 * Load the schedule from the persistence provider.
	 *
	 * If no provider is registered the in-memory schedule is left as-is.
	 *
	 * @param {function} fCallback - fCallback(pError)
	 */
	loadSchedule(fCallback)
	{
		let tmpPersistence = this._getService('UltravisorSchedulePersistence');

		if (!tmpPersistence)
		{
			this.log.warn('Ultravisor Hypervisor: no schedule persistence provider registered; using in-memory schedule only.');
			if (typeof(fCallback) === 'function')
			{
				return fCallback(null);
			}
			return;
		}

		tmpPersistence.loadSchedule(
			(pError, pSchedule) =>
			{
				if (pError)
				{
					this.log.error(`Ultravisor Hypervisor: failed to load schedule: ${pError.message}`);
				}
				else if (Array.isArray(pSchedule) && pSchedule.length > 0)
				{
					this._Schedule = pSchedule;
					this.log.info(`Ultravisor Hypervisor: loaded ${pSchedule.length} schedule entries from persistence.`);
				}

				if (typeof(fCallback) === 'function')
				{
					return fCallback(pError);
				}
			});
	}

	/**
	 * Persist the current schedule via the registered provider.
	 *
	 * Called internally after every mutation.  Fails silently if no
	 * provider is registered so the Hypervisor works without persistence.
	 */
	_persistSchedule()
	{
		let tmpPersistence = this._getService('UltravisorSchedulePersistence');

		if (!tmpPersistence)
		{
			return;
		}

		tmpPersistence.saveSchedule(this._Schedule,
			(pError) =>
			{
				if (pError)
				{
					this.log.error(`Ultravisor Hypervisor: failed to persist schedule: ${pError.message}`);
				}
			});
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
		this._persistSchedule();

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

		this._persistSchedule();
		this.log.info(`Ultravisor Hypervisor: schedule stopped.`);

		if (typeof(fCallback) === 'function')
		{
			return fCallback();
		}
	}

	/**
	 * Start a single schedule entry by GUID.
	 */
	startScheduleEntry(pGUID, fCallback)
	{
		let tmpCronService = this._getService('UltravisorHypervisorEventCron');
		let tmpStateService = this._getService('UltravisorHypervisorState');
		let tmpEngine = this._getService('UltravisorExecutionEngine');

		for (let i = 0; i < this._Schedule.length; i++)
		{
			let tmpEntry = this._Schedule[i];

			if (tmpEntry.GUID === pGUID)
			{
				if (tmpEntry.Active)
				{
					return fCallback(null, tmpEntry);
				}

				tmpEntry.Active = true;

				tmpCronService.start(tmpEntry,
					(pScheduleEntry) =>
					{
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

				this._persistSchedule();
				this.log.info(`Ultravisor Hypervisor: started schedule entry ${pGUID}`);
				return fCallback(null, tmpEntry);
			}
		}

		return fCallback(new Error(`Schedule entry ${pGUID} not found.`));
	}

	/**
	 * Stop a single schedule entry by GUID.
	 */
	stopScheduleEntry(pGUID, fCallback)
	{
		let tmpCronService = this._getService('UltravisorHypervisorEventCron');

		for (let i = 0; i < this._Schedule.length; i++)
		{
			let tmpEntry = this._Schedule[i];

			if (tmpEntry.GUID === pGUID)
			{
				if (!tmpEntry.Active)
				{
					return fCallback(null, tmpEntry);
				}

				tmpEntry.Active = false;
				tmpCronService.stopJob(pGUID);
				this._persistSchedule();
				this.log.info(`Ultravisor Hypervisor: stopped schedule entry ${pGUID}`);
				return fCallback(null, tmpEntry);
			}
		}

		return fCallback(new Error(`Schedule entry ${pGUID} not found.`));
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
				this._persistSchedule();
				this.log.info(`Ultravisor Hypervisor: removed schedule entry ${pGUID}`);
				return fCallback(null, true);
			}
		}

		return fCallback(new Error(`Schedule entry ${pGUID} not found.`));
	}
}

module.exports = UltravisorHypervisor;
