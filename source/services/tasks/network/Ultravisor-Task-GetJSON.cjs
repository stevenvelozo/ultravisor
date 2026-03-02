const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

class UltravisorTaskGetJSON extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Perform an HTTP/HTTPS GET and parse the response as JSON.
	 *
	 * Task definition fields:
	 *   - URL: the endpoint to request
	 *   - Headers (optional): object of request headers
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the parsed object is stored (defaults to "Output")
	 *   - Persist (optional): where to store the parsed response
	 *       string  -- manyfest address into GlobalState
	 *       { Address: "..." } -- same as string form
	 *       { File: "..." }   -- writes JSON to a staging file
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskGetJSON;
