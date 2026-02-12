const libUltravisorTaskBase = require('./Ultravisor-Task-Base.cjs');

const libFS = require('fs');
const libPath = require('path');

class UltravisorTaskGeneratePagedOperation extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Generate a paged operation from a template and optionally execute it.
	 *
	 * Task definition fields:
	 *   - RecordCount: GlobalState address (string) or literal number for
	 *       the total record count.
	 *   - PageSize (optional, default 25): records per page.
	 *   - MaximumRecordCount (optional): cap the resolved RecordCount to
	 *       this value.  Useful for fetching only the first N records.
	 *   - TaskTemplate: a task definition object used as the template for
	 *       each page-fetch task.  String values in the template support
	 *       interpolation variables: {PageStart}, {PageSize}, {PageIndex},
	 *       {PageCount}.
	 *   - OperationName (optional): human-readable name for the generated
	 *       operation.
	 *   - AutoExecute (optional, default true): whether to execute the
	 *       generated operation immediately.
	 *   - Retries (optional, default 0): number of retries per page task.
	 *   - Destination (optional): manyfest address in GlobalState to store
	 *       the generated operation GUID.
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		// --- Resolve record count ---
		let tmpRecordCount;

		if (typeof(pTaskDefinition.RecordCount) === 'number')
		{
			tmpRecordCount = pTaskDefinition.RecordCount;
		}
		else if (typeof(pTaskDefinition.RecordCount) === 'string')
		{
			let tmpResolved = this.resolveAddress(pTaskDefinition.RecordCount, pContext);

			if (typeof(tmpResolved) === 'number')
			{
				tmpRecordCount = tmpResolved;
			}
			else if (typeof(tmpResolved) === 'string')
			{
				tmpRecordCount = parseInt(tmpResolved, 10);
			}
			else
			{
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Error';
				pManifestEntry.Log.push(`GeneratePagedOperation: could not resolve RecordCount from "${pTaskDefinition.RecordCount}".`);
				return fCallback(null, pManifestEntry);
			}
		}
		else
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GeneratePagedOperation: RecordCount is required (number or GlobalState address).`);
			return fCallback(null, pManifestEntry);
		}

		if (isNaN(tmpRecordCount) || tmpRecordCount < 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GeneratePagedOperation: RecordCount resolved to invalid value: ${tmpRecordCount}.`);
			return fCallback(null, pManifestEntry);
		}

		// --- Apply MaximumRecordCount cap ---
		if (typeof(pTaskDefinition.MaximumRecordCount) === 'number' && pTaskDefinition.MaximumRecordCount > 0)
		{
			if (tmpRecordCount > pTaskDefinition.MaximumRecordCount)
			{
				pManifestEntry.Log.push(`GeneratePagedOperation: capping RecordCount from ${tmpRecordCount} to MaximumRecordCount ${pTaskDefinition.MaximumRecordCount}.`);
				tmpRecordCount = pTaskDefinition.MaximumRecordCount;
			}
		}

		// --- Validate TaskTemplate ---
		if (!pTaskDefinition.TaskTemplate || typeof(pTaskDefinition.TaskTemplate) !== 'object')
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GeneratePagedOperation: TaskTemplate is required.`);
			return fCallback(null, pManifestEntry);
		}

		// --- Calculate paging ---
		let tmpPageSize = (typeof(pTaskDefinition.PageSize) === 'number' && pTaskDefinition.PageSize > 0) ? pTaskDefinition.PageSize : 25;
		let tmpPageCount = Math.ceil(tmpRecordCount / tmpPageSize);

		if (tmpPageCount === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Log.push(`GeneratePagedOperation: RecordCount is 0, no pages to generate.`);
			return fCallback(null, pManifestEntry);
		}

		let tmpRetries = (typeof(pTaskDefinition.Retries) === 'number' && pTaskDefinition.Retries > 0) ? pTaskDefinition.Retries : 0;
		let tmpOperationName = pTaskDefinition.OperationName || 'Paged Operation';
		let tmpAutoExecute = (pTaskDefinition.AutoExecute !== false);

		// --- Generate a GUID for the paged operation ---
		let tmpBaseGUID = pTaskDefinition.GUIDTask || 'paged';
		let tmpOperationGUID = `${tmpBaseGUID}-paged-${Date.now()}`;

		pManifestEntry.Log.push(`GeneratePagedOperation: ${tmpRecordCount} records, ${tmpPageSize} per page, ${tmpPageCount} page(s).`);

		// --- Resolve URLAddress in TaskTemplate if present ---
		// When the TaskTemplate has a URLAddress field, resolve it from
		// GlobalState and set it as the URL before pagination interpolation.
		if (pTaskDefinition.TaskTemplate.URLAddress && typeof(pTaskDefinition.TaskTemplate.URLAddress) === 'string')
		{
			let tmpResolvedURL = this.resolveAddress(pTaskDefinition.TaskTemplate.URLAddress, pContext);
			if (tmpResolvedURL && typeof(tmpResolvedURL) === 'string')
			{
				pTaskDefinition.TaskTemplate.URL = tmpResolvedURL;
				pManifestEntry.Log.push(`GeneratePagedOperation: resolved TaskTemplate URL from GlobalState address "${pTaskDefinition.TaskTemplate.URLAddress}": ${tmpResolvedURL.substring(0, 200)}`);
			}
			else
			{
				pManifestEntry.Log.push(`GeneratePagedOperation: WARNING URLAddress "${pTaskDefinition.TaskTemplate.URLAddress}" could not be resolved.`);
			}
			// Remove URLAddress from the template so generated page tasks
			// use the interpolated URL directly instead of re-resolving
			// from GlobalState (which would give the un-interpolated pattern).
			delete pTaskDefinition.TaskTemplate.URLAddress;
		}

		// --- Generate task definitions ---
		let tmpTasks = {};
		let tmpTaskGUIDs = [];

		for (let i = 0; i < tmpPageCount; i++)
		{
			let tmpPageStart = i * tmpPageSize;
			let tmpTaskGUID = `${tmpOperationGUID}-page-${i}`;

			let tmpVars = {
				PageStart: String(tmpPageStart),
				PageSize: String(tmpPageSize),
				PageIndex: String(i),
				PageCount: String(tmpPageCount)
			};

			let tmpTaskDef = this._interpolateTemplate(JSON.parse(JSON.stringify(pTaskDefinition.TaskTemplate)), tmpVars);
			tmpTaskDef.GUIDTask = tmpTaskGUID;
			tmpTaskDef.Name = `Page ${i + 1} of ${tmpPageCount}`;
			tmpTaskDef.Destination = `Pages[${i}]`;

			if (tmpRetries > 0)
			{
				tmpTaskDef.Retries = tmpRetries;
			}

			tmpTasks[tmpTaskGUID] = tmpTaskDef;
			tmpTaskGUIDs.push(tmpTaskGUID);
		}

		// --- Generate operation definition ---
		let tmpOperationDef = {
			GUIDOperation: tmpOperationGUID,
			Name: `${tmpOperationName} (${tmpPageCount} pages)`,
			Tasks: tmpTaskGUIDs
		};

		// --- Write standalone config to staging ---
		let tmpStagingPath = this.resolveStagingPath(pContext);
		let tmpConfigContent = {
			Tasks: tmpTasks,
			Operations: {}
		};
		tmpConfigContent.Operations[tmpOperationGUID] = tmpOperationDef;

		let tmpConfigPath = libPath.join(tmpStagingPath, `PagedOperation_${tmpOperationGUID}.json`);

		try
		{
			if (!libFS.existsSync(tmpStagingPath))
			{
				libFS.mkdirSync(tmpStagingPath, { recursive: true });
			}
			libFS.writeFileSync(tmpConfigPath, JSON.stringify(tmpConfigContent, null, 4), 'utf8');
			pManifestEntry.Log.push(`GeneratePagedOperation: wrote config to ${tmpConfigPath}.`);
		}
		catch (pWriteError)
		{
			pManifestEntry.Log.push(`GeneratePagedOperation: warning: could not write config file: ${pWriteError.message}`);
		}

		// --- Register tasks and operation in memory (no persist) ---
		let tmpStateService = this.fable['Ultravisor-Hypervisor-State'];

		for (let i = 0; i < tmpTaskGUIDs.length; i++)
		{
			tmpStateService._Tasks[tmpTaskGUIDs[i]] = tmpTasks[tmpTaskGUIDs[i]];
		}
		tmpStateService._Operations[tmpOperationGUID] = tmpOperationDef;

		pManifestEntry.Log.push(`GeneratePagedOperation: registered ${tmpPageCount} task(s) and 1 operation in memory.`);

		// --- Store the operation GUID at Destination ---
		this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpOperationGUID);

		if (!tmpAutoExecute)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = tmpOperationGUID;
			pManifestEntry.Log.push(`GeneratePagedOperation: AutoExecute is false, operation ${tmpOperationGUID} ready for manual execution.`);
			return fCallback(null, pManifestEntry);
		}

		// --- Auto-execute the generated operation ---
		pManifestEntry.Log.push(`GeneratePagedOperation: auto-executing operation ${tmpOperationGUID}.`);

		// Clone the current GlobalState so cookies/auth carry through
		let tmpChildOperationDef = Object.assign({}, tmpOperationDef);
		tmpChildOperationDef.GlobalState = pContext.GlobalState;
		tmpChildOperationDef.StagingPath = tmpStagingPath;

		let tmpOperationService = this.fable['Ultravisor-Operation'];

		tmpOperationService.executeOperation(tmpChildOperationDef,
			(pError, pChildManifest) =>
			{
				pManifestEntry.StopTime = new Date().toISOString();

				if (pError)
				{
					pManifestEntry.Status = 'Error';
					pManifestEntry.Log.push(`GeneratePagedOperation: execution error: ${pError.message}`);
					return fCallback(null, pManifestEntry);
				}

				pManifestEntry.Status = 'Complete';
				pManifestEntry.Success = pChildManifest.Success;
				pManifestEntry.Output = JSON.stringify({
					OperationGUID: tmpOperationGUID,
					PageCount: tmpPageCount,
					ChildManifestSummary: pChildManifest.Summary,
					ChildManifestStatus: pChildManifest.Status,
					ChildManifestSuccess: pChildManifest.Success
				});

				let tmpSuccessCount = 0;
				let tmpFailCount = 0;
				if (pChildManifest.TaskResults && Array.isArray(pChildManifest.TaskResults))
				{
					for (let i = 0; i < pChildManifest.TaskResults.length; i++)
					{
						if (pChildManifest.TaskResults[i].Success)
						{
							tmpSuccessCount++;
						}
						else
						{
							tmpFailCount++;
						}
					}
				}

				pManifestEntry.Log.push(`GeneratePagedOperation: completed ${tmpSuccessCount} of ${tmpPageCount} page(s) successfully${tmpFailCount > 0 ? `, ${tmpFailCount} failed` : ''}.`);

				// Clean up ephemeral tasks and operation from state
				for (let i = 0; i < tmpTaskGUIDs.length; i++)
				{
					delete tmpStateService._Tasks[tmpTaskGUIDs[i]];
				}
				delete tmpStateService._Operations[tmpOperationGUID];

				return fCallback(null, pManifestEntry);
			});
	}

	/**
	 * Recursively replace interpolation variables in all string values
	 * of an object.  Variables use {VarName} syntax.
	 *
	 * @param {*} pValue - The value to interpolate.
	 * @param {object} pVars - Map of variable names to replacement values.
	 * @returns {*} The interpolated value.
	 */
	_interpolateTemplate(pValue, pVars)
	{
		if (typeof(pValue) === 'string')
		{
			let tmpResult = pValue;
			let tmpVarKeys = Object.keys(pVars);
			for (let i = 0; i < tmpVarKeys.length; i++)
			{
				// Replace all occurrences of {VarName}
				let tmpPattern = `{${tmpVarKeys[i]}}`;
				while (tmpResult.indexOf(tmpPattern) !== -1)
				{
					tmpResult = tmpResult.replace(tmpPattern, pVars[tmpVarKeys[i]]);
				}
			}
			return tmpResult;
		}
		else if (Array.isArray(pValue))
		{
			for (let i = 0; i < pValue.length; i++)
			{
				pValue[i] = this._interpolateTemplate(pValue[i], pVars);
			}
			return pValue;
		}
		else if (typeof(pValue) === 'object' && pValue !== null)
		{
			let tmpKeys = Object.keys(pValue);
			for (let i = 0; i < tmpKeys.length; i++)
			{
				pValue[tmpKeys[i]] = this._interpolateTemplate(pValue[tmpKeys[i]], pVars);
			}
			return pValue;
		}

		return pValue;
	}
}

module.exports = UltravisorTaskGeneratePagedOperation;
