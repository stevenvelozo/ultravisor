const libPictView = require('pict-view');

/**
 * Ultravisor-SettingsPanel — content of the hidden right-side settings
 * panel managed by the shell. The panel itself is built in
 * Layout._buildShell() with Hidden:true; the gear button in TopBar-User
 * toggles its visibility. This view just renders the panel's interior.
 *
 * Sections:
 *   - Appearance — pict-section-theme controls (Picker / ModeToggle /
 *                  ScaleSelect) mounted via Theme-Section.mount() on
 *                  every render.
 *   - Run Mode — Debug Mode toggle (writes to AppData.Ultravisor.DebugMode).
 *
 * Theme state is owned by pict-section-theme (its own localStorage
 * scope). No app-managed theme keys.
 */

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-SettingsPanel",

	DefaultRenderable: "Ultravisor-SettingsPanel-Display",
	DefaultDestinationAddress: "#Ultravisor-Settings-Panel",

	AutoRender: false,

	CSS: /*css*/`
		#Ultravisor-Settings-Panel .uv-settings-body
		{
			padding: 14px 16px 24px;
			font-size: 0.85rem;
			color: var(--theme-color-text-primary, #c8b8a0);
			background: var(--theme-color-background-panel, var(--theme-color-background-secondary, #252018));
			height: 100%;
			box-sizing: border-box;
			overflow-y: auto;
		}
		.uv-settings-section { margin-bottom: 18px; }
		.uv-settings-label
		{
			font-size: 0.72rem;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.6px;
			color: var(--theme-color-text-muted, #8a7f72);
			margin-bottom: 8px;
		}
		.uv-settings-row
		{
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 6px 0;
			min-height: 28px;
		}
		.uv-settings-checkbox-label
		{
			font-size: 0.85rem;
			color: var(--theme-color-text-primary, #c8b8a0);
		}
		.uv-settings-checkbox
		{
			width: 16px;
			height: 16px;
			cursor: pointer;
			accent-color: var(--theme-color-brand-primary, #c4956a);
		}
		.uv-settings-divider
		{
			height: 1px;
			background: var(--theme-color-border-light, #302818);
			margin: 12px 0;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-SettingsPanel-Template",
			Template: /*html*/`
<div class="uv-settings-body">
	<div class="uv-settings-section">
		<div class="uv-settings-label">Appearance</div>
		<div id="Ultravisor-Settings-Theme"></div>
	</div>
	<div class="uv-settings-divider"></div>
	<div class="uv-settings-section">
		<div class="uv-settings-label">Run Mode</div>
		<div class="uv-settings-row">
			<label class="uv-settings-checkbox-label" for="Ultravisor-Setting-DebugMode">Debug Mode</label>
			<input id="Ultravisor-Setting-DebugMode" type="checkbox" class="uv-settings-checkbox"
				onchange="{~P~}.views['Ultravisor-SettingsPanel'].toggleDebugMode(this.checked)" />
		</div>
	</div>
</div>`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-SettingsPanel-Display",
			TemplateHash: "Ultravisor-SettingsPanel-Template",
			DestinationAddress: "#Ultravisor-Settings-Panel",
			RenderMethod: "replace"
		}
	]
};

class UltravisorSettingsPanelView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.pict.CSSMap.injectCSS();

		// Mount theme controls on EVERY render — the template re-render erases
		// the previously-mounted destination divs.
		let tmpThemeProvider = this.pict.providers && this.pict.providers['Theme-Section'];
		if (tmpThemeProvider && typeof tmpThemeProvider.mount === 'function')
		{
			tmpThemeProvider.mount(
			{
				Container: '#Ultravisor-Settings-Theme',
				Views: ['Picker', 'ModeToggle', 'ScaleSelect']
			});
		}

		// Sync DebugMode checkbox from AppData.
		let tmpCheckbox = document.getElementById('Ultravisor-Setting-DebugMode');
		if (tmpCheckbox)
		{
			tmpCheckbox.checked = !!(this.pict.AppData.Ultravisor && this.pict.AppData.Ultravisor.DebugMode);
		}

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	toggleDebugMode(pChecked)
	{
		if (!this.pict.AppData.Ultravisor) { this.pict.AppData.Ultravisor = {}; }
		this.pict.AppData.Ultravisor.DebugMode = !!pChecked;
	}
}

module.exports = UltravisorSettingsPanelView;
module.exports.default_configuration = _ViewConfiguration;
