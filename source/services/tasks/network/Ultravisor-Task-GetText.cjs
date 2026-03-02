const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

class UltravisorTaskGetText extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Perform an HTTP/HTTPS GET and return the response as plain text.
	 *
	 * Task definition fields:
	 *   - URL: the endpoint to request
	 *   - Headers (optional): object of request headers
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the response text is stored (defaults to "Output")
	 *   - Persist (optional): where to store the response text
	 *       string  -- manyfest address into GlobalState
	 *       { Address: "..." } -- same as string form
	 *       { File: "..." }   -- writes the text to a staging file
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskGetText;
