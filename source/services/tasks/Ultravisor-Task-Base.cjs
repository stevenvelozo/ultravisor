const libFS = require('fs');
const libPath = require('path');

class UltravisorTaskBase
{
	constructor(pFable)
	{
		this.fable = pFable;
		this.log = pFable.log;

		this._Manyfest = this.fable.newManyfest();
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
		return (this.fable?.ProgramConfiguration?.UltravisorFileStorePath)
			|| `${process.cwd()}/dist/ultravisor_datastore`;
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

	/**
	 * Resolve a dot-notation address from the execution context.
	 *
	 * Looks up the address in:
	 *   1. pContext.GlobalState
	 *   2. pContext.NodeState
	 *
	 * @param {string} pAddress - Dot-notation path (e.g. "Flags.Enabled").
	 * @param {object} pContext - Execution context.
	 * @returns {*} The resolved value, or undefined if not found.
	 */
	resolveAddress(pAddress, pContext)
	{
		if (!pAddress || !pContext)
		{
			return undefined;
		}

		let tmpParts = pAddress.split('.');

		// Try GlobalState first
		let tmpValue = this.walkObject(pContext.GlobalState, tmpParts);
		if (tmpValue !== undefined)
		{
			return tmpValue;
		}

		// Fall back to NodeState
		return this.walkObject(pContext.NodeState, tmpParts);
	}

	/**
	 * Walk an object by a path array.
	 *
	 * @param {object} pObject - Object to walk.
	 * @param {array} pParts - Array of keys.
	 * @returns {*} Value at the path, or undefined.
	 */
	walkObject(pObject, pParts)
	{
		if (!pObject || typeof(pObject) !== 'object')
		{
			return undefined;
		}

		let tmpCurrent = pObject;
		for (let i = 0; i < pParts.length; i++)
		{
			if (tmpCurrent === null || tmpCurrent === undefined || typeof(tmpCurrent) !== 'object')
			{
				return undefined;
			}
			tmpCurrent = tmpCurrent[pParts[i]];
		}

		return tmpCurrent;
	}

	// =========================================================================
	// Destination -- store task output at a manyfest address in GlobalState
	// =========================================================================

	/**
	 * Store the task output at a manyfest address in pContext.GlobalState.
	 *
	 * The address is taken from pTaskDefinition.Destination.  If Destination
	 * is not set, the data is stored at "Output" (the default address).
	 *
	 * This provides a consistent way for all Read and Get task types to
	 * declare where their data goes in the operation's shared state.
	 *
	 * @param {object} pTaskDefinition - The task definition (checked for .Destination).
	 * @param {object} pContext - Execution context (GlobalState).
	 * @param {object} pManifestEntry - The manifest entry (for logging).
	 * @param {*} pData - The data to store.
	 */
	storeDestination(pTaskDefinition, pContext, pManifestEntry, pData)
	{
		let tmpDestination = (pTaskDefinition.Destination && typeof(pTaskDefinition.Destination) === 'string' && pTaskDefinition.Destination.length > 0)
			? pTaskDefinition.Destination
			: 'Output';

		if (!pContext.GlobalState || typeof(pContext.GlobalState) !== 'object')
		{
			pContext.GlobalState = {};
		}

		this._Manyfest.setValueAtAddress(pContext.GlobalState, tmpDestination, pData);
		pManifestEntry.Log.push(`Destination: stored result at "${tmpDestination}".`);
	}

	// =========================================================================
	// Persist -- store task output to state address or staging file
	// =========================================================================

	/**
	 * Persist task output according to the Persist parameter on the task
	 * definition.
	 *
	 * Persist can be:
	 *   - A manyfest address string (dot-notation) -- stores pData into
	 *     pContext.GlobalState at that address.
	 *   - An object with:
	 *       { "Address": "Some.State.Path" } -- same as the string form
	 *       { "File": "relative/path.json" } -- writes pData as JSON to
	 *           a file relative to the staging folder
	 *       { "File": "relative/path.bin" } -- writes pData as a Buffer
	 *           to a file relative to the staging folder (for binary data)
	 *
	 * @param {object} pTaskDefinition - The task definition (checked for .Persist).
	 * @param {object} pContext - Execution context (GlobalState, StagingPath).
	 * @param {object} pManifestEntry - The manifest entry (for logging).
	 * @param {*} pData - The data to persist (string, object, or Buffer).
	 */
	storeResult(pTaskDefinition, pContext, pManifestEntry, pData)
	{
		if (!pTaskDefinition.Persist)
		{
			return;
		}

		let tmpPersist = pTaskDefinition.Persist;

		// String form -- treat as a manyfest address into GlobalState
		if (typeof(tmpPersist) === 'string' && tmpPersist.length > 0)
		{
			if (!pContext.GlobalState || typeof(pContext.GlobalState) !== 'object')
			{
				pContext.GlobalState = {};
			}
			this._Manyfest.setValueAtAddress(pContext.GlobalState, tmpPersist, pData);
			pManifestEntry.Log.push(`Persist: stored result at state address "${tmpPersist}".`);
			return;
		}

		if (typeof(tmpPersist) !== 'object' || tmpPersist === null)
		{
			pManifestEntry.Log.push(`Persist: invalid Persist value (expected string or object).`);
			return;
		}

		// Object form with Address -- store in GlobalState
		if (tmpPersist.Address && typeof(tmpPersist.Address) === 'string')
		{
			if (!pContext.GlobalState || typeof(pContext.GlobalState) !== 'object')
			{
				pContext.GlobalState = {};
			}
			this._Manyfest.setValueAtAddress(pContext.GlobalState, tmpPersist.Address, pData);
			pManifestEntry.Log.push(`Persist: stored result at state address "${tmpPersist.Address}".`);
			return;
		}

		// Object form with File -- write to staging folder
		if (tmpPersist.File && typeof(tmpPersist.File) === 'string')
		{
			let tmpStagingPath = this.resolveStagingPath(pContext);
			let tmpFilePath = this.resolveStagingFilePath(tmpStagingPath, tmpPersist.File);

			if (!tmpFilePath)
			{
				pManifestEntry.Log.push(`Persist: invalid file path "${tmpPersist.File}".`);
				return;
			}

			try
			{
				let tmpDir = libPath.dirname(tmpFilePath);
				if (!libFS.existsSync(tmpDir))
				{
					libFS.mkdirSync(tmpDir, { recursive: true });
				}

				if (Buffer.isBuffer(pData))
				{
					libFS.writeFileSync(tmpFilePath, pData);
					pManifestEntry.Log.push(`Persist: wrote ${pData.length} bytes (binary) to "${tmpPersist.File}".`);
				}
				else
				{
					let tmpContent = (typeof(pData) === 'string') ? pData : JSON.stringify(pData, null, 4);
					libFS.writeFileSync(tmpFilePath, tmpContent, 'utf8');
					pManifestEntry.Log.push(`Persist: wrote ${tmpContent.length} bytes to "${tmpPersist.File}".`);
				}
			}
			catch (pError)
			{
				pManifestEntry.Log.push(`Persist: error writing to file: ${pError.message}`);
			}
			return;
		}

		pManifestEntry.Log.push(`Persist: object must have an "Address" or "File" property.`);
	}
}

module.exports = UltravisorTaskBase;
