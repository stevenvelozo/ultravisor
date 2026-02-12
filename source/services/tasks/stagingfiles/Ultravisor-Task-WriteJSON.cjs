const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libFS = require('fs');
const libPath = require('path');

class UltravisorTaskWriteJSON extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Write JSON data to a file in the staging folder.
	 *
	 * Task definition fields:
	 *   - File: relative file path inside the staging folder
	 *   - Address (optional): dot-notation path into GlobalState to
	 *       resolve the data to write (used instead of Data)
	 *   - Data: the object/value to serialise as JSON
	 *
	 * Either Address or Data must be provided.  When Address is set,
	 * the data is resolved from pContext.GlobalState (or NodeState).
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpStagingPath = this.resolveStagingPath(pContext);
		let tmpFilePath = this.resolveStagingFilePath(tmpStagingPath, pTaskDefinition.File);

		if (!tmpFilePath)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteJSON: missing or invalid File field.`);
			return fCallback(null, pManifestEntry);
		}

		// Resolve data from Address or Data
		let tmpData;

		if (pTaskDefinition.Address && typeof(pTaskDefinition.Address) === 'string')
		{
			tmpData = this.resolveAddress(pTaskDefinition.Address, pContext);
			pManifestEntry.Log.push(`WriteJSON: resolved data from Address "${pTaskDefinition.Address}".`);
		}
		else if (pTaskDefinition.hasOwnProperty('Data'))
		{
			tmpData = pTaskDefinition.Data;
		}
		else
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteJSON: missing Data or Address field.`);
			return fCallback(null, pManifestEntry);
		}

		if (tmpData === undefined)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteJSON: resolved data is undefined.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`WriteJSON: writing to ${tmpFilePath}`);

		try
		{
			let tmpDir = libPath.dirname(tmpFilePath);
			if (!libFS.existsSync(tmpDir))
			{
				libFS.mkdirSync(tmpDir, { recursive: true });
			}

			let tmpContent = JSON.stringify(tmpData, null, 4);
			libFS.writeFileSync(tmpFilePath, tmpContent, 'utf8');

			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = `${tmpContent.length} bytes written`;
			pManifestEntry.Log.push(`WriteJSON: wrote ${tmpContent.length} bytes.`);
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteJSON: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskWriteJSON;
