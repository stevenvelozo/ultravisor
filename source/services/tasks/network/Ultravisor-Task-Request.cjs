const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

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
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskRequest;
