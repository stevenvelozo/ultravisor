const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

class UltravisorTaskGetXML extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Perform an HTTP/HTTPS GET and return the response as XML text.
	 *
	 * The raw XML string is returned in Output. No parsing is performed
	 * -- the caller is responsible for interpreting the XML structure.
	 *
	 * Task definition fields:
	 *   - URL: the endpoint to request
	 *   - Headers (optional): object of request headers
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the XML response is stored (defaults to "Output")
	 *   - Persist (optional): where to store the XML response
	 *       string  -- manyfest address into GlobalState
	 *       { Address: "..." } -- same as string form
	 *       { File: "..." }   -- writes the XML to a staging file
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskGetXML;
