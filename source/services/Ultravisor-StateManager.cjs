const libPictService = require('pict-serviceproviderbase');

/**
 * Manages three-level state (Global, Operation, Task) and provides
 * address resolution through Manyfest.
 *
 * Address prefixes:
 *   Global.X            -> GlobalState.X
 *   Operation.X         -> OperationState.X
 *   Task.X              -> TaskOutputs[currentNodeHash].X
 *   TaskOutput.{Hash}.X -> TaskOutputs[Hash].X
 *   Staging.Path        -> StagingPath string
 */
class UltravisorStateManager extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.serviceType = 'UltravisorStateManager';

		this._Manyfest = this.fable.newManyfest();
	}

	/**
	 * Resolve an address against the execution context.
	 *
	 * @param {string} pAddress - The address to resolve (e.g. 'Operation.InputFilePath').
	 * @param {object} pExecutionContext - The runtime execution context.
	 * @param {string} [pCurrentNodeHash] - The current task node's hash (for Task.X resolution).
	 * @returns {*} The resolved value, or undefined if not found.
	 */
	resolveAddress(pAddress, pExecutionContext, pCurrentNodeHash)
	{
		if (!pAddress || typeof(pAddress) !== 'string')
		{
			return undefined;
		}

		let tmpDotIndex = pAddress.indexOf('.');
		let tmpPrefix;
		let tmpRemainder;

		if (tmpDotIndex > -1)
		{
			tmpPrefix = pAddress.substring(0, tmpDotIndex);
			tmpRemainder = pAddress.substring(tmpDotIndex + 1);
		}
		else
		{
			tmpPrefix = pAddress;
			tmpRemainder = '';
		}

		switch (tmpPrefix)
		{
			case 'Global':
				return this._resolveFromObject(pExecutionContext.GlobalState, tmpRemainder);

			case 'Operation':
				return this._resolveFromObject(pExecutionContext.OperationState, tmpRemainder);

			case 'Task':
				if (!pCurrentNodeHash)
				{
					this.log.warn(`UltravisorStateManager: resolveAddress for Task.X requires a current node hash.`);
					return undefined;
				}
				return this._resolveFromObject(
					pExecutionContext.TaskOutputs[pCurrentNodeHash] || {},
					tmpRemainder);

			case 'TaskOutput':
			{
				// TaskOutput.{NodeHash}.{Path}
				let tmpSecondDot = tmpRemainder.indexOf('.');
				if (tmpSecondDot < 0)
				{
					// Just TaskOutput.{NodeHash} -- return the whole output object
					return pExecutionContext.TaskOutputs[tmpRemainder] || {};
				}
				let tmpNodeHash = tmpRemainder.substring(0, tmpSecondDot);
				let tmpPath = tmpRemainder.substring(tmpSecondDot + 1);
				return this._resolveFromObject(
					pExecutionContext.TaskOutputs[tmpNodeHash] || {},
					tmpPath);
			}

			case 'Staging':
				if (tmpRemainder === 'Path' || tmpRemainder === '')
				{
					return pExecutionContext.StagingPath || '';
				}
				return undefined;

			default:
				// Fall through: try the full address against OperationState first,
				// then GlobalState. This allows shorthand like 'InputFilePath'
				// to resolve from Operation state.
				let tmpValue = this._resolveFromObject(pExecutionContext.OperationState, pAddress);
				if (tmpValue !== undefined)
				{
					return tmpValue;
				}
				return this._resolveFromObject(pExecutionContext.GlobalState, pAddress);
		}
	}

	/**
	 * Set a value at an address in the execution context.
	 *
	 * @param {string} pAddress - The address to set (e.g. 'Operation.InputFilePath').
	 * @param {*} pValue - The value to set.
	 * @param {object} pExecutionContext - The runtime execution context.
	 * @param {string} [pCurrentNodeHash] - The current task node's hash (for Task.X).
	 * @returns {boolean} True if the value was set successfully.
	 */
	setAddress(pAddress, pValue, pExecutionContext, pCurrentNodeHash)
	{
		if (!pAddress || typeof(pAddress) !== 'string')
		{
			return false;
		}

		let tmpDotIndex = pAddress.indexOf('.');
		let tmpPrefix;
		let tmpRemainder;

		if (tmpDotIndex > -1)
		{
			tmpPrefix = pAddress.substring(0, tmpDotIndex);
			tmpRemainder = pAddress.substring(tmpDotIndex + 1);
		}
		else
		{
			tmpPrefix = pAddress;
			tmpRemainder = '';
		}

		switch (tmpPrefix)
		{
			case 'Global':
				return this._setOnObject(pExecutionContext.GlobalState, tmpRemainder, pValue);

			case 'Operation':
				return this._setOnObject(pExecutionContext.OperationState, tmpRemainder, pValue);

			case 'Task':
				if (!pCurrentNodeHash)
				{
					this.log.warn(`UltravisorStateManager: setAddress for Task.X requires a current node hash.`);
					return false;
				}
				if (!pExecutionContext.TaskOutputs[pCurrentNodeHash])
				{
					pExecutionContext.TaskOutputs[pCurrentNodeHash] = {};
				}
				return this._setOnObject(
					pExecutionContext.TaskOutputs[pCurrentNodeHash],
					tmpRemainder, pValue);

			case 'TaskOutput':
			{
				let tmpSecondDot = tmpRemainder.indexOf('.');
				if (tmpSecondDot < 0)
				{
					// Setting the entire TaskOutput for a node
					pExecutionContext.TaskOutputs[tmpRemainder] = pValue;
					return true;
				}
				let tmpNodeHash = tmpRemainder.substring(0, tmpSecondDot);
				let tmpPath = tmpRemainder.substring(tmpSecondDot + 1);
				if (!pExecutionContext.TaskOutputs[tmpNodeHash])
				{
					pExecutionContext.TaskOutputs[tmpNodeHash] = {};
				}
				return this._setOnObject(
					pExecutionContext.TaskOutputs[tmpNodeHash],
					tmpPath, pValue);
			}

			default:
				// Default: write to OperationState
				return this._setOnObject(pExecutionContext.OperationState, pAddress, pValue);
		}
	}

	/**
	 * Build a root data object for Pict template resolution.
	 * This object can be passed to pict.parseTemplate as the record.
	 *
	 * @param {object} pExecutionContext - The runtime execution context.
	 * @param {*} [pSourceValue] - An optional source value (e.g. for state connection resolution).
	 * @returns {object} Root data object with all state levels.
	 */
	buildTemplateContext(pExecutionContext, pSourceValue)
	{
		return {
			Value: pSourceValue,
			Global: pExecutionContext.GlobalState || {},
			Operation: pExecutionContext.OperationState || {},
			TaskOutput: pExecutionContext.TaskOutputs || {},
			Staging: { Path: pExecutionContext.StagingPath || '' }
		};
	}

	// --- Internal helpers ---

	_resolveFromObject(pObject, pPath)
	{
		if (!pObject || typeof(pObject) !== 'object')
		{
			return undefined;
		}

		if (!pPath || pPath === '')
		{
			return pObject;
		}

		return this._Manyfest.getValueAtAddress(pObject, pPath);
	}

	_setOnObject(pObject, pPath, pValue)
	{
		if (!pObject || typeof(pObject) !== 'object')
		{
			return false;
		}

		if (!pPath || pPath === '')
		{
			return false;
		}

		this._Manyfest.setValueAtAddress(pObject, pPath, pValue);
		return true;
	}
}

module.exports = UltravisorStateManager;
