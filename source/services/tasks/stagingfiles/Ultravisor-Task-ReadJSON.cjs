const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libFS = require('fs');

class UltravisorTaskReadJSON extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Read a JSON file from the staging folder and parse it.
	 *
	 * Task definition fields:
	 *   - File: relative file path inside the staging folder
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the parsed object is stored (defaults to "Output")
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpStagingPath = this.resolveStagingPath(pContext);
		let tmpFilePath = this.resolveStagingFilePath(tmpStagingPath, pTaskDefinition.File);

		if (!tmpFilePath)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`ReadJSON: missing or invalid File field.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`ReadJSON: reading from ${tmpFilePath}`);

		try
		{
			if (!libFS.existsSync(tmpFilePath))
			{
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Error';
				pManifestEntry.Log.push(`ReadJSON: file does not exist: ${tmpFilePath}`);
				return fCallback(null, pManifestEntry);
			}

			let tmpRaw = libFS.readFileSync(tmpFilePath, 'utf8');
			let tmpParsed = JSON.parse(tmpRaw);

			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = JSON.stringify(tmpParsed);
			pManifestEntry.Log.push(`ReadJSON: read ${tmpRaw.length} bytes, parsed successfully.`);

			this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpParsed);
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`ReadJSON: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskReadJSON;
