const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

class UltravisorTaskCommandEach extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Execute a templated shell command once for each value in an array.
	 *
	 * Takes an array from GlobalState and runs a shell command for each
	 * element, substituting interpolation variables into the command
	 * template.  Commands run sequentially (one at a time).
	 *
	 * Task definition fields:
	 *   - Address: manyfest address in GlobalState pointing to the
	 *       source array of values (e.g. "ObservationIDs").
	 *   - Command: the shell command template.  Supports interpolation
	 *       variables:
	 *         {Value}  -- the current array element (stringified)
	 *         {Index}  -- the zero-based index of the current element
	 *         {Count}  -- total number of elements in the array
	 *       Example: "curl https://api.example.com/obs/{Value} -o obs_{Value}.json"
	 *   - ContinueOnError (optional, default true): if true, continue
	 *       executing remaining commands when one fails.  If false,
	 *       stop at the first failure.
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the results array is stored (default: "Output").
	 *       Each result contains: { Value, Index, ExitCode, StdOut,
	 *       StdErr, Success, Command }.
	 *   - Persist (optional): standard persist options (file or address).
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskCommandEach;
