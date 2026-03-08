const libTaskTypeBase = require('../Ultravisor-TaskType-Base.cjs');

/**
 * SetValues Task Type
 *
 * Sets one or more values in state at specified addresses.
 * Used for initializing state, transforming data between levels, or
 * setting computed values.
 *
 * Settings.Mappings is an array of { Address, Value } objects.
 * Each mapping sets the value at the given state address.
 */
class UltravisorTaskTypeSetValues extends libTaskTypeBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'UltravisorTaskTypeSetValues';
	}

	get definition()
	{
		return {
			Hash: 'set-values',
			Type: 'set-values',
			Name: 'Set Values',
			Description: 'Sets one or more values in state at specified addresses.',
			Category: 'data',

			EventInputs: [{ Name: 'Execute' }],
			EventOutputs: [{ Name: 'Complete' }],
			SettingsInputs: [
				{ Name: 'Mappings', DataType: 'Array', Required: true }
			],
			StateOutputs: [],

			DefaultSettings: { Mappings: [] }
		};
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		let tmpMappings = pResolvedSettings.Mappings;

		if (!Array.isArray(tmpMappings))
		{
			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: {},
				Log: ['No mappings provided or Mappings is not an array.']
			});
		}

		let tmpStateWrites = {};
		let tmpLog = [];

		for (let i = 0; i < tmpMappings.length; i++)
		{
			let tmpMapping = tmpMappings[i];

			if (!tmpMapping || !tmpMapping.Address)
			{
				tmpLog.push(`Mapping ${i}: skipped (no Address).`);
				continue;
			}

			tmpStateWrites[tmpMapping.Address] = tmpMapping.Value;
			tmpLog.push(`Set [${tmpMapping.Address}] = ${JSON.stringify(tmpMapping.Value)}`);
		}

		return fCallback(null, {
			EventToFire: 'Complete',
			Outputs: {},
			StateWrites: tmpStateWrites,
			Log: tmpLog
		});
	}
}

module.exports = UltravisorTaskTypeSetValues;
