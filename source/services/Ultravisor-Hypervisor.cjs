const libPictService = require(`pict-serviceproviderbase`);

class UltravisorHypervisor extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
	}
}

module.exports = UltravisorHypervisor;