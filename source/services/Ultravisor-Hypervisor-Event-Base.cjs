const libPictService = require(`pict-serviceproviderbase`);

class UltravisorEventBase extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this._Active = false;
	}

	start(pScheduleEntry, fOnTick)
	{
		this._Active = true;
	}

	stop()
	{
		this._Active = false;
	}

	get active()
	{
		return this._Active;
	}
}

module.exports = UltravisorEventBase;
