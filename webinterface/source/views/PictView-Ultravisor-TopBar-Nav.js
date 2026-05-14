const libPictView = require('pict-view');

/**
 * Ultravisor-TopBar-Nav — slot view rendered into Theme-TopBar's NavView
 * slot. Hosts a slimmed primary-navigation strip (8 entries). The seven
 * dashboard-style views (Timeline, Throughput, Capabilities, Constellation,
 * ReachabilityMap, TimingView, CapabilityHeatMap) collapse behind a
 * single 'Dashboards' entry; the full list lives in the sidebar when
 * a dashboard route is active.
 *
 * Active highlight comes from AppData.Ultravisor.CurrentRoute, which the
 * application keeps in sync with navigateTo() and the hashchange event.
 */

const DASHBOARD_ROUTES = ['/Dashboards', '/Timeline', '/Throughput', '/Capabilities', '/Constellation', '/ReachabilityMap', '/Timing', '/CapabilityHeatMap'];

const PRIMARY_TABS =
[
	{ Hash: 'Home',        Label: 'Home',       Route: '/Home' },
	{ Hash: 'Operations',  Label: 'Operations', Route: '/Operations' },
	{ Hash: 'Schedule',    Label: 'Schedule',   Route: '/Schedule' },
	{ Hash: 'Manifests',   Label: 'Manifests',  Route: '/Manifests' },
	{ Hash: 'Beacons',     Label: 'Beacons',    Route: '/Beacons' },
	{ Hash: 'Dashboards',  Label: 'Dashboards', Route: '/Dashboards' },
	{ Hash: 'Fleet',       Label: 'Fleet',      Route: '/Fleet' },
	{ Hash: 'Users',       Label: 'Users',      Route: '/Users' },
	{ Hash: 'Docs',        Label: 'Docs',       Route: '/Docs' }
];

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-TopBar-Nav",

	DefaultRenderable: "Ultravisor-TopBar-Nav-Display",
	DefaultDestinationAddress: "#Theme-TopBar-Nav",

	AutoRender: false,

	CSS: /*css*/`
		.uv-nav
		{
			display: flex;
			align-items: center;
			height: 100%;
			gap: 0.15em;
			padding: 0 12px;
			min-width: 0;
			overflow-x: auto;
			scrollbar-width: thin;
		}
		.uv-nav-tab
		{
			color: var(--theme-color-text-on-brand, var(--theme-color-text-secondary, #c8b8a0));
			text-decoration: none;
			padding: 0.45em 0.7em;
			border-radius: 4px;
			font-size: 0.85em;
			transition: background-color 0.15s, color 0.15s;
			cursor: pointer;
			white-space: nowrap;
		}
		.uv-nav-tab:hover
		{
			background-color: var(--theme-color-background-hover, rgba(255, 255, 255, 0.06));
			color: var(--theme-color-text-on-brand, var(--theme-color-text-primary, #d8c8a8));
		}
		.uv-nav-tab.active
		{
			background-color: var(--theme-color-background-hover, rgba(255, 255, 255, 0.10));
			color: var(--theme-color-brand-primary, var(--theme-color-text-on-brand, #c4956a));
			font-weight: 600;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-TopBar-Nav-Template",
			Template: /*html*/`
<div class="uv-nav">{~TS:Ultravisor-TopBar-Nav-Tab:AppData.Ultravisor.TopBarNav.Tabs~}</div>`
		},
		{
			Hash: "Ultravisor-TopBar-Nav-Tab",
			Template: /*html*/`<a class="uv-nav-tab{~D:Record.ActiveClass~}" onclick="{~P~}.PictApplication.navigateTo('{~D:Record.Route~}')">{~D:Record.Label~}</a>`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-TopBar-Nav-Display",
			TemplateHash: "Ultravisor-TopBar-Nav-Template",
			DestinationAddress: "#Theme-TopBar-Nav",
			RenderMethod: "replace"
		}
	]
};

class UltravisorTopBarNavView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onBeforeRender(pRenderable, pRenderDestinationAddress, pRecord)
	{
		let tmpRoute = (this.pict.AppData.Ultravisor && this.pict.AppData.Ultravisor.CurrentRoute) || '';
		let tmpActiveHash = this._activeTabHash(tmpRoute);

		let tmpTabs = [];
		for (let i = 0; i < PRIMARY_TABS.length; i++)
		{
			let tmpTab = PRIMARY_TABS[i];
			tmpTabs.push(
			{
				Hash:        tmpTab.Hash,
				Label:       tmpTab.Label,
				Route:       tmpTab.Route,
				ActiveClass: (tmpTab.Hash === tmpActiveHash) ? ' active' : ''
			});
		}

		if (!this.pict.AppData.Ultravisor) { this.pict.AppData.Ultravisor = {}; }
		if (!this.pict.AppData.Ultravisor.TopBarNav) { this.pict.AppData.Ultravisor.TopBarNav = {}; }
		this.pict.AppData.Ultravisor.TopBarNav.Tabs = tmpTabs;

		return super.onBeforeRender(pRenderable, pRenderDestinationAddress, pRecord);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.pict.CSSMap.injectCSS();
		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	_activeTabHash(pRoute)
	{
		if (!pRoute) { return 'Home'; }
		for (let i = 0; i < DASHBOARD_ROUTES.length; i++)
		{
			if (pRoute === DASHBOARD_ROUTES[i] || pRoute.indexOf(DASHBOARD_ROUTES[i] + '/') === 0)
			{
				return 'Dashboards';
			}
		}
		// Match by leading-segment so /Manifests/detail/:hash still highlights Manifests.
		for (let i = 0; i < PRIMARY_TABS.length; i++)
		{
			let tmpTab = PRIMARY_TABS[i];
			if (pRoute === tmpTab.Route || pRoute.indexOf(tmpTab.Route + '/') === 0)
			{
				return tmpTab.Hash;
			}
		}
		return '';
	}
}

module.exports = UltravisorTopBarNavView;
module.exports.default_configuration = _ViewConfiguration;
