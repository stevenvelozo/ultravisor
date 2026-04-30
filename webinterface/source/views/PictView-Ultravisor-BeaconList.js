const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-BeaconList",

	DefaultRenderable: "Ultravisor-BeaconList-Content",
	DefaultDestinationAddress: "#Ultravisor-Content-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-beaconlist {
			padding: 2em;
			max-width: 1400px;
			margin: 0 auto;
		}
		.ultravisor-beaconlist-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1.5em;
			padding-bottom: 1em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.ultravisor-beaconlist-header h1 {
			margin: 0;
			font-size: 2em;
			font-weight: 300;
			color: var(--uv-text);
		}

		/* Summary bar */
		.ultravisor-beacon-summary {
			display: flex;
			gap: 1em;
			margin-bottom: 1.5em;
		}
		.ultravisor-beacon-summary-card {
			display: flex;
			align-items: center;
			gap: 0.5em;
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 8px;
			padding: 0.6em 1.2em;
		}
		.ultravisor-beacon-summary-count {
			font-size: 1.5em;
			font-weight: 700;
			color: var(--uv-text);
		}
		.ultravisor-beacon-summary-label {
			font-size: 0.8em;
			color: var(--uv-text-secondary);
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}
		.ultravisor-beacon-summary-card.online .ultravisor-beacon-summary-count {
			color: var(--uv-success);
		}
		.ultravisor-beacon-summary-card.busy .ultravisor-beacon-summary-count {
			color: var(--uv-info);
		}
		.ultravisor-beacon-summary-card.offline .ultravisor-beacon-summary-count {
			color: var(--uv-text-tertiary);
		}

		/* Beacon table */
		.ultravisor-beacon-table {
			width: 100%;
			border-collapse: collapse;
		}
		.ultravisor-beacon-table th {
			background-color: var(--uv-bg-surface);
			text-align: left;
			padding: 0.6em 0.75em;
			font-size: 0.8em;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--uv-text-secondary);
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.ultravisor-beacon-table td {
			padding: 0.6em 0.75em;
			border-bottom: 1px solid var(--uv-border-subtle);
			font-size: 0.9em;
		}
		.ultravisor-beacon-table tr:hover td {
			background-color: var(--uv-table-row-hover);
		}

		/* Status badge */
		.ultravisor-beacon-status {
			display: inline-flex;
			align-items: center;
			gap: 0.4em;
			padding: 0.15em 0.6em;
			border-radius: 3px;
			font-size: 0.8em;
			font-weight: 600;
		}
		.ultravisor-beacon-status-dot {
			width: 7px;
			height: 7px;
			border-radius: 50%;
			display: inline-block;
		}
		.ultravisor-beacon-status.online {
			background-color: #1b5e20;
			color: #a5d6a7;
		}
		.ultravisor-beacon-status.online .ultravisor-beacon-status-dot {
			background-color: #66bb6a;
		}
		.ultravisor-beacon-status.busy {
			background-color: #0d47a1;
			color: #90caf9;
		}
		.ultravisor-beacon-status.busy .ultravisor-beacon-status-dot {
			background-color: #42a5f5;
		}
		.ultravisor-beacon-status.offline {
			background-color: #424242;
			color: #9e9e9e;
		}
		.ultravisor-beacon-status.offline .ultravisor-beacon-status-dot {
			background-color: #757575;
		}

		/* Capability tags */
		.ultravisor-beacon-cap-tag {
			display: inline-block;
			padding: 0.1em 0.5em;
			border-radius: 10px;
			font-size: 0.75em;
			font-weight: 600;
			background-color: var(--uv-bg-elevated);
			color: var(--uv-brand);
			border: 1px solid var(--uv-border-subtle);
			margin-right: 0.3em;
			margin-bottom: 0.2em;
		}

		/* Detail panel */
		.ultravisor-beacon-detail {
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 8px;
			padding: 1.5em;
			margin-top: 1em;
			display: none;
		}
		.ultravisor-beacon-detail.visible {
			display: block;
		}
		.ultravisor-beacon-detail h3 {
			margin: 0 0 0.75em 0;
			color: var(--uv-text-secondary);
			font-weight: 400;
		}
		.ultravisor-beacon-detail-grid {
			display: grid;
			grid-template-columns: 1fr 1fr 1fr;
			gap: 1em;
			margin-bottom: 1em;
		}
		.ultravisor-beacon-detail-field {
			background: var(--uv-bg-base);
			border-radius: 4px;
			padding: 0.6em 0.8em;
		}
		.ultravisor-beacon-detail-field-label {
			font-size: 0.7em;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--uv-text-tertiary);
			margin-bottom: 0.2em;
		}
		.ultravisor-beacon-detail-field-value {
			font-size: 0.9em;
			color: var(--uv-text);
			word-break: break-all;
		}
		.ultravisor-beacon-detail-field-value code {
			color: var(--uv-brand);
			font-size: 0.85em;
		}

		/* Section headers */
		.ultravisor-beacon-section {
			margin-top: 2em;
		}
		.ultravisor-beacon-section-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1em;
			padding-bottom: 0.5em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.ultravisor-beacon-section-header h2 {
			margin: 0;
			font-size: 1.4em;
			font-weight: 300;
			color: var(--uv-text);
		}

		/* Work item status */
		.ultravisor-workitem-status {
			display: inline-block;
			padding: 0.15em 0.5em;
			border-radius: 3px;
			font-size: 0.8em;
			font-weight: 600;
		}
		.ultravisor-workitem-status.pending {
			background-color: #e65100;
			color: #ffe0b2;
		}
		.ultravisor-workitem-status.assigned {
			background-color: #4527a0;
			color: #d1c4e9;
		}
		.ultravisor-workitem-status.running {
			background-color: var(--uv-info);
			color: var(--uv-text-heading);
		}
		.ultravisor-workitem-status.complete {
			background-color: #2e7d32;
			color: #c8e6c9;
		}
		.ultravisor-workitem-status.error {
			background-color: #c62828;
			color: #ffcdd2;
		}
		.ultravisor-workitem-status.timeout {
			background-color: #f57f17;
			color: #fff9c4;
		}

		/* Progress bar */
		.ultravisor-workitem-progress {
			display: flex;
			align-items: center;
			gap: 0.5em;
		}
		.ultravisor-workitem-progress-bar {
			width: 60px;
			height: 6px;
			background-color: var(--uv-bg-base);
			border-radius: 3px;
			overflow: hidden;
		}
		.ultravisor-workitem-progress-fill {
			height: 100%;
			background-color: var(--uv-brand);
			border-radius: 3px;
			transition: width 0.3s;
		}
		.ultravisor-workitem-progress-text {
			font-size: 0.75em;
			color: var(--uv-text-secondary);
		}

		/* Empty state */
		.ultravisor-beacon-empty {
			text-align: center;
			padding: 3em;
			color: var(--uv-text-tertiary);
			font-size: 0.95em;
		}

		/* Auto-refresh indicator */
		.ultravisor-beacon-refresh-indicator {
			font-size: 0.75em;
			color: var(--uv-text-tertiary);
			display: flex;
			align-items: center;
			gap: 0.4em;
		}
		.ultravisor-beacon-refresh-dot {
			width: 6px;
			height: 6px;
			border-radius: 50%;
			background-color: var(--uv-success);
			animation: ultravisor-pulse 2s ease-in-out infinite;
		}
		@keyframes ultravisor-pulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.3; }
		}

		/* Queue snapshot — live counters + per-capability table.
		   Mirrors ultravisor-lab's Queue Lab tab so cross-checking
		   the same UV from both UIs is a glance comparison. */
		.uv-queue-snap-tag {
			margin-left: auto;
			font-size: 0.75em;
			color: var(--uv-text-tertiary);
			font-weight: 400;
		}
		.uv-queue-snap-buckets {
			display: grid;
			grid-template-columns: repeat(5, 1fr);
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 8px;
			overflow: hidden;
		}
		.uv-queue-snap-bucket {
			padding: 1em;
			text-align: center;
			border-right: 1px solid var(--uv-border-subtle);
		}
		.uv-queue-snap-bucket:last-child { border-right: none; }
		.uv-queue-snap-bucket .uv-queue-snap-value {
			font-size: 1.8em;
			font-weight: 600;
			color: var(--uv-text);
		}
		.uv-queue-snap-bucket .uv-queue-snap-label {
			font-size: 0.7em;
			color: var(--uv-text-secondary);
			text-transform: uppercase;
			letter-spacing: 0.5px;
			margin-top: 0.3em;
		}
		.uv-queue-snap-bucket.bucket-upcoming   .uv-queue-snap-value { color: #e65100; }
		.uv-queue-snap-bucket.bucket-inprogress .uv-queue-snap-value { color: var(--uv-info); }
		.uv-queue-snap-bucket.bucket-stalled    .uv-queue-snap-value { color: #f57f17; }
		.uv-queue-snap-bucket.bucket-completed  .uv-queue-snap-value { color: var(--uv-success); }
		.uv-queue-snap-bucket.bucket-errored    .uv-queue-snap-value { color: var(--uv-error, #c62828); }

		.uv-queue-snap-bycap {
			margin-top: 0.75em;
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 8px;
			overflow: hidden;
		}
		.uv-queue-snap-bycap table { width: 100%; border-collapse: collapse; font-size: 0.85em; }
		.uv-queue-snap-bycap th, .uv-queue-snap-bycap td {
			padding: 0.5em 1em;
			text-align: left;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.uv-queue-snap-bycap th {
			color: var(--uv-text-secondary);
			text-transform: uppercase;
			letter-spacing: 0.5px;
			font-size: 0.7em;
			font-weight: 600;
			background: var(--uv-bg-base);
		}
		.uv-queue-snap-bycap tr:last-child td { border-bottom: none; }
		.uv-queue-snap-bycap .uv-queue-snap-empty {
			padding: 1em;
			text-align: center;
			color: var(--uv-text-tertiary);
			font-size: 0.85em;
		}
		.uv-queue-snap-source {
			margin-left: 0.6em;
			font-size: 0.65em;
			color: var(--uv-text-tertiary);
			font-weight: 400;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			padding: 0.1em 0.5em;
			border-radius: 3px;
			background: var(--uv-bg-base);
		}
		.uv-queue-snap-source.live { color: var(--uv-success); }
		.uv-queue-snap-source.stale { color: var(--uv-text-tertiary); }
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-BeaconList-Template",
			Template: /*html*/`
<div class="ultravisor-beaconlist">
	<div class="ultravisor-beaconlist-header">
		<h1>Beacons</h1>
		<div style="display:flex; align-items:center; gap:1em;">
			<div class="ultravisor-beacon-refresh-indicator">
				<span class="ultravisor-beacon-refresh-dot"></span>
				<span>Auto-refresh</span>
			</div>
			<button class="ultravisor-btn ultravisor-btn-secondary" onclick="{~P~}.views['Ultravisor-BeaconList'].refreshAll()">Refresh</button>
		</div>
	</div>
	<div id="Ultravisor-BeaconList-Summary"></div>
	<div id="Ultravisor-BeaconList-Body"></div>
	<div id="Ultravisor-BeaconList-Detail"></div>
	<div class="ultravisor-beacon-section">
		<div class="ultravisor-beacon-section-header">
			<h2>Reachability Map</h2>
			<button class="ultravisor-btn ultravisor-btn-secondary" onclick="{~P~}.views['Ultravisor-BeaconList'].probeAll()">Probe All</button>
		</div>
		<div id="Ultravisor-BeaconList-ReachabilityMap"></div>
	</div>
	<div class="ultravisor-beacon-section" id="Ultravisor-BeaconList-QueueSnapshot-Section">
		<div class="ultravisor-beacon-section-header">
			<h2>Queue Snapshot <span id="Ultravisor-BeaconList-QueueSnapshot-Source" class="uv-queue-snap-source stale">REST</span></h2>
			<span id="Ultravisor-BeaconList-QueueSnapshot-Tag" class="uv-queue-snap-tag">no data yet</span>
		</div>
		<div id="Ultravisor-BeaconList-QueueSnapshot"></div>
	</div>
	<div class="ultravisor-beacon-section" id="Ultravisor-BeaconList-WorkQueue-Section">
		<div class="ultravisor-beacon-section-header">
			<h2>Work Queue</h2>
		</div>
		<div id="Ultravisor-BeaconList-WorkQueue"></div>
	</div>
	<div class="ultravisor-beacon-section" id="Ultravisor-BeaconList-Affinity-Section">
		<div class="ultravisor-beacon-section-header">
			<h2>Affinity Bindings</h2>
		</div>
		<div id="Ultravisor-BeaconList-Affinity"></div>
	</div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-BeaconList-Content",
			TemplateHash: "Ultravisor-BeaconList-Template",
			DestinationAddress: "#Ultravisor-Content-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorBeaconListView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this._refreshTimer = null;
		this._QueueWS = null;
		this._QueueLastEventGUID = null;
		this._QueueSummary = null;  // last-known {Buckets, ByCapability, At}
	}

	onBeforeRender(pRenderable, pRenderDestinationAddress, pRecord)
	{
		// Stop auto-refresh when leaving this view
		if (this._refreshTimer)
		{
			clearInterval(this._refreshTimer);
			this._refreshTimer = null;
		}
		this._closeQueueSocket();

		return super.onBeforeRender(pRenderable, pRenderDestinationAddress, pRecord);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.refreshAll();

		// Start auto-refresh every 10 seconds
		if (this._refreshTimer)
		{
			clearInterval(this._refreshTimer);
		}
		this._refreshTimer = setInterval(
			function ()
			{
				this._silentRefresh();
			}.bind(this), 10000);

		// Open the queue.* WebSocket so the snapshot card stays live.
		// This is intentionally narrow: it only consumes queue.summary
		// envelopes -- enough to spot inconsistencies between this UV
		// and any external dashboard (e.g. the lab's Queue Lab tab).
		this._openQueueSocket();
		this.renderQueueSnapshot();

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	_openQueueSocket()
	{
		this._closeQueueSocket();

		let tmpProtocol = (window.location.protocol === 'https:') ? 'wss:' : 'ws:';
		let tmpHost = window.location.host;
		let tmpBaseURL = (this.pict.AppData.Ultravisor && this.pict.AppData.Ultravisor.APIBaseURL) || '';
		if (tmpBaseURL)
		{
			try
			{
				let tmpURL = new URL(tmpBaseURL);
				tmpHost = tmpURL.host;
				tmpProtocol = (tmpURL.protocol === 'https:') ? 'wss:' : 'ws:';
			}
			catch (pError) { /* fall back to page location */ }
		}

		let tmpWSURL = tmpProtocol + '//' + tmpHost;
		let tmpWS;
		try { tmpWS = new WebSocket(tmpWSURL); }
		catch (pError)
		{
			this.pict.log.warn('BeaconList: queue WebSocket failed to open: ' + pError.message);
			return;
		}
		this._QueueWS = tmpWS;

		tmpWS.onopen = function ()
		{
			tmpWS.send(JSON.stringify({ Action: 'QueueSubscribe', LastEventGUID: this._QueueLastEventGUID }));
		}.bind(this);

		tmpWS.onmessage = function (pEvent)
		{
			let tmpEnvelope;
			try { tmpEnvelope = JSON.parse(pEvent.data); }
			catch (pError) { return; }
			if (!tmpEnvelope || typeof tmpEnvelope !== 'object') { return; }
			if (tmpEnvelope.EventGUID) { this._QueueLastEventGUID = tmpEnvelope.EventGUID; }
			if (tmpEnvelope.Topic === 'queue.summary')
			{
				this._QueueSummary = tmpEnvelope.Payload || null;
				this.renderQueueSnapshot();
			}
			else if (tmpEnvelope.Topic === 'queue.reset')
			{
				// History gap -- mark snapshot as stale until a fresh
				// summary lands.  The next queue.summary will overwrite.
				this._QueueSummary = null;
				this.renderQueueSnapshot();
			}
		}.bind(this);

		tmpWS.onerror = function ()
		{
			this.pict.log.warn('BeaconList: queue WebSocket error');
		}.bind(this);

		tmpWS.onclose = function ()
		{
			if (this._QueueWS === tmpWS) { this._QueueWS = null; }
		}.bind(this);
	}

	_closeQueueSocket()
	{
		if (!this._QueueWS) { return; }
		let tmpWS = this._QueueWS;
		this._QueueWS = null;
		try { tmpWS.send(JSON.stringify({ Action: 'QueueUnsubscribe' })); } catch (pError) { /* best effort */ }
		try { tmpWS.close(); } catch (pError) { /* best effort */ }
	}

	renderQueueSnapshot()
	{
		// Source label: shows whether the card is reading live WS frames
		// or has only the initial REST-poll baseline.  Operators glancing
		// between this UV and any external dashboard (lab Queue Lab tab,
		// for instance) can confirm which one is fresher when numbers
		// disagree.
		let tmpSourceEl = document.getElementById('Ultravisor-BeaconList-QueueSnapshot-Source');
		let tmpTagEl    = document.getElementById('Ultravisor-BeaconList-QueueSnapshot-Tag');
		let tmpHasWS    = !!this._QueueWS && this._QueueWS.readyState === WebSocket.OPEN;
		if (tmpSourceEl)
		{
			tmpSourceEl.textContent = tmpHasWS ? 'LIVE (queue.summary)' : 'REST';
			tmpSourceEl.className = 'uv-queue-snap-source ' + (tmpHasWS ? 'live' : 'stale');
		}

		let tmpSummary = this._QueueSummary;
		// Fall back to a REST-derived snapshot computed from WorkItems
		// when no WS frame has landed yet.  Counts won't match the
		// scheduler's per-bucket logic exactly (the WS path includes
		// items that landed in persistence after this list was fetched),
		// but they're close enough to confirm the section is wired.
		if (!tmpSummary)
		{
			tmpSummary = this._summaryFromWorkItems();
		}

		let tmpAt = tmpSummary && tmpSummary.At ? tmpSummary.At : null;
		if (tmpTagEl)
		{
			tmpTagEl.textContent = tmpAt
				? ('updated ' + this._plainRelativeTime(tmpAt))
				: 'no data yet';
		}

		let tmpBuckets = (tmpSummary && tmpSummary.Buckets)
			|| { Upcoming: 0, InProgress: 0, Stalled: 0, Completed: 0, Errored: 0 };
		let tmpByCap = (tmpSummary && Array.isArray(tmpSummary.ByCapability))
			? tmpSummary.ByCapability
			: [];

		let tmpHTML = '<div class="uv-queue-snap-buckets">';
		let tmpBucketCells =
		[
			{ key: 'Upcoming',   label: 'Upcoming',    cls: 'bucket-upcoming' },
			{ key: 'InProgress', label: 'In Progress', cls: 'bucket-inprogress' },
			{ key: 'Stalled',    label: 'Stalled',     cls: 'bucket-stalled' },
			{ key: 'Completed',  label: 'Completed',   cls: 'bucket-completed' },
			{ key: 'Errored',    label: 'Errored',     cls: 'bucket-errored' }
		];
		for (let i = 0; i < tmpBucketCells.length; i++)
		{
			let tmpCell = tmpBucketCells[i];
			tmpHTML += '<div class="uv-queue-snap-bucket ' + tmpCell.cls + '">';
			tmpHTML += '<div class="uv-queue-snap-value">' + (tmpBuckets[tmpCell.key] || 0) + '</div>';
			tmpHTML += '<div class="uv-queue-snap-label">' + tmpCell.label + '</div>';
			tmpHTML += '</div>';
		}
		tmpHTML += '</div>';

		tmpHTML += '<div class="uv-queue-snap-bycap">';
		if (tmpByCap.length === 0)
		{
			tmpHTML += '<div class="uv-queue-snap-empty">No capabilities currently in flight.</div>';
		}
		else
		{
			tmpHTML += '<table>';
			tmpHTML += '<thead><tr><th>Capability</th><th>Action</th><th>Queued</th><th>Running</th><th>Stalled</th></tr></thead>';
			tmpHTML += '<tbody>';
			for (let i = 0; i < tmpByCap.length; i++)
			{
				let tmpRow = tmpByCap[i];
				tmpHTML += '<tr>';
				tmpHTML += '<td>' + this._escapeHTML(tmpRow.Capability || '') + '</td>';
				tmpHTML += '<td>' + this._escapeHTML(tmpRow.Action || '') + '</td>';
				tmpHTML += '<td>' + (tmpRow.Queued || 0) + '</td>';
				tmpHTML += '<td>' + (tmpRow.Running || 0) + '</td>';
				tmpHTML += '<td>' + (tmpRow.Stalled || 0) + '</td>';
				tmpHTML += '</tr>';
			}
			tmpHTML += '</tbody></table>';
		}
		tmpHTML += '</div>';

		this.pict.ContentAssignment.assignContent('#Ultravisor-BeaconList-QueueSnapshot', tmpHTML);
	}

	_plainRelativeTime(pISO)
	{
		// Plain-text variant of _formatRelativeTime -- the queue snapshot
		// tag uses textContent (no HTML), so we keep this plain to avoid
		// double-escaping the <span title> wrapper the original returns.
		if (!pISO) { return ''; }
		let tmpDelta = Math.max(0, Date.now() - Date.parse(pISO));
		if (tmpDelta < 1500)  { return 'just now'; }
		if (tmpDelta < 60000) { return Math.round(tmpDelta / 1000) + 's ago'; }
		return Math.round(tmpDelta / 60000) + 'm ago';
	}

	_summaryFromWorkItems()
	{
		let tmpItems = (this.pict.AppData.Ultravisor && this.pict.AppData.Ultravisor.WorkItems) || [];
		if (tmpItems.length === 0) { return null; }
		let tmpBuckets = { Upcoming: 0, InProgress: 0, Stalled: 0, Completed: 0, Errored: 0 };
		let tmpByCapMap = new Map();
		for (let i = 0; i < tmpItems.length; i++)
		{
			let tmpItem = tmpItems[i];
			let tmpStatus = (tmpItem.Status || '').toLowerCase();
			if (tmpStatus === 'pending' || tmpStatus === 'assigned') { tmpBuckets.Upcoming++; }
			else if (tmpStatus === 'running' || tmpStatus === 'dispatched') { tmpBuckets.InProgress++; }
			else if (tmpStatus === 'complete') { tmpBuckets.Completed++; }
			else if (tmpStatus === 'error' || tmpStatus === 'timeout' || tmpStatus === 'failed') { tmpBuckets.Errored++; }

			let tmpKey = (tmpItem.Capability || '') + '' + (tmpItem.Action || '');
			let tmpRow = tmpByCapMap.get(tmpKey);
			if (!tmpRow)
			{
				tmpRow = { Capability: tmpItem.Capability || '', Action: tmpItem.Action || '', Queued: 0, Running: 0, Stalled: 0 };
				tmpByCapMap.set(tmpKey, tmpRow);
			}
			if (tmpStatus === 'pending' || tmpStatus === 'assigned') { tmpRow.Queued++; }
			else if (tmpStatus === 'running' || tmpStatus === 'dispatched') { tmpRow.Running++; }
		}
		return {
			At: new Date().toISOString(),
			Buckets: tmpBuckets,
			ByCapability: Array.from(tmpByCapMap.values()).filter((pR) => pR.Queued > 0 || pR.Running > 0 || pR.Stalled > 0)
		};
	}

	refreshAll()
	{
		let tmpPendingCalls = 4;
		let tmpDone = function ()
		{
			tmpPendingCalls--;
			if (tmpPendingCalls <= 0)
			{
				this.renderBeaconSummary();
				this.renderBeaconTable();
				this.renderReachabilityMap();
				this.renderWorkQueue();
				this.renderAffinityTable();
				this.renderQueueSnapshot();
			}
		}.bind(this);

		this.pict.PictApplication.loadBeacons(tmpDone);
		this.pict.PictApplication.loadWorkItems(tmpDone);
		this.pict.PictApplication.loadAffinityBindings(tmpDone);
		this.pict.PictApplication.loadReachabilityMatrix(tmpDone);
	}

	_silentRefresh()
	{
		// Same as refreshAll but doesn't clear the detail panel
		let tmpPendingCalls = 4;
		let tmpDone = function ()
		{
			tmpPendingCalls--;
			if (tmpPendingCalls <= 0)
			{
				this.renderBeaconSummary();
				this.renderBeaconTable();
				this.renderReachabilityMap();
				this.renderWorkQueue();
				this.renderAffinityTable();
				this.renderQueueSnapshot();
			}
		}.bind(this);

		this.pict.PictApplication.loadBeacons(tmpDone);
		this.pict.PictApplication.loadWorkItems(tmpDone);
		this.pict.PictApplication.loadAffinityBindings(tmpDone);
		this.pict.PictApplication.loadReachabilityMatrix(tmpDone);
	}

	renderBeaconSummary()
	{
		let tmpBeacons = this.pict.AppData.Ultravisor.Beacons || [];
		let tmpOnline = 0;
		let tmpBusy = 0;
		let tmpOffline = 0;

		for (let i = 0; i < tmpBeacons.length; i++)
		{
			let tmpStatus = (tmpBeacons[i].Status || '').toLowerCase();
			if (tmpStatus === 'online')
			{
				tmpOnline++;
			}
			else if (tmpStatus === 'busy')
			{
				tmpBusy++;
			}
			else
			{
				tmpOffline++;
			}
		}

		let tmpHTML = '<div class="ultravisor-beacon-summary">';
		tmpHTML += '<div class="ultravisor-beacon-summary-card"><div class="ultravisor-beacon-summary-count">' + tmpBeacons.length + '</div><div class="ultravisor-beacon-summary-label">Total</div></div>';
		tmpHTML += '<div class="ultravisor-beacon-summary-card online"><div class="ultravisor-beacon-summary-count">' + tmpOnline + '</div><div class="ultravisor-beacon-summary-label">Online</div></div>';
		tmpHTML += '<div class="ultravisor-beacon-summary-card busy"><div class="ultravisor-beacon-summary-count">' + tmpBusy + '</div><div class="ultravisor-beacon-summary-label">Busy</div></div>';
		tmpHTML += '<div class="ultravisor-beacon-summary-card offline"><div class="ultravisor-beacon-summary-count">' + tmpOffline + '</div><div class="ultravisor-beacon-summary-label">Offline</div></div>';
		tmpHTML += '</div>';

		this.pict.ContentAssignment.assignContent('#Ultravisor-BeaconList-Summary', tmpHTML);
	}

	renderBeaconTable()
	{
		let tmpBeacons = this.pict.AppData.Ultravisor.Beacons || [];
		let tmpViewRef = "_Pict.views['Ultravisor-BeaconList']";

		if (tmpBeacons.length === 0)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-BeaconList-Body',
				'<div class="ultravisor-beacon-empty">No beacons connected. Start a beacon-enabled application to see it appear here.</div>');
			return;
		}

		let tmpHTML = '<table class="ultravisor-beacon-table">';
		tmpHTML += '<thead><tr>';
		tmpHTML += '<th>Name</th>';
		tmpHTML += '<th>Status</th>';
		tmpHTML += '<th>Capabilities</th>';
		tmpHTML += '<th>Work Items</th>';
		tmpHTML += '<th>Last Heartbeat</th>';
		tmpHTML += '<th>Registered</th>';
		tmpHTML += '<th>Actions</th>';
		tmpHTML += '</tr></thead>';
		tmpHTML += '<tbody>';

		for (let i = 0; i < tmpBeacons.length; i++)
		{
			let tmpBeacon = tmpBeacons[i];
			let tmpStatusClass = (tmpBeacon.Status || 'offline').toLowerCase();
			if (tmpStatusClass !== 'online' && tmpStatusClass !== 'busy' && tmpStatusClass !== 'offline')
			{
				tmpStatusClass = 'offline';
			}
			let tmpEscID = this._escapeAttr(tmpBeacon.BeaconID || '');

			// Capability tags
			let tmpCaps = tmpBeacon.Capabilities || [];
			let tmpCapsHTML = '';
			for (let c = 0; c < tmpCaps.length; c++)
			{
				tmpCapsHTML += '<span class="ultravisor-beacon-cap-tag">' + this._escapeHTML(tmpCaps[c]) + '</span>';
			}
			if (tmpCaps.length === 0)
			{
				tmpCapsHTML = '<span style="color:var(--uv-text-tertiary);">none</span>';
			}

			// Work item count
			let tmpWorkCount = (tmpBeacon.CurrentWorkItems || []).length;

			tmpHTML += '<tr>';
			tmpHTML += '<td><strong>' + this._escapeHTML(tmpBeacon.Name || tmpBeacon.BeaconID || '') + '</strong></td>';
			tmpHTML += '<td><span class="ultravisor-beacon-status ' + tmpStatusClass + '"><span class="ultravisor-beacon-status-dot"></span>' + this._escapeHTML(tmpBeacon.Status || 'Offline') + '</span></td>';
			tmpHTML += '<td>' + tmpCapsHTML + '</td>';
			tmpHTML += '<td>' + tmpWorkCount + ' / ' + (tmpBeacon.MaxConcurrent || 1) + '</td>';
			tmpHTML += '<td>' + this._formatRelativeTime(tmpBeacon.LastHeartbeat) + '</td>';
			tmpHTML += '<td>' + this._formatRelativeTime(tmpBeacon.RegisteredAt) + '</td>';
			tmpHTML += '<td>';
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-edit" onclick="' + tmpViewRef + '.showBeaconDetail(\'' + tmpEscID + '\')">Details</button> ';
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-danger" onclick="' + tmpViewRef + '.deregisterBeacon(\'' + tmpEscID + '\')">Deregister</button>';
			tmpHTML += '</td>';
			tmpHTML += '</tr>';
		}

		tmpHTML += '</tbody></table>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-BeaconList-Body', tmpHTML);
	}

	showBeaconDetail(pBeaconID)
	{
		this.pict.PictApplication.loadBeacon(pBeaconID,
			function (pError, pBeacon)
			{
				if (pError || !pBeacon)
				{
					this.pict.ContentAssignment.assignContent('#Ultravisor-BeaconList-Detail',
						'<div class="ultravisor-beacon-detail visible"><p style="color:var(--uv-error);">Error loading beacon details.</p></div>');
					return;
				}

				let tmpHTML = '<div class="ultravisor-beacon-detail visible">';
				tmpHTML += '<h3>Beacon: ' + this._escapeHTML(pBeacon.Name || pBeacon.BeaconID || '') + '</h3>';

				// Detail grid
				tmpHTML += '<div class="ultravisor-beacon-detail-grid">';
				tmpHTML += this._renderDetailField('Beacon ID', '<code>' + this._escapeHTML(pBeacon.BeaconID || '') + '</code>');
				tmpHTML += this._renderDetailField('Name', this._escapeHTML(pBeacon.Name || ''));
				tmpHTML += this._renderDetailField('Status', this._escapeHTML(pBeacon.Status || 'Unknown'));
				tmpHTML += this._renderDetailField('Max Concurrent', String(pBeacon.MaxConcurrent || 1));
				tmpHTML += this._renderDetailField('Session ID', '<code>' + this._escapeHTML(pBeacon.SessionID || 'none') + '</code>');
				tmpHTML += this._renderDetailField('Registered', this._escapeHTML(pBeacon.RegisteredAt || ''));
				tmpHTML += this._renderDetailField('Last Heartbeat', this._escapeHTML(pBeacon.LastHeartbeat || '') + ' (' + this._formatRelativeTime(pBeacon.LastHeartbeat) + ')');
				tmpHTML += '</div>';

				// Capabilities
				let tmpCaps = pBeacon.Capabilities || [];
				if (tmpCaps.length > 0)
				{
					tmpHTML += '<h3>Capabilities</h3>';
					tmpHTML += '<div style="margin-bottom:1em;">';
					for (let c = 0; c < tmpCaps.length; c++)
					{
						tmpHTML += '<span class="ultravisor-beacon-cap-tag" style="font-size:0.85em;">' + this._escapeHTML(tmpCaps[c]) + '</span>';
					}
					tmpHTML += '</div>';
				}

				// Current work items
				let tmpWorkItems = pBeacon.CurrentWorkItems || [];
				if (tmpWorkItems.length > 0)
				{
					tmpHTML += '<h3>Current Work Items</h3>';
					tmpHTML += '<div style="font-family:monospace; font-size:0.85em; color:var(--uv-text-secondary);">';
					for (let w = 0; w < tmpWorkItems.length; w++)
					{
						tmpHTML += '<div>' + this._escapeHTML(tmpWorkItems[w]) + '</div>';
					}
					tmpHTML += '</div>';
				}

				// Tags
				let tmpTags = pBeacon.Tags || {};
				let tmpTagKeys = Object.keys(tmpTags);
				if (tmpTagKeys.length > 0)
				{
					tmpHTML += '<h3>Tags</h3>';
					tmpHTML += '<div class="ultravisor-beacon-detail-grid">';
					for (let t = 0; t < tmpTagKeys.length; t++)
					{
						tmpHTML += this._renderDetailField(this._escapeHTML(tmpTagKeys[t]), this._escapeHTML(String(tmpTags[tmpTagKeys[t]])));
					}
					tmpHTML += '</div>';
				}

				tmpHTML += '</div>';
				this.pict.ContentAssignment.assignContent('#Ultravisor-BeaconList-Detail', tmpHTML);
			}.bind(this));
	}

	deregisterBeacon(pBeaconID)
	{
		this.pict.views.Modal.confirm('Deregister beacon ' + pBeaconID + '? Any assigned work items will be released.', { confirmLabel: 'Deregister', dangerous: true }).then(
			function (pConfirmed)
			{
				if (pConfirmed)
				{
					this.pict.PictApplication.deregisterBeacon(pBeaconID,
						function (pError)
						{
							if (pError)
							{
								this.pict.log.error('Failed to deregister beacon: ' + pBeaconID, pError);
							}
							// Clear detail panel and refresh
							this.pict.ContentAssignment.assignContent('#Ultravisor-BeaconList-Detail', '');
							this.refreshAll();
						}.bind(this));
				}
			}.bind(this));
	}

	renderReachabilityMap()
	{
		let tmpMapView = this.pict.views['Ultravisor-ReachabilityMap'];
		if (tmpMapView)
		{
			// render() injects the template; onAfterRender calls renderMap()
			tmpMapView.render();
		}
	}

	probeAll()
	{
		this.pict.PictApplication.probeReachability(
			function ()
			{
				let tmpMapView = this.pict.views['Ultravisor-ReachabilityMap'];
				if (tmpMapView)
				{
					tmpMapView.renderMap();
				}
			}.bind(this));
	}

	renderWorkQueue()
	{
		let tmpWorkItems = this.pict.AppData.Ultravisor.WorkItems || [];

		if (tmpWorkItems.length === 0)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-BeaconList-WorkQueue',
				'<div class="ultravisor-beacon-empty" style="padding:1.5em;">No work items in the queue.</div>');
			return;
		}

		let tmpHTML = '<table class="ultravisor-beacon-table">';
		tmpHTML += '<thead><tr>';
		tmpHTML += '<th>Hash</th>';
		tmpHTML += '<th>Status</th>';
		tmpHTML += '<th>Capability</th>';
		tmpHTML += '<th>Action</th>';
		tmpHTML += '<th>Beacon</th>';
		tmpHTML += '<th>Progress</th>';
		tmpHTML += '<th>Created</th>';
		tmpHTML += '<th>Completed</th>';
		tmpHTML += '</tr></thead>';
		tmpHTML += '<tbody>';

		for (let i = 0; i < tmpWorkItems.length; i++)
		{
			let tmpItem = tmpWorkItems[i];
			let tmpStatusClass = (tmpItem.Status || '').toLowerCase();
			if (['pending', 'assigned', 'running', 'complete', 'error', 'timeout'].indexOf(tmpStatusClass) === -1)
			{
				tmpStatusClass = '';
			}

			// Progress
			let tmpProgressHTML = '';
			let tmpProgress = tmpItem.Progress || {};
			if (tmpItem.Status === 'Running' && typeof tmpProgress.Percent === 'number')
			{
				tmpProgressHTML = '<div class="ultravisor-workitem-progress">';
				tmpProgressHTML += '<div class="ultravisor-workitem-progress-bar"><div class="ultravisor-workitem-progress-fill" style="width:' + Math.min(tmpProgress.Percent, 100) + '%;"></div></div>';
				tmpProgressHTML += '<span class="ultravisor-workitem-progress-text">' + Math.round(tmpProgress.Percent) + '%</span>';
				tmpProgressHTML += '</div>';
			}
			else if (tmpProgress.Message)
			{
				tmpProgressHTML = '<span class="ultravisor-workitem-progress-text">' + this._escapeHTML(tmpProgress.Message) + '</span>';
			}

			tmpHTML += '<tr>';
			tmpHTML += '<td><code style="font-size:0.75em;">' + this._escapeHTML((tmpItem.WorkItemHash || '').substring(0, 20)) + '</code></td>';
			tmpHTML += '<td><span class="ultravisor-workitem-status ' + tmpStatusClass + '">' + this._escapeHTML(tmpItem.Status || '') + '</span></td>';
			tmpHTML += '<td>' + this._escapeHTML(tmpItem.Capability || '') + '</td>';
			tmpHTML += '<td>' + this._escapeHTML(tmpItem.Action || '') + '</td>';
			tmpHTML += '<td>' + this._escapeHTML(tmpItem.AssignedBeaconID ? tmpItem.AssignedBeaconID.substring(0, 15) : 'unassigned') + '</td>';
			tmpHTML += '<td>' + tmpProgressHTML + '</td>';
			tmpHTML += '<td>' + this._formatRelativeTime(tmpItem.CreatedAt) + '</td>';
			tmpHTML += '<td>' + (tmpItem.CompletedAt ? this._formatRelativeTime(tmpItem.CompletedAt) : '') + '</td>';
			tmpHTML += '</tr>';
		}

		tmpHTML += '</tbody></table>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-BeaconList-WorkQueue', tmpHTML);
	}

	renderAffinityTable()
	{
		let tmpBindings = this.pict.AppData.Ultravisor.AffinityBindings || [];

		if (tmpBindings.length === 0)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-BeaconList-Affinity',
				'<div class="ultravisor-beacon-empty" style="padding:1.5em;">No active affinity bindings.</div>');
			return;
		}

		let tmpHTML = '<table class="ultravisor-beacon-table">';
		tmpHTML += '<thead><tr>';
		tmpHTML += '<th>Affinity Key</th>';
		tmpHTML += '<th>Beacon</th>';
		tmpHTML += '<th>Run Hash</th>';
		tmpHTML += '<th>Created</th>';
		tmpHTML += '<th>Expires</th>';
		tmpHTML += '</tr></thead>';
		tmpHTML += '<tbody>';

		for (let i = 0; i < tmpBindings.length; i++)
		{
			let tmpBinding = tmpBindings[i];
			tmpHTML += '<tr>';
			tmpHTML += '<td><code>' + this._escapeHTML(tmpBinding.AffinityKey || '') + '</code></td>';
			tmpHTML += '<td>' + this._escapeHTML(tmpBinding.BeaconID || '') + '</td>';
			tmpHTML += '<td><code style="font-size:0.8em;">' + this._escapeHTML(tmpBinding.RunHash || '') + '</code></td>';
			tmpHTML += '<td>' + this._formatRelativeTime(tmpBinding.CreatedAt) + '</td>';
			tmpHTML += '<td>' + this._formatRelativeTime(tmpBinding.ExpiresAt) + '</td>';
			tmpHTML += '</tr>';
		}

		tmpHTML += '</tbody></table>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-BeaconList-Affinity', tmpHTML);
	}

	// --- Helpers ---

	_renderDetailField(pLabel, pValue)
	{
		return '<div class="ultravisor-beacon-detail-field">'
			+ '<div class="ultravisor-beacon-detail-field-label">' + pLabel + '</div>'
			+ '<div class="ultravisor-beacon-detail-field-value">' + pValue + '</div>'
			+ '</div>';
	}

	_formatRelativeTime(pISO)
	{
		if (!pISO)
		{
			return '<span style="color:var(--uv-text-tertiary);">—</span>';
		}

		let tmpDate;
		try
		{
			tmpDate = new Date(pISO);
		}
		catch (pError)
		{
			return this._escapeHTML(String(pISO));
		}

		if (isNaN(tmpDate.getTime()))
		{
			return this._escapeHTML(String(pISO));
		}

		let tmpNow = Date.now();
		let tmpDiffMs = tmpNow - tmpDate.getTime();
		let tmpFuture = tmpDiffMs < 0;
		let tmpAbsDiff = Math.abs(tmpDiffMs);

		let tmpSeconds = Math.floor(tmpAbsDiff / 1000);
		let tmpMinutes = Math.floor(tmpSeconds / 60);
		let tmpHours = Math.floor(tmpMinutes / 60);
		let tmpDays = Math.floor(tmpHours / 24);

		let tmpText;
		if (tmpSeconds < 10)
		{
			tmpText = 'just now';
		}
		else if (tmpSeconds < 60)
		{
			tmpText = tmpSeconds + 's ago';
		}
		else if (tmpMinutes < 60)
		{
			tmpText = tmpMinutes + 'm ago';
		}
		else if (tmpHours < 24)
		{
			tmpText = tmpHours + 'h ago';
		}
		else
		{
			tmpText = tmpDays + 'd ago';
		}

		if (tmpFuture && tmpText !== 'just now')
		{
			tmpText = 'in ' + tmpText.replace(' ago', '');
		}

		return '<span title="' + this._escapeAttr(pISO) + '">' + tmpText + '</span>';
	}

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

module.exports = UltravisorBeaconListView;

module.exports.default_configuration = _ViewConfiguration;
