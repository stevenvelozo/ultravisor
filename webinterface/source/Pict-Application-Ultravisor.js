const libPictApplication = require('pict-application');
const libPictRouter = require('pict-router');
const libPictSectionForm = require('pict-section-form');
const libPictSectionContent = require('pict-section-content');

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

class UltravisorApplication extends libPictApplication
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

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

		// Register pict-section-form service types so Form panels can use them
		this.pict.addServiceType('PictFormMetacontroller', libPictSectionForm.PictFormMetacontroller);

		// Register pict-section-content service types so Markdown panels can render content
		this.pict.addServiceType('PictContentProvider', libPictSectionContent.PictContentProvider);
	}

	onAfterInitializeAsync(fCallback)
	{
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
			CurrentEditOperation: null,
			Flows: {}
		};

		// Render the layout shell first, then the initial content
		this.pict.views['Ultravisor-Layout'].render();

		return super.onAfterInitializeAsync(fCallback);
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
					if (typeof fCallback === 'function')
					{
						fCallback(null, pData);
					}
				})
			.catch(
				function (pError)
				{
					this.pict.log.error(`API call failed: ${pMethod} ${pPath}`, pError);
					if (typeof fCallback === 'function')
					{
						fCallback(pError);
					}
				}.bind(this));
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

	executeOperation(pHash, fCallback)
	{
		this.apiCall('GET', `/Operation/${encodeURIComponent(pHash)}/Execute`, null,
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

	// --- Edit helpers ---
	editOperation(pHash)
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
		this.navigateTo('/FlowEditor');
	}
}

module.exports = UltravisorApplication;

module.exports.default_configuration = require('./Pict-Application-Ultravisor-Configuration.json');
