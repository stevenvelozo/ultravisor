/**
 * PictView-Ultravisor-Throughput
 *
 * Phase 7 / throughput chart — answers "are we keeping up with demand?"
 * Stacked-area chart of completions per bucket by terminal status.
 * Vertical bands mark windows where Admission.Denied events fired.
 *
 * Standalone view at `/Throughput`. Same window-preset pattern as the
 * heat map; same `/Timeline?bucket=auto` data source.
 */

const libPictView = require('pict-view');
const libRenderThroughput = require('./timeline/render-throughput.js');

const _ViewConfiguration =
{
	ViewIdentifier: 'Ultravisor-Throughput',

	DefaultRenderable: 'Ultravisor-Throughput-Content',
	DefaultDestinationAddress: '#Ultravisor-Content-Container',

	AutoRender: false,

	CSS: /*css*/`
		.uv-throughput {
			padding: 1.5em;
			max-width: 1800px;
			margin: 0 auto;
		}
		.uv-throughput-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1em;
			padding-bottom: 0.75em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.uv-throughput-header h1 {
			margin: 0;
			font-size: 1.6em;
			font-weight: 300;
			color: var(--uv-text);
		}
		.uv-throughput-windows {
			display: flex;
			align-items: center;
			gap: 0.4em;
		}
		.uv-throughput-windows button {
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			color: var(--uv-text-secondary);
			padding: 0.3em 0.7em;
			border-radius: 4px;
			cursor: pointer;
			font-size: 0.85em;
		}
		.uv-throughput-windows button:hover { border-color: var(--uv-brand); color: var(--uv-text); }
		.uv-throughput-windows button.active {
			background: var(--uv-brand);
			border-color: var(--uv-brand);
			color: var(--uv-text-on-brand, #fff);
		}
		.uv-throughput-canvas-wrap {
			width: 100%;
			height: 460px;
			background: var(--uv-bg-base);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 6px;
			position: relative;
		}
		.uv-throughput-canvas {
			position: absolute;
			top: 0; left: 0;
			width: 100%;
			height: 100%;
		}
		.uv-throughput-stats {
			display: flex;
			gap: 1.25em;
			margin-top: 0.6em;
			font-size: 0.78em;
			color: var(--uv-text-secondary);
			font-family: monospace;
		}
		.uv-throughput-stats strong { color: var(--uv-text); font-weight: 600; }
		.uv-throughput-help {
			margin-top: 1em;
			padding: 0.75em 1em;
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 4px;
			font-size: 0.78em;
			color: var(--uv-text-secondary);
			line-height: 1.55;
		}
	`,

	Templates:
	[
		{
			Hash: 'Ultravisor-Throughput-Template',
			Template: /*html*/`
<div class="uv-throughput">
	<div class="uv-throughput-header">
		<h1>Throughput</h1>
		<div class="uv-throughput-windows">
			{~TS:Ultravisor-Throughput-WindowButton-Template:AppData.Throughput.WindowButtons~}
		</div>
	</div>
	<div class="uv-throughput-canvas-wrap">
		<canvas class="uv-throughput-canvas" id="Ultravisor-Throughput-Canvas"></canvas>
	</div>
	<div class="uv-throughput-stats" id="Ultravisor-Throughput-Stats">
		<span>completions: <strong>{~D:AppData.Throughput.Stats.Complete~}</strong></span>
		<span>failed: <strong>{~D:AppData.Throughput.Stats.Failed~}</strong></span>
		<span>stalled: <strong>{~D:AppData.Throughput.Stats.Stalled~}</strong></span>
		<span>canceled: <strong>{~D:AppData.Throughput.Stats.Canceled~}</strong></span>
		<span>denials: <strong>{~D:AppData.Throughput.Stats.Denied~}</strong></span>
	</div>
	<div class="uv-throughput-help">
		Stacked area is operations finishing per bucket; the vertical red strips mark buckets where <code>Admission.Denied</code> fired (queue too deep). The amber dashed line is the <em>now</em> marker.
	</div>
</div>
`
		},
		{
			Hash: 'Ultravisor-Throughput-WindowButton-Template',
			Template: /*html*/`
<button class="{~D:Record.ActiveClass~}" onclick="{~P~}.views['Ultravisor-Throughput'].selectWindow('{~D:Record.Key~}')">{~D:Record.Label~}</button>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: 'Ultravisor-Throughput-Content',
			TemplateHash:   'Ultravisor-Throughput-Template',
			DestinationAddress: '#Ultravisor-Content-Container',
			RenderMethod:   'replace'
		}
	]
};

const WINDOW_PRESETS =
[
	{ Key: '5m',  Label: '5m',  FromIso: 'now-5m',  ToIso: 'now', PollMs: 3000 },
	{ Key: '15m', Label: '15m', FromIso: 'now-15m', ToIso: 'now', PollMs: 5000 },
	{ Key: '1h',  Label: '1h',  FromIso: 'now-1h',  ToIso: 'now', PollMs: 10000 },
	{ Key: '6h',  Label: '6h',  FromIso: 'now-6h',  ToIso: 'now', PollMs: 30000 },
	{ Key: '24h', Label: '24h', FromIso: 'now-24h', ToIso: 'now', PollMs: 60000 }
];

class UltravisorThroughputView extends libPictView
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
		this.pict.AppData.Throughput = this.pict.AppData.Throughput || {};
		let tmpKey = this._CurrentWindowKey || '15m';
		let tmpPreset = WINDOW_PRESETS[1];
		for (let i = 0; i < WINDOW_PRESETS.length; i++)
		{
			if (WINDOW_PRESETS[i].Key === tmpKey) { tmpPreset = WINDOW_PRESETS[i]; break; }
		}
		this.pict.AppData.Throughput.Window =
		{
			FromIso: tmpPreset.FromIso,
			ToIso:   tmpPreset.ToIso,
			PollMs:  tmpPreset.PollMs
		};
		this.pict.AppData.Throughput.Buckets = this.pict.AppData.Throughput.Buckets || [];
		this.pict.AppData.Throughput.Now     = this.pict.AppData.Throughput.Now || null;
		this.pict.AppData.Throughput.Stats   = this.pict.AppData.Throughput.Stats || {
			Complete: 0, Failed: 0, Stalled: 0, Canceled: 0, Denied: 0
		};
		this.pict.AppData.Throughput.WindowButtons = WINDOW_PRESETS.map(function (pP)
		{
			return {
				Key:         pP.Key,
				Label:       pP.Label,
				ActiveClass: (pP.Key === tmpKey) ? 'active' : ''
			};
		});
		// Don't _stopPoll() here — Pict re-renders the view several times
		// during initial mount, and aborting in onBeforeRender cascades
		// every onAfterRender fetch. _fetchOnce already aborts its own
		// prior in-flight controller, so per-render de-duping happens
		// without the cross-render churn.
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
		this.render();
	}

	_fetchOnce()
	{
		this._abortInFlight();
		let tmpAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
		this._FetchInFlight = tmpAbort;
		let tmpBase = (this.pict.AppData.Ultravisor && this.pict.AppData.Ultravisor.APIBaseURL) || '';
		let tmpW = this.pict.AppData.Throughput.Window;
		let tmpURL = tmpBase
			+ '/Timeline?from=' + encodeURIComponent(tmpW.FromIso)
			+ '&to=' + encodeURIComponent(tmpW.ToIso)
			+ '&bucket=auto&futureLimit=0&waitMs=0';
		let tmpSelf = this;
		fetch(tmpURL, { signal: tmpAbort ? tmpAbort.signal : undefined })
			.then(function (pResp) { return pResp.ok ? pResp.json() : null; })
			.then(function (pBody)
			{
				if (tmpSelf._FetchInFlight !== tmpAbort) return;
				if (pBody) { tmpSelf._reconcile(pBody); }
				tmpSelf._FetchInFlight = null;
			})
			.catch(function (pErr)
			{
				if (pErr && pErr.name === 'AbortError') return;
				if (tmpSelf._FetchInFlight !== tmpAbort) return;
				tmpSelf.pict.log.warn('Throughput fetch failed: ' + pErr.message);
				tmpSelf._FetchInFlight = null;
			});
	}

	_reconcile(pBody)
	{
		let tmpBuckets = Array.isArray(pBody.Buckets) ? pBody.Buckets : [];
		this.pict.AppData.Throughput.Buckets = tmpBuckets;
		this.pict.AppData.Throughput.Now = pBody.Now || null;
		if (pBody.From) { this.pict.AppData.Throughput.Window.FromIso = pBody.From; }
		if (pBody.To)   { this.pict.AppData.Throughput.Window.ToIso   = pBody.To; }
		// Aggregate stats.
		let tmpStats = { Complete: 0, Failed: 0, Stalled: 0, Canceled: 0, Denied: 0 };
		for (let i = 0; i < tmpBuckets.length; i++)
		{
			let tmpT = tmpBuckets[i].ByEventType || {};
			let tmpS = tmpBuckets[i].ByStatus || {};
			tmpStats.Complete += (tmpT.Completed || 0) + (tmpT['Execution.ExecutionComplete'] || 0) + (tmpS.Complete || 0);
			tmpStats.Failed   += (tmpT.Failed     || 0) + (tmpS.Failed   || 0);
			tmpStats.Stalled  += (tmpT.Stalled    || 0) + (tmpT['Workitem.Stranded'] || 0) + (tmpS.Stalled || 0);
			tmpStats.Canceled += (tmpT.Canceled   || 0) + (tmpS.Canceled || 0) + (tmpS.Abandoned || 0);
			tmpStats.Denied   += (tmpT['Admission.Denied'] || 0) + (tmpT['admission.denied'] || 0);
		}
		this.pict.AppData.Throughput.Stats = tmpStats;
		this._updateStatsLine();
		this._scheduleRedraw();
	}

	_updateStatsLine()
	{
		let tmpS = this.pict.AppData.Throughput.Stats || {};
		let tmpHTML = '<span>completions: <strong>' + (tmpS.Complete || 0) + '</strong></span>'
			+ '<span>failed: <strong>' + (tmpS.Failed || 0) + '</strong></span>'
			+ '<span>stalled: <strong>' + (tmpS.Stalled || 0) + '</strong></span>'
			+ '<span>canceled: <strong>' + (tmpS.Canceled || 0) + '</strong></span>'
			+ '<span>denials: <strong>' + (tmpS.Denied || 0) + '</strong></span>';
		try { this.pict.ContentAssignment.assignContent('#Ultravisor-Throughput-Stats', tmpHTML); }
		catch (pErr) { /* best effort */ }
	}

	_scheduleNextPoll()
	{
		// Clear only the timer; do NOT abort the in-flight fetch (the
		// caller may have just kicked one off and is calling us to queue
		// the *next* fetch — aborting here would kill that fetch).
		if (this._PollHandle) { clearTimeout(this._PollHandle); this._PollHandle = null; }
		let tmpPollMs = (this.pict.AppData.Throughput.Window && this.pict.AppData.Throughput.Window.PollMs) || 5000;
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
		if (typeof window !== 'undefined' && window.requestAnimationFrame) { window.requestAnimationFrame(tmpFn); }
		else { setTimeout(tmpFn, 16); }
	}

	_draw()
	{
		let tmpCanvas = _resolveCanvas(this.pict, '#Ultravisor-Throughput-Canvas');
		if (!tmpCanvas)
		{
			this._stopPoll();
			return;
		}
		try
		{
			libRenderThroughput.drawThroughput(tmpCanvas,
			{
				Window:  this.pict.AppData.Throughput.Window,
				Buckets: this.pict.AppData.Throughput.Buckets,
				Now:     this.pict.AppData.Throughput.Now
			});
		}
		catch (pErr)
		{
			this.pict.log.warn('Throughput draw failed: ' + pErr.message);
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

module.exports = UltravisorThroughputView;
module.exports.default_configuration = _ViewConfiguration;
