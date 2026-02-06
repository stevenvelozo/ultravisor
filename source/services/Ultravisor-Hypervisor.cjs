const libPictService = require(`pict-serviceproviderbase`);

const libCron = require('cron');

class UltravisorHypervisor extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.CronJob = libCron.CronJob;

		this._Schedule = [];
	}

	get schedule()
	{
		return this.getSchedule();
	}

	getSchedule()
	{
		return this._Schedule;
	}
}

module.exports = UltravisorHypervisor;