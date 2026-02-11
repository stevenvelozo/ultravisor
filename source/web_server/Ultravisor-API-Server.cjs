const libPictService = require(`pict-serviceproviderbase`);

const libPath = require('path');
const libOrator = require('orator');
const libOratorServiceServerRestify = require(`orator-serviceserver-restify`);

class UltravisorAPIServer extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		// Add Restify as the default service server type
		this.fable.addServiceTypeIfNotExists('OratorServiceServer', libOratorServiceServerRestify);
		this._OratorServer = this.fable.instantiateServiceProvider('OratorServiceServer', {});

		// Add Orator as a service
		this.fable.addServiceTypeIfNotExists('Orator', libOrator);
	}

	wireEndpoints(fCallback)
	{
		if (!this._Orator)
		{
			return fCallback(new Error(`Ultravisor API Server: Cannot wire endpoints; Orator service is not initialized.`));
		}

		// --- Package / Status ---
		this._OratorServer.get
			(
				'/package',
				function (pRequest, pResponse, fNext)
				{
					pResponse.send(this.pict.settings.Package);
					return fNext();
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/status',
				function (pRequest, pResponse, fNext)
				{
					let tmpHypervisor = this.fable['Ultravisor-Hypervisor'];
					pResponse.send({
						Status: 'Running',
						ScheduleEntries: tmpHypervisor.getSchedule().length,
						ScheduleRunning: tmpHypervisor._Running
					});
					return fNext();
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/stop',
				function (pRequest, pResponse, fNext)
				{
					this.log.info(`Ultravisor API Server: Received stop request via API; stopping server.`);
					let tmpHypervisor = this.fable['Ultravisor-Hypervisor'];
					tmpHypervisor.stopSchedule();
					pResponse.send({ "Status": "STOPPING" });
					pResponse.end();
					return this._Orator.stopService(fNext);
				}.bind(this)
			);

		// --- Task CRUD ---
		this._OratorServer.get
			(
				'/Task',
				function (pRequest, pResponse, fNext)
				{
					this.fable['Ultravisor-Hypervisor-State'].getTaskList({},
						function (pError, pTasks)
						{
							if (pError)
							{
								pResponse.send(500, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pTasks);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/Task/:GUIDTask',
				function (pRequest, pResponse, fNext)
				{
					this.fable['Ultravisor-Hypervisor-State'].getTask(pRequest.params.GUIDTask,
						function (pError, pTask)
						{
							if (pError)
							{
								pResponse.send(404, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pTask);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.post
			(
				'/Task',
				function (pRequest, pResponse, fNext)
				{
					this.fable['Ultravisor-Hypervisor-State'].updateTask(pRequest.body,
						function (pError, pTask)
						{
							if (pError)
							{
								pResponse.send(400, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pTask);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.put
			(
				'/Task/:GUIDTask',
				function (pRequest, pResponse, fNext)
				{
					let tmpTaskData = pRequest.body || {};
					tmpTaskData.GUIDTask = pRequest.params.GUIDTask;
					this.fable['Ultravisor-Hypervisor-State'].updateTask(tmpTaskData,
						function (pError, pTask)
						{
							if (pError)
							{
								pResponse.send(400, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pTask);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.del
			(
				'/Task/:GUIDTask',
				function (pRequest, pResponse, fNext)
				{
					let tmpState = this.fable['Ultravisor-Hypervisor-State'];
					if (tmpState._Tasks.hasOwnProperty(pRequest.params.GUIDTask))
					{
						delete tmpState._Tasks[pRequest.params.GUIDTask];
						tmpState.persistState();
						pResponse.send({ Status: 'Deleted', GUIDTask: pRequest.params.GUIDTask });
					}
					else
					{
						pResponse.send(404, { Error: `Task ${pRequest.params.GUIDTask} not found.` });
					}
					return fNext();
				}.bind(this)
			);

		// --- Operation CRUD ---
		this._OratorServer.get
			(
				'/Operation',
				function (pRequest, pResponse, fNext)
				{
					this.fable['Ultravisor-Hypervisor-State'].getOperationList({},
						function (pError, pOperations)
						{
							if (pError)
							{
								pResponse.send(500, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pOperations);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/Operation/:GUIDOperation',
				function (pRequest, pResponse, fNext)
				{
					this.fable['Ultravisor-Hypervisor-State'].getOperation(pRequest.params.GUIDOperation,
						function (pError, pOperation)
						{
							if (pError)
							{
								pResponse.send(404, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pOperation);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.post
			(
				'/Operation',
				function (pRequest, pResponse, fNext)
				{
					this.fable['Ultravisor-Hypervisor-State'].updateOperation(pRequest.body,
						function (pError, pOperation)
						{
							if (pError)
							{
								pResponse.send(400, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pOperation);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.put
			(
				'/Operation/:GUIDOperation',
				function (pRequest, pResponse, fNext)
				{
					let tmpOperationData = pRequest.body || {};
					tmpOperationData.GUIDOperation = pRequest.params.GUIDOperation;
					this.fable['Ultravisor-Hypervisor-State'].updateOperation(tmpOperationData,
						function (pError, pOperation)
						{
							if (pError)
							{
								pResponse.send(400, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pOperation);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.del
			(
				'/Operation/:GUIDOperation',
				function (pRequest, pResponse, fNext)
				{
					let tmpState = this.fable['Ultravisor-Hypervisor-State'];
					if (tmpState._Operations.hasOwnProperty(pRequest.params.GUIDOperation))
					{
						delete tmpState._Operations[pRequest.params.GUIDOperation];
						tmpState.persistState();
						pResponse.send({ Status: 'Deleted', GUIDOperation: pRequest.params.GUIDOperation });
					}
					else
					{
						pResponse.send(404, { Error: `Operation ${pRequest.params.GUIDOperation} not found.` });
					}
					return fNext();
				}.bind(this)
			);

		// --- Task Execution ---
		this._OratorServer.get
			(
				'/Task/:GUIDTask/Execute',
				function (pRequest, pResponse, fNext)
				{
					let tmpState = this.fable['Ultravisor-Hypervisor-State'];
					let tmpTaskService = this.fable['Ultravisor-Task'];

					tmpState.getTask(pRequest.params.GUIDTask,
						function (pError, pTask)
						{
							if (pError)
							{
								pResponse.send(404, { Error: pError.message });
								return fNext();
							}
							tmpTaskService.executeTask(pTask, {},
								function (pExecError, pManifestEntry)
								{
									if (pExecError)
									{
										pResponse.send(500, { Error: pExecError.message });
										return fNext();
									}
									// Store the task result as a manifest so it appears in /Manifest
									let tmpManifestService = this.fable['Ultravisor-Operation-Manifest'];
									tmpManifestService.createTaskManifest(pManifestEntry);
									pResponse.send(pManifestEntry);
									return fNext();
								}.bind(this));
						}.bind(this));
				}.bind(this)
			);

		// --- Operation Execution ---
		this._OratorServer.get
			(
				'/Operation/:GUIDOperation/Execute',
				function (pRequest, pResponse, fNext)
				{
					let tmpState = this.fable['Ultravisor-Hypervisor-State'];
					let tmpOperationService = this.fable['Ultravisor-Operation'];

					tmpState.getOperation(pRequest.params.GUIDOperation,
						function (pError, pOperation)
						{
							if (pError)
							{
								pResponse.send(404, { Error: pError.message });
								return fNext();
							}
							tmpOperationService.executeOperation(pOperation,
								function (pExecError, pManifest)
								{
									if (pExecError)
									{
										pResponse.send(500, { Error: pExecError.message });
										return fNext();
									}
									pResponse.send(pManifest);
									return fNext();
								});
						});
				}.bind(this)
			);

		// --- Schedule ---
		this._OratorServer.get
			(
				'/Schedule',
				function (pRequest, pResponse, fNext)
				{
					pResponse.send(this.fable['Ultravisor-Hypervisor'].getSchedule());
					return fNext();
				}.bind(this)
			);

		this._OratorServer.post
			(
				'/Schedule/Task',
				function (pRequest, pResponse, fNext)
				{
					let tmpBody = pRequest.body || {};
					let tmpHypervisor = this.fable['Ultravisor-Hypervisor'];

					tmpHypervisor.scheduleTask(tmpBody.GUIDTask, tmpBody.ScheduleType, tmpBody.Parameters,
						function (pError, pEntry)
						{
							if (pError)
							{
								pResponse.send(400, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pEntry);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.post
			(
				'/Schedule/Operation',
				function (pRequest, pResponse, fNext)
				{
					let tmpBody = pRequest.body || {};
					let tmpHypervisor = this.fable['Ultravisor-Hypervisor'];

					tmpHypervisor.scheduleOperation(tmpBody.GUIDOperation, tmpBody.ScheduleType, tmpBody.Parameters,
						function (pError, pEntry)
						{
							if (pError)
							{
								pResponse.send(400, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pEntry);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.del
			(
				'/Schedule/:GUID',
				function (pRequest, pResponse, fNext)
				{
					this.fable['Ultravisor-Hypervisor'].removeScheduleEntry(pRequest.params.GUID,
						function (pError, pResult)
						{
							if (pError)
							{
								pResponse.send(404, { Error: pError.message });
								return fNext();
							}
							pResponse.send({ Status: 'Deleted', GUID: pRequest.params.GUID });
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/Schedule/Start',
				function (pRequest, pResponse, fNext)
				{
					this.fable['Ultravisor-Hypervisor'].startSchedule(
						function ()
						{
							pResponse.send({ Status: 'Schedule Started' });
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/Schedule/Stop',
				function (pRequest, pResponse, fNext)
				{
					this.fable['Ultravisor-Hypervisor'].stopSchedule(
						function ()
						{
							pResponse.send({ Status: 'Schedule Stopped' });
							return fNext();
						});
				}.bind(this)
			);

		// --- Manifests ---
		this._OratorServer.get
			(
				'/Manifest',
				function (pRequest, pResponse, fNext)
				{
					pResponse.send(this.fable['Ultravisor-Operation-Manifest'].getManifestList());
					return fNext();
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/Manifest/:GUIDRun',
				function (pRequest, pResponse, fNext)
				{
					let tmpManifest = this.fable['Ultravisor-Operation-Manifest'].getManifest(pRequest.params.GUIDRun);
					if (tmpManifest)
					{
						pResponse.send(tmpManifest);
					}
					else
					{
						pResponse.send(404, { Error: `Manifest ${pRequest.params.GUIDRun} not found.` });
					}
					return fNext();
				}.bind(this)
			);

		return fCallback();
	}

	start(fCallback)
	{
		const tmpAnticipate = this.fable.newAnticipate();

		tmpAnticipate.anticipate(
			function (fNext)
			{
				// Initialize the Orator service
				if (!this.fable.settings.APIServerPort)
				{
					if (this.fable?.ProgramConfiguration?.UltravisorAPIServerPort)
					{
						this.fable.settings.APIServerPort = this.fable.ProgramConfiguration.UltravisorAPIServerPort;
					}
					else
					{
						this.fable.settings.APIServerPort = 55555;
					}
				}
				return fNext();
			}.bind(this));

		this._Orator = this.fable.instantiateServiceProvider('Orator', {});

		tmpAnticipate.anticipate(
			function (fNext)
			{
				this.log.info(`Initializing Ultravisor Orator API Server on port ${this.fable.settings.APIServerPort}`);
				this._Orator.initialize(
					function (pError)
					{
						if (pError)
						{
							this.log.info(`Error initializing Orator for Ultravisor ${pError}`, pError);
							return fCallback(pError);
						}
						this.log.info(`Orator initialized for Ultravisor API Server on port ${this.fable.settings.APIServerPort}`);
						return fNext();
					}.bind(this));
			}.bind(this));

		tmpAnticipate.anticipate(
			function (fNext)
			{
				// Enable JSON body parsing for POST/PUT requests
				this._OratorServer.server.use(this._OratorServer.bodyParser());
				return fNext();
			}.bind(this));

		tmpAnticipate.anticipate(
			function (fNext)
			{
				this.wireEndpoints(
					function (pError)
					{
						if (pError)
						{
							this.log.info(`Error wiring Ultravisor API Server endpoints: ${pError}`, pError);
							return fCallback(pError);
						}
						this.log.info(`Ultravisor API Server endpoints wired successfully.`);
						return fNext();
					}.bind(this));
			}.bind(this));

		tmpAnticipate.anticipate(
			function (fNext)
			{
				let tmpWebInterfacePath = this.fable?.ProgramConfiguration?.UltravisorWebInterfacePath;
				if (tmpWebInterfacePath && (typeof tmpWebInterfacePath === 'string'))
				{
					// Resolve relative paths against the current working directory
					let tmpResolvedPath = libPath.resolve(process.cwd(), tmpWebInterfacePath);
					this.log.info(`Ultravisor: Serving web interface from [${tmpResolvedPath}]`);

					// Workaround: Orator's addStaticRoute serves bare "/" with
					// Content-Type application/octet-stream because serve-static
					// overwrites the MIME header that Orator sets.  Add an
					// explicit redirect so "/" always loads /index.html which is
					// served with the correct text/html content type.
					this._OratorServer.get('/',
						function (pRequest, pResponse, fNext)
						{
							pResponse.redirect('/index.html', fNext);
						});

					this._Orator.addStaticRoute(tmpResolvedPath, 'index.html', '/*');
				}
				return fNext();
			}.bind(this));

		tmpAnticipate.anticipate(
			function (fNext)
			{
				this.log.info(`Starting Ultravisor Orator API Server on port ${this.fable.settings.APIServerPort}`);
				this._Orator.startService(fNext);
			}.bind(this));

		tmpAnticipate.wait(
			function (pError)
			{
				if (pError)
				{
					this.log.info(`Error starting Ultravisor API Server: ${pError}`, pError);
					return fCallback(pError);
				}
				this.log.info(`Ultravisor Orator API Server started successfully.`);
				return fCallback();
			}.bind(this));
	}
}

module.exports = UltravisorAPIServer;