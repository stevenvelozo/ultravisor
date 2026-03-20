const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-Dashboard",

	DefaultRenderable: "Ultravisor-Dashboard-Content",
	DefaultDestinationAddress: "#Ultravisor-Content-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-dashboard {
			padding: 2em;
			max-width: 1200px;
			margin: 0 auto;
		}
		.ultravisor-dashboard-header {
			margin: 0 0 1.5em 0;
			padding-bottom: 1em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.ultravisor-dashboard-header h1 {
			margin: 0 0 0.25em 0;
			font-size: 2em;
			font-weight: 300;
			color: var(--uv-text);
		}
		.ultravisor-dashboard-header p {
			margin: 0;
			color: var(--uv-text-secondary);
			font-size: 1.1em;
		}
		.ultravisor-dashboard-cards {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
			gap: 1.25em;
			margin-bottom: 2em;
		}
		.ultravisor-stat-card {
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 8px;
			padding: 1.25em;
			transition: border-color 0.2s;
		}
		.ultravisor-stat-card:hover {
			border-color: var(--uv-brand);
		}
		.ultravisor-stat-card-label {
			font-size: 0.8em;
			color: var(--uv-text-secondary);
			text-transform: uppercase;
			letter-spacing: 0.05em;
			margin-bottom: 0.5em;
		}
		.ultravisor-stat-card-value {
			font-size: 2em;
			font-weight: 600;
			color: var(--uv-brand);
		}
		.ultravisor-stat-card-value.running {
			color: var(--uv-success);
		}
		.ultravisor-stat-card-value.stopped {
			color: var(--uv-error);
		}
		.ultravisor-dashboard-actions {
			display: flex;
			gap: 0.75em;
			margin-top: 1.5em;
		}
		.ultravisor-btn {
			padding: 0.6em 1.25em;
			border-radius: 4px;
			font-size: 0.9em;
			cursor: pointer;
			border: none;
			transition: background-color 0.15s;
		}
		.ultravisor-btn-primary {
			background-color: var(--uv-brand);
			color: var(--uv-bg-elevated);
			font-weight: 600;
		}
		.ultravisor-btn-primary:hover {
			background-color: var(--uv-brand-hover);
		}
		.ultravisor-btn-danger {
			background-color: var(--uv-error);
			color: #fff;
			font-weight: 600;
		}
		.ultravisor-btn-danger:hover {
			background-color: #e53935;
		}
		.ultravisor-btn-secondary {
			background-color: var(--uv-btn-secondary-bg);
			color: var(--uv-text);
		}
		.ultravisor-btn-secondary:hover {
			background-color: var(--uv-btn-secondary-bg);
		}
		.ultravisor-btn-execute {
			background-color: #1a3a2a;
			color: #5ab88a;
			border: 1px solid #2a5040;
			font-weight: 600;
		}
		.ultravisor-btn-execute:hover {
			background-color: #204530;
			border-color: #3a6050;
		}
		.ultravisor-btn-sm.ultravisor-btn-execute {
			background-color: #1a3a2a;
			color: #5ab88a;
			border: 1px solid #2a5040;
		}
		.ultravisor-btn-sm.ultravisor-btn-execute:hover {
			background-color: #204530;
		}
		.ultravisor-dashboard-section-title {
			font-size: 1.1em;
			font-weight: 600;
			color: var(--uv-text-secondary);
			margin: 2em 0 1em 0;
			padding-bottom: 0.5em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-Dashboard-Template",
			Template: /*html*/`
<div class="ultravisor-dashboard">
	<div class="ultravisor-dashboard-header">
		<h1>Dashboard</h1>
	</div>
	<div class="ultravisor-dashboard-cards" id="Ultravisor-Dashboard-Cards"></div>
	<div class="ultravisor-dashboard-section-title">Schedule Control</div>
	<div class="ultravisor-dashboard-actions" id="Ultravisor-Dashboard-Actions"></div>
</div>
`
		},
		{
			Hash: "Ultravisor-Dashboard-Cards-Template",
			Template: /*html*/`
<div class="ultravisor-stat-card">
	<div class="ultravisor-stat-card-label">Server Status</div>
	<div class="ultravisor-stat-card-value" id="Ultravisor-Dashboard-StatusValue">{~D:AppData.Ultravisor.ServerStatus.Status~}</div>
</div>
<div class="ultravisor-stat-card">
	<div class="ultravisor-stat-card-label">Templates</div>
	<div class="ultravisor-stat-card-value" id="Ultravisor-Dashboard-TemplateCount">--</div>
</div>
<div class="ultravisor-stat-card">
	<div class="ultravisor-stat-card-label">Operations</div>
	<div class="ultravisor-stat-card-value" id="Ultravisor-Dashboard-OperationCount">--</div>
</div>
<div class="ultravisor-stat-card">
	<div class="ultravisor-stat-card-label">Schedule Entries</div>
	<div class="ultravisor-stat-card-value">{~D:AppData.Ultravisor.ServerStatus.ScheduleEntries~}</div>
</div>
<div class="ultravisor-stat-card">
	<div class="ultravisor-stat-card-label">Schedule Running</div>
	<div class="ultravisor-stat-card-value" id="Ultravisor-Dashboard-ScheduleRunning">--</div>
</div>
`
		},
		{
			Hash: "Ultravisor-Dashboard-Actions-Template",
			Template: /*html*/`
<button class="ultravisor-btn ultravisor-btn-primary" onclick="{~P~}.PictApplication.startSchedule(function(){ {~P~}.PictApplication.showView('Ultravisor-Dashboard'); })">Start Schedule</button>
<button class="ultravisor-btn ultravisor-btn-danger" onclick="{~P~}.PictApplication.stopSchedule(function(){ {~P~}.PictApplication.showView('Ultravisor-Dashboard'); })">Stop Schedule</button>
<button class="ultravisor-btn ultravisor-btn-secondary" onclick="{~P~}.PictApplication.showView('Ultravisor-Dashboard')">Refresh</button>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-Dashboard-Content",
			TemplateHash: "Ultravisor-Dashboard-Template",
			DestinationAddress: "#Ultravisor-Content-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorDashboardView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		let tmpApp = this.pict.PictApplication;

		// Load status, tasks, operations, and schedule counts
		tmpApp.loadStatus(
			function ()
			{
				let tmpCardsHTML = this.pict.parseTemplateByHash('Ultravisor-Dashboard-Cards-Template', {}, null, this.pict);
				this.pict.ContentAssignment.assignContent('#Ultravisor-Dashboard-Cards', tmpCardsHTML);

				let tmpActionsHTML = this.pict.parseTemplateByHash('Ultravisor-Dashboard-Actions-Template', {}, null, this.pict);
				this.pict.ContentAssignment.assignContent('#Ultravisor-Dashboard-Actions', tmpActionsHTML);

				// Update schedule running indicator
				let tmpRunning = this.pict.AppData.Ultravisor.ServerStatus.ScheduleRunning;
				let tmpRunEl = document.getElementById('Ultravisor-Dashboard-ScheduleRunning');
				if (tmpRunEl)
				{
					tmpRunEl.textContent = tmpRunning ? 'Yes' : 'No';
					tmpRunEl.className = 'ultravisor-stat-card-value ' + (tmpRunning ? 'running' : 'stopped');
				}

				// Load template count
				tmpApp.loadNodeTemplates(
					function ()
					{
						let tmpCountEl = document.getElementById('Ultravisor-Dashboard-TemplateCount');
						if (tmpCountEl)
						{
							tmpCountEl.textContent = this.pict.AppData.Ultravisor.NodeTemplateList.length;
						}
					}.bind(this));

				// Load operation count
				tmpApp.loadOperations(
					function ()
					{
						let tmpCountEl = document.getElementById('Ultravisor-Dashboard-OperationCount');
						if (tmpCountEl)
						{
							tmpCountEl.textContent = this.pict.AppData.Ultravisor.OperationList.length;
						}
					}.bind(this));

			}.bind(this));

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}
}

module.exports = UltravisorDashboardView;

module.exports.default_configuration = _ViewConfiguration;
