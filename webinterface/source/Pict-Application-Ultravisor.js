const libPictApplication = require('pict-application');
const libPictRouter = require('pict-router');
const libPictSectionForm = require('pict-section-form');
const libPictSectionContent = require('pict-section-content');
const libPictSectionTheme = require('pict-section-theme');
const libUltravisorBrand = require('./Ultravisor-Brand.js');

// Views
const libViewLayout = require('./views/PictView-Ultravisor-Layout.js');
const libViewTopBarNav = require('./views/PictView-Ultravisor-TopBar-Nav.js');
const libViewTopBarUser = require('./views/PictView-Ultravisor-TopBar-User.js');
const libViewSidebar = require('./views/PictView-Ultravisor-Sidebar.js');
const libViewSettingsPanel = require('./views/PictView-Ultravisor-SettingsPanel.js');
const libViewBottomBar = require('./views/PictView-Ultravisor-BottomBar.js');
const libViewDashboard = require('./views/PictView-Ultravisor-Dashboard.js');
const libViewOperationList = require('./views/PictView-Ultravisor-OperationList.js');
const libViewOperationEdit = require('./views/PictView-Ultravisor-OperationEdit.js');
const libViewSchedule = require('./views/PictView-Ultravisor-Schedule.js');
const libViewManifestList = require('./views/PictView-Ultravisor-ManifestList.js');
const libViewManifestDetail = require('./views/PictView-Ultravisor-ManifestDetail.js');
const libViewTimingView = require('./views/PictView-Ultravisor-TimingView.js');
const libViewFlowEditor = require('./views/PictView-Ultravisor-FlowEditor.js');
const libViewPendingInput = require('./views/PictView-Ultravisor-PendingInput.js');
const libViewDocumentation = require('./views/PictView-Ultravisor-Documentation.js');
const libViewBeaconList = require('./views/PictView-Ultravisor-BeaconList.js');
const libViewTimeline = require('./views/PictView-Ultravisor-Timeline.js');
const libProviderTimelineStream = require('./providers/Provider-Timeline-Stream.js');
const libViewCapabilityHeatMap = require('./views/PictView-Ultravisor-CapabilityHeatMap.js');
const libViewThroughput = require('./views/PictView-Ultravisor-Throughput.js');
const libViewConstellation = require('./views/PictView-Ultravisor-Constellation.js');
const libViewReachabilityMap = require('./views/PictView-Ultravisor-ReachabilityMap.js');
const libViewOperationDescriptionEditor = require('./views/PictView-Ultravisor-OperationDescriptionEditor.js');
const libViewFleet = require('./views/PictView-Ultravisor-Fleet.js');
const libViewLogin = require('./views/PictView-Ultravisor-Login.js');
const libViewUserManagement = require('./views/PictView-Ultravisor-UserManagement.js');
const libPictSectionModal = require('pict-section-modal');
const libPictSectionUserManagement = require('pict-section-usermanagement');
const libPictSectionLogin = require('pict-section-login');

class UltravisorApplication extends libPictApplication
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		// Skip premature route resolution during addRoute(); the Layout view
		// calls resolve() explicitly after the DOM is ready.
		this.pict.settings.RouterSkipRouteResolveOnAdd = true;

		// Add the router provider with routes
		this.pict.addProvider('PictRouter', require('./providers/PictRouter-Ultravisor-Configuration.json'), libPictRouter);

		// Add the layout view (the shell that contains topbar, sidebar, bottombar,
		// settings panel, and the workspace center).
		this.pict.addView('Ultravisor-Layout', libViewLayout.default_configuration, libViewLayout);

		// Bottom bar (existing status view) — used as the StatusView slot below.
		this.pict.addView('Ultravisor-BottomBar', libViewBottomBar.default_configuration, libViewBottomBar);

		// Theme-TopBar / Theme-BottomBar slot views must be registered BEFORE
		// the Theme-Section provider — _bootstrap looks them up by hash.
		this.pict.addView('Ultravisor-TopBar-Nav',  libViewTopBarNav.default_configuration,  libViewTopBarNav);
		this.pict.addView('Ultravisor-TopBar-User', libViewTopBarUser.default_configuration, libViewTopBarUser);
		this.pict.addView('Ultravisor-Sidebar',     libViewSidebar.default_configuration,    libViewSidebar);
		this.pict.addView('Ultravisor-SettingsPanel', libViewSettingsPanel.default_configuration, libViewSettingsPanel);

		// Add content views
		this.pict.addView('Ultravisor-Dashboard', libViewDashboard.default_configuration, libViewDashboard);
		this.pict.addView('Ultravisor-OperationList', libViewOperationList.default_configuration, libViewOperationList);
		this.pict.addView('Ultravisor-OperationEdit', libViewOperationEdit.default_configuration, libViewOperationEdit);
		this.pict.addView('Ultravisor-Schedule', libViewSchedule.default_configuration, libViewSchedule);
		this.pict.addView('Ultravisor-ManifestList', libViewManifestList.default_configuration, libViewManifestList);
		this.pict.addView('Ultravisor-ManifestDetail', libViewManifestDetail.default_configuration, libViewManifestDetail);
		this.pict.addView('Ultravisor-TimingView', libViewTimingView.default_configuration, libViewTimingView);
		this.pict.addView('Ultravisor-FlowEditor', libViewFlowEditor.default_configuration, libViewFlowEditor);
		this.pict.addView('Ultravisor-PendingInput', libViewPendingInput.default_configuration, libViewPendingInput);
		this.pict.addView('Ultravisor-Documentation', libViewDocumentation.default_configuration, libViewDocumentation);
		this.pict.addView('Ultravisor-BeaconList', libViewBeaconList.default_configuration, libViewBeaconList);

		// Phase 6 — three-band timeline (the spine). Provider owns the
		// `/Timeline` long-poll cycle and reconciles into AppData.Timeline.*;
		// view observes AppData and paints via Canvas + SVG.
		this.pict.addProvider('Timeline-Stream', libProviderTimelineStream.default_configuration, libProviderTimelineStream);
		this.pict.addView('Ultravisor-Timeline', libViewTimeline.default_configuration, libViewTimeline);

		// Phase 7 — complementary timeline views. Each is standalone (own
		// fetch loop on the same /Timeline endpoint) and shares the spine's
		// URL contract via webinterface/source/views/timeline/url-state.js.
		this.pict.addView('Ultravisor-CapabilityHeatMap', libViewCapabilityHeatMap.default_configuration, libViewCapabilityHeatMap);
		this.pict.addView('Ultravisor-Throughput', libViewThroughput.default_configuration, libViewThroughput);
		this.pict.addView('Ultravisor-Constellation', libViewConstellation.default_configuration, libViewConstellation);
		this.pict.addView('Ultravisor-ReachabilityMap', libViewReachabilityMap.default_configuration, libViewReachabilityMap);
		this.pict.addView('Ultravisor-OperationDescriptionEditor', libViewOperationDescriptionEditor.default_configuration, libViewOperationDescriptionEditor);
		this.pict.addView('Ultravisor-Fleet', libViewFleet.default_configuration, libViewFleet);
		this.pict.addView('Ultravisor-Login', libViewLogin.default_configuration, libViewLogin);
		this.pict.addView('Ultravisor-UserManagement', libViewUserManagement.default_configuration, libViewUserManagement);

		// Modal/toast notification system (replaces browser alert/confirm).
		// Two registrations: 'Modal' is the legacy hash existing call sites
		// use; 'Pict-Section-Modal' is what pict-section-usermanagement's
		// confirm/toast hooks look up. Both addView calls produce
		// independent instances of the same section, which is fine because
		// the modal section is stateless across constructions.
		// 'Pict-Section-Modal' also exposes the shell() + addPanel() API
		// the Layout view consumes to build its panels.
		this.pict.addView('Modal', {}, libPictSectionModal);
		this.pict.addView('Pict-Section-Modal', {}, libPictSectionModal);

		// Theme-Section — registers the topbar/bottombar chrome, the
		// theme catalog, persistence, and brand. ApplyDefault is the
		// shared ecosystem identity; the six ultravisor-* palettes in
		// pict-section-theme/source/themes/ are pickable from the
		// settings panel.
		this.pict.addProvider('Theme-Section',
		{
			ApplyDefault: 'retold-default',
			DefaultMode:  'system',
			DefaultScale: 1.0,
			Brand:        libUltravisorBrand,
			Views: ['Picker', 'ModeToggle', 'ScaleSelect', 'BrandMark', 'TopBar', 'BottomBar'],
			ViewOptions:
			{
				TopBar:    { NavView: 'Ultravisor-TopBar-Nav', UserView: 'Ultravisor-TopBar-User', Height: 56 },
				BottomBar: { StatusView: 'Ultravisor-BottomBar', Height: 28 }
			}
		}, libPictSectionTheme);

		// pict-section-usermanagement — install() registers the provider
		// + the CRUD views (CurrentUser, UserList, UserEdit,
		// PasswordChange).  We deliberately exclude its Login view
		// because Ultravisor uses pict-section-login (registered below)
		// for the actual sign-in flow.  Default browser fetch() is the
		// transport, hitting orator-authentication's /1.0/Authenticate
		// + the auth-beacon /Users routes mounted by ultravisor's API
		// server.  The CRUD views only function when the connected
		// auth-beacon's provider implements user management — the boot
		// gate hides their UI entry points when SupportsUserManagement
		// is false but the views are always registered so deep links
		// don't crash.
		let tmpSelf = this;
		libPictSectionUserManagement.install(this.pict,
		{
			ProviderOptions: { BaseURL: '/1.0/' },
			Views: ['CurrentUser', 'UserList', 'UserEdit', 'PasswordChange'],
			ViewOptions:
			{
				CurrentUser: { OnLogout: () => tmpSelf._afterLogout() }
			}
		});

		// pict-section-login — the dedicated login flow.  Renders into
		// `#Pict-Login-Container` (PictView-Ultravisor-Login paints that
		// mount point inside the content panel).  Hooks fire after the
		// section calls the underlying endpoints:
		//   onLoginSuccess  → re-render topbar + bounce to /Home
		//   onLogout        → re-render topbar + bounce back to /Login
		//   onSessionChecked → used by _bootGate to decide initial route
		// CheckSessionOnLoad is left at its default (true) so a stale
		// cookie is validated automatically on first render.
		this.pict.addView('Pict-Section-Login',
		{
			LoginEndpoint:        '/1.0/Authenticate',
			LogoutEndpoint:       '/1.0/Deauthenticate',
			CheckSessionEndpoint: '/1.0/CheckSession',
			CheckSessionOnLoad:   true,
			ShowOAuthProviders:   false
		}, libPictSectionLogin);
		// Wire the section's overridable hooks to host-side flow.  The
		// section's class methods are inherited; we monkey-patch the
		// instance so consumers don't need a subclass file just to
		// connect three handlers.
		let tmpLogin = this.pict.views['Pict-Section-Login'];
		if (tmpLogin)
		{
			tmpLogin.onLoginSuccess   = (pSession) => tmpSelf._afterLogin(pSession);
			tmpLogin.onLogout         = ()         => tmpSelf._afterLogout();
			tmpLogin.onSessionChecked = (pSession) => tmpSelf._afterSessionChecked(pSession);
		}

		// Register pict-section-form service types so Form panels can use them
		this.pict.addServiceType('PictFormMetacontroller', libPictSectionForm.PictFormMetacontroller);

		// Register pict-section-content service types so Markdown panels can render content
		this.pict.addServiceType('PictContentProvider', libPictSectionContent.PictContentProvider);

		// Register the Ultravisor card settings panel for per-field mode toggles (Constant/Address/Default)
		const libUltravisorCardSettingsPanel = require('./panels/Ultravisor-CardSettingsPanel.js');
		this.pict.addServiceType('PictFlowCardPropertiesPanel-UltravisorSettings', libUltravisorCardSettingsPanel);
	}

	onAfterInitializeAsync(fCallback)
	{
		// Initialize application state. Theme/mode/scale persistence is
		// owned by pict-section-theme — no theme keys live in AppData.
		this.pict.AppData.Ultravisor =
		{
			APIBaseURL: '',
			ServerStatus: { Status: 'Unknown', ScheduleEntries: 0, ScheduleRunning: false },
			// Auth-mode metadata populated by _bootGate() from /status.
			// Mode: 'promiscuous' | 'authenticated'
			// SupportsUserManagement: true → in-app user CRUD UI visible
			// SessionChecked: flips true after the section's first
			// checkSession() resolves; views that gate on auth state
			// (TopBar-User badge, Sidebar) should not paint user info
			// until this is true to avoid a flash of "anonymous".
			Auth:
			{
				Mode: 'promiscuous',
				SupportsUserManagement: false,
				SessionChecked: false,
				Authenticated: false
			},
			NodeTemplates: {},
			NodeTemplateList: [],
			TaskTypes: [],
			Operations: {},
			OperationList: [],
			Schedule: [],
			Manifests: [],
			PendingInputs: [],
			OperationLibrary: [],
			Beacons: [],
			WorkItems: [],
			BeaconCapabilities: {},
			AffinityBindings: [],
			ReachabilityMatrix: [],
			ReachabilityBeacons: [],
			ReachabilityHub: null,
			CurrentEditOperation: null,
			CurrentRoute: this._readHashRoute(),
			Flows: {},
			OperationDescriptionSegments: [{ Content: '' }],
			DebugMode: false
		};

		// Load task type definitions + auth-mode status BEFORE rendering
		// the layout.  The layout render triggers route resolution (via
		// PictRouter.resolve()), and we need AuthMode in AppData before
		// then so the gate logic + user-menu visibility paint correctly
		// on first render.  Both fetches are independent — fan them out
		// in parallel via a tiny join.
		let tmpSuper = super.onAfterInitializeAsync.bind(this);
		let tmpJoinPending = 2;
		let tmpJoinErr = null;
		let fJoin = (pErr) =>
		{
			if (pErr && !tmpJoinErr) { tmpJoinErr = pErr; }
			if (--tmpJoinPending > 0) { return; }
			if (tmpJoinErr)
			{
				this.pict.log.warn('Boot precondition failed; continuing with defaults: ' + tmpJoinErr.message);
			}
			this.pict.views['Ultravisor-Layout'].render();
			// If the auth-beacon says we need a real login, force-show
			// the Login view immediately.  pict-section-login's
			// CheckSessionOnLoad will then validate any stored cookie
			// and either bounce us to /Home (via _afterSessionChecked)
			// or keep us on /Login.
			if (this.pict.AppData.Ultravisor.Auth.Mode === 'authenticated')
			{
				this.navigateTo('/Login');
			}
			return tmpSuper(fCallback);
		};
		this._loadAuthStatus(fJoin.bind(this));
		this.loadTaskTypes(
			function (pError)
			{
				if (pError)
				{
					this.pict.log.warn('Failed to load task types during init; flow editor will have no cards.');
				}
				// Both legs of the parallel boot done?  fJoin() renders
				// the layout once both /status + /TaskTypes have come
				// back, so route resolution doesn't kick off until auth
				// state is in AppData.
				return fJoin.call(this, null);
			}.bind(this));
	}

	/**
	 * Fetch /status and stash auth-mode + user-management capability in
	 * AppData.  Used by the boot path to decide whether to send the
	 * user to /Login on first load.  Non-fatal: a /status failure leaves
	 * the AppData defaults (promiscuous, no user mgmt) which means the
	 * UI behaves like an offline lab rig rather than 401-ing the whole
	 * app.
	 */
	_loadAuthStatus(fCallback)
	{
		let tmpURL = `${this.pict.AppData.Ultravisor.APIBaseURL}/status`;
		fetch(tmpURL, { credentials: 'include' })
			.then((pResp) => pResp.ok ? pResp.json() : Promise.reject(new Error('HTTP ' + pResp.status)))
			.then((pBody) =>
			{
				this.pict.AppData.Ultravisor.ServerStatus = pBody || {};
				this.pict.AppData.Ultravisor.Auth.Mode =
					(pBody && pBody.AuthMode === 'authenticated') ? 'authenticated' : 'promiscuous';
				this.pict.AppData.Ultravisor.Auth.SupportsUserManagement =
					!!(pBody && pBody.SupportsUserManagement);
				fCallback(null);
			})
			.catch((pErr) => fCallback(pErr));
	}

	navigateTo(pRoute)
	{
		this.pict.AppData.Ultravisor.CurrentRoute = pRoute;
		this.pict.providers.PictRouter.navigate(pRoute);
		this.renderTopBar();
		this.renderSidebar();
	}

	/**
	 * Called when the URL hash changes (back/forward/manual edit). Keeps
	 * AppData.Ultravisor.CurrentRoute in sync and re-renders the topbar
	 * + sidebar so active-tab highlighting and sidebar context match.
	 */
	onRouteChanged()
	{
		this.pict.AppData.Ultravisor.CurrentRoute = this._readHashRoute();
		this.renderTopBar();
		this.renderSidebar();
	}

	_readHashRoute()
	{
		if (typeof window === 'undefined' || !window.location || !window.location.hash) { return '/Home'; }
		let tmpHash = window.location.hash;
		if (tmpHash.charAt(0) === '#') { tmpHash = tmpHash.slice(1); }
		if (!tmpHash || tmpHash === '/') { return '/Home'; }
		return tmpHash;
	}

	renderTopBar()
	{
		let tmpNav  = this.pict.views['Ultravisor-TopBar-Nav'];
		let tmpUser = this.pict.views['Ultravisor-TopBar-User'];
		if (tmpNav)  { tmpNav.render(); }
		if (tmpUser) { tmpUser.render(); }
	}

	renderSidebar()
	{
		let tmpSidebar = this.pict.views['Ultravisor-Sidebar'];
		if (tmpSidebar) { tmpSidebar.render(); }
	}

	/**
	 * Hook fired by pict-section-login after a successful sign-in.
	 * Re-render the topbar so the CurrentUser badge appears, then
	 * bounce to the dashboard.  We deliberately drop the pre-login
	 * route here — the user can re-navigate after seeing /Home, and
	 * remembering deep-links across a fresh authentication is a
	 * surprisingly tricky UX in the face of expired routes.
	 */
	_afterLogin(pSessionData)
	{
		this.pict.AppData.Ultravisor.Auth.Authenticated = true;
		this.pict.AppData.Ultravisor.Auth.SessionChecked = true;
		this.renderTopBar();
		this.navigateTo('/Home');
	}

	/**
	 * Hook fired by pict-section-login (logout button on its status
	 * card) and by pict-section-usermanagement's CurrentUser view.
	 * Drop back to /Login so it's obvious the session is gone.
	 */
	_afterLogout()
	{
		this.pict.AppData.Ultravisor.Auth.Authenticated = false;
		this.renderTopBar();
		this.navigateTo('/Login');
	}

	/**
	 * Hook fired by pict-section-login after its initial session check
	 * resolves.  Three cases:
	 *   - pSessionData.LoggedIn === true  → already authenticated; if
	 *     we landed on /Login as part of the boot gate, bounce to /Home
	 *   - pSessionData.LoggedIn === false → cookie invalid/expired; stay
	 *     on /Login so the user can sign in
	 *   - pSessionData === null           → server unreachable; the
	 *     session-check endpoint flaked.  Leave the user where they are;
	 *     gated routes will 401 on their own and the gate stays armed.
	 */
	_afterSessionChecked(pSessionData)
	{
		this.pict.AppData.Ultravisor.Auth.SessionChecked = true;
		let tmpLoggedIn = !!(pSessionData && pSessionData.LoggedIn);
		this.pict.AppData.Ultravisor.Auth.Authenticated = tmpLoggedIn;
		this.renderTopBar();
		// Only redirect away from /Login when we were force-bounced there
		// by the boot gate.  A user explicitly opening /Login while
		// already signed in is rare but valid — leave them alone.
		if (tmpLoggedIn
			&& this.pict.AppData.Ultravisor.Auth.Mode === 'authenticated'
			&& this._readHashRoute() === '/Login')
		{
			this.navigateTo('/Home');
		}
	}

	showView(pViewIdentifier)
	{
		if (pViewIdentifier in this.pict.views)
		{
			this.pict.views[pViewIdentifier].render();
		}
		else
		{
			this.pict.log.warn(`View [${pViewIdentifier}] not found; falling back to dashboard.`);
			this.pict.views['Ultravisor-Dashboard'].render();
		}
	}

	// --- API Helper ---
	apiCall(pMethod, pPath, pBody, fCallback)
	{
		let tmpURL = `${this.pict.AppData.Ultravisor.APIBaseURL}${pPath}`;
		let tmpOptions = { method: pMethod, headers: { 'Content-Type': 'application/json' } };

		if (pBody)
		{
			tmpOptions.body = JSON.stringify(pBody);
		}

		fetch(tmpURL, tmpOptions)
			.then(
				function (pResponse)
				{
					return pResponse.json();
				})
			.then(
				function (pData)
				{
					// Server responded — clear disconnected state if it was set
					if (this.pict.AppData.Ultravisor.ServerStatus.StatusClass === 'error')
					{
						this._setConnectionState(true);
					}

					if (typeof fCallback === 'function')
					{
						fCallback(null, pData);
					}
				}.bind(this))
			.catch(
				function (pError)
				{
					this.pict.log.error(`API call failed: ${pMethod} ${pPath}`, pError);

					// Network error — mark as disconnected
					this._setConnectionState(false);

					if (typeof fCallback === 'function')
					{
						fCallback(pError);
					}
				}.bind(this));
	}

	/**
	 * Update the connection state and show/hide the disconnected banner.
	 *
	 * @param {boolean} pConnected - true if the server is reachable
	 */
	_setConnectionState(pConnected)
	{
		let tmpStatus = this.pict.AppData.Ultravisor.ServerStatus;

		if (!pConnected)
		{
			if (tmpStatus.StatusClass !== 'error')
			{
				tmpStatus.StatusClass = 'error';
				tmpStatus.StatusText = 'Disconnected';

				// Update status indicator in the TopBar-User slot.
				let tmpContent = this.pict.parseTemplateByHash('Ultravisor-TopBar-Status-Template', {}, null, this.pict);
				this.pict.ContentAssignment.assignContent('#Ultravisor-TopBar-StatusArea', tmpContent);

				// Show a prominent banner in the content area.
				let tmpContentContainer = document.getElementById('Ultravisor-Content-Container');
				if (tmpContentContainer)
				{
					tmpContentContainer.innerHTML = '<div class="ultravisor-disconnected-banner">'
						+ '<div class="ultravisor-disconnected-banner-icon">&#x26A0;</div>'
						+ '<h2>Server Unreachable</h2>'
						+ '<p>The Ultravisor server is not responding. Make sure it is running and refresh the page.</p>'
						+ '</div>';
				}
			}
		}
		else
		{
			if (tmpStatus.StatusClass === 'error')
			{
				tmpStatus.StatusClass = 'connected';
				tmpStatus.StatusText = tmpStatus.Status || 'Connected';

				let tmpContent = this.pict.parseTemplateByHash('Ultravisor-TopBar-Status-Template', {}, null, this.pict);
				this.pict.ContentAssignment.assignContent('#Ultravisor-TopBar-StatusArea', tmpContent);

				let tmpBanner = document.querySelector('.ultravisor-disconnected-banner');
				if (tmpBanner)
				{
					tmpBanner.remove();
				}
			}
		}
	}

	// --- Status ---
	loadStatus(fCallback)
	{
		this.apiCall('GET', '/status', null,
			function (pError, pData)
			{
				if (!pError && pData)
				{
					this.pict.AppData.Ultravisor.ServerStatus = pData;
					// Mirror auth mode + user-mgmt capability into the
					// dedicated Auth state slot so polling refreshes
					// keep nav visibility in sync with the server (an
					// auth-beacon hot-attach/detach mid-session flips
					// SupportsUserManagement without a UI reload).
					this.pict.AppData.Ultravisor.Auth.Mode =
						(pData.AuthMode === 'authenticated') ? 'authenticated' : 'promiscuous';
					this.pict.AppData.Ultravisor.Auth.SupportsUserManagement =
						!!pData.SupportsUserManagement;
				}
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	// --- Node Templates ---
	loadNodeTemplates(fCallback)
	{
		this.apiCall('GET', '/NodeTemplate', null,
			function (pError, pData)
			{
				if (!pError && pData)
				{
					this.pict.AppData.Ultravisor.NodeTemplateList = Array.isArray(pData) ? pData : [];
					let tmpTemplates = {};
					for (let i = 0; i < this.pict.AppData.Ultravisor.NodeTemplateList.length; i++)
					{
						let tmpTemplate = this.pict.AppData.Ultravisor.NodeTemplateList[i];
						tmpTemplates[tmpTemplate.Hash] = tmpTemplate;
					}
					this.pict.AppData.Ultravisor.NodeTemplates = tmpTemplates;
				}
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	saveNodeTemplate(pTemplateData, fCallback)
	{
		this.apiCall('POST', '/NodeTemplate', pTemplateData,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	deleteNodeTemplate(pHash, fCallback)
	{
		this.apiCall('DELETE', `/NodeTemplate/${encodeURIComponent(pHash)}`, null,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	// --- Task Types ---
	loadTaskTypes(fCallback)
	{
		this.apiCall('GET', '/TaskType', null,
			function (pError, pData)
			{
				if (!pError && pData)
				{
					this.pict.AppData.Ultravisor.TaskTypes = Array.isArray(pData) ? pData : [];
				}
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	// --- Operations ---
	loadOperations(fCallback)
	{
		this.apiCall('GET', '/Operation', null,
			function (pError, pData)
			{
				if (!pError && pData)
				{
					this.pict.AppData.Ultravisor.OperationList = Array.isArray(pData) ? pData : [];
					let tmpOperations = {};
					for (let i = 0; i < this.pict.AppData.Ultravisor.OperationList.length; i++)
					{
						let tmpOp = this.pict.AppData.Ultravisor.OperationList[i];
						tmpOperations[tmpOp.Hash] = tmpOp;
					}
					this.pict.AppData.Ultravisor.Operations = tmpOperations;
				}
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	saveOperation(pOperationData, fCallback)
	{
		this.apiCall('POST', '/Operation', pOperationData,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	deleteOperation(pHash, fCallback)
	{
		this.apiCall('DELETE', `/Operation/${encodeURIComponent(pHash)}`, null,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	executeOperation(pHash, pRunMode, fCallback)
	{
		if (typeof pRunMode === 'function')
		{
			fCallback = pRunMode;
			pRunMode = null;
		}

		let tmpRunMode = pRunMode || (this.pict.AppData.Ultravisor.DebugMode ? 'debug' : 'standard');
		let tmpURL = `/Operation/${encodeURIComponent(pHash)}/Execute?RunMode=${encodeURIComponent(tmpRunMode)}`;

		this.apiCall('GET', tmpURL, null,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	executeOperationAsync(pHash, pRunMode, fCallback)
	{
		if (typeof pRunMode === 'function')
		{
			fCallback = pRunMode;
			pRunMode = null;
		}

		let tmpRunMode = pRunMode || (this.pict.AppData.Ultravisor.DebugMode ? 'debug' : 'standard');

		this.apiCall('POST',
			`/Operation/${encodeURIComponent(pHash)}/Execute/Async`,
			{ RunMode: tmpRunMode },
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	// --- Schedule ---
	loadSchedule(fCallback)
	{
		this.apiCall('GET', '/Schedule', null,
			function (pError, pData)
			{
				if (!pError && pData)
				{
					this.pict.AppData.Ultravisor.Schedule = Array.isArray(pData) ? pData : [];
				}
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	scheduleOperation(pHash, pScheduleType, pParameters, fCallback)
	{
		this.apiCall('POST', '/Schedule/Operation',
			{ Hash: pHash, ScheduleType: pScheduleType, Parameters: pParameters },
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	removeScheduleEntry(pGUID, fCallback)
	{
		this.apiCall('DELETE', `/Schedule/${encodeURIComponent(pGUID)}`, null,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	startSchedule(fCallback)
	{
		this.apiCall('GET', '/Schedule/Start', null,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	stopSchedule(fCallback)
	{
		this.apiCall('GET', '/Schedule/Stop', null,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	startScheduleEntry(pGUID, fCallback)
	{
		this.apiCall('GET', `/Schedule/Start/${encodeURIComponent(pGUID)}`, null,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	stopScheduleEntry(pGUID, fCallback)
	{
		this.apiCall('GET', `/Schedule/Stop/${encodeURIComponent(pGUID)}`, null,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	// --- Manifests ---
	loadManifests(fCallback)
	{
		this.apiCall('GET', '/Manifest', null,
			function (pError, pData)
			{
				if (!pError && pData)
				{
					this.pict.AppData.Ultravisor.Manifests = Array.isArray(pData) ? pData : [];
				}
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	loadManifest(pRunHash, fCallback)
	{
		this.apiCall('GET', `/Manifest/${encodeURIComponent(pRunHash)}`, null,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	// --- Pending Inputs ---
	loadPendingInputs(fCallback)
	{
		this.apiCall('GET', '/PendingInput', null,
			function (pError, pData)
			{
				if (!pError && pData)
				{
					this.pict.AppData.Ultravisor.PendingInputs = Array.isArray(pData) ? pData : [];
				}
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	submitPendingInput(pRunHash, pNodeHash, pValue, fCallback)
	{
		this.apiCall('POST', `/PendingInput/${encodeURIComponent(pRunHash)}`,
			{ NodeHash: pNodeHash, Value: pValue },
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	forceErrorPendingInput(pRunHash, pNodeHash, fCallback)
	{
		this.apiCall('POST', `/PendingInput/${encodeURIComponent(pRunHash)}/ForceError`,
			{ NodeHash: pNodeHash },
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	// --- Abandon ---
	abandonRun(pRunHash, fCallback)
	{
		this.apiCall('POST', `/Manifest/${encodeURIComponent(pRunHash)}/Abandon`, {},
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	abandonStaleRuns(fCallback)
	{
		this.apiCall('POST', '/Manifest/AbandonStale', {},
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	// --- Retry ---
	// Retries a Stalled or Failed run from its last failed/stalled node.
	// All upstream node outputs are preserved; only the failed node and
	// its downstream branch re-run.
	retryRun(pRunHash, fCallback)
	{
		this.apiCall('POST', `/Operation/${encodeURIComponent(pRunHash)}/Retry`, {},
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	// --- Beacons ---
	loadBeacons(fCallback)
	{
		this.apiCall('GET', '/Beacon', null,
			function (pError, pData)
			{
				if (!pError && pData)
				{
					this.pict.AppData.Ultravisor.Beacons = Array.isArray(pData) ? pData : [];
				}
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	loadBeacon(pBeaconID, fCallback)
	{
		this.apiCall('GET', `/Beacon/${encodeURIComponent(pBeaconID)}`, null,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	deregisterBeacon(pBeaconID, fCallback)
	{
		this.apiCall('DELETE', `/Beacon/${encodeURIComponent(pBeaconID)}`, null,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	loadWorkItems(fCallback)
	{
		this.apiCall('GET', '/Beacon/Work', null,
			function (pError, pData)
			{
				if (!pError && pData)
				{
					this.pict.AppData.Ultravisor.WorkItems = Array.isArray(pData) ? pData : [];
				}
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	loadBeaconCapabilities(fCallback)
	{
		this.apiCall('GET', '/Beacon/Capabilities', null,
			function (pError, pData)
			{
				if (!pError && pData)
				{
					this.pict.AppData.Ultravisor.BeaconCapabilities = pData || {};
				}
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	loadAffinityBindings(fCallback)
	{
		this.apiCall('GET', '/Beacon/Affinity', null,
			function (pError, pData)
			{
				if (!pError && pData)
				{
					this.pict.AppData.Ultravisor.AffinityBindings = Array.isArray(pData) ? pData : [];
				}
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	// Accepts both shapes: legacy bare-array (Matrix only) and the
	// envelope { Matrix, Beacons, Hub } added in UV 1.0.34.
	_storeReachabilityResponse(pData)
	{
		if (Array.isArray(pData))
		{
			this.pict.AppData.Ultravisor.ReachabilityMatrix = pData;
			this.pict.AppData.Ultravisor.ReachabilityBeacons = [];
			this.pict.AppData.Ultravisor.ReachabilityHub = null;
			return;
		}
		if (pData && typeof pData === 'object')
		{
			this.pict.AppData.Ultravisor.ReachabilityMatrix = Array.isArray(pData.Matrix) ? pData.Matrix : [];
			this.pict.AppData.Ultravisor.ReachabilityBeacons = Array.isArray(pData.Beacons) ? pData.Beacons : [];
			this.pict.AppData.Ultravisor.ReachabilityHub = pData.Hub || null;
			return;
		}
		this.pict.AppData.Ultravisor.ReachabilityMatrix = [];
		this.pict.AppData.Ultravisor.ReachabilityBeacons = [];
		this.pict.AppData.Ultravisor.ReachabilityHub = null;
	}

	loadReachabilityMatrix(fCallback)
	{
		this.apiCall('GET', '/Beacon/Reachability', null,
			function (pError, pData)
			{
				if (!pError) { this._storeReachabilityResponse(pData); }
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	probeReachability(fCallback)
	{
		this.apiCall('POST', '/Beacon/Reachability/Probe', null,
			function (pError, pData)
			{
				if (!pError) { this._storeReachabilityResponse(pData); }
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	// --- Operation Library ---
	loadOperationLibrary(fCallback)
	{
		this.apiCall('GET', '/OperationLibrary', null,
			function (pError, pData)
			{
				if (!pError && pData)
				{
					this.pict.AppData.Ultravisor.OperationLibrary = Array.isArray(pData) ? pData : [];
				}
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	importLibraryOperation(pFileName, fCallback)
	{
		this.apiCall('GET', `/OperationLibrary/${encodeURIComponent(pFileName)}`, null,
			function (pError, pData)
			{
				if (pError)
				{
					if (typeof fCallback === 'function')
					{
						fCallback(pError);
					}
					return;
				}

				// Strip library metadata, keep operation-relevant fields
				let tmpOperationData =
				{
					Name: pData.Name || '',
					Description: pData.Description || '',
					Graph: pData.Graph || { Nodes: [], Connections: [], ViewState: {} }
				};

				if (pData.SavedLayouts)
				{
					tmpOperationData.SavedLayouts = pData.SavedLayouts;
				}
				if (pData.InitialGlobalState)
				{
					tmpOperationData.InitialGlobalState = pData.InitialGlobalState;
				}
				if (pData.InitialOperationState)
				{
					tmpOperationData.InitialOperationState = pData.InitialOperationState;
				}

				// Save as a new operation (no Hash => auto-generated)
				this.saveOperation(tmpOperationData, fCallback);
			}.bind(this));
	}

	importOperationFromJSON(pOperationJSON, fCallback)
	{
		if (typeof (pOperationJSON) !== 'object' || pOperationJSON === null)
		{
			if (typeof fCallback === 'function')
			{
				fCallback(new Error('Invalid operation JSON.'));
			}
			return;
		}

		// Strip identifiers so a fresh hash is auto-generated on import
		let tmpOperationData =
		{
			Name: pOperationJSON.Name || 'Imported Operation',
			Description: pOperationJSON.Description || '',
			Graph: pOperationJSON.Graph || { Nodes: [], Connections: [], ViewState: {} }
		};

		if (pOperationJSON.SavedLayouts)
		{
			tmpOperationData.SavedLayouts = pOperationJSON.SavedLayouts;
		}
		if (pOperationJSON.InitialGlobalState)
		{
			tmpOperationData.InitialGlobalState = pOperationJSON.InitialGlobalState;
		}
		if (pOperationJSON.InitialOperationState)
		{
			tmpOperationData.InitialOperationState = pOperationJSON.InitialOperationState;
		}

		// Save as a new operation (no Hash => auto-generated)
		this.saveOperation(tmpOperationData, fCallback);
	}

	exportOperation(pHash, fCallback)
	{
		this.apiCall('GET', `/Operation/${encodeURIComponent(pHash)}/Export`, null,
			function (pError, pData)
			{
				if (pError)
				{
					if (typeof fCallback === 'function')
					{
						fCallback(pError);
					}
					return;
				}

				// Trigger a browser download of the JSON
				let tmpFileName = (pData.Name || pData.Hash || 'operation').replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
				let tmpBlob = new Blob([JSON.stringify(pData, null, '\t')], { type: 'application/json' });
				let tmpLink = document.createElement('a');
				tmpLink.href = URL.createObjectURL(tmpBlob);
				tmpLink.download = tmpFileName;
				tmpLink.click();
				URL.revokeObjectURL(tmpLink.href);

				if (typeof fCallback === 'function')
				{
					fCallback(null, pData);
				}
			}.bind(this));
	}

	// --- Edit helpers ---

	/**
	 * Populate CurrentEditOperation and Flows.Current from a loaded operation.
	 * Does not navigate — caller decides whether to navigate or render directly.
	 */
	_setCurrentEditOperation(pHash)
	{
		if (pHash && this.pict.AppData.Ultravisor.Operations[pHash])
		{
			let tmpOp = JSON.parse(JSON.stringify(this.pict.AppData.Ultravisor.Operations[pHash]));
			this.pict.AppData.Ultravisor.CurrentEditOperation = tmpOp;

			// Load the operation's graph into the FlowEditor data
			if (tmpOp.Graph)
			{
				this.pict.AppData.Ultravisor.Flows.Current = JSON.parse(JSON.stringify(tmpOp.Graph));
			}
		}
		else
		{
			this.pict.AppData.Ultravisor.CurrentEditOperation =
			{
				Hash: '',
				Name: '',
				Description: '',
				Graph: { Nodes: [], Connections: [], ViewState: {} }
			};
			this.pict.AppData.Ultravisor.Flows.Current =
			{
				Nodes: [],
				Connections: [],
				ViewState: { PanX: 0, PanY: 0, Zoom: 1, SelectedNodeHash: null, SelectedConnectionHash: null }
			};
		}
	}

	/**
	 * Show the Manifest Detail view for a specific run hash.
	 * Called from the /Manifests/detail/:runHash route.
	 */
	showManifestDetail(pRunHash)
	{
		if (this.pict.views['Ultravisor-ManifestDetail'])
		{
			this.pict.views['Ultravisor-ManifestDetail'].setRunHash(decodeURIComponent(pRunHash));
			this.pict.views['Ultravisor-ManifestDetail'].render();
		}
	}

	/**
	 * Show the Manifest List with a pre-set status filter.
	 * Called from the /Manifests/:filter and /PendingInput routes.
	 */
	showManifestsFiltered(pFilter)
	{
		if (this.pict.views['Ultravisor-ManifestList'])
		{
			this.pict.views['Ultravisor-ManifestList'].setFilterFromRoute(pFilter || 'all');
			this.pict.views['Ultravisor-ManifestList'].render();
		}
	}

	/**
	 * Watch a running execution in the flow editor.
	 * Loads the operation, navigates to the FlowEditor, and starts
	 * monitoring the given RunHash without starting a new execution.
	 */
	watchExecution(pRunHash, pOperationHash)
	{
		if (!pRunHash || !pOperationHash)
		{
			return;
		}

		let tmpSelf = this;

		// Ensure operations and task types are loaded
		let tmpNeedOperations = (this.pict.AppData.Ultravisor.OperationList.length < 1);
		let tmpNeedTaskTypes = (this.pict.AppData.Ultravisor.TaskTypes.length < 1);

		let tmpPending = 0;

		function onReady()
		{
			tmpPending--;
			if (tmpPending > 0) return;

			tmpSelf._setCurrentEditOperation(pOperationHash);
			tmpSelf.pict.views['Ultravisor-FlowEditor'].render();

			// After render, attach to the running execution
			setTimeout(function ()
			{
				tmpSelf.pict.views['Ultravisor-FlowEditor'].watchExecution(pRunHash);
			}, 100);
		}

		if (tmpNeedOperations)
		{
			tmpPending++;
			this.loadOperations(function () { onReady(); });
		}
		if (tmpNeedTaskTypes)
		{
			tmpPending++;
			this.loadTaskTypes(function () { onReady(); });
		}

		if (!tmpNeedOperations && !tmpNeedTaskTypes)
		{
			tmpPending = 1;
			onReady();
		}
	}

	/**
	 * Called from the Operations list UI to edit an operation.  Navigates to the
	 * parameterized FlowEditor route so the URL reflects the operation hash.
	 */
	editOperation(pHash)
	{
		this._setCurrentEditOperation(pHash);

		if (pHash)
		{
			this.navigateTo(`/FlowEditor/${encodeURIComponent(pHash)}`);
		}
		else
		{
			this.navigateTo('/FlowEditor');
		}
	}

	/**
	 * Route handler for `/FlowEditor/:hash`.  On a cold page load both the
	 * Operations map and TaskTypes may be empty, so we load them first.
	 * TaskTypes must be available before the FlowEditor renders so that
	 * _buildFlowCardNodeTypes() can generate card configs with all ports.
	 */
	editOperationFromRoute(pHash)
	{
		let tmpHash = decodeURIComponent(pHash);

		let tmpNeedOperations = (this.pict.AppData.Ultravisor.OperationList.length < 1);
		let tmpNeedTaskTypes = (this.pict.AppData.Ultravisor.TaskTypes.length < 1);

		// Hot navigation — everything already loaded
		if (!tmpNeedOperations && !tmpNeedTaskTypes)
		{
			this._setCurrentEditOperation(tmpHash);
			this.pict.views['Ultravisor-FlowEditor'].render();
			return;
		}

		// Cold reload — load whatever is missing, then render
		let tmpPending = 0;
		let tmpSelf = this;

		function onLoaded()
		{
			tmpPending--;
			if (tmpPending > 0)
			{
				return;
			}
			tmpSelf._setCurrentEditOperation(tmpHash);
			tmpSelf.pict.views['Ultravisor-FlowEditor'].render();
		}

		if (tmpNeedOperations)
		{
			tmpPending++;
			this.loadOperations(
				function (pError)
				{
					if (pError)
					{
						this.pict.log.warn(`Failed to load operations for route /FlowEditor/${tmpHash}`);
					}
					onLoaded();
				}.bind(this));
		}

		if (tmpNeedTaskTypes)
		{
			tmpPending++;
			this.loadTaskTypes(
				function (pError)
				{
					if (pError)
					{
						this.pict.log.warn('Failed to load task types for FlowEditor route.');
					}
					onLoaded();
				}.bind(this));
		}
	}
}

module.exports = UltravisorApplication;

module.exports.default_configuration = require('./Pict-Application-Ultravisor-Configuration.json');
