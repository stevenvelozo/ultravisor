const libPictView = require('pict-view');

const libTimingUtils = require('../Ultravisor-TimingUtils.js');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-TimingView",

	DefaultRenderable: "Ultravisor-TimingView-Content",
	DefaultDestinationAddress: "#Ultravisor-Content-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-timing {
			padding: 2em;
			max-width: 1200px;
			margin: 0 auto;
		}
		.ultravisor-timing-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1.5em;
			padding-bottom: 1em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.ultravisor-timing-header h1 {
			margin: 0;
			font-size: 2em;
			font-weight: 300;
			color: var(--uv-text);
		}
		.ultravisor-timing-selector {
			margin-bottom: 1.5em;
		}
		.ultravisor-timing-selector select {
			width: 100%;
			max-width: 600px;
			padding: 0.6em 0.75em;
		}
		.ultravisor-timing-card {
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 8px;
			padding: 1.5em;
			margin-bottom: 1.5em;
		}
		.ultravisor-timing-summary {
			display: flex;
			flex-wrap: wrap;
			gap: 2em;
			margin-bottom: 1em;
		}
		.ultravisor-timing-stat {
			display: flex;
			flex-direction: column;
		}
		.ultravisor-timing-stat-label {
			font-size: 0.75em;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			color: var(--uv-text-secondary);
			margin-bottom: 0.25em;
		}
		.ultravisor-timing-stat-value {
			font-size: 1.2em;
			font-weight: 600;
			color: var(--uv-text);
		}
		.ultravisor-timing-stat-value.complete {
			color: var(--uv-success);
		}
		.ultravisor-timing-stat-value.error {
			color: var(--uv-error);
		}
		.ultravisor-timing-chart {
			margin-top: 1.5em;
		}
		.ultravisor-timing-chart-title {
			font-size: 0.85em;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			color: var(--uv-text-secondary);
			margin-bottom: 1em;
		}
		.ultravisor-timing-row {
			display: flex;
			align-items: center;
			margin-bottom: 0.6em;
		}
		.ultravisor-timing-row-label {
			width: 180px;
			flex-shrink: 0;
			font-size: 0.85em;
			color: var(--uv-text-secondary);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			padding-right: 1em;
		}
		.ultravisor-timing-row-bar-container {
			flex: 1;
			height: 28px;
			background: var(--uv-bg-base);
			border-radius: 4px;
			position: relative;
			overflow: hidden;
		}
		.ultravisor-timing-row-bar {
			height: 100%;
			border-radius: 4px;
			min-width: 2px;
			transition: width 0.4s ease;
			display: flex;
			align-items: center;
			padding-left: 0.5em;
		}
		.ultravisor-timing-row-bar.complete {
			background: linear-gradient(90deg, #2e7d32, #43a047);
		}
		.ultravisor-timing-row-bar.error {
			background: linear-gradient(90deg, #c62828, #e53935);
		}
		.ultravisor-timing-row-bar.running {
			background: linear-gradient(90deg, var(--uv-info), #1e88e5);
		}
		.ultravisor-timing-row-bar.other {
			background: linear-gradient(90deg, var(--uv-btn-secondary-bg), #546e7a);
		}
		.ultravisor-timing-row-bar-text {
			font-size: 0.75em;
			color: #fff;
			white-space: nowrap;
			text-shadow: 0 1px 2px var(--uv-shadow-heavy);
		}
		.ultravisor-timing-row-duration {
			width: 120px;
			flex-shrink: 0;
			font-size: 0.8em;
			color: var(--uv-text-secondary);
			text-align: right;
			padding-left: 0.75em;
			font-family: monospace;
		}
		.ultravisor-timing-row-count {
			width: 60px;
			flex-shrink: 0;
			font-size: 0.75em;
			color: var(--uv-text-secondary);
			text-align: right;
			padding-left: 0.5em;
		}
		.ultravisor-timing-axis {
			display: flex;
			align-items: center;
			margin-top: 0.5em;
			padding-left: 180px;
		}
		.ultravisor-timing-axis-line {
			flex: 1;
			display: flex;
			justify-content: space-between;
			border-top: 1px solid var(--uv-border);
			padding-top: 0.35em;
		}
		.ultravisor-timing-axis-tick {
			font-size: 0.7em;
			color: var(--uv-text-tertiary);
			font-family: monospace;
		}
		.ultravisor-timing-axis-spacer {
			width: 120px;
			flex-shrink: 0;
		}
		.ultravisor-timing-empty {
			text-align: center;
			padding: 3em;
			color: var(--uv-text-tertiary);
			font-style: italic;
		}
		.ultravisor-timing-verbosity-controls {
			display: flex;
			gap: 0.5em;
			margin-bottom: 1em;
		}
		.ultravisor-timing-verbosity-btn {
			padding: 0.35em 0.75em;
			border: 1px solid var(--uv-border);
			border-radius: 4px;
			background: transparent;
			color: var(--uv-text-secondary);
			font-size: 0.8em;
			cursor: pointer;
		}
		.ultravisor-timing-verbosity-btn.active {
			background: #1e3a5f;
			border-color: #42a5f5;
			color: #90caf9;
		}
		.ultravisor-timing-eventlog-table {
			width: 100%;
			border-collapse: collapse;
			font-size: 0.8em;
		}
		.ultravisor-timing-eventlog-table th {
			text-align: left;
			padding: 0.5em 0.75em;
			background: #0d1b2a;
			color: var(--uv-text-secondary);
			border-bottom: 1px solid var(--uv-border-subtle);
			font-weight: 600;
			text-transform: uppercase;
			font-size: 0.85em;
			letter-spacing: 0.05em;
		}
		.ultravisor-timing-eventlog-table td {
			padding: 0.4em 0.75em;
			border-bottom: 1px solid var(--uv-bg-base);
			color: var(--uv-text-secondary);
			font-family: monospace;
		}
		.ultravisor-timing-eventlog-table tr:hover td {
			background: #1a2744;
		}
		.ultravisor-timing-eventlog-v0 { color: var(--uv-text); }
		.ultravisor-timing-eventlog-v1 { color: var(--uv-text-secondary); }
		.ultravisor-timing-eventlog-v2 { color: #546e7a; }
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-TimingView-Template",
			Template: /*html*/`
<div class="ultravisor-timing">
	<div class="ultravisor-timing-header">
		<h1>Timing</h1>
		<button class="ultravisor-btn ultravisor-btn-secondary" onclick="{~P~}.PictApplication.showView('Ultravisor-TimingView')">Refresh</button>
	</div>
	<div class="ultravisor-timing-selector" id="Ultravisor-Timing-Selector"></div>
	<div id="Ultravisor-Timing-Detail"></div>
</div>
`
		},
		{
			Hash: "Ultravisor-Timing-Row-Template",
			Template: /*html*/`<div class="ultravisor-timing-row"><div class="ultravisor-timing-row-label" title="{~D:Record.LabelTitle~}" style="{~D:Record.LabelStyle~}">{~D:Record.Label~}</div><div class="ultravisor-timing-row-bar-container"><div class="ultravisor-timing-row-bar {~D:Record.BarClass~}" style="width: {~D:Record.WidthPercent~}%;{~D:Record.BarStyle~}">{~D:Record.BarText~}</div></div><div class="ultravisor-timing-row-duration">{~D:Record.Duration~}</div>{~D:Record.CountHTML~}</div>`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-TimingView-Content",
			TemplateHash: "Ultravisor-TimingView-Template",
			DestinationAddress: "#Ultravisor-Content-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorTimingView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this._currentVerbosity = 0;
		this._currentManifest = null;
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.pict.PictApplication.loadManifests(
			function ()
			{
				this.renderManifestSelector();
			}.bind(this));

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	renderManifestSelector()
	{
		let tmpManifests = this.pict.AppData.Ultravisor.Manifests;
		let tmpViewRef = "_Pict.views['Ultravisor-TimingView']";

		if (!tmpManifests || tmpManifests.length === 0)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-Timing-Selector',
				'<div class="ultravisor-timing-empty">No execution manifests recorded yet. Execute an operation to see timing data here.</div>');
			return;
		}

		let tmpHTML = '<select id="Ultravisor-Timing-Select" onchange="' + tmpViewRef + '.onSelectManifest(this.value)">';
		tmpHTML += '<option value="">-- Select an execution to visualize --</option>';

		for (let i = tmpManifests.length - 1; i >= 0; i--)
		{
			let tmpManifest = tmpManifests[i];
			let tmpRunHash = tmpManifest.Hash || '';
			let tmpLabel = (tmpManifest.OperationHash || tmpRunHash);
			let tmpStatus = tmpManifest.Status || 'Unknown';
			let tmpTime = tmpManifest.StartTime ? tmpManifest.StartTime.replace('T', ' ').replace(/\.\d+Z$/, '') : '';
			tmpHTML += '<option value="' + libTimingUtils.escapeHTML(tmpRunHash) + '">' + libTimingUtils.escapeHTML(tmpLabel) + ' [' + tmpStatus + '] ' + tmpTime + '</option>';
		}

		tmpHTML += '</select>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-Timing-Selector', tmpHTML);
	}

	onSelectManifest(pRunHash)
	{
		if (!pRunHash)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-Timing-Detail', '');
			return;
		}

		this.pict.PictApplication.loadManifest(pRunHash,
			function (pError, pManifest)
			{
				if (pError || !pManifest)
				{
					this.pict.ContentAssignment.assignContent('#Ultravisor-Timing-Detail',
						'<div class="ultravisor-timing-card"><p style="color:var(--uv-error);">Error loading manifest details.</p></div>');
					return;
				}

				this._currentManifest = pManifest;
				this._currentVerbosity = 0;
				this.renderTimingVisualization(pManifest);
			}.bind(this));
	}

	renderTimingVisualization(pManifest)
	{
		// Convert TaskManifests object to an array for visualization
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

		let tmpOperationElapsedMs = pManifest.ElapsedMs || 0;
		let tmpOperationElapsedFormatted = libTimingUtils.formatMs(tmpOperationElapsedMs);
		let tmpAverageTaskMs = 0;
		let tmpStatus = (pManifest.Status || 'Unknown').toLowerCase();
		let tmpStatusClass = (tmpStatus === 'complete' || tmpStatus === 'error' || tmpStatus === 'running') ? tmpStatus : '';

		// If no operation-level ElapsedMs, compute from task results
		if (tmpOperationElapsedMs <= 0 && tmpTaskResults.length > 0)
		{
			for (let i = 0; i < tmpTaskResults.length; i++)
			{
				tmpOperationElapsedMs += tmpTaskResults[i]._ComputedElapsedMs;
			}
			tmpOperationElapsedFormatted = libTimingUtils.formatMs(tmpOperationElapsedMs);
		}

		// Compute average
		if (tmpTaskResults.length > 0 && tmpOperationElapsedMs > 0)
		{
			tmpAverageTaskMs = tmpOperationElapsedMs / tmpTaskResults.length;
		}

		// Find the max task duration for bar scaling
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

		let tmpHTML = '';

		// ---- Summary Card ----
		tmpHTML += '<div class="ultravisor-timing-card">';
		tmpHTML += '<div class="ultravisor-timing-summary">';
		tmpHTML += '<div class="ultravisor-timing-stat"><span class="ultravisor-timing-stat-label">Operation</span><span class="ultravisor-timing-stat-value">' + libTimingUtils.escapeHTML(pManifest.OperationHash || '') + '</span></div>';
		tmpHTML += '<div class="ultravisor-timing-stat"><span class="ultravisor-timing-stat-label">Status</span><span class="ultravisor-timing-stat-value ' + tmpStatusClass + '">' + libTimingUtils.escapeHTML(pManifest.Status || 'Unknown') + '</span></div>';
		tmpHTML += '<div class="ultravisor-timing-stat"><span class="ultravisor-timing-stat-label">Total Time</span><span class="ultravisor-timing-stat-value">' + libTimingUtils.escapeHTML(tmpOperationElapsedFormatted) + '</span></div>';
		tmpHTML += '<div class="ultravisor-timing-stat"><span class="ultravisor-timing-stat-label">Tasks</span><span class="ultravisor-timing-stat-value">' + tmpTaskResults.length + '</span></div>';
		tmpHTML += '<div class="ultravisor-timing-stat"><span class="ultravisor-timing-stat-label">Avg per Task</span><span class="ultravisor-timing-stat-value">' + libTimingUtils.formatMs(tmpAverageTaskMs) + '</span></div>';
		tmpHTML += '</div>';

		// ---- Task Timeline ----
		if (tmpTaskResults.length === 0)
		{
			tmpHTML += '<div class="ultravisor-timing-empty">No task results in this manifest.</div>';
		}
		else
		{
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

				let tmpWidthPercent = (tmpMaxTaskMs > 0) ? Math.max((tmpTaskMs / tmpMaxTaskMs) * 100, 1) : 1;
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
		}

		tmpHTML += '</div>';

		// ---- Category Histogram ----
		if (pManifest.TimingSummary && pManifest.TimingSummary.ByCategory)
		{
			tmpHTML += this._renderCategoryHistogram(pManifest.TimingSummary.ByCategory);
		}

		// ---- Task Type Histogram ----
		if (pManifest.TimingSummary && pManifest.TimingSummary.ByTaskType)
		{
			tmpHTML += this._renderTaskTypeHistogram(pManifest.TimingSummary.ByTaskType);
		}

		// ---- Event Log Panel ----
		if (pManifest.EventLog && pManifest.EventLog.length > 0)
		{
			tmpHTML += this._renderEventLogPanel(pManifest);
		}

		this.pict.ContentAssignment.assignContent('#Ultravisor-Timing-Detail', tmpHTML);
	}

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

	_renderEventLogPanel(pManifest)
	{
		let tmpViewRef = "_Pict.views['Ultravisor-TimingView']";

		let tmpHTML = '<div class="ultravisor-timing-card">';
		tmpHTML += '<div class="ultravisor-timing-chart">';
		tmpHTML += '<div class="ultravisor-timing-chart-title">Event Log</div>';

		// Verbosity toggle buttons
		tmpHTML += '<div class="ultravisor-timing-verbosity-controls">';
		tmpHTML += '<button class="ultravisor-timing-verbosity-btn' + (this._currentVerbosity === 0 ? ' active' : '') + '" onclick="' + tmpViewRef + '.setVerbosity(0)">Normal</button>';
		tmpHTML += '<button class="ultravisor-timing-verbosity-btn' + (this._currentVerbosity === 1 ? ' active' : '') + '" onclick="' + tmpViewRef + '.setVerbosity(1)">Verbose</button>';
		tmpHTML += '<button class="ultravisor-timing-verbosity-btn' + (this._currentVerbosity === 2 ? ' active' : '') + '" onclick="' + tmpViewRef + '.setVerbosity(2)">Ultra-verbose</button>';
		tmpHTML += '</div>';

		tmpHTML += '<div id="Ultravisor-Timing-EventLog-Body">';
		tmpHTML += this._renderEventLogTable(pManifest.EventLog, pManifest.StartTime);
		tmpHTML += '</div>';

		tmpHTML += '</div>';
		tmpHTML += '</div>';
		return tmpHTML;
	}

	_renderEventLogTable(pEventLog, pOperationStartTime)
	{
		let tmpStartMs = pOperationStartTime ? new Date(pOperationStartTime).getTime() : 0;
		let tmpMaxVerbosity = this._currentVerbosity;

		let tmpHTML = '<table class="ultravisor-timing-eventlog-table">';
		tmpHTML += '<thead><tr><th>Time</th><th>Node</th><th>Event</th><th>Message</th></tr></thead>';
		tmpHTML += '<tbody>';

		let tmpVisibleCount = 0;

		for (let i = 0; i < pEventLog.length; i++)
		{
			let tmpEvent = pEventLog[i];

			if (tmpEvent.Verbosity > tmpMaxVerbosity)
			{
				continue;
			}

			tmpVisibleCount++;
			let tmpRelativeMs = (tmpEvent.TimestampMs && tmpStartMs) ? (tmpEvent.TimestampMs - tmpStartMs) : 0;
			let tmpVerbClass = 'ultravisor-timing-eventlog-v' + (tmpEvent.Verbosity || 0);

			tmpHTML += '<tr class="' + tmpVerbClass + '">';
			tmpHTML += '<td>+' + libTimingUtils.formatMs(tmpRelativeMs) + '</td>';
			tmpHTML += '<td>' + libTimingUtils.escapeHTML(tmpEvent.NodeHash || '-') + '</td>';
			tmpHTML += '<td>' + libTimingUtils.escapeHTML(tmpEvent.EventName || '') + '</td>';
			tmpHTML += '<td>' + libTimingUtils.escapeHTML(tmpEvent.Message || '') + '</td>';
			tmpHTML += '</tr>';
		}

		if (tmpVisibleCount === 0)
		{
			tmpHTML += '<tr><td colspan="4" style="text-align:center; color:var(--uv-text-tertiary); font-style:italic;">No events at this verbosity level.</td></tr>';
		}

		tmpHTML += '</tbody></table>';
		return tmpHTML;
	}

	setVerbosity(pLevel)
	{
		this._currentVerbosity = pLevel;

		if (this._currentManifest && this._currentManifest.EventLog)
		{
			// Re-render the event log table only
			let tmpTableHTML = this._renderEventLogTable(this._currentManifest.EventLog, this._currentManifest.StartTime);
			this.pict.ContentAssignment.assignContent('#Ultravisor-Timing-EventLog-Body', tmpTableHTML);

			// Update button active states
			let tmpViewRef = "_Pict.views['Ultravisor-TimingView']";
			let tmpBtnHTML = '';
			tmpBtnHTML += '<button class="ultravisor-timing-verbosity-btn' + (pLevel === 0 ? ' active' : '') + '" onclick="' + tmpViewRef + '.setVerbosity(0)">Normal</button>';
			tmpBtnHTML += '<button class="ultravisor-timing-verbosity-btn' + (pLevel === 1 ? ' active' : '') + '" onclick="' + tmpViewRef + '.setVerbosity(1)">Verbose</button>';
			tmpBtnHTML += '<button class="ultravisor-timing-verbosity-btn' + (pLevel === 2 ? ' active' : '') + '" onclick="' + tmpViewRef + '.setVerbosity(2)">Ultra-verbose</button>';

			let tmpControlsEl = document.querySelector('.ultravisor-timing-verbosity-controls');
			if (tmpControlsEl)
			{
				tmpControlsEl.innerHTML = tmpBtnHTML;
			}
		}
	}
}

module.exports = UltravisorTimingView;

module.exports.default_configuration = _ViewConfiguration;
