const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

class UltravisorTaskLaunchTask extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Asynchronously launch an isolated task.
	 *
	 * The parent task completes immediately without waiting for the
	 * child task to finish.  The child runs in the background and
	 * its result is logged when it completes.
	 *
	 * Task definition fields:
	 *   - TargetTask (required): GUID of the task to launch.
	 *   - InitialState (optional): JSON object or dot-notation address
	 *       string to resolve from the parent's GlobalState.  Used as
	 *       the child task's GlobalState.
	 *   - MergeParentState (optional, default false): if true, the
	 *       parent's GlobalState is deep-cloned as the base and
	 *       InitialState is merged on top.
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskLaunchTask;
