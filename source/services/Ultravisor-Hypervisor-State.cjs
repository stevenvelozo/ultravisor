const libPictService = require('pict-serviceproviderbase');

const libFS = require('fs');
const libPath = require('path');

/**
 * Persistent state store for Ultravisor.
 *
 * Stores Node Templates (reusable pre-configured task type instances)
 * and Operation Definitions (graphs) in memory and persists to
 * `.ultravisor.json` via fable's gatherProgramConfiguration system.
 *
 * Also manages GlobalState that persists across operation runs.
 *
 * Auto-generates meaningful hashes for new entities:
 *   Templates:  TMPL-{TYPE}-{NNN}  (e.g. TMPL-READFILE-001)
 *   Operations: OPR-{NNNN}        (e.g. OPR-0001)
 */
class UltravisorHypervisorState extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.serviceType = 'UltravisorHypervisorState';

		// Node Templates (reusable pre-configured task type instances) keyed by Hash
		this._NodeTemplates = {};

		// Operation Definitions (with Graph) keyed by Hash
		this._Operations = {};

		// Global state (persists across runs)
		this._GlobalState = {};

		// Auto-hash counters
		this._TemplateCounters = {};
		this._OperationCounter = 0;

		// Gather configuration
		this._ConfigurationOutcome = this.fable.gatherProgramConfiguration(false);

		// Load from configuration
		let tmpConfig = this.fable.ProgramConfiguration || {};

		// Load Node Templates (with backward compat from old TaskDefinitions key)
		let tmpTemplateSource = tmpConfig.NodeTemplates || tmpConfig.TaskDefinitions;
		if (tmpTemplateSource && typeof(tmpTemplateSource) === 'object')
		{
			let tmpKeys = Object.keys(tmpTemplateSource);
			for (let i = 0; i < tmpKeys.length; i++)
			{
				this._NodeTemplates[tmpKeys[i]] = tmpTemplateSource[tmpKeys[i]];
			}
		}

		if (tmpConfig.Operations && typeof(tmpConfig.Operations) === 'object')
		{
			let tmpKeys = Object.keys(tmpConfig.Operations);
			for (let i = 0; i < tmpKeys.length; i++)
			{
				this._Operations[tmpKeys[i]] = tmpConfig.Operations[tmpKeys[i]];
			}
		}

		if (tmpConfig.GlobalState && typeof(tmpConfig.GlobalState) === 'object')
		{
			this._GlobalState = tmpConfig.GlobalState;
		}

		if (typeof(tmpConfig.OperationCounter) === 'number')
		{
			this._OperationCounter = tmpConfig.OperationCounter;
		}

		// Load template counters (with backward compat from old TaskCounters key)
		let tmpCounterSource = tmpConfig.TemplateCounters || tmpConfig.TaskCounters;
		if (tmpCounterSource && typeof(tmpCounterSource) === 'object')
		{
			this._TemplateCounters = tmpCounterSource;
		}
	}

	// ====================================================================
	// Auto-Hash Generation
	// ====================================================================

	/**
	 * Generate a meaningful hash for a new node template.
	 *
	 * @param {string} pType - The task type (e.g. 'read-file').
	 * @returns {string} e.g. 'TMPL-READFILE-001'
	 */
	generateTemplateHash(pType)
	{
		let tmpTypeKey = (pType || 'TEMPLATE').toUpperCase().replace(/[^A-Z0-9]/g, '');

		if (!this._TemplateCounters[tmpTypeKey])
		{
			this._TemplateCounters[tmpTypeKey] = 0;
		}

		this._TemplateCounters[tmpTypeKey]++;

		let tmpCounter = String(this._TemplateCounters[tmpTypeKey]).padStart(3, '0');

		return `TMPL-${tmpTypeKey}-${tmpCounter}`;
	}

	/**
	 * Generate a meaningful hash for a new operation.
	 *
	 * @returns {string} e.g. 'OPR-0001'
	 */
	generateOperationHash()
	{
		this._OperationCounter++;

		return `OPR-${String(this._OperationCounter).padStart(4, '0')}`;
	}

	// ====================================================================
	// Persistence
	// ====================================================================

	/**
	 * Persist current state to disk via gatherProgramConfiguration path.
	 *
	 * @returns {boolean} True if state was persisted successfully.
	 */
	persistState()
	{
		let tmpFinalGatherPhasePath = false;

		for (let i = 0; i < this._ConfigurationOutcome.GatherPhases.length; i++)
		{
			let tmpGatherPhase = this._ConfigurationOutcome.GatherPhases[i];
			if ((tmpGatherPhase.Phase != 'Default Program Configuration') && (tmpGatherPhase.Path))
			{
				tmpFinalGatherPhasePath = tmpGatherPhase.Path;
			}
		}

		if (!tmpFinalGatherPhasePath && this.fable.settings.ProgramConfigurationFileName)
		{
			tmpFinalGatherPhasePath = libPath.resolve(process.cwd(), this.fable.settings.ProgramConfigurationFileName);
			this.log.warn('UltravisorHypervisorState: could not determine config path; using ProgramConfigurationFileName.');
		}
		else if (!tmpFinalGatherPhasePath)
		{
			this.log.error('UltravisorHypervisorState: no config path available; state will not be saved.');
			return false;
		}

		let tmpStateToPersist = this._ConfigurationOutcome.ConfigurationOutcome || {};

		tmpStateToPersist.NodeTemplates = this._NodeTemplates;
		tmpStateToPersist.Operations = this._Operations;
		tmpStateToPersist.GlobalState = this._GlobalState;
		tmpStateToPersist.OperationCounter = this._OperationCounter;
		tmpStateToPersist.TemplateCounters = this._TemplateCounters;

		// Remove old keys if present (migration)
		delete tmpStateToPersist.TaskDefinitions;
		delete tmpStateToPersist.TaskCounters;

		this.log.info(`UltravisorHypervisorState: persisting state to ${tmpFinalGatherPhasePath}`);

		try
		{
			libFS.writeFileSync(tmpFinalGatherPhasePath, JSON.stringify(tmpStateToPersist, null, '\t'), 'utf8');
		}
		catch (pError)
		{
			this.log.error(`UltravisorHypervisorState: persist error: ${pError.message}`);
			return false;
		}

		return true;
	}

	// ====================================================================
	// Node Template CRUD
	// ====================================================================

	/**
	 * Create or update a node template.
	 *
	 * @param {object} pTemplate - The node template object.
	 *   Must have a Hash (or one will be auto-generated from Type).
	 * @param {function} fCallback - function(pError, pTemplate)
	 */
	updateNodeTemplate(pTemplate, fCallback)
	{
		if (typeof(pTemplate) !== 'object' || pTemplate === null)
		{
			return fCallback(new Error('updateNodeTemplate requires a valid object.'));
		}

		// Auto-generate hash if not provided
		if (!pTemplate.Hash || typeof(pTemplate.Hash) !== 'string' || pTemplate.Hash.length === 0)
		{
			pTemplate.Hash = this.generateTemplateHash(pTemplate.Type || 'TEMPLATE');
		}

		if (this._NodeTemplates.hasOwnProperty(pTemplate.Hash))
		{
			this._NodeTemplates[pTemplate.Hash] = Object.assign(
				this._NodeTemplates[pTemplate.Hash], pTemplate);
		}
		else
		{
			this._NodeTemplates[pTemplate.Hash] = pTemplate;
		}

		this.persistState();

		return fCallback(null, this._NodeTemplates[pTemplate.Hash]);
	}

	/**
	 * Get a node template by hash.
	 */
	getNodeTemplate(pHash, fCallback)
	{
		if (!this._NodeTemplates.hasOwnProperty(pHash))
		{
			return fCallback(new Error(`Node template [${pHash}] not found.`));
		}
		return fCallback(null, this._NodeTemplates[pHash]);
	}

	/**
	 * List all node templates.
	 */
	getNodeTemplateList(fCallback)
	{
		let tmpList = [];
		let tmpKeys = Object.keys(this._NodeTemplates);

		for (let i = 0; i < tmpKeys.length; i++)
		{
			tmpList.push(this._NodeTemplates[tmpKeys[i]]);
		}

		return fCallback(null, tmpList);
	}

	/**
	 * Delete a node template by hash.
	 */
	deleteNodeTemplate(pHash, fCallback)
	{
		if (!this._NodeTemplates.hasOwnProperty(pHash))
		{
			return fCallback(new Error(`Node template [${pHash}] not found.`));
		}

		delete this._NodeTemplates[pHash];
		this.persistState();

		return fCallback(null, true);
	}

	// ====================================================================
	// Operation CRUD
	// ====================================================================

	/**
	 * Create or update an operation.
	 *
	 * @param {object} pOperation - The operation definition.
	 *   Must have a Hash (or one will be auto-generated).
	 * @param {function} fCallback - function(pError, pOperation)
	 */
	updateOperation(pOperation, fCallback)
	{
		if (typeof(pOperation) !== 'object' || pOperation === null)
		{
			return fCallback(new Error('updateOperation requires a valid object.'));
		}

		// Auto-generate hash if not provided
		if (!pOperation.Hash || typeof(pOperation.Hash) !== 'string' || pOperation.Hash.length === 0)
		{
			pOperation.Hash = this.generateOperationHash();
		}

		// Ensure Graph structure exists
		if (!pOperation.Graph)
		{
			pOperation.Graph = { Nodes: [], Connections: [], ViewState: {} };
		}

		if (this._Operations.hasOwnProperty(pOperation.Hash))
		{
			this._Operations[pOperation.Hash] = Object.assign(
				this._Operations[pOperation.Hash], pOperation);
		}
		else
		{
			pOperation.CreatedAt = pOperation.CreatedAt || new Date().toISOString();
			this._Operations[pOperation.Hash] = pOperation;
		}

		pOperation.UpdatedAt = new Date().toISOString();

		this.persistState();

		return fCallback(null, this._Operations[pOperation.Hash]);
	}

	/**
	 * Get an operation by hash.
	 */
	getOperation(pHash, fCallback)
	{
		if (!this._Operations.hasOwnProperty(pHash))
		{
			return fCallback(new Error(`Operation [${pHash}] not found.`));
		}
		return fCallback(null, this._Operations[pHash]);
	}

	/**
	 * List all operations.
	 */
	getOperationList(fCallback)
	{
		let tmpList = [];
		let tmpKeys = Object.keys(this._Operations);

		for (let i = 0; i < tmpKeys.length; i++)
		{
			tmpList.push(this._Operations[tmpKeys[i]]);
		}

		return fCallback(null, tmpList);
	}

	/**
	 * Delete an operation by hash.
	 */
	deleteOperation(pHash, fCallback)
	{
		if (!this._Operations.hasOwnProperty(pHash))
		{
			return fCallback(new Error(`Operation [${pHash}] not found.`));
		}

		delete this._Operations[pHash];
		this.persistState();

		return fCallback(null, true);
	}

	// ====================================================================
	// Global State
	// ====================================================================

	/**
	 * Get the persisted global state.
	 *
	 * @returns {object} A copy of the global state.
	 */
	getGlobalState()
	{
		return JSON.parse(JSON.stringify(this._GlobalState));
	}

	/**
	 * Update and persist global state.
	 *
	 * @param {object} pState - State to merge into global state.
	 */
	updateGlobalState(pState)
	{
		if (typeof(pState) === 'object' && pState !== null)
		{
			Object.assign(this._GlobalState, pState);
			this.persistState();
		}
	}
}

module.exports = UltravisorHypervisorState;
