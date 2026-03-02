const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

class UltravisorTaskSendJSON extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Send JSON data to a REST URL using any HTTP method.
	 *
	 * Task definition fields:
	 *   - URL: the endpoint to request
	 *   - Method (optional): HTTP method (defaults to POST)
	 *   - Data (optional): object to serialise and send as the request body
	 *   - Headers (optional): object of request headers
	 *   - Persist (optional): where to store the response
	 *       string  -- manyfest address into GlobalState
	 *       { Address: "..." } -- same as string form
	 *       { File: "..." }   -- writes response to a staging file
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskSendJSON;
