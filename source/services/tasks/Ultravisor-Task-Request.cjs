const libUltravisorTaskBase = require('./Ultravisor-Task-Base.cjs');
const libUltravisorTaskCommand = require('./Ultravisor-Task-Command.cjs');

class UltravisorTaskRequest extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Execute an HTTP request task.
	 *
	 * Task definition fields:
	 *   - URL: the endpoint to request
	 *   - Method (optional): HTTP method (defaults to GET)
	 *   - Persist (optional): where to store the response body
	 *       string  -- manyfest address into GlobalState
	 *       { Address: "..." } -- same as string form
	 *       { File: "..." }   -- writes response to a staging file
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
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

		// Use curl for HTTP requests, delegating to the Command task type
		let tmpCurlCommand = `curl -s -X ${tmpMethod} "${tmpURL}"`;
		let tmpCommandTask = new libUltravisorTaskCommand(this.fable);
		tmpCommandTask.execute(
			Object.assign({}, pTaskDefinition, { Command: tmpCurlCommand }),
			pContext, pManifestEntry,
			(pError, pResult) =>
			{
				// Persist the response output
				if (pManifestEntry.Success && pTaskDefinition.Persist && pManifestEntry.Output)
				{
					this.storeResult(pTaskDefinition, pContext, pManifestEntry, pManifestEntry.Output);
				}
				return fCallback(pError, pResult);
			});
	}
}

module.exports = UltravisorTaskRequest;
