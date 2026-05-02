/**
 * Provider-Timeline-Stream
 *
 * Owns the `/Timeline` long-poll cycle and reconciles the response into
 * AppData.Timeline.Stream. Views observe AppData and re-render; the
 * provider does not touch the DOM.
 *
 * Public API:
 *   startLive(pView)       — open the long-poll cycle in live mode.
 *                            pView is the subscriber that wants render
 *                            callbacks (see _notify).
 *   pauseToReplay(pFromIso, pToIso)
 *                          — stop live cycle, do one fixed-window fetch.
 *   resumeLive()           — return to live mode (re-resolves now-relative
 *                            from/to).
 *   refresh()              — force a single fetch in current mode.
 *   stop()                 — stop everything (called when leaving the view).
 *
 * AppData written:
 *   AppData.Timeline.Window  = { FromIso, ToIso, Mode, Bucket }
 *   AppData.Timeline.Stream  = { Past, Present, Future, Buckets, Cursor, More, Now, FetchedAt }
 *   AppData.Timeline.Status  = 'idle' | 'loading' | 'error' | 'stale'
 *   AppData.Timeline.Error   = string | null
 *
 * Mode logic:
 *   - 'live': uses relative from/to (e.g. 'now-2m', 'now+30s'); long-
 *     polls with waitMs=15000; on each response (event arrived OR
 *     timeout), recomputes the URL with fresh now-relative values and
 *     re-issues. Window slides automatically.
 *   - 'replay': uses fixed ISO from/to; one fetch with waitMs=0; no loop.
 *
 * Stale-cursor 410: the endpoint returns 410 Gone when the requested
 * `since` aged out of the ring. The provider switches to no-cursor
 * fetch so the response carries the freshest available state, toasts
 * the user, and resumes long-poll.
 *
 * Phase 5 endpoint contract: GET /Timeline?from=&to=&waitMs=&bucket=&capability=&runHash=&futureLimit=
 */

const libPictProvider = require('pict-provider');

const _ProviderConfiguration =
{
	ProviderIdentifier: 'Timeline-Stream',
	AutoInitialize:     true,
	AutoInitializeOrdinal: 100,

	// Long-poll wait window. The endpoint clamps to 60000; 15000 keeps
	// connection turnover frequent enough to recover quickly from a UV
	// restart while not pegging the server with reconnects.
	LongPollWaitMs: 15000,

	// Minimum interval between live-mode fetches. The /Timeline endpoint
	// returns immediately when the window has any content (which is
	// "always" against an active fleet), so without this throttle the
	// fetch loop hot-spins. 750ms gives near-real-time updates without
	// flooding the server.
	MinLiveFetchIntervalMs: 750,

	// Default relative window for live mode. The view can override per
	// page load via the URL `from` / `to` query params; this is the
	// fallback when nothing is specified.
	DefaultLiveFrom: 'now-2m',
	DefaultLiveTo:   'now+30s',

	// Default future projection limit per capability. The endpoint caps
	// to 256; 32 is a reasonable default that keeps the view from
	// rendering ETA-unknown ghosts deeper than is useful.
	DefaultFutureLimit: 32
};

class TimelineStreamProvider extends libPictProvider
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this._View = null;            // current subscriber view (for re-render notify)
		this._Mode = 'idle';          // 'live' | 'replay' | 'idle'
		this._AbortController = null; // for canceling in-flight fetch on mode switch
		this._LoopActive = false;
		this._FetchSerial = 0;        // monotonic, used to ignore stale responses
		this._LastFetchAt = 0;        // ms epoch of last successful fetch (for min-interval throttle)
		this._NextFetchTimer = null;  // setTimeout handle for delayed re-fetch

		// Initialize AppData branch.
		if (!this.pict.AppData.Timeline)
		{
			this.pict.AppData.Timeline = {};
		}
		this.pict.AppData.Timeline.Window =
		{
			FromIso: this.options.DefaultLiveFrom,
			ToIso:   this.options.DefaultLiveTo,
			Mode:    'live',
			Bucket:  'auto'
		};
		this.pict.AppData.Timeline.Stream =
		{
			Past: [], Present: [], Future: [], Buckets: null,
			Cursor: '', More: false, Now: null, FetchedAt: null
		};
		this.pict.AppData.Timeline.Status = 'idle';
		this.pict.AppData.Timeline.Error  = null;

		// Single-element-array conditional slots for live/replay
		// indicator (per modules/pict/CLAUDE.md).
		this.pict.AppData.Timeline.LiveSlot      = [{}];   // populated when live
		this.pict.AppData.Timeline.ReplaySlot    = [];     // populated when replay
		this.pict.AppData.Timeline.EmptySlot     = [];     // populated when no events
		this.pict.AppData.Timeline.FocusSlot     = [];     // populated when non-runHash focus
		this.pict.AppData.Timeline.WaterfallSlot = [];     // populated when runHash focus
	}

	// ====================================================================
	// Public API
	// ====================================================================

	startLive(pView)
	{
		this._View = pView || this._View;
		this._Mode = 'live';
		this.pict.AppData.Timeline.Window.Mode = 'live';
		this._setSlots('live');
		this._LoopActive = true;
		this._fetchOnce();
	}

	pauseToReplay(pFromIso, pToIso)
	{
		this._Mode = 'replay';
		this._LoopActive = false;
		this._abortInFlight();
		this.pict.AppData.Timeline.Window.Mode    = 'replay';
		this.pict.AppData.Timeline.Window.FromIso = pFromIso || this.pict.AppData.Timeline.Window.FromIso;
		this.pict.AppData.Timeline.Window.ToIso   = pToIso   || this.pict.AppData.Timeline.Window.ToIso;
		this._setSlots('replay');
		this._fetchOnce();
	}

	resumeLive()
	{
		this._abortInFlight();
		this.pict.AppData.Timeline.Window.FromIso = this.options.DefaultLiveFrom;
		this.pict.AppData.Timeline.Window.ToIso   = this.options.DefaultLiveTo;
		this.startLive(this._View);
	}

	refresh()
	{
		this._fetchOnce();
	}

	stop()
	{
		this._Mode = 'idle';
		this._LoopActive = false;
		this._abortInFlight();
	}

	setView(pView)
	{
		this._View = pView;
	}

	setBucket(pBucket)
	{
		this.pict.AppData.Timeline.Window.Bucket = pBucket || 'auto';
		this._fetchOnce();
	}

	// ====================================================================
	// Internals
	// ====================================================================

	_setSlots(pMode)
	{
		// Per modules/pict/CLAUDE.md: conditionals via single-element-array
		// driving {~TS:~}. Empty array → nothing rendered; one entry →
		// the corresponding template fragment renders once.
		if (pMode === 'live')
		{
			this.pict.AppData.Timeline.LiveSlot   = [{}];
			this.pict.AppData.Timeline.ReplaySlot = [];
		}
		else if (pMode === 'replay')
		{
			this.pict.AppData.Timeline.LiveSlot   = [];
			this.pict.AppData.Timeline.ReplaySlot = [{}];
		}
		else
		{
			this.pict.AppData.Timeline.LiveSlot   = [];
			this.pict.AppData.Timeline.ReplaySlot = [];
		}
	}

	_abortInFlight()
	{
		if (this._AbortController)
		{
			try { this._AbortController.abort(); }
			catch (pErr) { /* best effort */ }
			this._AbortController = null;
		}
		if (this._NextFetchTimer)
		{
			clearTimeout(this._NextFetchTimer);
			this._NextFetchTimer = null;
		}
	}

	// Throttled fetch scheduler — never fires more than once per
	// MinLiveFetchIntervalMs in live mode.
	_scheduleNextLiveFetch()
	{
		if (this._NextFetchTimer) return;
		let tmpElapsed = Date.now() - this._LastFetchAt;
		let tmpDelay = Math.max(0, this.options.MinLiveFetchIntervalMs - tmpElapsed);
		this._NextFetchTimer = setTimeout(function ()
		{
			this._NextFetchTimer = null;
			if (this._Mode === 'live' && this._LoopActive)
			{
				this._fetchOnce();
			}
		}.bind(this), tmpDelay);
	}

	_buildURL()
	{
		let tmpW = this.pict.AppData.Timeline.Window;
		let tmpBase = (this.pict.AppData.Ultravisor && this.pict.AppData.Ultravisor.APIBaseURL) || '';
		let tmpParams = [];
		tmpParams.push('from=' + encodeURIComponent(tmpW.FromIso));
		tmpParams.push('to=' + encodeURIComponent(tmpW.ToIso));
		tmpParams.push('bucket=' + encodeURIComponent(tmpW.Bucket || 'auto'));
		tmpParams.push('futureLimit=' + this.options.DefaultFutureLimit);
		if (this._Mode === 'live')
		{
			tmpParams.push('waitMs=' + this.options.LongPollWaitMs);
			let tmpCursor = this.pict.AppData.Timeline.Stream.Cursor || '';
			if (tmpCursor)
			{
				tmpParams.push('cursor=' + encodeURIComponent(tmpCursor));
			}
		}
		else
		{
			tmpParams.push('waitMs=0');
		}
		return tmpBase + '/Timeline?' + tmpParams.join('&');
	}

	_fetchOnce()
	{
		this._abortInFlight();
		let tmpController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
		this._AbortController = tmpController;

		let tmpURL = this._buildURL();
		this.pict.AppData.Timeline.Status = 'loading';
		this.pict.AppData.Timeline.Error = null;

		let tmpSerial = ++this._FetchSerial;

		fetch(tmpURL, { signal: tmpController ? tmpController.signal : undefined })
			.then(function (pResponse)
			{
				if (pResponse.status === 410)
				{
					return pResponse.json().then(function (pBody)
					{
						return { _stale: true, body: pBody, status: 410 };
					});
				}
				if (!pResponse.ok)
				{
					throw new Error('HTTP ' + pResponse.status);
				}
				return pResponse.json().then(function (pBody)
				{
					return { _stale: false, body: pBody, status: pResponse.status };
				});
			})
			.then(function (pPayload)
			{
				// Ignore stale responses from before a mode switch.
				if (tmpSerial !== this._FetchSerial) { return; }

				if (pPayload._stale)
				{
					this._handleStaleCursor(pPayload.body);
					return;
				}

				this._reconcile(pPayload.body);

				// If still in live mode, fire next long-poll cycle.
				if (this._Mode === 'live' && this._LoopActive)
				{
					// Throttle: the endpoint returns immediately when
					// the window has any content (typical against an
					// active fleet), so without a min-interval we'd
					// hot-loop. Queue the next fetch on a debounced
					// timer rather than firing immediately.
					this._scheduleNextLiveFetch();
				}
			}.bind(this))
			.catch(function (pError)
			{
				if (pError && pError.name === 'AbortError') { return; }
				if (tmpSerial !== this._FetchSerial) { return; }
				this.pict.log.warn('Timeline-Stream: fetch failed: ' + pError.message);
				this.pict.AppData.Timeline.Status = 'error';
				this.pict.AppData.Timeline.Error = pError.message || 'fetch failed';
				this._notify();

				// Back off on error in live mode — retry in 5s rather
				// than hot-looping against a broken UV.
				if (this._Mode === 'live' && this._LoopActive)
				{
					setTimeout(function ()
					{
						if (this._Mode === 'live' && this._LoopActive)
						{
							this._fetchOnce();
						}
					}.bind(this), 5000);
				}
			}.bind(this));
	}

	_reconcile(pBody)
	{
		this._LastFetchAt = Date.now();
		// pBody shape: { From, To, Now, Past[], Present[], Future[], Buckets, Cursor, More }
		let tmpStream = this.pict.AppData.Timeline.Stream;
		tmpStream.Past    = Array.isArray(pBody.Past)    ? pBody.Past    : [];
		tmpStream.Present = Array.isArray(pBody.Present) ? pBody.Present : [];
		tmpStream.Future  = Array.isArray(pBody.Future)  ? pBody.Future  : [];
		tmpStream.Buckets = Array.isArray(pBody.Buckets) ? pBody.Buckets : null;
		tmpStream.Cursor  = pBody.Cursor || '';
		tmpStream.More    = !!pBody.More;
		tmpStream.Now     = pBody.Now || new Date().toISOString();
		tmpStream.FetchedAt = new Date().toISOString();

		// In live mode, the server's resolved From/To may have shifted
		// — store the resolved values so the renderer's X-axis math is
		// correct.
		if (pBody.From) { this.pict.AppData.Timeline.Window.FromIso = pBody.From; }
		if (pBody.To)   { this.pict.AppData.Timeline.Window.ToIso   = pBody.To; }

		// Empty-state slot for the template (single-element-array trick).
		let tmpAnyContent =
			tmpStream.Past.length > 0
			|| tmpStream.Present.length > 0
			|| tmpStream.Future.length > 0
			|| (tmpStream.Buckets && tmpStream.Buckets.length > 0);
		this.pict.AppData.Timeline.EmptySlot = tmpAnyContent ? [] : [{}];

		// Capability + Beacon row index (computed here, not in the
		// view's render — keeps the view's onAfterRender simpler and
		// the data shape testable).
		this._indexCapabilityRows();
		this._indexBeaconRows();

		this.pict.AppData.Timeline.Status = 'idle';
		this._notify();
	}

	_handleStaleCursor(pBody)
	{
		// Cursor aged out of the ring buffer. Drop the cursor and
		// re-fetch with an empty cursor so the response carries the
		// freshest available state. Toast the user.
		this.pict.AppData.Timeline.Stream.Cursor = '';
		let tmpReason = (pBody && pBody.Hint) || 'history-too-old';
		try
		{
			let tmpModal = this.pict.views['Pict-Section-Modal']
				|| this.pict.views['Modal'];
			if (tmpModal && typeof tmpModal.toast === 'function')
			{
				tmpModal.toast('Timeline cursor scrolled past the buffer; re-snapping to current state.',
					{ type: 'info', duration: 4000 });
			}
		}
		catch (pErr) { /* best effort */ }
		this.pict.log.info('Timeline-Stream: cursor stale (' + tmpReason + '); refetching');
		// Immediate retry without cursor.
		this._fetchOnce();
	}

	_indexCapabilityRows()
	{
		// Build the unique sorted list of capabilities seen in the
		// current window. The renderer uses this to lay out the middle
		// band's swimlanes.
		let tmpSet = new Set();
		let tmpStream = this.pict.AppData.Timeline.Stream;
		let tmpAdd = function (pRecords)
		{
			for (let i = 0; i < pRecords.length; i++)
			{
				let tmpC = pRecords[i] && pRecords[i].Capability;
				if (tmpC) { tmpSet.add(tmpC); }
			}
		};
		tmpAdd(tmpStream.Past);
		tmpAdd(tmpStream.Present);
		tmpAdd(tmpStream.Future);
		let tmpArr = Array.from(tmpSet).sort();
		this.pict.AppData.Timeline.CapabilityRows = tmpArr.map(function (pC)
		{
			return { Capability: pC };
		});
	}

	_indexBeaconRows()
	{
		// Build the unique sorted list of beacon IDs seen handling work
		// in the current window.
		let tmpSet = new Set();
		let tmpStream = this.pict.AppData.Timeline.Stream;
		let tmpAdd = function (pRecords)
		{
			for (let i = 0; i < pRecords.length; i++)
			{
				let tmpB = pRecords[i] && pRecords[i].BeaconID;
				if (tmpB) { tmpSet.add(tmpB); }
			}
		};
		tmpAdd(tmpStream.Past);
		tmpAdd(tmpStream.Present);
		let tmpArr = Array.from(tmpSet).sort();
		this.pict.AppData.Timeline.BeaconRows = tmpArr.map(function (pB)
		{
			// Strip the long suffix for display, keep BeaconID intact
			// for click-to-focus identity.
			let tmpShort = pB.length > 18 ? pB.slice(0, 18) + '…' : pB;
			return { BeaconID: pB, Display: tmpShort };
		});
	}

	_notify()
	{
		// View calls back into provider for `setView`, but the
		// provider doesn't directly call render() — it dispatches a
		// custom event that views listen for via onAfterRender state
		// observation, OR (simpler) the view's onAfterRender installs
		// a setInterval to read AppData. We pick the latter pattern
		// (per Pict idioms in BeaconList): the provider just updates
		// AppData; the view re-reads AppData on its own ticker.
		//
		// Held here as a hook in case we want to drive imperative
		// canvas redraws explicitly later. For now, no-op.
		if (this._View && typeof this._View.onTimelineUpdated === 'function')
		{
			try { this._View.onTimelineUpdated(); }
			catch (pErr) { this.pict.log.warn('Timeline-Stream: view notify threw: ' + pErr.message); }
		}
	}
}

module.exports = TimelineStreamProvider;
module.exports.default_configuration = _ProviderConfiguration;
