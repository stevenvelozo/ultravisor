/**
 * render-bands.js
 *
 * Pure render functions for the timeline view. Imperative Canvas + SVG
 * draw — Pict's escape hatch for high-density visualization, called
 * from PictView-Ultravisor-Timeline's onAfterRender. No Pict coupling
 * here; takes a state object and DOM nodes, paints them.
 *
 * Layout:
 *   ┌────────────────────────┐
 *   │ Top: stacked area      │  ← queue counts over time (bucketed)
 *   ├────────────────────────┤
 *   │ Middle: capability     │  ← one row per capability (utilization)
 *   │ swimlanes              │
 *   ├────────────────────────┤
 *   │ Bottom: beacon         │  ← one row per beacon, blocks per work item
 *   │ swimlanes              │
 *   └────────────────────────┘
 *
 * State shape (from AppData.Timeline):
 *   {
 *     Window: { FromIso, ToIso, Mode, Bucket },
 *     Stream: { Past, Present, Future, Buckets, Now, ... },
 *     CapabilityRows: [{ Capability }, ...],
 *     BeaconRows: [{ BeaconID, Display }, ...],
 *     Focus: { Kind, Hash } | null
 *   }
 */

// Status → color (CSS variables resolved at runtime against the page).
const STATUS_COLORS =
{
	'Pending':      { fill: '#3b82f6', stroke: '#2563eb' }, // blue
	'Queued':       { fill: '#3b82f6', stroke: '#2563eb' },
	'Assigned':     { fill: '#6366f1', stroke: '#4338ca' }, // indigo
	'Dispatched':   { fill: '#f59e0b', stroke: '#d97706' }, // amber
	'Running':      { fill: '#f59e0b', stroke: '#d97706' },
	'Complete':     { fill: '#10b981', stroke: '#059669' }, // green
	'Failed':       { fill: '#ef4444', stroke: '#dc2626' }, // red
	'Error':        { fill: '#ef4444', stroke: '#dc2626' },
	'Stalled':      { fill: '#f97316', stroke: '#ea580c' }, // orange
	'Canceled':     { fill: '#9ca3af', stroke: '#6b7280' }, // gray
	'Abandoned':    { fill: '#9ca3af', stroke: '#6b7280' }
};

const DEFAULT_COLOR = { fill: '#6b7280', stroke: '#4b5563' };

// Layout constants. The view's CSS sets the canvas size; these are the
// internal pixel offsets.
const PADDING_LEFT  = 140;  // room for row labels (capability/beacon)
const PADDING_RIGHT = 16;
const PADDING_TOP   = 24;   // room for time-axis labels
const PADDING_BOT   = 8;
const TOP_BAND_HEIGHT_RATIO = 0.30;
const MIDDLE_BAND_HEIGHT_RATIO = 0.30;
const BOTTOM_BAND_HEIGHT_RATIO = 0.40;
const BAND_GAP = 8;
const ROW_HEIGHT_MIN = 14;

// Public entry point. Pulls all the data out of `pState`, paints the
// canvas, updates the SVG overlay (cursor + focus rect).
function drawTimeline(pCanvas, pSVG, pState)
{
	if (!pCanvas || !pState) return;
	let tmpCtx = pCanvas.getContext('2d');
	if (!tmpCtx) return;

	// Match canvas backing-store size to its CSS size to avoid blur on
	// HiDPI displays. The CSS sizes the element; we set width/height
	// to match * devicePixelRatio.
	let tmpDPR = window.devicePixelRatio || 1;
	let tmpCSSWidth = pCanvas.clientWidth || 800;
	let tmpCSSHeight = pCanvas.clientHeight || 400;
	if (pCanvas.width !== tmpCSSWidth * tmpDPR) { pCanvas.width = tmpCSSWidth * tmpDPR; }
	if (pCanvas.height !== tmpCSSHeight * tmpDPR) { pCanvas.height = tmpCSSHeight * tmpDPR; }
	tmpCtx.setTransform(tmpDPR, 0, 0, tmpDPR, 0, 0);

	// Clear.
	tmpCtx.clearRect(0, 0, tmpCSSWidth, tmpCSSHeight);

	let tmpFromMs = Date.parse(pState.Window.FromIso) || (Date.now() - 120000);
	let tmpToMs   = Date.parse(pState.Window.ToIso)   || (Date.now() + 30000);
	if (tmpToMs <= tmpFromMs) { tmpToMs = tmpFromMs + 1; }
	let tmpNowMs  = Date.parse(pState.Stream.Now) || Date.now();

	let tmpPlot = {
		x0: PADDING_LEFT,
		x1: tmpCSSWidth - PADDING_RIGHT,
		y0: PADDING_TOP,
		y1: tmpCSSHeight - PADDING_BOT,
		fromMs: tmpFromMs,
		toMs:   tmpToMs,
		nowMs:  tmpNowMs,
		dpr:    tmpDPR
	};
	tmpPlot.width  = tmpPlot.x1 - tmpPlot.x0;
	tmpPlot.height = tmpPlot.y1 - tmpPlot.y0;

	// Band Y ranges.
	let tmpBandH = tmpPlot.height - 2 * BAND_GAP;
	let tmpTopH  = Math.max(60, tmpBandH * TOP_BAND_HEIGHT_RATIO);
	let tmpMidH  = Math.max(60, tmpBandH * MIDDLE_BAND_HEIGHT_RATIO);
	let tmpBotH  = Math.max(60, tmpBandH - tmpTopH - tmpMidH);

	let tmpTopY  = tmpPlot.y0;
	let tmpMidY  = tmpTopY + tmpTopH + BAND_GAP;
	let tmpBotY  = tmpMidY + tmpMidH + BAND_GAP;

	// X-axis ticks + future shading.
	_drawTimeAxis(tmpCtx, tmpPlot, tmpCSSWidth, tmpCSSHeight);
	_drawFutureShade(tmpCtx, tmpPlot, tmpTopY, tmpBotY + tmpBotH);

	// Top band — stacked area of queue counts (from Buckets, or
	// computed from raw if no buckets).
	_drawTopBand(tmpCtx, tmpPlot, tmpTopY, tmpTopH, pState);

	// Middle band — capability swimlanes.
	_drawCapabilityBand(tmpCtx, tmpPlot, tmpMidY, tmpMidH, pState);

	// Bottom band — beacon swimlanes.
	_drawBeaconBand(tmpCtx, tmpPlot, tmpBotY, tmpBotH, pState);

	// Now-line marker.
	_drawNowLine(tmpCtx, tmpPlot, tmpTopY, tmpBotY + tmpBotH);

	// Update SVG overlay (cursor + focus rect). We keep these in SVG
	// for crisp lines and easy DOM-driven hover.
	if (pSVG)
	{
		_updateSVGOverlay(pSVG, pState, tmpPlot, tmpCSSWidth, tmpCSSHeight);
	}
}

// ─────────────────────────────────────────────────────────────────────
// Time axis + shading
// ─────────────────────────────────────────────────────────────────────

function _drawTimeAxis(pCtx, pPlot, pWidth, pHeight)
{
	// Pick a tick interval that yields ~6-10 ticks across the visible
	// span. Reasonable steps in seconds.
	let tmpSpanMs = pPlot.toMs - pPlot.fromMs;
	let tmpSteps = [1, 5, 10, 30, 60, 300, 600, 1800, 3600, 21600, 86400];
	let tmpStep = tmpSteps[0] * 1000;
	for (let i = 0; i < tmpSteps.length; i++)
	{
		if (tmpSpanMs / (tmpSteps[i] * 1000) <= 10)
		{
			tmpStep = tmpSteps[i] * 1000;
			break;
		}
		tmpStep = tmpSteps[i] * 1000;
	}

	pCtx.fillStyle = 'rgba(180, 180, 180, 0.7)';
	pCtx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
	pCtx.textBaseline = 'top';
	pCtx.textAlign = 'center';
	pCtx.strokeStyle = 'rgba(180, 180, 180, 0.15)';
	pCtx.lineWidth = 1;

	let tmpStart = Math.ceil(pPlot.fromMs / tmpStep) * tmpStep;
	for (let t = tmpStart; t < pPlot.toMs; t += tmpStep)
	{
		let tmpX = _timeToX(t, pPlot);
		pCtx.beginPath();
		pCtx.moveTo(tmpX, pPlot.y0);
		pCtx.lineTo(tmpX, pPlot.y1);
		pCtx.stroke();
		pCtx.fillText(_formatTime(t, tmpStep), tmpX, 4);
	}
}

function _drawFutureShade(pCtx, pPlot, pYTop, pYBot)
{
	if (pPlot.nowMs >= pPlot.toMs) return;
	if (pPlot.nowMs <= pPlot.fromMs) return;
	let tmpX = _timeToX(pPlot.nowMs, pPlot);
	pCtx.fillStyle = 'rgba(120, 130, 160, 0.06)';
	pCtx.fillRect(tmpX, pYTop, pPlot.x1 - tmpX, pYBot - pYTop);
}

function _drawNowLine(pCtx, pPlot, pYTop, pYBot)
{
	if (pPlot.nowMs < pPlot.fromMs || pPlot.nowMs > pPlot.toMs) return;
	let tmpX = _timeToX(pPlot.nowMs, pPlot);
	pCtx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
	pCtx.lineWidth = 1.5;
	pCtx.setLineDash([4, 3]);
	pCtx.beginPath();
	pCtx.moveTo(tmpX, pYTop);
	pCtx.lineTo(tmpX, pYBot);
	pCtx.stroke();
	pCtx.setLineDash([]);
}

// ─────────────────────────────────────────────────────────────────────
// Top band — stacked area of queue-state counts over time
// ─────────────────────────────────────────────────────────────────────

function _drawTopBand(pCtx, pPlot, pY, pH, pState)
{
	_drawBandLabel(pCtx, 'Queue', pPlot.x0, pY);

	let tmpBuckets = pState.Stream.Buckets;
	let tmpRecords = pState.Stream.Past || [];

	// If we have buckets, use them; otherwise bucket raw records here
	// to a width-derived bucket size.
	let tmpBucketed = tmpBuckets;
	if (!tmpBucketed || tmpBucketed.length === 0)
	{
		tmpBucketed = _clientBucket(tmpRecords, pPlot, 60); // ~60 buckets target
	}
	if (tmpBucketed.length === 0)
	{
		// Empty — draw a baseline.
		pCtx.strokeStyle = 'rgba(180, 180, 180, 0.2)';
		pCtx.lineWidth = 1;
		pCtx.beginPath();
		pCtx.moveTo(pPlot.x0, pY + pH - 1);
		pCtx.lineTo(pPlot.x1, pY + pH - 1);
		pCtx.stroke();
		return;
	}

	// Build stack data: per bucket, count by terminal/active status.
	const tmpStackOrder = ['Pending', 'Dispatched', 'Running', 'Complete', 'Failed', 'Stalled'];
	let tmpStackByBucket = tmpBucketed.map(function (pB)
	{
		let tmpRow = {};
		let tmpStatuses = pB.ByStatus || {};
		let tmpTypes = pB.ByEventType || {};
		// Some columns come through ByEventType (e.g. Enqueued maps to
		// Pending in the queue-state sense). Fold both into stack rows.
		tmpRow.Pending    = (tmpTypes.Enqueued    || 0);
		tmpRow.Dispatched = (tmpTypes.Dispatched  || 0) + (tmpStatuses.Dispatched || 0);
		tmpRow.Running    = (tmpStatuses.Running  || 0);
		tmpRow.Complete   = (tmpTypes.Completed   || 0) + (tmpTypes['Execution.ExecutionComplete'] || 0);
		tmpRow.Failed     = (tmpTypes.Failed      || 0);
		tmpRow.Stalled    = (tmpTypes.Stalled     || 0) + (tmpTypes['Workitem.Stranded'] || 0);
		tmpRow.At = pB.At;
		return tmpRow;
	});

	// Find max stacked total.
	let tmpMax = 1;
	for (let i = 0; i < tmpStackByBucket.length; i++)
	{
		let tmpSum = 0;
		for (let j = 0; j < tmpStackOrder.length; j++)
		{
			tmpSum += tmpStackByBucket[i][tmpStackOrder[j]] || 0;
		}
		if (tmpSum > tmpMax) tmpMax = tmpSum;
	}

	// Stack each bucket as a column of segments. Per-bucket DurationMs
	// (carried in the server response and in _clientBucket output)
	// drives column width — using consecutive bucket spacing breaks
	// when the server omits empty buckets (which it does), so a 1s
	// bucket sitting next to a 6s gap would render 6s wide.
	for (let i = 0; i < tmpBucketed.length; i++)
	{
		let tmpRow = tmpStackByBucket[i];
		let tmpBucketStartMs = Date.parse(tmpRow.At);
		if (!Number.isFinite(tmpBucketStartMs)) continue;
		let tmpBucketDur = tmpBucketed[i].DurationMs || 1000;
		let tmpColWidth = (tmpBucketDur / (pPlot.toMs - pPlot.fromMs)) * pPlot.width;
		if (tmpColWidth < 1) tmpColWidth = 1;
		// Inset 1px on each side so columns visually separate even
		// when adjacent buckets touch — turns "stacked area" into
		// "stacked column chart" without server changes.
		let tmpInset = (tmpColWidth > 4) ? 1 : 0;
		let tmpX = _timeToX(tmpBucketStartMs, pPlot) + tmpInset;
		let tmpDrawW = Math.max(1, tmpColWidth - 2 * tmpInset);
		let tmpYAccum = pY + pH;
		for (let j = 0; j < tmpStackOrder.length; j++)
		{
			let tmpKey = tmpStackOrder[j];
			let tmpVal = tmpRow[tmpKey] || 0;
			if (tmpVal === 0) continue;
			let tmpSegH = (tmpVal / tmpMax) * pH;
			let tmpColor = _statusColor(tmpKey);
			pCtx.fillStyle = tmpColor.fill;
			pCtx.fillRect(tmpX, tmpYAccum - tmpSegH, tmpDrawW, tmpSegH);
			tmpYAccum -= tmpSegH;
		}
	}

	// Y-axis label (max count).
	pCtx.fillStyle = 'rgba(180, 180, 180, 0.6)';
	pCtx.font = '10px monospace';
	pCtx.textBaseline = 'top';
	pCtx.textAlign = 'left';
	pCtx.fillText('max ' + tmpMax, pPlot.x0 + 4, pY + 2);
}

// Bucket raw records client-side when the endpoint returned raw mode.
//
// Bucket boundaries are anchored to ABSOLUTE epoch time (snapped to the
// nearest "nice" interval at or below the target bucket size), NOT to
// pPlot.fromMs. Anchoring to fromMs causes the same record to land in
// different buckets every time the window slides, which makes the
// histogram visibly hop around mid-drag. Absolute-time anchoring means
// records keep their bucket through any pan / zoom — the histogram
// just slides along with the time axis.
function _clientBucket(pRecords, pPlot, pTargetCount)
{
	if (!pRecords || pRecords.length === 0) return [];
	let tmpRawBucketMs = (pPlot.toMs - pPlot.fromMs) / pTargetCount;
	if (tmpRawBucketMs <= 0) tmpRawBucketMs = 1000;
	let tmpBucketMs = _snapBucketSize(tmpRawBucketMs);
	let tmpBuckets = new Map();
	for (let i = 0; i < pRecords.length; i++)
	{
		let tmpAt = Date.parse(pRecords[i].At);
		if (!Number.isFinite(tmpAt)) continue;
		// Snap to absolute epoch boundary, not to fromMs.
		let tmpStart = Math.floor(tmpAt / tmpBucketMs) * tmpBucketMs;
		let tmpKey = String(tmpStart);
		if (!tmpBuckets.has(tmpKey))
		{
			tmpBuckets.set(tmpKey, {
				At: new Date(tmpStart).toISOString(),
				DurationMs: tmpBucketMs,
				Count: 0, ByEventType: {}, ByCapability: {}, ByStatus: {}
			});
		}
		let tmpB = tmpBuckets.get(tmpKey);
		tmpB.Count++;
		let tmpET = pRecords[i].EventType || 'Unknown';
		let tmpC  = pRecords[i].Capability;
		let tmpS  = pRecords[i].Status;
		tmpB.ByEventType[tmpET] = (tmpB.ByEventType[tmpET] || 0) + 1;
		if (tmpC) { tmpB.ByCapability[tmpC] = (tmpB.ByCapability[tmpC] || 0) + 1; }
		if (tmpS) { tmpB.ByStatus[tmpS] = (tmpB.ByStatus[tmpS] || 0) + 1; }
	}
	let tmpOut = [];
	tmpBuckets.forEach(function (pB) { tmpOut.push(pB); });
	tmpOut.sort(function (pA, pB) { return pA.At < pB.At ? -1 : pA.At > pB.At ? 1 : 0; });
	return tmpOut;
}

// Snap a raw target bucket size (ms) DOWN to the largest "nice"
// step at or below it. Nice = something a clock displays cleanly
// (multiples of 1s, 5s, 10s, 30s, 1m, 5m, 10m, 30m, 1h, 6h, 1d).
// Snapping down means the visualization is at least as detailed as
// requested; snapping at all means bucket boundaries land on
// human-readable times.
function _snapBucketSize(pRawMs)
{
	const STEPS_MS =
	[
		1000,           // 1s
		5000,           // 5s
		10000,          // 10s
		30000,          // 30s
		60000,          // 1m
		300000,         // 5m
		600000,         // 10m
		1800000,        // 30m
		3600000,        // 1h
		21600000,       // 6h
		86400000        // 1d
	];
	let tmpPick = STEPS_MS[0];
	for (let i = 0; i < STEPS_MS.length; i++)
	{
		if (STEPS_MS[i] <= pRawMs) { tmpPick = STEPS_MS[i]; }
		else { break; }
	}
	return tmpPick;
}

// ─────────────────────────────────────────────────────────────────────
// Middle band — capability swimlanes
// ─────────────────────────────────────────────────────────────────────

function _drawCapabilityBand(pCtx, pPlot, pY, pH, pState)
{
	_drawBandLabel(pCtx, 'Capability', pPlot.x0, pY);
	let tmpRows = pState.CapabilityRows || [];
	if (tmpRows.length === 0)
	{
		_drawBandEmpty(pCtx, pPlot, pY, pH, '(no capability activity)');
		return;
	}
	// Build a BeaconID → Capability lookup from any record that
	// carries both. Many envelope projections (queue.completed in
	// particular) only carry BeaconID, not Capability, so without
	// this lookup the capability band would render empty even when
	// the beacon band is busy. The two are by definition isomorphic
	// for the duration of a work item.
	let tmpBeaconCap = _buildBeaconCapabilityIndex(pState);
	let tmpRowH = Math.max(ROW_HEIGHT_MIN, Math.floor(pH / tmpRows.length));
	for (let i = 0; i < tmpRows.length; i++)
	{
		let tmpY = pY + i * tmpRowH;
		_drawRowLabel(pCtx, tmpRows[i].Capability, pPlot.x0, tmpY, tmpRowH);
		_drawRowSeparator(pCtx, pPlot, tmpY + tmpRowH);
		_drawCapabilityRow(pCtx, pPlot, tmpY, tmpRowH, tmpRows[i].Capability, pState, tmpBeaconCap);
	}
}

function _buildBeaconCapabilityIndex(pState)
{
	let tmpIdx = new Map();
	let fScan = function (pRecords)
	{
		for (let i = 0; i < pRecords.length; i++)
		{
			let tmpR = pRecords[i];
			if (!tmpR || !tmpR.BeaconID || !tmpR.Capability) continue;
			tmpIdx.set(tmpR.BeaconID, tmpR.Capability);
		}
	};
	fScan(pState.Stream.Past || []);
	fScan(pState.Stream.Present || []);
	fScan(pState.Stream.Future || []);
	return tmpIdx;
}

function _drawCapabilityRow(pCtx, pPlot, pY, pH, pCapability, pState, pBeaconCap)
{
	let tmpStream = pState.Stream;

	// Past — render only records that represent ACTUAL OCCUPANCY:
	// terminal events (Completed/Failed/Stalled/Canceled) carry a
	// DurationMs; render their actual span as [At - DurationMs, At].
	// Skip point events (Enqueued, Dispatched without duration) — they
	// don't represent the beacon being busy, just notifications about
	// state changes, and they render as 1px slivers that drown the band.
	//
	// For records missing Capability (queue.completed envelopes are a
	// common offender), fall back to the BeaconID → Capability index
	// the band built above.
	let tmpPast = tmpStream.Past || [];
	for (let i = 0; i < tmpPast.length; i++)
	{
		let tmpR = tmpPast[i];
		if (!tmpR) continue;
		let tmpCap = tmpR.Capability || (pBeaconCap && tmpR.BeaconID ? pBeaconCap.get(tmpR.BeaconID) : '');
		if (tmpCap !== pCapability) continue;
		if (!(tmpR.DurationMs > 0)) continue;
		let tmpEndMs = Date.parse(tmpR.At);
		if (!Number.isFinite(tmpEndMs)) continue;
		let tmpStartMs = tmpEndMs - tmpR.DurationMs;
		let tmpX0 = _timeToX(tmpStartMs, pPlot);
		let tmpX1 = Math.max(tmpX0 + 2, _timeToX(tmpEndMs, pPlot));
		let tmpColor = _statusColor(tmpR.Status || tmpR.EventType);
		pCtx.fillStyle = _withAlpha(tmpColor.fill, 0.65);
		pCtx.fillRect(tmpX0, pY + 2, tmpX1 - tmpX0, pH - 4);
	}

	// Present — open-ended spans from DispatchedAt through "now".
	let tmpPresent = tmpStream.Present || [];
	for (let i = 0; i < tmpPresent.length; i++)
	{
		let tmpR = tmpPresent[i];
		if (!tmpR || tmpR.Capability !== pCapability) continue;
		let tmpAt    = Date.parse(tmpR.At);
		let tmpEndAt = Date.parse(tmpR.EndAt) || tmpAt;
		if (!Number.isFinite(tmpAt)) continue;
		let tmpX0 = _timeToX(tmpAt, pPlot);
		let tmpX1 = Math.max(tmpX0 + 2, _timeToX(tmpEndAt, pPlot));
		let tmpColor = _statusColor(tmpR.Status || 'Running');
		pCtx.fillStyle = _withAlpha(tmpColor.fill, 0.95);
		pCtx.fillRect(tmpX0, pY + 2, tmpX1 - tmpX0, pH - 4);
	}

	// Future predictions. Filter to this capability and cap to a
	// small number — server gives us up to 32 per capability (1s
	// stagger × 32 = a 48s wall of solid color in a 30s window).
	// 6 visible predictions is enough to convey "queue is deep here."
	let tmpFutureForCap = [];
	let tmpFuture = tmpStream.Future || [];
	for (let i = 0; i < tmpFuture.length; i++)
	{
		if (tmpFuture[i] && tmpFuture[i].Capability === pCapability)
		{
			tmpFutureForCap.push(tmpFuture[i]);
		}
	}
	const FUTURE_RENDER_CAP = 6;
	let tmpFutureRender = tmpFutureForCap.slice(0, FUTURE_RENDER_CAP);
	for (let i = 0; i < tmpFutureRender.length; i++)
	{
		let tmpR = tmpFutureRender[i];
		let tmpAt = Date.parse(tmpR.PredictedAtIso || tmpR.At);
		if (!Number.isFinite(tmpAt)) continue;
		let tmpDur = Number.isFinite(tmpR.DurationMs) ? tmpR.DurationMs : 1000;
		let tmpX0 = _timeToX(tmpAt, pPlot);
		let tmpX1 = Math.max(tmpX0 + 2, _timeToX(tmpAt + tmpDur, pPlot));
		let tmpConf = Number.isFinite(tmpR.PredictionConfidence) ? tmpR.PredictionConfidence : 0;
		// Hard alpha cap at 0.18 — predictions are advisory, not facts.
		// Without this, sequential predictions stack visually into a
		// solid block.
		let tmpAlpha = Math.max(0.05, Math.min(0.18, tmpConf * 0.18));
		let tmpColor = _statusColor('Dispatched');
		pCtx.fillStyle = _withAlpha(tmpColor.fill, tmpAlpha);
		// Inset 1px on each side and 4px vertically so each prediction
		// is visually distinct from its neighbors.
		let tmpDrawW = Math.max(1, (tmpX1 - tmpX0) - 2);
		pCtx.fillRect(tmpX0 + 1, pY + 4, tmpDrawW, pH - 8);
		// Dashed top border to mark this as predicted, not actual.
		pCtx.strokeStyle = _withAlpha(tmpColor.stroke, tmpAlpha * 2);
		pCtx.lineWidth = 0.5;
		pCtx.setLineDash([2, 2]);
		pCtx.strokeRect(tmpX0 + 1, pY + 4, tmpDrawW, pH - 8);
		pCtx.setLineDash([]);
	}

	// Tally text: "+N more queued" when we trimmed.
	if (tmpFutureForCap.length > FUTURE_RENDER_CAP)
	{
		let tmpExtra = tmpFutureForCap.length - FUTURE_RENDER_CAP;
		pCtx.fillStyle = 'rgba(180, 180, 180, 0.55)';
		pCtx.font = '10px monospace';
		pCtx.textBaseline = 'middle';
		pCtx.textAlign = 'left';
		pCtx.fillText('+' + tmpExtra + ' queued', pPlot.x1 - 78, pY + pH / 2);
	}
}

// ─────────────────────────────────────────────────────────────────────
// Bottom band — beacon swimlanes
// ─────────────────────────────────────────────────────────────────────

function _drawBeaconBand(pCtx, pPlot, pY, pH, pState)
{
	_drawBandLabel(pCtx, 'Beacon', pPlot.x0, pY);
	let tmpRows = pState.BeaconRows || [];
	if (tmpRows.length === 0)
	{
		_drawBandEmpty(pCtx, pPlot, pY, pH, '(no beacon activity)');
		return;
	}
	let tmpRowH = Math.max(ROW_HEIGHT_MIN, Math.floor(pH / tmpRows.length));
	for (let i = 0; i < tmpRows.length; i++)
	{
		let tmpY = pY + i * tmpRowH;
		_drawRowLabel(pCtx, tmpRows[i].Display, pPlot.x0, tmpY, tmpRowH);
		_drawRowSeparator(pCtx, pPlot, tmpY + tmpRowH);
		_drawBeaconRow(pCtx, pPlot, tmpY, tmpRowH, tmpRows[i].BeaconID, pState);
	}
}

function _drawBeaconRow(pCtx, pPlot, pY, pH, pBeaconID, pState)
{
	let tmpStream = pState.Stream;

	// Past — beacon work-item occupancy. Same shape as the capability
	// band: terminal events with DurationMs > 0 render as their actual
	// running span [At - DurationMs, At]; point events (Enqueued,
	// Dispatched-without-duration) are skipped. Without this filter,
	// every state-change event renders as a 1px sliver and the band
	// turns into noise.
	let tmpPast = tmpStream.Past || [];
	for (let i = 0; i < tmpPast.length; i++)
	{
		let tmpR = tmpPast[i];
		if (!tmpR || tmpR.BeaconID !== pBeaconID) continue;
		if (!(tmpR.DurationMs > 0)) continue;
		let tmpEndMs = Date.parse(tmpR.At);
		if (!Number.isFinite(tmpEndMs)) continue;
		let tmpStartMs = tmpEndMs - tmpR.DurationMs;
		let tmpX0 = _timeToX(tmpStartMs, pPlot);
		let tmpX1 = Math.max(tmpX0 + 3, _timeToX(tmpEndMs, pPlot));
		let tmpColor = _statusColor(tmpR.Status || tmpR.EventType);
		pCtx.fillStyle = _withAlpha(tmpColor.fill, 0.75);
		pCtx.fillRect(tmpX0, pY + 2, tmpX1 - tmpX0, pH - 4);
		pCtx.strokeStyle = _withAlpha(tmpColor.stroke, 0.85);
		pCtx.lineWidth = 0.5;
		pCtx.strokeRect(tmpX0, pY + 2, tmpX1 - tmpX0, pH - 4);
	}

	// Present — open-ended spans (DispatchedAt → now) for in-flight items.
	let tmpPresent = tmpStream.Present || [];
	for (let i = 0; i < tmpPresent.length; i++)
	{
		let tmpR = tmpPresent[i];
		if (!tmpR || tmpR.BeaconID !== pBeaconID) continue;
		let tmpAt    = Date.parse(tmpR.At);
		let tmpEndAt = Date.parse(tmpR.EndAt) || tmpAt;
		if (!Number.isFinite(tmpAt)) continue;
		let tmpX0 = _timeToX(tmpAt, pPlot);
		let tmpX1 = Math.max(tmpX0 + 3, _timeToX(tmpEndAt, pPlot));
		let tmpColor = _statusColor(tmpR.Status || 'Running');
		pCtx.fillStyle = _withAlpha(tmpColor.fill, 1.0);
		pCtx.fillRect(tmpX0, pY + 2, tmpX1 - tmpX0, pH - 4);
		pCtx.strokeStyle = _withAlpha(tmpColor.stroke, 1.0);
		pCtx.lineWidth = 0.5;
		pCtx.strokeRect(tmpX0, pY + 2, tmpX1 - tmpX0, pH - 4);
	}
}

// ─────────────────────────────────────────────────────────────────────
// SVG overlay — focus rect + (later) hover tooltip
// ─────────────────────────────────────────────────────────────────────

function _updateSVGOverlay(pSVG, pState, pPlot, pCSSWidth, pCSSHeight)
{
	pSVG.setAttribute('width',  pCSSWidth);
	pSVG.setAttribute('height', pCSSHeight);
	pSVG.setAttribute('viewBox', '0 0 ' + pCSSWidth + ' ' + pCSSHeight);

	// Focus rectangle (when AppData.Timeline.Focus is set).
	let tmpFocusRect = pSVG.querySelector('[data-role="focus-rect"]');
	if (!tmpFocusRect)
	{
		tmpFocusRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		tmpFocusRect.setAttribute('data-role', 'focus-rect');
		tmpFocusRect.setAttribute('fill', 'none');
		tmpFocusRect.setAttribute('stroke', '#fbbf24');
		tmpFocusRect.setAttribute('stroke-width', '2');
		tmpFocusRect.setAttribute('rx', '3');
		tmpFocusRect.setAttribute('pointer-events', 'none');
		pSVG.appendChild(tmpFocusRect);
	}
	if (pState.Focus && pState.Focus.Hash)
	{
		// Geometry resolution depends on what kind of focus and where
		// the matching record landed. Stage 1: just hide it; Pillar 4
		// wires the click-to-focus selector and computes the rect.
		tmpFocusRect.setAttribute('display', 'none');
	}
	else
	{
		tmpFocusRect.setAttribute('display', 'none');
	}
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function _timeToX(pTimeMs, pPlot)
{
	let tmpFrac = (pTimeMs - pPlot.fromMs) / (pPlot.toMs - pPlot.fromMs);
	if (tmpFrac < 0) tmpFrac = 0;
	if (tmpFrac > 1) tmpFrac = 1;
	return pPlot.x0 + tmpFrac * pPlot.width;
}

function _statusColor(pStatusOrType)
{
	if (!pStatusOrType) return DEFAULT_COLOR;
	return STATUS_COLORS[pStatusOrType] || DEFAULT_COLOR;
}

function _withAlpha(pHex, pAlpha)
{
	// Convert "#RRGGBB" to "rgba(r,g,b,a)". Falls through if not hex.
	if (typeof pHex !== 'string' || pHex.charAt(0) !== '#' || pHex.length !== 7) { return pHex; }
	let tmpR = parseInt(pHex.slice(1, 3), 16);
	let tmpG = parseInt(pHex.slice(3, 5), 16);
	let tmpB = parseInt(pHex.slice(5, 7), 16);
	return 'rgba(' + tmpR + ',' + tmpG + ',' + tmpB + ',' + pAlpha + ')';
}

function _drawBandLabel(pCtx, pLabel, pX, pY)
{
	pCtx.fillStyle = 'rgba(200, 200, 200, 0.5)';
	pCtx.font = '600 10px -apple-system, sans-serif';
	pCtx.textBaseline = 'top';
	pCtx.textAlign = 'left';
	pCtx.fillText(pLabel.toUpperCase(), 8, pY + 2);
}

function _drawBandEmpty(pCtx, pPlot, pY, pH, pMsg)
{
	pCtx.fillStyle = 'rgba(150, 150, 150, 0.4)';
	pCtx.font = '11px -apple-system, sans-serif';
	pCtx.textBaseline = 'middle';
	pCtx.textAlign = 'center';
	pCtx.fillText(pMsg, (pPlot.x0 + pPlot.x1) / 2, pY + pH / 2);
}

function _drawRowLabel(pCtx, pLabel, pXLeft, pY, pH)
{
	pCtx.fillStyle = 'rgba(200, 200, 200, 0.75)';
	pCtx.font = '11px -apple-system, sans-serif';
	pCtx.textBaseline = 'middle';
	pCtx.textAlign = 'right';
	pCtx.fillText(pLabel, pXLeft - 8, pY + pH / 2);
}

function _drawRowSeparator(pCtx, pPlot, pY)
{
	pCtx.strokeStyle = 'rgba(180, 180, 180, 0.08)';
	pCtx.lineWidth = 1;
	pCtx.beginPath();
	pCtx.moveTo(pPlot.x0, pY);
	pCtx.lineTo(pPlot.x1, pY);
	pCtx.stroke();
}

function _formatTime(pMs, pStepMs)
{
	let tmpD = new Date(pMs);
	if (pStepMs >= 86400000) // ≥1d
	{
		return tmpD.toISOString().slice(5, 10);  // MM-DD
	}
	if (pStepMs >= 3600000)  // ≥1h
	{
		return tmpD.toISOString().slice(11, 16); // HH:MM
	}
	if (pStepMs >= 60000)    // ≥1m
	{
		return tmpD.toISOString().slice(11, 16); // HH:MM
	}
	return tmpD.toISOString().slice(11, 19);     // HH:MM:SS
}

// ─────────────────────────────────────────────────────────────────────
// Hit-test: given a click at (pX, pY) on the canvas, return the
// nearest record (or null). Used by Pillar 4 click-to-focus.
// ─────────────────────────────────────────────────────────────────────

function hitTest(pX, pY, pState, pCanvas)
{
	if (!pCanvas) return null;
	let tmpFromMs = Date.parse(pState.Window.FromIso) || (Date.now() - 120000);
	let tmpToMs   = Date.parse(pState.Window.ToIso)   || (Date.now() + 30000);
	let tmpPlot = {
		x0: PADDING_LEFT,
		x1: pCanvas.clientWidth - PADDING_RIGHT,
		y0: PADDING_TOP,
		y1: pCanvas.clientHeight - PADDING_BOT,
		fromMs: tmpFromMs, toMs: tmpToMs
	};
	tmpPlot.width = tmpPlot.x1 - tmpPlot.x0;

	if (pX < tmpPlot.x0 || pX > tmpPlot.x1) return null;
	let tmpFrac = (pX - tmpPlot.x0) / tmpPlot.width;
	let tmpAtMs = tmpFromMs + tmpFrac * (tmpToMs - tmpFromMs);

	// Find the closest record by At within ±2% of the window.
	let tmpTolerance = 0.02 * (tmpToMs - tmpFromMs);
	let tmpAll = []
		.concat(pState.Stream.Past || [])
		.concat(pState.Stream.Present || [])
		.concat(pState.Stream.Future || []);
	let tmpBest = null;
	let tmpBestDist = Infinity;
	for (let i = 0; i < tmpAll.length; i++)
	{
		let tmpRecAt = Date.parse(tmpAll[i].At);
		if (!Number.isFinite(tmpRecAt)) continue;
		let tmpDist = Math.abs(tmpRecAt - tmpAtMs);
		if (tmpDist < tmpBestDist && tmpDist <= tmpTolerance)
		{
			tmpBestDist = tmpDist;
			tmpBest = tmpAll[i];
		}
	}
	return tmpBest;
}

module.exports =
{
	drawTimeline: drawTimeline,
	hitTest:      hitTest
};
