const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libFS = require('fs');
const libPath = require('path');

class UltravisorTaskListFiles extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * List files in the staging folder (or a sub-path within it).
	 *
	 * Task definition fields:
	 *   - Path (optional): sub-directory within the staging folder
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpStagingPath = this.resolveStagingPath(pContext);
		let tmpTargetPath = tmpStagingPath;

		if (pTaskDefinition.Path && typeof(pTaskDefinition.Path) === 'string' && pTaskDefinition.Path.length > 0)
		{
			let tmpResolved = this.resolveStagingFilePath(tmpStagingPath, pTaskDefinition.Path);
			if (!tmpResolved)
			{
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Error';
				pManifestEntry.Log.push(`ListFiles: invalid path "${pTaskDefinition.Path}".`);
				return fCallback(null, pManifestEntry);
			}
			tmpTargetPath = tmpResolved;
		}

		pManifestEntry.Log.push(`ListFiles: listing files in ${tmpTargetPath}`);

		try
		{
			if (!libFS.existsSync(tmpTargetPath))
			{
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Error';
				pManifestEntry.Log.push(`ListFiles: path does not exist: ${tmpTargetPath}`);
				return fCallback(null, pManifestEntry);
			}

			let tmpFiles = libFS.readdirSync(tmpTargetPath);
			let tmpResults = [];

			for (let i = 0; i < tmpFiles.length; i++)
			{
				let tmpFullPath = libPath.join(tmpTargetPath, tmpFiles[i]);
				try
				{
					let tmpStat = libFS.statSync(tmpFullPath);
					tmpResults.push(
						{
							Name: tmpFiles[i],
							Size: tmpStat.size,
							IsDirectory: tmpStat.isDirectory(),
							Modified: tmpStat.mtime.toISOString()
						});
				}
				catch (pStatError)
				{
					tmpResults.push({ Name: tmpFiles[i], Error: pStatError.message });
				}
			}

			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = JSON.stringify(tmpResults);
			pManifestEntry.Log.push(`ListFiles: found ${tmpResults.length} entries.`);
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`ListFiles: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskListFiles;
