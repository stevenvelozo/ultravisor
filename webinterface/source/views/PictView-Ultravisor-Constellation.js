/**
 * PictView-Ultravisor-Constellation
 *
 * Phase 7 / beacon constellation — answers "is the fleet healthy?"
 * Each beacon a node, color = liveness, halo when handling work, edges
 * connect beacons sharing a primary capability. Polls Observer/Snapshot
 * for the structural graph and `/Timeline?from=now-30s&to=now&bucket=raw`
 * for the live activity overlay.
 *
 * Standalone view at `/Constellation`.
 */

const libPictView = require('pict-view');
const libRenderConstellation = require('./timeline/render-constellation.js');

const _ViewConfiguration =
{
	ViewIdentifier: 'Ultravisor-Constellation',

	DefaultRenderable: 'Ultravisor-Constellation-Content',
	DefaultDestinationAddress: '#Ultravisor-Content-Container',

	AutoRender: false,

	CSS: /*css*/`
		.uv-constellation {
			padding: 1.5em;
			max-width: 1800px;
			margin: 0 auto;
		}
		.uv-constellation-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1em;
			padding-bottom: 0.75em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.uv-constellation-header h1 {
			margin: 0;
			font-size: 1.6em;
			font-weight: 300;
			color: var(--uv-text);
		}
		.uv-constellation-stats {
			font-size: 0.85em;
			color: var(--uv-text-secondary);
			font-family: monospace;
		}
		.uv-constellation-stats strong {
			color: var(--uv-text);
			font-weight: 600;
		}
		.uv-constellation-canvas-wrap {
			position: relative;
			width: 100%;
			height: 620px;
			background: var(--uv-bg-base);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 6px;
		}
		.uv-constellation-canvas {
			position: absolute;
			top: 0; left: 0;
			width: 100%;
			height: 100%;
			cursor: crosshair;
		}
		.uv-constellation-detail {
			margin-top: 1em;
			padding: 0.85em 1em;
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 6px;
		}
		.uv-constellation-detail-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 0.4em;
			padding-bottom: 0.4em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.uv-constellation-detail-header h3 {
			margin: 0;
			font-size: 1em;
			font-weight: 600;
			color: var(--uv-text);
		}
		.uv-constellation-detail-close {
			background: none;
			border: none;
			color: var(--uv-text-secondary);
			cursor: pointer;
			font-size: 1.2em;
			padding: 0 0.4em;
		}
		.uv-constellation-detail pre {
			margin: 0;
			font-size: 0.78em;
			color: var(--uv-text);
			white-space: pre-wrap;
			word-break: break-all;
			max-height: 280px;
			overflow: auto;
		}
		.uv-constellation-help {
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
			Hash: 'Ultravisor-Constellation-Template',
			Template: /*html*/`
<div class="uv-constellation">
	<div class="uv-constellation-header">
		<h1>Beacon Constellation</h1>
		<div class="uv-constellation-stats" id="Ultravisor-Constellation-Stats">
			<span>beacons: <strong>0</strong></span>
		</div>
	</div>
	<div class="uv-constellation-canvas-wrap">
		<canvas class="uv-constellation-canvas" id="Ultravisor-Constellation-Canvas"></canvas>
	</div>
	<div id="Ultravisor-Constellation-Detail-Slot">
		{~TS:Ultravisor-Constellation-Detail-Template:AppData.Constellation.DetailSlot~}
	</div>
	<div class="uv-constellation-help">
		Each node is a beacon; <strong>color</strong> = liveness, <strong>size</strong> = recent throughput, <strong>halo</strong> = handling work right now. Edges connect beacons that share a primary capability. Click a node for its current snapshot.
	</div>
</div>
`
		},
		{
			Hash: 'Ultravisor-Constellation-Detail-Template',
			Template: /*html*/`
<div class="uv-constellation-detail">
	<div class="uv-constellation-detail-header">
		<h3>{~D:Record.Title~}</h3>
		<button class="uv-constellation-detail-close" onclick="{~P~}.views['Ultravisor-Constellation'].onCloseDetail()" title="Close">×</button>
	</div>
	<pre>{~D:Record.JSON~}</pre>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: 'Ultravisor-Constellation-Content',
			TemplateHash:   'Ultravisor-Constellation-Template',
			DestinationAddress: '#Ultravisor-Content-Container',
			RenderMethod:   'replace'
		}
	]
};

const POLL_MS = 2500;

class UltravisorConstellationView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this._PollHandle = null;
		this._FetchInFlight = null;
		this._RedrawScheduled = false;
		this._ResizeListener = null;
		this._ClickListener = null;
		this._AnimationLoop = null;
		this._RenderState = { Beacons: [], RecentActivity: {}, HitTestables: [], Now: null };
	}

	onBeforeRender(pRenderable, pAddress, pRecord)
	{
		this.pict.AppData.Constellation = this.pict.AppData.Constellation || {};
		this.pict.AppData.Constellation.DetailSlot = this.pict.AppData.Constellation.DetailSlot || [];
		// Don't _stopPoll() here — see Throughput's notes.
		return super.onBeforeRender(pRenderable, pAddress, pRecord);
	}

	onAfterRender(pRenderable, pAddress, pRecord, pContent)
	{
		this.pict.CSSMap.injectCSS();
		this._installResizeListener();
		this._installClickListener();
		this._fetchOnce();
		this._scheduleNextPoll();
		this._scheduleRedraw();
		// Keep the pulse animation running; we redraw at ~10fps just for
		// the halo. Cheap with ~10 beacons.
		this._startAnimationLoop();
		return super.onAfterRender(pRenderable, pAddress, pRecord, pContent);
	}

	onCloseDetail()
	{
		this.pict.AppData.Constellation.DetailSlot = [];
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
		let tmpFetchSnap = fetch(tmpBase + '/Observer/Snapshot', { signal: tmpAbort ? tmpAbort.signal : undefined })
			.then(function (pResp) { return pResp.ok ? pResp.json() : null; });
		let tmpFetchActivity = fetch(tmpBase + '/Timeline?from=now-30s&to=now&bucket=raw&waitMs=0&futureLimit=0',
				{ signal: tmpAbort ? tmpAbort.signal : undefined })
			.then(function (pResp) { return pResp.ok ? pResp.json() : null; });
		let tmpSelf = this;
		Promise.all([tmpFetchSnap, tmpFetchActivity])
			.then(function (pAll)
			{
				if (tmpSelf._FetchInFlight !== tmpAbort) return;
				tmpSelf._reconcile(pAll[0], pAll[1]);
				tmpSelf._FetchInFlight = null;
			})
			.catch(function (pErr)
			{
				if (pErr && pErr.name === 'AbortError') return;
				if (tmpSelf._FetchInFlight !== tmpAbort) return;
				tmpSelf.pict.log.warn('Constellation fetch failed: ' + pErr.message);
				tmpSelf._FetchInFlight = null;
			});
	}

	_reconcile(pSnapshot, pActivityBody)
	{
		let tmpBeaconsMap = (pSnapshot && pSnapshot.Beacons) || {};
		let tmpBeacons = [];
		// Snapshot.Beacons is keyed by beacon id; flatten preserving order.
		let tmpKeys = Object.keys(tmpBeaconsMap).sort();
		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpB = tmpBeaconsMap[tmpKeys[i]];
			if (tmpB) { tmpBeacons.push(tmpB); }
		}

		// Recent activity tally from /Timeline raw past+present.
		let tmpAll = []
			.concat((pActivityBody && Array.isArray(pActivityBody.Past)) ? pActivityBody.Past : [])
			.concat((pActivityBody && Array.isArray(pActivityBody.Present)) ? pActivityBody.Present : []);
		let tmpActivity = {};
		for (let i = 0; i < tmpAll.length; i++)
		{
			let tmpBid = tmpAll[i].BeaconID;
			if (!tmpBid) continue;
			tmpActivity[tmpBid] = (tmpActivity[tmpBid] || 0) + 1;
		}

		this._RenderState.Beacons = tmpBeacons;
		this._RenderState.RecentActivity = tmpActivity;
		this._RenderState.Now = (pActivityBody && pActivityBody.Now) || (new Date()).toISOString();
		this._updateStatsLine(tmpBeacons);
		this._scheduleRedraw();
	}

	_updateStatsLine(pBeacons)
	{
		let tmpAlive = 0, tmpInDoubt = 0, tmpQuar = 0, tmpDefunct = 0;
		for (let i = 0; i < pBeacons.length; i++)
		{
			let tmpL = pBeacons[i].Liveness || 'Unknown';
			if (tmpL === 'Alive') tmpAlive++;
			else if (tmpL === 'In-Doubt' || tmpL === 'InDoubt') tmpInDoubt++;
			else if (tmpL === 'Quarantined') tmpQuar++;
			else if (tmpL === 'Defunct') tmpDefunct++;
		}
		let tmpHTML = '<span>beacons: <strong>' + pBeacons.length + '</strong></span>'
			+ '<span style="margin-left:0.75em">alive: <strong>' + tmpAlive + '</strong></span>'
			+ '<span style="margin-left:0.5em">in-doubt: <strong>' + tmpInDoubt + '</strong></span>'
			+ '<span style="margin-left:0.5em">quarantined: <strong>' + tmpQuar + '</strong></span>'
			+ '<span style="margin-left:0.5em">defunct: <strong>' + tmpDefunct + '</strong></span>';
		try { this.pict.ContentAssignment.assignContent('#Ultravisor-Constellation-Stats', tmpHTML); }
		catch (pErr) { /* best effort */ }
	}

	// ====================================================================
	// Polling + animation
	// ====================================================================

	_scheduleNextPoll()
	{
		// Clear only the timer; not the in-flight fetch.
		if (this._PollHandle) { clearTimeout(this._PollHandle); this._PollHandle = null; }
		this._PollHandle = setTimeout(function ()
		{
			this._PollHandle = null;
			this._fetchOnce();
			this._scheduleNextPoll();
		}.bind(this), POLL_MS);
	}

	_stopPoll()
	{
		if (this._PollHandle) { clearTimeout(this._PollHandle); this._PollHandle = null; }
		this._abortInFlight();
		if (this._AnimationLoop)
		{
			clearInterval(this._AnimationLoop);
			this._AnimationLoop = null;
		}
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

	_startAnimationLoop()
	{
		if (this._AnimationLoop) return;
		this._AnimationLoop = setInterval(function ()
		{
			// Only redraw if there's at least one working beacon (the halo
			// is the only thing that actually animates).
			let tmpAnyWorking = false;
			let tmpBeacons = this._RenderState.Beacons || [];
			for (let i = 0; i < tmpBeacons.length; i++)
			{
				if (Array.isArray(tmpBeacons[i].CurrentWorkItems)
					&& tmpBeacons[i].CurrentWorkItems.length > 0)
				{
					tmpAnyWorking = true; break;
				}
			}
			if (tmpAnyWorking) { this._scheduleRedraw(); }
		}.bind(this), 100);
	}

	// ====================================================================
	// Click & resize
	// ====================================================================

	_installResizeListener()
	{
		if (this._ResizeListener) return;
		let fResize = function () { this._scheduleRedraw(); }.bind(this);
		window.addEventListener('resize', fResize);
		this._ResizeListener = fResize;
	}

	_installClickListener()
	{
		let tmpEl = this.pict.ContentAssignment.getElement('#Ultravisor-Constellation-Canvas');
		if (!tmpEl) return;
		let tmpCanvas = tmpEl[0] || tmpEl;
		if (!tmpCanvas) return;
		let fClick = function (pEvent)
		{
			let tmpRect = tmpCanvas.getBoundingClientRect();
			let tmpX = pEvent.clientX - tmpRect.left;
			let tmpY = pEvent.clientY - tmpRect.top;
			let tmpHit = libRenderConstellation.hitTest(tmpX, tmpY, this._RenderState);
			if (!tmpHit) return;
			// Find the matching beacon in our last render state.
			let tmpBeacons = this._RenderState.Beacons || [];
			let tmpFound = null;
			for (let i = 0; i < tmpBeacons.length; i++)
			{
				if (tmpBeacons[i].BeaconID === tmpHit) { tmpFound = tmpBeacons[i]; break; }
			}
			if (!tmpFound) return;
			let tmpJSON = '';
			try { tmpJSON = JSON.stringify(tmpFound, null, 2); }
			catch (pErr) { tmpJSON = '(unable to serialize)'; }
			this.pict.AppData.Constellation.DetailSlot =
			[{
				Title: tmpFound.Name || tmpFound.BeaconID,
				JSON:  tmpJSON
			}];
			this.render();
		}.bind(this);
		tmpCanvas.addEventListener('click', fClick);
		this._ClickListener = { node: tmpCanvas, fn: fClick };
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
		let tmpCanvas = _resolveCanvas(this.pict, '#Ultravisor-Constellation-Canvas');
		if (!tmpCanvas)
		{
			this._stopPoll();
			return;
		}
		try
		{
			libRenderConstellation.drawConstellation(tmpCanvas, this._RenderState);
		}
		catch (pErr)
		{
			this.pict.log.warn('Constellation draw failed: ' + pErr.message);
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

module.exports = UltravisorConstellationView;
module.exports.default_configuration = _ViewConfiguration;
