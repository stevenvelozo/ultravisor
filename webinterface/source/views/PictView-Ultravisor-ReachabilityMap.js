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
			height: 420px;
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
			gap: 1.5em;
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
		.ultravisor-reachability-legend-line.reachable {
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
			<div class="ultravisor-reachability-legend-line reachable"></div>
			<span>Direct</span>
		</div>
		<div class="ultravisor-reachability-legend-item">
			<div class="ultravisor-reachability-legend-line unreachable"></div>
			<span>Unreachable</span>
		</div>
		<div class="ultravisor-reachability-legend-item">
			<div class="ultravisor-reachability-legend-line untested"></div>
			<span>Untested</span>
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
		let tmpBeacons = this.pict.AppData.Ultravisor.Beacons || [];
		let tmpMatrix = this.pict.AppData.Ultravisor.ReachabilityMatrix || [];

		if (tmpBeacons.length < 2)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-ReachabilityMap-Canvas',
				'<div class="ultravisor-reachability-map-empty">At least two beacons are needed to display the reachability map.</div>');
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
		let tmpHeight = 400;
		let tmpCenterX = tmpWidth / 2;
		let tmpCenterY = tmpHeight / 2;
		let tmpRadius = Math.min(tmpWidth, tmpHeight) * 0.35;
		let tmpNodeRadius = 28;
		let tmpHubRadius = 22;

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

		// Draw connection lines between all beacon pairs
		for (let i = 0; i < tmpBeacons.length; i++)
		{
			for (let j = i + 1; j < tmpBeacons.length; j++)
			{
				let tmpA = tmpBeacons[i];
				let tmpB = tmpBeacons[j];

				// Check both directions; take the "best" status
				let tmpAB = tmpLookup[tmpA.BeaconID + '::' + tmpB.BeaconID];
				let tmpBA = tmpLookup[tmpB.BeaconID + '::' + tmpA.BeaconID];

				let tmpStatus = this._combinedStatus(tmpAB, tmpBA);
				let tmpLatency = this._bestLatency(tmpAB, tmpBA);
				let tmpLastProbe = this._latestProbe(tmpAB, tmpBA);

				let tmpLineColor = '#9e9e9e'; // untested
				let tmpDashArray = '3,5';
				if (tmpStatus === 'reachable')
				{
					tmpLineColor = '#66bb6a';
					tmpDashArray = '';
				}
				else if (tmpStatus === 'unreachable')
				{
					tmpLineColor = '#ef5350';
					tmpDashArray = '6,4';
				}

				let tmpX1 = tmpPositions[i].x;
				let tmpY1 = tmpPositions[i].y;
				let tmpX2 = tmpPositions[j].x;
				let tmpY2 = tmpPositions[j].y;

				let tmpTooltipData = this._escapeAttr(tmpA.Name) + ' ↔ ' + this._escapeAttr(tmpB.Name)
					+ ' | ' + tmpStatus;
				if (tmpLatency !== null)
				{
					tmpTooltipData += ' | ' + tmpLatency + 'ms';
				}
				if (tmpLastProbe)
				{
					tmpTooltipData += ' | ' + tmpLastProbe;
				}

				tmpSVG += '<line x1="' + tmpX1 + '" y1="' + tmpY1 + '" x2="' + tmpX2 + '" y2="' + tmpY2 + '"'
					+ ' stroke="' + tmpLineColor + '" stroke-width="2"'
					+ (tmpDashArray ? ' stroke-dasharray="' + tmpDashArray + '"' : '')
					+ ' style="cursor:pointer;"'
					+ ' onmousemove="' + tmpViewRef + '.showTooltip(event, \'' + this._escapeAttr(tmpTooltipData) + '\')"'
					+ ' onmouseleave="' + tmpViewRef + '.hideTooltip()"'
					+ '/>';
			}
		}

		// Draw hub lines (Ultravisor center to each beacon)
		for (let i = 0; i < tmpBeacons.length; i++)
		{
			tmpSVG += '<line x1="' + tmpCenterX + '" y1="' + tmpCenterY + '"'
				+ ' x2="' + tmpPositions[i].x + '" y2="' + tmpPositions[i].y + '"'
				+ ' stroke="var(--uv-border-subtle)" stroke-width="1" stroke-dasharray="2,4" opacity="0.5"/>';
		}

		// Draw Ultravisor hub circle
		tmpSVG += '<circle cx="' + tmpCenterX + '" cy="' + tmpCenterY + '" r="' + tmpHubRadius + '"'
			+ ' fill="var(--uv-bg-elevated)" stroke="var(--uv-brand)" stroke-width="2"/>';
		tmpSVG += '<text x="' + tmpCenterX + '" y="' + (tmpCenterY + 4) + '"'
			+ ' text-anchor="middle" fill="var(--uv-brand)" font-size="9" font-weight="600">UV</text>';

		// Draw beacon nodes
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

			tmpSVG += '<g opacity="' + tmpOpacity + '">';
			tmpSVG += '<circle cx="' + tmpX + '" cy="' + tmpY + '" r="' + tmpNodeRadius + '"'
				+ ' fill="' + tmpFill + '" stroke="' + tmpStroke + '" stroke-width="2"/>';

			// Beacon name (truncated)
			let tmpDisplayName = tmpBeacon.Name || tmpBeacon.BeaconID || '?';
			if (tmpDisplayName.length > 10)
			{
				tmpDisplayName = tmpDisplayName.substring(0, 9) + '…';
			}
			tmpSVG += '<text x="' + tmpX + '" y="' + (tmpY + 3) + '"'
				+ ' text-anchor="middle" fill="' + tmpTextColor + '"'
				+ ' font-size="9" font-weight="500">' + this._escapeHTML(tmpDisplayName) + '</text>';

			// Status dot
			let tmpDotColor = tmpIsOnline ? '#66bb6a' : '#757575';
			tmpSVG += '<circle cx="' + (tmpX + tmpNodeRadius - 4) + '" cy="' + (tmpY - tmpNodeRadius + 4) + '"'
				+ ' r="4" fill="' + tmpDotColor + '"/>';

			tmpSVG += '</g>';
		}

		tmpSVG += '</svg>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-ReachabilityMap-Canvas', tmpSVG);
	}

	// --- Status Helpers ---

	_combinedStatus(pEntryAB, pEntryBA)
	{
		let tmpStatusA = pEntryAB ? pEntryAB.Status : 'untested';
		let tmpStatusB = pEntryBA ? pEntryBA.Status : 'untested';

		// If either direction is reachable, call the pair reachable
		if (tmpStatusA === 'reachable' || tmpStatusB === 'reachable')
		{
			return 'reachable';
		}
		// If either is unreachable (and neither is reachable), call it unreachable
		if (tmpStatusA === 'unreachable' || tmpStatusB === 'unreachable')
		{
			return 'unreachable';
		}
		return 'untested';
	}

	_bestLatency(pEntryAB, pEntryBA)
	{
		let tmpA = pEntryAB && pEntryAB.ProbeLatencyMs !== null ? pEntryAB.ProbeLatencyMs : null;
		let tmpB = pEntryBA && pEntryBA.ProbeLatencyMs !== null ? pEntryBA.ProbeLatencyMs : null;

		if (tmpA !== null && tmpB !== null)
		{
			return Math.min(tmpA, tmpB);
		}
		return tmpA !== null ? tmpA : tmpB;
	}

	_latestProbe(pEntryAB, pEntryBA)
	{
		let tmpA = pEntryAB ? pEntryAB.LastProbeAt : null;
		let tmpB = pEntryBA ? pEntryBA.LastProbeAt : null;

		if (tmpA && tmpB)
		{
			return new Date(tmpA) > new Date(tmpB) ? tmpA : tmpB;
		}
		return tmpA || tmpB || null;
	}

	// --- Tooltip ---

	showTooltip(pEvent, pText)
	{
		let tmpTooltip = document.getElementById('Ultravisor-ReachabilityMap-Tooltip');
		if (!tmpTooltip)
		{
			return;
		}

		tmpTooltip.textContent = pText;
		tmpTooltip.classList.add('visible');

		// Position relative to the map container
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
		if (tmpTooltip)
		{
			tmpTooltip.classList.remove('visible');
		}
	}

	// --- Helpers ---

	_escapeHTML(pString)
	{
		if (typeof pString !== 'string')
		{
			return '';
		}
		return pString
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	_escapeAttr(pString)
	{
		if (typeof pString !== 'string')
		{
			return '';
		}
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
