const libPictService = require(`pict-serviceproviderbase`);

class UltravisorOperationManifest extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
	}
}

module.exports = UltravisorOperationManifest;