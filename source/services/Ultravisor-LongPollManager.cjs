/**
 * Ultravisor LongPollManager (Phase 4 — Pillar 3)
 *
 * Tracks HTTP long-poll waiters that are blocked on `/Queue/Events` or
 * `/Observer/Events` until either (a) a matching event arrives in the
 * upstream ring buffer or (b) the per-waiter timeout fires.
 *
 * The core idea: WS subscribers and HTTP-poll subscribers consume the
 * same event stream. The API server already has a ring buffer
 * (`_QueueEventBuffer`) and a "find everything after this EventGUID"
 * helper (`_findQueueEventIndex`). This manager is the thin face that
 * lets a polling client get near-WS latency without holding a socket.
 *
 * Lifecycle:
 *   - register(pWaiter): book-keep a Response that should be answered
 *     either by drainOnBroadcast (a matching event arrived) or by the
 *     timeout (waitMs elapsed).
 *   - drainOnBroadcast(pBucket, pEnvelope): called by the API server
 *     after every replayable broadcast; resolves any waiters whose
 *     SinceGUID is now satisfiable.
 *   - cancel(pWaiter): client closed the request before either fired.
 *
 * Bounded resource use:
 *   - MaxConcurrentPollWaiters caps the number of in-flight waiters
 *     per bucket; new requests over the cap get a 503.
 *   - drainAll(pCode, pBody) for shutdown — every waiter gets a clean
 *     response so clients reconnect / repoll.
 */

const libPictService = require('pict-serviceproviderbase');

class UltravisorLongPollManager extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
		this.serviceType = 'UltravisorLongPollManager';

		// Bucket name → Set of waiter records. Buckets are 'queue' and
		// 'observer'; they share machinery but not state, because a
		// polling subscriber to one stream shouldn't be woken by the
		// other.
		this._Buckets = new Map();
		this._Buckets.set('queue', new Set());
		this._Buckets.set('observer', new Set());

		// Configurable cap. 1024 fits comfortably in memory at the
		// rough envelope size we see; raise per-deployment if 10K+
		// polling beacons are expected.
		this._MaxConcurrentPollWaiters = (pOptions && pOptions.MaxConcurrentPollWaiters) || 1024;
	}

	getMaxWaiters()
	{
		return this._MaxConcurrentPollWaiters;
	}

	getActiveWaiterCount(pBucketName)
	{
		let tmpBucket = this._Buckets.get(pBucketName);
		return tmpBucket ? tmpBucket.size : 0;
	}

	getTotalActiveWaiters()
	{
		let tmpTotal = 0;
		this._Buckets.forEach((pBucket) => { tmpTotal += pBucket.size; });
		return tmpTotal;
	}

	/**
	 * Try to register a waiter. Returns true on success; false when the
	 * cap is hit (caller is expected to send 503 + Retry-After).
	 *
	 * pWaiter shape:
	 *   {
	 *     BucketName:    'queue' | 'observer',
	 *     SinceGUID:     <string>,
	 *     Limit:         <int>,
	 *     RegisteredAt:  <ms epoch>,
	 *     fSatisfy:      function(pEnvelopes) — called when matching
	 *                    events should be sent. Manager guarantees it
	 *                    is invoked at most once.
	 *     fTimeout:      function() — called when waitMs elapses with
	 *                    no matching event. Manager guarantees at-most-
	 *                    once across (fSatisfy, fTimeout).
	 *     TimeoutHandle: <setTimeout handle>, set by the caller.
	 *     ClosedAt:      0 (mutated when client disconnects)
	 *   }
	 */
	register(pWaiter)
	{
		let tmpBucket = this._Buckets.get(pWaiter.BucketName);
		if (!tmpBucket) return false;
		if (this.getTotalActiveWaiters() >= this._MaxConcurrentPollWaiters)
		{
			return false;
		}
		pWaiter._Settled = false;
		tmpBucket.add(pWaiter);
		return true;
	}

	/**
	 * Mark a waiter as settled (so subsequent calls are no-ops) and
	 * remove it from the bucket. Returns true on first call.
	 */
	_settle(pWaiter)
	{
		if (!pWaiter || pWaiter._Settled) return false;
		pWaiter._Settled = true;
		let tmpBucket = this._Buckets.get(pWaiter.BucketName);
		if (tmpBucket) { tmpBucket.delete(pWaiter); }
		if (pWaiter.TimeoutHandle)
		{
			try { clearTimeout(pWaiter.TimeoutHandle); }
			catch (pErr) { /* best effort */ }
			pWaiter.TimeoutHandle = null;
		}
		return true;
	}

	cancel(pWaiter)
	{
		this._settle(pWaiter);
	}

	/**
	 * Called by the API server after every replayable upstream
	 * broadcast. Walks the bucket; any waiter whose SinceGUID is now
	 * resolvable from pBuffer gets fSatisfy called with a slice and is
	 * removed from the bucket.
	 *
	 * The caller (API server) owns the ring buffer. It passes:
	 *   pBucketName   — 'queue' or 'observer'
	 *   pBuffer       — the ring buffer array
	 *   pFindIdx      — function(pSinceGUID) -> index | -1
	 *
	 * This indirection keeps the manager ignorant of the buffer layout.
	 */
	drainOnBroadcast(pBucketName, pBuffer, pFindIdx)
	{
		let tmpBucket = this._Buckets.get(pBucketName);
		if (!tmpBucket || tmpBucket.size === 0) return;
		// Snapshot waiters; fSatisfy may run synchronously and could
		// otherwise mutate the bucket mid-iteration.
		let tmpWaiters = Array.from(tmpBucket);
		for (let i = 0; i < tmpWaiters.length; i++)
		{
			let tmpW = tmpWaiters[i];
			if (tmpW._Settled) continue;
			let tmpIdx = pFindIdx(tmpW.SinceGUID);
			if (tmpIdx < 0)
			{
				// Caller decides whether to 410-Gone the waiter; we
				// don't take a position on the GC policy here. If the
				// SinceGUID is just newer than anything we have, do
				// nothing — broadcast may rescue the waiter on a later
				// envelope.
				continue;
			}
			let tmpAvailable = pBuffer.slice(tmpIdx + 1);
			if (tmpAvailable.length === 0) continue;
			let tmpLimit = tmpW.Limit > 0 ? Math.min(tmpW.Limit, tmpAvailable.length) : tmpAvailable.length;
			let tmpSlice = tmpAvailable.slice(0, tmpLimit);
			this._settle(tmpW);
			try { tmpW.fSatisfy(tmpSlice, tmpAvailable.length > tmpLimit); }
			catch (pErr) { this.log && this.log.warn && this.log.warn(`LongPollManager: fSatisfy threw: ${pErr.message}`); }
		}
	}

	/**
	 * Used during shutdown / mass eviction. Calls fTimeout (treating it
	 * as an empty-events response) on every waiter and clears the bucket.
	 */
	drainAll()
	{
		this._Buckets.forEach((pBucket) =>
		{
			let tmpWaiters = Array.from(pBucket);
			for (let i = 0; i < tmpWaiters.length; i++)
			{
				let tmpW = tmpWaiters[i];
				if (tmpW._Settled) continue;
				this._settle(tmpW);
				try { tmpW.fTimeout(); }
				catch (pErr) { /* best effort */ }
			}
			pBucket.clear();
		});
	}
}

module.exports = UltravisorLongPollManager;
