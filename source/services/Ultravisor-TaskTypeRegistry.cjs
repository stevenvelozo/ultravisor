const libPictService = require('pict-serviceproviderbase');

/**
 * Registry of all available task type classes and configs.
 *
 * Task types can be registered either as classes (via registerTaskType) or
 * as config objects (via registerTaskTypeFromConfig).  Both paths produce
 * instances that the ExecutionEngine can execute.
 */
class UltravisorTaskTypeRegistry extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.serviceType = 'UltravisorTaskTypeRegistry';

		// Map of task type hash -> task type class (class-based registration)
		this._TaskTypes = {};

		// Map of task type hash -> config object (config-based registration)
		this._TaskTypeConfigs = {};

		// Map of task type hash -> definition (cached from either path)
		this._Definitions = {};
	}

	/**
	 * Register a task type class.
	 *
	 * @param {Function} pTaskTypeClass - A class extending UltravisorTaskType.
	 * @returns {object|false} The task type definition, or false on failure.
	 */
	registerTaskType(pTaskTypeClass)
	{
		if (typeof(pTaskTypeClass) !== 'function')
		{
			this.log.error('UltravisorTaskTypeRegistry: registerTaskType requires a constructor function.');
			return false;
		}

		// Instantiate temporarily to read the definition
		let tmpInstance = new pTaskTypeClass(this.fable, {}, `TaskType-Probe-${Date.now()}`);
		let tmpDefinition = tmpInstance.definition;

		if (!tmpDefinition || !tmpDefinition.Hash)
		{
			this.log.error('UltravisorTaskTypeRegistry: task type class must have a definition with a Hash.');
			return false;
		}

		this._TaskTypes[tmpDefinition.Hash] = pTaskTypeClass;
		this._Definitions[tmpDefinition.Hash] = tmpDefinition;

		this.log.info(`UltravisorTaskTypeRegistry: registered task type [${tmpDefinition.Hash}] "${tmpDefinition.Name}"`);

		return tmpDefinition;
	}

	/**
	 * Register a task type from a config object.
	 *
	 * @param {object} pConfig - Config object with:
	 *   Definition  {object}   - Task type definition (Hash, Name, EventInputs, etc.)
	 *   Execute     {function} - Optional. function(pTaskInstance, pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	 * @returns {object|false} The task type definition, or false on failure.
	 */
	registerTaskTypeFromConfig(pConfig)
	{
		if (!pConfig || typeof(pConfig) !== 'object')
		{
			this.log.error('UltravisorTaskTypeRegistry: registerTaskTypeFromConfig requires a config object.');
			return false;
		}

		let tmpDefinition = pConfig.Definition;

		if (!tmpDefinition || !tmpDefinition.Hash)
		{
			this.log.error('UltravisorTaskTypeRegistry: config must have a Definition with a Hash.');
			return false;
		}

		this._TaskTypeConfigs[tmpDefinition.Hash] = pConfig;
		this._Definitions[tmpDefinition.Hash] = tmpDefinition;

		this.log.info(`UltravisorTaskTypeRegistry: registered config-driven task type [${tmpDefinition.Hash}] "${tmpDefinition.Name}"`);

		return tmpDefinition;
	}

	/**
	 * Register multiple task types from an array of config objects.
	 *
	 * @param {Array} pConfigs - Array of config objects.
	 * @returns {number} Number of successfully registered task types.
	 */
	registerTaskTypesFromConfigArray(pConfigs)
	{
		if (!Array.isArray(pConfigs))
		{
			this.log.error('UltravisorTaskTypeRegistry: registerTaskTypesFromConfigArray requires an array.');
			return 0;
		}

		let tmpCount = 0;

		for (let i = 0; i < pConfigs.length; i++)
		{
			if (this.registerTaskTypeFromConfig(pConfigs[i]))
			{
				tmpCount++;
			}
		}

		return tmpCount;
	}

	/**
	 * Create a new instance of a task type by hash.
	 *
	 * Checks config-driven tasks first, then falls back to class-based tasks.
	 *
	 * @param {string} pHash - The task type hash (e.g. 'read-file').
	 * @returns {object|null} A new instance of the task type, or null if not found.
	 */
	instantiateTaskType(pHash)
	{
		// Check config-driven tasks first
		let tmpConfig = this._TaskTypeConfigs[pHash];

		if (tmpConfig)
		{
			let tmpBaseClass = require('./tasks/Ultravisor-TaskType-Base.cjs');
			let tmpOptions =
			{
				Definition: tmpConfig.Definition
			};

			if (typeof(tmpConfig.Execute) === 'function')
			{
				tmpOptions.Execute = tmpConfig.Execute;
			}

			return new tmpBaseClass(this.fable, tmpOptions, `TaskType-${pHash}-${Date.now()}`);
		}

		// Fall back to class-based tasks
		let tmpTaskTypeClass = this._TaskTypes[pHash];

		if (!tmpTaskTypeClass)
		{
			this.log.error(`UltravisorTaskTypeRegistry: unknown task type hash [${pHash}]`);
			return null;
		}

		return new tmpTaskTypeClass(this.fable, {}, `TaskType-${pHash}-${Date.now()}`);
	}

	/**
	 * Get the definition for a task type by hash.
	 *
	 * @param {string} pHash - The task type hash.
	 * @returns {object|null} The definition, or null if not found.
	 */
	getDefinition(pHash)
	{
		return this._Definitions[pHash] || null;
	}

	/**
	 * Get all registered task type definitions.
	 *
	 * @returns {Array} Array of definition objects.
	 */
	listDefinitions()
	{
		let tmpDefinitions = [];
		let tmpKeys = Object.keys(this._Definitions);

		for (let i = 0; i < tmpKeys.length; i++)
		{
			tmpDefinitions.push(this._Definitions[tmpKeys[i]]);
		}

		return tmpDefinitions;
	}

	/**
	 * Check if a task type hash is registered.
	 *
	 * @param {string} pHash - The task type hash.
	 * @returns {boolean}
	 */
	hasTaskType(pHash)
	{
		return this._TaskTypes.hasOwnProperty(pHash) || this._TaskTypeConfigs.hasOwnProperty(pHash);
	}

	/**
	 * Register all built-in task types.
	 * Called during application initialization.
	 */
	registerBuiltInTaskTypes()
	{
		let tmpBuiltInConfigs = require('./tasks/Ultravisor-BuiltIn-TaskConfigs.cjs');
		this.registerTaskTypesFromConfigArray(tmpBuiltInConfigs);

		this.log.info(`UltravisorTaskTypeRegistry: ${Object.keys(this._Definitions).length} built-in task types registered.`);
	}
}

module.exports = UltravisorTaskTypeRegistry;
