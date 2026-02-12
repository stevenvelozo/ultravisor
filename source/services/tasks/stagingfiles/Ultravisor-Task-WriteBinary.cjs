const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libFS = require('fs');
const libPath = require('path');

class UltravisorTaskWriteBinary extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Write binary data to a file in the staging folder.
	 *
	 * Task definition fields:
	 *   - File: relative file path inside the staging folder
	 *   - Data: the data to write — may be a Buffer, a base64 string,
	 *           or an array of byte values
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpStagingPath = this.resolveStagingPath(pContext);
		let tmpFilePath = this.resolveStagingFilePath(tmpStagingPath, pTaskDefinition.File);

		if (!tmpFilePath)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteBinary: missing or invalid File field.`);
			return fCallback(null, pManifestEntry);
		}

		if (!pTaskDefinition.hasOwnProperty('Data'))
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteBinary: missing Data field.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`WriteBinary: writing to ${tmpFilePath}`);

		try
		{
			let tmpDir = libPath.dirname(tmpFilePath);
			if (!libFS.existsSync(tmpDir))
			{
				libFS.mkdirSync(tmpDir, { recursive: true });
			}

			let tmpBuffer;

			if (Buffer.isBuffer(pTaskDefinition.Data))
			{
				tmpBuffer = pTaskDefinition.Data;
			}
			else if (typeof(pTaskDefinition.Data) === 'string')
			{
				// Treat string data as base64 encoded
				tmpBuffer = Buffer.from(pTaskDefinition.Data, 'base64');
			}
			else if (Array.isArray(pTaskDefinition.Data))
			{
				// Treat array as byte values
				tmpBuffer = Buffer.from(pTaskDefinition.Data);
			}
			else
			{
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Error';
				pManifestEntry.Log.push(`WriteBinary: Data must be a Buffer, base64 string, or array of byte values.`);
				return fCallback(null, pManifestEntry);
			}

			libFS.writeFileSync(tmpFilePath, tmpBuffer);

			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = `${tmpBuffer.length} bytes written`;
			pManifestEntry.Log.push(`WriteBinary: wrote ${tmpBuffer.length} bytes.`);
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteBinary: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskWriteBinary;
