const libUltravisorTaskBase = require('./Ultravisor-Task-Base.cjs');

const libChildProcess = require('child_process');

class UltravisorTaskCommand extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Execute a shell command task.
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
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
}

module.exports = UltravisorTaskCommand;
