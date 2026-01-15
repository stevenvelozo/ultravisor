const libPictService = require(`pict-serviceproviderbase`);

class UltravisorEventBase extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
	}
}

module.exports = UltravisorEventBase;