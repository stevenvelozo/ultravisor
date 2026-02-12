const libUltravisorTaskBase = require('./Ultravisor-Task-Base.cjs');

const libChildProcess = require('child_process');

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
		// --- Validate required fields ---
		if (!pTaskDefinition.Address || typeof(pTaskDefinition.Address) !== 'string' || pTaskDefinition.Address.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`CommandEach: missing or empty Address field.`);
			return fCallback(null, pManifestEntry);
		}

		if (!pTaskDefinition.Command || typeof(pTaskDefinition.Command) !== 'string' || pTaskDefinition.Command.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`CommandEach: missing or empty Command field.`);
			return fCallback(null, pManifestEntry);
		}

		// --- Resolve source array ---
		let tmpSource = this.resolveAddress(pTaskDefinition.Address, pContext);

		if (tmpSource === undefined || tmpSource === null)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = '[]';
			pManifestEntry.Log.push(`CommandEach: Address "${pTaskDefinition.Address}" resolved to null or undefined; nothing to execute.`);
			this.storeDestination(pTaskDefinition, pContext, pManifestEntry, []);
			return fCallback(null, pManifestEntry);
		}

		if (!Array.isArray(tmpSource))
		{
			// Wrap a single value into an array for uniform processing
			tmpSource = [tmpSource];
			pManifestEntry.Log.push(`CommandEach: source is not an array; wrapped in array.`);
		}

		if (tmpSource.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = '[]';
			pManifestEntry.Log.push(`CommandEach: source array is empty, nothing to execute.`);
			this.storeDestination(pTaskDefinition, pContext, pManifestEntry, []);
			return fCallback(null, pManifestEntry);
		}

		let tmpContinueOnError = (pTaskDefinition.ContinueOnError !== false);
		let tmpCommandTemplate = pTaskDefinition.Command;
		let tmpTimeout = (this.fable?.ProgramConfiguration?.UltravisorCommandTimeoutMilliseconds) || 300000;
		let tmpMaxBuffer = (this.fable?.ProgramConfiguration?.UltravisorCommandMaxBufferBytes) || 10485760;
		let tmpCount = tmpSource.length;

		pManifestEntry.Log.push(`CommandEach: executing command template for ${tmpCount} value(s).`);

		let tmpResults = [];
		let tmpSuccessCount = 0;
		let tmpFailCount = 0;
		let tmpIndex = 0;

		let fRunNext = () =>
		{
			if (tmpIndex >= tmpCount)
			{
				// All commands have been executed
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = (tmpFailCount === 0) ? 'Complete' : 'Complete';
				pManifestEntry.Success = (tmpFailCount === 0);
				pManifestEntry.Output = JSON.stringify({
					Total: tmpCount,
					Succeeded: tmpSuccessCount,
					Failed: tmpFailCount
				});

				pManifestEntry.Log.push(`CommandEach: finished. ${tmpSuccessCount} succeeded, ${tmpFailCount} failed out of ${tmpCount}.`);

				this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpResults);
				this.storeResult(pTaskDefinition, pContext, pManifestEntry, tmpResults);

				return fCallback(null, pManifestEntry);
			}

			let tmpValue = tmpSource[tmpIndex];
			let tmpValueString = (tmpValue === null || tmpValue === undefined) ? '' : String(tmpValue);

			// Interpolate the command template
			let tmpCommand = tmpCommandTemplate;
			tmpCommand = tmpCommand.split('{Value}').join(tmpValueString);
			tmpCommand = tmpCommand.split('{Index}').join(String(tmpIndex));
			tmpCommand = tmpCommand.split('{Count}').join(String(tmpCount));

			let tmpCurrentIndex = tmpIndex;
			tmpIndex++;

			pManifestEntry.Log.push(`CommandEach [${tmpCurrentIndex}/${tmpCount}]: ${tmpCommand}`);

			libChildProcess.exec(tmpCommand, { timeout: tmpTimeout, maxBuffer: tmpMaxBuffer },
				(pError, pStdOut, pStdErr) =>
				{
					let tmpResult = {
						Value: tmpValue,
						Index: tmpCurrentIndex,
						Command: tmpCommand,
						ExitCode: pError ? (pError.code || 1) : 0,
						StdOut: pStdOut || '',
						StdErr: pStdErr || '',
						Success: !pError
					};

					tmpResults.push(tmpResult);

					if (pError)
					{
						tmpFailCount++;
						pManifestEntry.Log.push(`CommandEach [${tmpCurrentIndex}]: failed - ${pError.message}`);

						if (!tmpContinueOnError)
						{
							pManifestEntry.StopTime = new Date().toISOString();
							pManifestEntry.Status = 'Error';
							pManifestEntry.Success = false;
							pManifestEntry.Output = JSON.stringify({
								Total: tmpCount,
								Succeeded: tmpSuccessCount,
								Failed: tmpFailCount,
								StoppedAtIndex: tmpCurrentIndex
							});
							pManifestEntry.Log.push(`CommandEach: stopping at index ${tmpCurrentIndex} due to ContinueOnError=false.`);

							this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpResults);
							this.storeResult(pTaskDefinition, pContext, pManifestEntry, tmpResults);

							return fCallback(null, pManifestEntry);
						}
					}
					else
					{
						tmpSuccessCount++;
						pManifestEntry.Log.push(`CommandEach [${tmpCurrentIndex}]: succeeded.`);
					}

					fRunNext();
				});
		};

		fRunNext();
	}
}

module.exports = UltravisorTaskCommandEach;
