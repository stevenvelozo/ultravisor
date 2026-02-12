const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libFS = require('fs');
const libPath = require('path');

class UltravisorTaskCopyFile extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Copy a local file into the staging folder.
	 *
	 * Task definition fields:
	 *   - Source: absolute path to the local file to copy
	 *   - File: relative destination path inside the staging folder
	 *   - Address (optional): dot-notation path into GlobalState
	 *       containing the source path (used instead of Source)
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpStagingPath = this.resolveStagingPath(pContext);

		// --- Resolve the source path ---
		let tmpSourcePath = undefined;

		if (pTaskDefinition.Address && typeof(pTaskDefinition.Address) === 'string')
		{
			tmpSourcePath = this.resolveAddress(pTaskDefinition.Address, pContext);
			pManifestEntry.Log.push(`CopyFile: resolved source from Address "${pTaskDefinition.Address}".`);
		}
		else if (pTaskDefinition.Source && typeof(pTaskDefinition.Source) === 'string')
		{
			tmpSourcePath = pTaskDefinition.Source;
		}

		if (!tmpSourcePath || typeof(tmpSourcePath) !== 'string' || tmpSourcePath.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`CopyFile: missing or invalid Source (or Address) field.`);
			return fCallback(null, pManifestEntry);
		}

		// --- Resolve the destination path ---
		let tmpDestFilePath = this.resolveStagingFilePath(tmpStagingPath, pTaskDefinition.File);

		if (!tmpDestFilePath)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`CopyFile: missing or invalid File field.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`CopyFile: copying "${tmpSourcePath}" to "${tmpDestFilePath}".`);

		try
		{
			// Verify the source file exists
			if (!libFS.existsSync(tmpSourcePath))
			{
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Error';
				pManifestEntry.Log.push(`CopyFile: source file not found: "${tmpSourcePath}".`);
				return fCallback(null, pManifestEntry);
			}

			// Verify the source is a file (not a directory)
			let tmpSourceStat = libFS.statSync(tmpSourcePath);
			if (!tmpSourceStat.isFile())
			{
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Error';
				pManifestEntry.Log.push(`CopyFile: source is not a file: "${tmpSourcePath}".`);
				return fCallback(null, pManifestEntry);
			}

			// Ensure the destination directory exists
			let tmpDir = libPath.dirname(tmpDestFilePath);
			if (!libFS.existsSync(tmpDir))
			{
				libFS.mkdirSync(tmpDir, { recursive: true });
			}

			// Copy the file
			libFS.copyFileSync(tmpSourcePath, tmpDestFilePath);

			let tmpDestStat = libFS.statSync(tmpDestFilePath);

			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = `${tmpDestStat.size} bytes copied`;
			pManifestEntry.Log.push(`CopyFile: copied ${tmpDestStat.size} bytes.`);
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`CopyFile: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskCopyFile;
