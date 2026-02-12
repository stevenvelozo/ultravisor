const libPictService = require(`pict-serviceproviderbase`);

const libFS = require('fs');
const libPath = require('path');

class UltravisorOperationManifest extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		// In-memory store of recent operation manifests
		this._Manifests = {};
	}

	createManifest(pOperationDefinition)
	{
		let tmpManifest = {
			GUIDOperation: pOperationDefinition.GUIDOperation,
			Name: pOperationDefinition.Name || pOperationDefinition.GUIDOperation,
			StartTime: new Date().toISOString(),
			StopTime: null,
			Status: 'Running',
			Success: false,
			TaskResults: [],
			Summary: '',
			Log: []
		};

		tmpManifest.Log.push(`Operation ${tmpManifest.GUIDOperation} started at ${tmpManifest.StartTime}`);

		// Store it keyed by a run ID
		let tmpRunGUID = `${tmpManifest.GUIDOperation}-${Date.now()}`;
		tmpManifest.GUIDRun = tmpRunGUID;
		this._Manifests[tmpRunGUID] = tmpManifest;

		return tmpManifest;
	}

	addTaskResult(pManifest, pTaskResult)
	{
		if (!pManifest || !pTaskResult)
		{
			return;
		}
		pManifest.TaskResults.push(pTaskResult);
		pManifest.Log.push(`Task ${pTaskResult.GUIDTask} completed with status: ${pTaskResult.Status}`);
	}

	finalizeManifest(pManifest, pStagingPath)
	{
		if (!pManifest)
		{
			return;
		}
		pManifest.StopTime = new Date().toISOString();

		// Determine overall success from task results
		let tmpAllSucceeded = true;
		for (let i = 0; i < pManifest.TaskResults.length; i++)
		{
			if (!pManifest.TaskResults[i].Success)
			{
				tmpAllSucceeded = false;
			}
		}

		pManifest.Success = tmpAllSucceeded;
		pManifest.Status = tmpAllSucceeded ? 'Complete' : 'Error';

		// Compute elapsed time from ISO timestamps
		let tmpElapsedMs = new Date(pManifest.StopTime).getTime() - new Date(pManifest.StartTime).getTime();
		if (!pManifest.ElapsedMs)
		{
			pManifest.ElapsedMs = tmpElapsedMs;
		}
		if (!pManifest.ElapsedFormatted)
		{
			pManifest.ElapsedFormatted = this.fable.ProgressTime.formatTimeDuration(tmpElapsedMs);
		}

		pManifest.Summary = `Operation ${pManifest.GUIDOperation} ${pManifest.Status}: ${pManifest.TaskResults.length} task(s) executed in ${pManifest.ElapsedFormatted}.`;
		pManifest.Log.push(pManifest.Summary);

		// Write the manifest JSON to the staging folder
		if (pStagingPath && typeof(pStagingPath) === 'string' && pStagingPath.length > 0)
		{
			try
			{
				if (!libFS.existsSync(pStagingPath))
				{
					libFS.mkdirSync(pStagingPath, { recursive: true });
				}

				let tmpManifestFileName = `Manifest_${pManifest.GUIDOperation}.json`;
				let tmpManifestFilePath = libPath.resolve(pStagingPath, tmpManifestFileName);
				let tmpContent = JSON.stringify(pManifest, null, 4);
				libFS.writeFileSync(tmpManifestFilePath, tmpContent, 'utf8');

				pManifest.ManifestFilePath = tmpManifestFilePath;
				pManifest.Log.push(`Manifest written to ${tmpManifestFilePath}`);
			}
			catch (pError)
			{
				pManifest.Log.push(`Error writing manifest file: ${pError.message}`);
			}
		}

		return pManifest;
	}

	/**
	 * Create and store a manifest for a standalone task execution result.
	 */
	createTaskManifest(pTaskResult)
	{
		if (!pTaskResult)
		{
			return null;
		}

		let tmpRunGUID = `Task-${pTaskResult.GUIDTask}-${Date.now()}`;

		let tmpManifest = {
			GUIDRun: tmpRunGUID,
			GUIDOperation: null,
			GUIDTask: pTaskResult.GUIDTask,
			Name: pTaskResult.Name || pTaskResult.GUIDTask,
			StartTime: pTaskResult.StartTime || new Date().toISOString(),
			StopTime: pTaskResult.StopTime || new Date().toISOString(),
			Status: pTaskResult.Status || 'Unknown',
			Success: pTaskResult.Success || false,
			TaskResults: [pTaskResult],
			Summary: `Task ${pTaskResult.GUIDTask} ${pTaskResult.Status}: standalone execution.`,
			Log: pTaskResult.Log || []
		};

		this._Manifests[tmpRunGUID] = tmpManifest;

		return tmpManifest;
	}

	getManifest(pRunGUID)
	{
		return this._Manifests[pRunGUID] || null;
	}

	getManifestList()
	{
		let tmpManifests = [];
		let tmpKeys = Object.keys(this._Manifests);
		for (let i = 0; i < tmpKeys.length; i++)
		{
			tmpManifests.push(this._Manifests[tmpKeys[i]]);
		}
		return tmpManifests;
	}
}

module.exports = UltravisorOperationManifest;
