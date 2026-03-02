const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

class UltravisorTaskLaunchOperation extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Asynchronously launch another operation.
	 *
	 * The parent task completes immediately without waiting for the
	 * child operation to finish.  The child runs in the background
	 * and its result is logged when it completes.
	 *
	 * Task definition fields:
	 *   - TargetOperation (required): GUID of the operation to launch.
	 *   - InitialState (optional): JSON object or dot-notation address
	 *       string to resolve from the parent's GlobalState.  Used as
	 *       the child operation's initial GlobalState.
	 *   - MergeParentState (optional, default false): if true, the
	 *       parent's GlobalState is deep-cloned as the base and
	 *       InitialState is merged on top.
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskLaunchOperation;
