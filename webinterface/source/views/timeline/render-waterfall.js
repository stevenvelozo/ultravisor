/**
 * render-waterfall.js
 *
 * Renders a distributed-trace-style waterfall for a single RunHash.
 * Pure render module — Pict-imperative escape hatch, called from
 * PictView-Ultravisor-Timeline's onAfterRender when Focus.Kind === 'runHash'.
 *
 * Inputs (per drawTimeline()'s pState argument):
 *   {
 *       RunHash,
 *       Records: TimelineRecord[],   // /Timeline?runHash=<hash>&bucket=raw
 *       Operation: { Hash, Name, Graph: { Nodes[], Connections[] } } | null,
 *       Now: ISO string
 *   }
 *
 * Layout (left→right):
 *
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │ HEADER  RunHash · Operation Name · status · ΔMs               │
 *   ├───────────────────────────────────────────────────────────────┤
 *   │ task-A  ████████░░░░░░  (Loader)             1240 ms          │
 *   │ task-B  ░░░░██████░░░░  (DI)                  640 ms          │
 *   │ task-C  ░░░░░░██████░░  (Validator)           480 ms          │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Critical path: longest dependency chain through the graph. Bars on
 * the critical path render with a brighter outline.
 *
 * Bar color = terminal status (Complete/Failed/Stalled). Active bars
 * (no EndAt yet) render with the "Running" amber, fading right edge.
 */

const STATUS_COLORS =
{
	'Pending':      { fill: '#3b82f6', stroke: '#2563eb' },
	'Queued':       { fill: '#3b82f6', stroke: '#2563eb' },
	'Assigned':     { fill: '#6366f1', stroke: '#4338ca' },
	'Dispatched':   { fill: '#f59e0b', stroke: '#d97706' },
	'Running':      { fill: '#f59e0b', stroke: '#d97706' },
	'Complete':     { fill: '#10b981', stroke: '#059669' },
	'Failed':       { fill: '#ef4444', stroke: '#dc2626' },
	'Error':        { fill: '#ef4444', stroke: '#dc2626' },
	'Stalled':      { fill: '#f97316', stroke: '#ea580c' },
	'Canceled':     { fill: '#9ca3af', stroke: '#6b7280' },
	'Abandoned':    { fill: '#9ca3af', stroke: '#6b7280' }
};
const DEFAULT_COLOR = { fill: '#6b7280', stroke: '#4b5563' };

const PADDING_LEFT  = 200;   // room for task labels
const PADDING_RIGHT = 110;   // room for duration labels
const PADDING_TOP   = 36;    // room for time-axis ticks
const PADDING_BOT   = 8;
const ROW_HEIGHT    = 22;
const ROW_GAP       = 2;

// Public entry point.
function drawWaterfall(pCanvas, pState)
{
	if (!pCanvas || !pState) return;
	let tmpCtx = pCanvas.getContext('2d');
	if (!tmpCtx) return;

	let tmpDPR = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
	let tmpCSSWidth  = pCanvas.clientWidth || 800;

	// Compute task rows from the records first — we need the count to size
	// the canvas, since the parent container is height:auto.
	let tmpTasks = _buildTaskRows(pState);
	let tmpRowCount = Math.max(1, tmpTasks.length);
	let tmpCSSHeight = PADDING_TOP + PADDING_BOT + tmpRowCount * (ROW_HEIGHT + ROW_GAP);

	// Pict's content-box CSS sizes the element; resize the backing store
	// to match * DPR.
	pCanvas.style.height = tmpCSSHeight + 'px';
	if (pCanvas.width !== tmpCSSWidth * tmpDPR) { pCanvas.width = tmpCSSWidth * tmpDPR; }
	if (pCanvas.height !== tmpCSSHeight * tmpDPR) { pCanvas.height = tmpCSSHeight * tmpDPR; }
	tmpCtx.setTransform(tmpDPR, 0, 0, tmpDPR, 0, 0);
	tmpCtx.clearRect(0, 0, tmpCSSWidth, tmpCSSHeight);

	if (tmpTasks.length === 0)
	{
		_drawEmpty(tmpCtx, tmpCSSWidth, tmpCSSHeight);
		return;
	}

	let tmpFromMs = tmpTasks[0].At;
	let tmpToMs = tmpTasks[0].EndAt;
	for (let i = 0; i < tmpTasks.length; i++)
	{
		if (tmpTasks[i].At < tmpFromMs) tmpFromMs = tmpTasks[i].At;
		if (tmpTasks[i].EndAt > tmpToMs) tmpToMs = tmpTasks[i].EndAt;
	}
	// Guard against a zero-width run (single instantaneous event).
	if (tmpToMs - tmpFromMs < 1) { tmpToMs = tmpFromMs + 1; }
	// Pad the right edge by 5% so the rightmost bar isn't pinned to the
	// boundary.
	tmpToMs = tmpFromMs + Math.ceil((tmpToMs - tmpFromMs) * 1.05);

	let tmpPlot = {
		x0: PADDING_LEFT,
		x1: tmpCSSWidth - PADDING_RIGHT,
		y0: PADDING_TOP,
		y1: tmpCSSHeight - PADDING_BOT,
		fromMs: tmpFromMs,
		toMs:   tmpToMs
	};
	tmpPlot.width = tmpPlot.x1 - tmpPlot.x0;

	_drawTimeAxis(tmpCtx, tmpPlot, tmpCSSWidth);

	// Compute critical path through the operation graph (or by
	// dependency-by-overlap if no graph is available).
	let tmpCriticalSet = _computeCriticalPath(tmpTasks, pState.Operation);

	for (let i = 0; i < tmpTasks.length; i++)
	{
		let tmpY = tmpPlot.y0 + i * (ROW_HEIGHT + ROW_GAP);
		_drawTaskRow(tmpCtx, tmpPlot, tmpY, tmpTasks[i], tmpCriticalSet, tmpCSSWidth);
	}
}

// ─────────────────────────────────────────────────────────────────────
// Task row construction
// ─────────────────────────────────────────────────────────────────────

function _buildTaskRows(pState)
{
	// Group records by WorkItemHash (each task = one work item).
	// For each group, pick At = min, EndAt = max, Capability + Status from
	// the latest record. Records without WorkItemHash are skipped (e.g.
	// Run.Started, Run.Completed envelopes that span the whole run).
	let tmpRecords = (pState && pState.Records) || [];
	let tmpGroups = new Map();

	for (let i = 0; i < tmpRecords.length; i++)
	{
		let tmpR = tmpRecords[i];
		if (!tmpR || !tmpR.WorkItemHash) continue;
		let tmpKey = tmpR.WorkItemHash;
		let tmpAt    = Date.parse(tmpR.At);
		let tmpEndAt = Date.parse(tmpR.EndAt);
		if (!Number.isFinite(tmpAt)) continue;
		if (!Number.isFinite(tmpEndAt)) tmpEndAt = tmpAt;

		let tmpExisting = tmpGroups.get(tmpKey);
		if (!tmpExisting)
		{
			tmpExisting =
			{
				WorkItemHash: tmpKey,
				NodeHash:    tmpR.NodeHash || _deriveNodeHash(tmpR),
				Capability:  tmpR.Capability || '',
				BeaconID:    tmpR.BeaconID || '',
				Status:      '',
				At:          tmpAt,
				EndAt:       tmpEndAt,
				LastRecord:  tmpR,
				LastAt:      tmpAt
			};
			tmpGroups.set(tmpKey, tmpExisting);
		}
		else
		{
			if (tmpAt    < tmpExisting.At)    tmpExisting.At    = tmpAt;
			if (tmpEndAt > tmpExisting.EndAt) tmpExisting.EndAt = tmpEndAt;
		}
		// Capture the freshest non-empty fields.
		if (tmpAt >= tmpExisting.LastAt)
		{
			tmpExisting.LastAt = tmpAt;
			tmpExisting.LastRecord = tmpR;
			if (tmpR.Status) { tmpExisting.Status = tmpR.Status; }
			if (tmpR.Capability) { tmpExisting.Capability = tmpR.Capability; }
			if (tmpR.BeaconID) { tmpExisting.BeaconID = tmpR.BeaconID; }
		}
	}

	let tmpRows = Array.from(tmpGroups.values());
	tmpRows.sort(function (pA, pB) { return pA.At - pB.At; });
	for (let i = 0; i < tmpRows.length; i++)
	{
		tmpRows[i].DurationMs = tmpRows[i].EndAt - tmpRows[i].At;
	}
	return tmpRows;
}

// Some Phase 5 envelopes carry NodeHash inside the raw payload but the
// projector flattens it as part of WorkItemHash. We try a few fallbacks
// to surface a useful per-row label.
function _deriveNodeHash(pRecord)
{
	if (pRecord.NodeHash) return pRecord.NodeHash;
	if (pRecord.WorkItemHash)
	{
		// Common shape: <runHash>::<nodeHash>
		let tmpIdx = pRecord.WorkItemHash.indexOf('::');
		if (tmpIdx >= 0) return pRecord.WorkItemHash.slice(tmpIdx + 2);
	}
	return pRecord.WorkItemHash || '';
}

// ─────────────────────────────────────────────────────────────────────
// Critical path
// ─────────────────────────────────────────────────────────────────────

function _computeCriticalPath(pTasks, pOperation)
{
	// If we have an operation graph, use it to find the longest dependency
	// chain by total duration. Otherwise, fall back to the longest "chain
	// by time overlap" heuristic — a task whose EndAt is followed by a
	// task whose At is within 50ms is considered the predecessor.
	let tmpOut = new Set();
	if (pTasks.length === 0) return tmpOut;

	let tmpByNode = new Map();
	for (let i = 0; i < pTasks.length; i++)
	{
		let tmpKey = pTasks[i].NodeHash || pTasks[i].WorkItemHash;
		if (!tmpByNode.has(tmpKey)) { tmpByNode.set(tmpKey, pTasks[i]); }
	}

	// Build a successor map.
	let tmpSuccs = new Map();
	let tmpPreds = new Map();
	let tmpHasGraph = pOperation && pOperation.Graph
		&& Array.isArray(pOperation.Graph.Connections)
		&& pOperation.Graph.Connections.length > 0;

	if (tmpHasGraph)
	{
		let tmpConns = pOperation.Graph.Connections;
		for (let i = 0; i < tmpConns.length; i++)
		{
			let tmpC = tmpConns[i];
			if (!tmpC || !tmpC.SourceNodeHash || !tmpC.TargetNodeHash) continue;
			let tmpFrom = tmpC.SourceNodeHash;
			let tmpTo   = tmpC.TargetNodeHash;
			if (!tmpSuccs.has(tmpFrom)) { tmpSuccs.set(tmpFrom, []); }
			tmpSuccs.get(tmpFrom).push(tmpTo);
			if (!tmpPreds.has(tmpTo)) { tmpPreds.set(tmpTo, []); }
			tmpPreds.get(tmpTo).push(tmpFrom);
		}
	}
	else
	{
		// Heuristic: a task's predecessor is the latest task that ends
		// at or before its At, within 200ms.
		let tmpSorted = pTasks.slice().sort(function (pA, pB) { return pA.At - pB.At; });
		for (let i = 1; i < tmpSorted.length; i++)
		{
			let tmpThis = tmpSorted[i];
			for (let j = i - 1; j >= 0; j--)
			{
				let tmpPrev = tmpSorted[j];
				if (tmpPrev.EndAt <= tmpThis.At + 200)
				{
					let tmpThisKey = tmpThis.NodeHash || tmpThis.WorkItemHash;
					let tmpPrevKey = tmpPrev.NodeHash || tmpPrev.WorkItemHash;
					if (!tmpPreds.has(tmpThisKey)) { tmpPreds.set(tmpThisKey, []); }
					tmpPreds.get(tmpThisKey).push(tmpPrevKey);
					if (!tmpSuccs.has(tmpPrevKey)) { tmpSuccs.set(tmpPrevKey, []); }
					tmpSuccs.get(tmpPrevKey).push(tmpThisKey);
					break;
				}
			}
		}
	}

	// Longest path by accumulated duration ending at each task.
	let tmpDist = new Map();
	let tmpFrom = new Map();
	let tmpVisited = new Map();

	let fLongest = function (pKey)
	{
		if (tmpDist.has(pKey)) return tmpDist.get(pKey);
		if (tmpVisited.get(pKey)) return 0; // cycle guard
		tmpVisited.set(pKey, true);
		let tmpTask = tmpByNode.get(pKey);
		let tmpDur = tmpTask ? tmpTask.DurationMs : 0;
		let tmpPredList = tmpPreds.get(pKey) || [];
		let tmpBest = 0;
		let tmpBestPred = null;
		for (let i = 0; i < tmpPredList.length; i++)
		{
			let tmpD = fLongest(tmpPredList[i]);
			if (tmpD > tmpBest) { tmpBest = tmpD; tmpBestPred = tmpPredList[i]; }
		}
		let tmpTotal = tmpBest + tmpDur;
		tmpDist.set(pKey, tmpTotal);
		if (tmpBestPred) { tmpFrom.set(pKey, tmpBestPred); }
		return tmpTotal;
	};

	let tmpEnd = null;
	let tmpEndDist = -1;
	for (let i = 0; i < pTasks.length; i++)
	{
		let tmpKey = pTasks[i].NodeHash || pTasks[i].WorkItemHash;
		let tmpD = fLongest(tmpKey);
		if (tmpD > tmpEndDist) { tmpEndDist = tmpD; tmpEnd = tmpKey; }
	}

	// Walk back from end through tmpFrom to mark the critical chain.
	let tmpCursor = tmpEnd;
	let tmpGuard = pTasks.length + 5;
	while (tmpCursor && tmpGuard-- > 0)
	{
		tmpOut.add(tmpCursor);
		tmpCursor = tmpFrom.get(tmpCursor);
	}
	return tmpOut;
}

// ─────────────────────────────────────────────────────────────────────
// Drawing
// ─────────────────────────────────────────────────────────────────────

function _drawTimeAxis(pCtx, pPlot, pCSSWidth)
{
	let tmpSpan = pPlot.toMs - pPlot.fromMs;
	let tmpSteps = [10, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000, 300000, 1800000];
	let tmpStep = tmpSteps[0];
	for (let i = 0; i < tmpSteps.length; i++)
	{
		if (tmpSpan / tmpSteps[i] <= 8)
		{
			tmpStep = tmpSteps[i];
			break;
		}
		tmpStep = tmpSteps[i];
	}
	pCtx.fillStyle = 'rgba(180, 180, 180, 0.7)';
	pCtx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
	pCtx.textBaseline = 'top';
	pCtx.textAlign = 'center';
	pCtx.strokeStyle = 'rgba(180, 180, 180, 0.10)';
	pCtx.lineWidth = 1;
	for (let t = 0; t <= tmpSpan; t += tmpStep)
	{
		let tmpX = pPlot.x0 + (t / tmpSpan) * pPlot.width;
		pCtx.beginPath();
		pCtx.moveTo(tmpX, pPlot.y0);
		pCtx.lineTo(tmpX, pPlot.y1);
		pCtx.stroke();
		pCtx.fillText(_formatDuration(t), tmpX, 4);
	}
	// Header line — runHash + start time.
	pCtx.fillStyle = 'rgba(200, 200, 200, 0.6)';
	pCtx.font = '600 11px -apple-system, sans-serif';
	pCtx.textAlign = 'left';
	let tmpStartLabel = new Date(pPlot.fromMs).toISOString().slice(11, 19) + ' UTC';
	pCtx.fillText('t₀ = ' + tmpStartLabel, 8, 4);
	pCtx.textAlign = 'right';
	pCtx.fillText('Δ = ' + _formatDuration(tmpSpan), pCSSWidth - 8, 4);
}

function _drawTaskRow(pCtx, pPlot, pY, pTask, pCriticalSet, pCSSWidth)
{
	let tmpKey = pTask.NodeHash || pTask.WorkItemHash;
	let tmpIsCritical = pCriticalSet.has(tmpKey);

	// Row bg banded for legibility.
	pCtx.fillStyle = tmpIsCritical ? 'rgba(251, 191, 36, 0.06)' : 'rgba(180, 180, 180, 0.025)';
	pCtx.fillRect(0, pY, pCSSWidth, ROW_HEIGHT);

	// Label (node hash, capability hint).
	pCtx.fillStyle = 'rgba(220, 220, 220, 0.92)';
	pCtx.font = '11px -apple-system, sans-serif';
	pCtx.textBaseline = 'middle';
	pCtx.textAlign = 'left';
	let tmpLabel = pTask.NodeHash || _shortHash(pTask.WorkItemHash);
	if (tmpLabel.length > 22) { tmpLabel = tmpLabel.slice(0, 21) + '…'; }
	pCtx.fillText(tmpLabel, 8, pY + ROW_HEIGHT / 2);

	pCtx.fillStyle = 'rgba(160, 160, 160, 0.7)';
	pCtx.font = '10px -apple-system, sans-serif';
	let tmpCapLabel = pTask.Capability || '—';
	pCtx.fillText(tmpCapLabel, 8 + 130, pY + ROW_HEIGHT / 2);

	// Bar.
	let tmpX0 = _msToX(pTask.At, pPlot);
	let tmpX1 = _msToX(pTask.EndAt, pPlot);
	if (tmpX1 - tmpX0 < 2) { tmpX1 = tmpX0 + 2; }
	let tmpColor = _statusColor(pTask.Status || (pTask.LastRecord && pTask.LastRecord.EventType));
	pCtx.fillStyle = tmpColor.fill;
	pCtx.fillRect(tmpX0, pY + 3, tmpX1 - tmpX0, ROW_HEIGHT - 6);
	pCtx.strokeStyle = tmpIsCritical ? '#fbbf24' : tmpColor.stroke;
	pCtx.lineWidth = tmpIsCritical ? 1.5 : 0.75;
	pCtx.strokeRect(tmpX0, pY + 3, tmpX1 - tmpX0, ROW_HEIGHT - 6);

	// Duration label after the bar.
	pCtx.fillStyle = 'rgba(200, 200, 200, 0.75)';
	pCtx.font = '600 10px monospace';
	pCtx.textAlign = 'left';
	pCtx.fillText(_formatDuration(pTask.DurationMs), Math.min(tmpX1 + 6, pPlot.x1 + 4), pY + ROW_HEIGHT / 2);
}

function _drawEmpty(pCtx, pW, pH)
{
	pCtx.fillStyle = 'rgba(150, 150, 150, 0.55)';
	pCtx.font = '12px -apple-system, sans-serif';
	pCtx.textAlign = 'center';
	pCtx.textBaseline = 'middle';
	pCtx.fillText('No work-item events for this run yet.', pW / 2, pH / 2);
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function _msToX(pMs, pPlot)
{
	let tmpFrac = (pMs - pPlot.fromMs) / (pPlot.toMs - pPlot.fromMs);
	if (tmpFrac < 0) tmpFrac = 0;
	if (tmpFrac > 1) tmpFrac = 1;
	return pPlot.x0 + tmpFrac * pPlot.width;
}

function _statusColor(pStatusOrType)
{
	if (!pStatusOrType) return DEFAULT_COLOR;
	return STATUS_COLORS[pStatusOrType] || DEFAULT_COLOR;
}

function _formatDuration(pMs)
{
	if (!Number.isFinite(pMs) || pMs < 0) return '0ms';
	if (pMs < 1000)   return pMs + 'ms';
	if (pMs < 60000)  return (pMs / 1000).toFixed(1) + 's';
	let tmpMin = Math.floor(pMs / 60000);
	let tmpSec = Math.floor((pMs - tmpMin * 60000) / 1000);
	return tmpMin + 'm' + (tmpSec < 10 ? '0' : '') + tmpSec + 's';
}

function _shortHash(pStr)
{
	if (!pStr) return '';
	if (pStr.length <= 24) return pStr;
	return pStr.slice(0, 8) + '…' + pStr.slice(-8);
}

module.exports =
{
	drawWaterfall: drawWaterfall,
	buildTaskRows: _buildTaskRows
};
