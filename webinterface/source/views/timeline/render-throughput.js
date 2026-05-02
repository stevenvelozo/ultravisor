/**
 * render-throughput.js
 *
 * Renders the throughput chart: stacked-area of completion counts per
 * bucket by terminal status, plus a vertical-band marker for backpressure
 * windows where Admission.Denied events fired.
 *
 * State:
 *   {
 *     Window: { FromIso, ToIso },
 *     Buckets: [{ At, DurationMs, ByEventType, ByStatus }],
 *     Now: ISO string
 *   }
 *
 * Stack order (bottom→top): Complete, Failed, Stalled, Canceled.
 * Admission denials render as red vertical strips behind the stack.
 */

const STACK_KEYS = ['Complete', 'Failed', 'Stalled', 'Canceled'];
const STACK_COLORS =
{
	Complete: 'rgba(16, 185, 129, 0.85)',
	Failed:   'rgba(239,  68,  68, 0.85)',
	Stalled:  'rgba(249, 115,  22, 0.85)',
	Canceled: 'rgba(156, 163, 175, 0.85)'
};

const PADDING_LEFT  = 60;
const PADDING_RIGHT = 16;
const PADDING_TOP   = 40;
const PADDING_BOT   = 40;

function drawThroughput(pCanvas, pState)
{
	if (!pCanvas || !pState) return;
	let tmpCtx = pCanvas.getContext('2d');
	if (!tmpCtx) return;
	let tmpDPR = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
	let tmpW = pCanvas.clientWidth || 800;
	let tmpH = pCanvas.clientHeight || 360;
	if (pCanvas.width !== tmpW * tmpDPR) { pCanvas.width = tmpW * tmpDPR; }
	if (pCanvas.height !== tmpH * tmpDPR) { pCanvas.height = tmpH * tmpDPR; }
	tmpCtx.setTransform(tmpDPR, 0, 0, tmpDPR, 0, 0);
	tmpCtx.clearRect(0, 0, tmpW, tmpH);

	let tmpFromMs = Date.parse(pState.Window.FromIso) || (Date.now() - 60 * 60 * 1000);
	let tmpToMs   = Date.parse(pState.Window.ToIso)   || Date.now();
	if (tmpToMs <= tmpFromMs) tmpToMs = tmpFromMs + 1;
	let tmpBuckets = Array.isArray(pState.Buckets) ? pState.Buckets : [];

	let tmpPlot = {
		x0: PADDING_LEFT,
		x1: tmpW - PADDING_RIGHT,
		y0: PADDING_TOP,
		y1: tmpH - PADDING_BOT,
		fromMs: tmpFromMs,
		toMs:   tmpToMs
	};
	tmpPlot.width  = tmpPlot.x1 - tmpPlot.x0;
	tmpPlot.height = tmpPlot.y1 - tmpPlot.y0;

	if (tmpBuckets.length === 0)
	{
		_drawTimeAxis(tmpCtx, tmpPlot);
		_drawEmpty(tmpCtx, tmpW, tmpH, '(no events in this window)');
		return;
	}

	let tmpStacks = tmpBuckets.map(_bucketToStack);
	let tmpPeak = 0;
	for (let i = 0; i < tmpStacks.length; i++)
	{
		let tmpSum = 0;
		for (let j = 0; j < STACK_KEYS.length; j++) { tmpSum += tmpStacks[i][STACK_KEYS[j]] || 0; }
		if (tmpSum > tmpPeak) tmpPeak = tmpSum;
	}
	if (tmpPeak === 0) tmpPeak = 1;

	// Pre-extract bucket positions.
	let tmpBucketDurMs = (tmpBuckets[0] && tmpBuckets[0].DurationMs) || 60000;

	// Draw admission-denial vertical strips first (so they're behind the stack).
	for (let i = 0; i < tmpBuckets.length; i++)
	{
		let tmpDenied = (tmpBuckets[i].ByEventType && (
			(tmpBuckets[i].ByEventType['Admission.Denied'] || 0)
			+ (tmpBuckets[i].ByEventType['admission.denied'] || 0)
		)) || 0;
		if (tmpDenied <= 0) continue;
		let tmpAt = Date.parse(tmpBuckets[i].At);
		if (!Number.isFinite(tmpAt)) continue;
		let tmpX0 = _timeToX(tmpAt, tmpPlot);
		let tmpX1 = _timeToX(tmpAt + tmpBucketDurMs, tmpPlot);
		tmpCtx.fillStyle = 'rgba(239, 68, 68, 0.18)';
		tmpCtx.fillRect(tmpX0, tmpPlot.y0, Math.max(2, tmpX1 - tmpX0), tmpPlot.height);
	}

	// Stacked-area paint, key by key (bottom→top).
	// For each key, build a polygon: bottom = stack-below cumulative, top = + this key.
	let tmpCumBottom = new Array(tmpBuckets.length).fill(0);
	for (let k = 0; k < STACK_KEYS.length; k++)
	{
		let tmpKey = STACK_KEYS[k];
		tmpCtx.beginPath();
		// Move to the leftmost point along the bottom.
		for (let i = 0; i < tmpBuckets.length; i++)
		{
			let tmpAt = Date.parse(tmpBuckets[i].At);
			if (!Number.isFinite(tmpAt)) continue;
			let tmpX = _timeToX(tmpAt + tmpBucketDurMs / 2, tmpPlot);
			let tmpYBottom = _valueToY(tmpCumBottom[i], tmpPeak, tmpPlot);
			if (i === 0) { tmpCtx.moveTo(tmpX, tmpYBottom); }
			else         { tmpCtx.lineTo(tmpX, tmpYBottom); }
		}
		// Walk back along the top.
		for (let i = tmpBuckets.length - 1; i >= 0; i--)
		{
			let tmpAt = Date.parse(tmpBuckets[i].At);
			if (!Number.isFinite(tmpAt)) continue;
			let tmpX = _timeToX(tmpAt + tmpBucketDurMs / 2, tmpPlot);
			let tmpVal = tmpStacks[i][tmpKey] || 0;
			let tmpYTop = _valueToY(tmpCumBottom[i] + tmpVal, tmpPeak, tmpPlot);
			tmpCtx.lineTo(tmpX, tmpYTop);
		}
		tmpCtx.closePath();
		tmpCtx.fillStyle = STACK_COLORS[tmpKey];
		tmpCtx.fill();
		// Update cumulative bottom for the next key.
		for (let i = 0; i < tmpBuckets.length; i++) { tmpCumBottom[i] += (tmpStacks[i][tmpKey] || 0); }
	}

	_drawTimeAxis(tmpCtx, tmpPlot);
	_drawYAxis(tmpCtx, tmpPlot, tmpPeak, _bucketLabel(tmpBucketDurMs));
	_drawLegend(tmpCtx, tmpW, tmpPlot);
	_drawNowLine(tmpCtx, tmpPlot, Date.parse(pState.Now) || Date.now());
}

function _bucketToStack(pBucket)
{
	let tmpTypes = pBucket.ByEventType || {};
	let tmpStatus = pBucket.ByStatus || {};
	return {
		Complete: (tmpTypes.Completed   || 0)
				+ (tmpTypes['Execution.ExecutionComplete'] || 0)
				+ (tmpStatus.Complete   || 0),
		Failed:   (tmpTypes.Failed       || 0)
				+ (tmpStatus.Failed     || 0),
		Stalled:  (tmpTypes.Stalled      || 0)
				+ (tmpTypes['Workitem.Stranded'] || 0)
				+ (tmpStatus.Stalled    || 0),
		Canceled: (tmpTypes.Canceled     || 0)
				+ (tmpStatus.Canceled   || 0)
				+ (tmpStatus.Abandoned  || 0)
	};
}

function _bucketLabel(pMs)
{
	if (pMs < 1000) return 'per ' + pMs + 'ms';
	if (pMs < 60000) return 'per ' + (pMs / 1000) + 's';
	if (pMs < 3600000) return 'per ' + (pMs / 60000) + 'min';
	return 'per ' + (pMs / 3600000) + 'h';
}

function _drawTimeAxis(pCtx, pPlot)
{
	pCtx.strokeStyle = 'rgba(180, 180, 180, 0.20)';
	pCtx.lineWidth = 1;
	pCtx.beginPath();
	pCtx.moveTo(pPlot.x0, pPlot.y1);
	pCtx.lineTo(pPlot.x1, pPlot.y1);
	pCtx.stroke();
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
	pCtx.fillStyle = 'rgba(180, 180, 180, 0.65)';
	pCtx.font = '10px -apple-system, sans-serif';
	pCtx.textBaseline = 'top';
	pCtx.textAlign = 'center';
	let tmpStart = Math.ceil(pPlot.fromMs / tmpStep) * tmpStep;
	for (let t = tmpStart; t < pPlot.toMs; t += tmpStep)
	{
		let tmpX = _timeToX(t, pPlot);
		pCtx.beginPath();
		pCtx.strokeStyle = 'rgba(180, 180, 180, 0.10)';
		pCtx.moveTo(tmpX, pPlot.y0);
		pCtx.lineTo(tmpX, pPlot.y1);
		pCtx.stroke();
		pCtx.fillStyle = 'rgba(180, 180, 180, 0.65)';
		pCtx.fillText(_formatTime(t, tmpStep), tmpX, pPlot.y1 + 6);
	}
}

function _drawYAxis(pCtx, pPlot, pPeak, pUnitLabel)
{
	let tmpTickCount = 5;
	pCtx.fillStyle = 'rgba(180, 180, 180, 0.65)';
	pCtx.font = '10px monospace';
	pCtx.textBaseline = 'middle';
	pCtx.textAlign = 'right';
	pCtx.strokeStyle = 'rgba(180, 180, 180, 0.10)';
	for (let i = 0; i <= tmpTickCount; i++)
	{
		let tmpVal = (pPeak * i) / tmpTickCount;
		let tmpY = _valueToY(tmpVal, pPeak, pPlot);
		pCtx.beginPath();
		pCtx.moveTo(pPlot.x0, tmpY);
		pCtx.lineTo(pPlot.x1, tmpY);
		pCtx.stroke();
		pCtx.fillText(_formatCount(tmpVal), pPlot.x0 - 6, tmpY);
	}
	// Unit label at the very top.
	pCtx.textAlign = 'left';
	pCtx.textBaseline = 'top';
	pCtx.fillStyle = 'rgba(180, 180, 180, 0.55)';
	pCtx.font = '10px -apple-system, sans-serif';
	pCtx.fillText(pUnitLabel, pPlot.x0, 6);
}

function _drawLegend(pCtx, pW, pPlot)
{
	let tmpY = 8;
	let tmpX = pW - PADDING_RIGHT;
	pCtx.font = '11px -apple-system, sans-serif';
	pCtx.textBaseline = 'top';
	pCtx.textAlign = 'right';
	for (let i = STACK_KEYS.length - 1; i >= 0; i--)
	{
		let tmpKey = STACK_KEYS[i];
		pCtx.fillStyle = STACK_COLORS[tmpKey];
		pCtx.fillRect(tmpX - 12, tmpY + 2, 10, 10);
		pCtx.fillStyle = 'rgba(220, 220, 220, 0.85)';
		pCtx.fillText(tmpKey, tmpX - 18, tmpY + 1);
		tmpX -= 80;
	}
	// Admission denial swatch.
	pCtx.fillStyle = 'rgba(239, 68, 68, 0.30)';
	pCtx.fillRect(tmpX - 12, tmpY + 2, 10, 10);
	pCtx.fillStyle = 'rgba(220, 220, 220, 0.85)';
	pCtx.fillText('Admission denied', tmpX - 18, tmpY + 1);
}

function _drawNowLine(pCtx, pPlot, pNowMs)
{
	if (pNowMs < pPlot.fromMs || pNowMs > pPlot.toMs) return;
	let tmpX = _timeToX(pNowMs, pPlot);
	pCtx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
	pCtx.lineWidth = 1.5;
	pCtx.setLineDash([4, 3]);
	pCtx.beginPath();
	pCtx.moveTo(tmpX, pPlot.y0);
	pCtx.lineTo(tmpX, pPlot.y1);
	pCtx.stroke();
	pCtx.setLineDash([]);
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

function _valueToY(pVal, pPeak, pPlot)
{
	let tmpFrac = pPeak > 0 ? pVal / pPeak : 0;
	if (tmpFrac < 0) tmpFrac = 0;
	if (tmpFrac > 1) tmpFrac = 1;
	return pPlot.y1 - tmpFrac * pPlot.height;
}

function _formatTime(pMs, pStepMs)
{
	let tmpD = new Date(pMs);
	if (pStepMs >= 86400000) return tmpD.toISOString().slice(5, 10);
	if (pStepMs >= 3600000)  return tmpD.toISOString().slice(11, 16);
	if (pStepMs >= 60000)    return tmpD.toISOString().slice(11, 16);
	return tmpD.toISOString().slice(11, 19);
}

function _formatCount(pVal)
{
	if (pVal >= 1000) return (pVal / 1000).toFixed(1) + 'k';
	if (pVal === Math.floor(pVal)) return String(pVal);
	return pVal.toFixed(1);
}

module.exports =
{
	drawThroughput: drawThroughput
};
