/**
 * render-heatmap.js
 *
 * Imperative canvas renderer for the capability heat map view. Pure
 * function — given a state object + canvas DOM node, paints the grid.
 *
 * State shape:
 *   {
 *     Window: { FromIso, ToIso },
 *     Buckets: [{ At, DurationMs, ByCapability: { Loader: N, ... } }],
 *     Capacities: { Loader: { ActiveMax, Capacity }, ... },
 *     Capabilities: [Loader, DI, ...] // ordered, one row each
 *   }
 *
 * Each cell color is graded from idle (transparent) → saturated (full
 * `--uv-warning`). The intensity = active workers in the bucket /
 * capacity for that capability. > 1.0 (oversubscribed) gets a red
 * accent.
 */

const PADDING_LEFT  = 160;
const PADDING_RIGHT = 24;
const PADDING_TOP   = 36;
const PADDING_BOT   = 28;
const ROW_HEIGHT_MIN = 18;
const ROW_GAP = 1;

function drawHeatMap(pCanvas, pState)
{
	if (!pCanvas || !pState) return;
	let tmpCtx = pCanvas.getContext('2d');
	if (!tmpCtx) return;

	let tmpDPR = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
	let tmpCSSWidth = pCanvas.clientWidth || 800;
	let tmpCSSHeight = pCanvas.clientHeight || 400;
	if (pCanvas.width !== tmpCSSWidth * tmpDPR) { pCanvas.width = tmpCSSWidth * tmpDPR; }
	if (pCanvas.height !== tmpCSSHeight * tmpDPR) { pCanvas.height = tmpCSSHeight * tmpDPR; }
	tmpCtx.setTransform(tmpDPR, 0, 0, tmpDPR, 0, 0);
	tmpCtx.clearRect(0, 0, tmpCSSWidth, tmpCSSHeight);

	let tmpFromMs = Date.parse(pState.Window.FromIso) || (Date.now() - 60 * 60 * 1000);
	let tmpToMs   = Date.parse(pState.Window.ToIso)   || Date.now();
	if (tmpToMs <= tmpFromMs) tmpToMs = tmpFromMs + 1;

	let tmpCaps = Array.isArray(pState.Capabilities) ? pState.Capabilities.slice() : [];
	if (tmpCaps.length === 0)
	{
		_drawEmpty(tmpCtx, tmpCSSWidth, tmpCSSHeight, '(no capability activity in this window)');
		_drawTimeAxis(tmpCtx, { fromMs: tmpFromMs, toMs: tmpToMs, x0: PADDING_LEFT, x1: tmpCSSWidth - PADDING_RIGHT, y0: PADDING_TOP, y1: tmpCSSHeight - PADDING_BOT });
		return;
	}

	let tmpRowH = Math.max(ROW_HEIGHT_MIN,
		Math.floor((tmpCSSHeight - PADDING_TOP - PADDING_BOT) / tmpCaps.length) - ROW_GAP);

	let tmpPlot = {
		x0: PADDING_LEFT,
		x1: tmpCSSWidth - PADDING_RIGHT,
		y0: PADDING_TOP,
		y1: tmpCSSHeight - PADDING_BOT,
		fromMs: tmpFromMs,
		toMs:   tmpToMs
	};
	tmpPlot.width = tmpPlot.x1 - tmpPlot.x0;

	_drawTimeAxis(tmpCtx, tmpPlot);

	// Compute peak across ALL cells; use it as the saturation reference
	// when capacity is unknown for that capability.
	let tmpBuckets = Array.isArray(pState.Buckets) ? pState.Buckets : [];
	let tmpGlobalPeak = 1;
	for (let i = 0; i < tmpBuckets.length; i++)
	{
		let tmpByCap = tmpBuckets[i].ByCapability || {};
		for (let j = 0; j < tmpCaps.length; j++)
		{
			let tmpV = tmpByCap[tmpCaps[j]] || 0;
			if (tmpV > tmpGlobalPeak) { tmpGlobalPeak = tmpV; }
		}
	}

	// Draw rows.
	for (let i = 0; i < tmpCaps.length; i++)
	{
		let tmpY = tmpPlot.y0 + i * (tmpRowH + ROW_GAP);
		let tmpCap = tmpCaps[i];
		_drawRow(tmpCtx, tmpPlot, tmpY, tmpRowH, tmpCap, tmpBuckets, pState.Capacities, tmpGlobalPeak);
	}

	// Legend.
	_drawLegend(tmpCtx, tmpCSSWidth, tmpCSSHeight, tmpGlobalPeak);
}

function _drawRow(pCtx, pPlot, pY, pH, pCapability, pBuckets, pCapacities, pGlobalPeak)
{
	// Row label.
	pCtx.fillStyle = 'rgba(220, 220, 220, 0.85)';
	pCtx.font = '11px -apple-system, sans-serif';
	pCtx.textBaseline = 'middle';
	pCtx.textAlign = 'right';
	pCtx.fillText(pCapability, pPlot.x0 - 10, pY + pH / 2);

	// Capacity label (small, dimmer) below the cap name.
	let tmpCap = (pCapacities && pCapacities[pCapability]) || null;
	let tmpCapLabel = tmpCap && tmpCap.Capacity > 0 ? ('cap ' + tmpCap.Capacity) : 'cap ?';
	pCtx.fillStyle = 'rgba(160, 160, 160, 0.5)';
	pCtx.font = '9px monospace';
	pCtx.fillText(tmpCapLabel, pPlot.x0 - 10, pY + pH / 2 + 8);

	// Track outline.
	pCtx.fillStyle = 'rgba(180, 180, 180, 0.04)';
	pCtx.fillRect(pPlot.x0, pY, pPlot.width, pH);

	// Cells.
	for (let i = 0; i < pBuckets.length; i++)
	{
		let tmpB = pBuckets[i];
		let tmpAtMs = Date.parse(tmpB.At);
		if (!Number.isFinite(tmpAtMs)) continue;
		let tmpDur = tmpB.DurationMs || 1000;
		let tmpEndMs = tmpAtMs + tmpDur;
		if (tmpEndMs < pPlot.fromMs || tmpAtMs > pPlot.toMs) continue;
		let tmpX0 = _timeToX(tmpAtMs, pPlot);
		let tmpX1 = _timeToX(tmpEndMs, pPlot);
		if (tmpX1 - tmpX0 < 1) tmpX1 = tmpX0 + 1;
		let tmpVal = (tmpB.ByCapability && tmpB.ByCapability[pCapability]) || 0;
		if (tmpVal === 0) continue;

		let tmpCapacity = tmpCap && tmpCap.Capacity > 0 ? tmpCap.Capacity : pGlobalPeak;
		let tmpUtil = tmpCapacity > 0 ? tmpVal / tmpCapacity : 0;
		if (tmpUtil > 1.5) tmpUtil = 1.5;
		// Color ramp: 0 → blue (cool), 0.5 → amber (warm), >1 → red.
		pCtx.fillStyle = _utilToColor(tmpUtil);
		pCtx.fillRect(tmpX0, pY + 1, tmpX1 - tmpX0, pH - 2);
	}
}

function _utilToColor(pUtil)
{
	// 0..0.5  blue → amber
	// 0.5..1  amber → red-orange
	// >1      red, intense
	let tmpA = Math.min(0.92, 0.18 + pUtil * 0.5);
	if (pUtil < 0.5)
	{
		// 59,130,246 (blue) → 245,158,11 (amber)
		let tmpT = pUtil / 0.5;
		let tmpR = Math.round(59  + (245 - 59 ) * tmpT);
		let tmpG = Math.round(130 + (158 - 130) * tmpT);
		let tmpB = Math.round(246 + (11  - 246) * tmpT);
		return 'rgba(' + tmpR + ',' + tmpG + ',' + tmpB + ',' + tmpA + ')';
	}
	if (pUtil <= 1)
	{
		// amber → red-orange (239,68,68)
		let tmpT = (pUtil - 0.5) / 0.5;
		let tmpR = Math.round(245 + (239 - 245) * tmpT);
		let tmpG = Math.round(158 + (68  - 158) * tmpT);
		let tmpB = Math.round(11  + (68  - 11)  * tmpT);
		return 'rgba(' + tmpR + ',' + tmpG + ',' + tmpB + ',' + tmpA + ')';
	}
	// Oversubscribed — saturated red.
	return 'rgba(220, 38, 38, ' + Math.min(1, 0.85 + (pUtil - 1) * 0.1) + ')';
}

function _drawTimeAxis(pCtx, pPlot)
{
	let tmpSpan = pPlot.toMs - pPlot.fromMs;
	let tmpSteps = [1, 5, 30, 60, 300, 600, 1800, 3600, 21600, 86400];
	let tmpStep = tmpSteps[0] * 1000;
	for (let i = 0; i < tmpSteps.length; i++)
	{
		if (tmpSpan / (tmpSteps[i] * 1000) <= 10)
		{
			tmpStep = tmpSteps[i] * 1000;
			break;
		}
		tmpStep = tmpSteps[i] * 1000;
	}
	pCtx.fillStyle = 'rgba(180, 180, 180, 0.7)';
	pCtx.font = '11px -apple-system, sans-serif';
	pCtx.textBaseline = 'top';
	pCtx.textAlign = 'center';
	pCtx.strokeStyle = 'rgba(180, 180, 180, 0.10)';
	pCtx.lineWidth = 1;
	let tmpStart = Math.ceil(pPlot.fromMs / tmpStep) * tmpStep;
	for (let t = tmpStart; t < pPlot.toMs; t += tmpStep)
	{
		let tmpX = _timeToX(t, pPlot);
		pCtx.beginPath();
		pCtx.moveTo(tmpX, pPlot.y0);
		pCtx.lineTo(tmpX, pPlot.y1);
		pCtx.stroke();
		pCtx.fillText(_formatTime(t, tmpStep), tmpX, 8);
	}
}

function _drawLegend(pCtx, pW, pH, pPeak)
{
	let tmpY = pH - 20;
	pCtx.fillStyle = 'rgba(180, 180, 180, 0.6)';
	pCtx.font = '10px -apple-system, sans-serif';
	pCtx.textBaseline = 'middle';
	pCtx.textAlign = 'left';
	pCtx.fillText('idle', PADDING_LEFT, tmpY);
	let tmpLegendX = PADDING_LEFT + 30;
	let tmpLegendW = 220;
	for (let i = 0; i < tmpLegendW; i++)
	{
		let tmpUtil = i / tmpLegendW * 1.4;
		pCtx.fillStyle = _utilToColor(tmpUtil);
		pCtx.fillRect(tmpLegendX + i, tmpY - 6, 1, 12);
	}
	pCtx.fillStyle = 'rgba(180, 180, 180, 0.6)';
	pCtx.fillText('saturated · oversubscribed', tmpLegendX + tmpLegendW + 8, tmpY);
	if (pPeak > 1)
	{
		pCtx.textAlign = 'right';
		pCtx.fillText('peak: ' + pPeak + ' active', pW - PADDING_RIGHT, tmpY);
	}
}

function _drawEmpty(pCtx, pW, pH, pMsg)
{
	pCtx.fillStyle = 'rgba(150, 150, 150, 0.55)';
	pCtx.font = '12px -apple-system, sans-serif';
	pCtx.textAlign = 'center';
	pCtx.textBaseline = 'middle';
	pCtx.fillText(pMsg, pW / 2, pH / 2);
}

function _timeToX(pMs, pPlot)
{
	let tmpFrac = (pMs - pPlot.fromMs) / (pPlot.toMs - pPlot.fromMs);
	if (tmpFrac < 0) tmpFrac = 0;
	if (tmpFrac > 1) tmpFrac = 1;
	return pPlot.x0 + tmpFrac * pPlot.width;
}

function _formatTime(pMs, pStepMs)
{
	let tmpD = new Date(pMs);
	if (pStepMs >= 86400000) return tmpD.toISOString().slice(5, 10);
	if (pStepMs >= 3600000)  return tmpD.toISOString().slice(11, 16);
	if (pStepMs >= 60000)    return tmpD.toISOString().slice(11, 16);
	return tmpD.toISOString().slice(11, 19);
}

module.exports =
{
	drawHeatMap: drawHeatMap
};
