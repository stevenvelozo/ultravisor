const libSchedulePersistenceBase = require('../Ultravisor-Schedule-Persistence-Base.cjs');

const libFS = require('fs');
const libPath = require('path');

/**
 * JSON file–backed schedule persistence provider.
 *
 * Stores the schedule array in the same `.ultravisor.json` config file
 * used by HypervisorState, under the `Schedule` key.  Reads and writes
 * are synchronous to stay consistent with HypervisorState's approach.
 *
 * To use a remote API instead, create a new provider that extends
 * UltravisorSchedulePersistenceBase and register it under the service
 * type 'UltravisorSchedulePersistence'.
 */
class UltravisorSchedulePersistenceJSONFile extends libSchedulePersistenceBase
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.serviceType = 'UltravisorSchedulePersistence';
	}

	/**
	 * Resolve the config file path.
	 *
	 * Uses the same logic as HypervisorState.persistState():
	 * walk the gather-phase list for a non-default path, then fall
	 * back to ProgramConfigurationFileName relative to cwd.
	 *
	 * @returns {string|false} Resolved path, or false if none available.
	 */
	_getConfigPath()
	{
		let tmpFinalPath = false;

		// Check gathered configuration phases (if available)
		let tmpOutcome = this.fable._ConfigurationOutcome;
		if (tmpOutcome && Array.isArray(tmpOutcome.GatherPhases))
		{
			for (let i = 0; i < tmpOutcome.GatherPhases.length; i++)
			{
				let tmpPhase = tmpOutcome.GatherPhases[i];
				if ((tmpPhase.Phase !== 'Default Program Configuration') && (tmpPhase.Path))
				{
					tmpFinalPath = tmpPhase.Path;
				}
			}
		}

		if (!tmpFinalPath && this.fable.settings && this.fable.settings.ProgramConfigurationFileName)
		{
			tmpFinalPath = libPath.resolve(process.cwd(), this.fable.settings.ProgramConfigurationFileName);
		}

		return tmpFinalPath;
	}

	/**
	 * Load the schedule from the JSON config file.
	 *
	 * @param {function} fCallback - fCallback(pError, pScheduleArray)
	 */
	loadSchedule(fCallback)
	{
		let tmpPath = this._getConfigPath();

		if (!tmpPath)
		{
			this.log.warn('UltravisorSchedulePersistenceJSONFile: no config path available; returning empty schedule.');
			return fCallback(null, []);
		}

		try
		{
			if (!libFS.existsSync(tmpPath))
			{
				return fCallback(null, []);
			}

			let tmpContent = libFS.readFileSync(tmpPath, 'utf8');
			let tmpConfig = JSON.parse(tmpContent);
			let tmpSchedule = Array.isArray(tmpConfig.Schedule) ? tmpConfig.Schedule : [];

			return fCallback(null, tmpSchedule);
		}
		catch (pError)
		{
			this.log.error(`UltravisorSchedulePersistenceJSONFile: load error: ${pError.message}`);
			return fCallback(null, []);
		}
	}

	/**
	 * Save the schedule to the JSON config file.
	 *
	 * Reads the existing file first so other keys (Operations, Templates,
	 * GlobalState, etc.) are preserved.
	 *
	 * @param {Array} pSchedule - The schedule array to persist.
	 * @param {function} fCallback - fCallback(pError)
	 */
	saveSchedule(pSchedule, fCallback)
	{
		let tmpPath = this._getConfigPath();

		if (!tmpPath)
		{
			this.log.error('UltravisorSchedulePersistenceJSONFile: no config path available; schedule will not be saved.');
			return fCallback(new Error('No config path available.'));
		}

		try
		{
			// Read existing config so we don't clobber other keys
			let tmpConfig = {};
			if (libFS.existsSync(tmpPath))
			{
				let tmpContent = libFS.readFileSync(tmpPath, 'utf8');
				tmpConfig = JSON.parse(tmpContent);
			}

			tmpConfig.Schedule = pSchedule;

			libFS.writeFileSync(tmpPath, JSON.stringify(tmpConfig, null, '\t'), 'utf8');
			this.log.info(`UltravisorSchedulePersistenceJSONFile: persisted ${pSchedule.length} schedule entries to ${tmpPath}`);

			return fCallback(null);
		}
		catch (pError)
		{
			this.log.error(`UltravisorSchedulePersistenceJSONFile: save error: ${pError.message}`);
			return fCallback(pError);
		}
	}
}

module.exports = UltravisorSchedulePersistenceJSONFile;
