const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libFS = require('fs');

class UltravisorTaskReadBinary extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Read a binary file from the staging folder.
	 *
	 * Task definition fields:
	 *   - File: relative file path inside the staging folder
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the binary data is stored as base64 (defaults to "Output")
	 *   - Persist (optional): where to store the result
	 *       string  -- manyfest address into GlobalState (stores base64)
	 *       { Address: "..." } -- same as string form
	 *       { File: "..." }   -- copies the binary to another staging path
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpStagingPath = this.resolveStagingPath(pContext);
		let tmpFilePath = this.resolveStagingFilePath(tmpStagingPath, pTaskDefinition.File);

		if (!tmpFilePath)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`ReadBinary: missing or invalid File field.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`ReadBinary: reading from ${tmpFilePath}`);

		try
		{
			if (!libFS.existsSync(tmpFilePath))
			{
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Error';
				pManifestEntry.Log.push(`ReadBinary: file does not exist: ${tmpFilePath}`);
				return fCallback(null, pManifestEntry);
			}

			let tmpBuffer = libFS.readFileSync(tmpFilePath);

			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = `${tmpBuffer.length} bytes read`;
			pManifestEntry.Log.push(`ReadBinary: read ${tmpBuffer.length} bytes.`);

			this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpBuffer.toString('base64'));

			// When persisting to a state address, store as base64 string
			if (pTaskDefinition.Persist)
			{
				let tmpPersist = pTaskDefinition.Persist;
				let tmpIsAddressPersist = (typeof(tmpPersist) === 'string') ||
					(typeof(tmpPersist) === 'object' && tmpPersist !== null && tmpPersist.Address);

				if (tmpIsAddressPersist)
				{
					this.storeResult(pTaskDefinition, pContext, pManifestEntry, tmpBuffer.toString('base64'));
				}
				else
				{
					this.storeResult(pTaskDefinition, pContext, pManifestEntry, tmpBuffer);
				}
			}
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`ReadBinary: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskReadBinary;
