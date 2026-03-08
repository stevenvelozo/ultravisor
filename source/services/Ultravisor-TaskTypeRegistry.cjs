const libPictService = require('pict-serviceproviderbase');

/**
 * Registry of all available task type classes.
 *
 * Task types are registered by hash and can be instantiated on demand
 * by the ExecutionEngine when a task node needs to execute.
 */
class UltravisorTaskTypeRegistry extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.serviceType = 'UltravisorTaskTypeRegistry';

		// Map of task type hash -> task type class
		this._TaskTypes = {};

		// Map of task type hash -> definition (cached from class instances)
		this._Definitions = {};
	}

	/**
	 * Register a task type class.
	 *
	 * @param {Function} pTaskTypeClass - A class extending UltravisorTaskType.
	 * @returns {object} The task type definition.
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
	 * Create a new instance of a task type by hash.
	 *
	 * @param {string} pHash - The task type hash (e.g. 'read-file').
	 * @returns {object|null} A new instance of the task type, or null if not found.
	 */
	instantiateTaskType(pHash)
	{
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
		return this._TaskTypes.hasOwnProperty(pHash);
	}

	/**
	 * Register all built-in task types.
	 * Called during application initialization.
	 */
	registerBuiltInTaskTypes()
	{
		// File I/O
		this.registerTaskType(require('./tasks/file-io/Ultravisor-TaskType-ReadFile.cjs'));
		this.registerTaskType(require('./tasks/file-io/Ultravisor-TaskType-WriteFile.cjs'));

		// Data
		this.registerTaskType(require('./tasks/data/Ultravisor-TaskType-SetValues.cjs'));
		this.registerTaskType(require('./tasks/data/Ultravisor-TaskType-ReplaceString.cjs'));
		this.registerTaskType(require('./tasks/data/Ultravisor-TaskType-StringAppender.cjs'));

		// Control
		this.registerTaskType(require('./tasks/control/Ultravisor-TaskType-IfConditional.cjs'));
		this.registerTaskType(require('./tasks/control/Ultravisor-TaskType-SplitExecute.cjs'));
		this.registerTaskType(require('./tasks/control/Ultravisor-TaskType-LaunchOperation.cjs'));

		// Interaction
		this.registerTaskType(require('./tasks/interaction/Ultravisor-TaskType-ValueInput.cjs'));
		this.registerTaskType(require('./tasks/interaction/Ultravisor-TaskType-ErrorMessage.cjs'));

		this.log.info(`UltravisorTaskTypeRegistry: ${Object.keys(this._TaskTypes).length} built-in task types registered.`);
	}
}

module.exports = UltravisorTaskTypeRegistry;
