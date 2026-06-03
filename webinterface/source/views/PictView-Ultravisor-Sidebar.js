const libPictView = require('pict-view');

/**
 * Ultravisor-Sidebar — content view rendered into the shell's left panel.
 *
 * Route-aware:
 *   - When CurrentRoute is a dashboard route (/Dashboards or any of the
 *     7 dashboard sub-routes), shows the dashboard list as a vertical menu.
 *   - For other routes, shows a placeholder section-context container with
 *     the section name and an empty slot for per-section content (operations
 *     list, beacon list, manifest list, ...) that lands in follow-ups.
 */

const DASHBOARD_LIST =
[
	{ Hash: 'Timeline',          Label: 'Timeline',            Route: '/Timeline' },
	{ Hash: 'Throughput',        Label: 'Throughput',          Route: '/Throughput' },
	{ Hash: 'Capabilities',      Label: 'Capabilities',        Route: '/Capabilities' },
	{ Hash: 'Constellation',     Label: 'Constellation',       Route: '/Constellation' },
	{ Hash: 'ReachabilityMap',   Label: 'Reachability Map',    Route: '/ReachabilityMap' },
	{ Hash: 'Timing',            Label: 'Timing',              Route: '/Timing' },
	{ Hash: 'CapabilityHeatMap', Label: 'Capability Heat Map', Route: '/CapabilityHeatMap' }
];

const DASHBOARD_ROUTES = ['/Dashboards'].concat(DASHBOARD_LIST.map(d => d.Route));

const SECTION_LABELS =
{
	'/Home':       'Dashboard',
	'/Operations': 'Operations',
	'/Schedule':   'Schedule',
	'/Manifests':  'Manifests',
	'/Beacons':    'Beacons',
	'/Fleet':      'Fleet',
	'/Users':      'Users',
	'/Docs':       'Documentation',
	'/FlowEditor': 'Flow Editor',
	'/Login':      'Sign In'
};

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-Sidebar",

	DefaultRenderable: "Ultravisor-Sidebar-Display",
	DefaultDestinationAddress: "#Ultravisor-Sidebar-Host",

	AutoRender: false,

	CSS: /*css*/`
		.uv-sidebar
		{
			display: flex;
			flex-direction: column;
			height: 100%;
			min-height: 0;
			background: var(--theme-color-background-panel, var(--theme-color-background-secondary, #252018));
			color: var(--theme-color-text-primary, #c8b8a0);
			overflow: hidden;
		}
		.uv-sidebar-header
		{
			padding: 12px 14px 8px;
			font-size: 0.7em;
			text-transform: uppercase;
			letter-spacing: 1.2px;
			color: var(--theme-color-text-muted, #8a7f72);
			border-bottom: 1px solid var(--theme-color-border-light, #302818);
		}
		.uv-sidebar-section-title
		{
			padding: 14px 16px 6px;
			font-size: 0.95em;
			font-weight: 600;
			color: var(--theme-color-text-secondary, var(--theme-color-text-primary, #d8c8a8));
		}
		.uv-sidebar-list
		{
			display: flex;
			flex-direction: column;
			padding: 4px 0;
			overflow-y: auto;
			min-height: 0;
		}
		.uv-sidebar-item
		{
			padding: 8px 16px;
			cursor: pointer;
			color: var(--theme-color-text-primary, #c8b8a0);
			font-size: 0.88em;
			border-left: 3px solid transparent;
			transition: background-color 0.12s, border-color 0.12s, color 0.12s;
		}
		.uv-sidebar-item:hover
		{
			background: var(--theme-color-background-hover, rgba(255, 255, 255, 0.04));
			color: var(--theme-color-text-secondary, var(--theme-color-text-primary, #d8c8a8));
		}
		.uv-sidebar-item.active
		{
			background: var(--theme-color-background-selected, var(--theme-color-background-hover, rgba(255, 255, 255, 0.08)));
			color: var(--theme-color-brand-primary, var(--theme-color-text-primary, #c4956a));
			border-left-color: var(--theme-color-brand-primary, #c4956a);
			font-weight: 600;
		}
		.uv-sidebar-placeholder
		{
			padding: 16px;
			color: var(--theme-color-text-muted, #907860);
			font-size: 0.82em;
			font-style: italic;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-Sidebar-Template",
			Template: /*html*/`
<div class="uv-sidebar">
	<div class="uv-sidebar-header">{~D:AppData.Ultravisor.Sidebar.HeaderLabel~}</div>
	{~TS:Ultravisor-Sidebar-LockedBlock:AppData.Ultravisor.Sidebar.LockedBlock~}
	{~TS:Ultravisor-Sidebar-DashboardListBlock:AppData.Ultravisor.Sidebar.DashboardListBlock~}
	{~TS:Ultravisor-Sidebar-SectionContextBlock:AppData.Ultravisor.Sidebar.SectionContextBlock~}
</div>`
		},
		{
			Hash: "Ultravisor-Sidebar-LockedBlock",
			Template: /*html*/`
<div class="uv-sidebar-placeholder">Sign in to access Ultravisor.</div>`
		},
		{
			Hash: "Ultravisor-Sidebar-DashboardListBlock",
			Template: /*html*/`
<div class="uv-sidebar-section-title">All Dashboards</div>
<div class="uv-sidebar-list">{~TS:Ultravisor-Sidebar-DashboardRow:Record.Items~}</div>`
		},
		{
			Hash: "Ultravisor-Sidebar-DashboardRow",
			Template: /*html*/`<a class="uv-sidebar-item{~D:Record.ActiveClass~}" onclick="{~P~}.PictApplication.navigateTo('{~D:Record.Route~}')">{~D:Record.Label~}</a>`
		},
		{
			Hash: "Ultravisor-Sidebar-SectionContextBlock",
			Template: /*html*/`
<div class="uv-sidebar-section-title">{~D:Record.SectionLabel~}</div>
<div class="uv-sidebar-list" id="Ultravisor-Sidebar-Slot">{~TS:Ultravisor-Sidebar-Item:Record.Items~}</div>
{~TS:Ultravisor-Sidebar-EmptySlot:Record.EmptyItems~}`
		},
		{
			Hash: "Ultravisor-Sidebar-Item",
			Template: /*html*/`<a class="uv-sidebar-item{~D:Record.ActiveClass~}" onclick="{~P~}.PictApplication.navigateTo('{~D:Record.Route~}')">{~D:Record.Label~}</a>`
		},
		{
			Hash: "Ultravisor-Sidebar-EmptySlot",
			Template: /*html*/`<div class="uv-sidebar-placeholder">No items yet for this section.</div>`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-Sidebar-Display",
			TemplateHash: "Ultravisor-Sidebar-Template",
			DestinationAddress: "#Ultravisor-Sidebar-Host",
			RenderMethod: "replace"
		}
	]
};

class UltravisorSidebarView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onBeforeRender(pRenderable, pRenderDestinationAddress, pRecord)
	{
		let tmpRoute = (this.pict.AppData.Ultravisor && this.pict.AppData.Ultravisor.CurrentRoute) || '/Home';

		if (!this.pict.AppData.Ultravisor) { this.pict.AppData.Ultravisor = {}; }
		if (!this.pict.AppData.Ultravisor.Sidebar) { this.pict.AppData.Ultravisor.Sidebar = {}; }
		let tmpSidebar = this.pict.AppData.Ultravisor.Sidebar;

		// Auth gate: while signed out in authenticated mode the sidebar
		// offers no navigation — just a sign-in prompt.  Clearing the
		// dashboard + section blocks and showing the locked block keeps the
		// context panel from exposing any of the application surface.
		let tmpApp = this.pict.PictApplication;
		if (tmpApp && typeof tmpApp.isLoginRequired === 'function' && tmpApp.isLoginRequired())
		{
			tmpSidebar.HeaderLabel = 'Sign In';
			tmpSidebar.LockedBlock = [{}];
			tmpSidebar.DashboardListBlock = [];
			tmpSidebar.SectionContextBlock = [];
			return super.onBeforeRender(pRenderable, pRenderDestinationAddress, pRecord);
		}
		tmpSidebar.LockedBlock = [];

		let tmpIsDashboardRoute = this._isDashboardRoute(tmpRoute);

		if (tmpIsDashboardRoute)
		{
			tmpSidebar.HeaderLabel = 'Dashboards';

			let tmpItems = [];
			for (let i = 0; i < DASHBOARD_LIST.length; i++)
			{
				let tmpDash = DASHBOARD_LIST[i];
				tmpItems.push(
				{
					Label:       tmpDash.Label,
					Route:       tmpDash.Route,
					ActiveClass: (tmpRoute === tmpDash.Route) ? ' active' : ''
				});
			}

			tmpSidebar.DashboardListBlock = [{ Items: tmpItems }];
			tmpSidebar.SectionContextBlock = [];
		}
		else
		{
			tmpSidebar.HeaderLabel = 'Context';

			let tmpSlot = (this.pict.AppData.Ultravisor && this.pict.AppData.Ultravisor.SidebarSlot)
				? this.pict.AppData.Ultravisor.SidebarSlot : [];

			tmpSidebar.DashboardListBlock = [];
			tmpSidebar.SectionContextBlock =
			[{
				SectionLabel: this._sectionLabel(tmpRoute),
				Items:        Array.isArray(tmpSlot) ? tmpSlot : [],
				EmptyItems:   (Array.isArray(tmpSlot) && tmpSlot.length > 0) ? [] : [{}]
			}];
		}

		return super.onBeforeRender(pRenderable, pRenderDestinationAddress, pRecord);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.pict.CSSMap.injectCSS();
		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	_isDashboardRoute(pRoute)
	{
		for (let i = 0; i < DASHBOARD_ROUTES.length; i++)
		{
			if (pRoute === DASHBOARD_ROUTES[i] || pRoute.indexOf(DASHBOARD_ROUTES[i] + '/') === 0)
			{
				return true;
			}
		}
		return false;
	}

	_sectionLabel(pRoute)
	{
		let tmpKeys = Object.keys(SECTION_LABELS);
		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpKey = tmpKeys[i];
			if (pRoute === tmpKey || pRoute.indexOf(tmpKey + '/') === 0)
			{
				return SECTION_LABELS[tmpKey];
			}
		}
		return 'Ultravisor';
	}
}

module.exports = UltravisorSidebarView;
module.exports.default_configuration = _ViewConfiguration;
