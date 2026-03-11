const libFableServiceProviderBase = require('fable-serviceproviderbase');

/**
 * Base class for all Ultravisor task types.
 *
 * Subclasses override `definition` to declare their port schema
 * (EventInputs, EventOutputs, SettingsInputs, StateOutputs)
 * and `execute` to implement the task logic.
 */
class UltravisorTaskType extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'UltravisorTaskType';
	}

	/**
	 * Port schema and metadata for this task type.
	 * Subclasses MUST override this getter.
	 *
	 * @returns {object} Task type definition with:
	 *   Hash            {string}   - unique type identifier (e.g. 'read-file')
	 *   Name            {string}   - display name
	 *   Description     {string}   - what the task does
	 *   Category        {string}   - grouping key (file-io, data, control, interaction)
	 *   Capability      {string}   - capability grouping for worker dispatch (e.g. 'File System', 'Data Transform')
	 *   Action          {string}   - verb within the capability (e.g. 'Read', 'Write')
	 *   Tier            {string}   - capability tier: 'Engine' | 'Platform' | 'Service' | 'Extension'
	 *   EventInputs     {Array}    - [{ Name, Description? }]
	 *   EventOutputs    {Array}    - [{ Name, Description?, IsError? }]
	 *   SettingsInputs  {Array}    - [{ Name, DataType, Required?, Default?, Description? }]
	 *   StateOutputs    {Array}    - [{ Name, DataType?, Description? }]
	 *   DefaultSettings {object}   - default values for SettingsInputs
	 */
	get definition()
	{
		// Config-driven: if Definition was provided in options, use it
		if (this.options.Definition && typeof(this.options.Definition) === 'object'
			&& this.options.Definition.Hash)
		{
			return this.options.Definition;
		}

		// Default fallback (overridden by subclasses)
		return {
			Hash: 'base',
			Name: 'Base Task',
			Description: 'Override this in subclasses.',
			Category: 'internal',
			Capability: 'Internal',
			Action: 'Base',
			Tier: 'Engine',
			EventInputs: [],
			EventOutputs: [],
			SettingsInputs: [],
			StateOutputs: [],
			DefaultSettings: {}
		};
	}

	/**
	 * Execute the task.
	 *
	 * @param {object} pResolvedSettings - The task's Settings with incoming
	 *   State connections already resolved by the engine.
	 * @param {object} pExecutionContext - Runtime context:
	 *   GlobalState     {object}  - state shared across all operations
	 *   OperationState  {object}  - state shared across tasks in this run
	 *   TaskOutputs     {object}  - keyed by NodeHash, per-task output state
	 *   StagingPath     {string}  - path to the operation's staging folder
	 *   OperationHash   {string}  - the operation being executed
	 *   NodeHash        {string}  - this task node's hash in the graph
	 *   RunHash         {string}  - the execution run hash
	 *   RunMode         {string}  - 'production' | 'standard' | 'debug'
	 *   StateManager    {object}  - reference to the StateManager service
	 *   TriggeringEventName {string} - the event that triggered this execution
	 *     (e.g. 'PerformSplit', 'StepComplete') — lets state-machine tasks
	 *     distinguish which input event caused the current invocation.
	 * @param {function} fCallback - function(pError, pResult) where pResult is:
	 *   EventToFire  {string}  - which output event to fire (e.g. 'ReadComplete')
	 *   Outputs      {object}  - key/value pairs written to TaskOutputs[NodeHash]
	 *   Log          {Array}   - array of log message strings
	 * @param {function} [fFireIntermediateEvent] - Optional. For re-entrant
	 *   tasks (like split-execute) that fire events multiple times.
	 *   Signature: fFireIntermediateEvent(pEventName, pOutputs, fResumeCallback)
	 */
	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		// Config-driven: if Execute function was provided in options, call it
		if (typeof(this.options.Execute) === 'function')
		{
			return this.options.Execute(this, pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent);
		}

		return fCallback(new Error(`Task type "${this.definition.Hash}" has not implemented execute().`));
	}

	/**
	 * Resolve a file path relative to the staging folder if it is not absolute.
	 *
	 * @param {string} pFilePath - The file path from settings.
	 * @param {string} pStagingPath - The operation's staging folder.
	 * @returns {string} Resolved absolute path.
	 */
	resolveFilePath(pFilePath, pStagingPath)
	{
		if (!pFilePath || typeof(pFilePath) !== 'string')
		{
			return pStagingPath || '';
		}

		const libPath = require('path');

		if (libPath.isAbsolute(pFilePath))
		{
			return pFilePath;
		}

		return libPath.resolve(pStagingPath || process.cwd(), pFilePath);
	}
}

module.exports = UltravisorTaskType;
