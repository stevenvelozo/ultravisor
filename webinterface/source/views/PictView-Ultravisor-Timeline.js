/**
 * PictView-Ultravisor-Timeline
 *
 * Phase 6 / Spine view — three-band timeline of past + present + future
 * events. Templates own the chrome (title, mode toggle, scrub bar,
 * drawer). Canvas + SVG own the bulk render via render-bands.js.
 *
 * Per modules/pict/CLAUDE.md:
 *   - CSS in this config's CSS property
 *   - Templates declared, iteration via {~TS:~}, conditionals via
 *     single-element-array trick driving {~TS:~}
 *   - State in pict.AppData.Timeline.* (provider owns writes)
 *   - No HTML in AppData; no _buildXxxxHTML helpers
 *   - DOM access via pict.ContentAssignment
 *   - Lifecycle hooks only — never overrides render()
 *   - Modal toast for stale-cursor recovery (handled in the provider)
 */

const libPictView = require('pict-view');
const libRenderBands = require('./timeline/render-bands.js');
const libRenderWaterfall = require('./timeline/render-waterfall.js');
const libRenderAnomalyRibbon = require('./timeline/render-anomaly-ribbon.js');
const libURLState = require('./timeline/url-state.js');

const _ViewConfiguration =
{
	ViewIdentifier: 'Ultravisor-Timeline',

	DefaultRenderable: 'Ultravisor-Timeline-Content',
	DefaultDestinationAddress: '#Ultravisor-Content-Container',

	AutoRender: false,

	CSS: /*css*/`
		.uv-timeline {
			padding: 1.5em;
			max-width: 1800px;
			margin: 0 auto;
		}
		.uv-timeline-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1em;
			padding-bottom: 0.75em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.uv-timeline-header h1 {
			margin: 0;
			font-size: 1.6em;
			font-weight: 300;
			color: var(--uv-text);
		}
		.uv-timeline-header-actions {
			display: flex;
			align-items: center;
			gap: 0.75em;
		}
		.uv-timeline-mode-indicator {
			display: inline-flex;
			align-items: center;
			gap: 0.4em;
			font-size: 0.8em;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			font-weight: 600;
			padding: 0.25em 0.7em;
			border-radius: 4px;
		}
		.uv-timeline-mode-indicator.live {
			color: var(--uv-success);
			background: rgba(16, 185, 129, 0.10);
		}
		.uv-timeline-mode-indicator.replay {
			color: var(--uv-text-secondary);
			background: var(--uv-bg-surface);
		}
		.uv-timeline-mode-indicator .uv-timeline-pulse {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: var(--uv-success);
			animation: uv-timeline-pulse 1.6s ease-in-out infinite;
		}
		@keyframes uv-timeline-pulse {
			0%, 100% { opacity: 1; transform: scale(1); }
			50% { opacity: 0.45; transform: scale(0.85); }
		}
		.uv-timeline-button {
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			color: var(--uv-text);
			padding: 0.4em 1em;
			font-size: 0.85em;
			border-radius: 4px;
			cursor: pointer;
		}
		.uv-timeline-button:hover {
			border-color: var(--uv-brand);
		}
		.uv-timeline-button.primary {
			background: var(--uv-brand);
			color: var(--uv-text-on-brand, #fff);
			border-color: var(--uv-brand);
		}
		.uv-timeline-windowinfo {
			font-size: 0.8em;
			color: var(--uv-text-secondary);
			font-family: monospace;
		}
		.uv-timeline-canvas-wrap {
			position: relative;
			width: 100%;
			height: 540px;
			background: var(--uv-bg-base);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 6px;
			overflow: hidden;
		}
		.uv-timeline-canvas {
			position: absolute;
			top: 0; left: 0;
			width: 100%;
			height: 100%;
			cursor: crosshair;
		}
		.uv-timeline-svg-overlay {
			position: absolute;
			top: 0; left: 0;
			width: 100%;
			height: 100%;
			pointer-events: none;
		}
		.uv-timeline-empty {
			position: absolute;
			top: 50%; left: 50%;
			transform: translate(-50%, -50%);
			color: var(--uv-text-tertiary);
			font-size: 0.95em;
			text-align: center;
		}
		.uv-timeline-scrubber {
			margin-top: 0.75em;
			height: 28px;
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 4px;
			cursor: pointer;
			position: relative;
		}
		.uv-timeline-scrubber-track {
			position: absolute;
			top: 50%; left: 0; right: 0;
			height: 2px;
			background: var(--uv-border-subtle);
			transform: translateY(-50%);
		}
		.uv-timeline-scrubber-window {
			position: absolute;
			top: 0; bottom: 0;
			background: rgba(245, 158, 11, 0.18);
			border-left: 1px solid var(--uv-warning);
			border-right: 1px solid var(--uv-warning);
		}
		.uv-timeline-drawer {
			margin-top: 1em;
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 6px;
			padding: 1em;
		}
		.uv-timeline-drawer-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 0.5em;
			padding-bottom: 0.5em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.uv-timeline-drawer-header h3 {
			margin: 0;
			font-size: 1em;
			font-weight: 600;
			color: var(--uv-text);
		}
		.uv-timeline-drawer-close {
			background: none;
			border: none;
			color: var(--uv-text-secondary);
			cursor: pointer;
			font-size: 1.2em;
			padding: 0 0.4em;
		}
		.uv-timeline-drawer pre {
			margin: 0;
			font-size: 0.78em;
			color: var(--uv-text);
			white-space: pre-wrap;
			word-break: break-all;
			max-height: 320px;
			overflow: auto;
		}
		.uv-timeline-waterfall-meta {
			display: flex;
			gap: 1.25em;
			font-size: 0.78em;
			color: var(--uv-text-secondary);
			margin-bottom: 0.5em;
		}
		.uv-timeline-waterfall-meta strong {
			color: var(--uv-text);
			font-weight: 600;
		}
		.uv-timeline-waterfall-canvas-wrap {
			width: 100%;
			background: var(--uv-bg-base);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 4px;
			overflow-x: auto;
			overflow-y: hidden;
		}
		.uv-timeline-waterfall-canvas {
			display: block;
			width: 100%;
			height: 200px;
		}
		.uv-timeline-waterfall-loading {
			padding: 1em;
			color: var(--uv-text-tertiary);
			font-size: 0.85em;
			text-align: center;
		}
		.uv-timeline-stats {
			margin-top: 0.5em;
			display: flex;
			gap: 1em;
			font-size: 0.8em;
			color: var(--uv-text-secondary);
		}
		.uv-timeline-stats span { font-family: monospace; }
		.uv-timeline-help {
			margin-top: 1em;
			padding: 0.75em 1em;
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 4px;
			font-size: 0.78em;
			color: var(--uv-text-secondary);
			line-height: 1.55;
		}
		.uv-timeline-help kbd {
			background: var(--uv-bg-base);
			border: 1px solid var(--uv-border-subtle);
			padding: 0.05em 0.4em;
			border-radius: 3px;
			font-family: monospace;
		}
		.uv-timeline-anomaly-wrap {
			margin-top: 0.5em;
			height: 14px;
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 3px;
			cursor: pointer;
			position: relative;
		}
		.uv-timeline-anomaly-canvas {
			position: absolute;
			top: 0; left: 0;
			width: 100%;
			height: 100%;
		}
		.uv-timeline-anomaly-tooltip {
			position: absolute;
			pointer-events: none;
			background: var(--uv-bg-base);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 3px;
			padding: 0.3em 0.55em;
			font-size: 0.72em;
			color: var(--uv-text);
			font-family: monospace;
			white-space: nowrap;
			z-index: 10;
			box-shadow: 0 2px 8px var(--uv-shadow);
		}
	`,

	Templates:
	[
		{
			Hash: 'Ultravisor-Timeline-Template',
			Template: /*html*/`
<div class="uv-timeline">
	<div class="uv-timeline-header">
		<h1>Timeline</h1>
		<div class="uv-timeline-header-actions">
			{~TS:Ultravisor-Timeline-LiveIndicator-Template:AppData.Timeline.LiveSlot~}
			{~TS:Ultravisor-Timeline-ReplayIndicator-Template:AppData.Timeline.ReplaySlot~}
			<span class="uv-timeline-windowinfo">{~D:AppData.Timeline.Window.FromIso~} → {~D:AppData.Timeline.Window.ToIso~}</span>
			<button class="uv-timeline-button" onclick="{~P~}.views['Ultravisor-Timeline'].onLiveClicked()">Live</button>
			<button class="uv-timeline-button" onclick="{~P~}.views['Ultravisor-Timeline'].onResetZoomClicked()">Reset</button>
		</div>
	</div>
	<div class="uv-timeline-canvas-wrap" id="Ultravisor-Timeline-CanvasWrap">
		<canvas class="uv-timeline-canvas" id="Ultravisor-Timeline-Canvas"></canvas>
		<svg class="uv-timeline-svg-overlay" id="Ultravisor-Timeline-SVG"></svg>
		{~TS:Ultravisor-Timeline-EmptyState-Template:AppData.Timeline.EmptySlot~}
	</div>
	<div class="uv-timeline-scrubber" id="Ultravisor-Timeline-Scrubber">
		<div class="uv-timeline-scrubber-track"></div>
		<div class="uv-timeline-scrubber-window" id="Ultravisor-Timeline-Scrubber-Window"></div>
	</div>
	<div class="uv-timeline-stats" id="Ultravisor-Timeline-Stats">
		<span>past: 0</span>
		<span>present: 0</span>
		<span>future: 0</span>
	</div>
	<div class="uv-timeline-anomaly-wrap" id="Ultravisor-Timeline-Anomaly-Wrap">
		<canvas class="uv-timeline-anomaly-canvas" id="Ultravisor-Timeline-Anomaly-Canvas"></canvas>
	</div>
	<div class="uv-timeline-help">
		<strong>Mouse wheel</strong> zoom in/out · <strong>Click</strong> a bar to focus · <strong>Drag the scrubber</strong> to seek · Press <kbd>Live</kbd> to follow now · <strong>Click</strong> an anomaly tick to jump
	</div>
	<div id="Ultravisor-Timeline-Drawer-Slot">
		{~TS:Ultravisor-Timeline-Drawer-Template:AppData.Timeline.FocusSlot~}
		{~TS:Ultravisor-Timeline-Waterfall-Template:AppData.Timeline.WaterfallSlot~}
	</div>
</div>
`
		},
		{
			Hash: 'Ultravisor-Timeline-LiveIndicator-Template',
			Template: /*html*/`
<span class="uv-timeline-mode-indicator live"><span class="uv-timeline-pulse"></span>Live</span>
`
		},
		{
			Hash: 'Ultravisor-Timeline-ReplayIndicator-Template',
			Template: /*html*/`
<span class="uv-timeline-mode-indicator replay">Replay</span>
`
		},
		{
			Hash: 'Ultravisor-Timeline-EmptyState-Template',
			Template: /*html*/`
<div class="uv-timeline-empty">No events in this window. Try widening with the scrubber, or wait for activity.</div>
`
		},
		{
			Hash: 'Ultravisor-Timeline-Drawer-Template',
			Template: /*html*/`
<div class="uv-timeline-drawer">
	<div class="uv-timeline-drawer-header">
		<h3>{~D:Record.Title~}</h3>
		<button class="uv-timeline-drawer-close" onclick="{~P~}.views['Ultravisor-Timeline'].onCloseFocus()" title="Close">×</button>
	</div>
	<pre>{~D:Record.JSON~}</pre>
</div>
`
		},
		{
			Hash: 'Ultravisor-Timeline-Waterfall-Template',
			Template: /*html*/`
<div class="uv-timeline-drawer">
	<div class="uv-timeline-drawer-header">
		<h3>Run waterfall · {~D:Record.RunHash~}</h3>
		<button class="uv-timeline-drawer-close" onclick="{~P~}.views['Ultravisor-Timeline'].onCloseFocus()" title="Close">×</button>
	</div>
	<div class="uv-timeline-waterfall-meta">
		<span><strong>{~D:Record.OperationName~}</strong></span>
		<span>tasks: {~D:Record.TaskCount~}</span>
		<span>events: {~D:Record.EventCount~}</span>
		<span>span: {~D:Record.SpanLabel~}</span>
		<span>{~D:Record.StatusLabel~}</span>
	</div>
	<div class="uv-timeline-waterfall-canvas-wrap">
		<canvas class="uv-timeline-waterfall-canvas" id="Ultravisor-Timeline-Waterfall-Canvas"></canvas>
	</div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: 'Ultravisor-Timeline-Content',
			TemplateHash:   'Ultravisor-Timeline-Template',
			DestinationAddress: '#Ultravisor-Content-Container',
			RenderMethod:   'replace'
		}
	]
};

class UltravisorTimelineView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this._RedrawScheduled = false;
		this._ResizeListener = null;
		this._WheelListener = null;
		this._ClickListener = null;
		this._ScrubMouseDown = null;  // { startX, startFromMs, startToMs }
		this._ScrubListenersAttached = false;

		// Waterfall fetch state — keyed by RunHash. Cached so that
		// flipping focus on/off the same run doesn't re-fetch.
		this._WaterfallByRunHash = {};
		this._WaterfallFetchInFlight = null;

		// Anomaly ribbon: fetch the bucketed anomaly summary on a slower
		// cadence than the spine (10s) since baselines move slowly.
		this._AnomalyState = { Window: { FromIso: null, ToIso: null }, Anomalies: [], HitBoxes: [] };
		this._AnomalyPollHandle = null;
		this._AnomalyFetchInFlight = null;
		this._AnomalyClickListener = null;
		this._AnomalyHoverListener = null;
		this._AnomalyTooltipNode = null;
	}

	// ====================================================================
	// Lifecycle
	// ====================================================================

	onBeforeRender(pRenderable, pRenderDestinationAddress, pRecord)
	{
		// Sync URL → AppData.Timeline.Window. The provider's startLive
		// reads from AppData.Timeline.Window.
		let tmpURLState = libURLState.read();
		this.pict.AppData.Timeline = this.pict.AppData.Timeline || {};
		let tmpW = this.pict.AppData.Timeline.Window || {};
		tmpW.FromIso = tmpURLState.FromIso;
		tmpW.ToIso   = tmpURLState.ToIso;
		tmpW.Mode    = tmpURLState.Mode;
		tmpW.Bucket  = tmpURLState.Bucket;
		this.pict.AppData.Timeline.Window = tmpW;
		this.pict.AppData.Timeline.Focus = tmpURLState.Focus;
		this._syncFocusSlot();

		// Stop any in-flight provider work — we'll restart based on
		// the new URL state in onAfterRender.
		let tmpProvider = this._provider();
		if (tmpProvider) { tmpProvider.stop(); }

		// URL deep-link to a focused run: kick the waterfall fetch so
		// the drawer fills in on first paint, not on next click.
		if (tmpURLState.Focus && tmpURLState.Focus.Kind === 'runHash')
		{
			this._ensureWaterfallData(tmpURLState.Focus.Hash);
		}

		return super.onBeforeRender(pRenderable, pRenderDestinationAddress, pRecord);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.pict.CSSMap.injectCSS();

		// Wire interaction listeners (idempotent — bound to current
		// canvas which gets recreated on each render).
		this._installCanvasListeners();
		this._installScrubberListeners();
		this._installResizeListener();
		this._installKeyboardListener();

		// Kick the provider per current Window.Mode.
		let tmpProvider = this._provider();
		if (tmpProvider)
		{
			tmpProvider.setView(this);
			let tmpMode = (this.pict.AppData.Timeline.Window && this.pict.AppData.Timeline.Window.Mode) || 'live';
			if (tmpMode === 'replay')
			{
				tmpProvider.pauseToReplay(
					this.pict.AppData.Timeline.Window.FromIso,
					this.pict.AppData.Timeline.Window.ToIso);
			}
			else
			{
				tmpProvider.startLive(this);
			}
		}

		// First paint with whatever's currently in AppData (often empty
		// the first frame; provider's first response triggers a redraw).
		this._scheduleRedraw();

		// Anomaly ribbon — independent fetch loop on a slower cadence.
		this._installAnomalyListeners();
		this._fetchAnomaliesOnce();
		this._scheduleNextAnomalyPoll();

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	// Provider hook — called whenever the provider has fresh data.
	onTimelineUpdated()
	{
		this._scheduleRedraw();
	}

	// ====================================================================
	// User-facing actions (called from template onclick handlers)
	// ====================================================================

	onLiveClicked()
	{
		this.pict.AppData.Timeline.Window.FromIso = 'now-2m';
		this.pict.AppData.Timeline.Window.ToIso   = 'now+30s';
		this.pict.AppData.Timeline.Window.Mode    = 'live';
		this._writeURL();
		let tmpProvider = this._provider();
		if (tmpProvider) { tmpProvider.resumeLive(); }
		// Re-render top bar indicator.
		this.render();
	}

	onResetZoomClicked()
	{
		this.onLiveClicked();
	}

	onCloseFocus()
	{
		this.pict.AppData.Timeline.Focus = null;
		this._syncFocusSlot();
		this._writeURL();
		this.render();
	}

	// ====================================================================
	// Interaction listeners
	// ====================================================================

	_installCanvasListeners()
	{
		let tmpCanvasEl = this.pict.ContentAssignment.getElement('#Ultravisor-Timeline-Canvas');
		if (!tmpCanvasEl) return;
		let tmpCanvas = tmpCanvasEl[0] || tmpCanvasEl;
		if (!tmpCanvas || !tmpCanvas.addEventListener) return;

		// Wheel = zoom centered on cursor X.
		let fWheel = function (pEvent)
		{
			pEvent.preventDefault();
			this._handleWheel(pEvent, tmpCanvas);
		}.bind(this);
		tmpCanvas.addEventListener('wheel', fWheel, { passive: false });
		this._WheelListener = { node: tmpCanvas, fn: fWheel };

		// Click = focus.
		let fClick = function (pEvent)
		{
			this._handleClick(pEvent, tmpCanvas);
		}.bind(this);
		tmpCanvas.addEventListener('click', fClick);
		this._ClickListener = { node: tmpCanvas, fn: fClick };
	}

	_installScrubberListeners()
	{
		// No attachment guard — onAfterRender rebuilds the DOM, so the
		// scrubber node from the prior render is gone and we need to
		// re-bind to the new one. The previous listener is GC'd with
		// the orphan DOM node.
		let tmpScrubEl = this.pict.ContentAssignment.getElement('#Ultravisor-Timeline-Scrubber');
		if (!tmpScrubEl) return;
		let tmpScrub = tmpScrubEl[0] || tmpScrubEl;
		if (!tmpScrub) return;

		let fMouseDown = function (pEvent)
		{
			this._handleScrubMouseDown(pEvent, tmpScrub);
		}.bind(this);
		tmpScrub.addEventListener('mousedown', fMouseDown);
	}

	_installResizeListener()
	{
		if (this._ResizeListener) return;
		let fResize = function () { this._scheduleRedraw(); }.bind(this);
		window.addEventListener('resize', fResize);
		this._ResizeListener = fResize;
	}

	_installKeyboardListener()
	{
		// Keyboard nav (arrow keys, Esc) only meaningful when the view
		// is active. Bound to document; the listener checks whether
		// the timeline is the visible content.
		// Skipping for v1; reset/Live button covers the common case.
	}

	_handleWheel(pEvent, pCanvas)
	{
		let tmpRect = pCanvas.getBoundingClientRect();
		let tmpFrac = (pEvent.clientX - tmpRect.left) / tmpRect.width;
		if (tmpFrac < 0) tmpFrac = 0;
		if (tmpFrac > 1) tmpFrac = 1;
		let tmpFromMs = Date.parse(this.pict.AppData.Timeline.Stream.Now) || Date.now();
		// Resolve current absolute window (server's resolved values
		// land in Stream.From/To via the reconcile path).
		let tmpAbsFrom = libURLState.resolveTime(this.pict.AppData.Timeline.Window.FromIso, tmpFromMs);
		let tmpAbsTo   = libURLState.resolveTime(this.pict.AppData.Timeline.Window.ToIso,   tmpFromMs);
		let tmpFromMsAbs = Date.parse(tmpAbsFrom) || (tmpFromMs - 120000);
		let tmpToMsAbs   = Date.parse(tmpAbsTo)   || (tmpFromMs + 30000);
		let tmpSpan = tmpToMsAbs - tmpFromMsAbs;
		let tmpFactor = pEvent.deltaY > 0 ? 1.25 : 0.8;
		let tmpNewSpan = Math.max(2000, Math.min(30 * 86400 * 1000, tmpSpan * tmpFactor));
		let tmpAnchorMs = tmpFromMsAbs + tmpFrac * tmpSpan;
		let tmpNewFrom  = tmpAnchorMs - tmpFrac * tmpNewSpan;
		let tmpNewTo    = tmpAnchorMs + (1 - tmpFrac) * tmpNewSpan;

		// Switch to replay (zoomed away from live).
		this.pict.AppData.Timeline.Window.Mode = 'replay';
		this.pict.AppData.Timeline.Window.FromIso = new Date(tmpNewFrom).toISOString();
		this.pict.AppData.Timeline.Window.ToIso   = new Date(tmpNewTo).toISOString();
		this._writeURL();
		let tmpProvider = this._provider();
		if (tmpProvider)
		{
			tmpProvider.pauseToReplay(
				this.pict.AppData.Timeline.Window.FromIso,
				this.pict.AppData.Timeline.Window.ToIso);
		}
		this._scheduleRedraw();
	}

	_handleClick(pEvent, pCanvas)
	{
		let tmpRect = pCanvas.getBoundingClientRect();
		let tmpX = pEvent.clientX - tmpRect.left;
		let tmpY = pEvent.clientY - tmpRect.top;
		let tmpHit = libRenderBands.hitTest(tmpX, tmpY, this._buildState(), pCanvas);
		if (!tmpHit) { return; }
		let tmpFocus = null;
		if (tmpHit.RunHash) { tmpFocus = { Kind: 'runHash', Hash: tmpHit.RunHash }; }
		else if (tmpHit.BeaconID) { tmpFocus = { Kind: 'beacon', Hash: tmpHit.BeaconID }; }
		else if (tmpHit.Capability) { tmpFocus = { Kind: 'capability', Hash: tmpHit.Capability }; }
		this.pict.AppData.Timeline.Focus = tmpFocus;
		// Stash the matched record so the drawer template can render
		// it without needing a separate fetch.
		this.pict.AppData.Timeline.FocusedRecord = tmpHit;
		this._syncFocusSlot();
		this._writeURL();
		if (tmpFocus && tmpFocus.Kind === 'runHash')
		{
			this._ensureWaterfallData(tmpFocus.Hash);
		}
		this.render();
	}

	// Scrubber interactions:
	//   - Click without drag → jump that fraction of the retention window
	//     and recenter on it (preserves current span).
	//   - Drag → pan the visible window left/right.
	//
	// Window placement model: scrubber represents "now-30min" → "now"
	// (default retention). The brush highlights the current visible
	// window; dragging it shifts From/To equally.
	_handleScrubMouseDown(pEvent, pScrub)
	{
		pEvent.preventDefault();
		let tmpRect = pScrub.getBoundingClientRect();
		let tmpRetentionMs = 30 * 60 * 1000;
		let tmpNowMs = Date.now();
		let tmpScrubStartMs = tmpNowMs - tmpRetentionMs;

		// Resolve the current window to absolute ms so we can shift it
		// without losing span on every drag tick.
		let tmpW = this.pict.AppData.Timeline.Window || {};
		let tmpAbsFrom = libURLState.resolveTime(tmpW.FromIso, tmpNowMs);
		let tmpAbsTo   = libURLState.resolveTime(tmpW.ToIso,   tmpNowMs);
		let tmpStartFromMs = Date.parse(tmpAbsFrom) || (tmpNowMs - 120000);
		let tmpStartToMs   = Date.parse(tmpAbsTo)   || (tmpNowMs + 30000);
		let tmpSpanMs = Math.max(1000, tmpStartToMs - tmpStartFromMs);

		let tmpDownX = pEvent.clientX;
		let tmpScrubWidth = tmpRect.width;
		let tmpDragged = false;

		let fOnMouseMove = function (pMoveEvent)
		{
			let tmpDx = pMoveEvent.clientX - tmpDownX;
			if (Math.abs(tmpDx) >= 3) { tmpDragged = true; }
			if (!tmpDragged) return;
			let tmpDeltaFrac = tmpDx / tmpScrubWidth;
			let tmpDeltaMs = tmpDeltaFrac * tmpRetentionMs;
			let tmpFrom = tmpStartFromMs + tmpDeltaMs;
			let tmpTo   = tmpStartToMs   + tmpDeltaMs;
			// Don't let the window run past now (snap to "now-span" max).
			if (tmpTo > tmpNowMs + 30000)
			{
				let tmpAdjust = tmpTo - (tmpNowMs + 30000);
				tmpFrom -= tmpAdjust;
				tmpTo   -= tmpAdjust;
			}
			this._applyReplayWindow(new Date(tmpFrom).toISOString(),
				new Date(tmpTo).toISOString(), false /* don't refetch on every pixel */);
		}.bind(this);

		let fOnMouseUp = function ()
		{
			document.removeEventListener('mousemove', fOnMouseMove);
			document.removeEventListener('mouseup', fOnMouseUp);
			if (tmpDragged)
			{
				// Drag ended: do one final fetch with the settled window.
				let tmpProvider = this._provider();
				if (tmpProvider)
				{
					tmpProvider.pauseToReplay(
						this.pict.AppData.Timeline.Window.FromIso,
						this.pict.AppData.Timeline.Window.ToIso);
				}
				this._writeURL();
			}
			else
			{
				// Pure click → jump-to-fraction, recentering the visible
				// span on the click position.
				let tmpFrac = (pEvent.clientX - tmpRect.left) / tmpScrubWidth;
				if (tmpFrac < 0) tmpFrac = 0;
				if (tmpFrac > 1) tmpFrac = 1;
				let tmpCenter = tmpScrubStartMs + tmpFrac * tmpRetentionMs;
				let tmpFrom = tmpCenter - tmpSpanMs / 2;
				let tmpTo   = tmpCenter + tmpSpanMs / 2;
				this._applyReplayWindow(new Date(tmpFrom).toISOString(),
					new Date(tmpTo).toISOString(), true /* refetch immediately */);
				this._writeURL();
			}
		}.bind(this);

		document.addEventListener('mousemove', fOnMouseMove);
		document.addEventListener('mouseup', fOnMouseUp);
	}

	// Common path for scrub-induced window changes. Updates AppData
	// + scrubber overlay + (optionally) kicks the provider. We don't
	// call this.render() here — that would tear down the very mouse
	// listener we're inside of, leaving the user stuck mid-drag.
	_applyReplayWindow(pFromIso, pToIso, pRefetch)
	{
		this.pict.AppData.Timeline.Window.Mode = 'replay';
		this.pict.AppData.Timeline.Window.FromIso = pFromIso;
		this.pict.AppData.Timeline.Window.ToIso   = pToIso;
		this._setReplayIndicator();
		this._updateScrubberWindow();
		this._scheduleRedraw();
		if (pRefetch)
		{
			let tmpProvider = this._provider();
			if (tmpProvider)
			{
				tmpProvider.pauseToReplay(pFromIso, pToIso);
			}
		}
	}

	// Imperatively swap the LIVE indicator for the REPLAY indicator
	// without a full re-render (which would tear down listeners). The
	// template's single-element-array slots are templates that picked
	// their state at render time; once rendered, they're static DOM.
	_setReplayIndicator()
	{
		try
		{
			let tmpHeader = this.pict.ContentAssignment.getElement('.uv-timeline-header-actions');
			let tmpNode = tmpHeader && (tmpHeader[0] || tmpHeader);
			if (!tmpNode) return;
			let tmpLive = tmpNode.querySelector('.uv-timeline-mode-indicator.live');
			if (tmpLive) { tmpLive.style.display = 'none'; }
			let tmpReplay = tmpNode.querySelector('.uv-timeline-mode-indicator.replay');
			if (tmpReplay)
			{
				tmpReplay.style.display = '';
			}
			else
			{
				// First switch to replay since render — splice in a fresh
				// REPLAY badge after the (now hidden) LIVE one.
				let tmpBadge = document.createElement('span');
				tmpBadge.className = 'uv-timeline-mode-indicator replay';
				tmpBadge.textContent = 'REPLAY';
				if (tmpLive && tmpLive.parentNode)
				{
					tmpLive.parentNode.insertBefore(tmpBadge, tmpLive.nextSibling);
				}
				else
				{
					tmpNode.insertBefore(tmpBadge, tmpNode.firstChild);
				}
			}
		}
		catch (pErr) { /* best effort */ }
	}

	// ====================================================================
	// Helpers
	// ====================================================================

	_provider()
	{
		return this.pict.providers && this.pict.providers['Timeline-Stream'];
	}

	_buildState()
	{
		// Compose the state shape render-bands.js expects.
		let tmpT = this.pict.AppData.Timeline || {};
		return {
			Window:         tmpT.Window || {},
			Stream:         tmpT.Stream || { Past: [], Present: [], Future: [], Buckets: null, Now: null },
			CapabilityRows: tmpT.CapabilityRows || [],
			BeaconRows:     tmpT.BeaconRows || [],
			Focus:          tmpT.Focus || null
		};
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
		let tmpCanvas = _resolveCanvas(this.pict, '#Ultravisor-Timeline-Canvas');
		if (!tmpCanvas)
		{
			// Spine view's been replaced (user navigated to /Throughput
			// etc.) — stop the provider's poll cycle and our anomaly
			// loop so we don't burn fetches.
			let tmpProvider = this._provider();
			if (tmpProvider) { tmpProvider.stop(); }
			if (this._AnomalyPollHandle)
			{
				clearTimeout(this._AnomalyPollHandle);
				this._AnomalyPollHandle = null;
			}
			return;
		}
		let tmpSVGEl = this.pict.ContentAssignment.getElement('#Ultravisor-Timeline-SVG');
		let tmpSVG = tmpSVGEl && tmpSVGEl.length !== 0 ? (tmpSVGEl[0] || tmpSVGEl) : null;
		try
		{
			libRenderBands.drawTimeline(tmpCanvas, tmpSVG, this._buildState());
		}
		catch (pErr)
		{
			this.pict.log.warn('Timeline view: draw failed: ' + pErr.message);
		}
		this._updateScrubberWindow();
		this._updateChrome();
		this._drawWaterfallIfFocused();
		this._drawAnomalyRibbon();
	}

	// Update the parts of the chrome that change on every fetch:
	// stats line, windowinfo span, mode indicator. Bypasses a full
	// template re-render (which would tear down canvas listeners and
	// any in-progress drawer state).
	_updateChrome()
	{
		let tmpStream = (this.pict.AppData.Timeline && this.pict.AppData.Timeline.Stream) || {};
		let tmpPast    = (tmpStream.Past    || []).length;
		let tmpPresent = (tmpStream.Present || []).length;
		let tmpFuture  = (tmpStream.Future  || []).length;
		let tmpStatsHTML = '<span>past: ' + tmpPast + '</span>'
			+ '<span>present: ' + tmpPresent + '</span>'
			+ '<span>future: ' + tmpFuture + '</span>';
		try { this.pict.ContentAssignment.assignContent('#Ultravisor-Timeline-Stats', tmpStatsHTML); }
		catch (pErr) { /* element may have been torn down */ }
	}

	_updateScrubberWindow()
	{
		// Show the current window as a highlighted band on the scrubber.
		let tmpEl = this.pict.ContentAssignment.getElement('#Ultravisor-Timeline-Scrubber-Window');
		if (!tmpEl) return;
		let tmpNode = tmpEl[0] || tmpEl;
		if (!tmpNode || !tmpNode.style) return;
		let tmpNow = Date.now();
		let tmpRetentionMs = 30 * 60 * 1000;
		let tmpStart = tmpNow - tmpRetentionMs;
		let tmpFrom = Date.parse(libURLState.resolveTime(this.pict.AppData.Timeline.Window.FromIso, tmpNow));
		let tmpTo   = Date.parse(libURLState.resolveTime(this.pict.AppData.Timeline.Window.ToIso, tmpNow));
		if (!Number.isFinite(tmpFrom) || !Number.isFinite(tmpTo))
		{
			tmpNode.style.display = 'none';
			return;
		}
		let tmpFracFrom = Math.max(0, Math.min(1, (tmpFrom - tmpStart) / tmpRetentionMs));
		let tmpFracTo   = Math.max(0, Math.min(1, (tmpTo   - tmpStart) / tmpRetentionMs));
		tmpNode.style.display = 'block';
		tmpNode.style.left  = (tmpFracFrom * 100) + '%';
		tmpNode.style.width = ((tmpFracTo - tmpFracFrom) * 100) + '%';
	}

	_writeURL()
	{
		libURLState.write({
			FromIso: this.pict.AppData.Timeline.Window.FromIso,
			ToIso:   this.pict.AppData.Timeline.Window.ToIso,
			Mode:    this.pict.AppData.Timeline.Window.Mode,
			Bucket:  this.pict.AppData.Timeline.Window.Bucket,
			Focus:   this.pict.AppData.Timeline.Focus
		});
	}

	_syncFocusSlot()
	{
		// Drawer slot dispatch by Focus.Kind:
		//   - 'runHash' → waterfall slot (canvas painted in onAfterRender)
		//   - everything else (or no focus) → JSON dump slot
		// Both slots use the single-element-array conditional pattern; only
		// one is populated at a time.
		let tmpFocus = this.pict.AppData.Timeline.Focus;
		let tmpRecord = this.pict.AppData.Timeline.FocusedRecord;
		this.pict.AppData.Timeline.FocusSlot = [];
		this.pict.AppData.Timeline.WaterfallSlot = [];

		if (!tmpFocus) { return; }

		if (tmpFocus.Kind === 'runHash')
		{
			// The waterfall fetch fills in metadata; show a placeholder
			// row until the response arrives.
			let tmpCached = this._WaterfallByRunHash[tmpFocus.Hash];
			let tmpMeta = tmpCached
				? this._waterfallMetaFromCache(tmpCached, tmpFocus.Hash)
				: { RunHash: tmpFocus.Hash, OperationName: '(loading…)', TaskCount: 0,
					EventCount: 0, SpanLabel: '—', StatusLabel: '' };
			this.pict.AppData.Timeline.WaterfallSlot = [tmpMeta];
			return;
		}

		if (tmpRecord)
		{
			let tmpTitle = tmpFocus.Kind + ': ' + tmpFocus.Hash;
			let tmpJSON = '';
			try { tmpJSON = JSON.stringify(tmpRecord, null, 2); }
			catch (pErr) { tmpJSON = '(unable to serialize)'; }
			this.pict.AppData.Timeline.FocusSlot = [{ Title: tmpTitle, JSON: tmpJSON }];
		}
	}

	_waterfallMetaFromCache(pCached, pRunHash)
	{
		let tmpTasks = libRenderWaterfall.buildTaskRows(
			{ Records: pCached.Records || [] });
		let tmpFromMs = null, tmpToMs = null;
		for (let i = 0; i < tmpTasks.length; i++)
		{
			if (tmpFromMs === null || tmpTasks[i].At    < tmpFromMs) tmpFromMs = tmpTasks[i].At;
			if (tmpToMs   === null || tmpTasks[i].EndAt > tmpToMs)   tmpToMs   = tmpTasks[i].EndAt;
		}
		let tmpSpanMs = (tmpFromMs !== null && tmpToMs !== null) ? (tmpToMs - tmpFromMs) : 0;
		// Find a terminal status hint from the run-level records.
		let tmpStatus = '';
		let tmpRecs = pCached.Records || [];
		for (let i = tmpRecs.length - 1; i >= 0; i--)
		{
			let tmpET = tmpRecs[i] && tmpRecs[i].EventType;
			if (tmpET === 'Run.Completed') { tmpStatus = 'Complete'; break; }
			if (tmpET === 'Run.Failed') { tmpStatus = 'Failed'; break; }
			if (tmpET === 'Run.Stalled') { tmpStatus = 'Stalled'; break; }
			if (tmpET === 'Run.Canceled' || tmpET === 'Run.Abandoned') { tmpStatus = 'Canceled'; break; }
		}
		if (!tmpStatus && tmpTasks.length > 0)
		{
			// Fall back to "Running" if any task is still open-ended.
			let tmpAnyOpen = false;
			for (let i = 0; i < tmpTasks.length; i++)
			{
				if (tmpTasks[i].EndAt <= tmpTasks[i].At) { tmpAnyOpen = true; break; }
			}
			tmpStatus = tmpAnyOpen ? 'Running' : 'Complete';
		}
		return {
			RunHash:       pRunHash,
			OperationName: (pCached.Operation && (pCached.Operation.Name || pCached.Operation.Hash)) || '(unknown operation)',
			TaskCount:     tmpTasks.length,
			EventCount:    tmpRecs.length,
			SpanLabel:     tmpSpanMs > 0 ? _formatDurationLabel(tmpSpanMs) : '—',
			StatusLabel:   tmpStatus ? ('status: ' + tmpStatus) : ''
		};
	}

	_ensureWaterfallData(pRunHash)
	{
		if (!pRunHash) return;
		if (this._WaterfallByRunHash[pRunHash]
			&& (Date.now() - this._WaterfallByRunHash[pRunHash].FetchedAt) < 4000)
		{
			return;
		}
		// Abort any prior in-flight fetch (different run, or stale).
		if (this._WaterfallFetchInFlight && this._WaterfallFetchInFlight.RunHash !== pRunHash)
		{
			try { this._WaterfallFetchInFlight.Abort.abort(); }
			catch (pErr) { /* best effort */ }
			this._WaterfallFetchInFlight = null;
		}

		let tmpBase = (this.pict.AppData.Ultravisor && this.pict.AppData.Ultravisor.APIBaseURL) || '';
		let tmpAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
		this._WaterfallFetchInFlight = { RunHash: pRunHash, Abort: tmpAbort };
		let tmpURL = tmpBase
			+ '/Timeline?from=now-2h&to=now%2B30s&bucket=raw&waitMs=0&runHash='
			+ encodeURIComponent(pRunHash);
		let tmpSelf = this;

		fetch(tmpURL, { signal: tmpAbort ? tmpAbort.signal : undefined })
			.then(function (pResp) { return pResp.ok ? pResp.json() : null; })
			.then(function (pBody)
			{
				if (!pBody) return null;
				let tmpAll = []
					.concat(Array.isArray(pBody.Past) ? pBody.Past : [])
					.concat(Array.isArray(pBody.Present) ? pBody.Present : [])
					.concat(Array.isArray(pBody.Future) ? pBody.Future : []);
				// Pick up the operation hash from any record that has one.
				let tmpOpHash = '';
				for (let i = 0; i < tmpAll.length; i++)
				{
					if (tmpAll[i].OperationHash) { tmpOpHash = tmpAll[i].OperationHash; break; }
				}
				if (!tmpOpHash)
				{
					tmpSelf._WaterfallByRunHash[pRunHash] =
					{
						RunHash:   pRunHash,
						Records:   tmpAll,
						Operation: null,
						FetchedAt: Date.now()
					};
					tmpSelf._afterWaterfallFetch(pRunHash);
					return null;
				}
				return fetch(tmpBase + '/Operation/' + encodeURIComponent(tmpOpHash))
					.then(function (pOpResp) { return pOpResp.ok ? pOpResp.json() : null; })
					.then(function (pOp)
					{
						tmpSelf._WaterfallByRunHash[pRunHash] =
						{
							RunHash:   pRunHash,
							Records:   tmpAll,
							Operation: pOp,
							FetchedAt: Date.now()
						};
						tmpSelf._afterWaterfallFetch(pRunHash);
						return null;
					});
			})
			.catch(function (pErr)
			{
				if (pErr && pErr.name === 'AbortError') return;
				tmpSelf.pict.log.warn('Timeline waterfall fetch failed: ' + (pErr && pErr.message));
			})
			.then(function ()
			{
				if (tmpSelf._WaterfallFetchInFlight
					&& tmpSelf._WaterfallFetchInFlight.RunHash === pRunHash)
				{
					tmpSelf._WaterfallFetchInFlight = null;
				}
			});
	}

	_afterWaterfallFetch(pRunHash)
	{
		// Only act if this run is still the focused run.
		let tmpFocus = this.pict.AppData.Timeline.Focus;
		if (!tmpFocus || tmpFocus.Kind !== 'runHash' || tmpFocus.Hash !== pRunHash) return;
		this._syncFocusSlot();
		// Re-render the drawer slot so the meta + canvas template
		// receives the populated record. Easier than surgical
		// assignContent to multiple spans.
		this.render();
	}

	_drawWaterfallIfFocused()
	{
		let tmpFocus = this.pict.AppData.Timeline.Focus;
		if (!tmpFocus || tmpFocus.Kind !== 'runHash') return;
		let tmpCached = this._WaterfallByRunHash[tmpFocus.Hash];
		if (!tmpCached) return;
		let tmpCanvas = _resolveCanvas(this.pict, '#Ultravisor-Timeline-Waterfall-Canvas');
		if (!tmpCanvas) return;
		try
		{
			libRenderWaterfall.drawWaterfall(tmpCanvas,
			{
				RunHash:   tmpFocus.Hash,
				Records:   tmpCached.Records || [],
				Operation: tmpCached.Operation || null,
				Now:       (this.pict.AppData.Timeline.Stream && this.pict.AppData.Timeline.Stream.Now) || null
			});
		}
		catch (pErr)
		{
			this.pict.log.warn('Timeline waterfall draw failed: ' + pErr.message);
		}
	}

	// ====================================================================
	// Anomaly ribbon
	// ====================================================================

	_fetchAnomaliesOnce()
	{
		if (this._AnomalyFetchInFlight)
		{
			try { this._AnomalyFetchInFlight.abort(); }
			catch (pErr) { /* ignore */ }
			this._AnomalyFetchInFlight = null;
		}
		let tmpAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
		this._AnomalyFetchInFlight = tmpAbort;
		let tmpBase = (this.pict.AppData.Ultravisor && this.pict.AppData.Ultravisor.APIBaseURL) || '';
		let tmpW = this.pict.AppData.Timeline.Window || {};
		let tmpURL = tmpBase
			+ '/Timeline/Anomalies?from=' + encodeURIComponent(tmpW.FromIso || 'now-15m')
			+ '&to=' + encodeURIComponent(tmpW.ToIso || 'now');
		let tmpSelf = this;
		fetch(tmpURL, { signal: tmpAbort ? tmpAbort.signal : undefined })
			.then(function (pResp) { return pResp.ok ? pResp.json() : null; })
			.then(function (pBody)
			{
				if (tmpSelf._AnomalyFetchInFlight !== tmpAbort) return;
				if (pBody)
				{
					tmpSelf._AnomalyState.Window = { FromIso: pBody.From, ToIso: pBody.To };
					tmpSelf._AnomalyState.Anomalies = Array.isArray(pBody.Anomalies) ? pBody.Anomalies : [];
				}
				tmpSelf._AnomalyFetchInFlight = null;
				tmpSelf._scheduleRedraw();
			})
			.catch(function (pErr)
			{
				if (pErr && pErr.name === 'AbortError') return;
				if (tmpSelf._AnomalyFetchInFlight !== tmpAbort) return;
				tmpSelf._AnomalyFetchInFlight = null;
				// Quiet — anomaly ribbon is non-essential; don't spam logs.
			});
	}

	_scheduleNextAnomalyPoll()
	{
		if (this._AnomalyPollHandle) { clearTimeout(this._AnomalyPollHandle); }
		this._AnomalyPollHandle = setTimeout(function ()
		{
			this._AnomalyPollHandle = null;
			this._fetchAnomaliesOnce();
			this._scheduleNextAnomalyPoll();
		}.bind(this), 10000);
	}

	_drawAnomalyRibbon()
	{
		let tmpCanvas = _resolveCanvas(this.pict, '#Ultravisor-Timeline-Anomaly-Canvas');
		if (!tmpCanvas) return;
		// Sync the ribbon's window to the current spine window so ticks
		// land at the right X positions even if the spine has slid.
		let tmpW = this.pict.AppData.Timeline.Window || {};
		// The ribbon draws inside its own canvas (full width), with the
		// spine's left padding so labels align with the bands above. The
		// spine's render-bands.js uses PADDING_LEFT=140, PADDING_RIGHT=16.
		let tmpDrawState = {
			Window:    { FromIso: tmpW.FromIso, ToIso: tmpW.ToIso },
			Anomalies: this._AnomalyState.Anomalies,
			PadLeft:   140,
			PadRight:  16
		};
		try
		{
			libRenderAnomalyRibbon.drawAnomalyRibbon(tmpCanvas, tmpDrawState);
			this._AnomalyState.HitBoxes = tmpDrawState.HitBoxes || [];
		}
		catch (pErr)
		{
			this.pict.log.warn('Anomaly ribbon draw failed: ' + pErr.message);
		}
	}

	_installAnomalyListeners()
	{
		let tmpWrapEl = this.pict.ContentAssignment.getElement('#Ultravisor-Timeline-Anomaly-Wrap');
		if (!tmpWrapEl) return;
		let tmpWrap = tmpWrapEl[0] || tmpWrapEl;
		if (!tmpWrap || !tmpWrap.addEventListener) return;
		let tmpCanvasEl = this.pict.ContentAssignment.getElement('#Ultravisor-Timeline-Anomaly-Canvas');
		if (!tmpCanvasEl) return;
		let tmpCanvas = tmpCanvasEl[0] || tmpCanvasEl;
		if (!tmpCanvas) return;

		// Click → jump the spine to the anomaly's window.
		let fClick = function (pEvent)
		{
			let tmpRect = tmpCanvas.getBoundingClientRect();
			let tmpX = pEvent.clientX - tmpRect.left;
			let tmpHit = libRenderAnomalyRibbon.hitTest(tmpX,
				{ HitBoxes: this._AnomalyState.HitBoxes });
			if (!tmpHit) return;
			let tmpAtMs = Date.parse(tmpHit.At);
			let tmpDur = tmpHit.DurationMs || 60000;
			if (!Number.isFinite(tmpAtMs)) return;
			let tmpFrom = new Date(tmpAtMs - tmpDur).toISOString();
			let tmpTo   = new Date(tmpAtMs + tmpDur * 2).toISOString();
			this.pict.AppData.Timeline.Window.Mode    = 'replay';
			this.pict.AppData.Timeline.Window.FromIso = tmpFrom;
			this.pict.AppData.Timeline.Window.ToIso   = tmpTo;
			this._writeURL();
			let tmpProvider = this._provider();
			if (tmpProvider) { tmpProvider.pauseToReplay(tmpFrom, tmpTo); }
			this.render();
		}.bind(this);
		tmpCanvas.addEventListener('click', fClick);
		this._AnomalyClickListener = { node: tmpCanvas, fn: fClick };

		// Hover → tooltip.
		let fMove = function (pEvent)
		{
			let tmpRect = tmpCanvas.getBoundingClientRect();
			let tmpX = pEvent.clientX - tmpRect.left;
			let tmpHit = libRenderAnomalyRibbon.hitTest(tmpX,
				{ HitBoxes: this._AnomalyState.HitBoxes });
			this._showAnomalyTooltip(tmpHit, pEvent.clientX, pEvent.clientY);
		}.bind(this);
		let fLeave = function () { this._showAnomalyTooltip(null, 0, 0); }.bind(this);
		tmpCanvas.addEventListener('mousemove', fMove);
		tmpCanvas.addEventListener('mouseleave', fLeave);
		this._AnomalyHoverListener = { node: tmpCanvas, mv: fMove, lv: fLeave };
	}

	_showAnomalyTooltip(pAnomaly, pX, pY)
	{
		let tmpWrapEl = this.pict.ContentAssignment.getElement('#Ultravisor-Timeline-Anomaly-Wrap');
		if (!tmpWrapEl) return;
		let tmpWrap = tmpWrapEl[0] || tmpWrapEl;
		if (!tmpWrap) return;
		if (!pAnomaly)
		{
			if (this._AnomalyTooltipNode && this._AnomalyTooltipNode.parentNode)
			{
				this._AnomalyTooltipNode.parentNode.removeChild(this._AnomalyTooltipNode);
				this._AnomalyTooltipNode = null;
			}
			return;
		}
		if (!this._AnomalyTooltipNode)
		{
			this._AnomalyTooltipNode = document.createElement('div');
			this._AnomalyTooltipNode.className = 'uv-timeline-anomaly-tooltip';
			document.body.appendChild(this._AnomalyTooltipNode);
		}
		let tmpAtLabel = pAnomaly.At ? pAnomaly.At.slice(11, 19) : '?';
		this._AnomalyTooltipNode.textContent =
			pAnomaly.EventType + ' · ' + tmpAtLabel
			+ ' · obs ' + pAnomaly.Observed + ' / threshold ' + pAnomaly.Baseline;
		this._AnomalyTooltipNode.style.left = (pX + 12) + 'px';
		this._AnomalyTooltipNode.style.top  = (pY - 28) + 'px';
	}
}

function _formatDurationLabel(pMs)
{
	if (!Number.isFinite(pMs) || pMs < 0) return '0ms';
	if (pMs < 1000) return pMs + 'ms';
	if (pMs < 60000) return (pMs / 1000).toFixed(1) + 's';
	let tmpMin = Math.floor(pMs / 60000);
	let tmpSec = Math.floor((pMs - tmpMin * 60000) / 1000);
	return tmpMin + 'm' + (tmpSec < 10 ? '0' : '') + tmpSec + 's';
}

// ContentAssignment.getElement returns [] (truthy empty array) when the
// element isn't in the DOM. This helper collapses the result to a real
// canvas DOM node or null, so callers can early-out cleanly when the
// view's been replaced by navigation.
function _resolveCanvas(pPict, pSelector)
{
	let tmpEl = pPict.ContentAssignment.getElement(pSelector);
	if (!tmpEl) return null;
	if (Array.isArray(tmpEl) && tmpEl.length === 0) return null;
	let tmpNode = tmpEl[0] || tmpEl;
	if (!tmpNode || typeof tmpNode.getContext !== 'function') return null;
	return tmpNode;
}

module.exports = UltravisorTimelineView;
module.exports.default_configuration = _ViewConfiguration;
