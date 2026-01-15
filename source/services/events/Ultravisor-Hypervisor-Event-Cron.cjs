const libUltravisorEventBase = require(`../Ultravisor-Hypervisor-Event-Base.cjs`);

class UltravisorEventCron extends libUltravisorEventBase
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
	}
}

module.exports = UltravisorEventCron;