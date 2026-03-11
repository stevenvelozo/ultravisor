/**
 * Task configurations for the "Shell" capability.
 *
 * Contains:
 *   - command   — Executes a shell command on the server.
 */

const libChildProcess = require('child_process');


module.exports =
[
	// ── command ─────────────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'command',
			Name: 'Command',
			Description: 'Executes a shell command on the server.',
			Category: 'control',
			Capability: 'Shell',
			Action: 'Execute',
			Tier: 'Platform',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Complete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'Command', DataType: 'String', Required: true, Description: 'Shell command to execute' },
				{ Name: 'Parameters', DataType: 'String', Required: false, Description: 'Command-line parameters' },
				{ Name: 'Description', DataType: 'String', Required: false, Description: 'Human-readable description of this command' }
			],
			StateOutputs: [
				{ Name: 'StdOut', DataType: 'String', Description: 'Standard output from the command' },
				{ Name: 'ExitCode', DataType: 'Number', Description: 'Exit code of the command' }
			],
			DefaultSettings: { Command: '', Parameters: '', Description: '' }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpCommand = pResolvedSettings.Command || '';
			let tmpParameters = pResolvedSettings.Parameters || '';

			if (!tmpCommand)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: { StdOut: '', ExitCode: -1 }, Log: ['Command: no command specified.'] });
			}

			let tmpFullCommand = tmpParameters ? (tmpCommand + ' ' + tmpParameters) : tmpCommand;

			libChildProcess.exec(tmpFullCommand,
				{ cwd: pExecutionContext.StagingPath || process.cwd(), timeout: 300000 },
				function (pError, pStdOut, pStdErr)
				{
					if (pError)
					{
						return fCallback(null, {
							EventToFire: 'Error',
							Outputs: { StdOut: (pStdOut || '') + (pStdErr || ''), ExitCode: pError.code || 1 },
							Log: [`Command failed: ${pError.message}`, pStdErr || '']
						});
					}

					return fCallback(null, {
						EventToFire: 'Complete',
						Outputs: { StdOut: pStdOut || '', ExitCode: 0 },
						Log: [`Command executed: ${tmpFullCommand}`]
					});
				});
		}
	}
];
