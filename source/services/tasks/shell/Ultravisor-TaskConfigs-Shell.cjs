/**
 * Task configurations for the "Shell" capability.
 *
 * Contains:
 *   - command   — Executes a shell command on the server.
 */

const libChildProcess = require('child_process');
const libPath = require('path');


module.exports =
[
	// ── command ─────────────────────────────────────────────────
	{
		Definition: require('./definitions/command.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpCommand = pResolvedSettings.Command || '';
			let tmpParameters = pResolvedSettings.Parameters || '';

			if (!tmpCommand)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: { StdOut: '', StdErr: '', ExitCode: -1 }, Log: ['Command: no command specified.'] });
			}

			let tmpFullCommand = tmpParameters ? (tmpCommand + ' ' + tmpParameters) : tmpCommand;

			let tmpBasePath = pExecutionContext.StagingPath || process.cwd();
			let tmpCwd = pResolvedSettings.WorkingDirectory
				? libPath.resolve(tmpBasePath, pResolvedSettings.WorkingDirectory)
				: tmpBasePath;

			let tmpExecOptions = { cwd: tmpCwd, timeout: pResolvedSettings.TimeoutMs || 300000 };

			if (pResolvedSettings.Environment)
			{
				let tmpEnv = {};
				try { tmpEnv = JSON.parse(pResolvedSettings.Environment); } catch(e) {}
				tmpExecOptions.env = Object.assign({}, process.env, tmpEnv);
			}

			libChildProcess.exec(tmpFullCommand, tmpExecOptions,
				function (pError, pStdOut, pStdErr)
				{
					if (pError)
					{
						return fCallback(null, {
							EventToFire: 'Error',
							Outputs: { StdOut: pStdOut || '', StdErr: pStdErr || '', ExitCode: pError.code || 1 },
							Log: [`Command failed: ${pError.message}`, pStdErr || '']
						});
					}

					return fCallback(null, {
						EventToFire: 'Complete',
						Outputs: { StdOut: pStdOut || '', StdErr: pStdErr || '', ExitCode: 0 },
						Log: [`Command executed: ${tmpFullCommand}`]
					});
				});
		}
	}
];
