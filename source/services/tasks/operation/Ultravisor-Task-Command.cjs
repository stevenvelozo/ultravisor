const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

class UltravisorTaskCommand extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Execute a shell command task.
	 *
	 * Task definition fields:
	 *   - Command (or Parameters): the shell command string to execute.
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskCommand;
