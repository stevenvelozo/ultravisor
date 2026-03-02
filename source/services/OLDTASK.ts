const libFS = require('fs');
const libPath = require('path');

class UltravisorTaskBase
{
	constructor(pFable)
	{
		this.fable = pFable;
		this.log = pFable.log;

		this._Manyfest = this.fable.newManyfest();

		// Potential inputs to be set and/or wired in (some may be required)
		this._InputSchema = {};
		// Potential outputs to be set
		this._OutputSchema = {};
	}

	addErrorOutput()
	{
		this._OutputSchema.Error = {
			Type: 'String',
			Description: 'Error message if the task throws an error'
		};
	}

	addWarningOutput()
	{
		this._OutputSchema.Warning = {
			Type: 'Array',
			Description: 'Warning messages if the task throws a warning during operation'
		};
	}

	/**
	 * Execute the task type logic.
	 * Subclasses must override this method.
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		pManifestEntry.StopTime = new Date().toISOString();
		pManifestEntry.Status = 'Unsupported';
		pManifestEntry.Log.push(`Task type not implemented in base class.`);
		return fCallback(null, pManifestEntry);
	}

	/**
	 * Resolve the staging folder path.
	 *
	 * Priority:
	 *   1. pContext.StagingPath (per-operation override)
	 *   2. UltravisorFileStorePath from ProgramConfiguration
	 *   3. ${cwd}/dist/ultravisor_datastore (fallback)
	 *
	 * @param {object} pContext - Execution context.
	 * @returns {string} Absolute path to the staging folder.
	 */
	resolveStagingPath(pContext)
	{
		if (pContext && pContext.StagingPath && pContext.StagingPath.length > 0)
		{
			return pContext.StagingPath;
		}
		return (this.fable?.ProgramConfiguration?.UltravisorFileStorePath) || `${process.cwd()}/dist/ultravisor_datastore`;
	}

	/**
	 * Build a full file path inside the staging folder.
	 * Prevents path traversal by rejecting paths containing "..".
	 *
	 * @param {string} pStagingPath - Base staging folder.
	 * @param {string} pFileName - Relative file name or path.
	 * @returns {string|false} Full path or false if invalid.
	 */
	resolveStagingFilePath(pStagingPath, pFileName)
	{
		if (!pFileName || typeof(pFileName) !== 'string' || pFileName.length === 0)
		{
			return false;
		}
		if (pFileName.indexOf('..') !== -1)
		{
			return false;
		}
		return libPath.resolve(pStagingPath, pFileName);
	}

	readStagingFile(pStagingPath, pFileName, fCallback)
	{
		const tmpFullFilePath = this.resolveStagingFilePath(pStagingPath, pFileName);
		if (!tmpFullFilePath)
		{
			return fCallback(new Error(`Invalid file name: ${pFileName}`));
		}
		libFS.readFile(tmpFullFilePath, 'utf8', fCallback);
	}

	/**
	 * Resolve a dot-notation address from the execution context via manyfest.
	 *
	 * Looks up the address in:
	 *   1. pContext.GlobalState
	 *   2. pContext.NodeState
	 *   3. The pict's resolveStateFromAddress method (which can access manifold contexts)
	 *
	 * @param {string} pAddress - Dot-notation path (e.g. "Flags.Enabled").
	 * @param {object} pContext - Execution context.
	 * @returns {*} The resolved value, or undefined if not found.
	 */
	resolveAddress(pAddress, pContext)
	{
		if (!pAddress || (typeof(pAddress) !== 'string') || !pContext)
		{
			return undefined;
		}

		// First NodeState
		let tmpValue = this._Manyfest.getValueByHash(pContext.NodeState, pAddress);
		if (tmpValue !== undefined)
		{
			return tmpValue;
		}

		// Then GlobalState
		tmpValue = this._Manyfest.getValueByHash(pContext.GlobalState, pAddress);
		if (tmpValue !== undefined)
		{
			return tmpValue;
		}

		// This passes context as the ContextArray[0] and the task itself as Record
		return this.pict.resolveStateFromAddress(pAddress, this, [pContext]);
	}
}

module.exports = UltravisorTaskBase;
