const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-TopBar",

	DefaultRenderable: "Ultravisor-TopBar-Content",
	DefaultDestinationAddress: "#Ultravisor-TopBar-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-topbar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			background-color: #0f3460;
			color: #e0e0e0;
			padding: 0 1.5em;
			height: 56px;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
			position: sticky;
			top: 0;
			z-index: 100;
		}
		.ultravisor-topbar-brand {
			font-size: 1.25em;
			font-weight: 700;
			letter-spacing: 0.04em;
			color: #4fc3f7;
			text-decoration: none;
			cursor: pointer;
		}
		.ultravisor-topbar-brand:hover {
			color: #81d4fa;
		}
		.ultravisor-topbar-nav {
			display: flex;
			align-items: center;
			gap: 0.15em;
		}
		.ultravisor-topbar-nav a {
			color: #b0bec5;
			text-decoration: none;
			padding: 0.5em 0.75em;
			border-radius: 4px;
			font-size: 0.9em;
			transition: background-color 0.15s, color 0.15s;
			cursor: pointer;
		}
		.ultravisor-topbar-nav a:hover {
			background-color: #1a4a7a;
			color: #fff;
		}
		.ultravisor-topbar-status {
			display: flex;
			align-items: center;
			gap: 0.5em;
			font-size: 0.8em;
		}
		.ultravisor-status-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background-color: #616161;
			display: inline-block;
		}
		.ultravisor-status-dot.connected {
			background-color: #66bb6a;
		}
		.ultravisor-status-dot.error {
			background-color: #ef5350;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-TopBar-Template",
			Template: /*html*/`
<div class="ultravisor-topbar">
	<a class="ultravisor-topbar-brand" onclick="{~P~}.PictApplication.navigateTo('/Home')">Ultravisor</a>
	<div class="ultravisor-topbar-nav">
		<a onclick="{~P~}.PictApplication.navigateTo('/Home')">Dashboard</a>
		<a onclick="{~P~}.PictApplication.navigateTo('/Tasks')">Tasks</a>
		<a onclick="{~P~}.PictApplication.navigateTo('/Operations')">Operations</a>
		<a onclick="{~P~}.PictApplication.navigateTo('/Schedule')">Schedule</a>
		<a onclick="{~P~}.PictApplication.navigateTo('/Manifests')">Manifests</a>
		<a onclick="{~P~}.PictApplication.navigateTo('/Timing')">Timing</a>
	</div>
	<div class="ultravisor-topbar-status" id="Ultravisor-TopBar-StatusArea"></div>
</div>
`
		},
		{
			Hash: "Ultravisor-TopBar-Status-Template",
			Template: /*html*/`<span class="ultravisor-status-dot {~D:AppData.Ultravisor.ServerStatus.StatusClass~}"></span><span>{~D:AppData.Ultravisor.ServerStatus.StatusText~}</span>`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-TopBar-Content",
			TemplateHash: "Ultravisor-TopBar-Template",
			DestinationAddress: "#Ultravisor-TopBar-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorTopBarView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		// Check server status and update the status indicator
		this.pict.PictApplication.loadStatus(
			function (pError)
			{
				let tmpStatus = this.pict.AppData.Ultravisor.ServerStatus;
				if (pError)
				{
					tmpStatus.StatusClass = 'error';
					tmpStatus.StatusText = 'Disconnected';
				}
				else
				{
					tmpStatus.StatusClass = 'connected';
					tmpStatus.StatusText = tmpStatus.Status || 'Connected';
				}

				let tmpContent = this.pict.parseTemplateByHash('Ultravisor-TopBar-Status-Template', {}, null, this.pict);
				this.pict.ContentAssignment.assignContent('#Ultravisor-TopBar-StatusArea', tmpContent);
			}.bind(this));

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}
}

module.exports = UltravisorTopBarView;

module.exports.default_configuration = _ViewConfiguration;
