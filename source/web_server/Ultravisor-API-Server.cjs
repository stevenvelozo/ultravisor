const libPictService = require(`pict-serviceproviderbase`);

const libFS = require('fs');
const libPath = require('path');
const libOrator = require('orator');
const libOratorServiceServerRestify = require(`orator-serviceserver-restify`);
const libOratorAuthentication = require('orator-authentication');
const libWebSocket = require('ws');

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

		// WebSocket server for real-time execution events
		this._WebSocketServer = null;
		// Map of RunHash -> Set of WebSocket clients subscribed to that run
		this._WebSocketSubscriptions = {};
		// Map of BeaconID -> WebSocket for beacon worker connections
		this._BeaconWebSockets = {};
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

		// --- Operation Audit ---
		// Static port-mapping audit across all registered operations.
		// Cross-references beacon-dispatch nodes' state connections and
		// Data keys against the beacon action catalog's SettingsSchema.
		this._OratorServer.get
			(
				'/OperationAudit',
				function (pRequest, pResponse, fNext)
				{
					let tmpAuditor = this._getService('UltravisorOperationAuditor');
					if (!tmpAuditor)
					{
						pResponse.send(503, { Error: 'UltravisorOperationAuditor service not available.' });
						return fNext();
					}
					tmpAuditor.auditAll(
						function (pError, pReport)
						{
							if (pError)
							{
								pResponse.send(500, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pReport);
							return fNext();
						});
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/OperationAudit/:Hash',
				function (pRequest, pResponse, fNext)
				{
					let tmpAuditor = this._getService('UltravisorOperationAuditor');
					if (!tmpAuditor)
					{
						pResponse.send(503, { Error: 'UltravisorOperationAuditor service not available.' });
						return fNext();
					}
					tmpAuditor.auditByHash(pRequest.params.Hash,
						function (pError, pResult)
						{
							if (pError)
							{
								pResponse.send(404, { Error: pError.message });
								return fNext();
							}
							pResponse.send(pResult);
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

		// --- Async Operation Execution (returns immediately, client polls for progress) ---
		this._OratorServer.post
			(
				'/Operation/:Hash/Execute/Async',
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

							let tmpBody = pRequest.body || {};
							let tmpRunMode = tmpBody.RunMode || (pRequest.query && pRequest.query.RunMode) || undefined;
							let tmpInitialState = tmpRunMode ? { RunMode: tmpRunMode } : {};

							tmpEngine.startOperationAsync(pOperation, tmpInitialState,
								function (pExecError, pContext)
								{
									if (pExecError)
									{
										pResponse.send(500, { Error: pExecError.message });
										return fNext();
									}
									pResponse.send({
										RunHash: pContext.Hash,
										Status: pContext.Status,
										OperationHash: pContext.OperationHash
									});
									return fNext();
								});
						});
				}.bind(this)
			);

		// --- Operation Trigger (parameter-seeded execution) ---
		// Beacons and clients trigger operations by hash with parameters
		// that seed the operation's initial state.  Sync mode blocks until
		// the run completes; async mode returns the RunHash immediately.
		this._OratorServer.post
			(
				'/Operation/:Hash/Trigger',
				function (pRequest, pResponse, fNext)
				{
					this.log.info(`[Trigger] POST /Operation/${pRequest.params.Hash}/Trigger received`);
					let tmpState = this._getService('UltravisorHypervisorState');
					let tmpEngine = this._getService('UltravisorExecutionEngine');
					let tmpManifest = this._getService('UltravisorExecutionManifest');

					tmpState.getOperation(pRequest.params.Hash,
						function (pError, pOperation)
						{
							if (pError)
							{
								this.log.warn(`[Trigger] Operation "${pRequest.params.Hash}" not found: ${pError.message}`);
								pResponse.send(404, { Error: pError.message });
								return fNext();
							}

							let tmpBody = pRequest.body || {};
							let tmpParameters = tmpBody.Parameters || {};
							let tmpAsync = tmpBody.Async === true;
							let tmpTimeoutMs = tmpBody.TimeoutMs || 600000;

							this.log.info(`[Trigger] Operation found: "${pOperation.Name || pOperation.Hash}" async=${tmpAsync} timeout=${tmpTimeoutMs}ms`);

							// Seed operation state from trigger parameters
							let tmpInitialState = {
								OperationState: tmpParameters
							};

							tmpEngine.startOperationAsync(pOperation, tmpInitialState,
								function (pExecError, pContext)
								{
									if (pExecError)
									{
										this.log.warn(`[Trigger] startOperationAsync failed: ${pExecError.message}`);
										pResponse.send(500, { Error: pExecError.message });
										return fNext();
									}

									this.log.info(`[Trigger] Operation started: run=${pContext.Hash} status=${pContext.Status}`);

									if (tmpAsync)
									{
										pResponse.send({
											RunHash: pContext.Hash,
											Status: pContext.Status,
											OperationHash: pContext.OperationHash
										});
										return fNext();
									}

									// Sync mode — disable socket timeout and wait for completion
									if (pRequest.connection)
									{
										pRequest.connection.setTimeout(0);
									}

									tmpManifest.waitForCompletion(pContext.Hash, tmpTimeoutMs,
										function (pWaitError, pCompletedContext)
										{
											if (pWaitError)
											{
												this.log.warn(`[Trigger] waitForCompletion failed: ${pWaitError.message}`);
												pResponse.send(504, { Error: pWaitError.message });
												return fNext();
											}

											this.log.info(`[Trigger] Run completed: run=${pCompletedContext.Hash} status=${pCompletedContext.Status} elapsed=${pCompletedContext.ElapsedMs}ms errors=${JSON.stringify(pCompletedContext.Errors || [])}`);
											if (pCompletedContext.Log && pCompletedContext.Log.length > 0)
											{
												this.log.info(`[Trigger] Run log: ${JSON.stringify(pCompletedContext.Log)}`);
											}

											// Check if any task output has a StagingFilePath
											// for binary streaming (from the send-result card).
											let tmpStagingFilePath = null;
											let tmpTaskOutputs = pCompletedContext.TaskOutputs || {};
											let tmpNodeKeys = Object.keys(tmpTaskOutputs);
											for (let k = 0; k < tmpNodeKeys.length; k++)
											{
												let tmpNodeOut = tmpTaskOutputs[tmpNodeKeys[k]];
												if (tmpNodeOut && tmpNodeOut.StagingFilePath)
												{
													tmpStagingFilePath = tmpNodeOut.StagingFilePath;
													break;
												}
											}

											this.log.info(`[Trigger] StagingFilePath=${tmpStagingFilePath || '(none)'} taskOutputNodes=[${tmpNodeKeys.join(',')}]`);

											// If a result file exists, stream it as binary
											if (tmpStagingFilePath && pCompletedContext.Status === 'Complete'
												&& require('fs').existsSync(tmpStagingFilePath))
											{
												this.log.info(`[Trigger] Streaming binary result from ${tmpStagingFilePath}`);
												// Put metadata in headers so the caller
												// doesn't lose visibility into the run
												pResponse.setHeader('X-Run-Hash', pCompletedContext.Hash);
												pResponse.setHeader('X-Status', pCompletedContext.Status);
												pResponse.setHeader('X-Elapsed-Ms', String(pCompletedContext.ElapsedMs || 0));
												pResponse.setHeader('Content-Type', 'application/octet-stream');

												let tmpReadStream = require('fs').createReadStream(tmpStagingFilePath);
												tmpReadStream.pipe(pResponse);
												tmpReadStream.on('end', function ()
												{
													return fNext();
												});
												tmpReadStream.on('error', function (pStreamError)
												{
													pResponse.send(500, { Error: 'Failed to stream result: ' + pStreamError.message });
													return fNext();
												});
												return;
											}

											// No binary result — return JSON metadata
											pResponse.send({
												Success: pCompletedContext.Status === 'Complete',
												RunHash: pCompletedContext.Hash,
												Status: pCompletedContext.Status,
												OperationState: pCompletedContext.OperationState,
												TaskOutputs: pCompletedContext.TaskOutputs,
												Output: pCompletedContext.Output,
												Errors: pCompletedContext.Errors,
												Log: pCompletedContext.Log,
												ElapsedMs: pCompletedContext.ElapsedMs
											});
											return fNext();
										}.bind(this));
								}.bind(this));
						}.bind(this));
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
						// Send a clean, JSON-serializable snapshot of the run
						// (the raw context may contain closures in PendingEvents)
						let tmpClean = {
							Hash: tmpRun.Hash,
							OperationHash: tmpRun.OperationHash,
							OperationName: tmpRun.OperationName,
							Status: tmpRun.Status,
							RunMode: tmpRun.RunMode,
							Live: tmpRun.Live || false,
							StartTime: tmpRun.StartTime,
							StopTime: tmpRun.StopTime,
							ElapsedMs: tmpRun.ElapsedMs,
							Output: tmpRun.Output || {},
							GlobalState: tmpRun.GlobalState || {},
							OperationState: tmpRun.OperationState || {},
							TaskOutputs: tmpRun.TaskOutputs || {},
							TaskManifests: tmpRun.TaskManifests || {},
							WaitingTasks: tmpRun.WaitingTasks || {},
							TimingSummary: tmpRun.TimingSummary || null,
							EventLog: tmpRun.EventLog || [],
							Errors: tmpRun.Errors || [],
							Log: tmpRun.Log || []
						};
						pResponse.send(tmpClean);
					}
					else
					{
						pResponse.send(404, { Error: `Manifest ${pRequest.params.RunHash} not found.` });
					}
					return fNext();
				}.bind(this)
			);

		// --- Abandon runs ---
		this._OratorServer.post
			(
				'/Manifest/:RunHash/Abandon',
				function (pRequest, pResponse, fNext)
				{
					let tmpManifest = this._getService('UltravisorExecutionManifest');
					if (!tmpManifest)
					{
						pResponse.send(500, { Error: 'Manifest service not available.' });
						return fNext();
					}

					let tmpResult = tmpManifest.abandonRun(pRequest.params.RunHash);
					if (tmpResult)
					{
						pResponse.send({ Status: tmpResult.Status, Hash: tmpResult.Hash });
					}
					else
					{
						pResponse.send(404, { Error: `Run ${pRequest.params.RunHash} not found.` });
					}
					return fNext();
				}.bind(this)
			);

		this._OratorServer.post
			(
				'/Manifest/AbandonStale',
				function (pRequest, pResponse, fNext)
				{
					let tmpManifest = this._getService('UltravisorExecutionManifest');
					if (!tmpManifest)
					{
						pResponse.send(500, { Error: 'Manifest service not available.' });
						return fNext();
					}

					let tmpCount = tmpManifest.abandonStaleRuns();
					pResponse.send({ AbandonedCount: tmpCount });
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

		// --- Force Error on a waiting task ---
		this._OratorServer.post
			(
				'/PendingInput/:RunHash/ForceError',
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

					tmpEngine.forceErrorOnWaitingTask(tmpRunHash, tmpBody.NodeHash,
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
								Errors: pContext.Errors
							});
							return fNext();
						});
				}.bind(this)
			);

		// --- Retry from checkpoint ---
		// Re-dispatches the failed node in a completed/errored operation.
		// All prior node outputs are preserved; only the failed node re-runs.
		this._OratorServer.post
			(
				'/Operation/:RunHash/Retry',
				function (pRequest, pResponse, fNext)
				{
					let tmpBody = pRequest.body || {};
					let tmpEngine = this._getService('UltravisorExecutionEngine');
					let tmpRunHash = pRequest.params.RunHash;

					tmpEngine.retryFromCheckpoint(tmpRunHash,
						{
							NodeHash: tmpBody.NodeHash || null,
							SettingsOverrides: tmpBody.SettingsOverrides || {}
						},
						function (pError, pContext)
						{
							if (pError)
							{
								pResponse.send(400, { Error: pError.message });
								return fNext();
							}
							pResponse.send({
								Success: true,
								Status: pContext.Status,
								Hash: pContext.Hash,
								RetryNode: tmpBody.NodeHash || '(auto-detected)',
								WaitingTasks: Object.keys(pContext.WaitingTasks || {})
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

		// --- Beacon Reachability Matrix (no auth – management UI) ---
		this._OratorServer.get
			(
				'/Beacon/Reachability',
				function (pRequest, pResponse, fNext)
				{
					let tmpReachability = this._getService('UltravisorBeaconReachability');
					if (!tmpReachability)
					{
						pResponse.send([]);
						return fNext();
					}

					pResponse.send(tmpReachability.getMatrix());
					return fNext();
				}.bind(this)
			);

		// --- Probe Beacon Reachability (no auth – management UI) ---
		this._OratorServer.post
			(
				'/Beacon/Reachability/Probe',
				function (pRequest, pResponse, fNext)
				{
					let tmpReachability = this._getService('UltravisorBeaconReachability');
					if (!tmpReachability)
					{
						pResponse.send(500, { Error: 'BeaconReachability service not available.' });
						return fNext();
					}

					tmpReachability.probeAllPairs(function (pError, pMatrix)
					{
						if (pError)
						{
							pResponse.send(500, { Error: pError.message });
							return fNext();
						}
						pResponse.send(pMatrix);
						return fNext();
					});
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
					if (tmpWorkItem)
					{
						this.log.info(`[Coordinator] Poll: beacon=${tmpBody.BeaconID} claimed work=${tmpWorkItem.WorkItemHash} capability=${tmpWorkItem.Capability} action=${tmpWorkItem.Action}`);
					}
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

		// --- Upload Binary Result ---
		this._OratorServer.post
			(
				'/Beacon/Work/:WorkItemHash/Upload',
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

					let tmpFilename = pRequest.headers['x-output-filename'] || 'output.bin';
					let tmpBody = pRequest.body;

					if (!tmpBody || !Buffer.isBuffer(tmpBody))
					{
						pResponse.send(400, { Error: 'Binary body required (Content-Type: application/octet-stream).' });
						return fNext();
					}

					this.log.info(`[Coordinator] Upload: work=${pRequest.params.WorkItemHash} filename=${tmpFilename} size=${tmpBody.length}`);

					let tmpResult = tmpCoordinator.recordResultUpload(pRequest.params.WorkItemHash, tmpFilename, tmpBody);

					if (!tmpResult)
					{
						pResponse.send(404, { Error: `Could not store upload for work item [${pRequest.params.WorkItemHash}].` });
						return fNext();
					}

					pResponse.send({ Success: true, FilePath: tmpResult.FilePath });
					return fNext();
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

		// --- Streaming Dispatch (binary-framed) ---
		this._OratorServer.post
			(
				'/Beacon/Work/DispatchStream',
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

					// Set up binary streaming response — bypass Restify formatters
					pResponse.writeHead(200, {
						'Content-Type': 'application/octet-stream',
						'Transfer-Encoding': 'chunked',
						'X-Ultravisor-Protocol': 'binary-frames-v1'
					});

					// Frame type codes:
					//   0x01 = Progress  (JSON payload)
					//   0x02 = Intermediate binary data (raw bytes)
					//   0x03 = Final binary output (raw bytes)
					//   0x04 = Result metadata (JSON payload)
					//   0x05 = Error (JSON payload)
					// Frame format: [1 byte type][4 bytes payload length (uint32 big-endian)][payload]

					let tmpStreamEnded = false;

					let tmpWriteFrame = function (pType, pData)
					{
						if (tmpStreamEnded) { return; }

						if (pType === 'end')
						{
							tmpStreamEnded = true;
							pResponse.end();
							return;
						}

						let tmpTypeCode;
						let tmpPayload;

						switch (pType)
						{
							case 'progress':
								tmpTypeCode = 0x01;
								tmpPayload = Buffer.from(JSON.stringify(pData));
								break;
							case 'data':
								tmpTypeCode = 0x02;
								tmpPayload = Buffer.isBuffer(pData) ? pData : Buffer.from(pData);
								break;
							case 'binary':
								tmpTypeCode = 0x03;
								tmpPayload = Buffer.isBuffer(pData) ? pData : Buffer.from(pData);
								break;
							case 'result':
								tmpTypeCode = 0x04;
								tmpPayload = Buffer.from(JSON.stringify(pData));
								break;
							case 'error':
								tmpTypeCode = 0x05;
								tmpPayload = Buffer.from(JSON.stringify(pData));
								break;
							default:
								return;
						}

						// Write frame: [type (1 byte)][length (4 bytes big-endian)][payload]
						let tmpHeader = Buffer.alloc(5);
						tmpHeader.writeUInt8(tmpTypeCode, 0);
						tmpHeader.writeUInt32BE(tmpPayload.length, 1);

						pResponse.write(tmpHeader);
						pResponse.write(tmpPayload);
					};

					let tmpWorkItemInfo = {
						Capability: tmpBody.Capability || 'Shell',
						Action: tmpBody.Action || 'Execute',
						Settings: tmpBody.Settings || {},
						AffinityKey: tmpBody.AffinityKey || '',
						TimeoutMs: tmpBody.TimeoutMs || 300000
					};

					tmpCoordinator.dispatchAndStream(tmpWorkItemInfo, tmpWriteFrame);
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
						BeaconCount: tmpBeacons.length,
						ActionCatalog: tmpCoordinator.getActionCatalog()
					});
					return fNext();
				}.bind(this)
			);

		// --- Action Catalog Introspection (no auth – management UI) ---
		this._OratorServer.get
			(
				'/Beacon/Actions',
				function (pRequest, pResponse, fNext)
				{
					let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
					if (!tmpCoordinator)
					{
						pResponse.send({ Actions: [] });
						return fNext();
					}

					let tmpCapability = pRequest.query && pRequest.query.Capability;
					let tmpActions = tmpCapability
						? tmpCoordinator.getActionCatalogForCapability(tmpCapability)
						: tmpCoordinator.getActionCatalog();

					pResponse.send({ Actions: tmpActions });
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

				// Attach WebSocket server for real-time execution events
				this._initializeWebSocket();

				return fCallback();
			}.bind(this));
	}

	// ====================================================================
	// WebSocket Server for Execution Events
	// ====================================================================

	/**
	 * Initialize a WebSocket server on the same HTTP server used by Restify.
	 * Clients connect and subscribe to a RunHash to receive real-time
	 * execution events (TaskStart, TaskComplete, TaskError, ExecutionComplete).
	 */
	_initializeWebSocket()
	{
		// The Restify server exposes the underlying Node.js http.Server
		let tmpHTTPServer = this._OratorServer.server.server;

		if (!tmpHTTPServer)
		{
			this.log.warn('Ultravisor WebSocket: could not access underlying HTTP server; WebSocket disabled.');
			return;
		}

		this._WebSocketServer = new libWebSocket.Server({ noServer: true });

		// Handle HTTP upgrade requests for WebSocket
		tmpHTTPServer.on('upgrade',
			function (pRequest, pSocket, pHead)
			{
				this._WebSocketServer.handleUpgrade(pRequest, pSocket, pHead,
					function (pWebSocket)
					{
						this._WebSocketServer.emit('connection', pWebSocket, pRequest);
					}.bind(this));
			}.bind(this));

		// Handle new WebSocket connections
		this._WebSocketServer.on('connection',
			function (pWebSocket)
			{
				pWebSocket._SubscribedRunHash = null;

				pWebSocket.on('message',
					function (pMessage, pIsBinary)
					{
						// Handle binary frames (result file uploads)
						if (pIsBinary && pWebSocket._PendingUpload)
						{
							let tmpUpload = pWebSocket._PendingUpload;
							pWebSocket._PendingUpload = null;

							let tmpBuffer = Buffer.isBuffer(pMessage) ? pMessage : Buffer.from(pMessage);
							let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
							if (tmpCoordinator)
							{
								let tmpResult = tmpCoordinator.recordResultUpload(tmpUpload.WorkItemHash, tmpUpload.OutputFilename, tmpBuffer);
								pWebSocket.send(JSON.stringify({
									Action: 'WorkResultUploadAck',
									WorkItemHash: tmpUpload.WorkItemHash,
									Success: !!tmpResult
								}));
							}
							return;
						}

						let tmpData;
						try
						{
							tmpData = JSON.parse(pMessage);
						}
						catch (pError)
						{
							return;
						}

						if (tmpData.Action === 'Subscribe' && tmpData.RunHash)
						{
							// --- Execution event subscription (web UI) ---
							this._unsubscribeClient(pWebSocket);
							pWebSocket._SubscribedRunHash = tmpData.RunHash;

							if (!this._WebSocketSubscriptions[tmpData.RunHash])
							{
								this._WebSocketSubscriptions[tmpData.RunHash] = new Set();
							}
							this._WebSocketSubscriptions[tmpData.RunHash].add(pWebSocket);
						}
						else if (tmpData.Action === 'Unsubscribe')
						{
							this._unsubscribeClient(pWebSocket);
						}
						else if (tmpData.Action === 'BeaconRegister')
						{
							// --- Beacon registration over WebSocket ---
							this._handleBeaconWSRegister(pWebSocket, tmpData);
						}
						else if (tmpData.Action === 'BeaconHeartbeat')
						{
							this._handleBeaconWSHeartbeat(tmpData);
						}
						else if (tmpData.Action === 'WorkComplete')
						{
							this._handleBeaconWSWorkComplete(tmpData);
						}
						else if (tmpData.Action === 'WorkError')
						{
							this._handleBeaconWSWorkError(tmpData);
						}
						else if (tmpData.Action === 'WorkProgress')
						{
							this._handleBeaconWSWorkProgress(tmpData);
						}
						else if (tmpData.Action === 'WorkResultUpload')
						{
							// Expect the next binary frame to be the file data
							pWebSocket._PendingUpload = {
								WorkItemHash: tmpData.WorkItemHash,
								OutputFilename: tmpData.OutputFilename,
								OutputSize: tmpData.OutputSize
							};
							this.log.info(`[Coordinator] WS: expecting binary upload for [${tmpData.WorkItemHash}] filename=${tmpData.OutputFilename} size=${tmpData.OutputSize}`);
						}
						else if (tmpData.Action === 'Deregister')
						{
							this._handleBeaconWSDeregister(pWebSocket, tmpData);
						}
					}.bind(this));

				pWebSocket.on('close',
					function ()
					{
						this._unsubscribeClient(pWebSocket);
						this._cleanupBeaconWS(pWebSocket);
					}.bind(this));
			}.bind(this));

		// Register an execution event listener on the manifest service
		let tmpManifestService = this._getService('UltravisorExecutionManifest');
		if (tmpManifestService)
		{
			tmpManifestService.addExecutionEventListener(
				this._onExecutionEvent.bind(this));
		}

		// Register the push handler on the beacon coordinator so it can
		// push work items directly to WebSocket-connected beacons
		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
		if (tmpCoordinator)
		{
			tmpCoordinator.setWorkItemPushHandler(
				this.pushWorkItemToBeacon.bind(this));
		}

		this.log.info('Ultravisor WebSocket: execution event WebSocket server initialized.');
	}

	/**
	 * Handle an execution event from the manifest service and broadcast
	 * it to all WebSocket clients subscribed to that RunHash.
	 *
	 * @param {string} pEventType - The event type (TaskStart, TaskComplete, etc.).
	 * @param {string} pRunHash - The execution run hash.
	 * @param {object} pEventData - The event data.
	 */
	_onExecutionEvent(pEventType, pRunHash, pEventData)
	{
		let tmpSubscribers = this._WebSocketSubscriptions[pRunHash];

		if (!tmpSubscribers || tmpSubscribers.size === 0)
		{
			return;
		}

		let tmpMessage = JSON.stringify({
			EventType: pEventType,
			RunHash: pRunHash,
			Data: pEventData
		});

		tmpSubscribers.forEach(
			function (pClient)
			{
				if (pClient.readyState === libWebSocket.OPEN)
				{
					pClient.send(tmpMessage);
				}
			});

		// Clean up subscription set when execution completes
		if (pEventType === 'ExecutionComplete')
		{
			delete this._WebSocketSubscriptions[pRunHash];
		}
	}

	/**
	 * Unsubscribe a WebSocket client from its current run.
	 *
	 * @param {WebSocket} pWebSocket - The client to unsubscribe.
	 */
	_unsubscribeClient(pWebSocket)
	{
		let tmpRunHash = pWebSocket._SubscribedRunHash;

		if (tmpRunHash && this._WebSocketSubscriptions[tmpRunHash])
		{
			this._WebSocketSubscriptions[tmpRunHash].delete(pWebSocket);

			if (this._WebSocketSubscriptions[tmpRunHash].size === 0)
			{
				delete this._WebSocketSubscriptions[tmpRunHash];
			}
		}

		pWebSocket._SubscribedRunHash = null;
	}

	// ====================================================================
	// WebSocket Beacon Handlers
	// ====================================================================

	/**
	 * Handle a beacon registration over WebSocket.
	 * Registers the beacon via the coordinator and maps its WebSocket.
	 */
	_handleBeaconWSRegister(pWebSocket, pData)
	{
		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
		if (!tmpCoordinator)
		{
			return;
		}

		// Diagnostic: log what we RECEIVED from the client before forwarding
		// to registerBeacon. If the client sent HostID but we're storing null,
		// this log line pins down exactly where the drop happens (client vs
		// server). Gated on LogNoisiness>=2 to stay quiet in production.
		let tmpNoisy = (this.fable && this.fable.LogNoisiness) || 0;
		if (tmpNoisy >= 2)
		{
			this.log.info(`[WSRegister] received from client: Name=${pData.Name} HostID=${pData.HostID || '(none)'} SharedMounts=${JSON.stringify(pData.SharedMounts || [])} Ops=${(pData.Operations || []).length}`);
		}

		// IMPORTANT: this enumeration must include every field the coordinator
		// cares about, including HostID and SharedMounts (used by the shared-fs
		// reachability auto-detect). Forgetting to forward a field here means
		// the WebSocket-registered beacon record will have that field set to
		// null/empty in the coordinator, even though the client sent the value.
		let tmpBeacon = tmpCoordinator.registerBeacon({
			Name: pData.Name,
			Capabilities: pData.Capabilities,
			ActionSchemas: pData.ActionSchemas,
			Operations: pData.Operations,
			MaxConcurrent: pData.MaxConcurrent,
			Tags: pData.Tags,
			Contexts: pData.Contexts,
			BindAddresses: pData.BindAddresses,
			HostID: pData.HostID,
			SharedMounts: pData.SharedMounts
		});

		// Diagnostic: confirm what was actually STORED on the beacon record.
		if (tmpNoisy >= 2)
		{
			this.log.info(`[WSRegister] stored beacon ${tmpBeacon.BeaconID}: HostID=${tmpBeacon.HostID || '(null)'} SharedMounts=${JSON.stringify(tmpBeacon.SharedMounts || [])}`);
		}

		pWebSocket._BeaconID = tmpBeacon.BeaconID;
		this._BeaconWebSockets[tmpBeacon.BeaconID] = pWebSocket;

		this.log.info(`Ultravisor WebSocket: beacon [${tmpBeacon.BeaconID}] "${pData.Name}" registered via WebSocket.`);

		// Send registration confirmation back
		if (pWebSocket.readyState === libWebSocket.OPEN)
		{
			pWebSocket.send(JSON.stringify({
				EventType: 'BeaconRegistered',
				BeaconID: tmpBeacon.BeaconID
			}));
		}
	}

	/**
	 * Handle a beacon heartbeat over WebSocket.
	 */
	_handleBeaconWSHeartbeat(pData)
	{
		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
		if (tmpCoordinator && pData.BeaconID)
		{
			tmpCoordinator.heartbeat(pData.BeaconID);
		}
	}

	/**
	 * Handle work item completion reported over WebSocket.
	 */
	_handleBeaconWSWorkComplete(pData)
	{
		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
		if (!tmpCoordinator || !pData.WorkItemHash)
		{
			return;
		}

		tmpCoordinator.completeWorkItem(pData.WorkItemHash,
			{ Outputs: pData.Outputs || {}, Log: pData.Log || [] },
			function (pError)
			{
				if (pError)
				{
					this.log.warn(`Ultravisor WebSocket: error completing work item [${pData.WorkItemHash}]: ${pError.message}`);
				}
			}.bind(this));
	}

	/**
	 * Handle work item error reported over WebSocket.
	 */
	_handleBeaconWSWorkError(pData)
	{
		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
		if (!tmpCoordinator || !pData.WorkItemHash)
		{
			return;
		}

		tmpCoordinator.failWorkItem(pData.WorkItemHash,
			{ ErrorMessage: pData.ErrorMessage || 'Unknown error', Log: pData.Log || [] },
			function (pError)
			{
				if (pError)
				{
					this.log.warn(`Ultravisor WebSocket: error failing work item [${pData.WorkItemHash}]: ${pError.message}`);
				}
			}.bind(this));
	}

	/**
	 * Handle work progress reported over WebSocket.
	 */
	_handleBeaconWSWorkProgress(pData)
	{
		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
		if (!tmpCoordinator || !pData.WorkItemHash)
		{
			return;
		}

		tmpCoordinator.updateProgress(pData.WorkItemHash, pData.ProgressData || {});
	}

	/**
	 * Handle beacon deregistration over WebSocket.
	 */
	_handleBeaconWSDeregister(pWebSocket, pData)
	{
		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
		if (tmpCoordinator && pData.BeaconID)
		{
			tmpCoordinator.deregisterBeacon(pData.BeaconID);
			this.log.info(`Ultravisor WebSocket: beacon [${pData.BeaconID}] deregistered.`);
		}

		delete this._BeaconWebSockets[pData.BeaconID];
		pWebSocket._BeaconID = null;

		if (pWebSocket.readyState === libWebSocket.OPEN)
		{
			pWebSocket.send(JSON.stringify({ EventType: 'Deregistered' }));
		}
	}

	/**
	 * Clean up beacon WebSocket state when a connection closes.
	 */
	_cleanupBeaconWS(pWebSocket)
	{
		let tmpBeaconID = pWebSocket._BeaconID;
		if (!tmpBeaconID)
		{
			return;
		}

		delete this._BeaconWebSockets[tmpBeaconID];
		pWebSocket._BeaconID = null;

		// Deregister the beacon from the coordinator
		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
		if (tmpCoordinator)
		{
			tmpCoordinator.deregisterBeacon(tmpBeaconID);
			this.log.info(`Ultravisor WebSocket: beacon [${tmpBeaconID}] disconnected and deregistered.`);
		}
	}

	/**
	 * Push a work item to a beacon connected via WebSocket.
	 *
	 * @param {string} pBeaconID - The target beacon ID.
	 * @param {object} pWorkItem - The work item to push.
	 * @returns {boolean} True if the work item was sent.
	 */
	pushWorkItemToBeacon(pBeaconID, pWorkItem)
	{
		let tmpWS = this._BeaconWebSockets[pBeaconID];
		if (!tmpWS || tmpWS.readyState !== libWebSocket.OPEN)
		{
			return false;
		}

		tmpWS.send(JSON.stringify({
			EventType: 'WorkItem',
			WorkItem: pWorkItem
		}));

		return true;
	}
}

module.exports = UltravisorAPIServer;
