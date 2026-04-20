/**
 * Ultravisor Beacon Action Defaults
 *
 * Resolves per-action runtime defaults (timeout, retry policy, priority,
 * expected-wait baseline) from the BeaconActionDefault table.  Live
 * config changes land here instead of in Fable settings, which means
 * an operator can tune a slow capability without restarting the hub.
 *
 * Fallback order for any single field: per-request Settings → per-action
 * row → per-capability row (Action="") → Fable setting → hard default.
 * The last two levels are the compatibility shim while we migrate the
 * scattered settings into rows.
 *
 * @module Ultravisor-Beacon-ActionDefaults
 */

const libPictService = require('pict-serviceproviderbase');

const HARD_DEFAULTS = {
	TimeoutMs: 300000,
	MaxAttempts: 1,
	RetryBackoffMs: 5000,
	DefaultPriority: 0,
	ExpectedWaitP95Ms: 0,
	HeartbeatExpectedMs: 60000,
	MinSamplesForBaseline: 20
};

class UltravisorBeaconActionDefaults extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
		this.serviceType = 'UltravisorBeaconActionDefaults';
		this._Cache = {};
		this._CacheTTLMs = 10000;
	}

	_getStore()
	{
		let tmpMap = this.fable.servicesMap && this.fable.servicesMap.UltravisorBeaconQueueStore;
		if (!tmpMap) return null;
		let tmpStore = Object.values(tmpMap)[0];
		return (tmpStore && tmpStore.isEnabled()) ? tmpStore : null;
	}

	_cacheKey(pCap, pAction)
	{
		return `${pCap}||${pAction || ''}`;
	}

	_fableSettingFallback(pKey)
	{
		let tmpSettings = this.fable.settings || {};
		// Legacy settings names kept during the migration period.
		if (pKey === 'TimeoutMs' && tmpSettings.UltravisorBeaconWorkItemTimeoutMs)
		{
			return tmpSettings.UltravisorBeaconWorkItemTimeoutMs;
		}
		if (pKey === 'HeartbeatExpectedMs' && tmpSettings.UltravisorBeaconHeartbeatMs)
		{
			return tmpSettings.UltravisorBeaconHeartbeatMs;
		}
		return null;
	}

	invalidate()
	{
		this._Cache = {};
	}

	resolve(pCapability, pAction)
	{
		let tmpKey = this._cacheKey(pCapability, pAction);
		let tmpCached = this._Cache[tmpKey];
		let tmpNow = Date.now();
		if (tmpCached && (tmpNow - tmpCached.At) < this._CacheTTLMs)
		{
			return tmpCached.Value;
		}

		let tmpStore = this._getStore();
		let tmpSpecific = null;
		let tmpWildcard = null;
		if (tmpStore)
		{
			tmpSpecific = tmpStore.getActionDefault(pCapability, pAction || '');
			if (!tmpSpecific && pAction)
			{
				tmpWildcard = tmpStore.getActionDefault(pCapability, '');
			}
		}

		let tmpResolved = {};
		for (let tmpField of Object.keys(HARD_DEFAULTS))
		{
			let tmpVal = null;
			if (tmpSpecific && tmpSpecific[tmpField] != null && tmpSpecific[tmpField] !== 0)
			{
				tmpVal = tmpSpecific[tmpField];
			}
			else if (tmpWildcard && tmpWildcard[tmpField] != null && tmpWildcard[tmpField] !== 0)
			{
				tmpVal = tmpWildcard[tmpField];
			}
			else
			{
				tmpVal = this._fableSettingFallback(tmpField);
			}
			if (tmpVal == null) tmpVal = HARD_DEFAULTS[tmpField];
			tmpResolved[tmpField] = tmpVal;
		}

		this._Cache[tmpKey] = { At: tmpNow, Value: tmpResolved };
		return tmpResolved;
	}

	applyToWorkItem(pWorkItem, pRequestSettings)
	{
		let tmpResolved = this.resolve(pWorkItem.Capability, pWorkItem.Action);
		let tmpSettings = pRequestSettings || {};

		pWorkItem.TimeoutMs = pWorkItem.TimeoutMs
			|| parseInt(tmpSettings.timeoutMs, 10)
			|| parseInt(tmpSettings.TimeoutMs, 10)
			|| tmpResolved.TimeoutMs;

		pWorkItem.MaxAttempts = pWorkItem.MaxAttempts
			|| parseInt(tmpSettings.maxRetries, 10)
			|| parseInt(tmpSettings.MaxAttempts, 10)
			|| tmpResolved.MaxAttempts;

		pWorkItem.RetryBackoffMs = pWorkItem.RetryBackoffMs
			|| parseInt(tmpSettings.retryBackoffMs, 10)
			|| parseInt(tmpSettings.RetryBackoffMs, 10)
			|| tmpResolved.RetryBackoffMs;

		if (pWorkItem.Priority == null)
		{
			let tmpPri = parseInt(tmpSettings.priority, 10);
			if (isNaN(tmpPri)) tmpPri = parseInt(tmpSettings.Priority, 10);
			if (isNaN(tmpPri)) tmpPri = tmpResolved.DefaultPriority;
			pWorkItem.Priority = tmpPri;
		}

		return pWorkItem;
	}

	/**
	 * Compute a live p95 estimate from the last N completed samples.
	 * Used when no ExpectedWaitP95Ms is set on the row yet.  Stored
	 * back into the row so future lookups are fast.
	 */
	recomputeWaitBaseline(pCapability, pAction, pMinSamples)
	{
		let tmpStore = this._getStore();
		if (!tmpStore) return null;
		let tmpMin = pMinSamples || HARD_DEFAULTS.MinSamplesForBaseline;
		let tmpSamples = tmpStore.queueWaitSamples(pCapability, pAction || '', 500);
		if (tmpSamples.length < tmpMin) return null;
		tmpSamples.sort((a, b) => a - b);
		let tmpIdx = Math.max(0, Math.floor(tmpSamples.length * 0.95) - 1);
		let tmpP95 = tmpSamples[tmpIdx];
		tmpStore.upsertActionDefault({
			Capability: pCapability,
			Action: pAction || '',
			ExpectedWaitP95Ms: tmpP95
		});
		this.invalidate();
		return tmpP95;
	}
}

module.exports = UltravisorBeaconActionDefaults;
