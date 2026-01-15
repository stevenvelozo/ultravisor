const libPictService = require(`pict-serviceproviderbase`);

class UltravisorOperation extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
	}
}

module.exports = UltravisorOperation;