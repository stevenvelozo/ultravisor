const libPictView = require('pict-view');

/**
 * Ultravisor-Layout — application chrome.
 *
 * Built on pict-section-modal's shell() API. This view owns the shell;
 * everything else (TopBar, Sidebar, Settings panel, BottomBar, content
 * center) lives in panels managed by the shell.
 *
 * Panel layout:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ #Theme-TopBar  (top, fixed, 56px) — BrandMark + Nav + User   │
 *   ├────────┬─────────────────────────────────────────────────────┤
 *   │ #Ult-  │ #Ultravisor-Content-Container                       │
 *   │ Side-  │ (center — current section view renders here)        │
 *   │ bar-   │                                                     │
 *   │ Host   │                                                     │
 *   │ (left, │                                                     │
 *   │ resiz, │                                                     │
 *   │ tabs)  │                                                     │
 *   ├────────┴─────────────────────────────────────────────────────┤
 *   │ #Theme-BottomBar (bottom, fixed, 28px) — StatusBar slot      │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Plus #Ultravisor-Settings-Panel — a Hidden panel that overlays from
 * the right when the gear button in the user slot toggles it. No edge
 * affordance: Hidden + Collapsed means no chrome until reveal. The
 * gear is the only way in.
 */

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-Layout",

	DefaultRenderable: "Ultravisor-Layout-Shell",
	DefaultDestinationAddress: "#Ultravisor-Application-Container",

	AutoRender: false,

	CSS: /*css*/`
		/* height: 100% (not 100vh) so Theme-Scale's CSS zoom on <html>
		   doesn't push panels off-screen — vh units render against the
		   un-zoomed viewport. */
		html, body { height: 100%; margin: 0; padding: 0; }
		body
		{
			background: var(--theme-color-background-primary, #1a1714);
			color: var(--theme-color-text-primary, #c8b8a0);
			font-family: var(--theme-typography-family-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif);
		}
		#Ultravisor-Application-Container
		{
			height: 100%;
			min-height: 0;
			overflow: hidden;
		}

		.pict-modal-shell-host   { height: 100%; }
		.pict-modal-shell        { background: var(--theme-color-background-primary, #1a1714); }
		.pict-modal-shell-panel  { background: var(--theme-color-background-panel,    #252018); }
		.pict-modal-shell-center { background: var(--theme-color-background-primary,  #1a1714); }

		#Ultravisor-Content-Container
		{
			height: 100%;
			min-height: 0;
			overflow-y: auto;
			background: var(--theme-color-background-primary, #1a1714);
			color: var(--theme-color-text-primary, #c8b8a0);
		}
		#Ultravisor-Settings-Panel
		{
			height: 100%;
			min-height: 0;
			overflow-y: auto;
			background: var(--theme-color-background-panel, #252018);
			color: var(--theme-color-text-primary, #c8b8a0);
			border-left: 1px solid var(--theme-color-border-default, #3a3028);
		}

		/* Server disconnected banner — written into #Ultravisor-Content-Container
		   by the application's _setConnectionState() helper when the API
		   becomes unreachable. */
		.ultravisor-disconnected-banner
		{
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			padding: 4em 2em;
			text-align: center;
			color: var(--theme-color-text-muted, #8a7f72);
		}
		.ultravisor-disconnected-banner-icon
		{
			font-size: 3em;
			margin-bottom: 0.4em;
			opacity: 0.5;
		}
		.ultravisor-disconnected-banner h2
		{
			margin: 0 0 0.5em 0;
			font-weight: 400;
			font-size: 1.4em;
			color: var(--theme-color-text-primary, #c8d0d8);
		}
		.ultravisor-disconnected-banner p
		{
			margin: 0 0 0.3em 0;
			font-size: 0.9em;
			max-width: 420px;
			line-height: 1.5;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-Layout-Shell-Template",
			Template: /*html*/`
<div id="Ultravisor-Layout-Mount" style="height:100%"></div>`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-Layout-Shell",
			TemplateHash: "Ultravisor-Layout-Shell-Template",
			DestinationAddress: "#Ultravisor-Application-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorLayoutView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this._shell = null;
		this._shellPanelsBuilt = false;
		this._hashListenerWired = false;
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.pict.CSSMap.injectCSS();

		if (!this._shellPanelsBuilt)
		{
			this._buildShell();
			this._shellPanelsBuilt = true;
		}

		this._wireHashChangeListener();

		// Resolve the current route so the matching content view renders.
		if (this.pict.providers.PictRouter)
		{
			this.pict.providers.PictRouter.resolve();
		}

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	_buildShell()
	{
		let tmpModalSection = this.pict.views['Pict-Section-Modal'];
		if (!tmpModalSection || typeof tmpModalSection.shell !== 'function')
		{
			this.pict.log.warn('Ultravisor-Layout: pict-section-modal.shell not available');
			return;
		}

		let tmpMount = document.getElementById('Ultravisor-Layout-Mount');
		if (!tmpMount)
		{
			this.pict.log.warn('Ultravisor-Layout: #Ultravisor-Layout-Mount not in DOM yet');
			return;
		}

		this._shell = tmpModalSection.shell(tmpMount, { PersistenceKey: 'ultravisor-shell' });

		// Top — Theme chrome (BrandMark + Nav slot + User slot).
		this._shell.addPanel(
		{
			Hash: 'topbar',
			Side: 'top',
			Mode: 'fixed',
			Size: 56,
			ContentDestinationId: 'Theme-TopBar',
			ContentView: 'Theme-TopBar'
		});

		// Left — section-context sidebar (resizable, responsive drawer below 900px).
		this._shell.addPanel(
		{
			Hash: 'sidebar',
			Side: 'left',
			Mode: 'resizable',
			Size: 260,
			MinSize: 180,
			MaxSize: 480,
			Collapsed: false,
			Title: 'Context',
			ContentDestinationId: 'Ultravisor-Sidebar-Host',
			ContentView: 'Ultravisor-Sidebar',
			ResponsiveDrawer: 900
		});

		// Bottom — Theme BottomBar wraps the host's StatusView slot.
		this._shell.addPanel(
		{
			Hash: 'statusbar',
			Side: 'bottom',
			Mode: 'fixed',
			Size: 28,
			ContentDestinationId: 'Theme-BottomBar',
			ContentView: 'Theme-BottomBar'
		});

		// Right (overlay, Hidden) — settings panel. The gear in TopBar-User
		// toggles it; no edge affordance until then.
		this._shell.addPanel(
		{
			Hash: 'settings',
			Side: 'right',
			Mode: 'resizable',
			Position: 'overlay',
			Size: 360,
			MinSize: 280,
			MaxSize: 540,
			Hidden: true,
			Collapsed: true,
			ContentDestinationId: 'Ultravisor-Settings-Panel',
			ContentView: 'Ultravisor-SettingsPanel'
		});

		// Center — current section's content view renders into this destination.
		this._shell.center({ ContentDestinationId: 'Ultravisor-Content-Container' });
	}

	// ─────────────────────────────────────────────
	//  Panel accessors — referenced by slot views (gear button) and the app.
	// ─────────────────────────────────────────────

	getSidebarPanel()  { return this._shell ? this._shell.getPanel('sidebar')  : null; }
	getSettingsPanel() { return this._shell ? this._shell.getPanel('settings') : null; }

	toggleSidebar()
	{
		let tmpPanel = this.getSidebarPanel();
		if (tmpPanel) { tmpPanel.toggle(); }
	}

	toggleSettingsPanel()
	{
		let tmpPanel = this.getSettingsPanel();
		if (tmpPanel) { tmpPanel.toggle(); }
	}

	// ─────────────────────────────────────────────
	//  Route sync — keep AppData.Ultravisor.CurrentRoute fresh on
	//  back/forward and any direct hash mutation so the topbar tabs
	//  + sidebar re-render with the right active state.
	// ─────────────────────────────────────────────

	_wireHashChangeListener()
	{
		if (this._hashListenerWired) { return; }
		this._hashListenerWired = true;
		let tmpSelf = this;
		window.addEventListener('hashchange', () =>
		{
			if (tmpSelf.pict.PictApplication && typeof tmpSelf.pict.PictApplication.onRouteChanged === 'function')
			{
				tmpSelf.pict.PictApplication.onRouteChanged();
			}
		});
	}
}

module.exports = UltravisorLayoutView;
module.exports.default_configuration = _ViewConfiguration;
