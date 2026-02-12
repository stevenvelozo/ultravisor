const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libFS = require('fs');

class UltravisorTaskReadXML extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Read an XML file from the staging folder and return it as a string.
	 *
	 * The raw XML content is returned in Output. No parsing is performed
	 * -- the caller is responsible for interpreting the XML structure.
	 *
	 * Task definition fields:
	 *   - File: relative file path inside the staging folder
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the XML content is stored (defaults to "Output")
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpStagingPath = this.resolveStagingPath(pContext);
		let tmpFilePath = this.resolveStagingFilePath(tmpStagingPath, pTaskDefinition.File);

		if (!tmpFilePath)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`ReadXML: missing or invalid File field.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`ReadXML: reading from ${tmpFilePath}`);

		try
		{
			if (!libFS.existsSync(tmpFilePath))
			{
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Error';
				pManifestEntry.Log.push(`ReadXML: file does not exist: ${tmpFilePath}`);
				return fCallback(null, pManifestEntry);
			}

			let tmpContent = libFS.readFileSync(tmpFilePath, 'utf8');

			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = tmpContent;
			pManifestEntry.Log.push(`ReadXML: read ${tmpContent.length} bytes.`);

			this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpContent);
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`ReadXML: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskReadXML;
