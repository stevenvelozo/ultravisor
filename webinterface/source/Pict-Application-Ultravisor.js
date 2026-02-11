const libPictApplication = require('pict-application');
const libPictRouter = require('pict-router');

// Views
const libViewLayout = require('./views/PictView-Ultravisor-Layout.js');
const libViewTopBar = require('./views/PictView-Ultravisor-TopBar.js');
const libViewBottomBar = require('./views/PictView-Ultravisor-BottomBar.js');
const libViewDashboard = require('./views/PictView-Ultravisor-Dashboard.js');
const libViewTaskList = require('./views/PictView-Ultravisor-TaskList.js');
const libViewTaskEdit = require('./views/PictView-Ultravisor-TaskEdit.js');
const libViewOperationList = require('./views/PictView-Ultravisor-OperationList.js');
const libViewOperationEdit = require('./views/PictView-Ultravisor-OperationEdit.js');
const libViewSchedule = require('./views/PictView-Ultravisor-Schedule.js');
const libViewManifestList = require('./views/PictView-Ultravisor-ManifestList.js');

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
		this.pict.addView('Ultravisor-TaskList', libViewTaskList.default_configuration, libViewTaskList);
		this.pict.addView('Ultravisor-TaskEdit', libViewTaskEdit.default_configuration, libViewTaskEdit);
		this.pict.addView('Ultravisor-OperationList', libViewOperationList.default_configuration, libViewOperationList);
		this.pict.addView('Ultravisor-OperationEdit', libViewOperationEdit.default_configuration, libViewOperationEdit);
		this.pict.addView('Ultravisor-Schedule', libViewSchedule.default_configuration, libViewSchedule);
		this.pict.addView('Ultravisor-ManifestList', libViewManifestList.default_configuration, libViewManifestList);
	}

	onAfterInitializeAsync(fCallback)
	{
		// Initialize application state
		this.pict.AppData.Ultravisor =
		{
			APIBaseURL: '',
			ServerStatus: { Status: 'Unknown', ScheduleEntries: 0, ScheduleRunning: false },
			Tasks: {},
			TaskList: [],
			Operations: {},
			OperationList: [],
			Schedule: [],
			Manifests: [],
			CurrentEditTask: null,
			CurrentEditOperation: null
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

	// --- Tasks ---
	loadTasks(fCallback)
	{
		this.apiCall('GET', '/Task', null,
			function (pError, pData)
			{
				if (!pError && pData)
				{
					this.pict.AppData.Ultravisor.TaskList = Array.isArray(pData) ? pData : [];
					// Also index by GUIDTask
					let tmpTasks = {};
					for (let i = 0; i < this.pict.AppData.Ultravisor.TaskList.length; i++)
					{
						let tmpTask = this.pict.AppData.Ultravisor.TaskList[i];
						tmpTasks[tmpTask.GUIDTask] = tmpTask;
					}
					this.pict.AppData.Ultravisor.Tasks = tmpTasks;
				}
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	saveTask(pTaskData, fCallback)
	{
		this.apiCall('POST', '/Task', pTaskData,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	deleteTask(pGUIDTask, fCallback)
	{
		this.apiCall('DELETE', `/Task/${encodeURIComponent(pGUIDTask)}`, null,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	executeTask(pGUIDTask, fCallback)
	{
		this.apiCall('GET', `/Task/${encodeURIComponent(pGUIDTask)}/Execute`, null,
			function (pError, pData)
			{
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
						tmpOperations[tmpOp.GUIDOperation] = tmpOp;
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

	deleteOperation(pGUIDOperation, fCallback)
	{
		this.apiCall('DELETE', `/Operation/${encodeURIComponent(pGUIDOperation)}`, null,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	executeOperation(pGUIDOperation, fCallback)
	{
		this.apiCall('GET', `/Operation/${encodeURIComponent(pGUIDOperation)}/Execute`, null,
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

	scheduleTask(pGUIDTask, pScheduleType, pParameters, fCallback)
	{
		this.apiCall('POST', '/Schedule/Task',
			{ GUIDTask: pGUIDTask, ScheduleType: pScheduleType, Parameters: pParameters },
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	scheduleOperation(pGUIDOperation, pScheduleType, pParameters, fCallback)
	{
		this.apiCall('POST', '/Schedule/Operation',
			{ GUIDOperation: pGUIDOperation, ScheduleType: pScheduleType, Parameters: pParameters },
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

	loadManifest(pGUIDRun, fCallback)
	{
		this.apiCall('GET', `/Manifest/${encodeURIComponent(pGUIDRun)}`, null,
			function (pError, pData)
			{
				if (typeof fCallback === 'function')
				{
					fCallback(pError, pData);
				}
			}.bind(this));
	}

	// --- Edit helpers ---
	editTask(pGUIDTask)
	{
		if (pGUIDTask && this.pict.AppData.Ultravisor.Tasks[pGUIDTask])
		{
			this.pict.AppData.Ultravisor.CurrentEditTask = JSON.parse(JSON.stringify(this.pict.AppData.Ultravisor.Tasks[pGUIDTask]));
		}
		else
		{
			this.pict.AppData.Ultravisor.CurrentEditTask =
			{
				GUIDTask: '',
				Code: '',
				Name: '',
				Type: 'Command',
				Command: '',
				URL: '',
				Method: 'GET',
				Parameters: '',
				Description: ''
			};
		}
		this.navigateTo('/TaskEdit');
	}

	editOperation(pGUIDOperation)
	{
		if (pGUIDOperation && this.pict.AppData.Ultravisor.Operations[pGUIDOperation])
		{
			this.pict.AppData.Ultravisor.CurrentEditOperation = JSON.parse(JSON.stringify(this.pict.AppData.Ultravisor.Operations[pGUIDOperation]));
		}
		else
		{
			this.pict.AppData.Ultravisor.CurrentEditOperation =
			{
				GUIDOperation: '',
				Name: '',
				Description: '',
				Tasks: []
			};
		}
		this.navigateTo('/OperationEdit');
	}
}

module.exports = UltravisorApplication;

module.exports.default_configuration = require('./Pict-Application-Ultravisor-Configuration.json');
