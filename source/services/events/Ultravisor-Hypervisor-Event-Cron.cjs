const libUltravisorEventBase = require(`../Ultravisor-Hypervisor-Event-Base.cjs`);

const libCron = require('cron');

class UltravisorEventCron extends libUltravisorEventBase
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this._CronJobs = {};
	}

	/**
	 * Create and start a cron job for a schedule entry.
	 *
	 * @param {object} pScheduleEntry - The schedule entry with CronExpression and GUID.
	 * @param {function} fOnTick - Function to call on each cron tick.
	 */
	start(pScheduleEntry, fOnTick)
	{
		super.start(pScheduleEntry, fOnTick);

		let tmpCronExpression = pScheduleEntry.CronExpression || pScheduleEntry.Parameters || '0 * * * *';
		let tmpGUID = pScheduleEntry.GUID || `cron-${Date.now()}`;

		this.log.info(`Ultravisor Cron Event: starting cron job ${tmpGUID} with expression "${tmpCronExpression}"`);

		try
		{
			let tmpCronJob = new libCron.CronJob(
				tmpCronExpression,
				() =>
				{
					this.log.info(`Ultravisor Cron Event: tick for ${tmpGUID}`);
					if (typeof(fOnTick) === 'function')
					{
						fOnTick(pScheduleEntry);
					}
				},
				null,
				true
			);

			this._CronJobs[tmpGUID] = tmpCronJob;
		}
		catch (pError)
		{
			this.log.error(`Ultravisor Cron Event: failed to create cron job ${tmpGUID}: ${pError.message}`);
			this._Active = false;
		}
	}

	stopJob(pGUID)
	{
		if (this._CronJobs[pGUID])
		{
			this._CronJobs[pGUID].stop();
			delete this._CronJobs[pGUID];
		}
	}

	stop()
	{
		super.stop();

		let tmpKeys = Object.keys(this._CronJobs);
		for (let i = 0; i < tmpKeys.length; i++)
		{
			this._CronJobs[tmpKeys[i]].stop();
		}
		this._CronJobs = {};
	}

	get jobCount()
	{
		return Object.keys(this._CronJobs).length;
	}
}

module.exports = UltravisorEventCron;
