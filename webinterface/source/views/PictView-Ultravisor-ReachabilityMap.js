const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-ReachabilityMap",

	DefaultRenderable: "Ultravisor-ReachabilityMap-Content",
	DefaultDestinationAddress: "#Ultravisor-BeaconList-ReachabilityMap",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-reachability-map {
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 8px;
			padding: 1.5em;
			position: relative;
		}
		.ultravisor-reachability-map svg {
			width: 100%;
			height: 460px;
			display: block;
		}
		.ultravisor-reachability-map-empty {
			text-align: center;
			padding: 3em;
			color: var(--uv-text-tertiary);
			font-size: 0.95em;
		}

		/* Legend */
		.ultravisor-reachability-legend {
			display: flex;
			flex-wrap: wrap;
			gap: 1.2em;
			margin-top: 1em;
			padding-top: 0.75em;
			border-top: 1px solid var(--uv-border-subtle);
			font-size: 0.8em;
			color: var(--uv-text-secondary);
		}
		.ultravisor-reachability-legend-item {
			display: flex;
			align-items: center;
			gap: 0.4em;
		}
		.ultravisor-reachability-legend-line {
			width: 24px;
			height: 3px;
			border-radius: 1px;
		}
		.ultravisor-reachability-legend-line.ws {
			background-color: #5a9ecb;
		}
		.ultravisor-reachability-legend-line.direct {
			background-color: #66bb6a;
		}
		.ultravisor-reachability-legend-line.unreachable {
			background: repeating-linear-gradient(
				90deg,
				#ef5350 0px, #ef5350 4px,
				transparent 4px, transparent 8px
			);
		}
		.ultravisor-reachability-legend-line.untested {
			background: repeating-linear-gradient(
				90deg,
				#9e9e9e 0px, #9e9e9e 2px,
				transparent 2px, transparent 6px
			);
		}
		.ultravisor-reachability-legend-marker {
			width: 16px;
			height: 16px;
			border-radius: 50%;
			border: 2px dashed var(--theme-color-status-warning, #b45309);
			background: transparent;
		}

		/* Tooltip */
		.ultravisor-reachability-tooltip {
			position: absolute;
			background: var(--uv-bg-elevated);
			border: 1px solid var(--uv-border);
			border-radius: 6px;
			padding: 0.5em 0.75em;
			font-size: 0.8em;
			color: var(--uv-text);
			pointer-events: none;
			display: none;
			z-index: 10;
			white-space: nowrap;
			box-shadow: 0 2px 8px rgba(0,0,0,0.3);
		}
		.ultravisor-reachability-tooltip.visible {
			display: block;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-ReachabilityMap-Template",
			Template: /*html*/`
<div class="ultravisor-reachability-map">
	<div id="Ultravisor-ReachabilityMap-Canvas"></div>
	<div id="Ultravisor-ReachabilityMap-Tooltip" class="ultravisor-reachability-tooltip"></div>
	<div class="ultravisor-reachability-legend">
		<div class="ultravisor-reachability-legend-item">
			<div class="ultravisor-reachability-legend-line ws"></div>
			<span>WebSocket (beacon ↔ UV)</span>
		</div>
		<div class="ultravisor-reachability-legend-item">
			<div class="ultravisor-reachability-legend-line direct"></div>
			<span>Direct (probed)</span>
		</div>
		<div class="ultravisor-reachability-legend-item">
			<div class="ultravisor-reachability-legend-line unreachable"></div>
			<span>Unreachable (probe failed)</span>
		</div>
		<div class="ultravisor-reachability-legend-item">
			<div class="ultravisor-reachability-legend-line untested"></div>
			<span>Untested</span>
		</div>
		<div class="ultravisor-reachability-legend-item">
			<div class="ultravisor-reachability-legend-marker"></div>
			<span>No HTTP listener (broker-only)</span>
		</div>
	</div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-ReachabilityMap-Content",
			TemplateHash: "Ultravisor-ReachabilityMap-Template",
			DestinationAddress: "#Ultravisor-BeaconList-ReachabilityMap",
			RenderMethod: "replace"
		}
	]
};

class UltravisorReachabilityMapView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.renderMap();
		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	renderMap()
	{
		// Prefer the connectivity-rich Beacons from the envelope; fall
		// back to the bare Beacons list if the envelope wasn't populated
		// (e.g. legacy server, race during initial load).
		let tmpReachBeacons = this.pict.AppData.Ultravisor.ReachabilityBeacons || [];
		let tmpFallbackBeacons = this.pict.AppData.Ultravisor.Beacons || [];
		let tmpBeacons = (tmpReachBeacons.length > 0) ? tmpReachBeacons : tmpFallbackBeacons.map(function (pB)
		{
			// Synthesize the envelope shape from a bare beacon so the
			// renderer doesn't have to branch.  HasListener is best-
			// effort from BindAddresses; WSConnected is approximated
			// from Status==='Online'.
			return {
				BeaconID:      pB.BeaconID,
				Name:          pB.Name,
				Status:        pB.Status,
				HasListener:   Array.isArray(pB.BindAddresses) && pB.BindAddresses.length > 0,
				WSConnected:   (pB.Status || '').toLowerCase() === 'online',
				BindAddresses: pB.BindAddresses || [],
				HostID:        pB.HostID || ''
			};
		});

		let tmpMatrix = this.pict.AppData.Ultravisor.ReachabilityMatrix || [];
		let tmpHub = this.pict.AppData.Ultravisor.ReachabilityHub
			|| { HostID: 'ultravisor', Name: 'Ultravisor' };

		if (tmpBeacons.length === 0)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-ReachabilityMap-Canvas',
				'<div class="ultravisor-reachability-map-empty">No beacons registered yet.</div>');
			return;
		}

		// Build a lookup for matrix entries: "src::tgt" → entry
		let tmpLookup = {};
		for (let i = 0; i < tmpMatrix.length; i++)
		{
			let tmpEntry = tmpMatrix[i];
			tmpLookup[tmpEntry.SourceBeaconID + '::' + tmpEntry.TargetBeaconID] = tmpEntry;
		}

		// Layout: beacons on a ring, Ultravisor hub in center
		let tmpWidth = 600;
		let tmpHeight = 440;
		let tmpCenterX = tmpWidth / 2;
		let tmpCenterY = tmpHeight / 2;
		let tmpRadius = Math.min(tmpWidth, tmpHeight) * 0.36;
		let tmpNodeRadius = 30;
		let tmpHubRadius = 28;

		// Calculate beacon positions on the ring
		let tmpPositions = [];
		for (let i = 0; i < tmpBeacons.length; i++)
		{
			let tmpAngle = (2 * Math.PI * i / tmpBeacons.length) - (Math.PI / 2);
			tmpPositions.push({
				x: tmpCenterX + tmpRadius * Math.cos(tmpAngle),
				y: tmpCenterY + tmpRadius * Math.sin(tmpAngle)
			});
		}

		let tmpViewRef = "_Pict.views['Ultravisor-ReachabilityMap']";
		let tmpSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + tmpWidth + ' ' + tmpHeight + '">';

		// ── Layer 1: beacon ↔ UV WebSocket lines ──
		// Drawn first so direct lines render on top.  These are
		// bidirectional by nature (the WS carries both push from UV
		// to beacon and beacon → UV registration/heartbeats), so a
		// single solid line communicates the channel.
		for (let i = 0; i < tmpBeacons.length; i++)
		{
			let tmpB = tmpBeacons[i];
			if (!tmpB.WSConnected) continue;
			let tmpEdgeStart = this._edgePoint(tmpCenterX, tmpCenterY, tmpPositions[i].x, tmpPositions[i].y, tmpHubRadius);
			let tmpEdgeEnd = this._edgePoint(tmpPositions[i].x, tmpPositions[i].y, tmpCenterX, tmpCenterY, tmpNodeRadius);
			let tmpTooltip = this._escapeAttr(tmpB.Name + ' ↔ ' + tmpHub.Name + ' | WebSocket | bidirectional');
			tmpSVG += '<line x1="' + tmpEdgeStart.x + '" y1="' + tmpEdgeStart.y + '"'
				+ ' x2="' + tmpEdgeEnd.x + '" y2="' + tmpEdgeEnd.y + '"'
				+ ' stroke="#5a9ecb" stroke-width="2.25" stroke-linecap="round"'
				+ ' opacity="0.9" style="cursor:pointer;"'
				+ ' onmousemove="' + tmpViewRef + '.showTooltip(event, \'' + tmpTooltip + '\')"'
				+ ' onmouseleave="' + tmpViewRef + '.hideTooltip()"'
				+ '/>';
		}

		// ── Layer 2: beacon ↔ beacon direct connectivity lines ──
		// Only drawn for pairs where BOTH beacons advertise an HTTP
		// listener.  When either beacon is no-listener, the absence
		// of a line is the signal — we draw a circle treatment on
		// that beacon (Layer 4) so the user can see why no edges
		// fan out from it.
		for (let i = 0; i < tmpBeacons.length; i++)
		{
			for (let j = i + 1; j < tmpBeacons.length; j++)
			{
				let tmpA = tmpBeacons[i];
				let tmpB = tmpBeacons[j];
				if (!tmpA.HasListener || !tmpB.HasListener) continue;

				let tmpAB = tmpLookup[tmpA.BeaconID + '::' + tmpB.BeaconID];
				let tmpBA = tmpLookup[tmpB.BeaconID + '::' + tmpA.BeaconID];
				let tmpStatus = this._combinedStatus(tmpAB, tmpBA);
				if (tmpStatus === 'no-listener') continue;  // belt-and-suspenders

				let tmpLineColor = '#9e9e9e';
				let tmpDashArray = '3,5';
				let tmpStrokeWidth = 1.5;
				if (tmpStatus === 'reachable')
				{
					tmpLineColor = '#66bb6a';
					tmpDashArray = '';
					tmpStrokeWidth = 2;
				}
				else if (tmpStatus === 'unreachable')
				{
					tmpLineColor = '#ef5350';
					tmpDashArray = '6,4';
				}

				let tmpLatency = this._bestLatency(tmpAB, tmpBA);
				let tmpLastProbe = this._latestProbe(tmpAB, tmpBA);
				let tmpEdgeA = this._edgePoint(tmpPositions[i].x, tmpPositions[i].y, tmpPositions[j].x, tmpPositions[j].y, tmpNodeRadius);
				let tmpEdgeB = this._edgePoint(tmpPositions[j].x, tmpPositions[j].y, tmpPositions[i].x, tmpPositions[i].y, tmpNodeRadius);

				let tmpTooltipData = this._escapeAttr(tmpA.Name) + ' ↔ ' + this._escapeAttr(tmpB.Name)
					+ ' | direct: ' + tmpStatus;
				if (tmpLatency !== null) { tmpTooltipData += ' | ' + tmpLatency + 'ms'; }
				if (tmpLastProbe) { tmpTooltipData += ' | ' + tmpLastProbe; }

				tmpSVG += '<line x1="' + tmpEdgeA.x + '" y1="' + tmpEdgeA.y + '"'
					+ ' x2="' + tmpEdgeB.x + '" y2="' + tmpEdgeB.y + '"'
					+ ' stroke="' + tmpLineColor + '" stroke-width="' + tmpStrokeWidth + '"'
					+ (tmpDashArray ? ' stroke-dasharray="' + tmpDashArray + '"' : '')
					+ ' style="cursor:pointer;"'
					+ ' onmousemove="' + tmpViewRef + '.showTooltip(event, \'' + this._escapeAttr(tmpTooltipData) + '\')"'
					+ ' onmouseleave="' + tmpViewRef + '.hideTooltip()"'
					+ '/>';
			}
		}

		// ── Layer 3: Ultravisor hub circle ──
		tmpSVG += '<circle cx="' + tmpCenterX + '" cy="' + tmpCenterY + '" r="' + tmpHubRadius + '"'
			+ ' fill="var(--uv-bg-elevated)" stroke="var(--uv-brand)" stroke-width="2.5"'
			+ ' style="cursor:pointer;"'
			+ ' onmousemove="' + tmpViewRef + '.showTooltip(event, \''
			+ this._escapeAttr(tmpHub.Name + ' | hub | ' + tmpBeacons.filter(function (pB) { return pB.WSConnected; }).length + ' connected') + '\')"'
			+ ' onmouseleave="' + tmpViewRef + '.hideTooltip()"/>';
		tmpSVG += '<text x="' + tmpCenterX + '" y="' + (tmpCenterY + 5) + '"'
			+ ' text-anchor="middle" fill="var(--uv-brand)" font-size="11" font-weight="700"'
			+ ' style="pointer-events:none;">UV</text>';

		// ── Layer 4: beacon nodes (with no-listener treatment) ──
		for (let i = 0; i < tmpBeacons.length; i++)
		{
			let tmpBeacon = tmpBeacons[i];
			let tmpX = tmpPositions[i].x;
			let tmpY = tmpPositions[i].y;
			let tmpIsOnline = (tmpBeacon.Status || '').toLowerCase() === 'online';
			let tmpFill = tmpIsOnline ? 'var(--uv-bg-elevated)' : 'var(--uv-bg-base)';
			let tmpStroke = tmpIsOnline ? 'var(--uv-success)' : 'var(--uv-text-tertiary)';
			let tmpTextColor = tmpIsOnline ? 'var(--uv-text)' : 'var(--uv-text-tertiary)';
			let tmpOpacity = tmpIsOnline ? '1' : '0.5';

			// no-listener treatment: amber dashed border on the inside,
			// keeping the green online ring outside.  Communicates "this
			// beacon is alive but offers no direct HTTP transport — its
			// only edges are the WS line to UV."
			let tmpNoListener = tmpIsOnline && !tmpBeacon.HasListener;

			let tmpTooltipParts = [tmpBeacon.Name || tmpBeacon.BeaconID || '?'];
			tmpTooltipParts.push(tmpBeacon.Status || 'unknown');
			tmpTooltipParts.push(tmpBeacon.HasListener ? 'has HTTP listener' : 'no HTTP listener (broker-only)');
			tmpTooltipParts.push(tmpBeacon.WSConnected ? 'WS connected' : 'WS disconnected');
			let tmpTooltip = this._escapeAttr(tmpTooltipParts.join(' | '));

			tmpSVG += '<g opacity="' + tmpOpacity + '"'
				+ ' onmousemove="' + tmpViewRef + '.showTooltip(event, \'' + tmpTooltip + '\')"'
				+ ' onmouseleave="' + tmpViewRef + '.hideTooltip()"'
				+ ' style="cursor:pointer;">';
			tmpSVG += '<circle cx="' + tmpX + '" cy="' + tmpY + '" r="' + tmpNodeRadius + '"'
				+ ' fill="' + tmpFill + '" stroke="' + tmpStroke + '" stroke-width="2"/>';
			if (tmpNoListener)
			{
				tmpSVG += '<circle cx="' + tmpX + '" cy="' + tmpY + '" r="' + (tmpNodeRadius - 5) + '"'
					+ ' fill="none" stroke="#b45309" stroke-width="1.5" stroke-dasharray="3,3"/>';
			}

			// Beacon name (truncated)
			let tmpDisplayName = tmpBeacon.Name || tmpBeacon.BeaconID || '?';
			if (tmpDisplayName.length > 11)
			{
				tmpDisplayName = tmpDisplayName.substring(0, 10) + '…';
			}
			tmpSVG += '<text x="' + tmpX + '" y="' + (tmpY + 3) + '"'
				+ ' text-anchor="middle" fill="' + tmpTextColor + '"'
				+ ' font-size="9" font-weight="500" style="pointer-events:none;">'
				+ this._escapeHTML(tmpDisplayName) + '</text>';

			// Online status dot (top-right)
			let tmpDotColor = tmpIsOnline ? '#66bb6a' : '#757575';
			tmpSVG += '<circle cx="' + (tmpX + tmpNodeRadius - 4) + '" cy="' + (tmpY - tmpNodeRadius + 4) + '"'
				+ ' r="4" fill="' + tmpDotColor + '"/>';

			tmpSVG += '</g>';
		}

		tmpSVG += '</svg>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-ReachabilityMap-Canvas', tmpSVG);
	}

	// ── Geometry helpers ──

	// Move a line endpoint from a node centre to its border so the line
	// stops at the circle edge instead of vanishing under the node.
	_edgePoint(pFromX, pFromY, pToX, pToY, pRadius)
	{
		let tmpDX = pToX - pFromX;
		let tmpDY = pToY - pFromY;
		let tmpDist = Math.sqrt(tmpDX * tmpDX + tmpDY * tmpDY) || 1;
		return {
			x: pFromX + (tmpDX / tmpDist) * pRadius,
			y: pFromY + (tmpDY / tmpDist) * pRadius
		};
	}

	// ── Status Helpers ──

	_combinedStatus(pEntryAB, pEntryBA)
	{
		let tmpStatusA = pEntryAB ? pEntryAB.Status : 'untested';
		let tmpStatusB = pEntryBA ? pEntryBA.Status : 'untested';

		// 'reachable' wins (any working direction implies path exists)
		if (tmpStatusA === 'reachable' || tmpStatusB === 'reachable') return 'reachable';
		// 'no-listener' is structural — propagate when either side reports it.
		if (tmpStatusA === 'no-listener' || tmpStatusB === 'no-listener') return 'no-listener';
		if (tmpStatusA === 'unreachable' || tmpStatusB === 'unreachable') return 'unreachable';
		return 'untested';
	}

	_bestLatency(pEntryAB, pEntryBA)
	{
		let tmpA = pEntryAB && pEntryAB.ProbeLatencyMs !== null ? pEntryAB.ProbeLatencyMs : null;
		let tmpB = pEntryBA && pEntryBA.ProbeLatencyMs !== null ? pEntryBA.ProbeLatencyMs : null;
		if (tmpA !== null && tmpB !== null) return Math.min(tmpA, tmpB);
		return tmpA !== null ? tmpA : tmpB;
	}

	_latestProbe(pEntryAB, pEntryBA)
	{
		let tmpA = pEntryAB ? pEntryAB.LastProbeAt : null;
		let tmpB = pEntryBA ? pEntryBA.LastProbeAt : null;
		if (tmpA && tmpB) return new Date(tmpA) > new Date(tmpB) ? tmpA : tmpB;
		return tmpA || tmpB || null;
	}

	// ── Tooltip ──

	showTooltip(pEvent, pText)
	{
		let tmpTooltip = document.getElementById('Ultravisor-ReachabilityMap-Tooltip');
		if (!tmpTooltip) return;
		tmpTooltip.textContent = pText;
		tmpTooltip.classList.add('visible');
		let tmpContainer = tmpTooltip.parentElement;
		if (tmpContainer)
		{
			let tmpRect = tmpContainer.getBoundingClientRect();
			tmpTooltip.style.left = (pEvent.clientX - tmpRect.left + 12) + 'px';
			tmpTooltip.style.top = (pEvent.clientY - tmpRect.top - 8) + 'px';
		}
	}

	hideTooltip()
	{
		let tmpTooltip = document.getElementById('Ultravisor-ReachabilityMap-Tooltip');
		if (tmpTooltip) { tmpTooltip.classList.remove('visible'); }
	}

	// ── Helpers ──

	_escapeHTML(pString)
	{
		if (typeof pString !== 'string') return '';
		return pString
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	_escapeAttr(pString)
	{
		if (typeof pString !== 'string') return '';
		return pString
			.replace(/&/g, '&amp;')
			.replace(/'/g, '&#39;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}
}

module.exports = UltravisorReachabilityMapView;

module.exports.default_configuration = _ViewConfiguration;
