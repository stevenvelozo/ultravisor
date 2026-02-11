const libPictService = require(`pict-serviceproviderbase`);

const libChildProcess = require('child_process');
const libFS = require('fs');
const libPath = require('path');
const libHTTP = require('http');
const libHTTPS = require('https');

class UltravisorTask extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
	}

	/**
	 * Execute a task based on its type, then run any subsequent task sets.
	 *
	 * Subsequent task sets are optional arrays of task GUIDs on the task
	 * definition.  They run in order after the core task completes:
	 *
	 *   onBefore      -- runs before the core task executes
	 *   onCompletion  -- runs after the core task succeeds (Status === 'Complete')
	 *   onSubsequent  -- runs after the core task regardless of outcome
	 *   onFailure     -- runs after the core task when Success is false
	 *   onError       -- runs after the core task when Status is 'Error'
	 *
	 * Each set is an array of task GUIDs executed sequentially.
	 *
	 * @param {object} pTaskDefinition - The task definition object from state.
	 * @param {object} pContext - Execution context (GlobalState, NodeState, StagingPath).
	 * @param {function} fCallback - Callback with (pError, pManifestEntry).
	 */
	executeTask(pTaskDefinition, pContext, fCallback)
	{
		if (typeof(pTaskDefinition) !== 'object' || pTaskDefinition === null)
		{
			return fCallback(new Error(`Ultravisor Task: executeTask requires a valid task definition object.`));
		}
		if (!pTaskDefinition.GUIDTask)
		{
			return fCallback(new Error(`Ultravisor Task: executeTask requires the task definition to have a GUIDTask.`));
		}

		let tmpManifestEntry = {
			GUIDTask: pTaskDefinition.GUIDTask,
			Name: pTaskDefinition.Name || pTaskDefinition.GUIDTask,
			Type: pTaskDefinition.Type || 'Command',
			StartTime: new Date().toISOString(),
			StopTime: null,
			Status: 'Running',
			Success: false,
			Output: null,
			Log: [],
			SubsequentResults: {}
		};

		tmpManifestEntry.Log.push(`Task ${tmpManifestEntry.GUIDTask} started at ${tmpManifestEntry.StartTime}`);

		// --- onBefore ---
		this.executeSubsequentSet(pTaskDefinition, 'onBefore', pContext, tmpManifestEntry,
			(pBeforeError) =>
			{
				if (pBeforeError)
				{
					tmpManifestEntry.Log.push(`Error in onBefore: ${pBeforeError.message}`);
				}

				// --- Core task execution ---
				this.executeCoreTask(pTaskDefinition, pContext, tmpManifestEntry,
					(pCoreError) =>
					{
						if (pCoreError)
						{
							tmpManifestEntry.Log.push(`Core task error: ${pCoreError.message}`);
						}

						// --- Determine which subsequent sets to run ---
						let tmpSubsequentPhases = [];

						// onCompletion: only when core task succeeded
						if (tmpManifestEntry.Status === 'Complete' && tmpManifestEntry.Success)
						{
							tmpSubsequentPhases.push('onCompletion');
						}

						// onFailure: when the task did not succeed
						if (!tmpManifestEntry.Success)
						{
							tmpSubsequentPhases.push('onFailure');
						}

						// onError: specifically when Status is 'Error'
						if (tmpManifestEntry.Status === 'Error')
						{
							tmpSubsequentPhases.push('onError');
						}

						// onSubsequent: always runs after core task
						tmpSubsequentPhases.push('onSubsequent');

						this.executeSubsequentPhases(pTaskDefinition, tmpSubsequentPhases, pContext, tmpManifestEntry,
							() =>
							{
								return fCallback(null, tmpManifestEntry);
							});
					});
			});
	}

	/**
	 * Execute the core task logic (the actual command/request/etc).
	 */
	executeCoreTask(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpType = (pTaskDefinition.Type || 'Command').toLowerCase();

		switch (tmpType)
		{
			case 'command':
				this.executeCommandTask(pTaskDefinition, pContext, pManifestEntry,
					() => { return fCallback(null); });
				break;
			case 'request':
				this.executeRequestTask(pTaskDefinition, pContext, pManifestEntry,
					() => { return fCallback(null); });
				break;
			case 'listfiles':
				this.executeListFilesTask(pTaskDefinition, pContext, pManifestEntry,
					() => { return fCallback(null); });
				break;
			case 'writejson':
				this.executeWriteJSONTask(pTaskDefinition, pContext, pManifestEntry,
					() => { return fCallback(null); });
				break;
			case 'writetext':
				this.executeWriteTextTask(pTaskDefinition, pContext, pManifestEntry,
					() => { return fCallback(null); });
				break;
			case 'readjson':
				this.executeReadJSONTask(pTaskDefinition, pContext, pManifestEntry,
					() => { return fCallback(null); });
				break;
			case 'readtext':
				this.executeReadTextTask(pTaskDefinition, pContext, pManifestEntry,
					() => { return fCallback(null); });
				break;
			case 'getjson':
				this.executeGetJSONTask(pTaskDefinition, pContext, pManifestEntry,
					() => { return fCallback(null); });
				break;
			case 'sendjson':
				this.executeSendJSONTask(pTaskDefinition, pContext, pManifestEntry,
					() => { return fCallback(null); });
				break;
			case 'conditional':
				this.executeConditionalTask(pTaskDefinition, pContext, pManifestEntry,
					() => { return fCallback(null); });
				break;
			default:
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Unsupported';
				pManifestEntry.Log.push(`Task type "${pTaskDefinition.Type}" is not yet implemented.`);
				return fCallback(null);
		}
	}

	/**
	 * Execute a list of subsequent phases in order.
	 *
	 * @param {object} pTaskDefinition - The parent task definition.
	 * @param {array} pPhases - Array of phase names to execute in order.
	 * @param {object} pContext - Execution context.
	 * @param {object} pManifestEntry - The parent manifest entry.
	 * @param {function} fCallback - Callback when all phases are done.
	 */
	executeSubsequentPhases(pTaskDefinition, pPhases, pContext, pManifestEntry, fCallback)
	{
		if (!Array.isArray(pPhases) || pPhases.length === 0)
		{
			return fCallback();
		}

		let tmpPhaseIndex = 0;

		let fRunNextPhase = () =>
		{
			if (tmpPhaseIndex >= pPhases.length)
			{
				return fCallback();
			}

			let tmpPhaseName = pPhases[tmpPhaseIndex];
			tmpPhaseIndex++;

			this.executeSubsequentSet(pTaskDefinition, tmpPhaseName, pContext, pManifestEntry,
				() =>
				{
					fRunNextPhase();
				});
		};

		fRunNextPhase();
	}

	/**
	 * Execute a single subsequent task set by name (e.g. "onBefore",
	 * "onCompletion").
	 *
	 * The set is an array of task GUIDs on the task definition keyed by
	 * pSetName.  Each GUID is looked up from state and executed sequentially.
	 * Results are stored in pManifestEntry.SubsequentResults[pSetName].
	 *
	 * @param {object} pTaskDefinition - The parent task definition.
	 * @param {string} pSetName - The subsequent set name.
	 * @param {object} pContext - Execution context.
	 * @param {object} pManifestEntry - The parent manifest entry.
	 * @param {function} fCallback - Callback when done.
	 */
	executeSubsequentSet(pTaskDefinition, pSetName, pContext, pManifestEntry, fCallback)
	{
		let tmpTaskGUIDs = pTaskDefinition[pSetName];

		if (!Array.isArray(tmpTaskGUIDs) || tmpTaskGUIDs.length === 0)
		{
			return fCallback();
		}

		pManifestEntry.Log.push(`Executing subsequent set "${pSetName}" with ${tmpTaskGUIDs.length} task(s).`);
		pManifestEntry.SubsequentResults[pSetName] = [];

		let tmpStateService = this.fable['Ultravisor-Hypervisor-State'];
		let tmpIndex = 0;

		let fRunNext = () =>
		{
			if (tmpIndex >= tmpTaskGUIDs.length)
			{
				pManifestEntry.Log.push(`Subsequent set "${pSetName}" complete.`);
				return fCallback();
			}

			let tmpGUID = tmpTaskGUIDs[tmpIndex];
			tmpIndex++;

			tmpStateService.getTask(tmpGUID,
				(pError, pSubTaskDefinition) =>
				{
					if (pError)
					{
						pManifestEntry.Log.push(`${pSetName}: could not find task ${tmpGUID}: ${pError.message}`);
						pManifestEntry.SubsequentResults[pSetName].push(
							{
								GUIDTask: tmpGUID,
								Status: 'Error',
								Success: false,
								Log: [`Task not found: ${pError.message}`]
							});
						return fRunNext();
					}

					// Execute the subsequent task (without its own subsequent
					// chains to avoid infinite recursion)
					this.executeCoreTaskStandalone(pSubTaskDefinition, pContext,
						(pExecError, pResult) =>
						{
							if (pExecError)
							{
								pManifestEntry.Log.push(`${pSetName}: error executing task ${tmpGUID}: ${pExecError.message}`);
								pManifestEntry.SubsequentResults[pSetName].push(
									{
										GUIDTask: tmpGUID,
										Status: 'Error',
										Success: false,
										Log: [`Execution error: ${pExecError.message}`]
									});
							}
							else
							{
								pManifestEntry.Log.push(`${pSetName}: task ${tmpGUID} completed with status: ${pResult.Status}`);
								pManifestEntry.SubsequentResults[pSetName].push(pResult);
							}

							return fRunNext();
						});
				});
		};

		fRunNext();
	}

	/**
	 * Execute a task as a standalone core task (no subsequent chains).
	 * Used for subsequent tasks to avoid recursive subsequent execution.
	 */
	executeCoreTaskStandalone(pTaskDefinition, pContext, fCallback)
	{
		if (typeof(pTaskDefinition) !== 'object' || pTaskDefinition === null)
		{
			return fCallback(new Error(`Invalid task definition.`));
		}
		if (!pTaskDefinition.GUIDTask)
		{
			return fCallback(new Error(`Task definition missing GUIDTask.`));
		}

		let tmpManifestEntry = {
			GUIDTask: pTaskDefinition.GUIDTask,
			Name: pTaskDefinition.Name || pTaskDefinition.GUIDTask,
			Type: pTaskDefinition.Type || 'Command',
			StartTime: new Date().toISOString(),
			StopTime: null,
			Status: 'Running',
			Success: false,
			Output: null,
			Log: []
		};

		tmpManifestEntry.Log.push(`Task ${tmpManifestEntry.GUIDTask} started at ${tmpManifestEntry.StartTime}`);

		this.executeCoreTask(pTaskDefinition, pContext, tmpManifestEntry,
			(pError) =>
			{
				return fCallback(null, tmpManifestEntry);
			});
	}

	/**
	 * Execute a shell command task.
	 */
	executeCommandTask(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpCommand = pTaskDefinition.Command || pTaskDefinition.Parameters || '';

		if (!tmpCommand || tmpCommand.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`Command task has no command to execute.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`Executing command: ${tmpCommand}`);

		let tmpTimeout = (this.fable?.ProgramConfiguration?.UltravisorCommandTimeoutMilliseconds) || 300000;
		let tmpMaxBuffer = (this.fable?.ProgramConfiguration?.UltravisorCommandMaxBufferBytes) || 10485760;

		libChildProcess.exec(tmpCommand, { timeout: tmpTimeout, maxBuffer: tmpMaxBuffer },
			(pError, pStdOut, pStdErr) =>
			{
				pManifestEntry.StopTime = new Date().toISOString();

				if (pStdOut)
				{
					pManifestEntry.Output = pStdOut;
					pManifestEntry.Log.push(`stdout: ${pStdOut.substring(0, 500)}`);
				}
				if (pStdErr)
				{
					pManifestEntry.Log.push(`stderr: ${pStdErr.substring(0, 500)}`);
				}

				if (pError)
				{
					pManifestEntry.Status = 'Error';
					pManifestEntry.Success = false;
					pManifestEntry.Log.push(`Command failed: ${pError.message}`);
				}
				else
				{
					pManifestEntry.Status = 'Complete';
					pManifestEntry.Success = true;
					pManifestEntry.Log.push(`Command completed successfully.`);
				}

				return fCallback(null, pManifestEntry);
			});
	}

	/**
	 * Execute an HTTP request task.
	 */
	executeRequestTask(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpURL = pTaskDefinition.URL || pTaskDefinition.Parameters || '';

		if (!tmpURL || tmpURL.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`Request task has no URL to request.`);
			return fCallback(null, pManifestEntry);
		}

		let tmpMethod = (pTaskDefinition.Method || 'GET').toUpperCase();

		pManifestEntry.Log.push(`Executing ${tmpMethod} request to: ${tmpURL}`);

		// Use curl for HTTP requests
		let tmpCurlCommand = `curl -s -X ${tmpMethod} "${tmpURL}"`;
		this.executeCommandTask(
			Object.assign({}, pTaskDefinition, { Command: tmpCurlCommand }),
			pContext, pManifestEntry, fCallback);
	}

	// =========================================================================
	// Staging path resolution
	// =========================================================================

	/**
	 * Resolve the staging folder path.
	 *
	 * Priority:
	 *   1. pContext.StagingPath (per-operation override)
	 *   2. UltravisorFileStorePath from ProgramConfiguration
	 *   3. ${cwd}/dist/ultravisor_datastore (fallback)
	 *
	 * @param {object} pContext - Execution context.
	 * @returns {string} Absolute path to the staging folder.
	 */
	resolveStagingPath(pContext)
	{
		if (pContext && pContext.StagingPath && pContext.StagingPath.length > 0)
		{
			return pContext.StagingPath;
		}
		return (this.fable?.ProgramConfiguration?.UltravisorFileStorePath)
			|| `${process.cwd()}/dist/ultravisor_datastore`;
	}

	/**
	 * Build a full file path inside the staging folder.
	 * Prevents path traversal by rejecting paths containing "..".
	 *
	 * @param {string} pStagingPath - Base staging folder.
	 * @param {string} pFileName - Relative file name or path.
	 * @returns {string|false} Full path or false if invalid.
	 */
	resolveStagingFilePath(pStagingPath, pFileName)
	{
		if (!pFileName || typeof(pFileName) !== 'string' || pFileName.length === 0)
		{
			return false;
		}
		if (pFileName.indexOf('..') !== -1)
		{
			return false;
		}
		return libPath.resolve(pStagingPath, pFileName);
	}

	// =========================================================================
	// ListFiles -- list files in the staging folder
	// =========================================================================

	/**
	 * List files in the staging folder (or a sub-path within it).
	 *
	 * Task definition fields:
	 *   - Path (optional): sub-directory within the staging folder
	 */
	executeListFilesTask(pTaskDefinition, pContext, pManifestEntry, fCallback)
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

	// =========================================================================
	// WriteJSON -- write a JSON object to a file in the staging folder
	// =========================================================================

	/**
	 * Write JSON data to a file in the staging folder.
	 *
	 * Task definition fields:
	 *   - File: relative file path inside the staging folder
	 *   - Data: the object/value to serialise as JSON
	 */
	executeWriteJSONTask(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpStagingPath = this.resolveStagingPath(pContext);
		let tmpFilePath = this.resolveStagingFilePath(tmpStagingPath, pTaskDefinition.File);

		if (!tmpFilePath)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteJSON: missing or invalid File field.`);
			return fCallback(null, pManifestEntry);
		}

		if (!pTaskDefinition.hasOwnProperty('Data'))
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteJSON: missing Data field.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`WriteJSON: writing to ${tmpFilePath}`);

		try
		{
			let tmpDir = libPath.dirname(tmpFilePath);
			if (!libFS.existsSync(tmpDir))
			{
				libFS.mkdirSync(tmpDir, { recursive: true });
			}

			let tmpContent = JSON.stringify(pTaskDefinition.Data, null, 4);
			libFS.writeFileSync(tmpFilePath, tmpContent, 'utf8');

			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = `${tmpContent.length} bytes written`;
			pManifestEntry.Log.push(`WriteJSON: wrote ${tmpContent.length} bytes.`);
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteJSON: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}

	// =========================================================================
	// WriteText -- write text content to a file in the staging folder
	// =========================================================================

	/**
	 * Write text content to a file in the staging folder.
	 *
	 * Task definition fields:
	 *   - File: relative file path inside the staging folder
	 *   - Data: the string to write
	 */
	executeWriteTextTask(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpStagingPath = this.resolveStagingPath(pContext);
		let tmpFilePath = this.resolveStagingFilePath(tmpStagingPath, pTaskDefinition.File);

		if (!tmpFilePath)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteText: missing or invalid File field.`);
			return fCallback(null, pManifestEntry);
		}

		if (!pTaskDefinition.hasOwnProperty('Data'))
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteText: missing Data field.`);
			return fCallback(null, pManifestEntry);
		}

		let tmpContent = (typeof(pTaskDefinition.Data) === 'string')
			? pTaskDefinition.Data
			: String(pTaskDefinition.Data);

		pManifestEntry.Log.push(`WriteText: writing to ${tmpFilePath}`);

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
			pManifestEntry.Log.push(`WriteText: wrote ${tmpContent.length} bytes.`);
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`WriteText: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}

	// =========================================================================
	// ReadJSON -- read a JSON file from the staging folder
	// =========================================================================

	/**
	 * Read a JSON file from the staging folder and parse it.
	 *
	 * Task definition fields:
	 *   - File: relative file path inside the staging folder
	 */
	executeReadJSONTask(pTaskDefinition, pContext, pManifestEntry, fCallback)
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
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`ReadJSON: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}

	// =========================================================================
	// ReadText -- read a text file from the staging folder
	// =========================================================================

	/**
	 * Read a text file from the staging folder.
	 *
	 * Task definition fields:
	 *   - File: relative file path inside the staging folder
	 */
	executeReadTextTask(pTaskDefinition, pContext, pManifestEntry, fCallback)
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
		}
		catch (pError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`ReadText: ${pError.message}`);
		}

		return fCallback(null, pManifestEntry);
	}

	// =========================================================================
	// GetJSON -- GET JSON from a REST URL using native http/https
	// =========================================================================

	/**
	 * Perform an HTTP/HTTPS GET and parse the response as JSON.
	 *
	 * Task definition fields:
	 *   - URL: the endpoint to request
	 *   - Headers (optional): object of request headers
	 */
	executeGetJSONTask(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpURL = pTaskDefinition.URL || pTaskDefinition.Parameters || '';

		if (!tmpURL || tmpURL.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetJSON: missing URL.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`GetJSON: GET ${tmpURL}`);

		let tmpHeaders = Object.assign({ 'Accept': 'application/json' }, pTaskDefinition.Headers || {});

		let tmpParsedURL;
		try
		{
			tmpParsedURL = new URL(tmpURL);
		}
		catch (pParseError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetJSON: invalid URL: ${pParseError.message}`);
			return fCallback(null, pManifestEntry);
		}

		let tmpTransport = (tmpParsedURL.protocol === 'https:') ? libHTTPS : libHTTP;
		let tmpTimeout = (this.fable?.ProgramConfiguration?.UltravisorCommandTimeoutMilliseconds) || 300000;

		let tmpRequestOptions = {
			method: 'GET',
			headers: tmpHeaders,
			timeout: tmpTimeout
		};

		let tmpRequest = tmpTransport.request(tmpURL, tmpRequestOptions,
			(pResponse) =>
			{
				let tmpData = '';

				pResponse.on('data', (pChunk) => { tmpData += pChunk; });

				pResponse.on('end', () =>
				{
					pManifestEntry.StopTime = new Date().toISOString();
					pManifestEntry.Log.push(`GetJSON: received ${tmpData.length} bytes, status ${pResponse.statusCode}.`);

					try
					{
						let tmpParsed = JSON.parse(tmpData);
						pManifestEntry.Output = JSON.stringify(tmpParsed);
						pManifestEntry.Status = 'Complete';
						pManifestEntry.Success = true;
						pManifestEntry.Log.push(`GetJSON: parsed JSON successfully.`);
					}
					catch (pJsonError)
					{
						pManifestEntry.Output = tmpData.substring(0, 2000);
						pManifestEntry.Status = 'Error';
						pManifestEntry.Log.push(`GetJSON: failed to parse response as JSON: ${pJsonError.message}`);
					}

					return fCallback(null, pManifestEntry);
				});
			});

		tmpRequest.on('error', (pError) =>
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetJSON: request error: ${pError.message}`);
			return fCallback(null, pManifestEntry);
		});

		tmpRequest.on('timeout', () =>
		{
			tmpRequest.destroy();
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetJSON: request timed out after ${tmpTimeout}ms.`);
			return fCallback(null, pManifestEntry);
		});

		tmpRequest.end();
	}

	// =========================================================================
	// SendJSON -- POST/PUT/PATCH/DELETE JSON to a REST URL
	// =========================================================================

	/**
	 * Send JSON data to a REST URL using any HTTP method.
	 *
	 * Task definition fields:
	 *   - URL: the endpoint to request
	 *   - Method (optional): HTTP method (defaults to POST)
	 *   - Data (optional): object to serialise and send as the request body
	 *   - Headers (optional): object of request headers
	 */
	executeSendJSONTask(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpURL = pTaskDefinition.URL || pTaskDefinition.Parameters || '';

		if (!tmpURL || tmpURL.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`SendJSON: missing URL.`);
			return fCallback(null, pManifestEntry);
		}

		let tmpMethod = (pTaskDefinition.Method || 'POST').toUpperCase();
		let tmpBody = pTaskDefinition.hasOwnProperty('Data')
			? JSON.stringify(pTaskDefinition.Data)
			: '';

		pManifestEntry.Log.push(`SendJSON: ${tmpMethod} ${tmpURL} (${tmpBody.length} bytes body)`);

		let tmpHeaders = Object.assign(
			{
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			},
			pTaskDefinition.Headers || {});

		if (tmpBody.length > 0)
		{
			tmpHeaders['Content-Length'] = Buffer.byteLength(tmpBody);
		}

		let tmpParsedURL;
		try
		{
			tmpParsedURL = new URL(tmpURL);
		}
		catch (pParseError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`SendJSON: invalid URL: ${pParseError.message}`);
			return fCallback(null, pManifestEntry);
		}

		let tmpTransport = (tmpParsedURL.protocol === 'https:') ? libHTTPS : libHTTP;
		let tmpTimeout = (this.fable?.ProgramConfiguration?.UltravisorCommandTimeoutMilliseconds) || 300000;

		let tmpRequestOptions = {
			method: tmpMethod,
			headers: tmpHeaders,
			timeout: tmpTimeout
		};

		let tmpRequest = tmpTransport.request(tmpURL, tmpRequestOptions,
			(pResponse) =>
			{
				let tmpData = '';

				pResponse.on('data', (pChunk) => { tmpData += pChunk; });

				pResponse.on('end', () =>
				{
					pManifestEntry.StopTime = new Date().toISOString();
					pManifestEntry.Log.push(`SendJSON: received ${tmpData.length} bytes, status ${pResponse.statusCode}.`);

					try
					{
						let tmpParsed = JSON.parse(tmpData);
						pManifestEntry.Output = JSON.stringify(tmpParsed);
					}
					catch (pJsonError)
					{
						pManifestEntry.Output = tmpData.substring(0, 2000);
					}

					pManifestEntry.Status = 'Complete';
					pManifestEntry.Success = true;
					pManifestEntry.Log.push(`SendJSON: ${tmpMethod} completed successfully.`);

					return fCallback(null, pManifestEntry);
				});
			});

		tmpRequest.on('error', (pError) =>
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`SendJSON: request error: ${pError.message}`);
			return fCallback(null, pManifestEntry);
		});

		tmpRequest.on('timeout', () =>
		{
			tmpRequest.destroy();
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`SendJSON: request timed out after ${tmpTimeout}ms.`);
			return fCallback(null, pManifestEntry);
		});

		if (tmpBody.length > 0)
		{
			tmpRequest.write(tmpBody);
		}

		tmpRequest.end();
	}

	// =========================================================================
	// Conditional -- branch to one task or another based on an address
	// =========================================================================

	/**
	 * Evaluate an address and execute one task if truthy, another if falsy.
	 *
	 * The "Address" field is resolved from pContext.GlobalState (dot-notation).
	 * Alternatively, the "Value" field can provide a literal to test.
	 *
	 * Task definition fields:
	 *   - Address: dot-notation path into pContext.GlobalState
	 *   - Value (optional): literal value to evaluate instead of Address
	 *   - TrueTask: GUID of the task to run when the value is truthy
	 *   - FalseTask: GUID of the task to run when the value is falsy
	 */
	executeConditionalTask(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpValue = undefined;

		// Resolve the value to test
		if (pTaskDefinition.hasOwnProperty('Value'))
		{
			tmpValue = pTaskDefinition.Value;
			pManifestEntry.Log.push(`Conditional: evaluating literal Value: ${JSON.stringify(tmpValue)}`);
		}
		else if (pTaskDefinition.Address && typeof(pTaskDefinition.Address) === 'string')
		{
			tmpValue = this.resolveAddress(pTaskDefinition.Address, pContext);
			pManifestEntry.Log.push(`Conditional: resolved Address "${pTaskDefinition.Address}" to: ${JSON.stringify(tmpValue)}`);
		}
		else
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`Conditional: task requires an Address or Value field.`);
			return fCallback(null, pManifestEntry);
		}

		let tmpIsTruthy = !!tmpValue;
		let tmpTargetGUID = tmpIsTruthy ? pTaskDefinition.TrueTask : pTaskDefinition.FalseTask;

		pManifestEntry.Log.push(`Conditional: value is ${tmpIsTruthy ? 'truthy' : 'falsy'}, selected ${tmpIsTruthy ? 'TrueTask' : 'FalseTask'}: ${tmpTargetGUID || '(none)'}`);

		if (!tmpTargetGUID || typeof(tmpTargetGUID) !== 'string' || tmpTargetGUID.length === 0)
		{
			// No task to execute for this branch -- that is a valid no-op
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = JSON.stringify({ Branch: tmpIsTruthy ? 'true' : 'false', Task: null });
			pManifestEntry.Log.push(`Conditional: no task defined for this branch; completing as no-op.`);
			return fCallback(null, pManifestEntry);
		}

		// Look up and execute the selected task
		let tmpStateService = this.fable['Ultravisor-Hypervisor-State'];

		tmpStateService.getTask(tmpTargetGUID,
			(pError, pBranchTaskDefinition) =>
			{
				if (pError)
				{
					pManifestEntry.StopTime = new Date().toISOString();
					pManifestEntry.Status = 'Error';
					pManifestEntry.Log.push(`Conditional: could not find task ${tmpTargetGUID}: ${pError.message}`);
					return fCallback(null, pManifestEntry);
				}

				this.executeCoreTaskStandalone(pBranchTaskDefinition, pContext,
					(pExecError, pResult) =>
					{
						pManifestEntry.StopTime = new Date().toISOString();

						if (pExecError)
						{
							pManifestEntry.Status = 'Error';
							pManifestEntry.Log.push(`Conditional: error executing branch task ${tmpTargetGUID}: ${pExecError.message}`);
							return fCallback(null, pManifestEntry);
						}

						pManifestEntry.Status = pResult.Status;
						pManifestEntry.Success = pResult.Success;
						pManifestEntry.Output = JSON.stringify(
							{
								Branch: tmpIsTruthy ? 'true' : 'false',
								Task: tmpTargetGUID,
								Result: pResult
							});
						pManifestEntry.Log.push(`Conditional: branch task ${tmpTargetGUID} completed with status ${pResult.Status}.`);

						return fCallback(null, pManifestEntry);
					});
			});
	}

	/**
	 * Resolve a dot-notation address from the execution context.
	 *
	 * Looks up the address in:
	 *   1. pContext.GlobalState
	 *   2. pContext.NodeState
	 *
	 * @param {string} pAddress - Dot-notation path (e.g. "Flags.Enabled").
	 * @param {object} pContext - Execution context.
	 * @returns {*} The resolved value, or undefined if not found.
	 */
	resolveAddress(pAddress, pContext)
	{
		if (!pAddress || !pContext)
		{
			return undefined;
		}

		let tmpParts = pAddress.split('.');

		// Try GlobalState first
		let tmpValue = this.walkObject(pContext.GlobalState, tmpParts);
		if (tmpValue !== undefined)
		{
			return tmpValue;
		}

		// Fall back to NodeState
		return this.walkObject(pContext.NodeState, tmpParts);
	}

	/**
	 * Walk an object by a path array.
	 *
	 * @param {object} pObject - Object to walk.
	 * @param {array} pParts - Array of keys.
	 * @returns {*} Value at the path, or undefined.
	 */
	walkObject(pObject, pParts)
	{
		if (!pObject || typeof(pObject) !== 'object')
		{
			return undefined;
		}

		let tmpCurrent = pObject;
		for (let i = 0; i < pParts.length; i++)
		{
			if (tmpCurrent === null || tmpCurrent === undefined || typeof(tmpCurrent) !== 'object')
			{
				return undefined;
			}
			tmpCurrent = tmpCurrent[pParts[i]];
		}

		return tmpCurrent;
	}
}

module.exports = UltravisorTask;
