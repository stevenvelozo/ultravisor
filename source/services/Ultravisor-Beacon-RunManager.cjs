/**
 * Ultravisor Beacon Run Manager
 *
 * Owns the hub-assigned RunID namespace.  Clients call startRun() with
 * an optional IdempotencyKey; the manager returns an existing RunID on
 * a duplicate key or mints a fresh one otherwise.  The generated RunID
 * shape is "rn-<hub-instance>-<epoch-ms>-<counter>" so the hub prefix
 * cannot collide with any client-space identifier.
 *
 * All work items submitted via /Beacon/Work/Enqueue reference the
 * RunID assigned here; retold-labs and other submitter stacks adopt
 * this value as their phases.jsonl run_id field.
 *
 * @module Ultravisor-Beacon-RunManager
 */

const libPictService = require('pict-serviceproviderbase');
const libCrypto = require('crypto');

class UltravisorBeaconRunManager extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.serviceType = 'UltravisorBeaconRunManager';

		this._HubInstanceID = (this.fable.settings && this.fable.settings.UltravisorHubInstanceID)
			|| this._shortHostSlug();
		this._RunCounter = 0;

		// In-memory idempotency cache to short-circuit DB hits for hot
		// submitters replaying the same key.  Authoritative store is
		// the BeaconRun table.
		this._IdempotencyCache = {};
	}

	_shortHostSlug()
	{
		try
		{
			let tmpHost = require('os').hostname() || 'hub';
			return tmpHost.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toLowerCase() || 'hub';
		}
		catch (pError)
		{
			return 'hub';
		}
	}

	_getStore()
	{
		let tmpMap = this.fable.servicesMap && this.fable.servicesMap.UltravisorBeaconQueueStore;
		if (!tmpMap) return null;
		let tmpStore = Object.values(tmpMap)[0];
		return (tmpStore && tmpStore.isEnabled()) ? tmpStore : null;
	}

	_mintRunID()
	{
		this._RunCounter++;
		return `rn-${this._HubInstanceID}-${Date.now()}-${this._RunCounter}`;
	}

	_guid()
	{
		if (typeof libCrypto.randomUUID === 'function')
		{
			return libCrypto.randomUUID();
		}
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) =>
		{
			let r = Math.random() * 16 | 0;
			let v = c === 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}

	/**
	 * Start a run.  If pInfo.IdempotencyKey matches an active run, the
	 * existing run is returned instead of a new one being created.
	 *
	 * @param {object} pInfo - { IdempotencyKey?, SubmitterTag?, Metadata? }
	 * @returns {object} run record
	 */
	startRun(pInfo)
	{
		let tmpInfo = pInfo || {};
		let tmpStore = this._getStore();

		if (tmpInfo.IdempotencyKey)
		{
			let tmpCached = this._IdempotencyCache[tmpInfo.IdempotencyKey];
			if (tmpCached) return tmpCached;

			if (tmpStore)
			{
				let tmpExisting = tmpStore.getRunByIdempotencyKey(tmpInfo.IdempotencyKey);
				if (tmpExisting)
				{
					this._IdempotencyCache[tmpInfo.IdempotencyKey] = tmpExisting;
					return tmpExisting;
				}
			}
		}

		let tmpRun = {
			GUIDBeaconRun: this._guid(),
			RunID: this._mintRunID(),
			IdempotencyKey: tmpInfo.IdempotencyKey || '',
			SubmitterTag: tmpInfo.SubmitterTag || '',
			State: 'Active',
			StartedAt: new Date().toISOString(),
			Metadata: tmpInfo.Metadata || {}
		};

		if (tmpStore)
		{
			let tmpSaved = tmpStore.insertRun(tmpRun);
			if (tmpSaved) tmpRun = tmpSaved;
		}
		if (tmpInfo.IdempotencyKey)
		{
			this._IdempotencyCache[tmpInfo.IdempotencyKey] = tmpRun;
		}
		this.log.info(`BeaconRunManager: started run [${tmpRun.RunID}] (tag=${tmpRun.SubmitterTag || 'none'}, idempotency=${tmpRun.IdempotencyKey || 'none'}).`);
		return tmpRun;
	}

	getRun(pRunID)
	{
		let tmpStore = this._getStore();
		return tmpStore ? tmpStore.getRunByRunID(pRunID) : null;
	}

	endRun(pRunID, pFinalState)
	{
		let tmpStore = this._getStore();
		if (!tmpStore) return false;
		let tmpRun = tmpStore.getRunByRunID(pRunID);
		if (!tmpRun) return false;
		let tmpState = pFinalState || 'Ended';
		tmpStore.updateRunState(pRunID, tmpState,
			{ EndedAt: new Date().toISOString() });
		if (tmpRun.IdempotencyKey)
		{
			delete this._IdempotencyCache[tmpRun.IdempotencyKey];
		}
		return true;
	}

	cancelRun(pRunID, pReason)
	{
		let tmpStore = this._getStore();
		if (!tmpStore) return false;
		let tmpRun = tmpStore.getRunByRunID(pRunID);
		if (!tmpRun) return false;
		let tmpNow = new Date().toISOString();
		tmpStore.updateRunState(pRunID, 'Canceled',
			{ CanceledAt: tmpNow, EndedAt: tmpNow, CancelReason: pReason || '' });
		if (tmpRun.IdempotencyKey)
		{
			delete this._IdempotencyCache[tmpRun.IdempotencyKey];
		}
		return true;
	}
}

module.exports = UltravisorBeaconRunManager;
