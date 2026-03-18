const libPictService = require(`pict-serviceproviderbase`);

const libFS = require('fs');
const libPath = require('path');
const libOrator = require('orator');
const libOratorServiceServerRestify = require(`orator-serviceserver-restify`);
const libOratorAuthentication = require('orator-authentication');

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

		this._OratorAuth = null;
	}

	/**
	 * Get a service instance from the fable services map.
	 */
	_getService(pTypeName)
	{
		return this.fable.servicesMap[pTypeName]
			? Object.values(this.fable.servicesMap[pTypeName])[0]
			: null;
	}

	_requireSession(pRequest, pResponse, fNext)
	{
		if (!this._OratorAuth)
		{
			return {};
		}

		let tmpSession = this._OratorAuth.getSessionForRequest(pRequest);

		if (!tmpSession)
		{
			pResponse.send(401, { Error: 'Authentication required.', LoggedIn: false });
			fNext();
			return null;
		}

		return tmpSession;
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
					let tmpHypervisor = this._getService('UltravisorHypervisor');
					pResponse.send({
						Status: 'Running',
						ScheduleEntries: tmpHypervisor ? tmpHypervisor.getSchedule().length : 0,
						ScheduleRunning: tmpHypervisor ? tmpHypervisor._Running : false
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
					let tmpHypervisor = this._getService('UltravisorHypervisor');
					if (tmpHypervisor)
					{
						tmpHypervisor.stopSchedule();
					}
					pResponse.send({ "Status": "STOPPING" });
					pResponse.end();
					return this._Orator.stopService(fNext);
				}.bind(this)
			);

		// --- Node Template CRUD ---
		this._OratorServer.get
			(
				'/NodeTemplate',
				function (pRequest, pResponse, fNext)
				{
					let tmpState = this._getService('UltravisorHypervisorState');
					tmpState.getNodeTemplateList(
						function (pError, pTemplates)
						{
							if (pError)
							{
								pResponse.send(500, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pTemplates);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/NodeTemplate/:Hash',
				function (pRequest, pResponse, fNext)
				{
					let tmpState = this._getService('UltravisorHypervisorState');
					tmpState.getNodeTemplate(pRequest.params.Hash,
						function (pError, pTemplate)
						{
							if (pError)
							{
								pResponse.send(404, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pTemplate);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.post
			(
				'/NodeTemplate',
				function (pRequest, pResponse, fNext)
				{
					let tmpState = this._getService('UltravisorHypervisorState');
					tmpState.updateNodeTemplate(pRequest.body,
						function (pError, pTemplate)
						{
							if (pError)
							{
								pResponse.send(400, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pTemplate);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.put
			(
				'/NodeTemplate/:Hash',
				function (pRequest, pResponse, fNext)
				{
					let tmpTemplateData = pRequest.body || {};
					tmpTemplateData.Hash = pRequest.params.Hash;
					let tmpState = this._getService('UltravisorHypervisorState');
					tmpState.updateNodeTemplate(tmpTemplateData,
						function (pError, pTemplate)
						{
							if (pError)
							{
								pResponse.send(400, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pTemplate);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.del
			(
				'/NodeTemplate/:Hash',
				function (pRequest, pResponse, fNext)
				{
					let tmpState = this._getService('UltravisorHypervisorState');
					tmpState.deleteNodeTemplate(pRequest.params.Hash,
						function (pError)
						{
							if (pError)
							{
								pResponse.send(404, { Error: pError.message });
								return fNext();
							}
							pResponse.send({ Status: 'Deleted', Hash: pRequest.params.Hash });
							return fNext();
						});
				}.bind(this)
			);

		// --- Operation CRUD ---
		this._OratorServer.get
			(
				'/Operation',
				function (pRequest, pResponse, fNext)
				{
					let tmpState = this._getService('UltravisorHypervisorState');
					tmpState.getOperationList(
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
				'/Operation/:Hash',
				function (pRequest, pResponse, fNext)
				{
					let tmpState = this._getService('UltravisorHypervisorState');
					tmpState.getOperation(pRequest.params.Hash,
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
					let tmpState = this._getService('UltravisorHypervisorState');
					tmpState.updateOperation(pRequest.body,
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
				'/Operation/:Hash',
				function (pRequest, pResponse, fNext)
				{
					let tmpOperationData = pRequest.body || {};
					tmpOperationData.Hash = pRequest.params.Hash;
					let tmpState = this._getService('UltravisorHypervisorState');
					tmpState.updateOperation(tmpOperationData,
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
				'/Operation/:Hash',
				function (pRequest, pResponse, fNext)
				{
					let tmpState = this._getService('UltravisorHypervisorState');
					tmpState.deleteOperation(pRequest.params.Hash,
						function (pError)
						{
							if (pError)
							{
								pResponse.send(404, { Error: pError.message });
								return fNext();
							}
							pResponse.send({ Status: 'Deleted', Hash: pRequest.params.Hash });
							return fNext();
						});
				}.bind(this)
			);

		// --- Operation Execution ---
		this._OratorServer.get
			(
				'/Operation/:Hash/Execute',
				function (pRequest, pResponse, fNext)
				{
					let tmpState = this._getService('UltravisorHypervisorState');
					let tmpEngine = this._getService('UltravisorExecutionEngine');

					tmpState.getOperation(pRequest.params.Hash,
						function (pError, pOperation)
						{
							if (pError)
							{
								pResponse.send(404, { Error: pError.message });
								return fNext();
							}

							let tmpRunMode = (pRequest.query && pRequest.query.RunMode) || undefined;
							let tmpInitialState = tmpRunMode ? { RunMode: tmpRunMode } : {};

							tmpEngine.executeOperation(pOperation, tmpInitialState,
								function (pExecError, pContext)
								{
									if (pExecError)
									{
										pResponse.send(500, { Error: pExecError.message });
										return fNext();
									}
									pResponse.send({
										Status: pContext.Status,
										Hash: pContext.Hash,
										OperationHash: pContext.OperationHash,
										RunMode: pContext.RunMode,
										Output: pContext.Output,
										TaskOutputs: pContext.TaskOutputs,
										Log: pContext.Log,
										Errors: pContext.Errors,
										StartTime: pContext.StartTime,
										StopTime: pContext.StopTime,
										ElapsedMs: pContext.ElapsedMs,
										TaskManifests: pContext.TaskManifests,
										TimingSummary: pContext.TimingSummary,
										EventLog: pContext.EventLog,
										WaitingTasks: pContext.WaitingTasks
									});
									return fNext();
								});
						});
				}.bind(this)
			);

		// --- Task Types ---
		this._OratorServer.get
			(
				'/TaskType',
				function (pRequest, pResponse, fNext)
				{
					let tmpRegistry = this._getService('UltravisorTaskTypeRegistry');
					if (tmpRegistry)
					{
						pResponse.send(tmpRegistry.listDefinitions());
					}
					else
					{
						pResponse.send([]);
					}
					return fNext();
				}.bind(this)
			);

		// --- Schedule ---
		this._OratorServer.get
			(
				'/Schedule',
				function (pRequest, pResponse, fNext)
				{
					let tmpHypervisor = this._getService('UltravisorHypervisor');
					pResponse.send(tmpHypervisor ? tmpHypervisor.getSchedule() : []);
					return fNext();
				}.bind(this)
			);

		this._OratorServer.post
			(
				'/Schedule/Operation',
				function (pRequest, pResponse, fNext)
				{
					let tmpBody = pRequest.body || {};
					let tmpHypervisor = this._getService('UltravisorHypervisor');

					tmpHypervisor.scheduleOperation(tmpBody.Hash, tmpBody.ScheduleType, tmpBody.Parameters,
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
					let tmpHypervisor = this._getService('UltravisorHypervisor');
					tmpHypervisor.removeScheduleEntry(pRequest.params.GUID,
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
					let tmpHypervisor = this._getService('UltravisorHypervisor');
					tmpHypervisor.startSchedule(
						function ()
						{
							pResponse.send({ Status: 'Schedule Started' });
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/Schedule/Start/:GUID',
				function (pRequest, pResponse, fNext)
				{
					let tmpHypervisor = this._getService('UltravisorHypervisor');
					tmpHypervisor.startScheduleEntry(pRequest.params.GUID,
						function (pError, pEntry)
						{
							if (pError)
							{
								pResponse.send(404, { Error: pError.message });
								return fNext();
							}
							pResponse.send({ Status: 'Entry Started', Entry: pEntry });
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/Schedule/Stop',
				function (pRequest, pResponse, fNext)
				{
					let tmpHypervisor = this._getService('UltravisorHypervisor');
					tmpHypervisor.stopSchedule(
						function ()
						{
							pResponse.send({ Status: 'Schedule Stopped' });
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/Schedule/Stop/:GUID',
				function (pRequest, pResponse, fNext)
				{
					let tmpHypervisor = this._getService('UltravisorHypervisor');
					tmpHypervisor.stopScheduleEntry(pRequest.params.GUID,
						function (pError, pEntry)
						{
							if (pError)
							{
								pResponse.send(404, { Error: pError.message });
								return fNext();
							}
							pResponse.send({ Status: 'Entry Stopped', Entry: pEntry });
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
					let tmpManifest = this._getService('UltravisorExecutionManifest');
					pResponse.send(tmpManifest ? tmpManifest.listRuns() : []);
					return fNext();
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/Manifest/:RunHash',
				function (pRequest, pResponse, fNext)
				{
					let tmpManifest = this._getService('UltravisorExecutionManifest');
					let tmpRun = tmpManifest ? tmpManifest.getRun(pRequest.params.RunHash) : null;
					if (tmpRun)
					{
						pResponse.send(tmpRun);
					}
					else
					{
						pResponse.send(404, { Error: `Manifest ${pRequest.params.RunHash} not found.` });
					}
					return fNext();
				}.bind(this)
			);

		// --- Pending Inputs ---
		this._OratorServer.get
			(
				'/PendingInput',
				function (pRequest, pResponse, fNext)
				{
					let tmpManifest = this._getService('UltravisorExecutionManifest');
					if (!tmpManifest)
					{
						pResponse.send([]);
						return fNext();
					}

					let tmpRuns = tmpManifest.listRuns();
					let tmpPending = [];

					for (let i = 0; i < tmpRuns.length; i++)
					{
						if (tmpRuns[i].Status === 'WaitingForInput')
						{
							let tmpFullRun = tmpManifest.getRun(tmpRuns[i].Hash);
							if (tmpFullRun)
							{
								tmpPending.push({
									RunHash: tmpFullRun.Hash,
									OperationHash: tmpFullRun.OperationHash,
									OperationName: tmpFullRun.OperationName,
									StartTime: tmpFullRun.StartTime,
									WaitingTasks: tmpFullRun.WaitingTasks
								});
							}
						}
					}

					pResponse.send(tmpPending);
					return fNext();
				}.bind(this)
			);

		this._OratorServer.post
			(
				'/PendingInput/:RunHash',
				function (pRequest, pResponse, fNext)
				{
					let tmpBody = pRequest.body || {};
					let tmpEngine = this._getService('UltravisorExecutionEngine');
					let tmpRunHash = pRequest.params.RunHash;

					if (!tmpBody.NodeHash)
					{
						pResponse.send(400, { Error: 'NodeHash is required.' });
						return fNext();
					}

					tmpEngine.resumeOperation(tmpRunHash, tmpBody.NodeHash, tmpBody.Value,
						function (pError, pContext)
						{
							if (pError)
							{
								pResponse.send(400, { Error: pError.message });
								return fNext();
							}
							pResponse.send({
								Status: pContext.Status,
								Hash: pContext.Hash,
								TaskOutputs: pContext.TaskOutputs,
								Log: pContext.Log,
								Errors: pContext.Errors,
								WaitingTasks: pContext.WaitingTasks
							});
							return fNext();
						});
				}.bind(this)
			);

		// --- Operation Resume (for value-input tasks) ---
		this._OratorServer.post
			(
				'/Operation/Resume',
				function (pRequest, pResponse, fNext)
				{
					let tmpBody = pRequest.body || {};
					let tmpEngine = this._getService('UltravisorExecutionEngine');

					if (!tmpBody.RunHash || !tmpBody.NodeHash)
					{
						pResponse.send(400, { Error: 'RunHash and NodeHash are required.' });
						return fNext();
					}

					tmpEngine.resumeOperation(tmpBody.RunHash, tmpBody.NodeHash, tmpBody.Value,
						function (pError, pContext)
						{
							if (pError)
							{
								pResponse.send(400, { Error: pError.message });
								return fNext();
							}
							pResponse.send({
								Status: pContext.Status,
								Hash: pContext.Hash,
								TaskOutputs: pContext.TaskOutputs,
								Log: pContext.Log,
								Errors: pContext.Errors,
								WaitingTasks: pContext.WaitingTasks
							});
							return fNext();
						});
				}.bind(this)
			);

		// --- Operation Library ---
		this._OratorServer.get
			(
				'/OperationLibrary',
				function (pRequest, pResponse, fNext)
				{
					let tmpLibraryPath = this.fable?.ProgramConfiguration?.UltravisorOperationLibraryPath;
					if (!tmpLibraryPath)
					{
						pResponse.send([]);
						return fNext();
					}

					let tmpResolvedPath = libPath.resolve(process.cwd(), tmpLibraryPath);

					let tmpFiles;
					try
					{
						tmpFiles = libFS.readdirSync(tmpResolvedPath);
					}
					catch (pError)
					{
						this.log.warn(`OperationLibrary: could not read directory [${tmpResolvedPath}]: ${pError.message}`);
						pResponse.send([]);
						return fNext();
					}

					let tmpLibraryItems = [];

					for (let i = 0; i < tmpFiles.length; i++)
					{
						let tmpFileName = tmpFiles[i];
						if (!tmpFileName.endsWith('.json'))
						{
							continue;
						}

						try
						{
							let tmpFilePath = libPath.join(tmpResolvedPath, tmpFileName);
							let tmpContent = libFS.readFileSync(tmpFilePath, 'utf8');
							let tmpOperation = JSON.parse(tmpContent);

							tmpLibraryItems.push({
								FileName: tmpFileName,
								Name: tmpOperation.Name || tmpFileName,
								Description: tmpOperation.Description || '',
								Tags: tmpOperation.Tags || [],
								Author: tmpOperation.Author || '',
								Version: tmpOperation.Version || '',
								NodeCount: (tmpOperation.Graph && tmpOperation.Graph.Nodes) ? tmpOperation.Graph.Nodes.length : 0
							});
						}
						catch (pError)
						{
							this.log.warn(`OperationLibrary: could not parse [${tmpFileName}]: ${pError.message}`);
						}
					}

					tmpLibraryItems.sort(
						function (a, b)
						{
							return a.Name.localeCompare(b.Name);
						});

					pResponse.send(tmpLibraryItems);
					return fNext();
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/OperationLibrary/:FileName',
				function (pRequest, pResponse, fNext)
				{
					let tmpFileName = pRequest.params.FileName;

					// Security: prevent directory traversal
					if (!tmpFileName || !tmpFileName.endsWith('.json') ||
						tmpFileName.indexOf('/') >= 0 || tmpFileName.indexOf('\\') >= 0 ||
						tmpFileName.indexOf('..') >= 0)
					{
						pResponse.send(400, { Error: 'Invalid file name.' });
						return fNext();
					}

					let tmpLibraryPath = this.fable?.ProgramConfiguration?.UltravisorOperationLibraryPath;
					if (!tmpLibraryPath)
					{
						pResponse.send(404, { Error: 'Operation library not configured.' });
						return fNext();
					}

					let tmpResolvedPath = libPath.resolve(process.cwd(), tmpLibraryPath);
					let tmpFilePath = libPath.join(tmpResolvedPath, tmpFileName);

					try
					{
						let tmpContent = libFS.readFileSync(tmpFilePath, 'utf8');
						let tmpOperation = JSON.parse(tmpContent);
						pResponse.send(tmpOperation);
					}
					catch (pError)
					{
						pResponse.send(404, { Error: `Library operation [${tmpFileName}] not found.` });
					}
					return fNext();
				}.bind(this)
			);

		// --- Operation Export ---
		this._OratorServer.get
			(
				'/Operation/:Hash/Export',
				function (pRequest, pResponse, fNext)
				{
					let tmpState = this._getService('UltravisorHypervisorState');
					tmpState.getOperation(pRequest.params.Hash,
						function (pError, pOperation)
						{
							if (pError)
							{
								pResponse.send(404, { Error: pError.message });
								return fNext();
							}

							let tmpExport = {
								Hash: pOperation.Hash,
								Name: pOperation.Name || '',
								Description: pOperation.Description || '',
								Graph: pOperation.Graph || { Nodes: [], Connections: [], ViewState: {} },
								SavedLayouts: pOperation.SavedLayouts || [],
								InitialGlobalState: pOperation.InitialGlobalState || {},
								InitialOperationState: pOperation.InitialOperationState || {},
								ExportedAt: new Date().toISOString()
							};

							pResponse.send(tmpExport);
							return fNext();
						});
				}.bind(this)
			);

		// ===================================================================
		// Beacon Worker Endpoints
		// ===================================================================

		// --- Beacon Registration ---
		this._OratorServer.post
			(
				'/Beacon/Register',
				function (pRequest, pResponse, fNext)
				{
					let tmpSession = this._requireSession(pRequest, pResponse, fNext);
					if (!tmpSession) { return; }

					let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
					if (!tmpCoordinator)
					{
						pResponse.send(500, { Error: 'BeaconCoordinator service not available.' });
						return fNext();
					}

					let tmpBody = pRequest.body || {};
					if (!tmpBody.Name || !tmpBody.Capabilities)
					{
						pResponse.send(400, { Error: 'Name and Capabilities are required.' });
						return fNext();
					}

					let tmpBeacon = tmpCoordinator.registerBeacon(tmpBody, tmpSession.SessionID);
					pResponse.send(tmpBeacon);
					return fNext();
				}.bind(this)
			);

		// --- List Beacons (no auth – management UI) ---
		this._OratorServer.get
			(
				'/Beacon',
				function (pRequest, pResponse, fNext)
				{
					let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
					if (!tmpCoordinator)
					{
						pResponse.send([]);
						return fNext();
					}

					pResponse.send(tmpCoordinator.listBeacons());
					return fNext();
				}.bind(this)
			);

		// --- List Work Items (no auth – management UI) ---
		this._OratorServer.get
			(
				'/Beacon/Work',
				function (pRequest, pResponse, fNext)
				{
					let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
					if (!tmpCoordinator)
					{
						pResponse.send([]);
						return fNext();
					}

					pResponse.send(tmpCoordinator.listWorkItems());
					return fNext();
				}.bind(this)
			);

		// --- List Affinity Bindings (no auth – management UI) ---
		this._OratorServer.get
			(
				'/Beacon/Affinity',
				function (pRequest, pResponse, fNext)
				{
					let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
					if (!tmpCoordinator)
					{
						pResponse.send([]);
						return fNext();
					}

					pResponse.send(tmpCoordinator.listAffinityBindings());
					return fNext();
				}.bind(this)
			);

		// --- Get Specific Beacon (no auth – management UI) ---
		this._OratorServer.get
			(
				'/Beacon/:BeaconID',
				function (pRequest, pResponse, fNext)
				{
					let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
					if (!tmpCoordinator)
					{
						pResponse.send(404, { Error: 'BeaconCoordinator service not available.' });
						return fNext();
					}

					let tmpBeacon = tmpCoordinator.getBeacon(pRequest.params.BeaconID);
					if (!tmpBeacon)
					{
						pResponse.send(404, { Error: `Beacon [${pRequest.params.BeaconID}] not found.` });
						return fNext();
					}

					pResponse.send(tmpBeacon);
					return fNext();
				}.bind(this)
			);

		// --- Deregister Beacon (no auth – management UI) ---
		this._OratorServer.del
			(
				'/Beacon/:BeaconID',
				function (pRequest, pResponse, fNext)
				{
					let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
					if (!tmpCoordinator)
					{
						pResponse.send(500, { Error: 'BeaconCoordinator service not available.' });
						return fNext();
					}

					let tmpRemoved = tmpCoordinator.deregisterBeacon(pRequest.params.BeaconID);
					if (!tmpRemoved)
					{
						pResponse.send(404, { Error: `Beacon [${pRequest.params.BeaconID}] not found.` });
						return fNext();
					}

					pResponse.send({ Status: 'Deregistered', BeaconID: pRequest.params.BeaconID });
					return fNext();
				}.bind(this)
			);

		// --- Beacon Heartbeat ---
		this._OratorServer.post
			(
				'/Beacon/:BeaconID/Heartbeat',
				function (pRequest, pResponse, fNext)
				{
					let tmpSession = this._requireSession(pRequest, pResponse, fNext);
					if (!tmpSession) { return; }

					let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
					if (!tmpCoordinator)
					{
						pResponse.send(500, { Error: 'BeaconCoordinator service not available.' });
						return fNext();
					}

					let tmpBeacon = tmpCoordinator.heartbeat(pRequest.params.BeaconID);
					if (!tmpBeacon)
					{
						pResponse.send(404, { Error: `Beacon [${pRequest.params.BeaconID}] not found.` });
						return fNext();
					}

					pResponse.send(tmpBeacon);
					return fNext();
				}.bind(this)
			);

		// --- Poll for Work ---
		this._OratorServer.post
			(
				'/Beacon/Work/Poll',
				function (pRequest, pResponse, fNext)
				{
					let tmpSession = this._requireSession(pRequest, pResponse, fNext);
					if (!tmpSession) { return; }

					let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
					if (!tmpCoordinator)
					{
						pResponse.send(500, { Error: 'BeaconCoordinator service not available.' });
						return fNext();
					}

					let tmpBody = pRequest.body || {};
					if (!tmpBody.BeaconID)
					{
						pResponse.send(400, { Error: 'BeaconID is required.' });
						return fNext();
					}

					let tmpWorkItem = tmpCoordinator.pollForWork(tmpBody.BeaconID);
					pResponse.send({ WorkItem: tmpWorkItem });
					return fNext();
				}.bind(this)
			);

		// --- Complete Work Item ---
		this._OratorServer.post
			(
				'/Beacon/Work/:WorkItemHash/Complete',
				function (pRequest, pResponse, fNext)
				{
					let tmpSession = this._requireSession(pRequest, pResponse, fNext);
					if (!tmpSession) { return; }

					let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
					if (!tmpCoordinator)
					{
						pResponse.send(500, { Error: 'BeaconCoordinator service not available.' });
						return fNext();
					}

					let tmpBody = pRequest.body || {};
					tmpCoordinator.completeWorkItem(pRequest.params.WorkItemHash,
						{ Outputs: tmpBody.Outputs || {}, Log: tmpBody.Log || [] },
						function (pError)
						{
							if (pError)
							{
								pResponse.send(400, { Error: pError.message });
								return fNext();
							}

							pResponse.send({ Status: 'Completed', WorkItemHash: pRequest.params.WorkItemHash });
							return fNext();
						});
				}.bind(this)
			);

		// --- Report Progress ---
		this._OratorServer.post
			(
				'/Beacon/Work/:WorkItemHash/Progress',
				function (pRequest, pResponse, fNext)
				{
					let tmpSession = this._requireSession(pRequest, pResponse, fNext);
					if (!tmpSession) { return; }

					let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
					if (!tmpCoordinator)
					{
						pResponse.send(500, { Error: 'BeaconCoordinator service not available.' });
						return fNext();
					}

					let tmpBody = pRequest.body || {};
					let tmpUpdated = tmpCoordinator.updateProgress(pRequest.params.WorkItemHash, tmpBody);

					if (!tmpUpdated)
					{
						pResponse.send(404, { Error: `Work item [${pRequest.params.WorkItemHash}] not found or not running.` });
						return fNext();
					}

					pResponse.send({ Success: true, WorkItemHash: pRequest.params.WorkItemHash });
					return fNext();
				}.bind(this)
			);

		// --- Direct Dispatch (synchronous) ---
		this._OratorServer.post
			(
				'/Beacon/Work/Dispatch',
				function (pRequest, pResponse, fNext)
				{
					let tmpSession = this._requireSession(pRequest, pResponse, fNext);
					if (!tmpSession) { return; }

					let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
					if (!tmpCoordinator)
					{
						pResponse.send(500, { Success: false, Error: 'BeaconCoordinator service not available.' });
						return fNext();
					}

					let tmpBody = pRequest.body || {};
					if (!tmpBody.Capability)
					{
						pResponse.send(400, { Success: false, Error: 'Capability is required.' });
						return fNext();
					}

					// Check if any Beacons are registered
					let tmpBeacons = tmpCoordinator.listBeacons();
					if (tmpBeacons.length === 0)
					{
						pResponse.send(503, { Success: false, Error: 'No Beacon workers are registered.' });
						return fNext();
					}

					// Disable request timeout for long-running dispatch
					if (pRequest.connection)
					{
						pRequest.connection.setTimeout(0);
					}

					let tmpWorkItemInfo = {
						Capability: tmpBody.Capability || 'Shell',
						Action: tmpBody.Action || 'Execute',
						Settings: tmpBody.Settings || {},
						AffinityKey: tmpBody.AffinityKey || '',
						TimeoutMs: tmpBody.TimeoutMs || 300000
					};

					tmpCoordinator.dispatchAndWait(tmpWorkItemInfo,
						(pError, pResult) =>
						{
							if (pError)
							{
								pResponse.send(500, { Success: false, Error: pError.message });
								return fNext();
							}

							pResponse.send(pResult);
							return fNext();
						});
				}.bind(this)
			);

		// --- Beacon Capabilities (no auth – management UI) ---
		this._OratorServer.get
			(
				'/Beacon/Capabilities',
				function (pRequest, pResponse, fNext)
				{
					let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
					if (!tmpCoordinator)
					{
						pResponse.send({ Capabilities: [] });
						return fNext();
					}

					let tmpBeacons = tmpCoordinator.listBeacons();
					let tmpCapabilitySet = {};

					for (let i = 0; i < tmpBeacons.length; i++)
					{
						let tmpCaps = tmpBeacons[i].Capabilities || [];
						for (let j = 0; j < tmpCaps.length; j++)
						{
							tmpCapabilitySet[tmpCaps[j]] = true;
						}
					}

					pResponse.send({
						Capabilities: Object.keys(tmpCapabilitySet),
						BeaconCount: tmpBeacons.length
					});
					return fNext();
				}.bind(this)
			);

		// --- Fail Work Item ---
		this._OratorServer.post
			(
				'/Beacon/Work/:WorkItemHash/Error',
				function (pRequest, pResponse, fNext)
				{
					let tmpSession = this._requireSession(pRequest, pResponse, fNext);
					if (!tmpSession) { return; }

					let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
					if (!tmpCoordinator)
					{
						pResponse.send(500, { Error: 'BeaconCoordinator service not available.' });
						return fNext();
					}

					let tmpBody = pRequest.body || {};
					tmpCoordinator.failWorkItem(pRequest.params.WorkItemHash,
						{ ErrorMessage: tmpBody.ErrorMessage || 'Unknown error', Log: tmpBody.Log || [] },
						function (pError)
						{
							if (pError)
							{
								pResponse.send(400, { Error: pError.message });
								return fNext();
							}

							pResponse.send({ Status: 'Failed', WorkItemHash: pRequest.params.WorkItemHash });
							return fNext();
						});
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
				this.fable.addServiceTypeIfNotExists('OratorAuthentication', libOratorAuthentication);
				this._OratorAuth = this.fable.instantiateServiceProvider('OratorAuthentication',
					{
						RoutePrefix: '/1.0/',
						SessionTTL: this.fable.settings.UltravisorBeaconSessionTTLMs || 86400000,
						CookieHttpOnly: true,
						CookieSecure: false
					});
				this._OratorAuth.connectRoutes();
				this.log.info('Ultravisor: OratorAuthentication routes registered.');
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
