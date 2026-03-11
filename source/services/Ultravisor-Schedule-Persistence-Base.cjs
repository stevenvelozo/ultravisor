const libPictService = require('pict-serviceproviderbase');

/**
 * Base class for schedule persistence providers.
 *
 * Defines the interface that all persistence backends must implement.
 * The default implementations return errors so that downstream providers
 * that only partially implement the interface get clear feedback.
 *
 * To create a custom provider (e.g. remote API), extend this class and
 * override loadSchedule() and saveSchedule(), then register your class
 * under the service type 'UltravisorSchedulePersistence'.
 */
class UltravisorSchedulePersistenceBase extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.serviceType = 'UltravisorSchedulePersistenceBase';
	}

	/**
	 * Load the schedule from the backing store.
	 *
	 * @param {function} fCallback - fCallback(pError, pScheduleArray)
	 */
	loadSchedule(fCallback)
	{
		return fCallback(new Error('UltravisorSchedulePersistenceBase: loadSchedule() not implemented.'));
	}

	/**
	 * Save the full schedule to the backing store.
	 *
	 * @param {Array} pSchedule - The schedule array to persist.
	 * @param {function} fCallback - fCallback(pError)
	 */
	saveSchedule(pSchedule, fCallback)
	{
		return fCallback(new Error('UltravisorSchedulePersistenceBase: saveSchedule() not implemented.'));
	}
}

module.exports = UltravisorSchedulePersistenceBase;
