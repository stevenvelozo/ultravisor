/**
 * Task configurations for the "Shell" capability.
 *
 * Contains:
 *   - add-env-var  — Accumulator: appends one environment variable to a growing list.
 *   - command      — Executes a shell command on the server.
 */

const libChildProcess = require('child_process');
const libPath = require('path');


/**
 * Parse environment variables from a JSON string, accumulated array, or object.
 * Supports the accumulator pattern: an array of {Name, Value} objects
 * built by chaining add-env-var nodes.
 */
function _parseEnvironment(pEnvironment)
{
	if (!pEnvironment)
	{
		return null;
	}

	// Already a plain object — use directly
	if (typeof(pEnvironment) === 'object' && !Array.isArray(pEnvironment))
	{
		return pEnvironment;
	}

	// Accumulated array of {Name, Value} objects from add-env-var nodes
	if (Array.isArray(pEnvironment))
	{
		let tmpResult = {};
		for (let i = 0; i < pEnvironment.length; i++)
		{
			if (pEnvironment[i] && pEnvironment[i].Name)
			{
				tmpResult[pEnvironment[i].Name] = pEnvironment[i].Value || '';
			}
		}
		return tmpResult;
	}

	// Legacy: JSON string
	if (typeof(pEnvironment) === 'string' && pEnvironment.trim().length > 0)
	{
		try
		{
			let tmpParsed = JSON.parse(pEnvironment);
			if (typeof(tmpParsed) === 'object' && tmpParsed !== null)
			{
				if (Array.isArray(tmpParsed))
				{
					return _parseEnvironment(tmpParsed);
				}
				return tmpParsed;
			}
		}
		catch (pError)
		{
			// Not valid JSON
		}
	}

	return null;
}


module.exports =
[
	// ── add-env-var (accumulator) ─────────────────────────────
	{
		Definition: require('./definitions/add-env-var.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpName = pResolvedSettings.Name || '';
			let tmpValue = pResolvedSettings.Value || '';
			let tmpListAddress = pResolvedSettings.ListAddress;

			if (!tmpListAddress)
			{
				return fCallback(null, {
					EventToFire: 'Complete',
					Outputs: { Environment: [] },
					Log: ['AddEnvVar: no ListAddress specified.']
				});
			}

			if (!tmpName)
			{
				return fCallback(null, {
					EventToFire: 'Complete',
					Outputs: { Environment: [] },
					Log: ['AddEnvVar: no variable Name specified.']
				});
			}

			// Read existing accumulated list from state
			let tmpList = [];
			if (pExecutionContext.StateManager)
			{
				let tmpExisting = pExecutionContext.StateManager.resolveAddress(tmpListAddress, pExecutionContext, pExecutionContext.NodeHash);
				if (Array.isArray(tmpExisting))
				{
					tmpList = tmpExisting.slice();
				}
			}

			// Append new environment variable
			tmpList.push({ Name: tmpName, Value: tmpValue });

			let tmpStateWrites = {};
			tmpStateWrites[tmpListAddress] = tmpList;

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: { Environment: tmpList },
				StateWrites: tmpStateWrites,
				Log: [`AddEnvVar: appended "${tmpName}=${tmpValue}" (${tmpList.length} vars total)`]
			});
		}
	},

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

			// Environment: accept object, accumulated array, or JSON string
			let tmpEnv = _parseEnvironment(pResolvedSettings.Environment);
			if (tmpEnv)
			{
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
