const libPictView = require('pict-view');

/**
 * Ultravisor-TopBar-User — slot view rendered into Theme-TopBar's UserView
 * slot. Hosts the server-status dot + label, the auth-mode badge
 * (promiscuous/authenticated), the pict-section-usermanagement
 * CurrentUser badge, and a gear button that toggles the hidden settings
 * panel.
 */

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-TopBar-User",

	DefaultRenderable: "Ultravisor-TopBar-User-Display",
	DefaultDestinationAddress: "#Theme-TopBar-User",

	AutoRender: false,

	CSS: /*css*/`
		.uv-user
		{
			display: flex;
			align-items: center;
			height: 100%;
			gap: 0.75em;
			padding: 0 12px;
			color: var(--theme-color-text-on-brand, var(--theme-color-text-primary, #c8b8a0));
			font-size: 0.85em;
		}
		.uv-user-status
		{
			display: flex;
			align-items: center;
			gap: 0.5em;
			font-size: 0.8em;
		}
		.uv-status-dot
		{
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background-color: var(--theme-color-text-muted, #706050);
			display: inline-block;
		}
		.uv-status-dot.connected { background-color: var(--theme-color-status-success, #8a9a5a); }
		.uv-status-dot.error     { background-color: var(--theme-color-status-error,   #b04050); }

		.uv-authmode-badge
		{
			display: inline-flex;
			align-items: center;
			padding: 2px 8px;
			border-radius: 10px;
			font-size: 0.7em;
			font-weight: 700;
			letter-spacing: 0.5px;
			text-transform: uppercase;
		}
		.uv-authmode-badge.promiscuous
		{
			background-color: var(--theme-color-status-warning, rgba(245, 158, 11, 0.18));
			color: var(--theme-color-text-on-brand, var(--theme-color-status-warning, #f59e0b));
			border: 1px solid var(--theme-color-status-warning, rgba(245, 158, 11, 0.35));
			opacity: 0.85;
		}
		.uv-authmode-badge.authenticated
		{
			background-color: var(--theme-color-status-success, rgba(34, 197, 94, 0.16));
			color: var(--theme-color-text-on-brand, var(--theme-color-status-success, #34d399));
			border: 1px solid var(--theme-color-status-success, rgba(34, 197, 94, 0.32));
			opacity: 0.85;
		}

		.uv-user-btn
		{
			height: 30px;
			padding: 0 10px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			background: transparent;
			color: var(--theme-color-text-on-brand, var(--theme-color-text-secondary, #c8b8a0));
			border: 1px solid var(--theme-color-border-default, #3a3028);
			border-radius: 4px;
			cursor: pointer;
			font-size: 0.8em;
			box-sizing: border-box;
		}
		.uv-user-btn:hover
		{
			color: var(--theme-color-text-on-brand, var(--theme-color-text-primary, #d8c8a8));
			border-color: var(--theme-color-brand-primary, var(--theme-color-border-strong, #4a4038));
			background: var(--theme-color-background-hover, rgba(255, 255, 255, 0.05));
		}
		.uv-user-btn-gear { padding: 0 8px; }
		.uv-user-btn-gear .pict-icon { font-size: 1.25em; }
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-TopBar-User-Template",
			Template: /*html*/`
<div class="uv-user">
	<!-- pict-section-usermanagement's CurrentUser badge -->
	<span id="PictUM-CurrentUser"></span>
	<div class="uv-user-status" id="Ultravisor-TopBar-StatusArea"></div>
	<button class="uv-user-btn uv-user-btn-gear"
		onclick="{~P~}.views['Ultravisor-Layout'].toggleSettingsPanel()"
		title="Settings" aria-label="Settings">{~I:Settings~}</button>
</div>
`
		},
		{
			Hash: "Ultravisor-TopBar-Status-Template",
			Template: /*html*/`<span class="uv-status-dot {~D:AppData.Ultravisor.ServerStatus.StatusClass~}"></span><span>{~D:AppData.Ultravisor.ServerStatus.StatusText~}</span><span class="uv-authmode-badge {~D:AppData.Ultravisor.ServerStatus.AuthMode~}" title="{~D:AppData.Ultravisor.ServerStatus.AuthTooltip~}">{~D:AppData.Ultravisor.ServerStatus.AuthMode~}</span>`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-TopBar-User-Display",
			TemplateHash: "Ultravisor-TopBar-User-Template",
			DestinationAddress: "#Theme-TopBar-User",
			RenderMethod: "replace"
		}
	]
};

class UltravisorTopBarUserView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.pict.CSSMap.injectCSS();

		this.pict.PictApplication.loadStatus(
			function (pError)
			{
				let tmpStatus = this.pict.AppData.Ultravisor.ServerStatus;
				if (!pError)
				{
					tmpStatus.StatusClass = 'connected';
					tmpStatus.StatusText = tmpStatus.Status || 'Connected';
				}
				tmpStatus.AuthMode = (tmpStatus.AuthEnabled === true) ? 'authenticated' : 'promiscuous';
				tmpStatus.AuthTooltip = (tmpStatus.AuthEnabled === true)
					? 'An auth-beacon is connected; session-gated routes require a valid login.'
					: 'No auth-beacon connected; session-gated routes accept anonymous sessions.';
				let tmpContent = this.pict.parseTemplateByHash('Ultravisor-TopBar-Status-Template', {}, null, this.pict);
				this.pict.ContentAssignment.assignContent('#Ultravisor-TopBar-StatusArea', tmpContent);
			}.bind(this));

		let tmpCurrentUserView = this.pict.views['PictUM-CurrentUser'];
		if (tmpCurrentUserView)
		{
			let tmpProvider = this.pict.providers['Pict-UserManagement-Provider'];
			if (tmpProvider && !this._didInitialSessionCheck)
			{
				this._didInitialSessionCheck = true;
				tmpProvider.checkSession(() => tmpCurrentUserView.render());
			}
			else
			{
				tmpCurrentUserView.render();
			}
		}

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}
}

module.exports = UltravisorTopBarUserView;
module.exports.default_configuration = _ViewConfiguration;
