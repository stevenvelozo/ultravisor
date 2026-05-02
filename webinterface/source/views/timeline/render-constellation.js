/**
 * render-constellation.js
 *
 * Renders the beacon constellation: each beacon a node, color = liveness,
 * size = recent throughput, edges connect beacons sharing a capability.
 * v1 layout is a deterministic ring, grouped by capability — robust and
 * legible up to ~50 beacons. Force-directed placement is a future
 * upgrade.
 *
 * State:
 *   {
 *     Beacons: [{ BeaconID, Name, Capabilities[], MaxConcurrent, Liveness,
 *                 LivenessReason, LastHeartbeatAt, CurrentWorkItems[] }],
 *     RecentActivity: { BeaconID: count },  // last 30s of work events
 *     Now: ISO string
 *   }
 *
 * Output is also placed into pState.HitTestables = [{ x, y, r, BeaconID }]
 * so the host view can map clicks to beacon IDs without re-doing the
 * layout.
 */

const LIVENESS_COLORS =
{
	Alive:          { fill: '#10b981', stroke: '#059669' },
	'In-Doubt':     { fill: '#f59e0b', stroke: '#d97706' },
	InDoubt:        { fill: '#f59e0b', stroke: '#d97706' },
	Quarantined:    { fill: '#f97316', stroke: '#ea580c' },
	Defunct:        { fill: '#9ca3af', stroke: '#6b7280' },
	Unknown:        { fill: '#6b7280', stroke: '#4b5563' }
};
const DEFAULT_COLOR = LIVENESS_COLORS.Unknown;

const PADDING = 60;
const NODE_RADIUS_BASE = 14;
const NODE_RADIUS_MAX  = 28;

function drawConstellation(pCanvas, pState)
{
	if (!pCanvas || !pState) return;
	let tmpCtx = pCanvas.getContext('2d');
	if (!tmpCtx) return;
	let tmpDPR = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
	let tmpW = pCanvas.clientWidth || 800;
	let tmpH = pCanvas.clientHeight || 600;
	if (pCanvas.width !== tmpW * tmpDPR) { pCanvas.width = tmpW * tmpDPR; }
	if (pCanvas.height !== tmpH * tmpDPR) { pCanvas.height = tmpH * tmpDPR; }
	tmpCtx.setTransform(tmpDPR, 0, 0, tmpDPR, 0, 0);
	tmpCtx.clearRect(0, 0, tmpW, tmpH);

	let tmpBeacons = Array.isArray(pState.Beacons) ? pState.Beacons : [];
	pState.HitTestables = [];
	if (tmpBeacons.length === 0)
	{
		_drawEmpty(tmpCtx, tmpW, tmpH, '(no beacons connected)');
		return;
	}

	// Layout: group by primary capability, then place in a ring.
	let tmpNodes = _layoutNodes(tmpBeacons, tmpW, tmpH, pState.RecentActivity || {});

	// Edges: connect any two nodes sharing at least one capability. Light
	// gray, thin. For readability cap the count: only draw the edge if at
	// least one of the endpoints has fewer than 8 connections so far.
	let tmpEdgeCount = {};
	for (let i = 0; i < tmpNodes.length; i++) { tmpEdgeCount[tmpNodes[i].BeaconID] = 0; }
	tmpCtx.strokeStyle = 'rgba(180, 180, 180, 0.13)';
	tmpCtx.lineWidth = 0.75;
	for (let i = 0; i < tmpNodes.length; i++)
	{
		for (let j = i + 1; j < tmpNodes.length; j++)
		{
			let tmpA = tmpNodes[i];
			let tmpB = tmpNodes[j];
			if (!_sharesCapability(tmpA, tmpB)) continue;
			if (tmpEdgeCount[tmpA.BeaconID] >= 8 && tmpEdgeCount[tmpB.BeaconID] >= 8) continue;
			tmpEdgeCount[tmpA.BeaconID]++;
			tmpEdgeCount[tmpB.BeaconID]++;
			tmpCtx.beginPath();
			tmpCtx.moveTo(tmpA.X, tmpA.Y);
			tmpCtx.lineTo(tmpB.X, tmpB.Y);
			tmpCtx.stroke();
		}
	}

	// Nodes.
	for (let i = 0; i < tmpNodes.length; i++)
	{
		let tmpN = tmpNodes[i];
		let tmpColor = LIVENESS_COLORS[tmpN.Liveness] || DEFAULT_COLOR;
		// Pulse ring when handling work — additive halo.
		if (tmpN.Working)
		{
			let tmpPulse = 0.6 + 0.4 * Math.sin(Date.now() / 350);
			tmpCtx.beginPath();
			tmpCtx.arc(tmpN.X, tmpN.Y, tmpN.R + 6 + tmpPulse * 4, 0, Math.PI * 2);
			tmpCtx.fillStyle = _withAlpha(tmpColor.fill, 0.08 + tmpPulse * 0.10);
			tmpCtx.fill();
		}
		// Body.
		tmpCtx.beginPath();
		tmpCtx.arc(tmpN.X, tmpN.Y, tmpN.R, 0, Math.PI * 2);
		tmpCtx.fillStyle = tmpColor.fill;
		tmpCtx.fill();
		tmpCtx.strokeStyle = tmpColor.stroke;
		tmpCtx.lineWidth = 1.5;
		tmpCtx.stroke();

		// Label.
		tmpCtx.fillStyle = 'rgba(220, 220, 220, 0.92)';
		tmpCtx.font = '11px -apple-system, sans-serif';
		tmpCtx.textBaseline = 'top';
		tmpCtx.textAlign = 'center';
		let tmpDisplay = tmpN.Name || _shortHash(tmpN.BeaconID);
		tmpCtx.fillText(tmpDisplay, tmpN.X, tmpN.Y + tmpN.R + 4);

		// Capability hint below label.
		if (tmpN.PrimaryCapability)
		{
			tmpCtx.fillStyle = 'rgba(160, 160, 160, 0.65)';
			tmpCtx.font = '9px monospace';
			tmpCtx.fillText(tmpN.PrimaryCapability, tmpN.X, tmpN.Y + tmpN.R + 18);
		}

		// Push to hit-testables.
		pState.HitTestables.push({ X: tmpN.X, Y: tmpN.Y, R: tmpN.R, BeaconID: tmpN.BeaconID });
	}

	// Legend (bottom-left).
	_drawLegend(tmpCtx, tmpW, tmpH);
}

function _layoutNodes(pBeacons, pW, pH, pActivity)
{
	let tmpCount = pBeacons.length;
	let tmpCx = pW / 2;
	let tmpCy = pH / 2 - 20;
	let tmpRadius = Math.max(80, Math.min(pW, pH) / 2 - PADDING);

	// Group by primary capability so similar nodes cluster.
	let tmpSorted = pBeacons.slice().sort(function (pA, pB)
	{
		let tmpKa = (pA.Capabilities && pA.Capabilities[0]) || '';
		let tmpKb = (pB.Capabilities && pB.Capabilities[0]) || '';
		if (tmpKa !== tmpKb) return tmpKa < tmpKb ? -1 : 1;
		return pA.BeaconID < pB.BeaconID ? -1 : pA.BeaconID > pB.BeaconID ? 1 : 0;
	});

	// Find the activity peak so node size is normalized.
	let tmpPeak = 1;
	for (let tmpK in pActivity)
	{
		if (pActivity[tmpK] > tmpPeak) tmpPeak = pActivity[tmpK];
	}

	let tmpOut = [];
	for (let i = 0; i < tmpSorted.length; i++)
	{
		let tmpB = tmpSorted[i];
		let tmpAngle = (i / tmpCount) * Math.PI * 2 - Math.PI / 2;
		let tmpAct = pActivity[tmpB.BeaconID] || 0;
		let tmpRSize = NODE_RADIUS_BASE + (NODE_RADIUS_MAX - NODE_RADIUS_BASE) * (tmpAct / tmpPeak);
		// Inner-ring offset varies slightly so beacons in the same capability
		// don't overlap when there are many of them.
		let tmpRadiusOffset = (i % 2) * 18;
		tmpOut.push({
			BeaconID:          tmpB.BeaconID,
			Name:              tmpB.Name || tmpB.BeaconID,
			PrimaryCapability: (tmpB.Capabilities && tmpB.Capabilities[0]) || '',
			Liveness:          tmpB.Liveness || 'Unknown',
			Working:           Array.isArray(tmpB.CurrentWorkItems) && tmpB.CurrentWorkItems.length > 0,
			RecentActivity:    tmpAct,
			MaxConcurrent:     tmpB.MaxConcurrent || 0,
			X:                 tmpCx + Math.cos(tmpAngle) * (tmpRadius - tmpRadiusOffset),
			Y:                 tmpCy + Math.sin(tmpAngle) * (tmpRadius - tmpRadiusOffset),
			R:                 tmpRSize
		});
	}
	return tmpOut;
}

function _sharesCapability(pA, pB)
{
	if (!pA || !pB) return false;
	let tmpA = (pA.PrimaryCapability ? [pA.PrimaryCapability] : []);
	let tmpB = (pB.PrimaryCapability ? [pB.PrimaryCapability] : []);
	for (let i = 0; i < tmpA.length; i++)
	{
		if (tmpB.indexOf(tmpA[i]) >= 0) return true;
	}
	return false;
}

function _drawLegend(pCtx, pW, pH)
{
	let tmpY = pH - 16;
	pCtx.font = '10px -apple-system, sans-serif';
	pCtx.textBaseline = 'middle';
	pCtx.textAlign = 'left';
	let tmpEntries = [
		{ Label: 'Alive',       Color: LIVENESS_COLORS.Alive.fill },
		{ Label: 'In-Doubt',    Color: LIVENESS_COLORS['In-Doubt'].fill },
		{ Label: 'Quarantined', Color: LIVENESS_COLORS.Quarantined.fill },
		{ Label: 'Defunct',     Color: LIVENESS_COLORS.Defunct.fill }
	];
	let tmpX = 16;
	for (let i = 0; i < tmpEntries.length; i++)
	{
		pCtx.fillStyle = tmpEntries[i].Color;
		pCtx.beginPath();
		pCtx.arc(tmpX, tmpY, 5, 0, Math.PI * 2);
		pCtx.fill();
		pCtx.fillStyle = 'rgba(220, 220, 220, 0.8)';
		pCtx.fillText(tmpEntries[i].Label, tmpX + 10, tmpY);
		tmpX += 16 + pCtx.measureText(tmpEntries[i].Label).width + 12;
	}
	// Working halo example.
	pCtx.beginPath();
	pCtx.arc(tmpX + 8, tmpY, 8, 0, Math.PI * 2);
	pCtx.fillStyle = 'rgba(16, 185, 129, 0.18)';
	pCtx.fill();
	pCtx.beginPath();
	pCtx.arc(tmpX + 8, tmpY, 4, 0, Math.PI * 2);
	pCtx.fillStyle = LIVENESS_COLORS.Alive.fill;
	pCtx.fill();
	pCtx.fillStyle = 'rgba(220, 220, 220, 0.8)';
	pCtx.fillText('handling work (pulse)', tmpX + 20, tmpY);
}

function _drawEmpty(pCtx, pW, pH, pMsg)
{
	pCtx.fillStyle = 'rgba(150, 150, 150, 0.55)';
	pCtx.font = '12px -apple-system, sans-serif';
	pCtx.textAlign = 'center';
	pCtx.textBaseline = 'middle';
	pCtx.fillText(pMsg, pW / 2, pH / 2);
}

function _withAlpha(pHex, pAlpha)
{
	if (typeof pHex !== 'string' || pHex.charAt(0) !== '#' || pHex.length !== 7) { return pHex; }
	let tmpR = parseInt(pHex.slice(1, 3), 16);
	let tmpG = parseInt(pHex.slice(3, 5), 16);
	let tmpB = parseInt(pHex.slice(5, 7), 16);
	return 'rgba(' + tmpR + ',' + tmpG + ',' + tmpB + ',' + pAlpha + ')';
}

function _shortHash(pStr)
{
	if (!pStr) return '';
	if (pStr.length <= 22) return pStr;
	return pStr.slice(0, 10) + '…' + pStr.slice(-8);
}

function hitTest(pX, pY, pState)
{
	let tmpHits = (pState && pState.HitTestables) || [];
	for (let i = 0; i < tmpHits.length; i++)
	{
		let tmpH = tmpHits[i];
		let tmpDx = pX - tmpH.X;
		let tmpDy = pY - tmpH.Y;
		if (tmpDx * tmpDx + tmpDy * tmpDy <= (tmpH.R + 4) * (tmpH.R + 4))
		{
			return tmpH.BeaconID;
		}
	}
	return null;
}

module.exports =
{
	drawConstellation: drawConstellation,
	hitTest:           hitTest
};
