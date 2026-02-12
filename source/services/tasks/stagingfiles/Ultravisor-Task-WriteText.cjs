const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libFS = require('fs');
const libPath = require('path');

class UltravisorTaskWriteText extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Write text content to a file in the staging folder.
	 *
	 * Task definition fields:
	 *   - File: relative file path inside the staging folder
	 *   - Address (optional): dot-notation path into GlobalState to
	 *       resolve the data to write (used instead of Data)
	 *   - Data: the string to write
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
			pManifestEntry.Log.push(`WriteText: missing or invalid File field.`);
			return fCallback(null, pManifestEntry);
		}

		// Resolve data from Address or Data
		let tmpData;

		if (pTaskDefinition.Address && typeof(pTaskDefinition.Address) === 'string')
		{
			tmpData = this.resolveAddress(pTaskDefinition.Address, pContext);
			pManifestEntry.Log.push(`WriteText: resolved data from Address "${pTaskDefinition.Address}".`);
		}
		else if (pTaskDefinition.hasOwnProperty('Data'))
		{
			tmpData = pTaskDefinition.Data;
		}
		else
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteText: missing Data or Address field.`);
			return fCallback(null, pManifestEntry);
		}

		if (tmpData === undefined)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteText: resolved data is undefined.`);
			return fCallback(null, pManifestEntry);
		}

		let tmpContent = (typeof(tmpData) === 'string')
			? tmpData
			: String(tmpData);

		pManifestEntry.Log.push(`WriteText: writing to ${tmpFilePath}`);

		try
		{
			let tmpDir = libPath.dirname(tmpFilePath);
			if (!libFS.existsSync(tmpDir))
			{
				libFS.mkdirSync(tmpDir, { recursive: true });
			}

			libFS.writeFileSync(tmpFilePath, tmpContent, 'utf8');

			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = `${tmpContent.length} bytes written`;
			pManifestEntry.Log.push(`WriteText: wrote ${tmpContent.length} bytes.`);
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteText: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskWriteText;
