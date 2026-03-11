/**
 * Ultravisor Beacon Executor
 *
 * Executes work items locally on the Beacon worker.
 * Phase 1: Shell capability (child_process.exec).
 */

const libChildProcess = require('child_process');

class UltravisorBeaconExecutor
{
	constructor(pConfig)
	{
		this._Config = pConfig || {};
		this._StagingPath = pConfig.StagingPath || process.cwd();
	}

	/**
	 * Execute a work item based on its Capability.
	 *
	 * @param {object} pWorkItem - { WorkItemHash, Capability, Action, Settings, TimeoutMs }
	 * @param {function} fCallback - function(pError, pResult) where pResult = { Outputs, Log }
	 */
	execute(pWorkItem, fCallback)
	{
		let tmpCapability = pWorkItem.Capability || 'Shell';

		switch (tmpCapability)
		{
			case 'Shell':
				return this._executeShell(pWorkItem, fCallback);
			case 'FileSystem':
				return this._executeFileSystem(pWorkItem, fCallback);
			default:
				return fCallback(null, {
					Outputs: { StdOut: `Unknown capability: ${tmpCapability}`, ExitCode: -1, Result: '' },
					Log: [`Beacon Executor: unsupported capability [${tmpCapability}].`]
				});
		}
	}

	_executeShell(pWorkItem, fCallback)
	{
		let tmpSettings = pWorkItem.Settings || {};
		let tmpCommand = tmpSettings.Command || '';
		let tmpParameters = tmpSettings.Parameters || '';

		if (!tmpCommand)
		{
			return fCallback(null, {
				Outputs: { StdOut: 'No command specified.', ExitCode: -1, Result: '' },
				Log: ['Beacon Executor: no command specified.']
			});
		}

		let tmpFullCommand = tmpParameters ? (tmpCommand + ' ' + tmpParameters) : tmpCommand;
		let tmpTimeout = pWorkItem.TimeoutMs || 300000;

		console.log(`  [Executor] Running: ${tmpFullCommand}`);

		libChildProcess.exec(tmpFullCommand,
			{
				cwd: this._StagingPath,
				timeout: tmpTimeout,
				maxBuffer: 10485760
			},
			function (pError, pStdOut, pStdErr)
			{
				if (pError)
				{
					return fCallback(null, {
						Outputs: {
							StdOut: (pStdOut || '') + (pStdErr || ''),
							ExitCode: pError.code || 1,
							Result: ''
						},
						Log: [`Command failed: ${pError.message}`, pStdErr || '']
					});
				}

				return fCallback(null, {
					Outputs: {
						StdOut: pStdOut || '',
						ExitCode: 0,
						Result: pStdOut || ''
					},
					Log: [`Command executed: ${tmpFullCommand}`]
				});
			});
	}

	_executeFileSystem(pWorkItem, fCallback)
	{
		// Phase 1: basic file system operations placeholder
		return fCallback(null, {
			Outputs: { StdOut: 'FileSystem capability not yet implemented on Beacon.', ExitCode: -1, Result: '' },
			Log: ['Beacon Executor: FileSystem capability is planned for Phase 2.']
		});
	}
}

module.exports = UltravisorBeaconExecutor;
