/**
 * Ultravisor Beacon Executor
 *
 * Routes work items to the appropriate capability provider via the
 * ProviderRegistry. Replaces the former hard-coded switch statement
 * with a pluggable, composable provider architecture.
 */

const libBeaconProviderRegistry = require('./Ultravisor-Beacon-ProviderRegistry.cjs');

class UltravisorBeaconExecutor
{
	constructor(pConfig)
	{
		this._Config = pConfig || {};
		this._StagingPath = this._Config.StagingPath || process.cwd();
		this._ProviderRegistry = new libBeaconProviderRegistry();
	}

	/**
	 * Get the provider registry.
	 * Used by BeaconClient for capability list and provider lifecycle.
	 */
	get providerRegistry()
	{
		return this._ProviderRegistry;
	}

	/**
	 * Execute a work item by routing to the appropriate provider.
	 *
	 * @param {object} pWorkItem - { WorkItemHash, Capability, Action, Settings, TimeoutMs }
	 * @param {function} fCallback - function(pError, pResult) where pResult = { Outputs, Log }
	 * @param {function} [fReportProgress] - Optional progress callback passed through to provider
	 */
	execute(pWorkItem, fCallback, fReportProgress)
	{
		let tmpCapability = pWorkItem.Capability || 'Shell';
		let tmpAction = pWorkItem.Action || '';

		let tmpResolved = this._ProviderRegistry.resolve(tmpCapability, tmpAction);

		if (!tmpResolved)
		{
			return fCallback(null, {
				Outputs: {
					StdOut: `Unknown capability: ${tmpCapability}` +
						(tmpAction ? `/${tmpAction}` : ''),
					ExitCode: -1,
					Result: ''
				},
				Log: [`Beacon Executor: no provider for [${tmpCapability}` +
					(tmpAction ? `/${tmpAction}` : '') + `].`]
			});
		}

		let tmpContext = {
			StagingPath: this._StagingPath
		};

		tmpResolved.provider.execute(
			tmpResolved.action, pWorkItem, tmpContext, fCallback, fReportProgress);
	}
}

module.exports = UltravisorBeaconExecutor;
