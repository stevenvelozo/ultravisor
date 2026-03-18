const libPictApplication = require('pict-application');
const libPictRouter = require('pict-router');
const libPictSectionForm = require('pict-section-form');
const libPictSectionContent = require('pict-section-content');

const THEME_LIST =
[
	{ Key: 'desert-dusk', Label: 'Desert Dusk', Colors: ['#252018', '#c4956a', '#4a9090', '#6a3040', '#8a9a5a'] },
	{ Key: 'desert-day', Label: 'Desert Day', Colors: ['#faf6f0', '#5c3d2e', '#3a8a8c', '#7a2e3a', '#6b8f4a'] },
	{ Key: 'desert-sunset', Label: 'Desert Sunset', Colors: ['#1e1610', '#e8943a', '#2a8a8a', '#8b2442', '#d4a46a'] },
	{ Key: 'professional-light', Label: 'Professional Light', Colors: ['#f5f6f8', '#3b82f6', '#10b981', '#ef4444', '#6366f1'] },
	{ Key: 'professional-dark', Label: 'Professional Dark', Colors: ['#111318', '#60a5fa', '#34d399', '#f87171', '#a78bfa'] },
	{ Key: 'desert-canyon', Label: 'Desert Canyon', Colors: ['#18120e', '#e8943a', '#18a0a0', '#e05830', '#e0c870'] }
];

// Views
const libViewLayout = require('./views/PictView-Ultravisor-Layout.js');
const libViewTopBar = require('./views/PictView-Ultravisor-TopBar.js');
const libViewBottomBar = require('./views/PictView-Ultravisor-BottomBar.js');
const libViewDashboard = require('./views/PictView-Ultravisor-Dashboard.js');
const libViewOperationList = require('./views/PictView-Ultravisor-OperationList.js');
const libViewOperationEdit = require('./views/PictView-Ultravisor-OperationEdit.js');
const libViewSchedule = require('./views/PictView-Ultravisor-Schedule.js');
const libViewManifestList = require('./views/PictView-Ultravisor-ManifestList.js');
const libViewTimingView = require('./views/PictView-Ultravisor-TimingView.js');
const libViewFlowEditor = require('./views/PictView-Ultravisor-FlowEditor.js');
const libViewPendingInput = require('./views/PictView-Ultravisor-PendingInput.js');
const libViewDocumentation = require('./views/PictView-Ultravisor-Documentation.js');
const libViewBeaconList = require('./views/PictView-Ultravisor-BeaconList.js');

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

		// Add the layout view (the shell that contains top bar, workspace, bottom bar)
		this.pict.addView('Ultravisor-Layout', libViewLayout.default_configuration, libViewLayout);

		// Add the top bar and bottom bar views
		this.pict.addView('Ultravisor-TopBar', libViewTopBar.default_configuration, libViewTopBar);
		this.pict.addView('Ultravisor-BottomBar', libViewBottomBar.default_configuration, libViewBottomBar);

		// Add content views
		this.pict.addView('Ultravisor-Dashboard', libViewDashboard.default_configuration, libViewDashboard);
		this.pict.addView('Ultravisor-OperationList', libViewOperationList.default_configuration, libViewOperationList);
		this.pict.addView('Ultravisor-OperationEdit', libViewOperationEdit.default_configuration, libViewOperationEdit);
		this.pict.addView('Ultravisor-Schedule', libViewSchedule.default_configuration, libViewSchedule);
		this.pict.addView('Ultravisor-ManifestList', libViewManifestList.default_configuration, libViewManifestList);
		this.pict.addView('Ultravisor-TimingView', libViewTimingView.default_configuration, libViewTimingView);
		this.pict.addView('Ultravisor-FlowEditor', libViewFlowEditor.default_configuration, libViewFlowEditor);
		this.pict.addView('Ultravisor-PendingInput', libViewPendingInput.default_configuration, libViewPendingInput);
		this.pict.addView('Ultravisor-Documentation', libViewDocumentation.default_configuration, libViewDocumentation);
		this.pict.addView('Ultravisor-BeaconList', libViewBeaconList.default_configuration, libViewBeaconList);

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
		// Apply saved theme before first render
		this.loadSavedTheme();

		// Initialize application state
		this.pict.AppData.Ultravisor =
		{
			APIBaseURL: '',
			ServerStatus: { Status: 'Unknown', ScheduleEntries: 0, ScheduleRunning: false },
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
			CurrentEditOperation: null,
			Flows: {},
			DebugMode: false
		};

		// Load task type definitions from the server BEFORE rendering the layout.
		// The layout render triggers route resolution (via PictRouter.resolve()),
		// and route handlers like editOperationFromRoute need TaskTypes to be
		// populated so the FlowEditor can generate card configs with all ports.
		let tmpSuper = super.onAfterInitializeAsync.bind(this);
		this.loadTaskTypes(
			function (pError)
			{
				if (pError)
				{
					this.pict.log.warn('Failed to load task types during init; flow editor will have no cards.');
				}

				// Now render the layout shell — this resolves the current route,
				// which may immediately render the FlowEditor if the URL matches.
				this.pict.views['Ultravisor-Layout'].render();

				return tmpSuper(fCallback);
			}.bind(this));
	}

	navigateTo(pRoute)
	{
		this.pict.providers.PictRouter.navigate(pRoute);
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

				// Update status indicator
				let tmpContent = this.pict.parseTemplateByHash('Ultravisor-TopBar-Status-Template', {}, null, this.pict);
				this.pict.ContentAssignment.assignContent('#Ultravisor-TopBar-StatusArea', tmpContent);

				// Show a prominent banner in the content area
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

				// Update status indicator
				let tmpContent = this.pict.parseTemplateByHash('Ultravisor-TopBar-Status-Template', {}, null, this.pict);
				this.pict.ContentAssignment.assignContent('#Ultravisor-TopBar-StatusArea', tmpContent);

				// Remove the disconnected banner if present
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

	// --- Theme ---
	applyTheme(pThemeKey)
	{
		let tmpThemeKey = pThemeKey || 'desert-dusk';

		if (tmpThemeKey === 'desert-dusk')
		{
			delete document.body.dataset.theme;
		}
		else
		{
			document.body.dataset.theme = tmpThemeKey;
		}

		localStorage.setItem('ultravisor-theme', tmpThemeKey);

		if (this.pict.AppData.Ultravisor)
		{
			this.pict.AppData.Ultravisor.CurrentTheme = tmpThemeKey;
		}
	}

	loadSavedTheme()
	{
		let tmpSavedTheme = localStorage.getItem('ultravisor-theme') || 'desert-dusk';
		this.applyTheme(tmpSavedTheme);
	}

	getThemeList()
	{
		return THEME_LIST;
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
