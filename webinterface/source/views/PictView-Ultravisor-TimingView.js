const libPictView = require('pict-view');

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
			border-bottom: 1px solid #2a2a4a;
		}
		.ultravisor-timing-header h1 {
			margin: 0;
			font-size: 2em;
			font-weight: 300;
			color: #e0e0e0;
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
			background: #16213e;
			border: 1px solid #2a2a4a;
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
			color: #9e9ec0;
			margin-bottom: 0.25em;
		}
		.ultravisor-timing-stat-value {
			font-size: 1.2em;
			font-weight: 600;
			color: #e0e0e0;
		}
		.ultravisor-timing-stat-value.complete {
			color: #66bb6a;
		}
		.ultravisor-timing-stat-value.error {
			color: #ef5350;
		}
		.ultravisor-timing-chart {
			margin-top: 1.5em;
		}
		.ultravisor-timing-chart-title {
			font-size: 0.85em;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			color: #9e9ec0;
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
			color: #b0bec5;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			padding-right: 1em;
		}
		.ultravisor-timing-row-bar-container {
			flex: 1;
			height: 28px;
			background: #1a1a2e;
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
			background: linear-gradient(90deg, #1565c0, #1e88e5);
		}
		.ultravisor-timing-row-bar.other {
			background: linear-gradient(90deg, #37474f, #546e7a);
		}
		.ultravisor-timing-row-bar-text {
			font-size: 0.75em;
			color: #fff;
			white-space: nowrap;
			text-shadow: 0 1px 2px rgba(0,0,0,0.5);
		}
		.ultravisor-timing-row-duration {
			width: 120px;
			flex-shrink: 0;
			font-size: 0.8em;
			color: #78909c;
			text-align: right;
			padding-left: 0.75em;
			font-family: monospace;
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
			border-top: 1px solid #3a3a5c;
			padding-top: 0.35em;
		}
		.ultravisor-timing-axis-tick {
			font-size: 0.7em;
			color: #616161;
			font-family: monospace;
		}
		.ultravisor-timing-axis-spacer {
			width: 120px;
			flex-shrink: 0;
		}
		.ultravisor-timing-empty {
			text-align: center;
			padding: 3em;
			color: #616161;
			font-style: italic;
		}
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
			let tmpGUIDRun = tmpManifest.GUIDRun || '';
			let tmpLabel = (tmpManifest.Name || tmpManifest.GUIDOperation || tmpGUIDRun);
			let tmpStatus = tmpManifest.Status || 'Unknown';
			let tmpTime = tmpManifest.StartTime ? tmpManifest.StartTime.replace('T', ' ').replace(/\.\d+Z$/, '') : '';
			tmpHTML += '<option value="' + this.escapeHTML(tmpGUIDRun) + '">' + this.escapeHTML(tmpLabel) + ' [' + tmpStatus + '] ' + tmpTime + '</option>';
		}

		tmpHTML += '</select>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-Timing-Selector', tmpHTML);
	}

	onSelectManifest(pGUIDRun)
	{
		if (!pGUIDRun)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-Timing-Detail', '');
			return;
		}

		this.pict.PictApplication.loadManifest(pGUIDRun,
			function (pError, pManifest)
			{
				if (pError || !pManifest)
				{
					this.pict.ContentAssignment.assignContent('#Ultravisor-Timing-Detail',
						'<div class="ultravisor-timing-card"><p style="color:#ef5350;">Error loading manifest details.</p></div>');
					return;
				}

				this.renderTimingVisualization(pManifest);
			}.bind(this));
	}

	renderTimingVisualization(pManifest)
	{
		let tmpTaskResults = pManifest.TaskResults || [];
		let tmpOperationElapsedMs = pManifest.ElapsedMs || 0;
		let tmpOperationElapsedFormatted = pManifest.ElapsedFormatted || this.formatMs(tmpOperationElapsedMs);
		let tmpAverageTaskMs = pManifest.AverageTaskMs || 0;
		let tmpStatus = (pManifest.Status || 'Unknown').toLowerCase();
		let tmpStatusClass = (tmpStatus === 'complete' || tmpStatus === 'error' || tmpStatus === 'running') ? tmpStatus : '';

		// If no operation-level ElapsedMs, compute from task results
		if (tmpOperationElapsedMs <= 0 && tmpTaskResults.length > 0)
		{
			for (let i = 0; i < tmpTaskResults.length; i++)
			{
				tmpOperationElapsedMs += (tmpTaskResults[i].ElapsedMs || 0);
			}
			tmpOperationElapsedFormatted = this.formatMs(tmpOperationElapsedMs);
		}

		// Compute average if not provided
		if (tmpAverageTaskMs <= 0 && tmpTaskResults.length > 0 && tmpOperationElapsedMs > 0)
		{
			tmpAverageTaskMs = tmpOperationElapsedMs / tmpTaskResults.length;
		}

		// Find the max task duration for bar scaling
		let tmpMaxTaskMs = 0;
		for (let i = 0; i < tmpTaskResults.length; i++)
		{
			let tmpMs = tmpTaskResults[i].ElapsedMs || 0;
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

		// Summary header
		tmpHTML += '<div class="ultravisor-timing-summary">';
		tmpHTML += '<div class="ultravisor-timing-stat"><span class="ultravisor-timing-stat-label">Operation</span><span class="ultravisor-timing-stat-value">' + this.escapeHTML(pManifest.Name || pManifest.GUIDOperation || '') + '</span></div>';
		tmpHTML += '<div class="ultravisor-timing-stat"><span class="ultravisor-timing-stat-label">Status</span><span class="ultravisor-timing-stat-value ' + tmpStatusClass + '">' + this.escapeHTML(pManifest.Status || 'Unknown') + '</span></div>';
		tmpHTML += '<div class="ultravisor-timing-stat"><span class="ultravisor-timing-stat-label">Total Time</span><span class="ultravisor-timing-stat-value">' + this.escapeHTML(tmpOperationElapsedFormatted) + '</span></div>';
		tmpHTML += '<div class="ultravisor-timing-stat"><span class="ultravisor-timing-stat-label">Tasks</span><span class="ultravisor-timing-stat-value">' + tmpTaskResults.length + '</span></div>';
		tmpHTML += '<div class="ultravisor-timing-stat"><span class="ultravisor-timing-stat-label">Avg per Task</span><span class="ultravisor-timing-stat-value">' + this.formatMs(tmpAverageTaskMs) + '</span></div>';
		tmpHTML += '</div>';

		// Timeline chart
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
				let tmpTaskMs = tmpResult.ElapsedMs || 0;
				let tmpTaskFormatted = tmpResult.ElapsedFormatted || this.formatMs(tmpTaskMs);
				let tmpTaskStatus = (tmpResult.Status || 'Unknown').toLowerCase();
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
				let tmpBarLabel = this.escapeHTML(tmpResult.Name || tmpResult.GUIDTask || '');

				tmpHTML += '<div class="ultravisor-timing-row">';
				tmpHTML += '<div class="ultravisor-timing-row-label" title="' + this.escapeHTML(tmpResult.GUIDTask || '') + '">' + this.escapeHTML(tmpResult.Name || tmpResult.GUIDTask || 'Task ' + (i + 1)) + '</div>';
				tmpHTML += '<div class="ultravisor-timing-row-bar-container">';
				tmpHTML += '<div class="ultravisor-timing-row-bar ' + tmpBarClass + '" style="width: ' + tmpWidthPercent.toFixed(1) + '%;">';
				if (tmpWidthPercent > 20)
				{
					tmpHTML += '<span class="ultravisor-timing-row-bar-text">' + tmpBarLabel + '</span>';
				}
				tmpHTML += '</div>';
				tmpHTML += '</div>';
				tmpHTML += '<div class="ultravisor-timing-row-duration">' + this.escapeHTML(tmpTaskFormatted) + '</div>';
				tmpHTML += '</div>';
			}

			// Time axis
			tmpHTML += '<div class="ultravisor-timing-axis">';
			tmpHTML += '<div class="ultravisor-timing-axis-line">';
			let tmpTickCount = 5;
			for (let t = 0; t <= tmpTickCount; t++)
			{
				let tmpTickMs = (tmpMaxTaskMs / tmpTickCount) * t;
				tmpHTML += '<span class="ultravisor-timing-axis-tick">' + this.formatMs(tmpTickMs) + '</span>';
			}
			tmpHTML += '</div>';
			tmpHTML += '<div class="ultravisor-timing-axis-spacer"></div>';
			tmpHTML += '</div>';

			tmpHTML += '</div>';
		}

		tmpHTML += '</div>';

		this.pict.ContentAssignment.assignContent('#Ultravisor-Timing-Detail', tmpHTML);
	}

	formatMs(pMs)
	{
		if (typeof pMs !== 'number' || pMs <= 0)
		{
			return '0ms';
		}
		if (pMs < 1000)
		{
			return Math.round(pMs) + 'ms';
		}
		if (pMs < 60000)
		{
			let tmpSeconds = Math.floor(pMs / 1000);
			let tmpMs = Math.round(pMs % 1000);
			return tmpSeconds + 's ' + tmpMs + 'ms';
		}
		let tmpMinutes = Math.floor(pMs / 60000);
		let tmpSeconds = Math.floor((pMs % 60000) / 1000);
		return tmpMinutes + 'm ' + tmpSeconds + 's';
	}

	escapeHTML(pValue)
	{
		if (!pValue) return '';
		return String(pValue).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}
}

module.exports = UltravisorTimingView;

module.exports.default_configuration = _ViewConfiguration;
