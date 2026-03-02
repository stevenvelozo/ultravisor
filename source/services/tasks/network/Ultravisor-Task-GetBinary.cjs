const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

class UltravisorTaskGetBinary extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Download a binary file from an HTTP/HTTPS URL.
	 *
	 * Task definition fields:
	 *   - URL: the endpoint to download from
	 *   - Headers (optional): object of request headers
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the binary data is stored as base64 (defaults to "Output")
	 *   - Persist (optional): where to store the downloaded content
	 *       string  -- manyfest address into GlobalState (stores base64)
	 *       { Address: "..." } -- same as string form
	 *       { File: "..." }   -- writes the raw binary to a staging file
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskGetBinary;
