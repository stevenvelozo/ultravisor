/**
 * render-anomaly-ribbon.js
 *
 * Renders the anomaly ribbon — a thin band, time-aligned to the spine's
 * X-axis, with red/amber tick marks where anomaly buckets fired.
 *
 * State:
 *   {
 *     Window: { FromIso, ToIso },     // identical to the spine's window
 *     Anomalies: [{ At, DurationMs, EventType, Observed, Baseline, Score }],
 *     PadLeft: number,                // matches the spine's PADDING_LEFT
 *     PadRight: number                // matches the spine's PADDING_RIGHT
 *   }
 *
 * Output also writes hit boxes to pState.HitBoxes = [{ x0, x1, anomaly }]
 * for the parent view's hover/click handlers.
 */

function drawAnomalyRibbon(pCanvas, pState)
{
	if (!pCanvas || !pState) return;
	let tmpCtx = pCanvas.getContext('2d');
	if (!tmpCtx) return;
	let tmpDPR = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
	let tmpW = pCanvas.clientWidth || 800;
	let tmpH = pCanvas.clientHeight || 14;
	if (pCanvas.width !== tmpW * tmpDPR) { pCanvas.width = tmpW * tmpDPR; }
	if (pCanvas.height !== tmpH * tmpDPR) { pCanvas.height = tmpH * tmpDPR; }
	tmpCtx.setTransform(tmpDPR, 0, 0, tmpDPR, 0, 0);
	tmpCtx.clearRect(0, 0, tmpW, tmpH);

	// Track outline matching the spine's plot inset.
	let tmpPadL = Number.isFinite(pState.PadLeft) ? pState.PadLeft : 140;
	let tmpPadR = Number.isFinite(pState.PadRight) ? pState.PadRight : 16;
	let tmpX0 = tmpPadL;
	let tmpX1 = tmpW - tmpPadR;
	let tmpTrackY = 1;
	let tmpTrackH = tmpH - 2;
	tmpCtx.fillStyle = 'rgba(180, 180, 180, 0.05)';
	tmpCtx.fillRect(tmpX0, tmpTrackY, Math.max(0, tmpX1 - tmpX0), tmpTrackH);

	// Label.
	tmpCtx.fillStyle = 'rgba(180, 180, 180, 0.55)';
	tmpCtx.font = '600 9px -apple-system, sans-serif';
	tmpCtx.textBaseline = 'middle';
	tmpCtx.textAlign = 'right';
	tmpCtx.fillText('ANOMALY', tmpPadL - 8, tmpH / 2);

	pState.HitBoxes = [];

	let tmpFromMs = Date.parse(pState.Window.FromIso);
	let tmpToMs   = Date.parse(pState.Window.ToIso);
	if (!Number.isFinite(tmpFromMs) || !Number.isFinite(tmpToMs) || tmpToMs <= tmpFromMs) return;

	let tmpAnomalies = Array.isArray(pState.Anomalies) ? pState.Anomalies : [];
	if (tmpAnomalies.length === 0)
	{
		tmpCtx.textAlign = 'left';
		tmpCtx.fillStyle = 'rgba(120, 120, 120, 0.45)';
		tmpCtx.font = '9px -apple-system, sans-serif';
		tmpCtx.fillText('no anomalies in this window', tmpPadL + 6, tmpH / 2);
		return;
	}

	let tmpWidth = tmpX1 - tmpX0;
	for (let i = 0; i < tmpAnomalies.length; i++)
	{
		let tmpA = tmpAnomalies[i];
		let tmpAt = Date.parse(tmpA.At);
		if (!Number.isFinite(tmpAt)) continue;
		let tmpDur = tmpA.DurationMs || 1000;
		let tmpFrac0 = (tmpAt - tmpFromMs) / (tmpToMs - tmpFromMs);
		let tmpFrac1 = ((tmpAt + tmpDur) - tmpFromMs) / (tmpToMs - tmpFromMs);
		if (tmpFrac1 < 0 || tmpFrac0 > 1) continue;
		if (tmpFrac0 < 0) tmpFrac0 = 0;
		if (tmpFrac1 > 1) tmpFrac1 = 1;
		let tmpBoxX0 = tmpX0 + tmpFrac0 * tmpWidth;
		let tmpBoxX1 = tmpX0 + tmpFrac1 * tmpWidth;
		if (tmpBoxX1 - tmpBoxX0 < 2) tmpBoxX1 = tmpBoxX0 + 2;

		let tmpColor = _scoreColor(tmpA.Score, tmpA.EventType);
		tmpCtx.fillStyle = tmpColor;
		tmpCtx.fillRect(tmpBoxX0, tmpTrackY, tmpBoxX1 - tmpBoxX0, tmpTrackH);

		pState.HitBoxes.push({
			X0: tmpBoxX0,
			X1: tmpBoxX1,
			Anomaly: tmpA
		});
	}
}

function _scoreColor(pScore, pEventType)
{
	let tmpScore = Number.isFinite(pScore) ? pScore : 1;
	if (pEventType === 'Admission.Denied')
	{
		return 'rgba(220, 38, 38, ' + Math.min(0.95, 0.4 + tmpScore * 0.18) + ')';
	}
	if (pEventType === 'Failed')
	{
		return 'rgba(239, 68, 68, ' + Math.min(0.95, 0.35 + tmpScore * 0.16) + ')';
	}
	// Stalled
	return 'rgba(249, 115, 22, ' + Math.min(0.95, 0.32 + tmpScore * 0.16) + ')';
}

function hitTest(pX, pState)
{
	let tmpHB = (pState && pState.HitBoxes) || [];
	for (let i = 0; i < tmpHB.length; i++)
	{
		if (pX >= tmpHB[i].X0 - 2 && pX <= tmpHB[i].X1 + 2)
		{
			return tmpHB[i].Anomaly;
		}
	}
	return null;
}

module.exports =
{
	drawAnomalyRibbon: drawAnomalyRibbon,
	hitTest:           hitTest
};
