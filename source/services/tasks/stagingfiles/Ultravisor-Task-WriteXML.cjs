const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libFS = require('fs');
const libPath = require('path');

class UltravisorTaskWriteXML extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Write XML content to a file in the staging folder.
	 *
	 * The Data field should be a string containing well-formed XML.
	 * Creates intermediate directories automatically.
	 *
	 * Task definition fields:
	 *   - File: relative file path inside the staging folder
	 *   - Address (optional): dot-notation path into GlobalState to
	 *       resolve the data to write (used instead of Data)
	 *   - Data: XML string to write
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
			pManifestEntry.Log.push(`WriteXML: missing or invalid File field.`);
			return fCallback(null, pManifestEntry);
		}

		// Resolve data from Address or Data
		let tmpData;

		if (pTaskDefinition.Address && typeof(pTaskDefinition.Address) === 'string')
		{
			tmpData = this.resolveAddress(pTaskDefinition.Address, pContext);
			pManifestEntry.Log.push(`WriteXML: resolved data from Address "${pTaskDefinition.Address}".`);
		}
		else if (pTaskDefinition.hasOwnProperty('Data'))
		{
			tmpData = pTaskDefinition.Data;
		}
		else
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteXML: missing Data or Address field.`);
			return fCallback(null, pManifestEntry);
		}

		if (tmpData === undefined)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteXML: resolved data is undefined.`);
			return fCallback(null, pManifestEntry);
		}

		let tmpContent = (typeof(tmpData) === 'string')
			? tmpData
			: String(tmpData);

		pManifestEntry.Log.push(`WriteXML: writing to ${tmpFilePath}`);

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
			pManifestEntry.Log.push(`WriteXML: wrote ${tmpContent.length} bytes.`);
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteXML: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskWriteXML;
