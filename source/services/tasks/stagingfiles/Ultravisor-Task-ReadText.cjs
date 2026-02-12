const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libFS = require('fs');

class UltravisorTaskReadText extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Read a text file from the staging folder.
	 *
	 * Task definition fields:
	 *   - File: relative file path inside the staging folder
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the text content is stored (defaults to "Output")
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpStagingPath = this.resolveStagingPath(pContext);
		let tmpFilePath = this.resolveStagingFilePath(tmpStagingPath, pTaskDefinition.File);

		if (!tmpFilePath)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`ReadText: missing or invalid File field.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`ReadText: reading from ${tmpFilePath}`);

		try
		{
			if (!libFS.existsSync(tmpFilePath))
			{
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Error';
				pManifestEntry.Log.push(`ReadText: file does not exist: ${tmpFilePath}`);
				return fCallback(null, pManifestEntry);
			}

			let tmpContent = libFS.readFileSync(tmpFilePath, 'utf8');

			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = tmpContent;
			pManifestEntry.Log.push(`ReadText: read ${tmpContent.length} bytes.`);

			this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpContent);
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`ReadText: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskReadText;
