/**
 * UltravisorAdmissionPolicy (Phase 4 — Pillar 4)
 *
 * Server-side admission control. Tracks queue depth + fleet health and
 * decides on every enqueue whether to admit or 429 the request, plus a
 * per-client token bucket so a runaway client gets isolated before it
 * affects others.
 *
 * Three pieces, one service:
 *   a) Backpressure  — global thresholds on queue depth + fleet alive
 *      ratio. Above MaxQueuedDepth or below MinFleetAliveRatio, every
 *      enqueue request is denied with 429 + Retry-After.
 *   b) Per-client rate limit — token bucket keyed on session ID (auth)
 *      or remote IP (anonymous). 200 RPS per client, burst 500. A
 *      misbehaving client that ignores 429s gets local-rate-limited
 *      without affecting others.
 *   c) Observer events — observer.admission.denied / .recovered fire
 *      through the existing event stream so an operator sees what
 *      happened.
 *
 * Read-only routes never go through this service. The API server only
 * calls evaluate() on enqueue routes (POST /Operation/Execute/Async,
 * POST /Operation/Execute/Batch, POST /Beacon/Work/Enqueue).
 */

const libPictService = require('pict-serviceproviderbase');

const DEFAULT_THRESHOLDS =
{
	MaxQueuedDepth:        5000,
	SoftQueuedDepth:       3000,
	MinFleetAliveRatio:    0.5,
	AdmitTokenBucketRefill: 100,    // tokens / second, global
	PerClientRPS:          200,
	PerClientBurst:        500
};

class UltravisorAdmissionPolicy extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
		this.serviceType = 'UltravisorAdmissionPolicy';

		this._Thresholds = Object.assign({}, DEFAULT_THRESHOLDS, (pOptions && pOptions.Thresholds) || {});

		// Per-client token buckets keyed on a synthetic ClientID
		// (session if available, else remote address).
		this._ClientBuckets = new Map();

		// 'Healthy' until the first denial; flips to 'Denying' on the
		// first deny and back to 'Healthy' when conditions clear, with
		// observer.admission.recovered firing on the transition.
		this._Mode = 'Healthy';
		this._FirstDenyAt = null;
		this._DenyCounters = { window_start: Date.now(), count: 0 };
	}

	getThresholds()
	{
		return Object.assign({}, this._Thresholds);
	}

	getMode()
	{
		return this._Mode;
	}

	_getService(pTypeName)
	{
		if (!this.fable || !this.fable.servicesMap) return null;
		let tmpMap = this.fable.servicesMap[pTypeName];
		if (!tmpMap) return null;
		return Object.values(tmpMap)[0] || null;
	}

	// Pull live signals from the existing services. Best-effort — if
	// either service is missing (test fixture, partial init), we
	// degrade to "always admit" rather than blocking.
	_sample()
	{
		let tmpCoord = this._getService('UltravisorBeaconCoordinator');
		let tmpObs = this._getService('UltravisorObserver');
		let tmpQueuedDepth = 0;
		let tmpInFlight = 0;
		if (tmpCoord && typeof tmpCoord.listWorkItems === 'function')
		{
			let tmpItems = tmpCoord.listWorkItems();
			for (let i = 0; i < tmpItems.length; i++)
			{
				let tmpStatus = tmpItems[i] && tmpItems[i].Status;
				if (tmpStatus === 'Pending' || tmpStatus === 'Queued' || tmpStatus === 'Assigned')
				{
					tmpQueuedDepth++;
				}
				else if (tmpStatus === 'Dispatched' || tmpStatus === 'Running')
				{
					tmpInFlight++;
				}
			}
		}
		let tmpAlive = 0;
		let tmpTotal = 0;
		if (tmpObs && typeof tmpObs.getBeacons === 'function')
		{
			// Observer's _Beacons map tracks every beacon it ever saw,
			// including deregistered ones still in the GC grace window.
			// For fleet-health we only care about the *currently known*
			// fleet — beacons that are still WS-connected OR whose
			// most recent contact was within a recent window. Old Dead
			// records would otherwise drag the alive ratio under the
			// MinFleetAliveRatio threshold even when every active
			// beacon is healthy.
			let tmpBeacons = tmpObs.getBeacons();
			let tmpKeys = Object.keys(tmpBeacons || {});
			let tmpRecentMs = 5 * 60 * 1000; // 5 min currency window
			let tmpNow = Date.now();
			for (let i = 0; i < tmpKeys.length; i++)
			{
				let tmpRec = tmpBeacons[tmpKeys[i]];
				if (!tmpRec) continue;
				// Skip beacons explicitly deregistered.
				if (tmpRec.DeregisteredAt) continue;
				// Skip Dead beacons whose last contact is older than
				// the currency window — they're effectively gone.
				let tmpLastSeen = tmpRec.LastHeartbeatAt || tmpRec.LastWSCloseAt
					|| tmpRec.RegisteredAt || '';
				if (tmpLastSeen)
				{
					let tmpLastSeenMs = Date.parse(tmpLastSeen);
					if (Number.isFinite(tmpLastSeenMs)
						&& tmpRec.Liveness !== 'Alive'
						&& (tmpNow - tmpLastSeenMs) > tmpRecentMs)
					{
						continue;
					}
				}
				tmpTotal++;
				if (tmpRec.Liveness === 'Alive') { tmpAlive++; }
			}
		}
		let tmpRatio = tmpTotal === 0 ? 1 : (tmpAlive / tmpTotal);
		return {
			QueuedDepth: tmpQueuedDepth,
			InFlight: tmpInFlight,
			AliveBeacons: tmpAlive,
			TotalBeacons: tmpTotal,
			FleetAliveRatio: tmpRatio
		};
	}

	_clientKey(pRequest)
	{
		// Prefer authenticated session ID. Fall back to remote IP.
		// Lab traffic is typically anonymous so the IP path is the
		// hot one.
		let tmpHeaders = pRequest && pRequest.headers ? pRequest.headers : {};
		let tmpAuth = pRequest && pRequest.session && pRequest.session.SessionID;
		if (tmpAuth && tmpAuth !== 'anonymous') { return 'session:' + tmpAuth; }
		let tmpIP = pRequest && pRequest.connection && pRequest.connection.remoteAddress;
		if (!tmpIP && tmpHeaders['x-forwarded-for'])
		{
			tmpIP = String(tmpHeaders['x-forwarded-for']).split(',')[0].trim();
		}
		return 'ip:' + (tmpIP || 'unknown');
	}

	// Token bucket: refills at PerClientRPS up to PerClientBurst. One
	// admit costs one token. Out of tokens → deny with retry-after =
	// time until next token refill (rounded up to 1s minimum so
	// clients don't hot-loop).
	_consumeToken(pClientID)
	{
		let tmpNow = Date.now();
		let tmpRPS = this._Thresholds.PerClientRPS;
		let tmpBurst = this._Thresholds.PerClientBurst;
		let tmpBucket = this._ClientBuckets.get(pClientID);
		if (!tmpBucket)
		{
			tmpBucket = { Tokens: tmpBurst, LastRefillAt: tmpNow };
			this._ClientBuckets.set(pClientID, tmpBucket);
		}
		// Refill since last sample. Refill rate is per-second; convert
		// elapsed to tokens.
		let tmpElapsedMs = tmpNow - tmpBucket.LastRefillAt;
		if (tmpElapsedMs > 0)
		{
			let tmpRefill = (tmpElapsedMs / 1000) * tmpRPS;
			tmpBucket.Tokens = Math.min(tmpBurst, tmpBucket.Tokens + tmpRefill);
			tmpBucket.LastRefillAt = tmpNow;
		}
		if (tmpBucket.Tokens >= 1)
		{
			tmpBucket.Tokens -= 1;
			return { Allowed: true };
		}
		// Denied. Time until 1 token = (1 - tokens) / RPS seconds.
		let tmpWaitS = Math.max(1, Math.ceil((1 - tmpBucket.Tokens) / tmpRPS));
		return { Allowed: false, RetryAfterSeconds: tmpWaitS };
	}

	/**
	 * Evaluate a request. Returns { Admitted: true } or
	 * { Admitted: false, Reason, RetryAfterSeconds, Detail }.
	 *
	 * pCategory is one of:
	 *   'enqueue'  — full backpressure + rate limit applies
	 *   'readonly' — never admission-deny; per-client rate limit only
	 */
	evaluate(pRequest, pCategory)
	{
		let tmpClientID = this._clientKey(pRequest);
		let tmpIsEnqueue = pCategory !== 'readonly';

		if (tmpIsEnqueue)
		{
			let tmpSample = this._sample();
			if (tmpSample.QueuedDepth >= this._Thresholds.MaxQueuedDepth)
			{
				return this._deny('queued_depth_exceeded', tmpClientID, 30, {
					QueuedDepth: tmpSample.QueuedDepth,
					MaxQueuedDepth: this._Thresholds.MaxQueuedDepth
				}, tmpSample);
			}
			// Fleet-health backpressure only applies under pressure —
			// if the queue is empty there's nothing to back-pressure on
			// behalf of, and a flapping fleet during low-traffic
			// windows shouldn't lock out new work.
			if (tmpSample.QueuedDepth >= this._Thresholds.SoftQueuedDepth
				&& tmpSample.TotalBeacons > 0
				&& tmpSample.FleetAliveRatio < this._Thresholds.MinFleetAliveRatio)
			{
				return this._deny('fleet_unhealthy', tmpClientID, 15, {
					AliveBeacons: tmpSample.AliveBeacons,
					TotalBeacons: tmpSample.TotalBeacons,
					FleetAliveRatio: tmpSample.FleetAliveRatio,
					MinFleetAliveRatio: this._Thresholds.MinFleetAliveRatio
				}, tmpSample);
			}
		}

		// Per-client rate limit applies to all categories. A misbehaving
		// client that ignores 429s should still get rate-limited.
		let tmpToken = this._consumeToken(tmpClientID);
		if (!tmpToken.Allowed)
		{
			return this._deny('client_rate_limit', tmpClientID,
				tmpToken.RetryAfterSeconds, { ClientID: tmpClientID }, null);
		}

		// Healthy admit. If we were in Denying mode and now the gate is
		// clear, fire the recovery event.
		if (this._Mode === 'Denying' && tmpIsEnqueue)
		{
			this._Mode = 'Healthy';
			this._announce('observer.admission.recovered', {
				ClientID: tmpClientID,
				At: new Date().toISOString()
			});
		}
		return { Admitted: true };
	}

	_deny(pReason, pClientID, pRetryAfterS, pDetail, pSample)
	{
		this._DenyCounters.count += 1;
		if (this._Mode !== 'Denying')
		{
			this._Mode = 'Denying';
			this._FirstDenyAt = new Date().toISOString();
		}
		this._announce('observer.admission.denied', Object.assign({
			Reason: pReason,
			ClientID: pClientID,
			RetryAfterSeconds: pRetryAfterS,
			At: new Date().toISOString()
		}, pSample ? {
			QueuedDepth: pSample.QueuedDepth,
			FleetAliveRatio: pSample.FleetAliveRatio
		} : {}));
		return {
			Admitted: false,
			Reason: pReason,
			RetryAfterSeconds: pRetryAfterS,
			Detail: pDetail
		};
	}

	// Announce through the API server's broadcast hook. We don't take
	// a hard dependency on UltravisorObserver — emitting via the API
	// server keeps observer.* on the same wire envelope as queue.*.
	_announce(pTopic, pPayload)
	{
		let tmpAPI = this._getService('UltravisorAPIServer');
		if (tmpAPI && typeof tmpAPI._broadcastQueueTopic === 'function')
		{
			try { tmpAPI._broadcastQueueTopic(pTopic, pPayload); }
			catch (pErr) { /* best effort */ }
		}
	}
}

module.exports = UltravisorAdmissionPolicy;
