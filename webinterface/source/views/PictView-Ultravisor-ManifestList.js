const libPictView = require('pict-view');

const libTimingUtils = require('../Ultravisor-TimingUtils.js');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-ManifestList",

	DefaultRenderable: "Ultravisor-ManifestList-Content",
	DefaultDestinationAddress: "#Ultravisor-Content-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-manifestlist {
			padding: 2em;
			max-width: 1400px;
			margin: 0 auto;
		}
		.ultravisor-manifestlist-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1.5em;
			padding-bottom: 1em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.ultravisor-manifestlist-header h1 {
			margin: 0;
			font-size: 2em;
			font-weight: 300;
			color: var(--uv-text);
		}
		.ultravisor-manifest-table {
			width: 100%;
			border-collapse: collapse;
		}
		.ultravisor-manifest-table th {
			background-color: var(--uv-bg-surface);
		}
		.ultravisor-manifest-table tr:hover td {
			background-color: #1a2744;
		}
		.ultravisor-manifest-status {
			display: inline-block;
			padding: 0.15em 0.5em;
			border-radius: 3px;
			font-size: 0.8em;
			font-weight: 600;
		}
		.ultravisor-manifest-status.complete {
			background-color: #2e7d32;
			color: #c8e6c9;
		}
		.ultravisor-manifest-status.running {
			background-color: var(--uv-info);
			color: var(--uv-text-heading);
		}
		.ultravisor-manifest-status.error {
			background-color: #c62828;
			color: #ffcdd2;
		}
		.ultravisor-manifest-status.waiting,
		.ultravisor-manifest-status.waitingforinput {
			background-color: var(--uv-warning);
			color: #fff9c4;
		}
		.ultravisor-manifest-status.beacon-waiting {
			background-color: #1a3a4a;
			color: #5a9ecb;
		}
		.ultravisor-manifest-status.abandoned {
			background-color: #3a3a3a;
			color: #999;
		}

		/* Filter tabs */
		.ultravisor-manifest-filters {
			display: flex;
			gap: 0;
			margin-bottom: 1em;
			border-bottom: 2px solid var(--uv-border-subtle);
		}
		.ultravisor-manifest-filter-tab {
			padding: 0.5em 1em;
			cursor: pointer;
			font-size: 0.85em;
			font-weight: 600;
			color: var(--uv-text-secondary);
			border-bottom: 2px solid transparent;
			margin-bottom: -2px;
			transition: color 0.15s, border-color 0.15s;
			user-select: none;
		}
		.ultravisor-manifest-filter-tab:hover {
			color: var(--uv-text);
		}
		.ultravisor-manifest-filter-tab.active {
			color: var(--uv-brand);
			border-bottom-color: var(--uv-brand);
		}
		.ultravisor-manifest-filter-count {
			font-weight: 400;
			opacity: 0.7;
			margin-left: 0.3em;
		}

		/* Action buttons in rows */
		.ultravisor-manifest-actions {
			display: flex;
			gap: 0.35em;
			flex-wrap: wrap;
		}

		/* Inline awaiting detail row */
		.ultravisor-manifest-awaiting-row td {
			padding: 0 !important;
			border-top: none !important;
		}
		.ultravisor-manifest-awaiting-detail {
			padding: 0.75em 1em;
			background: var(--uv-bg-base);
		}
		.ultravisor-manifest-awaiting-task {
			background: var(--uv-bg-surface);
			border-radius: 4px;
			padding: 0.75em;
			margin-bottom: 0.5em;
		}
		.ultravisor-manifest-awaiting-task:last-child {
			margin-bottom: 0;
		}
		.ultravisor-manifest-beacon-status {
			display: flex;
			align-items: center;
			gap: 0.5em;
		}
		.ultravisor-manifest-waiting-indicator {
			display: inline-block;
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: var(--uv-info);
			animation: uv-manifest-waiting-pulse 1.5s ease-in-out infinite;
			flex-shrink: 0;
		}
		@keyframes uv-manifest-waiting-pulse {
			0%, 100% { opacity: 1; transform: scale(1); }
			50% { opacity: 0.4; transform: scale(0.7); }
		}
		.ultravisor-manifest-beacon-prompt {
			color: var(--uv-text-secondary);
			font-size: 0.9em;
		}
		.ultravisor-manifest-input-prompt {
			color: #d4884a;
			font-size: 0.9em;
			margin-bottom: 0.5em;
		}
		.ultravisor-manifest-input-address {
			font-size: 0.8em;
			color: var(--uv-text-tertiary);
			margin-bottom: 0.5em;
		}
		.ultravisor-manifest-input-form {
			display: flex;
			gap: 0.5em;
			align-items: center;
		}
		.ultravisor-manifest-input-form input {
			flex: 1;
			min-width: 150px;
		}
		.ultravisor-manifest-input-submit {
			padding: 0.4em 0.8em;
			background: #3a2a1a;
			color: #d4884a;
			border: 1px solid #5a3a1a;
			border-radius: 4px;
			cursor: pointer;
			font-weight: 600;
			font-size: 0.85em;
		}
		.ultravisor-manifest-input-submit:hover {
			background: #4a3a2a;
		}
		.ultravisor-manifest-force-error {
			padding: 0.35em 0.7em;
			background: #3a1a1a;
			color: #c44e4e;
			border: 1px solid #5a2a2a;
			border-radius: 4px;
			cursor: pointer;
			font-size: 0.8em;
			margin-top: 0.5em;
		}
		.ultravisor-manifest-force-error:hover {
			background: #4a2020;
		}
		.ultravisor-manifest-elapsed-hint {
			font-size: 0.75em;
			color: var(--uv-text-tertiary);
			margin-top: 0.25em;
		}
		.ultravisor-manifest-result {
			margin-top: 0.5em;
			padding: 0.4em 0.6em;
			border-radius: 3px;
			font-size: 0.85em;
		}
		.ultravisor-manifest-result.success {
			background: #1a3a1a;
			color: #5ab88a;
		}
		.ultravisor-manifest-result.error {
			background: #3a1a1a;
			color: #c44e4e;
		}

	`,

	Templates:
	[
		{
			Hash: "Ultravisor-ManifestList-Template",
			Template: /*html*/`
<div class="ultravisor-manifestlist">
	<div class="ultravisor-manifestlist-header">
		<h1>Execution Manifests</h1>
		<button class="ultravisor-btn ultravisor-btn-secondary" onclick="{~P~}.PictApplication.showView('Ultravisor-ManifestList')">Refresh</button>
		<button class="ultravisor-btn ultravisor-btn-delete" onclick="{~P~}.views['Ultravisor-ManifestList'].clearStaleRuns()" style="font-size:0.8em;">Clear Stale</button>
	</div>
	<div id="Ultravisor-ManifestList-Filters"></div>
	<div id="Ultravisor-ManifestList-Body"></div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-ManifestList-Content",
			TemplateHash: "Ultravisor-ManifestList-Template",
			DestinationAddress: "#Ultravisor-Content-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorManifestListView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this._CurrentFilter = 'all';
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.pict.PictApplication.loadManifests(
			function ()
			{
				this.renderManifestTable();
			}.bind(this));

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	/**
	 * Set the active filter and re-render the table.
	 * Called from filter tabs and from route navigation.
	 */
	setFilter(pFilter)
	{
		this._CurrentFilter = pFilter || 'all';
		this.renderManifestTable();
	}

	/**
	 * Set filter from a route parameter (e.g. /Manifests/waiting).
	 */
	setFilterFromRoute(pFilter)
	{
		this._CurrentFilter = pFilter || 'all';
	}

	// ── Filter Helpers ──

	_matchesFilter(pStatus)
	{
		if (this._CurrentFilter === 'all') return true;
		let tmpNormalized = (pStatus || '').toLowerCase();
		switch (this._CurrentFilter)
		{
			case 'running': return tmpNormalized === 'running';
			case 'waiting': return tmpNormalized === 'waitingforinput';
			case 'complete': return tmpNormalized === 'complete';
			case 'error': return tmpNormalized === 'error';
			case 'abandoned': return tmpNormalized === 'abandoned';
			default: return true;
		}
	}

	_countByFilter(pManifests, pFilter)
	{
		if (pFilter === 'all') return pManifests.length;
		let tmpCount = 0;
		for (let i = 0; i < pManifests.length; i++)
		{
			let tmpNormalized = (pManifests[i].Status || '').toLowerCase();
			switch (pFilter)
			{
				case 'running': if (tmpNormalized === 'running') tmpCount++; break;
				case 'waiting': if (tmpNormalized === 'waitingforinput') tmpCount++; break;
				case 'complete': if (tmpNormalized === 'complete') tmpCount++; break;
				case 'error': if (tmpNormalized === 'error') tmpCount++; break;
				case 'abandoned': if (tmpNormalized === 'abandoned') tmpCount++; break;
			}
		}
		return tmpCount;
	}

	_isBeaconTask(pTask)
	{
		if (pTask.ResumeEventName && pTask.ResumeEventName !== 'ValueInputComplete')
		{
			return true;
		}
		return false;
	}

	_formatElapsed(pTimestamp)
	{
		if (!pTimestamp) return '';
		let tmpElapsedMs = Date.now() - new Date(pTimestamp).getTime();
		if (tmpElapsedMs < 1000) return 'just now';
		if (tmpElapsedMs < 60000) return Math.floor(tmpElapsedMs / 1000) + 's ago';
		if (tmpElapsedMs < 3600000) return Math.floor(tmpElapsedMs / 60000) + 'm ' + Math.floor((tmpElapsedMs % 60000) / 1000) + 's ago';
		return Math.floor(tmpElapsedMs / 3600000) + 'h ' + Math.floor((tmpElapsedMs % 3600000) / 60000) + 'm ago';
	}

	// ── Table Rendering ──

	renderManifestTable()
	{
		let tmpManifests = this.pict.AppData.Ultravisor.Manifests;
		let tmpGlobalRef = '_Pict';
		let tmpViewRef = tmpGlobalRef + ".views['Ultravisor-ManifestList']";

		// Render filter tabs
		this._renderFilterTabs(tmpManifests || [], tmpViewRef);

		if (!tmpManifests || tmpManifests.length === 0)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestList-Body',
				'<div class="ultravisor-empty-message">No execution manifests recorded yet. Execute a task or operation to see results here.</div>');
			return;
		}

		// Sort newest first by StartTime
		tmpManifests.sort(function (pA, pB)
		{
			let tmpTimeA = pA.StartTime ? new Date(pA.StartTime).getTime() : 0;
			let tmpTimeB = pB.StartTime ? new Date(pB.StartTime).getTime() : 0;
			return tmpTimeB - tmpTimeA;
		});

		let tmpHTML = '<table class="ultravisor-manifest-table">';
		tmpHTML += '<thead><tr><th>Operation</th><th>Status</th><th>Elapsed</th><th>Started</th><th>Completed</th><th>Actions</th></tr></thead>';
		tmpHTML += '<tbody>';

		let tmpRowCount = 0;

		for (let i = 0; i < tmpManifests.length; i++)
		{
			let tmpManifest = tmpManifests[i];
			let tmpStatus = tmpManifest.Status || 'Unknown';

			// Apply filter
			if (!this._matchesFilter(tmpStatus))
			{
				continue;
			}

			tmpRowCount++;
			let tmpRunHash = tmpManifest.Hash || '';
			let tmpEscHash = tmpRunHash.replace(/'/g, "\\'");
			let tmpEscOpHash = (tmpManifest.OperationHash || '').replace(/'/g, "\\'");
			let tmpStatusClass = tmpStatus.toLowerCase();
			if (tmpStatusClass !== 'complete' && tmpStatusClass !== 'running'
				&& tmpStatusClass !== 'error' && tmpStatusClass !== 'waiting'
				&& tmpStatusClass !== 'waitingforinput' && tmpStatusClass !== 'abandoned')
			{
				tmpStatusClass = '';
			}

			// Format elapsed time — compute from timestamps if ElapsedMs is missing
			let tmpElapsedMs = tmpManifest.ElapsedMs;
			if (tmpElapsedMs == null && tmpManifest.StartTime && tmpManifest.StopTime)
			{
				tmpElapsedMs = new Date(tmpManifest.StopTime).getTime() - new Date(tmpManifest.StartTime).getTime();
			}
			let tmpElapsed = '';
			if (tmpElapsedMs != null && tmpElapsedMs >= 0)
			{
				tmpElapsed = (tmpElapsedMs === 0) ? '< 1ms' : libTimingUtils.formatMs(tmpElapsedMs);
			}

			// Format timestamps with dayJS
			let tmpStarted = tmpManifest.StartTime
				? this.fable.Dates.dayJS(tmpManifest.StartTime).format('YYYY-MM-DD HH:mm:ss')
				: '';
			let tmpCompleted = tmpManifest.StopTime
				? this.fable.Dates.dayJS(tmpManifest.StopTime).format('YYYY-MM-DD HH:mm:ss')
				: '';

			// Show operation name when available, fall back to hash
			let tmpOperationLabel = tmpManifest.OperationName || tmpManifest.OperationHash || '';

			// Determine status display
			let tmpStatusLabel = tmpStatus;
			let tmpIsLive = tmpManifest.Live || false;
			let tmpIsWaiting = (tmpStatusClass === 'waitingforinput');
			let tmpIsRunning = (tmpStatusClass === 'running');

			if (tmpIsWaiting)
			{
				// Check if all tasks are beacon tasks
				let tmpWaitingTasks = tmpManifest.WaitingTasks || {};
				let tmpNodeHashes = Object.keys(tmpWaitingTasks);
				let tmpAllBeacon = tmpNodeHashes.length > 0;
				for (let k = 0; k < tmpNodeHashes.length; k++)
				{
					if (!this._isBeaconTask(tmpWaitingTasks[tmpNodeHashes[k]]))
					{
						tmpAllBeacon = false;
						break;
					}
				}
				if (tmpAllBeacon)
				{
					tmpStatusLabel = 'Waiting for Beacon';
					tmpStatusClass = 'beacon-waiting';
				}
				else
				{
					tmpStatusLabel = 'Waiting for Input';
					tmpStatusClass = 'waitingforinput';
				}
			}

			tmpHTML += '<tr>';
			tmpHTML += '<td>' + libTimingUtils.escapeHTML(tmpOperationLabel) + '</td>';
			tmpHTML += '<td><span class="ultravisor-manifest-status ' + tmpStatusClass + '">' + libTimingUtils.escapeHTML(tmpStatusLabel) + '</span></td>';
			tmpHTML += '<td>' + tmpElapsed + '</td>';
			tmpHTML += '<td>' + libTimingUtils.escapeHTML(tmpStarted) + '</td>';
			tmpHTML += '<td>' + libTimingUtils.escapeHTML(tmpCompleted) + '</td>';

			// Actions column
			tmpHTML += '<td><div class="ultravisor-manifest-actions">';

			// Watch button — only for live (in-memory) running/waiting operations
			if (tmpIsLive && (tmpIsRunning || tmpIsWaiting))
			{
				tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-execute" onclick="' + tmpGlobalRef + '.PictApplication.watchExecution(\'' + tmpEscHash + '\', \'' + tmpEscOpHash + '\')">Watch</button>';
			}

			// Awaiting expand button — only for live waiting operations with tasks
			if (tmpIsLive && tmpIsWaiting && tmpManifest.WaitingTasks && Object.keys(tmpManifest.WaitingTasks).length > 0)
			{
				tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-secondary" onclick="' + tmpViewRef + '.toggleAwaitingDetail(\'' + tmpEscHash + '\')">Awaiting</button>';
			}

			// Abandon button for non-terminal statuses
			if (tmpStatusClass !== 'complete' && tmpStatusClass !== 'abandoned')
			{
				tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-delete" onclick="' + tmpViewRef + '.abandonRun(\'' + tmpEscHash + '\')">Abandon</button>';
			}

			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-edit" onclick="' + tmpGlobalRef + '.PictApplication.navigateTo(\'/Manifests/detail/' + tmpEscHash + '\')">Details</button>';
			tmpHTML += '</div></td>';
			tmpHTML += '</tr>';

			// Inline awaiting detail row (hidden by default, live runs only)
			if (tmpIsLive && tmpIsWaiting && tmpManifest.WaitingTasks && Object.keys(tmpManifest.WaitingTasks).length > 0)
			{
				tmpHTML += '<tr class="ultravisor-manifest-awaiting-row" id="awaiting-row-' + tmpRunHash + '" style="display:none">';
				tmpHTML += '<td colspan="6">';
				tmpHTML += this._renderAwaitingDetail(tmpManifest, tmpViewRef);
				tmpHTML += '</td></tr>';
			}
		}

		if (tmpRowCount === 0)
		{
			tmpHTML += '<tr><td colspan="6" style="text-align:center;color:var(--uv-text-secondary);padding:2em;">No manifests match this filter.</td></tr>';
		}

		tmpHTML += '</tbody></table>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestList-Body', tmpHTML);
	}

	_renderFilterTabs(pManifests, pViewRef)
	{
		let tmpFilters = ['all', 'running', 'waiting', 'complete', 'error', 'abandoned'];
		let tmpLabels = { all: 'All', running: 'Running', waiting: 'Waiting', complete: 'Complete', error: 'Error', abandoned: 'Abandoned' };

		let tmpHTML = '<div class="ultravisor-manifest-filters">';
		for (let i = 0; i < tmpFilters.length; i++)
		{
			let tmpFilter = tmpFilters[i];
			let tmpCount = this._countByFilter(pManifests, tmpFilter);
			let tmpActiveClass = (this._CurrentFilter === tmpFilter) ? ' active' : '';
			tmpHTML += '<div class="ultravisor-manifest-filter-tab' + tmpActiveClass + '" onclick="' + pViewRef + '.setFilter(\'' + tmpFilter + '\')">';
			tmpHTML += tmpLabels[tmpFilter];
			tmpHTML += '<span class="ultravisor-manifest-filter-count">(' + tmpCount + ')</span>';
			tmpHTML += '</div>';
		}
		tmpHTML += '</div>';

		this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestList-Filters', tmpHTML);
	}

	// ── Abandon Actions ──

	abandonRun(pRunHash)
	{
		this.pict.views.Modal.confirm('Abandon this run? It will be marked as Abandoned and cannot be resumed.', { confirmLabel: 'Abandon', dangerous: true }).then(
			function (pConfirmed)
			{
				if (pConfirmed)
				{
					this.pict.PictApplication.abandonRun(pRunHash,
						function (pError, pData)
						{
							if (pError)
							{
								this.pict.views.Modal.toast('Failed to abandon run: ' + (pError.message || 'Unknown error'), { type: 'error' });
								return;
							}
							this.pict.views.Modal.toast('Run abandoned.', { type: 'success' });
							this.pict.PictApplication.loadManifests(
								function ()
								{
									this.renderManifestTable();
								}.bind(this));
						}.bind(this));
				}
			}.bind(this));
	}

	clearStaleRuns()
	{
		this.pict.views.Modal.confirm('Abandon all stale runs (non-live Waiting/Running)? This cannot be undone.', { confirmLabel: 'Clear All', dangerous: true }).then(
			function (pConfirmed)
			{
				if (pConfirmed)
				{
					this.pict.PictApplication.abandonStaleRuns(
						function (pError, pData)
						{
							if (pError)
							{
								this.pict.views.Modal.toast('Failed to clear stale runs: ' + (pError.message || 'Unknown error'), { type: 'error' });
								return;
							}
							let tmpCount = (pData && pData.AbandonedCount) || 0;
							this.pict.views.Modal.toast('Abandoned ' + tmpCount + ' stale run(s).', { type: 'success' });
							this.pict.PictApplication.loadManifests(
								function ()
								{
									this.renderManifestTable();
								}.bind(this));
						}.bind(this));
				}
			}.bind(this));
	}

	// ── Inline Awaiting ──

	_renderAwaitingDetail(pManifest, pViewRef)
	{
		let tmpWaitingTasks = pManifest.WaitingTasks || {};
		let tmpNodeHashes = Object.keys(tmpWaitingTasks);
		let tmpRunHash = pManifest.Hash || '';
		let tmpEscRunHash = tmpRunHash.replace(/'/g, "\\'");

		let tmpHTML = '<div class="ultravisor-manifest-awaiting-detail">';

		for (let j = 0; j < tmpNodeHashes.length; j++)
		{
			let tmpNodeHash = tmpNodeHashes[j];
			let tmpEscNodeHash = tmpNodeHash.replace(/'/g, "\\'");
			let tmpTask = tmpWaitingTasks[tmpNodeHash];
			let tmpResultId = 'manifest-result-' + tmpRunHash.replace(/[^a-zA-Z0-9]/g, '') + '-' + tmpNodeHash.replace(/[^a-zA-Z0-9]/g, '');

			tmpHTML += '<div class="ultravisor-manifest-awaiting-task">';

			if (this._isBeaconTask(tmpTask))
			{
				// Beacon task: waiting indicator + force error
				tmpHTML += '<div class="ultravisor-manifest-beacon-status">';
				tmpHTML += '<span class="ultravisor-manifest-waiting-indicator"></span>';
				tmpHTML += '<span class="ultravisor-manifest-beacon-prompt">' + libTimingUtils.escapeHTML(tmpTask.PromptMessage || 'Waiting for beacon to complete') + '</span>';
				tmpHTML += '</div>';
				if (tmpTask.Timestamp)
				{
					tmpHTML += '<div class="ultravisor-manifest-elapsed-hint">Dispatched ' + libTimingUtils.escapeHTML(this._formatElapsed(tmpTask.Timestamp)) + '</div>';
				}
				tmpHTML += '<button class="ultravisor-manifest-force-error" onclick="' + pViewRef + '.forceError(\'' + tmpEscRunHash + '\', \'' + tmpEscNodeHash + '\', \'' + tmpResultId + '\')">Force Error</button>';
			}
			else
			{
				// Value-input task: prompt + input + submit
				let tmpInputId = 'manifest-input-' + tmpRunHash.replace(/[^a-zA-Z0-9]/g, '') + '-' + tmpNodeHash.replace(/[^a-zA-Z0-9]/g, '');

				tmpHTML += '<div class="ultravisor-manifest-input-prompt">' + libTimingUtils.escapeHTML(tmpTask.PromptMessage || 'Enter a value') + '</div>';
				if (tmpTask.OutputAddress)
				{
					tmpHTML += '<div class="ultravisor-manifest-input-address">Target: <code>' + libTimingUtils.escapeHTML(tmpTask.OutputAddress) + '</code></div>';
				}
				tmpHTML += '<div class="ultravisor-manifest-input-form">';
				tmpHTML += '<input type="text" id="' + tmpInputId + '" placeholder="Enter value..." onkeydown="if(event.key===\'Enter\'){' + pViewRef + '.submitInput(\'' + tmpEscRunHash + '\', \'' + tmpEscNodeHash + '\', \'' + tmpInputId + '\', \'' + tmpResultId + '\');}" />';
				tmpHTML += '<button class="ultravisor-manifest-input-submit" onclick="' + pViewRef + '.submitInput(\'' + tmpEscRunHash + '\', \'' + tmpEscNodeHash + '\', \'' + tmpInputId + '\', \'' + tmpResultId + '\')">Submit</button>';
				tmpHTML += '</div>';
			}

			tmpHTML += '<div id="' + tmpResultId + '"></div>';
			tmpHTML += '</div>';
		}

		tmpHTML += '</div>';
		return tmpHTML;
	}

	toggleAwaitingDetail(pRunHash)
	{
		let tmpRow = document.getElementById('awaiting-row-' + pRunHash);
		if (tmpRow)
		{
			tmpRow.style.display = (tmpRow.style.display === 'none') ? '' : 'none';
		}
	}

	submitInput(pRunHash, pNodeHash, pInputId, pResultId)
	{
		let tmpInputEl = document.getElementById(pInputId);
		if (!tmpInputEl) return;

		let tmpValue = tmpInputEl.value;
		tmpInputEl.disabled = true;
		let tmpButton = tmpInputEl.parentElement.querySelector('.ultravisor-manifest-input-submit');
		if (tmpButton)
		{
			tmpButton.disabled = true;
			tmpButton.textContent = 'Submitting...';
		}

		this.pict.PictApplication.submitPendingInput(pRunHash, pNodeHash, tmpValue,
			function (pError, pData)
			{
				if (pError || (pData && pData.Error))
				{
					let tmpMsg = (pError && pError.message) || (pData && pData.Error) || 'Request failed';
					this.pict.ContentAssignment.assignContent('#' + pResultId,
						'<div class="ultravisor-manifest-result error">Error: ' + libTimingUtils.escapeHTML(tmpMsg) + '</div>');
					tmpInputEl.disabled = false;
					if (tmpButton) { tmpButton.disabled = false; tmpButton.textContent = 'Submit'; }
					return;
				}

				let tmpStatus = (pData && pData.Status) || 'Submitted';
				this.pict.ContentAssignment.assignContent('#' + pResultId,
					'<div class="ultravisor-manifest-result success">Input submitted — status: ' + libTimingUtils.escapeHTML(tmpStatus) + '</div>');

				setTimeout(function ()
				{
					this.pict.PictApplication.loadManifests(function () { this.renderManifestTable(); }.bind(this));
				}.bind(this), 1500);
			}.bind(this));
	}

	forceError(pRunHash, pNodeHash, pResultId)
	{
		this.pict.views.Modal.confirm('Force this task to error?\nThe operation will continue on the Error path.', { confirmLabel: 'Force Error', dangerous: true }).then(
			function (pConfirmed)
			{
				if (pConfirmed)
				{
					this._doForceError(pRunHash, pNodeHash, pResultId);
				}
			}.bind(this));
	}

	_doForceError(pRunHash, pNodeHash, pResultId)
	{
		this.pict.PictApplication.forceErrorPendingInput(pRunHash, pNodeHash,
			function (pError, pData)
			{
				if (pError || (pData && pData.Error))
				{
					let tmpMsg = (pError && pError.message) || (pData && pData.Error) || 'Request failed';
					this.pict.ContentAssignment.assignContent('#' + pResultId,
						'<div class="ultravisor-manifest-result error">Error: ' + libTimingUtils.escapeHTML(tmpMsg) + '</div>');
					return;
				}

				let tmpStatus = (pData && pData.Status) || 'Errored';
				this.pict.ContentAssignment.assignContent('#' + pResultId,
					'<div class="ultravisor-manifest-result error">Task force-errored — status: ' + libTimingUtils.escapeHTML(tmpStatus) + '</div>');

				setTimeout(function ()
				{
					this.pict.PictApplication.loadManifests(function () { this.renderManifestTable(); }.bind(this));
				}.bind(this), 1500);
			}.bind(this));
	}

}

module.exports = UltravisorManifestListView;

module.exports.default_configuration = _ViewConfiguration;
