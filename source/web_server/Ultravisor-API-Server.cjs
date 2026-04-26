const libPictService = require(`pict-serviceproviderbase`);

const libFS = require('fs');
const libPath = require('path');
const libCrypto = require('crypto');
const libOrator = require('orator');
const libOratorServiceServerRestify = require(`orator-serviceserver-restify`);
const libOratorAuthentication = require('orator-authentication');
const libWebSocket = require('ws');

// Strip a manifest down to the JSON-serializable shape the wire
// expects. The in-memory ExecutionContext can carry closures in
// PendingEvents and circular refs in WaitingTasks; this projection
// is what /Manifest/:RunHash has always returned. Used by both the
// in-memory and the bridge-backed read paths so callers see the
// same schema regardless of where the manifest came from.
function _cleanManifestForWire(pManifest)
{
	if (!pManifest) return null;
	return {
		Hash: pManifest.Hash,
		OperationHash: pManifest.OperationHash,
		OperationName: pManifest.OperationName,
		Status: pManifest.Status,
		RunMode: pManifest.RunMode,
		Live: pManifest.Live || false,
		StartTime: pManifest.StartTime,
		StopTime: pManifest.StopTime,
		ElapsedMs: pManifest.ElapsedMs,
		Output: pManifest.Output || {},
		GlobalState: pManifest.GlobalState || {},
		OperationState: pManifest.OperationState || {},
		TaskOutputs: pManifest.TaskOutputs || {},
		TaskManifests: pManifest.TaskManifests || {},
		WaitingTasks: pManifest.WaitingTasks || {},
		TimingSummary: pManifest.TimingSummary || null,
		EventLog: pManifest.EventLog || [],
		Errors: pManifest.Errors || [],
		Log: pManifest.Log || []
	};
}

// Lightweight query-string parser. Restify's queryParser plugin is
// not enabled on this server (mounting it would change the request
// shape for every existing handler), so the few routes that need
// query params parse the URL directly. Returns an empty object when
// no query string is present.
function _parseQueryString(pURL)
{
	if (!pURL) return {};
	let tmpQ = pURL.indexOf('?');
	if (tmpQ < 0) return {};
	let tmpStr = pURL.slice(tmpQ + 1);
	let tmpOut = {};
	let tmpPairs = tmpStr.split('&');
	for (let i = 0; i < tmpPairs.length; i++)
	{
		if (!tmpPairs[i]) continue;
		let tmpEq = tmpPairs[i].indexOf('=');
		let tmpKey, tmpVal;
		if (tmpEq < 0)
		{
			tmpKey = tmpPairs[i];
			tmpVal = '';
		}
		else
		{
			tmpKey = tmpPairs[i].slice(0, tmpEq);
			tmpVal = tmpPairs[i].slice(tmpEq + 1);
		}
		try { tmpKey = decodeURIComponent(tmpKey.replace(/\+/g, ' ')); }
		catch (e) { /* leave raw */ }
		try { tmpVal = decodeURIComponent(tmpVal.replace(/\+/g, ' ')); }
		catch (e) { /* leave raw */ }
		tmpOut[tmpKey] = tmpVal;
	}
	return tmpOut;
}

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
		// Set of WebSocket clients subscribed to the queue.* topic
		// (broadcast by UltravisorBeaconScheduler).
		this._QueueSubscribers = new Set();

		// Queue-event ring buffer for GUID-anchored catch-up replay.
		//
		// Every queue.* delta the scheduler emits gets stamped with an
		// EventGUID (immutable identity) + Seq (monotonic-per-process
		// ordering hint, NOT identity) and stored here. When a client
		// reconnects with {Action:"QueueSubscribe", LastEventGUID:X},
		// we replay everything after X.
		//
		// Seq alone can't be used for identity: it resets on process
		// restart, and a persistence beacon catching up from durable
		// history would have to reconcile with whatever Seq counter
		// happens to be running. EventGUID is the only stable handle.
		//
		// Snapshot/control frames (queue.summary, queue.replay_*,
		// queue.reset) get an EventGUID for wire consistency but are
		// NOT buffered — replaying a stale summary would briefly clobber
		// correct counts, and control frames are session-scoped.
		this._QueueEventBuffer = [];
		this._QueueEventBufferCap = 2000;
		this._QueueEventSeq = 0;

		// Manifest (per-RunHash execution event) catch-up buffers.
		//
		// Same EventGUID-anchored resync protocol as the queue side, but
		// with PER-RUN buffers instead of one global ring. A single ring
		// would either evict mid-run events (when many runs are active)
		// or be huge to compensate; per-run is cleaner because runs have
		// a clear lifecycle (created → events → ExecutionComplete →
		// dropped after a grace period). Per-run Seq counters also
		// surface gaps locally to clients ("I had Seq=7 then jumped to
		// Seq=10 — what happened to 8 and 9?") in a way a global Seq
		// shared across runs can't.
		//
		// Maps keyed by RunHash:
		//   _ManifestEventBuffers   — Array<envelope> per run
		//   _ManifestEventSeqs      — int counter per run
		//   _ManifestEventCleanupTimers — setTimeout handle per finalized run
		//
		// Buffers persist until grace period elapses after the
		// ExecutionComplete event, so a subscriber that reconnects
		// shortly after a run finishes can still get the full replay.
		this._ManifestEventBuffers = new Map();
		this._ManifestEventSeqs = new Map();
		this._ManifestEventCleanupTimers = new Map();
		this._ManifestEventBufferCapPerRun = 5000;
		this._ManifestEventGracePeriodMs = 5 * 60 * 1000;
	}

	// Topics that flow through the wire envelope but should NOT be
	// retained in the replay buffer. queue.summary is a snapshot
	// (replaying old ones would briefly show stale counts);
	// queue.replay_* and queue.reset are control frames meant for a
	// specific subscriber's resume cycle and don't belong in the
	// shared history.
	_isReplayableQueueTopic(pTopic)
	{
		if (pTopic === 'queue.summary') return false;
		if (pTopic === 'queue.replay_begin') return false;
		if (pTopic === 'queue.replay_complete') return false;
		if (pTopic === 'queue.reset') return false;
		return true;
	}

	// Find the buffer index of pGUID. Scans newest-first because the
	// common case is "client reconnected after a brief gap" — the
	// requested GUID is near the tail. Returns -1 when not found.
	_findQueueEventIndex(pGUID)
	{
		if (!pGUID) return -1;
		let tmpBuf = this._QueueEventBuffer;
		for (let i = tmpBuf.length - 1; i >= 0; i--)
		{
			if (tmpBuf[i].EventGUID === pGUID) return i;
		}
		return -1;
	}

	// Manifest analogs — the protocol is the same shape but the buffer
	// is partitioned by RunHash (see constructor).

	// Control event types are session-scoped and never buffered. They
	// also don't advance the per-run cursor (the cursor on the
	// browser side intentionally pins to the last "real" execution
	// event so a subsequent reconnect anchors against something the
	// server actually has in its buffer).
	_isReplayableExecutionEventType(pType)
	{
		if (pType === 'execution.replay_begin') return false;
		if (pType === 'execution.replay_complete') return false;
		if (pType === 'execution.reset') return false;
		return true;
	}

	_findManifestEventIndex(pRunHash, pGUID)
	{
		if (!pRunHash || !pGUID) return -1;
		let tmpBuf = this._ManifestEventBuffers.get(pRunHash);
		if (!tmpBuf) return -1;
		for (let i = tmpBuf.length - 1; i >= 0; i--)
		{
			if (tmpBuf[i].EventGUID === pGUID) return i;
		}
		return -1;
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
		// Reads merge two sources:
		//   - Live runs from the in-process UltravisorExecutionManifest
		//     service (in-memory, includes still-running operations).
		//   - Historical runs from the ManifestStore bridge (beacon when
		//     connected, on-disk fallback otherwise).
		// Dedup by Hash; live wins so an in-flight run doesn't get
		// replaced by a stale persisted snapshot.
		this._OratorServer.get
			(
				'/Manifest',
				function (pRequest, pResponse, fNext)
				{
					let tmpManifest = this._getService('UltravisorExecutionManifest');
					let tmpBridge = this._getService('UltravisorManifestStoreBridge');
					let tmpLiveRuns = tmpManifest ? (tmpManifest.listRuns() || []) : [];
					if (!tmpBridge)
					{
						pResponse.send(tmpLiveRuns);
						return fNext();
					}
					tmpBridge.listManifests({}).then((pHist) =>
					{
						let tmpHist = (pHist && pHist.Manifests) || [];
						let tmpSeen = new Set();
						let tmpOut = [];
						for (let i = 0; i < tmpLiveRuns.length; i++)
						{
							tmpSeen.add(tmpLiveRuns[i].Hash);
							tmpOut.push(tmpLiveRuns[i]);
						}
						for (let i = 0; i < tmpHist.length; i++)
						{
							if (!tmpSeen.has(tmpHist[i].Hash))
							{
								tmpOut.push(tmpHist[i]);
							}
						}
						pResponse.send(tmpOut);
						return fNext();
					}).catch(() =>
					{
						// Bridge failed — return whatever live data we have.
						pResponse.send(tmpLiveRuns);
						return fNext();
					});
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/Manifest/:RunHash',
				function (pRequest, pResponse, fNext)
				{
					let tmpHash = pRequest.params.RunHash;
					let tmpManifest = this._getService('UltravisorExecutionManifest');
					let tmpRun = tmpManifest ? tmpManifest.getRun(tmpHash) : null;
					if (tmpRun)
					{
						pResponse.send(_cleanManifestForWire(tmpRun));
						return fNext();
					}
					// Not in memory — try the bridge (beacon-backed history).
					let tmpBridge = this._getService('UltravisorManifestStoreBridge');
					if (!tmpBridge)
					{
						pResponse.send(404, { Error: `Manifest ${tmpHash} not found.` });
						return fNext();
					}
					tmpBridge.getManifest(tmpHash).then((pResult) =>
					{
						if (pResult && pResult.Success && pResult.Manifest)
						{
							pResponse.send(_cleanManifestForWire(pResult.Manifest));
						}
						else
						{
							pResponse.send(404, { Error: `Manifest ${tmpHash} not found.` });
						}
						return fNext();
					}).catch((pErr) =>
					{
						pResponse.send(500, { Error: 'Bridge read failed: ' + (pErr && pErr.message) });
						return fNext();
					});
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

		// --- Run Lifecycle: Start a hub-owned run ---
		this._OratorServer.post
			(
				'/Beacon/Run/Start',
				function (pRequest, pResponse, fNext)
				{
					let tmpSession = this._requireSession(pRequest, pResponse, fNext);
					if (!tmpSession) { return; }

					let tmpRunManager = this._getService('UltravisorBeaconRunManager');
					if (!tmpRunManager)
					{
						pResponse.send(500, { Error: 'BeaconRunManager service not available.' });
						return fNext();
					}

					let tmpBody = pRequest.body || {};
					let tmpIdempotency = pRequest.headers['x-idempotency-key'] || tmpBody.IdempotencyKey || '';

					let tmpRun = tmpRunManager.startRun({
						IdempotencyKey: tmpIdempotency,
						SubmitterTag: tmpBody.SubmitterTag || '',
						Metadata: tmpBody.Metadata || {}
					});

					pResponse.send({
						Success: true,
						RunID: tmpRun.RunID,
						State: tmpRun.State,
						StartedAt: tmpRun.StartedAt,
						IdempotencyKey: tmpRun.IdempotencyKey || ''
					});
					return fNext();
				}.bind(this)
			);

		// --- Run Lifecycle: End a run explicitly ---
		this._OratorServer.post
			(
				'/Beacon/Run/:RunID/End',
				function (pRequest, pResponse, fNext)
				{
					let tmpSession = this._requireSession(pRequest, pResponse, fNext);
					if (!tmpSession) { return; }

					let tmpRunManager = this._getService('UltravisorBeaconRunManager');
					if (!tmpRunManager)
					{
						pResponse.send(500, { Error: 'BeaconRunManager service not available.' });
						return fNext();
					}

					let tmpBody = pRequest.body || {};
					let tmpState = tmpBody.State || 'Ended';
					let tmpOK = tmpRunManager.endRun(pRequest.params.RunID, tmpState);
					if (!tmpOK)
					{
						pResponse.send(404, { Error: `Run [${pRequest.params.RunID}] not found.` });
						return fNext();
					}
					pResponse.send({ Success: true, RunID: pRequest.params.RunID, State: tmpState });
					return fNext();
				}.bind(this)
			);

		// --- Async Enqueue: returns the WorkItemHash immediately ---
		this._OratorServer.post
			(
				'/Beacon/Work/Enqueue',
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
					if (!tmpBody.Capability)
					{
						pResponse.send(400, { Error: 'Capability is required.' });
						return fNext();
					}

					// If the client didn't supply a RunID, mint one on the fly so
					// every enqueue ends up attached to a durable run record.
					let tmpRunID = tmpBody.RunID || '';
					if (!tmpRunID)
					{
						let tmpRunManager = this._getService('UltravisorBeaconRunManager');
						if (tmpRunManager)
						{
							let tmpIdempotency = pRequest.headers['x-idempotency-key'] || '';
							let tmpRun = tmpRunManager.startRun({
								IdempotencyKey: tmpIdempotency,
								SubmitterTag: tmpBody.SubmitterTag || '',
								Metadata: tmpBody.Metadata || {}
							});
							tmpRunID = tmpRun.RunID;
						}
					}

					let tmpWorkItemInfo = {
						RunID: tmpRunID,
						RunHash: tmpBody.RunHash || '',
						NodeHash: tmpBody.NodeHash || '',
						OperationHash: tmpBody.OperationHash || '',
						Capability: tmpBody.Capability,
						Action: tmpBody.Action || 'Execute',
						Settings: tmpBody.Settings || {},
						AffinityKey: tmpBody.AffinityKey || '',
						TimeoutMs: parseInt(tmpBody.TimeoutMs, 10) || 0,
						Priority: (tmpBody.Priority != null) ? parseInt(tmpBody.Priority, 10) : null
					};

					let tmpWorkItem = tmpCoordinator.enqueueWorkItem(tmpWorkItemInfo);
					pResponse.send({
						Success: true,
						RunID: tmpRunID,
						WorkItemHash: tmpWorkItem.WorkItemHash,
						Status: tmpWorkItem.Status,
						EnqueuedAt: tmpWorkItem.EnqueuedAt,
						Priority: tmpWorkItem.Priority
					});
					return fNext();
				}.bind(this)
			);

		// --- Work Item Cancellation ---
		this._OratorServer.post
			(
				'/Beacon/Work/:WorkItemHash/Cancel',
				function (pRequest, pResponse, fNext)
				{
					let tmpSession = this._requireSession(pRequest, pResponse, fNext);
					if (!tmpSession) { return; }

					let tmpScheduler = this._getService('UltravisorBeaconScheduler');
					if (!tmpScheduler)
					{
						pResponse.send(500, { Error: 'BeaconScheduler service not available.' });
						return fNext();
					}
					let tmpBody = pRequest.body || {};
					let tmpResult = tmpScheduler.requestCancel(pRequest.params.WorkItemHash,
						tmpBody.Reason || 'cancel requested');
					if (tmpResult.Error === 'not found')
					{
						pResponse.send(404, { Error: `Work item [${pRequest.params.WorkItemHash}] not found.` });
						return fNext();
					}
					pResponse.send(Object.assign({ Success: !tmpResult.Error, WorkItemHash: pRequest.params.WorkItemHash }, tmpResult));
					return fNext();
				}.bind(this)
			);

		// --- Work Item Reorder (Upcoming bucket) ---
		this._OratorServer.post
			(
				'/Beacon/Work/:WorkItemHash/Reorder',
				function (pRequest, pResponse, fNext)
				{
					let tmpSession = this._requireSession(pRequest, pResponse, fNext);
					if (!tmpSession) { return; }

					let tmpScheduler = this._getService('UltravisorBeaconScheduler');
					if (!tmpScheduler)
					{
						pResponse.send(500, { Error: 'BeaconScheduler service not available.' });
						return fNext();
					}
					let tmpBody = pRequest.body || {};
					let tmpDirection = tmpBody.Direction;
					if (tmpDirection !== 'up' && tmpDirection !== 'down')
					{
						pResponse.send(400, { Error: 'Direction must be "up" or "down".' });
						return fNext();
					}
					let tmpResult = tmpScheduler.reorderWorkItem(pRequest.params.WorkItemHash, tmpDirection);
					if (tmpResult.Error === 'not found')
					{
						pResponse.send(404, { Error: `Work item [${pRequest.params.WorkItemHash}] not found.` });
						return fNext();
					}
					if (!tmpResult.Reordered)
					{
						// 409 for "can't reorder in this state" (at edge, not Upcoming, etc.)
						pResponse.send(409, tmpResult);
						return fNext();
					}
					pResponse.send(Object.assign({ Success: true }, tmpResult));
					return fNext();
				}.bind(this)
			);

		// --- Per-Work-Item Event Log ---
		// Read-only — matches the no-auth precedent of /Beacon/Queue
		// and /Manifest/:hash. Retold-Labs proxies this for the /queue
		// drawer so the lab user can see what happened to a work item
		// without needing a separate ultravisor session. (Cancel and
		// Reorder, the state-changing siblings, still require a session.)
		this._OratorServer.get
			(
				'/Beacon/Work/:WorkItemHash/Events',
				function (pRequest, pResponse, fNext)
				{
					// Read via the persistence bridge — beacon-backed when
					// connected, local QueueStore otherwise. The bridge
					// returns {Available, Success, WorkItem|Events, Reason}
					// so we can distinguish "no backend at all" (503),
					// "unknown work item" (404), and success (200).
					let tmpBridge = this._getService('UltravisorQueuePersistenceBridge');
					if (!tmpBridge)
					{
						pResponse.send(503, { Error: 'QueuePersistenceBridge service not available.' });
						return fNext();
					}

					let tmpHash = pRequest.params.WorkItemHash;
					let tmpLimit = pRequest.query ? parseInt(pRequest.query.limit, 10) || 500 : 500;

					tmpBridge.getWorkItemByHash(tmpHash).then((pItemResult) =>
					{
						if (!pItemResult || !pItemResult.Available)
						{
							pResponse.send(503, { Error: 'No persistence backend available.' });
							return fNext();
						}
						if (!pItemResult.Success || !pItemResult.WorkItem)
						{
							pResponse.send(404, { Error: `Work item [${tmpHash}] not found.` });
							return fNext();
						}
						return tmpBridge.getEvents(tmpHash, tmpLimit).then((pEventsResult) =>
						{
							pResponse.send({
								WorkItemHash: tmpHash,
								Events: (pEventsResult && pEventsResult.Events) || []
							});
							return fNext();
						});
					}).catch((pErr) =>
					{
						pResponse.send(500, { Error: 'Bridge dispatch failed: ' + (pErr && pErr.message) });
						return fNext();
					});
				}.bind(this)
			);

		// --- Queue Snapshot (buckets + summary + items) ---
		this._OratorServer.get
			(
				'/Beacon/Queue',
				function (pRequest, pResponse, fNext)
				{
					let tmpScheduler = this._getService('UltravisorBeaconScheduler');
					let tmpSummary = tmpScheduler ? tmpScheduler.summarize() : null;
					// Restify's queryParser plugin isn't installed on this
					// server, so pRequest.query is undefined. Parse the URL
					// directly. Cheap, no dependency.
					let tmpQuery = _parseQueryString(pRequest.url || '');
					let tmpBucket = tmpQuery.bucket || null;
					let tmpLimit = parseInt(tmpQuery.limit, 10) || 200;

					let tmpItems = tmpScheduler ? tmpScheduler.listBuckets(tmpBucket, tmpLimit) : [];

					// History is opt-in via ?include=history. When opted in,
					// pull through the persistence bridge so a connected
					// QueuePersistence beacon owns the long-tail history view.
					let tmpWantsHistory = tmpQuery.include === 'history';
					if (!tmpWantsHistory)
					{
						pResponse.send({ Summary: tmpSummary, Items: tmpItems, History: null });
						return fNext();
					}
					let tmpBridge = this._getService('UltravisorQueuePersistenceBridge');
					if (!tmpBridge)
					{
						pResponse.send({ Summary: tmpSummary, Items: tmpItems, History: null });
						return fNext();
					}
					tmpBridge.listWorkItems({ Limit: tmpLimit, OrderBy: '-EnqueuedAt' })
						.then((pHistResult) =>
						{
							let tmpHistorical = (pHistResult && pHistResult.WorkItems) || null;
							pResponse.send({
								Summary: tmpSummary,
								Items: tmpItems,
								History: tmpHistorical
							});
							return fNext();
						})
						.catch(() =>
						{
							// Don't fail the whole snapshot if history
							// fetch errors — return what we have.
							pResponse.send({ Summary: tmpSummary, Items: tmpItems, History: null });
							return fNext();
						});
				}.bind(this)
			);

		// --- One-time admin bootstrap (no session required) ---
		// Body: {Token, UserSpec:{Username, Password, Roles?}}
		// Dispatches AUTH_BootstrapAdmin via the bridge. Intentionally
		// unauthenticated — the bootstrap is the chicken-and-egg path
		// for creating the very first admin in a fresh non-promiscuous
		// mesh, before any session exists. Defense in depth: the auth
		// beacon validates the token via constant-time compare AND
		// consumes it on first success, so brute-force or replay
		// attempts past the first hit fail.
		this._OratorServer.post
			(
				'/Beacon/BootstrapAdmin',
				function (pRequest, pResponse, fNext)
				{
					let tmpBridge = this._getService('UltravisorAuthBeaconBridge');
					if (!tmpBridge)
					{
						pResponse.send(503, { Success: false, Reason: 'AuthBeaconBridge not available' });
						return fNext();
					}
					if (!tmpBridge.isAvailable())
					{
						pResponse.send(503, { Success: false, Reason: 'No auth beacon connected' });
						return fNext();
					}
					let tmpBody = pRequest.body || {};
					tmpBridge.bootstrapAdmin(tmpBody.Token, tmpBody.UserSpec || {})
						.then((pResult) =>
						{
							let tmpStatus = (pResult && pResult.Success) ? 200 : 400;
							if (pResult && /not (supported|reachable)/i.test(pResult.Reason || ''))
							{
								tmpStatus = 503;
							}
							pResponse.send(tmpStatus, pResult || { Success: false });
							return fNext();
						})
						.catch((pErr) =>
						{
							pResponse.send(502,
							{
								Success: false,
								Error: 'Bootstrap dispatch failed',
								Reason: (pErr && pErr.message) || String(pErr)
							});
							return fNext();
						});
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

		// ────────────────────────────────────────────────────────────
		// Fleet management — per-(beacon, model) install/enable state
		// ────────────────────────────────────────────────────────────

		// GET /Fleet — full snapshot for the operator UI: beacons,
		// available models from registered catalogs, current
		// installations, runtime states, registered runtimes/catalogs.
		this._OratorServer.get
			(
				'/Fleet',
				function (pRequest, pResponse, fNext)
				{
					let tmpFleet = this._getService('UltravisorFleetManager');
					if (!tmpFleet)
					{
						pResponse.send(500, { Error: 'FleetManager service not available.' });
						return fNext();
					}
					try
					{
						pResponse.send(tmpFleet.getFleetSnapshot());
					}
					catch (pErr)
					{
						this.log.warn(`GET /Fleet failed: ${pErr.message}`);
						pResponse.send(500, { Error: pErr.message });
					}
					return fNext();
				}.bind(this)
			);

		// GET /Fleet/AvailableModels — just the model catalog, no beacons.
		this._OratorServer.get
			(
				'/Fleet/AvailableModels',
				function (pRequest, pResponse, fNext)
				{
					let tmpFleet = this._getService('UltravisorFleetManager');
					if (!tmpFleet)
					{
						pResponse.send(500, { Error: 'FleetManager service not available.' });
						return fNext();
					}
					try
					{
						let tmpMap = tmpFleet.scanAvailableModels();
						let tmpList = [];
						for (let tmpM of tmpMap.values())
						{
							tmpList.push({
								ModelKey: tmpM.ModelKey,
								ModelName: tmpM.ModelName,
								DisplayName: tmpM.DisplayName,
								CatalogName: tmpM.CatalogName,
								ModelSourceDir: tmpM.ModelSourceDir
							});
						}
						pResponse.send({ Models: tmpList });
					}
					catch (pErr)
					{
						pResponse.send(500, { Error: pErr.message });
					}
					return fNext();
				}.bind(this)
			);

		// GET /Fleet/Beacons/:BeaconID/Installations — per-beacon view.
		this._OratorServer.get
			(
				'/Fleet/Beacons/:BeaconID/Installations',
				function (pRequest, pResponse, fNext)
				{
					let tmpFleetStore = this._getService('UltravisorBeaconFleetStore');
					if (!tmpFleetStore)
					{
						pResponse.send(500, { Error: 'FleetStore service not available.' });
						return fNext();
					}
					try
					{
						let tmpBeaconID = pRequest.params.BeaconID;
						pResponse.send({
							BeaconID: tmpBeaconID,
							ModelInstallations: tmpFleetStore.listModelInstallations({ BeaconID: tmpBeaconID }),
							RuntimeInstallations: tmpFleetStore.listRuntimeInstallations({ BeaconID: tmpBeaconID })
						});
					}
					catch (pErr)
					{
						pResponse.send(500, { Error: pErr.message });
					}
					return fNext();
				}.bind(this)
			);

		// POST /Fleet/Install — body: { BeaconID, ModelKey, EnableAfterInstall? }
		this._OratorServer.post
			(
				'/Fleet/Install',
				function (pRequest, pResponse, fNext)
				{
					let tmpFleet = this._getService('UltravisorFleetManager');
					if (!tmpFleet)
					{
						pResponse.send(500, { Error: 'FleetManager service not available.' });
						return fNext();
					}
					let tmpBody = pRequest.body || {};
					if (!tmpBody.BeaconID || !tmpBody.ModelKey)
					{
						pResponse.send(400, { Error: 'BeaconID and ModelKey required.' });
						return fNext();
					}
					// Async fire-and-forget — operator polls the snapshot
					// for progress. Return immediately so the UI doesn't
					// block on a multi-GB push.
					tmpFleet.installModel(
						tmpBody.BeaconID, tmpBody.ModelKey,
						{ EnableAfterInstall: !!tmpBody.EnableAfterInstall })
						.catch((pErr) =>
						{
							this.log.warn(
								`POST /Fleet/Install threw async: ${pErr.message}`);
						});
					pResponse.send({
						Success: true,
						BeaconID: tmpBody.BeaconID,
						ModelKey: tmpBody.ModelKey,
						Status: 'queued',
						Message: 'Install initiated. Poll GET /Fleet for progress.'
					});
					return fNext();
				}.bind(this)
			);

		// POST /Fleet/Uninstall — body: { BeaconID, ModelKey }
		this._OratorServer.post
			(
				'/Fleet/Uninstall',
				function (pRequest, pResponse, fNext)
				{
					let tmpFleet = this._getService('UltravisorFleetManager');
					if (!tmpFleet)
					{
						pResponse.send(500, { Error: 'FleetManager service not available.' });
						return fNext();
					}
					let tmpBody = pRequest.body || {};
					if (!tmpBody.BeaconID || !tmpBody.ModelKey)
					{
						pResponse.send(400, { Error: 'BeaconID and ModelKey required.' });
						return fNext();
					}
					tmpFleet.uninstallModel(tmpBody.BeaconID, tmpBody.ModelKey)
						.then((pResult) =>
						{
							pResponse.send(Object.assign({
								Success: !pResult || pResult.Status === 'Success',
								BeaconID: tmpBody.BeaconID,
								ModelKey: tmpBody.ModelKey
							}, pResult || {}));
							return fNext();
						})
						.catch((pErr) =>
						{
							pResponse.send(500, { Error: pErr.message });
							return fNext();
						});
				}.bind(this)
			);

		// POST /Fleet/Enable — body: { BeaconID, ModelKey }
		this._OratorServer.post
			(
				'/Fleet/Enable',
				function (pRequest, pResponse, fNext)
				{
					let tmpFleet = this._getService('UltravisorFleetManager');
					if (!tmpFleet)
					{
						pResponse.send(500, { Error: 'FleetManager service not available.' });
						return fNext();
					}
					let tmpBody = pRequest.body || {};
					if (!tmpBody.BeaconID || !tmpBody.ModelKey)
					{
						pResponse.send(400, { Error: 'BeaconID and ModelKey required.' });
						return fNext();
					}
					try
					{
						let tmpRow = tmpFleet.enableModel(tmpBody.BeaconID, tmpBody.ModelKey);
						pResponse.send({ Success: true, Installation: tmpRow });
					}
					catch (pErr)
					{
						pResponse.send(500, { Error: pErr.message });
					}
					return fNext();
				}.bind(this)
			);

		// POST /Fleet/Disable — body: { BeaconID, ModelKey }
		this._OratorServer.post
			(
				'/Fleet/Disable',
				function (pRequest, pResponse, fNext)
				{
					let tmpFleet = this._getService('UltravisorFleetManager');
					if (!tmpFleet)
					{
						pResponse.send(500, { Error: 'FleetManager service not available.' });
						return fNext();
					}
					let tmpBody = pRequest.body || {};
					if (!tmpBody.BeaconID || !tmpBody.ModelKey)
					{
						pResponse.send(400, { Error: 'BeaconID and ModelKey required.' });
						return fNext();
					}
					try
					{
						let tmpRow = tmpFleet.disableModel(tmpBody.BeaconID, tmpBody.ModelKey);
						pResponse.send({ Success: true, Installation: tmpRow });
					}
					catch (pErr)
					{
						pResponse.send(500, { Error: pErr.message });
					}
					return fNext();
				}.bind(this)
			);

		// --- Persistence assignment (Session 3) ---
		// The lab POSTs an explicit persistence assignment to a running
		// UV; both bridges' setPersistenceAssignment fires their bootstrap
		// state machines if the chosen beacon is already Online. The GET
		// returns the merged Queue + Manifest status object the lab status
		// pill polls. See docs/features/persistence-via-databeacon.md.
		this._OratorServer.post
			(
				'/Ultravisor/Persistence/Assign',
				function (pRequest, pResponse, fNext)
				{
					let tmpSession = this._requireSession(pRequest, pResponse, fNext);
					if (tmpSession === null) return;

					let tmpQueueBridge = this._getService('UltravisorQueuePersistenceBridge');
					let tmpManifestBridge = this._getService('UltravisorManifestStoreBridge');
					if (!tmpQueueBridge || !tmpManifestBridge)
					{
						pResponse.send(502, { Error: 'Persistence bridges not available.' });
						return fNext();
					}

					let tmpBody = pRequest.body || {};
					let tmpBeaconID = (tmpBody.BeaconID === null || tmpBody.BeaconID === undefined) ? null : String(tmpBody.BeaconID);
					let tmpIDConn = parseInt(tmpBody.IDBeaconConnection, 10) || 0;

					try
					{
						if (!tmpBeaconID)
						{
							tmpQueueBridge.clearPersistenceAssignment();
							tmpManifestBridge.clearPersistenceAssignment();
						}
						else
						{
							tmpQueueBridge.setPersistenceAssignment(tmpBeaconID, tmpIDConn);
							tmpManifestBridge.setPersistenceAssignment(tmpBeaconID, tmpIDConn);
						}
					}
					catch (pErr)
					{
						pResponse.send(500, { Error: pErr.message || String(pErr) });
						return fNext();
					}

					pResponse.send(
					{
						Success: true,
						Queue: tmpQueueBridge.getPersistenceStatus(),
						Manifest: tmpManifestBridge.getPersistenceStatus()
					});
					return fNext();
				}.bind(this)
			);

		this._OratorServer.get
			(
				'/Ultravisor/Persistence/Status',
				function (pRequest, pResponse, fNext)
				{
					let tmpSession = this._requireSession(pRequest, pResponse, fNext);
					if (tmpSession === null) return;

					let tmpQueueBridge = this._getService('UltravisorQueuePersistenceBridge');
					let tmpManifestBridge = this._getService('UltravisorManifestStoreBridge');
					if (!tmpQueueBridge || !tmpManifestBridge)
					{
						pResponse.send(502, { Error: 'Persistence bridges not available.' });
						return fNext();
					}

					pResponse.send(
					{
						Queue: tmpQueueBridge.getPersistenceStatus(),
						Manifest: tmpManifestBridge.getPersistenceStatus()
					});
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
				this.fable.addServiceTypeIfNotExists('OratorAuthentication', libOratorAuthentication);

				// Wire orator-authentication's BeaconAuthenticator hook
				// at construction time — orator-auth installs the provider
				// in its constructor when this option is present, so we
				// don't need any setAuthenticator() call here. The
				// dispatcher is a thin wrapper around the bridge so that
				// orator-authentication itself stays free of any
				// ultravisor-specific imports.
				let tmpBeaconAuth =
				{
					Dispatcher: (pCapability, pAction, pSettings) =>
					{
						let tmpBridge = this._getService('UltravisorAuthBeaconBridge');
						if (!tmpBridge)
						{
							return Promise.resolve({ Outputs: { Success: false, Reason: 'No bridge' } });
						}
						// dispatchAction returns {Available, ...Outputs} —
						// wrap it in {Outputs:...} so the orator-auth
						// provider's response-shape parser unwraps cleanly
						// (it accepts either bare outputs or an Outputs
						// envelope, but the envelope is more honest about
						// where the data came from).
						return tmpBridge.dispatchAction(pAction, pSettings)
							.then((pResult) => ({ Outputs: pResult }));
					}
				};

				this._OratorAuth = this.fable.instantiateServiceProvider('OratorAuthentication',
					{
						RoutePrefix: '/1.0/',
						SessionTTL: this.fable.settings.UltravisorBeaconSessionTTLMs || 86400000,
						CookieHttpOnly: true,
						CookieSecure: false,
						BeaconAuthenticator: tmpBeaconAuth
					});
				this._OratorAuth.connectRoutes();
				this.log.info('Ultravisor: OratorAuthentication routes registered.');

				// User management routes — REST surface for the auth-beacon
				// AUTH_*User actions, gated by orator-auth sessions + a
				// configurable IsAdmin check. Mounted under the same /1.0/
				// prefix so login cookies cover both paths. The helper
				// itself lives in the auth-beacon module so any other
				// orator-auth consumer can use it (lab, content-system, ...).
				try
				{
					let libUserMgmtRoutes = require('ultravisor-auth-beacon/source/server-routes.cjs');
					libUserMgmtRoutes.mountUserManagementRoutes(this._OratorServer.server,
					{
						OratorAuth: this._OratorAuth,
						RoutePrefix: '/1.0/',
						Log: this.log,
						Dispatcher: (pAction, pSettings) =>
						{
							let tmpBridge = this._getService('UltravisorAuthBeaconBridge');
							if (!tmpBridge)
							{
								return Promise.resolve({ Success: false, Reason: 'No bridge' });
							}
							return tmpBridge.dispatchAction(pAction, pSettings);
						}
					});
				}
				catch (pUMError)
				{
					// Non-fatal: ultravisor still works without user-mgmt
					// routes. The auth flow still functions through
					// orator-auth + the bridge. Log loud so an operator
					// noticing missing /Users endpoints can find the cause.
					this.log.warn('Ultravisor: user-management route mount failed: '
						+ (pUMError && pUMError.message)
						+ ' — Login still works, user CRUD endpoints disabled.');
				}
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
							//
							// Mirrors the QueueSubscribe resync protocol:
							// callers that pass LastEventGUID get a
							// replay block (replay_begin / events after
							// that GUID, in order / replay_complete).
							// Callers that pass null/omit get today's
							// behavior — subscribe and resume the live
							// feed. If LastEventGUID isn't in our
							// per-run buffer (gap older than the buffer
							// or run finalized + dropped after grace),
							// emit execution.reset so the client falls
							// back to /Manifest/:RunHash.
							this._unsubscribeClient(pWebSocket);
							pWebSocket._SubscribedRunHash = tmpData.RunHash;

							if (!this._WebSocketSubscriptions[tmpData.RunHash])
							{
								this._WebSocketSubscriptions[tmpData.RunHash] = new Set();
							}
							this._WebSocketSubscriptions[tmpData.RunHash].add(pWebSocket);

							let tmpLastGUID = tmpData.LastEventGUID || null;
							if (tmpLastGUID)
							{
								let tmpIdx = this._findManifestEventIndex(
									tmpData.RunHash, tmpLastGUID);
								if (tmpIdx < 0)
								{
									this._sendManifestControlFrame(pWebSocket,
										'execution.reset', tmpData.RunHash,
										{ Reason: 'history-too-old', LastEventGUID: tmpLastGUID });
								}
								else
								{
									let tmpBuf = this._ManifestEventBuffers.get(tmpData.RunHash) || [];
									let tmpReplay = tmpBuf.slice(tmpIdx + 1);
									this._sendManifestControlFrame(pWebSocket,
										'execution.replay_begin', tmpData.RunHash,
										{ FromGUID: tmpLastGUID, Count: tmpReplay.length });
									for (let i = 0; i < tmpReplay.length; i++)
									{
										this._sendManifestEnvelope(pWebSocket, tmpReplay[i]);
									}
									let tmpThrough = tmpReplay.length
										? tmpReplay[tmpReplay.length - 1].EventGUID
										: tmpLastGUID;
									this._sendManifestControlFrame(pWebSocket,
										'execution.replay_complete', tmpData.RunHash,
										{ ThroughGUID: tmpThrough, Count: tmpReplay.length });
								}
							}
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
						else if (tmpData.Action === 'QueueSubscribe')
						{
							// QueueSubscribe doubles as a resync request:
							// callers that pass LastEventGUID get a
							// replay block (replay_begin / events after
							// that GUID, in order / replay_complete) BEFORE
							// the live summary push. Callers that pass
							// null (or omit it) get today's behavior — a
							// fresh summary with no replay.
							//
							// If the requested LastEventGUID isn't in our
							// ring buffer (gap older than the buffer,
							// process restarted, etc.), we emit
							// queue.reset so the client falls back to a
							// REST snapshot. The persistence-beacon
							// fallback for deeper history is the
							// bootstrap-flush task's territory.
							this._QueueSubscribers.add(pWebSocket);
							pWebSocket._QueueSubscribed = true;
							let tmpLastGUID = tmpData.LastEventGUID || null;
							if (tmpLastGUID)
							{
								let tmpIdx = this._findQueueEventIndex(tmpLastGUID);
								if (tmpIdx < 0)
								{
									// TODO(bootstrap-flush): before giving up,
									// query the queue persistence beacon for
									// events after pGUID and emit them here.
									// Today the in-process ring is the only
									// tier, so a miss = reset.
									this._sendQueueControlFrame(pWebSocket,
										'queue.reset',
										{ Reason: 'history-too-old', LastEventGUID: tmpLastGUID });
								}
								else
								{
									let tmpReplay = this._QueueEventBuffer.slice(tmpIdx + 1);
									this._sendQueueControlFrame(pWebSocket,
										'queue.replay_begin',
										{ FromGUID: tmpLastGUID, Count: tmpReplay.length });
									for (let i = 0; i < tmpReplay.length; i++)
									{
										this._sendQueueEnvelope(pWebSocket, tmpReplay[i]);
									}
									let tmpThrough = tmpReplay.length
										? tmpReplay[tmpReplay.length - 1].EventGUID
										: tmpLastGUID;
									this._sendQueueControlFrame(pWebSocket,
										'queue.replay_complete',
										{ ThroughGUID: tmpThrough, Count: tmpReplay.length });
								}
							}
							// Send current summary immediately so the UI
							// doesn't wait a full tick to populate. Stamp
							// it through the same envelope path so
							// LastEventGUID tracking on the client stays
							// monotone.
							let tmpSched = this._getService('UltravisorBeaconScheduler');
							if (tmpSched && typeof tmpSched.summarize === 'function')
							{
								try
								{
									let tmpSummaryEnv = this._stampQueueEvent(
										'queue.summary', tmpSched.summarize());
									this._sendQueueEnvelope(pWebSocket, tmpSummaryEnv);
								}
								catch (pErr) { /* ignore */ }
							}
						}
						else if (tmpData.Action === 'QueueUnsubscribe')
						{
							this._QueueSubscribers.delete(pWebSocket);
							pWebSocket._QueueSubscribed = false;
						}
					}.bind(this));

				pWebSocket.on('close',
					function ()
					{
						this._unsubscribeClient(pWebSocket);
						this._cleanupBeaconWS(pWebSocket);
						this._QueueSubscribers.delete(pWebSocket);
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

		// Wire the scheduler's broadcast hook to the queue.* WebSocket topic.
		let tmpScheduler = this._getService('UltravisorBeaconScheduler');
		if (tmpScheduler && typeof tmpScheduler.setBroadcastHandler === 'function')
		{
			tmpScheduler.setBroadcastHandler(
				this._broadcastQueueTopic.bind(this));
		}

		this.log.info('Ultravisor WebSocket: execution event WebSocket server initialized.');
	}

	/**
	 * Stamp a queue topic payload with an envelope and (when replayable)
	 * append it to the ring buffer. Returns the wire envelope so callers
	 * can serialize once and reuse the same frame for live + replay.
	 *
	 * The envelope shape is:
	 *   { Topic, Payload, EventGUID, Seq, EmittedAt }
	 *
	 * EventGUID is the durable identity (UUID v4); Seq is a per-process
	 * monotonic ordering hint that resets on restart and so cannot be
	 * trusted for dedup.
	 */
	_stampQueueEvent(pTopic, pPayload)
	{
		this._QueueEventSeq += 1;
		let tmpEnvelope =
		{
			Topic: pTopic,
			Payload: pPayload,
			EventGUID: libCrypto.randomUUID(),
			Seq: this._QueueEventSeq,
			EmittedAt: new Date().toISOString()
		};
		if (this._isReplayableQueueTopic(pTopic))
		{
			this._QueueEventBuffer.push(tmpEnvelope);
			if (this._QueueEventBuffer.length > this._QueueEventBufferCap)
			{
				this._QueueEventBuffer.splice(
					0, this._QueueEventBuffer.length - this._QueueEventBufferCap);
			}
		}
		return tmpEnvelope;
	}

	/**
	 * Fan out a queue.* topic payload to all subscribed WebSocket
	 * clients. Stamps the envelope first so the live feed and the
	 * replay buffer carry the same frame shape.
	 *
	 * @param {string} pTopic - e.g. "queue.enqueued" / "queue.dispatched" / ...
	 * @param {object} pPayload - topic-specific JSON body
	 */
	_broadcastQueueTopic(pTopic, pPayload)
	{
		// Always stamp — even if no current subscribers — so the buffer
		// captures history that a future reconnect can replay against.
		let tmpEnvelope = this._stampQueueEvent(pTopic, pPayload);
		if (!this._QueueSubscribers || this._QueueSubscribers.size === 0) return;
		let tmpMessage = JSON.stringify(tmpEnvelope);
		this._QueueSubscribers.forEach(
			function (pClient)
			{
				if (pClient.readyState === libWebSocket.OPEN)
				{
					try { pClient.send(tmpMessage); }
					catch (pErr) { /* best effort */ }
				}
			});
	}

	/**
	 * Send a stamped envelope to a single subscriber. Used by the
	 * replay path so the catch-up frames carry the same shape (and
	 * the same EventGUID) as the originals on the live feed.
	 */
	_sendQueueEnvelope(pClient, pEnvelope)
	{
		if (!pClient || pClient.readyState !== libWebSocket.OPEN) return;
		try { pClient.send(JSON.stringify(pEnvelope)); }
		catch (pErr) { /* best effort */ }
	}

	/**
	 * Emit a control frame (replay_begin / replay_complete / reset) to
	 * a single subscriber. Stamps the envelope so the wire shape is
	 * uniform, but skips the ring buffer per `_isReplayableQueueTopic`.
	 */
	_sendQueueControlFrame(pClient, pTopic, pPayload)
	{
		let tmpEnvelope = this._stampQueueEvent(pTopic, pPayload || {});
		this._sendQueueEnvelope(pClient, tmpEnvelope);
	}

	/**
	 * Stamp an execution event with the resync envelope (EventGUID,
	 * Seq, EmittedAt) and append it to the per-run buffer when the
	 * type is replayable. Returns the wire envelope so callers can
	 * broadcast the same frame to live subscribers.
	 *
	 * Per-run Seq is monotonic within a single run only; different
	 * runs have independent counters. EventGUID is globally unique
	 * (UUID v4) and is what survives across process restarts as the
	 * dedup key.
	 */
	_stampManifestEvent(pEventType, pRunHash, pData)
	{
		let tmpSeq = (this._ManifestEventSeqs.get(pRunHash) || 0) + 1;
		this._ManifestEventSeqs.set(pRunHash, tmpSeq);
		let tmpEnvelope =
		{
			EventType: pEventType,
			RunHash: pRunHash,
			Data: pData,
			EventGUID: libCrypto.randomUUID(),
			Seq: tmpSeq,
			EmittedAt: new Date().toISOString()
		};
		if (this._isReplayableExecutionEventType(pEventType))
		{
			let tmpBuf = this._ManifestEventBuffers.get(pRunHash);
			if (!tmpBuf)
			{
				tmpBuf = [];
				this._ManifestEventBuffers.set(pRunHash, tmpBuf);
			}
			tmpBuf.push(tmpEnvelope);
			if (tmpBuf.length > this._ManifestEventBufferCapPerRun)
			{
				tmpBuf.splice(0, tmpBuf.length - this._ManifestEventBufferCapPerRun);
			}
		}
		return tmpEnvelope;
	}

	/**
	 * Send a stamped envelope to a single subscriber. Used by both the
	 * live broadcast and the replay path.
	 */
	_sendManifestEnvelope(pClient, pEnvelope)
	{
		if (!pClient || pClient.readyState !== libWebSocket.OPEN) return;
		try { pClient.send(JSON.stringify(pEnvelope)); }
		catch (pErr) { /* best effort */ }
	}

	/**
	 * Emit a control frame (execution.replay_begin / replay_complete /
	 * reset) to a single subscriber. Stamped through the same envelope
	 * path so wire shape is uniform; gated out of the buffer by
	 * _isReplayableExecutionEventType.
	 */
	_sendManifestControlFrame(pClient, pEventType, pRunHash, pData)
	{
		let tmpEnvelope = this._stampManifestEvent(pEventType, pRunHash, pData || {});
		this._sendManifestEnvelope(pClient, tmpEnvelope);
	}

	/**
	 * Schedule a per-run buffer cleanup. Called once we see the
	 * terminal ExecutionComplete event for a run; the buffer survives
	 * the grace period so a subscriber that reconnects shortly after
	 * the run finishes can still pull the full event log.
	 *
	 * Re-arming is idempotent: if a cleanup is already scheduled (e.g.
	 * because of an earlier near-terminal event we treated as
	 * "probably the end"), the existing timer is replaced with a fresh
	 * one. Active runs that haven't finished never have a timer, so
	 * their buffers grow until ExecutionComplete arrives.
	 *
	 * Assumption: every run that emits any execution event also emits
	 * exactly one terminal ExecutionComplete. UltravisorExecutionManifest
	 * funnels success/error/abandon through finalizeExecution which
	 * unconditionally emits ExecutionComplete, so this holds. If a
	 * future code path bypasses finalizeExecution, that run's buffer
	 * will not be cleaned up — at which point either route the new
	 * code path through finalizeExecution, or add a periodic GC pass
	 * that drops buffers idle for >> _ManifestEventGracePeriodMs.
	 */
	_scheduleManifestBufferCleanup(pRunHash)
	{
		if (!pRunHash) return;
		let tmpExisting = this._ManifestEventCleanupTimers.get(pRunHash);
		if (tmpExisting) clearTimeout(tmpExisting);
		let tmpHandle = setTimeout(() =>
		{
			this._ManifestEventBuffers.delete(pRunHash);
			this._ManifestEventSeqs.delete(pRunHash);
			this._ManifestEventCleanupTimers.delete(pRunHash);
		}, this._ManifestEventGracePeriodMs);
		if (tmpHandle && typeof tmpHandle.unref === 'function')
		{
			tmpHandle.unref();
		}
		this._ManifestEventCleanupTimers.set(pRunHash, tmpHandle);
	}

	/**
	 * Handle an execution event from the manifest service: stamp the
	 * envelope (always — buffer captures history even when no live
	 * subscribers), then broadcast to subscribers of that RunHash.
	 *
	 * @param {string} pEventType - The event type (TaskStart, TaskComplete, ...).
	 * @param {string} pRunHash - The execution run hash.
	 * @param {object} pEventData - The event data.
	 */
	_onExecutionEvent(pEventType, pRunHash, pEventData)
	{
		// Always stamp so the buffer captures history a future
		// reconnect can replay against. Subscribers may be zero
		// today and present tomorrow.
		let tmpEnvelope = this._stampManifestEvent(pEventType, pRunHash, pEventData);

		let tmpSubscribers = this._WebSocketSubscriptions[pRunHash];
		if (tmpSubscribers && tmpSubscribers.size > 0)
		{
			let tmpMessage = JSON.stringify(tmpEnvelope);
			tmpSubscribers.forEach(
				function (pClient)
				{
					if (pClient.readyState === libWebSocket.OPEN)
					{
						pClient.send(tmpMessage);
					}
				});
		}

		// Terminal event: arm the per-run buffer cleanup grace timer
		// and drop the live-subscriber set (subscribers reconnecting
		// during the grace window will still get a fresh subscription
		// + replay of the recorded buffer). The buffer itself is
		// preserved until the timer fires.
		if (pEventType === 'ExecutionComplete')
		{
			this._scheduleManifestBufferCleanup(pRunHash);
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

		// Non-promiscuous-mode admission gate. In default (promiscuous)
		// mode the lambda below resolves true synchronously; in non-
		// promiscuous mode it dispatches to the auth beacon and resolves
		// asynchronously. Either way, registration only proceeds when
		// allowed.
		this._admitBeaconForRegistration(pData, (pError, pAdmitted, pRejectReason) =>
		{
			if (pError)
			{
				this.log.warn(`Ultravisor WebSocket: beacon "${pData.Name}" admission errored: ${pError.message || pError}`);
				this._rejectBeaconJoin(pWebSocket, 'Admission check failed: ' + (pError.message || pError));
				return;
			}
			if (!pAdmitted)
			{
				this.log.warn(`Ultravisor WebSocket: beacon "${pData.Name}" rejected by admission gate: ${pRejectReason || 'denied'}`);
				this._rejectBeaconJoin(pWebSocket, pRejectReason || 'Beacon admission denied');
				return;
			}
			this._completeBeaconWSRegister(pWebSocket, pData, tmpCoordinator);
		});
	}

	/**
	 * Finish a WS beacon registration after the admission gate has
	 * passed. Split out from _handleBeaconWSRegister so the gate can
	 * short-circuit cleanly without nesting the success path inside
	 * a callback that's also responsible for failure handling.
	 */
	_completeBeaconWSRegister(pWebSocket, pData, pCoordinator)
	{
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
		let tmpBeacon = pCoordinator.registerBeacon({
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
	 * Decide whether a beacon may join the mesh. Three modes, in order:
	 *
	 *   1. Promiscuous (default) — always admit. Same behavior the hub
	 *      had before the auth beacon work; nothing on the wire changes
	 *      and existing deployments need no config update.
	 *
	 *   2. Non-promiscuous + this is the auth beacon's own join — accept
	 *      iff the JoinSecret matches `UltravisorBootstrapAuthSecret`
	 *      from config. We cannot consult the auth beacon to validate
	 *      itself (chicken-and-egg), so the bootstrap secret is the one
	 *      "trust me, I'm authorized" credential the hub keeps locally.
	 *      A beacon counts as "the auth beacon" when it advertises the
	 *      Authentication capability AND no other auth beacon is
	 *      currently registered.
	 *
	 *   3. Non-promiscuous + any other beacon — dispatch
	 *      AUTH_ValidateBeaconJoin to the live auth beacon via the
	 *      bridge. If the bridge isn't available (no auth beacon
	 *      connected yet) we fail closed: better to reject a real beacon
	 *      than to admit an attacker during a bootstrap window.
	 *
	 * The callback is invoked exactly once: (pError, pAdmitted, pReason).
	 */
	_admitBeaconForRegistration(pData, fCallback)
	{
		// Config keys live in fable.ProgramConfiguration (gathered from
		// .ultravisor.json + DefaultProgramConfiguration). fable.settings
		// is a separate, mostly-empty bag that some legacy code reads —
		// don't be fooled by either pattern in nearby files.
		let tmpConfig = (this.fable && this.fable.ProgramConfiguration) || {};
		let tmpNonPromiscuous = !!tmpConfig.UltravisorNonPromiscuous;
		if (this.fable && this.fable.LogNoisiness >= 1)
		{
			this.log.info(`[Admission] beacon "${pData.Name}" caps=[${(pData.Capabilities||[]).join(',')}] joinSecret=${pData.JoinSecret ? '(present)' : '(none)'} nonPromiscuous=${tmpNonPromiscuous}`);
		}
		if (!tmpNonPromiscuous)
		{
			return fCallback(null, true);
		}

		let tmpCaps = Array.isArray(pData.Capabilities) ? pData.Capabilities : [];
		let tmpClaimsAuth = tmpCaps.indexOf('Authentication') >= 0;
		let tmpJoinSecret = pData.JoinSecret || '';

		// Bootstrap path: this beacon claims Authentication AND no auth
		// beacon is registered yet. Compare against the local
		// UltravisorBootstrapAuthSecret using a constant-time compare
		// so timing differences can't leak the secret.
		let tmpBridge = this._getService('UltravisorAuthBeaconBridge');
		let tmpAuthAlreadyConnected = tmpBridge && tmpBridge.isAvailable();
		if (tmpClaimsAuth && !tmpAuthAlreadyConnected)
		{
			let tmpExpected = tmpConfig.UltravisorBootstrapAuthSecret || '';
			if (!tmpExpected)
			{
				return fCallback(null, false,
					'Non-promiscuous mode requires UltravisorBootstrapAuthSecret in config');
			}
			if (!this._constantTimeEqual(tmpJoinSecret, tmpExpected))
			{
				return fCallback(null, false, 'Bootstrap auth secret mismatch');
			}
			return fCallback(null, true);
		}

		// Standard path: ask the auth beacon to validate this join.
		if (!tmpBridge || !tmpAuthAlreadyConnected)
		{
			return fCallback(null, false,
				'No auth beacon connected; cannot validate beacon join in non-promiscuous mode');
		}
		tmpBridge.validateBeaconJoin(pData.Name || '', tmpJoinSecret, tmpCaps).then((pResult) =>
		{
			if (pResult && pResult.Available && pResult.Allowed)
			{
				return fCallback(null, true);
			}
			let tmpReason = (pResult && (pResult.Reason || pResult.Error))
				|| 'Auth beacon denied beacon join';
			return fCallback(null, false, tmpReason);
		}).catch((pErr) => fCallback(pErr));
	}

	/**
	 * Send an explicit rejection frame and close the socket so the
	 * client knows it was denied (vs. a generic disconnect that looks
	 * like a transient network blip and triggers exponential reconnect).
	 */
	_rejectBeaconJoin(pWebSocket, pReason)
	{
		if (pWebSocket && pWebSocket.readyState === libWebSocket.OPEN)
		{
			try
			{
				pWebSocket.send(JSON.stringify({
					EventType: 'BeaconRejected',
					Reason: pReason || 'Beacon admission denied'
				}));
			}
			catch (pErr) { /* socket dying — close handler will clean up */ }
			try { pWebSocket.close(4403, 'Beacon admission denied'); }
			catch (pErr) { /* ignore */ }
		}
	}

	/**
	 * Constant-time string compare via crypto.timingSafeEqual on
	 * Buffers of equal length. Pads/diffs unequal-length inputs as
	 * "not equal" without revealing length difference timing.
	 */
	_constantTimeEqual(pA, pB)
	{
		let tmpA = Buffer.from(String(pA || ''), 'utf8');
		let tmpB = Buffer.from(String(pB || ''), 'utf8');
		if (tmpA.length !== tmpB.length) return false;
		try { return libCrypto.timingSafeEqual(tmpA, tmpB); }
		catch (pErr) { return false; }
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
