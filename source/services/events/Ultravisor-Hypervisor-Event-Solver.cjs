const libUltravisorEventBase = require(`../Ultravisor-Hypervisor-Event-Base.cjs`);

class UltravisorEventSolver extends libUltravisorEventBase
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
	}
}

module.exports = UltravisorEventSolver;