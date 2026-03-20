const libPictView = require('pict-view');

const libTimingUtils = require('../Ultravisor-TimingUtils.js');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-ManifestDetail",

	DefaultRenderable: "Ultravisor-ManifestDetail-Content",
	DefaultDestinationAddress: "#Ultravisor-Content-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-manifestdetail {
			padding: 2em;
			max-width: 1400px;
			margin: 0 auto;
		}
		.ultravisor-manifestdetail-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1.5em;
			padding-bottom: 1em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.ultravisor-manifestdetail-header h1 {
			margin: 0;
			font-size: 2em;
			font-weight: 300;
			color: var(--uv-text);
		}
		.ultravisor-manifestdetail-meta {
			display: grid;
			grid-template-columns: auto 1fr;
			gap: 0.4em 1.5em;
			margin-bottom: 1.5em;
			font-size: 0.95em;
		}
		.ultravisor-manifestdetail-meta dt {
			font-weight: 600;
			color: var(--uv-text-secondary);
		}
		.ultravisor-manifestdetail-meta dd {
			margin: 0;
		}
		.ultravisor-manifestdetail-section {
			margin-bottom: 1.5em;
		}
		.ultravisor-manifestdetail-section h3 {
			margin: 0 0 0.75em 0;
			color: var(--uv-text-secondary);
			font-size: 1.1em;
		}
		.ultravisor-manifestdetail-output {
			background: #0d1117;
			color: #c9d1d9;
			border-radius: 4px;
			padding: 0.75em;
			font-family: monospace;
			font-size: 0.85em;
			white-space: pre-wrap;
			word-break: break-all;
			max-height: 300px;
			overflow-y: auto;
		}
		.ultravisor-manifestdetail-task {
			background: var(--uv-bg-base);
			border-radius: 4px;
			padding: 0.75em;
			margin-bottom: 0.5em;
		}
		.ultravisor-manifestdetail-task-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 0.5em;
		}
		.ultravisor-manifestdetail-task-header code {
			color: var(--uv-brand);
		}

		/* Action bar for live runs */
		.ultravisor-manifestdetail-actions {
			display: flex;
			gap: 0.5em;
			margin-bottom: 1.5em;
			padding: 0.75em;
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 6px;
			align-items: center;
		}
		.ultravisor-manifestdetail-actions-label {
			font-size: 0.85em;
			font-weight: 600;
			color: var(--uv-text-secondary);
			margin-right: 0.5em;
		}

		/* Waiting tasks inline */
		.ultravisor-manifestdetail-waiting {
			margin-bottom: 1.5em;
		}
		.ultravisor-manifestdetail-waiting-task {
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 6px;
			padding: 0.75em;
			margin-bottom: 0.5em;
		}
		.ultravisor-manifestdetail-beacon-status {
			display: flex;
			align-items: center;
			gap: 0.5em;
		}
		.ultravisor-manifestdetail-waiting-indicator {
			display: inline-block;
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: var(--uv-info);
			animation: uv-detail-waiting-pulse 1.5s ease-in-out infinite;
			flex-shrink: 0;
		}
		@keyframes uv-detail-waiting-pulse {
			0%, 100% { opacity: 1; transform: scale(1); }
			50% { opacity: 0.4; transform: scale(0.7); }
		}
		.ultravisor-manifestdetail-prompt {
			color: var(--uv-text-secondary);
			font-size: 0.9em;
		}
		.ultravisor-manifestdetail-input-prompt {
			color: #d4884a;
			font-size: 0.9em;
			margin-bottom: 0.5em;
		}
		.ultravisor-manifestdetail-input-form {
			display: flex;
			gap: 0.5em;
			align-items: center;
		}
		.ultravisor-manifestdetail-input-form input {
			flex: 1;
			min-width: 150px;
		}
		.ultravisor-manifestdetail-input-submit {
			padding: 0.4em 0.8em;
			background: #3a2a1a;
			color: #d4884a;
			border: 1px solid #5a3a1a;
			border-radius: 4px;
			cursor: pointer;
			font-weight: 600;
		}
		.ultravisor-manifestdetail-force-error {
			padding: 0.4em 0.8em;
			background: #3a1a1a;
			color: #c44e4e;
			border: 1px solid #5a2a2a;
			border-radius: 4px;
			cursor: pointer;
			font-size: 0.85em;
			margin-top: 0.5em;
		}
		.ultravisor-manifestdetail-force-error:hover {
			background: #4a2020;
		}
		.ultravisor-manifestdetail-result {
			margin-top: 0.5em;
			padding: 0.4em 0.6em;
			border-radius: 3px;
			font-size: 0.85em;
		}
		.ultravisor-manifestdetail-result.success {
			background: #1a3a1a;
			color: #5ab88a;
		}
		.ultravisor-manifestdetail-result.error {
			background: #3a1a1a;
			color: #c44e4e;
		}
		.ultravisor-manifestdetail-elapsed-hint {
			font-size: 0.75em;
			color: var(--uv-text-tertiary);
			margin-top: 0.25em;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-ManifestDetail-Template",
			Template: /*html*/`
<div class="ultravisor-manifestdetail">
	<div class="ultravisor-manifestdetail-header">
		<h1>Manifest Detail</h1>
		<button class="ultravisor-btn ultravisor-btn-secondary" onclick="{~P~}.PictApplication.navigateTo('/Manifests')">Back to List</button>
	</div>
	<div id="Ultravisor-ManifestDetail-Body"></div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-ManifestDetail-Content",
			TemplateHash: "Ultravisor-ManifestDetail-Template",
			DestinationAddress: "#Ultravisor-Content-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorManifestDetailView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this._CurrentRunHash = null;
	}

	/**
	 * Set the run hash to display (called before render from route handler).
	 */
	setRunHash(pRunHash)
	{
		this._CurrentRunHash = pRunHash;
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		if (this._CurrentRunHash)
		{
			this._loadAndRenderDetail(this._CurrentRunHash);
		}
		else
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestDetail-Body',
				'<div class="ultravisor-empty-message">No manifest selected.</div>');
		}

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	_loadAndRenderDetail(pRunHash)
	{
		this.pict.PictApplication.loadManifest(pRunHash,
			function (pError, pManifest)
			{
				if (pError || !pManifest)
				{
					this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestDetail-Body',
						'<p style="color:var(--uv-error);">Error loading manifest details.</p>');
					return;
				}

				let tmpHTML = '';

				// ── Header meta ──
				let tmpOperationName = pManifest.OperationName || pManifest.OperationHash || '';
				let tmpStarted = pManifest.StartTime
					? this.fable.Dates.dayJS(pManifest.StartTime).format('YYYY-MM-DD HH:mm:ss')
					: '';
				let tmpCompleted = pManifest.StopTime
					? this.fable.Dates.dayJS(pManifest.StopTime).format('YYYY-MM-DD HH:mm:ss')
					: '';

				let tmpElapsedMs = pManifest.ElapsedMs;
				if (tmpElapsedMs == null && pManifest.StartTime && pManifest.StopTime)
				{
					tmpElapsedMs = new Date(pManifest.StopTime).getTime() - new Date(pManifest.StartTime).getTime();
				}
				let tmpElapsed = '';
				if (tmpElapsedMs != null && tmpElapsedMs >= 0)
				{
					tmpElapsed = (tmpElapsedMs === 0) ? '< 1ms' : libTimingUtils.formatMs(tmpElapsedMs);
				}

				tmpHTML += '<dl class="ultravisor-manifestdetail-meta">';
				tmpHTML += '<dt>Operation</dt><dd>' + libTimingUtils.escapeHTML(tmpOperationName) + '</dd>';
				tmpHTML += '<dt>Run Hash</dt><dd><code style="font-size:0.85em;">' + libTimingUtils.escapeHTML(pManifest.Hash || '') + '</code></dd>';
				tmpHTML += '<dt>Status</dt><dd><span class="ultravisor-manifest-status ' + (pManifest.Status || '').toLowerCase() + '">' + libTimingUtils.escapeHTML(pManifest.Status || '') + '</span></dd>';
				tmpHTML += '<dt>Elapsed</dt><dd>' + tmpElapsed + '</dd>';
				tmpHTML += '<dt>Started</dt><dd>' + libTimingUtils.escapeHTML(tmpStarted) + '</dd>';
				tmpHTML += '<dt>Completed</dt><dd>' + libTimingUtils.escapeHTML(tmpCompleted) + '</dd>';
				if (pManifest.RunMode)
				{
					tmpHTML += '<dt>Run Mode</dt><dd>' + libTimingUtils.escapeHTML(pManifest.RunMode) + '</dd>';
				}
				tmpHTML += '</dl>';

				// ── Action bar for live runs ──
				let tmpIsLive = pManifest.Live || false;
				let tmpIsWaiting = (pManifest.Status || '').toLowerCase() === 'waitingforinput';
				let tmpIsRunning = (pManifest.Status || '').toLowerCase() === 'running';

				if (tmpIsLive && (tmpIsRunning || tmpIsWaiting))
				{
					let tmpEscHash = (pManifest.Hash || '').replace(/'/g, "\\'");
					let tmpEscOpHash = (pManifest.OperationHash || '').replace(/'/g, "\\'");
					let tmpGlobalRef = '_Pict';
					let tmpViewRef = tmpGlobalRef + ".views['Ultravisor-ManifestDetail']";

					tmpHTML += '<div class="ultravisor-manifestdetail-actions">';
					tmpHTML += '<span class="ultravisor-manifestdetail-actions-label">Actions:</span>';
					tmpHTML += '<button class="ultravisor-btn ultravisor-btn-execute" onclick="' + tmpGlobalRef + '.PictApplication.watchExecution(\'' + tmpEscHash + '\', \'' + tmpEscOpHash + '\')">Watch in Flow Editor</button>';
					tmpHTML += '</div>';
				}

				// ── Waiting Tasks (for live WaitingForInput runs) ──
				if (tmpIsLive && tmpIsWaiting && pManifest.WaitingTasks)
				{
					let tmpWaitingNodeHashes = Object.keys(pManifest.WaitingTasks);
					if (tmpWaitingNodeHashes.length > 0)
					{
						tmpHTML += this._renderWaitingTasks(pManifest);
					}
				}

				// ── Operation Output ──
				if (pManifest.Output && Object.keys(pManifest.Output).length > 0)
				{
					tmpHTML += '<div class="ultravisor-manifestdetail-section">';
					tmpHTML += '<h3>Output</h3>';
					tmpHTML += '<div class="ultravisor-manifestdetail-output">' + libTimingUtils.escapeHTML(JSON.stringify(pManifest.Output, null, '\t')) + '</div>';
					tmpHTML += '</div>';
				}

				// ── Debug State ──
				if (pManifest.OperationState && Object.keys(pManifest.OperationState).length > 0)
				{
					tmpHTML += '<div class="ultravisor-manifestdetail-section">';
					tmpHTML += '<h3>Operation State</h3>';
					tmpHTML += '<div class="ultravisor-manifestdetail-output">' + libTimingUtils.escapeHTML(JSON.stringify(pManifest.OperationState, null, '\t')) + '</div>';
					tmpHTML += '</div>';
				}
				if (pManifest.GlobalState && Object.keys(pManifest.GlobalState).length > 0)
				{
					tmpHTML += '<div class="ultravisor-manifestdetail-section">';
					tmpHTML += '<h3>Global State</h3>';
					tmpHTML += '<div class="ultravisor-manifestdetail-output">' + libTimingUtils.escapeHTML(JSON.stringify(pManifest.GlobalState, null, '\t')) + '</div>';
					tmpHTML += '</div>';
				}

				// ── Task Outputs ──
				if (pManifest.TaskOutputs && Object.keys(pManifest.TaskOutputs).length > 0)
				{
					tmpHTML += '<div class="ultravisor-manifestdetail-section">';
					tmpHTML += '<h3>Task Outputs</h3>';
					tmpHTML += '<div class="ultravisor-manifestdetail-output">' + libTimingUtils.escapeHTML(JSON.stringify(pManifest.TaskOutputs, null, '\t')) + '</div>';
					tmpHTML += '</div>';
				}

				// ── Task Manifests ──
				if (pManifest.TaskManifests && Object.keys(pManifest.TaskManifests).length > 0)
				{
					tmpHTML += '<div class="ultravisor-manifestdetail-section">';
					tmpHTML += '<h3>Task Manifests</h3>';
					let tmpNodeHashes = Object.keys(pManifest.TaskManifests);
					for (let i = 0; i < tmpNodeHashes.length; i++)
					{
						let tmpNodeHash = tmpNodeHashes[i];
						let tmpTaskManifest = pManifest.TaskManifests[tmpNodeHash];
						tmpHTML += '<div class="ultravisor-manifestdetail-task">';
						tmpHTML += '<div class="ultravisor-manifestdetail-task-header">';
						tmpHTML += '<code>' + libTimingUtils.escapeHTML(tmpNodeHash) + '</code>';
						tmpHTML += '<span class="ultravisor-manifest-status ' + (tmpTaskManifest.Status || '').toLowerCase() + '">' + libTimingUtils.escapeHTML(tmpTaskManifest.Status || '') + '</span>';
						tmpHTML += '</div>';
						if (tmpTaskManifest.Output)
						{
							tmpHTML += '<div class="ultravisor-manifestdetail-output">' + libTimingUtils.escapeHTML(JSON.stringify(tmpTaskManifest.Output, null, '\t')) + '</div>';
						}
						tmpHTML += '</div>';
					}
					tmpHTML += '</div>';
				}

				// ── Errors ──
				if (pManifest.Errors && pManifest.Errors.length > 0)
				{
					tmpHTML += '<div class="ultravisor-manifestdetail-section">';
					tmpHTML += '<h3 style="color:var(--uv-error);">Errors</h3>';
					tmpHTML += '<div class="ultravisor-manifestdetail-output" style="border: 1px solid var(--uv-error);">' + libTimingUtils.escapeHTML(pManifest.Errors.join('\n')) + '</div>';
					tmpHTML += '</div>';
				}

				// ── Log ──
				if (pManifest.Log && pManifest.Log.length > 0)
				{
					tmpHTML += '<div class="ultravisor-manifestdetail-section">';
					tmpHTML += '<h3>Log</h3>';
					tmpHTML += '<div class="ultravisor-manifestdetail-output">' + libTimingUtils.escapeHTML(pManifest.Log.join('\n')) + '</div>';
					tmpHTML += '</div>';
				}

				// ── Timing Analysis ──
				let tmpHasTimingData = (pManifest.TimingSummary &&
					(pManifest.TimingSummary.ByCategory || pManifest.TimingSummary.ByTaskType)) ||
					(pManifest.TaskManifests && Object.keys(pManifest.TaskManifests).length > 0);

				if (tmpHasTimingData)
				{
					tmpHTML += '<div class="ultravisor-manifestdetail-section">';
					tmpHTML += '<h3>Timing Analysis</h3>';
					tmpHTML += this._renderTaskTimeline(pManifest);
					if (pManifest.TimingSummary && pManifest.TimingSummary.ByCategory)
					{
						tmpHTML += this._renderCategoryHistogram(pManifest.TimingSummary.ByCategory);
					}
					if (pManifest.TimingSummary && pManifest.TimingSummary.ByTaskType)
					{
						tmpHTML += this._renderTaskTypeHistogram(pManifest.TimingSummary.ByTaskType);
					}
					tmpHTML += '</div>';
				}

				this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestDetail-Body', tmpHTML);
			}.bind(this));
	}

	// ── Waiting Task Actions ─────────────────────────────────────────────

	_isBeaconTask(pTask)
	{
		return (pTask.ResumeEventName && pTask.ResumeEventName !== 'ValueInputComplete');
	}

	_formatElapsed(pTimestamp)
	{
		if (!pTimestamp) return '';
		let tmpMs = Date.now() - new Date(pTimestamp).getTime();
		if (tmpMs < 1000) return 'just now';
		if (tmpMs < 60000) return Math.floor(tmpMs / 1000) + 's ago';
		if (tmpMs < 3600000) return Math.floor(tmpMs / 60000) + 'm ' + Math.floor((tmpMs % 60000) / 1000) + 's ago';
		return Math.floor(tmpMs / 3600000) + 'h ' + Math.floor((tmpMs % 3600000) / 60000) + 'm ago';
	}

	_renderWaitingTasks(pManifest)
	{
		let tmpWaitingTasks = pManifest.WaitingTasks || {};
		let tmpNodeHashes = Object.keys(tmpWaitingTasks);
		let tmpRunHash = pManifest.Hash || '';
		let tmpEscRunHash = tmpRunHash.replace(/'/g, "\\'");
		let tmpViewRef = "_Pict.views['Ultravisor-ManifestDetail']";

		let tmpHTML = '<div class="ultravisor-manifestdetail-section ultravisor-manifestdetail-waiting">';
		tmpHTML += '<h3>Waiting Tasks</h3>';

		for (let j = 0; j < tmpNodeHashes.length; j++)
		{
			let tmpNodeHash = tmpNodeHashes[j];
			let tmpEscNodeHash = tmpNodeHash.replace(/'/g, "\\'");
			let tmpTask = tmpWaitingTasks[tmpNodeHash];
			let tmpResultId = 'detail-result-' + tmpRunHash.replace(/[^a-zA-Z0-9]/g, '') + '-' + tmpNodeHash.replace(/[^a-zA-Z0-9]/g, '');

			tmpHTML += '<div class="ultravisor-manifestdetail-waiting-task">';

			if (this._isBeaconTask(tmpTask))
			{
				tmpHTML += '<div class="ultravisor-manifestdetail-beacon-status">';
				tmpHTML += '<span class="ultravisor-manifestdetail-waiting-indicator"></span>';
				tmpHTML += '<span class="ultravisor-manifestdetail-prompt">' + libTimingUtils.escapeHTML(tmpTask.PromptMessage || 'Waiting for beacon to complete') + '</span>';
				tmpHTML += '</div>';
				if (tmpTask.Timestamp)
				{
					tmpHTML += '<div class="ultravisor-manifestdetail-elapsed-hint">Dispatched ' + libTimingUtils.escapeHTML(this._formatElapsed(tmpTask.Timestamp)) + '</div>';
				}
				tmpHTML += '<button class="ultravisor-manifestdetail-force-error" onclick="' + tmpViewRef + '.forceError(\'' + tmpEscRunHash + '\', \'' + tmpEscNodeHash + '\', \'' + tmpResultId + '\')">Force Error &amp; Stop Waiting</button>';
			}
			else
			{
				let tmpInputId = 'detail-input-' + tmpRunHash.replace(/[^a-zA-Z0-9]/g, '') + '-' + tmpNodeHash.replace(/[^a-zA-Z0-9]/g, '');

				tmpHTML += '<div class="ultravisor-manifestdetail-input-prompt">' + libTimingUtils.escapeHTML(tmpTask.PromptMessage || 'Enter a value') + '</div>';
				if (tmpTask.OutputAddress)
				{
					tmpHTML += '<div style="font-size:0.8em;color:var(--uv-text-tertiary);margin-bottom:0.5em;">Target: <code>' + libTimingUtils.escapeHTML(tmpTask.OutputAddress) + '</code></div>';
				}
				tmpHTML += '<div class="ultravisor-manifestdetail-input-form">';
				tmpHTML += '<input type="text" id="' + tmpInputId + '" placeholder="Enter value..." onkeydown="if(event.key===\'Enter\'){' + tmpViewRef + '.submitInput(\'' + tmpEscRunHash + '\', \'' + tmpEscNodeHash + '\', \'' + tmpInputId + '\', \'' + tmpResultId + '\');}" />';
				tmpHTML += '<button class="ultravisor-manifestdetail-input-submit" onclick="' + tmpViewRef + '.submitInput(\'' + tmpEscRunHash + '\', \'' + tmpEscNodeHash + '\', \'' + tmpInputId + '\', \'' + tmpResultId + '\')">Submit</button>';
				tmpHTML += '</div>';
			}

			tmpHTML += '<div id="' + tmpResultId + '"></div>';
			tmpHTML += '</div>';
		}

		tmpHTML += '</div>';
		return tmpHTML;
	}

	submitInput(pRunHash, pNodeHash, pInputId, pResultId)
	{
		let tmpInputEl = document.getElementById(pInputId);
		if (!tmpInputEl) return;

		let tmpValue = tmpInputEl.value;
		tmpInputEl.disabled = true;
		let tmpButton = tmpInputEl.parentElement.querySelector('.ultravisor-manifestdetail-input-submit');
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
						'<div class="ultravisor-manifestdetail-result error">Error: ' + libTimingUtils.escapeHTML(tmpMsg) + '</div>');
					tmpInputEl.disabled = false;
					if (tmpButton) { tmpButton.disabled = false; tmpButton.textContent = 'Submit'; }
					return;
				}

				let tmpStatus = (pData && pData.Status) || 'Submitted';
				this.pict.ContentAssignment.assignContent('#' + pResultId,
					'<div class="ultravisor-manifestdetail-result success">Input submitted — status: ' + libTimingUtils.escapeHTML(tmpStatus) + '</div>');

				// Reload the detail after a brief delay
				setTimeout(function ()
				{
					this._loadAndRenderDetail(this._CurrentRunHash);
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
					let tmpButtonEl = document.querySelector('#' + pResultId);
					let tmpForceBtn = tmpButtonEl ? tmpButtonEl.previousElementSibling : null;
					if (tmpForceBtn && tmpForceBtn.classList.contains('ultravisor-manifestdetail-force-error'))
					{
						tmpForceBtn.disabled = true;
						tmpForceBtn.textContent = 'Forcing error...';
					}

					this.pict.PictApplication.forceErrorPendingInput(pRunHash, pNodeHash,
						function (pError, pData)
						{
							if (pError || (pData && pData.Error))
							{
								let tmpMsg = (pError && pError.message) || (pData && pData.Error) || 'Request failed';
								this.pict.ContentAssignment.assignContent('#' + pResultId,
									'<div class="ultravisor-manifestdetail-result error">Error: ' + libTimingUtils.escapeHTML(tmpMsg) + '</div>');
								return;
							}

							let tmpStatus = (pData && pData.Status) || 'Errored';
							this.pict.ContentAssignment.assignContent('#' + pResultId,
								'<div class="ultravisor-manifestdetail-result error">Task force-errored — status: ' + libTimingUtils.escapeHTML(tmpStatus) + '</div>');

							// Reload the detail after a brief delay
							setTimeout(function ()
							{
								this._loadAndRenderDetail(this._CurrentRunHash);
							}.bind(this), 1500);
						}.bind(this));
				}
			}.bind(this));
	}

	// ── Timing Visualization Methods ─────────────────────────────────────
	// (moved from ManifestList — identical logic)

	_renderTaskTimeline(pManifest)
	{
		let tmpTaskResults = [];
		if (pManifest.TaskManifests && typeof pManifest.TaskManifests === 'object')
		{
			let tmpKeys = Object.keys(pManifest.TaskManifests);
			for (let k = 0; k < tmpKeys.length; k++)
			{
				let tmpEntry = pManifest.TaskManifests[tmpKeys[k]];
				tmpEntry._NodeHash = tmpKeys[k];
				tmpEntry._ComputedElapsedMs = libTimingUtils.computeTaskElapsedMs(tmpEntry);
				tmpEntry._ComputedStatus = libTimingUtils.computeTaskStatus(tmpEntry);
				tmpTaskResults.push(tmpEntry);
			}
		}

		if (tmpTaskResults.length === 0) return '';

		let tmpMaxTaskMs = 0;
		for (let i = 0; i < tmpTaskResults.length; i++)
		{
			if (tmpTaskResults[i]._ComputedElapsedMs > tmpMaxTaskMs)
			{
				tmpMaxTaskMs = tmpTaskResults[i]._ComputedElapsedMs;
			}
		}
		if (tmpMaxTaskMs <= 0) tmpMaxTaskMs = 1;

		let tmpHTML = '<div class="ultravisor-timing-card">';
		tmpHTML += '<div class="ultravisor-timing-chart">';
		tmpHTML += '<div class="ultravisor-timing-chart-title">Task Timeline</div>';

		for (let i = 0; i < tmpTaskResults.length; i++)
		{
			let tmpResult = tmpTaskResults[i];
			let tmpTaskMs = tmpResult._ComputedElapsedMs;
			let tmpTaskFormatted = libTimingUtils.formatMs(tmpTaskMs);
			let tmpTaskStatus = tmpResult._ComputedStatus.toLowerCase();
			let tmpBarClass = 'other';
			if (tmpTaskStatus === 'complete') tmpBarClass = 'complete';
			else if (tmpTaskStatus === 'error') tmpBarClass = 'error';
			else if (tmpTaskStatus === 'running') tmpBarClass = 'running';

			let tmpWidthPercent = Math.max((tmpTaskMs / tmpMaxTaskMs) * 100, 1);
			let tmpDisplayName = tmpResult.TaskTypeName || tmpResult._NodeHash || 'Task ' + (i + 1);

			let tmpRowData =
			{
				Label: libTimingUtils.escapeHTML(tmpDisplayName),
				LabelTitle: libTimingUtils.escapeHTML(tmpResult._NodeHash || ''),
				LabelStyle: '',
				BarClass: tmpBarClass,
				BarStyle: '',
				WidthPercent: tmpWidthPercent.toFixed(1),
				BarText: (tmpWidthPercent > 20) ? '<span class="ultravisor-timing-row-bar-text">' + libTimingUtils.escapeHTML(tmpDisplayName) + '</span>' : '',
				Duration: libTimingUtils.escapeHTML(tmpTaskFormatted),
				CountHTML: ''
			};
			tmpHTML += this.pict.parseTemplateByHash('Ultravisor-Timing-Row-Template', tmpRowData);
		}

		tmpHTML += '<div class="ultravisor-timing-axis"><div class="ultravisor-timing-axis-line">';
		for (let t = 0; t <= 5; t++)
		{
			tmpHTML += '<span class="ultravisor-timing-axis-tick">' + libTimingUtils.formatMs((tmpMaxTaskMs / 5) * t) + '</span>';
		}
		tmpHTML += '</div><div class="ultravisor-timing-axis-spacer"></div></div>';
		tmpHTML += '</div></div>';
		return tmpHTML;
	}

	_renderCategoryHistogram(pByCategory)
	{
		let tmpCategories = Object.keys(pByCategory);
		if (tmpCategories.length === 0) return '';

		tmpCategories.sort(function (pA, pB) { return (pByCategory[pB].TotalMs || 0) - (pByCategory[pA].TotalMs || 0); });
		let tmpMaxMs = pByCategory[tmpCategories[0]].TotalMs || 1;

		let tmpHTML = '<div class="ultravisor-timing-card"><div class="ultravisor-timing-chart">';
		tmpHTML += '<div class="ultravisor-timing-chart-title">Time by Category</div>';

		for (let i = 0; i < tmpCategories.length; i++)
		{
			let tmpCat = tmpCategories[i];
			let tmpData = pByCategory[tmpCat];
			let tmpMs = tmpData.TotalMs || 0;
			let tmpWidthPercent = Math.max((tmpMs / tmpMaxMs) * 100, 1);
			let tmpColors = libTimingUtils.CategoryColors[tmpCat] || libTimingUtils.CategoryColors['Uncategorized'];

			let tmpRowData =
			{
				Label: libTimingUtils.escapeHTML(tmpCat),
				LabelTitle: '',
				LabelStyle: 'color:' + tmpColors.text + ';',
				BarClass: '',
				BarStyle: ' background: ' + tmpColors.bar + ';',
				WidthPercent: tmpWidthPercent.toFixed(1),
				BarText: (tmpWidthPercent > 15) ? '<span class="ultravisor-timing-row-bar-text">' + libTimingUtils.formatMs(tmpMs) + '</span>' : '',
				Duration: libTimingUtils.formatMs(tmpMs),
				CountHTML: '<div class="ultravisor-timing-row-count">' + tmpData.Count + 'x</div>'
			};
			tmpHTML += this.pict.parseTemplateByHash('Ultravisor-Timing-Row-Template', tmpRowData);
		}

		tmpHTML += '</div></div>';
		return tmpHTML;
	}

	_renderTaskTypeHistogram(pByTaskType)
	{
		let tmpTypes = Object.keys(pByTaskType);
		if (tmpTypes.length === 0) return '';

		tmpTypes.sort(function (pA, pB) { return (pByTaskType[pB].TotalMs || 0) - (pByTaskType[pA].TotalMs || 0); });
		let tmpMaxMs = pByTaskType[tmpTypes[0]].TotalMs || 1;

		let tmpHTML = '<div class="ultravisor-timing-card"><div class="ultravisor-timing-chart">';
		tmpHTML += '<div class="ultravisor-timing-chart-title">Time by Task Type</div>';

		for (let i = 0; i < tmpTypes.length; i++)
		{
			let tmpType = tmpTypes[i];
			let tmpData = pByTaskType[tmpType];
			let tmpMs = tmpData.TotalMs || 0;
			let tmpWidthPercent = Math.max((tmpMs / tmpMaxMs) * 100, 1);
			let tmpCategory = tmpData.Category || 'Uncategorized';
			let tmpColors = libTimingUtils.CategoryColors[tmpCategory] || libTimingUtils.CategoryColors['Uncategorized'];
			let tmpDisplayName = tmpData.Name || tmpType;

			let tmpRowData =
			{
				Label: libTimingUtils.escapeHTML(tmpDisplayName),
				LabelTitle: libTimingUtils.escapeHTML(tmpType),
				LabelStyle: '',
				BarClass: '',
				BarStyle: ' background: ' + tmpColors.bar + ';',
				WidthPercent: tmpWidthPercent.toFixed(1),
				BarText: (tmpWidthPercent > 15) ? '<span class="ultravisor-timing-row-bar-text">' + libTimingUtils.formatMs(tmpMs) + '</span>' : '',
				Duration: libTimingUtils.formatMs(tmpMs),
				CountHTML: '<div class="ultravisor-timing-row-count">' + tmpData.Count + 'x</div>'
			};
			tmpHTML += this.pict.parseTemplateByHash('Ultravisor-Timing-Row-Template', tmpRowData);
		}

		tmpHTML += '</div></div>';
		return tmpHTML;
	}
}

module.exports = UltravisorManifestDetailView;

module.exports.default_configuration = _ViewConfiguration;
