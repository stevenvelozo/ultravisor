const libPictService = require(`pict-serviceproviderbase`);

class UltravisorTask extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
	}
}

module.exports = UltravisorTask;