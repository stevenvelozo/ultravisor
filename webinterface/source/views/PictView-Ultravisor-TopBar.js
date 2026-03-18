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
			background-color: var(--uv-topbar-bg);
			color: var(--uv-text);
			padding: 0 1.5em;
			height: 56px;
			box-shadow: 0 2px 8px var(--uv-shadow);
			position: sticky;
			top: 0;
			z-index: 100;
		}
		.ultravisor-topbar-brand {
			font-size: 1.25em;
			font-weight: 700;
			letter-spacing: 0.04em;
			color: var(--uv-brand);
			text-decoration: none;
			cursor: pointer;
		}
		.ultravisor-topbar-brand:hover {
			color: var(--uv-brand-hover);
		}
		.ultravisor-topbar-nav {
			display: flex;
			align-items: center;
			gap: 0.15em;
		}
		.ultravisor-topbar-nav a {
			color: var(--uv-topbar-text);
			text-decoration: none;
			padding: 0.5em 0.75em;
			border-radius: 4px;
			font-size: 0.9em;
			transition: background-color 0.15s, color 0.15s;
			cursor: pointer;
		}
		.ultravisor-topbar-nav a:hover {
			background-color: var(--uv-topbar-hover);
			color: var(--uv-text-heading);
		}
		.ultravisor-topbar-right {
			display: flex;
			align-items: center;
			gap: 0.75em;
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
			background-color: var(--uv-text-tertiary);
			display: inline-block;
		}
		.ultravisor-status-dot.connected {
			background-color: var(--uv-success);
		}
		.ultravisor-status-dot.error {
			background-color: var(--uv-error);
		}

		/* Settings gear */
		.ultravisor-settings-wrap {
			position: relative;
		}
		.ultravisor-settings-gear {
			background: none;
			border: none;
			padding: 6px;
			cursor: pointer;
			border-radius: 4px;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: background-color 0.15s;
			color: var(--uv-topbar-text);
		}
		.ultravisor-settings-gear:hover {
			background-color: var(--uv-topbar-hover);
			color: var(--uv-text-heading);
		}
		.ultravisor-settings-gear svg {
			width: 18px;
			height: 18px;
			fill: currentColor;
		}

		/* Theme dropdown panel */
		.ultravisor-settings-panel {
			position: absolute;
			top: 42px;
			right: 0;
			width: 280px;
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border);
			border-radius: 8px;
			box-shadow: 0 8px 24px var(--uv-shadow-heavy);
			z-index: 200;
			padding: 12px;
		}
		.ultravisor-settings-panel-title {
			font-size: 0.7em;
			text-transform: uppercase;
			letter-spacing: 1px;
			color: var(--uv-text-secondary);
			margin-bottom: 8px;
			padding: 0 4px;
		}
		.ultravisor-settings-theme-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 6px;
		}
		.ultravisor-theme-swatch {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 8px;
			border-radius: 6px;
			cursor: pointer;
			border: 2px solid transparent;
			transition: border-color 0.15s, background-color 0.15s;
			background: var(--uv-bg-base);
		}
		.ultravisor-theme-swatch:hover {
			border-color: var(--uv-border);
		}
		.ultravisor-theme-swatch.active {
			border-color: var(--uv-brand);
		}
		.ultravisor-theme-swatch-colors {
			display: flex;
			gap: 2px;
			flex-shrink: 0;
		}
		.ultravisor-theme-swatch-dot {
			width: 10px;
			height: 10px;
			border-radius: 50%;
		}
		.ultravisor-theme-swatch-label {
			font-size: 0.7em;
			color: var(--uv-text);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.ultravisor-debug-toggle {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 8px 4px;
			cursor: pointer;
			font-size: 0.8em;
			color: var(--uv-text);
		}
		.ultravisor-debug-toggle input[type="checkbox"] {
			accent-color: var(--uv-brand);
		}

		/* Server disconnected banner */
		.ultravisor-disconnected-banner {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			padding: 4em 2em;
			text-align: center;
			color: var(--uv-text-secondary, #8898a4);
		}
		.ultravisor-disconnected-banner-icon {
			font-size: 3em;
			margin-bottom: 0.4em;
			opacity: 0.5;
		}
		.ultravisor-disconnected-banner h2 {
			margin: 0 0 0.5em 0;
			font-weight: 400;
			font-size: 1.4em;
			color: var(--uv-text, #c8d0d8);
		}
		.ultravisor-disconnected-banner p {
			margin: 0 0 0.3em 0;
			font-size: 0.9em;
			max-width: 420px;
			line-height: 1.5;
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
		<a onclick="{~P~}.PictApplication.navigateTo('/Operations')">Operations</a>
		<a onclick="{~P~}.PictApplication.navigateTo('/Schedule')">Schedule</a>
		<a onclick="{~P~}.PictApplication.navigateTo('/Manifests')">Manifests</a>
		<a onclick="{~P~}.PictApplication.navigateTo('/PendingInput')">Awaiting</a>
		<a onclick="{~P~}.PictApplication.navigateTo('/Beacons')">Beacons</a>
		<a onclick="{~P~}.PictApplication.navigateTo('/Timing')">Timing</a>
		<a onclick="{~P~}.PictApplication.editOperation()">Flow Editor</a>
		<a onclick="{~P~}.PictApplication.navigateTo('/Docs')">Docs</a>
	</div>
	<div class="ultravisor-topbar-right">
		<div class="ultravisor-topbar-status" id="Ultravisor-TopBar-StatusArea"></div>
		<div class="ultravisor-settings-wrap">
			<button class="ultravisor-settings-gear" onclick="{~P~}.views['Ultravisor-TopBar'].toggleThemePanel()" title="Settings">
				<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>
			</button>
			<div class="ultravisor-settings-panel" id="Ultravisor-Settings-Panel" style="display:none;">
				<div class="ultravisor-settings-panel-title">Theme</div>
				<div class="ultravisor-settings-theme-grid" id="Ultravisor-Settings-ThemeGrid"></div>
				<div class="ultravisor-settings-panel-title" style="margin-top:12px;">Run Mode</div>
				<label class="ultravisor-debug-toggle">
					<input type="checkbox" id="Ultravisor-DebugModeToggle" onchange="{~P~}.views['Ultravisor-TopBar'].toggleDebugMode()" />
					<span>Debug Mode</span>
				</label>
			</div>
		</div>
	</div>
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

		this._themePanelOpen = false;
		this._boundCloseHandler = null;
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		// Initial status check
		this.pict.PictApplication.loadStatus(
			function (pError)
			{
				let tmpStatus = this.pict.AppData.Ultravisor.ServerStatus;
				if (!pError)
				{
					tmpStatus.StatusClass = 'connected';
					tmpStatus.StatusText = tmpStatus.Status || 'Connected';
				}
				let tmpContent = this.pict.parseTemplateByHash('Ultravisor-TopBar-Status-Template', {}, null, this.pict);
				this.pict.ContentAssignment.assignContent('#Ultravisor-TopBar-StatusArea', tmpContent);
			}.bind(this));

		// Render theme swatches
		this._renderThemeGrid();

		// Set up click-outside-to-close handler
		if (this._boundCloseHandler)
		{
			document.removeEventListener('click', this._boundCloseHandler);
		}
		this._boundCloseHandler = this._handleOutsideClick.bind(this);
		document.addEventListener('click', this._boundCloseHandler);

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	_renderThemeGrid()
	{
		let tmpThemes = this.pict.PictApplication.getThemeList();
		let tmpCurrentTheme = (this.pict.AppData.Ultravisor && this.pict.AppData.Ultravisor.CurrentTheme) || 'desert-dusk';
		let tmpPictCallAddress = this.pict.parseTemplate('{~P~}');
		let tmpHTML = '';

		for (let i = 0; i < tmpThemes.length; i++)
		{
			let tmpTheme = tmpThemes[i];
			let tmpActiveClass = (tmpTheme.Key === tmpCurrentTheme) ? ' active' : '';
			let tmpDots = '';

			for (let j = 0; j < tmpTheme.Colors.length; j++)
			{
				tmpDots += '<div class="ultravisor-theme-swatch-dot" style="background:' + tmpTheme.Colors[j] + ';"></div>';
			}

			tmpHTML += '<div class="ultravisor-theme-swatch' + tmpActiveClass + '" data-theme-key="' + tmpTheme.Key + '" onclick="' + tmpPictCallAddress + '.views[\'Ultravisor-TopBar\'].selectTheme(\'' + tmpTheme.Key + '\')">';
			tmpHTML += '<div class="ultravisor-theme-swatch-colors">' + tmpDots + '</div>';
			tmpHTML += '<div class="ultravisor-theme-swatch-label">' + tmpTheme.Label + '</div>';
			tmpHTML += '</div>';
		}

		this.pict.ContentAssignment.assignContent('#Ultravisor-Settings-ThemeGrid', tmpHTML);
	}

	toggleThemePanel()
	{
		let tmpPanel = document.getElementById('Ultravisor-Settings-Panel');
		if (!tmpPanel)
		{
			return;
		}

		this._themePanelOpen = !this._themePanelOpen;
		tmpPanel.style.display = this._themePanelOpen ? 'block' : 'none';
	}

	selectTheme(pThemeKey)
	{
		this.pict.PictApplication.applyTheme(pThemeKey);
		this._renderThemeGrid();

		// Close the panel
		this._themePanelOpen = false;
		let tmpPanel = document.getElementById('Ultravisor-Settings-Panel');
		if (tmpPanel)
		{
			tmpPanel.style.display = 'none';
		}
	}

	toggleDebugMode()
	{
		this.pict.AppData.Ultravisor.DebugMode = !this.pict.AppData.Ultravisor.DebugMode;
	}

	_handleOutsideClick(pEvent)
	{
		if (!this._themePanelOpen)
		{
			return;
		}

		let tmpWrap = pEvent.target.closest('.ultravisor-settings-wrap');
		if (!tmpWrap)
		{
			this._themePanelOpen = false;
			let tmpPanel = document.getElementById('Ultravisor-Settings-Panel');
			if (tmpPanel)
			{
				tmpPanel.style.display = 'none';
			}
		}
	}
}

module.exports = UltravisorTopBarView;

module.exports.default_configuration = _ViewConfiguration;
