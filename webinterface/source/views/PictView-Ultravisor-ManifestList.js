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
			max-width: 1200px;
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
		.ultravisor-manifest-status.waiting {
			background-color: var(--uv-warning);
			color: #fff9c4;
		}
		.ultravisor-manifest-detail {
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 8px;
			padding: 1.5em;
			margin-top: 1em;
			display: none;
		}
		.ultravisor-manifest-detail.visible {
			display: block;
		}
		.ultravisor-manifest-detail h3 {
			margin: 0 0 1em 0;
			color: var(--uv-text-secondary);
		}
		.ultravisor-manifest-task-result {
			background: var(--uv-bg-base);
			border-radius: 4px;
			padding: 0.75em;
			margin-bottom: 0.5em;
		}
		.ultravisor-manifest-task-result-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 0.5em;
		}
		.ultravisor-manifest-task-result-header code {
			color: var(--uv-brand);
		}
		.ultravisor-manifest-output {
			background: #0d1117;
			color: #c9d1d9;
			border-radius: 4px;
			padding: 0.75em;
			font-family: monospace;
			font-size: 0.85em;
			white-space: pre-wrap;
			word-break: break-all;
			max-height: 200px;
			overflow-y: auto;
			margin-top: 0.5em;
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
	</div>
	<div id="Ultravisor-ManifestList-Body"></div>
	<div id="Ultravisor-ManifestList-Detail"></div>
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

	renderManifestTable()
	{
		let tmpManifests = this.pict.AppData.Ultravisor.Manifests;
		let tmpGlobalRef = '_Pict';
		let tmpViewRef = tmpGlobalRef + ".views['Ultravisor-ManifestList']";

		if (!tmpManifests || tmpManifests.length === 0)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestList-Body',
				'<div class="ultravisor-empty-message">No execution manifests recorded yet. Execute a task or operation to see results here.</div>');
			return;
		}

		let tmpHTML = '<table class="ultravisor-manifest-table">';
		tmpHTML += '<thead><tr><th>Run Hash</th><th>Operation</th><th>Status</th><th>Elapsed</th><th>Started</th><th>Actions</th></tr></thead>';
		tmpHTML += '<tbody>';

		for (let i = 0; i < tmpManifests.length; i++)
		{
			let tmpManifest = tmpManifests[i];
			let tmpRunHash = tmpManifest.Hash || '';
			let tmpEscHash = tmpRunHash.replace(/'/g, "\\'");
			let tmpStatus = tmpManifest.Status || 'Unknown';
			let tmpStatusClass = tmpStatus.toLowerCase();
			if (tmpStatusClass !== 'complete' && tmpStatusClass !== 'running' && tmpStatusClass !== 'error' && tmpStatusClass !== 'waiting')
			{
				tmpStatusClass = '';
			}

			tmpHTML += '<tr>';
			tmpHTML += '<td><code style="font-size:0.8em;">' + libTimingUtils.escapeHTML(tmpRunHash) + '</code></td>';
			tmpHTML += '<td>' + libTimingUtils.escapeHTML(tmpManifest.OperationHash || '') + '</td>';
			tmpHTML += '<td><span class="ultravisor-manifest-status ' + tmpStatusClass + '">' + libTimingUtils.escapeHTML(tmpStatus) + '</span></td>';
			tmpHTML += '<td>' + (tmpManifest.ElapsedMs ? this.fable.DataFormat.formatTimeSpan(tmpManifest.ElapsedMs) + ' (' + tmpManifest.ElapsedMs + 'ms)' : '') + '</td>';
			tmpHTML += '<td>' + libTimingUtils.escapeHTML(tmpManifest.StartTime || '') + '</td>';
			tmpHTML += '<td><button class="ultravisor-btn-sm ultravisor-btn-edit" onclick="' + tmpViewRef + '.showManifestDetail(\'' + tmpEscHash + '\')">Details</button></td>';
			tmpHTML += '</tr>';
		}

		tmpHTML += '</tbody></table>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestList-Body', tmpHTML);
	}

	showManifestDetail(pRunHash)
	{
		this.pict.PictApplication.loadManifest(pRunHash,
			function (pError, pManifest)
			{
				if (pError || !pManifest)
				{
					this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestList-Detail',
						'<div class="ultravisor-manifest-detail visible"><p style="color:var(--uv-error);">Error loading manifest details.</p></div>');
					return;
				}

				let tmpHTML = '<div class="ultravisor-manifest-detail visible">';
				tmpHTML += '<h3>Run: ' + libTimingUtils.escapeHTML(pManifest.Hash || '') + '</h3>';
				tmpHTML += '<p><strong>Operation:</strong> ' + libTimingUtils.escapeHTML(pManifest.OperationHash || '') + '</p>';
				tmpHTML += '<p><strong>Status:</strong> ' + libTimingUtils.escapeHTML(pManifest.Status || '') + '</p>';
				tmpHTML += '<p><strong>Start:</strong> ' + libTimingUtils.escapeHTML(pManifest.StartTime || '') + ' &middot; <strong>Stop:</strong> ' + libTimingUtils.escapeHTML(pManifest.StopTime || '') + '</p>';
				tmpHTML += '<p><strong>Elapsed:</strong> ' + this.fable.DataFormat.formatTimeSpan(pManifest.ElapsedMs || 0) + ' (' + (pManifest.ElapsedMs || 0) + 'ms)</p>';
				if (pManifest.RunMode)
				{
					tmpHTML += '<p><strong>Run Mode:</strong> ' + libTimingUtils.escapeHTML(pManifest.RunMode) + '</p>';
				}

				// Operation Output (always present if non-empty)
				if (pManifest.Output && Object.keys(pManifest.Output).length > 0)
				{
					tmpHTML += '<h3>Output</h3>';
					tmpHTML += '<div class="ultravisor-manifest-output">' + libTimingUtils.escapeHTML(JSON.stringify(pManifest.Output, null, 2)) + '</div>';
				}

				// Debug-mode state (only present in debug manifests)
				if (pManifest.OperationState && Object.keys(pManifest.OperationState).length > 0)
				{
					tmpHTML += '<h3>Operation State</h3>';
					tmpHTML += '<div class="ultravisor-manifest-output">' + libTimingUtils.escapeHTML(JSON.stringify(pManifest.OperationState, null, 2)) + '</div>';
				}
				if (pManifest.GlobalState && Object.keys(pManifest.GlobalState).length > 0)
				{
					tmpHTML += '<h3>Global State</h3>';
					tmpHTML += '<div class="ultravisor-manifest-output">' + libTimingUtils.escapeHTML(JSON.stringify(pManifest.GlobalState, null, 2)) + '</div>';
				}

				// Task Outputs
				if (pManifest.TaskOutputs && Object.keys(pManifest.TaskOutputs).length > 0)
				{
					tmpHTML += '<h3>Task Outputs</h3>';
					tmpHTML += '<div class="ultravisor-manifest-output">' + libTimingUtils.escapeHTML(JSON.stringify(pManifest.TaskOutputs, null, 2)) + '</div>';
				}

				// Task Manifests (object keyed by node hash)
				if (pManifest.TaskManifests && Object.keys(pManifest.TaskManifests).length > 0)
				{
					tmpHTML += '<h3>Task Manifests</h3>';
					let tmpNodeHashes = Object.keys(pManifest.TaskManifests);
					for (let i = 0; i < tmpNodeHashes.length; i++)
					{
						let tmpNodeHash = tmpNodeHashes[i];
						let tmpTaskManifest = pManifest.TaskManifests[tmpNodeHash];
						tmpHTML += '<div class="ultravisor-manifest-task-result">';
						tmpHTML += '<div class="ultravisor-manifest-task-result-header">';
						tmpHTML += '<code>' + libTimingUtils.escapeHTML(tmpNodeHash) + '</code>';
						tmpHTML += '<span class="ultravisor-manifest-status ' + (tmpTaskManifest.Status || '').toLowerCase() + '">' + libTimingUtils.escapeHTML(tmpTaskManifest.Status || '') + '</span>';
						tmpHTML += '</div>';
						if (tmpTaskManifest.Output)
						{
							tmpHTML += '<div class="ultravisor-manifest-output">' + libTimingUtils.escapeHTML(JSON.stringify(tmpTaskManifest.Output, null, 2)) + '</div>';
						}
						tmpHTML += '</div>';
					}
				}

				// Errors
				if (pManifest.Errors && pManifest.Errors.length > 0)
				{
					tmpHTML += '<h3 style="color:var(--uv-error);">Errors</h3>';
					tmpHTML += '<div class="ultravisor-manifest-output" style="border: 1px solid var(--uv-error);">' + libTimingUtils.escapeHTML(pManifest.Errors.join('\n')) + '</div>';
				}

				// Log
				if (pManifest.Log && pManifest.Log.length > 0)
				{
					tmpHTML += '<h3>Log</h3>';
					tmpHTML += '<div class="ultravisor-manifest-output">' + libTimingUtils.escapeHTML(pManifest.Log.join('\n')) + '</div>';
				}

				// ---- Timing Analysis ----
				let tmpHasTimingData = (pManifest.TimingSummary &&
					(pManifest.TimingSummary.ByCategory || pManifest.TimingSummary.ByTaskType)) ||
					(pManifest.TaskManifests && Object.keys(pManifest.TaskManifests).length > 0);

				if (tmpHasTimingData)
				{
					tmpHTML += '<h3 style="margin-top: 1.5em;">Timing Analysis</h3>';

					// Task Timeline
					tmpHTML += this._renderTaskTimeline(pManifest);

					// Category Histogram
					if (pManifest.TimingSummary && pManifest.TimingSummary.ByCategory)
					{
						tmpHTML += this._renderCategoryHistogram(pManifest.TimingSummary.ByCategory);
					}

					// Task Type Histogram
					if (pManifest.TimingSummary && pManifest.TimingSummary.ByTaskType)
					{
						tmpHTML += this._renderTaskTypeHistogram(pManifest.TimingSummary.ByTaskType);
					}
				}

				tmpHTML += '</div>';
				this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestList-Detail', tmpHTML);
			}.bind(this));
	}

	// ── Timing Visualization Methods ─────────────────────────────────────

	/**
	 * Render a horizontal bar chart of individual task durations.
	 * Color-coded by status: complete=green, error=red, running=blue.
	 *
	 * @param {Object} pManifest - The full manifest object
	 * @returns {string} HTML string
	 */
	_renderTaskTimeline(pManifest)
	{
		// Convert TaskManifests to array with computed elapsed + status
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

		if (tmpTaskResults.length === 0)
		{
			return '';
		}

		// Find max task duration for bar scaling
		let tmpMaxTaskMs = 0;
		for (let i = 0; i < tmpTaskResults.length; i++)
		{
			let tmpMs = tmpTaskResults[i]._ComputedElapsedMs;
			if (tmpMs > tmpMaxTaskMs)
			{
				tmpMaxTaskMs = tmpMs;
			}
		}
		if (tmpMaxTaskMs <= 0)
		{
			tmpMaxTaskMs = 1;
		}

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
			if (tmpTaskStatus === 'complete')
			{
				tmpBarClass = 'complete';
			}
			else if (tmpTaskStatus === 'error')
			{
				tmpBarClass = 'error';
			}
			else if (tmpTaskStatus === 'running')
			{
				tmpBarClass = 'running';
			}

			let tmpWidthPercent = Math.max((tmpTaskMs / tmpMaxTaskMs) * 100, 1);
			let tmpNodeHash = tmpResult._NodeHash || '';
			let tmpDisplayName = tmpResult.TaskTypeName || tmpResult._NodeHash || 'Task ' + (i + 1);

			let tmpRowData =
			{
				Label: libTimingUtils.escapeHTML(tmpDisplayName),
				LabelTitle: libTimingUtils.escapeHTML(tmpNodeHash),
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

		// Time axis
		tmpHTML += '<div class="ultravisor-timing-axis">';
		tmpHTML += '<div class="ultravisor-timing-axis-line">';
		let tmpTickCount = 5;
		for (let t = 0; t <= tmpTickCount; t++)
		{
			let tmpTickMs = (tmpMaxTaskMs / tmpTickCount) * t;
			tmpHTML += '<span class="ultravisor-timing-axis-tick">' + libTimingUtils.formatMs(tmpTickMs) + '</span>';
		}
		tmpHTML += '</div>';
		tmpHTML += '<div class="ultravisor-timing-axis-spacer"></div>';
		tmpHTML += '</div>';

		tmpHTML += '</div>';
		tmpHTML += '</div>';
		return tmpHTML;
	}

	/**
	 * Render a category histogram (time aggregated by category).
	 *
	 * @param {Object} pByCategory - { CategoryName: { TotalMs, Count } }
	 * @returns {string} HTML string
	 */
	_renderCategoryHistogram(pByCategory)
	{
		let tmpCategories = Object.keys(pByCategory);
		if (tmpCategories.length === 0)
		{
			return '';
		}

		// Sort by TotalMs descending
		tmpCategories.sort(function (pA, pB)
		{
			return (pByCategory[pB].TotalMs || 0) - (pByCategory[pA].TotalMs || 0);
		});

		let tmpMaxMs = pByCategory[tmpCategories[0]].TotalMs || 1;

		let tmpHTML = '<div class="ultravisor-timing-card">';
		tmpHTML += '<div class="ultravisor-timing-chart">';
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

		tmpHTML += '</div>';
		tmpHTML += '</div>';
		return tmpHTML;
	}

	/**
	 * Render a task type histogram (time broken down by task type).
	 *
	 * @param {Object} pByTaskType - { TaskTypeId: { TotalMs, Count, Category, Name } }
	 * @returns {string} HTML string
	 */
	_renderTaskTypeHistogram(pByTaskType)
	{
		let tmpTypes = Object.keys(pByTaskType);
		if (tmpTypes.length === 0)
		{
			return '';
		}

		// Sort by TotalMs descending
		tmpTypes.sort(function (pA, pB)
		{
			return (pByTaskType[pB].TotalMs || 0) - (pByTaskType[pA].TotalMs || 0);
		});

		let tmpMaxMs = pByTaskType[tmpTypes[0]].TotalMs || 1;

		let tmpHTML = '<div class="ultravisor-timing-card">';
		tmpHTML += '<div class="ultravisor-timing-chart">';
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

		tmpHTML += '</div>';
		tmpHTML += '</div>';
		return tmpHTML;
	}
}

module.exports = UltravisorManifestListView;

module.exports.default_configuration = _ViewConfiguration;
