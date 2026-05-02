/**
 * PictView-Ultravisor-CapabilityHeatMap
 *
 * Phase 7 / capability heat map — answers "where is the queue piling up?"
 * Y axis = capability rows, X axis = time, cell intensity = active workers
 * in that bucket / capacity. Reuses the bucketed `/Timeline` endpoint and
 * the Pict + Canvas pattern from the spine.
 *
 * Standalone view at `/Capabilities`. URL state shares the spine's
 * `?from=&to=` contract via `views/timeline/url-state.js`.
 */

const libPictView = require('pict-view');
const libRenderHeatMap = require('./timeline/render-heatmap.js');
const libURLState = require('./timeline/url-state.js');

const _ViewConfiguration =
{
	ViewIdentifier: 'Ultravisor-CapabilityHeatMap',

	DefaultRenderable: 'Ultravisor-CapabilityHeatMap-Content',
	DefaultDestinationAddress: '#Ultravisor-Content-Container',

	AutoRender: false,

	CSS: /*css*/`
		.uv-heatmap {
			padding: 1.5em;
			max-width: 1800px;
			margin: 0 auto;
		}
		.uv-heatmap-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1em;
			padding-bottom: 0.75em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.uv-heatmap-header h1 {
			margin: 0;
			font-size: 1.6em;
			font-weight: 300;
			color: var(--uv-text);
		}
		.uv-heatmap-windows {
			display: flex;
			align-items: center;
			gap: 0.4em;
			font-size: 0.85em;
		}
		.uv-heatmap-windows button {
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			color: var(--uv-text-secondary);
			padding: 0.3em 0.7em;
			border-radius: 4px;
			cursor: pointer;
			font-size: 0.85em;
		}
		.uv-heatmap-windows button:hover {
			border-color: var(--uv-brand);
			color: var(--uv-text);
		}
		.uv-heatmap-windows button.active {
			background: var(--uv-brand);
			border-color: var(--uv-brand);
			color: var(--uv-text-on-brand, #fff);
		}
		.uv-heatmap-canvas-wrap {
			width: 100%;
			height: 540px;
			background: var(--uv-bg-base);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 6px;
			position: relative;
		}
		.uv-heatmap-canvas {
			position: absolute;
			top: 0; left: 0;
			width: 100%;
			height: 100%;
		}
		.uv-heatmap-windowinfo {
			margin-top: 0.5em;
			font-size: 0.78em;
			color: var(--uv-text-secondary);
			font-family: monospace;
			text-align: right;
		}
		.uv-heatmap-help {
			margin-top: 1em;
			padding: 0.75em 1em;
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 4px;
			font-size: 0.78em;
			color: var(--uv-text-secondary);
			line-height: 1.55;
		}
		.uv-heatmap-loading {
			text-align: center;
			padding: 1em;
			color: var(--uv-text-tertiary);
			font-size: 0.85em;
		}
	`,

	Templates:
	[
		{
			Hash: 'Ultravisor-CapabilityHeatMap-Template',
			Template: /*html*/`
<div class="uv-heatmap">
	<div class="uv-heatmap-header">
		<h1>Capability Heat Map</h1>
		<div class="uv-heatmap-windows">
			{~TS:Ultravisor-HeatMap-WindowButton-Template:AppData.HeatMap.WindowButtons~}
		</div>
	</div>
	<div class="uv-heatmap-canvas-wrap">
		<canvas class="uv-heatmap-canvas" id="Ultravisor-HeatMap-Canvas"></canvas>
	</div>
	<div class="uv-heatmap-windowinfo">{~D:AppData.HeatMap.Window.FromIso~} → {~D:AppData.HeatMap.Window.ToIso~} · {~D:AppData.HeatMap.BucketCount~} buckets · {~D:AppData.HeatMap.CapabilityCount~} rows</div>
	<div class="uv-heatmap-help">
		Each row is a capability; each cell is one bucket. Cell color blends from <strong>cool</strong> (idle) through <strong>amber</strong> (saturated) to <strong>red</strong> (oversubscribed). Capacity = sum of <code>MaxConcurrent</code> across alive beacons advertising the capability. Switch windows above; live mode polls every 3s.
	</div>
</div>
`
		},
		{
			Hash: 'Ultravisor-HeatMap-WindowButton-Template',
			Template: /*html*/`
<button class="{~D:Record.ActiveClass~}" onclick="{~P~}.views['Ultravisor-CapabilityHeatMap'].selectWindow('{~D:Record.Key~}')">{~D:Record.Label~}</button>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: 'Ultravisor-CapabilityHeatMap-Content',
			TemplateHash:   'Ultravisor-CapabilityHeatMap-Template',
			DestinationAddress: '#Ultravisor-Content-Container',
			RenderMethod:   'replace'
		}
	]
};

const WINDOW_PRESETS =
[
	{ Key: '5m',  Label: '5m',  FromIso: 'now-5m',  ToIso: 'now',    PollMs: 3000 },
	{ Key: '15m', Label: '15m', FromIso: 'now-15m', ToIso: 'now',    PollMs: 5000 },
	{ Key: '1h',  Label: '1h',  FromIso: 'now-1h',  ToIso: 'now',    PollMs: 10000 },
	{ Key: '6h',  Label: '6h',  FromIso: 'now-6h',  ToIso: 'now',    PollMs: 30000 },
	{ Key: '24h', Label: '24h', FromIso: 'now-24h', ToIso: 'now',    PollMs: 60000 }
];

class UltravisorCapabilityHeatMapView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this._PollHandle = null;
		this._FetchInFlight = null;
		this._RedrawScheduled = false;
		this._ResizeListener = null;
		this._CurrentWindowKey = '15m';
	}

	onBeforeRender(pRenderable, pAddress, pRecord)
	{
		this.pict.AppData.HeatMap = this.pict.AppData.HeatMap || {};
		// Default to URL state if present, else 15m preset.
		let tmpURLState = libURLState.read();
		let tmpPreset = WINDOW_PRESETS[1]; // 15m
		// If the URL has explicit From/To different from any preset key
		// in `bucket` query, treat it as a custom range — use 15m polling.
		// (We don't change the preset list to honor arbitrary windows;
		// that's the spine view's job.)
		this._CurrentWindowKey = (tmpURLState && tmpURLState.HeatMapWindow) || '15m';
		for (let i = 0; i < WINDOW_PRESETS.length; i++)
		{
			if (WINDOW_PRESETS[i].Key === this._CurrentWindowKey) { tmpPreset = WINDOW_PRESETS[i]; break; }
		}
		this.pict.AppData.HeatMap.Window =
		{
			FromIso: tmpPreset.FromIso,
			ToIso:   tmpPreset.ToIso,
			Bucket:  'auto',
			PollMs:  tmpPreset.PollMs
		};
		this.pict.AppData.HeatMap.Buckets = this.pict.AppData.HeatMap.Buckets || [];
		this.pict.AppData.HeatMap.Capabilities = this.pict.AppData.HeatMap.Capabilities || [];
		this.pict.AppData.HeatMap.Capacities = this.pict.AppData.HeatMap.Capacities || {};
		this.pict.AppData.HeatMap.BucketCount = (this.pict.AppData.HeatMap.Buckets || []).length;
		this.pict.AppData.HeatMap.CapabilityCount = (this.pict.AppData.HeatMap.Capabilities || []).length;
		this.pict.AppData.HeatMap.WindowButtons = WINDOW_PRESETS.map(function (pP, pIx)
		{
			return {
				Key:         pP.Key,
				Label:       pP.Label,
				ActiveClass: (pP.Key === (this._CurrentWindowKey || '15m')) ? 'active' : ''
			};
		}.bind(this));
		// Don't _stopPoll() here — see Throughput's notes; Pict renders
		// the view several times during mount, and aborting the prior
		// onAfterRender's in-flight fetch every time stalls the loop.
		return super.onBeforeRender(pRenderable, pAddress, pRecord);
	}

	onAfterRender(pRenderable, pAddress, pRecord, pContent)
	{
		this.pict.CSSMap.injectCSS();
		this._installResizeListener();
		this._fetchOnce();
		this._scheduleNextPoll();
		this._scheduleRedraw();
		return super.onAfterRender(pRenderable, pAddress, pRecord, pContent);
	}

	selectWindow(pKey)
	{
		this._CurrentWindowKey = pKey || '15m';
		// re-render via lifecycle (sets new window + restarts poll)
		this.render();
	}

	// ====================================================================
	// Fetch
	// ====================================================================

	_fetchOnce()
	{
		this._abortInFlight();
		let tmpAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
		this._FetchInFlight = tmpAbort;
		let tmpBase = (this.pict.AppData.Ultravisor && this.pict.AppData.Ultravisor.APIBaseURL) || '';
		let tmpW = this.pict.AppData.HeatMap.Window;
		let tmpURL = tmpBase
			+ '/Timeline?from=' + encodeURIComponent(tmpW.FromIso)
			+ '&to=' + encodeURIComponent(tmpW.ToIso)
			+ '&bucket=auto&futureLimit=0&waitMs=0';
		let tmpSelf = this;

		// Capacities come from /Beacon which gives MaxConcurrent + Status.
		// We fetch in parallel and combine.
		let tmpFetchTimeline = fetch(tmpURL, { signal: tmpAbort ? tmpAbort.signal : undefined })
			.then(function (pResp) { return pResp.ok ? pResp.json() : null; });
		let tmpFetchBeacons = fetch(tmpBase + '/Beacon', { signal: tmpAbort ? tmpAbort.signal : undefined })
			.then(function (pResp) { return pResp.ok ? pResp.json() : null; });

		Promise.all([tmpFetchTimeline, tmpFetchBeacons])
			.then(function (pAll)
			{
				if (tmpSelf._FetchInFlight !== tmpAbort) return; // a newer fetch took over
				tmpSelf._reconcile(pAll[0], pAll[1]);
				tmpSelf._FetchInFlight = null;
			})
			.catch(function (pErr)
			{
				if (pErr && pErr.name === 'AbortError') return;
				if (tmpSelf._FetchInFlight !== tmpAbort) return;
				tmpSelf.pict.log.warn('HeatMap fetch failed: ' + pErr.message);
				tmpSelf._FetchInFlight = null;
			});
	}

	_reconcile(pTimelineBody, pBeaconsBody)
	{
		let tmpBuckets = (pTimelineBody && Array.isArray(pTimelineBody.Buckets))
			? pTimelineBody.Buckets : [];
		this.pict.AppData.HeatMap.Buckets = tmpBuckets;

		// Capabilities: union across all buckets' ByCapability keys, sorted.
		let tmpCapSet = new Set();
		for (let i = 0; i < tmpBuckets.length; i++)
		{
			let tmpByCap = tmpBuckets[i].ByCapability || {};
			for (let tmpK in tmpByCap)
			{
				if (Object.prototype.hasOwnProperty.call(tmpByCap, tmpK)) { tmpCapSet.add(tmpK); }
			}
		}
		let tmpCaps = Array.from(tmpCapSet).sort();
		this.pict.AppData.HeatMap.Capabilities = tmpCaps;

		// Capacities: sum MaxConcurrent across alive beacons advertising
		// the capability. "Alive" = Status === 'Online'.
		let tmpCapacities = {};
		let tmpBeacons = Array.isArray(pBeaconsBody) ? pBeaconsBody : [];
		for (let i = 0; i < tmpBeacons.length; i++)
		{
			let tmpB = tmpBeacons[i];
			if (!tmpB) continue;
			let tmpAlive = tmpB.Status === 'Online' || tmpB.Liveness === 'Alive';
			if (!tmpAlive) continue;
			let tmpMC = Number.isFinite(tmpB.MaxConcurrent) ? tmpB.MaxConcurrent : 1;
			let tmpBCap = Array.isArray(tmpB.Capabilities) ? tmpB.Capabilities : [];
			for (let j = 0; j < tmpBCap.length; j++)
			{
				let tmpC = tmpBCap[j];
				if (!tmpCapacities[tmpC]) { tmpCapacities[tmpC] = { Capacity: 0, ActiveMax: 0 }; }
				tmpCapacities[tmpC].Capacity += tmpMC;
			}
		}
		this.pict.AppData.HeatMap.Capacities = tmpCapacities;
		this.pict.AppData.HeatMap.BucketCount = tmpBuckets.length;
		this.pict.AppData.HeatMap.CapabilityCount = tmpCaps.length;

		// Mirror the resolved server window so the chrome shows what we
		// actually fetched (in live mode the server resolves now-Xm vs.
		// our clock).
		if (pTimelineBody && pTimelineBody.From) { this.pict.AppData.HeatMap.Window.FromIso = pTimelineBody.From; }
		if (pTimelineBody && pTimelineBody.To)   { this.pict.AppData.HeatMap.Window.ToIso   = pTimelineBody.To; }
		this._updateWindowInfo();
		this._scheduleRedraw();
	}

	_updateWindowInfo()
	{
		// Update only the windowinfo span and bucketcount/capabilitycount
		// without a full re-render (which would tear down the canvas).
		let tmpHTML = this.pict.AppData.HeatMap.Window.FromIso + ' → ' + this.pict.AppData.HeatMap.Window.ToIso
			+ ' · ' + this.pict.AppData.HeatMap.BucketCount + ' buckets · '
			+ this.pict.AppData.HeatMap.CapabilityCount + ' rows';
		try
		{
			let tmpEl = this.pict.ContentAssignment.getElement('.uv-heatmap-windowinfo');
			if (tmpEl)
			{
				let tmpNode = tmpEl[0] || tmpEl;
				if (tmpNode) { tmpNode.textContent = tmpHTML; }
			}
		}
		catch (pErr) { /* best effort */ }
	}

	// ====================================================================
	// Polling
	// ====================================================================

	_scheduleNextPoll()
	{
		// Clear only the timer; not the in-flight fetch — see Throughput
		// for the abort-cascade bug this avoids.
		if (this._PollHandle) { clearTimeout(this._PollHandle); this._PollHandle = null; }
		let tmpPollMs = (this.pict.AppData.HeatMap.Window && this.pict.AppData.HeatMap.Window.PollMs) || 5000;
		this._PollHandle = setTimeout(function ()
		{
			this._PollHandle = null;
			this._fetchOnce();
			this._scheduleNextPoll();
		}.bind(this), tmpPollMs);
	}

	_stopPoll()
	{
		if (this._PollHandle) { clearTimeout(this._PollHandle); this._PollHandle = null; }
		this._abortInFlight();
	}

	_abortInFlight()
	{
		if (this._FetchInFlight)
		{
			try { this._FetchInFlight.abort(); }
			catch (pErr) { /* ignore */ }
			this._FetchInFlight = null;
		}
	}

	// ====================================================================
	// Render
	// ====================================================================

	_installResizeListener()
	{
		if (this._ResizeListener) return;
		let fResize = function () { this._scheduleRedraw(); }.bind(this);
		window.addEventListener('resize', fResize);
		this._ResizeListener = fResize;
	}

	_scheduleRedraw()
	{
		if (this._RedrawScheduled) return;
		this._RedrawScheduled = true;
		let tmpFn = function ()
		{
			this._RedrawScheduled = false;
			this._draw();
		}.bind(this);
		if (typeof window !== 'undefined' && window.requestAnimationFrame)
		{
			window.requestAnimationFrame(tmpFn);
		}
		else
		{
			setTimeout(tmpFn, 16);
		}
	}

	_draw()
	{
		let tmpCanvas = _resolveCanvas(this.pict, '#Ultravisor-HeatMap-Canvas');
		if (!tmpCanvas)
		{
			// View was replaced (user navigated elsewhere) — stop the
			// poll loop so we don't leak fetches.
			this._stopPoll();
			return;
		}
		try
		{
			libRenderHeatMap.drawHeatMap(tmpCanvas,
			{
				Window:       this.pict.AppData.HeatMap.Window,
				Buckets:      this.pict.AppData.HeatMap.Buckets,
				Capabilities: this.pict.AppData.HeatMap.Capabilities,
				Capacities:   this.pict.AppData.HeatMap.Capacities
			});
		}
		catch (pErr)
		{
			this.pict.log.warn('HeatMap draw failed: ' + pErr.message);
		}
	}
}

function _resolveCanvas(pPict, pSelector)
{
	let tmpEl = pPict.ContentAssignment.getElement(pSelector);
	if (!tmpEl) return null;
	if (Array.isArray(tmpEl) && tmpEl.length === 0) return null;
	let tmpNode = tmpEl[0] || tmpEl;
	if (!tmpNode || typeof tmpNode.getContext !== 'function') return null;
	return tmpNode;
}

module.exports = UltravisorCapabilityHeatMapView;
module.exports.default_configuration = _ViewConfiguration;
