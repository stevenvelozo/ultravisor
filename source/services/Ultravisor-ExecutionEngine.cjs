const libPictService = require('pict-serviceproviderbase');

/**
 * Event-driven graph executor for Ultravisor operations.
 *
 * Replaces the old sequential task runner. Processes an operation's directed
 * graph by following event connections between task nodes. State connections
 * are resolved just-in-time when a task is triggered.
 */
class UltravisorExecutionEngine extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.serviceType = 'UltravisorExecutionEngine';
	}

	/**
	 * Append a timestamped entry to the execution context log and the fable logger.
	 *
	 * @param {object} pContext - The execution context.
	 * @param {string} pMessage - The log message.
	 * @param {string} [pLevel] - Log level: 'info' (default), 'warn', 'error', 'trace'.
	 */
	_log(pContext, pMessage, pLevel)
	{
		let tmpLevel = pLevel || 'info';
		pContext.Log.push(`[${new Date().toISOString()}] ${pMessage}`);
		this.log[tmpLevel](`ExecutionEngine [${pContext.OperationHash || '?'}]: ${pMessage}`);
	}

	/**
	 * Execute an operation by its definition.
	 *
	 * @param {object} pOperationDefinition - The operation definition with Graph.
	 * @param {object} [pInitialState] - Optional initial state overrides:
	 *   GlobalState    {object} - seed values for global state
	 *   OperationState {object} - seed values for operation state
	 *   RunMode        {string} - 'production' | 'standard' | 'debug'
	 * @param {function} fCallback - function(pError, pExecutionContext)
	 */
	executeOperation(pOperationDefinition, pInitialState, fCallback)
	{
		if (typeof(pInitialState) === 'function')
		{
			fCallback = pInitialState;
			pInitialState = {};
		}

		if (!pOperationDefinition || !pOperationDefinition.Graph)
		{
			return fCallback(new Error('ExecutionEngine: operation definition must have a Graph.'));
		}

		let tmpInitialState = pInitialState || {};

		// Get services
		let tmpManifestService = this.fable.servicesMap['UltravisorExecutionManifest']
			? Object.values(this.fable.servicesMap['UltravisorExecutionManifest'])[0]
			: null;

		if (!tmpManifestService)
		{
			return fCallback(new Error('ExecutionEngine: UltravisorExecutionManifest service not found.'));
		}

		// Create execution context with staging folder
		let tmpContext = tmpManifestService.createExecutionContext(
			pOperationDefinition, tmpInitialState.RunMode);

		// Seed initial state
		if (tmpInitialState.GlobalState && typeof(tmpInitialState.GlobalState) === 'object')
		{
			Object.assign(tmpContext.GlobalState, tmpInitialState.GlobalState);
		}
		if (tmpInitialState.OperationState && typeof(tmpInitialState.OperationState) === 'object')
		{
			Object.assign(tmpContext.OperationState, tmpInitialState.OperationState);
		}
		if (pOperationDefinition.InitialGlobalState && typeof(pOperationDefinition.InitialGlobalState) === 'object')
		{
			// Operation-level defaults (overridden by runtime initial state)
			let tmpKeys = Object.keys(pOperationDefinition.InitialGlobalState);
			for (let i = 0; i < tmpKeys.length; i++)
			{
				if (!tmpContext.GlobalState.hasOwnProperty(tmpKeys[i]))
				{
					tmpContext.GlobalState[tmpKeys[i]] = pOperationDefinition.InitialGlobalState[tmpKeys[i]];
				}
			}
		}
		if (pOperationDefinition.InitialOperationState && typeof(pOperationDefinition.InitialOperationState) === 'object')
		{
			let tmpKeys = Object.keys(pOperationDefinition.InitialOperationState);
			for (let i = 0; i < tmpKeys.length; i++)
			{
				if (!tmpContext.OperationState.hasOwnProperty(tmpKeys[i]))
				{
					tmpContext.OperationState[tmpKeys[i]] = pOperationDefinition.InitialOperationState[tmpKeys[i]];
				}
			}
		}

		// Store the graph for lookup
		tmpContext._Graph = pOperationDefinition.Graph;
		tmpContext._NodeMap = this._buildNodeMap(pOperationDefinition.Graph);
		tmpContext._PortLabelMap = this._buildPortLabelMap(pOperationDefinition.Graph);
		tmpContext._ConnectionMap = this._buildConnectionMap(
			pOperationDefinition.Graph, tmpContext._NodeMap, tmpContext._PortLabelMap);

		// Mark as running
		tmpContext.Status = 'Running';
		tmpContext.StartTime = new Date().toISOString();
		this._log(tmpContext, `Operation [${pOperationDefinition.Hash}] started.`);

		// Find Start node and enqueue its output events
		let tmpStartNode = this._findStartNode(tmpContext);

		if (!tmpStartNode)
		{
			tmpContext.Status = 'Error';
			this._log(tmpContext, 'No Start node found in the graph.');
			tmpManifestService.finalizeExecution(tmpContext);
			return fCallback(new Error('No Start node found in the graph.'), tmpContext);
		}

		// Fire all outgoing event connections from the Start node.
		// Start nodes have a single output, so we enqueue all downstream targets
		// without filtering on port name (avoids label vs hash naming mismatches).
		this._enqueueAllDownstreamEvents(tmpStartNode.Hash, tmpContext);

		// Process the event queue
		this._processEventQueue(tmpContext,
			(pError) =>
			{
				if (pError)
				{
					this._log(tmpContext, `Execution error: ${pError.message}`, 'error');
					tmpContext.Errors.push({
						NodeHash: null,
						Message: pError.message,
						Timestamp: new Date().toISOString()
					});
				}

				tmpManifestService.finalizeExecution(tmpContext);
				return fCallback(null, tmpContext);
			});
	}

	/**
	 * Start an operation asynchronously and return the execution context
	 * immediately (before any tasks execute).
	 *
	 * The caller receives the context with Status='Running' and a Hash that
	 * can be used to poll the manifest for progress updates. The event queue
	 * is processed on the next tick of the event loop.
	 *
	 * @param {object} pOperationDefinition - The operation definition with Graph.
	 * @param {object} [pInitialState] - Optional initial state overrides.
	 * @param {function} fCallback - function(pError, pExecutionContext) called immediately.
	 */
	startOperationAsync(pOperationDefinition, pInitialState, fCallback)
	{
		if (typeof(pInitialState) === 'function')
		{
			fCallback = pInitialState;
			pInitialState = {};
		}

		if (!pOperationDefinition || !pOperationDefinition.Graph)
		{
			return fCallback(new Error('ExecutionEngine: operation definition must have a Graph.'));
		}

		let tmpInitialState = pInitialState || {};

		// Get services
		let tmpManifestService = this.fable.servicesMap['UltravisorExecutionManifest']
			? Object.values(this.fable.servicesMap['UltravisorExecutionManifest'])[0]
			: null;

		if (!tmpManifestService)
		{
			return fCallback(new Error('ExecutionEngine: UltravisorExecutionManifest service not found.'));
		}

		// Create execution context with staging folder
		let tmpContext = tmpManifestService.createExecutionContext(
			pOperationDefinition, tmpInitialState.RunMode);

		// Seed initial state
		if (tmpInitialState.GlobalState && typeof(tmpInitialState.GlobalState) === 'object')
		{
			Object.assign(tmpContext.GlobalState, tmpInitialState.GlobalState);
		}
		if (tmpInitialState.OperationState && typeof(tmpInitialState.OperationState) === 'object')
		{
			Object.assign(tmpContext.OperationState, tmpInitialState.OperationState);
		}
		if (pOperationDefinition.InitialGlobalState && typeof(pOperationDefinition.InitialGlobalState) === 'object')
		{
			let tmpKeys = Object.keys(pOperationDefinition.InitialGlobalState);
			for (let i = 0; i < tmpKeys.length; i++)
			{
				if (!tmpContext.GlobalState.hasOwnProperty(tmpKeys[i]))
				{
					tmpContext.GlobalState[tmpKeys[i]] = pOperationDefinition.InitialGlobalState[tmpKeys[i]];
				}
			}
		}
		if (pOperationDefinition.InitialOperationState && typeof(pOperationDefinition.InitialOperationState) === 'object')
		{
			let tmpKeys = Object.keys(pOperationDefinition.InitialOperationState);
			for (let i = 0; i < tmpKeys.length; i++)
			{
				if (!tmpContext.OperationState.hasOwnProperty(tmpKeys[i]))
				{
					tmpContext.OperationState[tmpKeys[i]] = pOperationDefinition.InitialOperationState[tmpKeys[i]];
				}
			}
		}

		// Store the graph for lookup
		tmpContext._Graph = pOperationDefinition.Graph;
		tmpContext._NodeMap = this._buildNodeMap(pOperationDefinition.Graph);
		tmpContext._PortLabelMap = this._buildPortLabelMap(pOperationDefinition.Graph);
		tmpContext._ConnectionMap = this._buildConnectionMap(
			pOperationDefinition.Graph, tmpContext._NodeMap, tmpContext._PortLabelMap);

		// Mark as running
		tmpContext.Status = 'Running';
		tmpContext.StartTime = new Date().toISOString();
		this._log(tmpContext, `Operation [${pOperationDefinition.Hash}] started (async).`);
		this.log.info(`[Engine] startOperationAsync: run=${tmpContext.Hash} operation="${pOperationDefinition.Hash}" nodeCount=${pOperationDefinition.Graph.Nodes ? pOperationDefinition.Graph.Nodes.length : 0}`);

		// Find Start node and enqueue its output events
		let tmpStartNode = this._findStartNode(tmpContext);

		if (!tmpStartNode)
		{
			tmpContext.Status = 'Error';
			this._log(tmpContext, 'No Start node found in the graph.');
			tmpManifestService.finalizeExecution(tmpContext);
			return fCallback(new Error('No Start node found in the graph.'), tmpContext);
		}

		this._enqueueAllDownstreamEvents(tmpStartNode.Hash, tmpContext);

		// Defer execution to the next tick so the caller gets the context immediately
		let tmpSelf = this;
		process.nextTick(function()
		{
			tmpSelf._processEventQueue(tmpContext,
				function(pError)
				{
					if (pError)
					{
						tmpSelf._log(tmpContext, `Execution error: ${pError.message}`, 'error');
						tmpContext.Errors.push({
							NodeHash: null,
							Message: pError.message,
							Timestamp: new Date().toISOString()
						});
					}

					tmpManifestService.finalizeExecution(tmpContext);
				});
		});

		// Return immediately with the running context
		return fCallback(null, tmpContext);
	}

	// ====================================================================
	// Graph Context Rebuild (for disk-loaded manifests)
	// ====================================================================

	/**
	 * Rebuild the runtime graph structures on a disk-loaded execution context.
	 * After this call, the context has _Graph, _NodeMap, _PortLabelMap, and
	 * _ConnectionMap — enough for resumeOperation() and forceErrorOnWaitingTask()
	 * to work.
	 *
	 * @param {object} pContext - The disk-loaded execution context
	 * @param {object} pOperationDefinition - The operation definition with Graph
	 */
	_rebuildGraphContext(pContext, pOperationDefinition)
	{
		pContext._Graph = pOperationDefinition.Graph;
		pContext._NodeMap = this._buildNodeMap(pOperationDefinition.Graph);
		pContext._PortLabelMap = this._buildPortLabelMap(pOperationDefinition.Graph);
		pContext._ConnectionMap = this._buildConnectionMap(
			pOperationDefinition.Graph, pContext._NodeMap, pContext._PortLabelMap);
		pContext.Live = true;
	}

	/**
	 * Resume all WaitingForInput runs loaded from disk.
	 * Called once at startup after loadRecentManifests() and operation
	 * definitions are available.
	 *
	 * For each disk-loaded WaitingForInput run with non-empty WaitingTasks:
	 *   1. Looks up the operation definition
	 *   2. Rebuilds graph structures on the context
	 *   3. Marks as Live so the UI shows Watch/Awaiting/Force Error buttons
	 *
	 * Also marks stale Running operations as Error since their in-flight
	 * tasks cannot be recovered.
	 */
	resumeWaitingRuns()
	{
		let tmpManifestService = this._getManifestService();
		if (!tmpManifestService)
		{
			return;
		}

		let tmpStateService = this.fable.servicesMap['UltravisorHypervisorState']
			? Object.values(this.fable.servicesMap['UltravisorHypervisorState'])[0]
			: null;

		if (!tmpStateService)
		{
			return;
		}

		let tmpRuns = tmpManifestService.listRuns();
		let tmpResumedCount = 0;
		let tmpErroredCount = 0;

		for (let i = 0; i < tmpRuns.length; i++)
		{
			let tmpRun = tmpRuns[i];

			// Resume WaitingForInput runs
			if (tmpRun.Status === 'WaitingForInput' && !tmpRun.Live)
			{
				if (!tmpRun.WaitingTasks || Object.keys(tmpRun.WaitingTasks).length === 0)
				{
					continue;
				}

				// Look up the operation definition
				let tmpOperation = tmpStateService.getOperationSync(tmpRun.OperationHash);
				if (!tmpOperation || !tmpOperation.Graph)
				{
					this.log.warn(`ExecutionEngine: cannot resume run [${tmpRun.Hash}] — operation [${tmpRun.OperationHash}] not found.`);
					continue;
				}

				// Get the full context
				let tmpContext = tmpManifestService.getRun(tmpRun.Hash);
				if (!tmpContext)
				{
					continue;
				}

				// Rebuild graph structures so resume/forceError work
				this._rebuildGraphContext(tmpContext, tmpOperation);

				this.log.info(`ExecutionEngine: resumed waiting run [${tmpRun.Hash}] for operation [${tmpRun.OperationName || tmpRun.OperationHash}]`);
				tmpResumedCount++;
			}

			// Mark stale Running operations as Error
			if (tmpRun.Status === 'Running' && !tmpRun.Live)
			{
				let tmpContext = tmpManifestService.getRun(tmpRun.Hash);
				if (tmpContext)
				{
					tmpContext.Status = 'Error';
					tmpContext.Errors.push({
						NodeHash: null,
						Message: 'Operation was running when server stopped. Execution cannot be resumed.',
						Timestamp: new Date().toISOString()
					});
					tmpContext.StopTime = new Date().toISOString();

					// Re-write the manifest with the error status
					if (tmpContext.StagingPath)
					{
						tmpManifestService._writeManifest(tmpContext, tmpContext.StagingPath);
					}

					this.log.warn(`ExecutionEngine: marked stale run [${tmpRun.Hash}] as Error (was Running when server stopped).`);
					tmpErroredCount++;
				}
			}
		}

		if (tmpResumedCount > 0)
		{
			this.log.info(`ExecutionEngine: resumed ${tmpResumedCount} waiting operation(s) from disk.`);
		}
		if (tmpErroredCount > 0)
		{
			this.log.info(`ExecutionEngine: marked ${tmpErroredCount} stale running operation(s) as Error.`);
		}
	}

	/**
	 * Resume a paused operation after a value-input task receives input.
	 *
	 * @param {string} pRunHash - The execution run hash.
	 * @param {string} pNodeHash - The waiting task node hash.
	 * @param {*} pValue - The provided value.
	 * @param {function} fCallback - function(pError, pExecutionContext)
	 */
	resumeOperation(pRunHash, pNodeHash, pValue, fCallback)
	{
		this.log.info(`[Engine] resumeOperation: run=${pRunHash} node=${pNodeHash} valueKeys=${pValue ? Object.keys(pValue).join(',') : '(null)'}`);
		let tmpManifestService = this.fable.servicesMap['UltravisorExecutionManifest']
			? Object.values(this.fable.servicesMap['UltravisorExecutionManifest'])[0]
			: null;

		if (!tmpManifestService)
		{
			return fCallback(new Error('ExecutionEngine: UltravisorExecutionManifest service not found.'));
		}

		let tmpContext = tmpManifestService.getRun(pRunHash);

		if (!tmpContext)
		{
			return fCallback(new Error(`ExecutionEngine: run [${pRunHash}] not found.`));
		}

		if (tmpContext.Status !== 'WaitingForInput')
		{
			return fCallback(new Error(`ExecutionEngine: run [${pRunHash}] is not waiting for input (status: ${tmpContext.Status}).`));
		}

		let tmpWaitingInfo = tmpContext.WaitingTasks[pNodeHash];

		if (!tmpWaitingInfo)
		{
			return fCallback(new Error(`ExecutionEngine: node [${pNodeHash}] is not waiting for input.`));
		}

		// Get the StateManager to write the value
		let tmpStateManager = this._getStateManager();

		// Write the value to the specified output address
		if (tmpWaitingInfo.OutputAddress)
		{
			tmpStateManager.setAddress(tmpWaitingInfo.OutputAddress, pValue, tmpContext, pNodeHash);
		}

		// Store in task outputs
		if (!tmpContext.TaskOutputs[pNodeHash])
		{
			tmpContext.TaskOutputs[pNodeHash] = {};
		}

		// If pValue is a structured object, merge all keys into TaskOutputs (beacon results)
		// If pValue is a scalar, store as InputValue (backward compat for value-input)
		if (typeof pValue === 'object' && pValue !== null && !Array.isArray(pValue))
		{
			Object.assign(tmpContext.TaskOutputs[pNodeHash], pValue);
		}
		else
		{
			tmpContext.TaskOutputs[pNodeHash].InputValue = pValue;
		}

		// Update the task's ElapsedMs to include the time spent waiting for input
		let tmpTaskManifest = tmpContext.TaskManifests[pNodeHash];
		if (tmpTaskManifest && tmpTaskManifest.Executions && tmpTaskManifest.Executions.length > 0)
		{
			let tmpExecution = tmpTaskManifest.Executions[tmpTaskManifest.Executions.length - 1];
			let tmpNow = Date.now();
			// Recompute elapsed from original start to now (includes the wait period)
			if (tmpExecution.StartTimeMs)
			{
				tmpExecution.StopTimeMs = tmpNow;
				tmpExecution.StopTime = new Date(tmpNow).toISOString();
				tmpExecution.ElapsedMs = tmpNow - tmpExecution.StartTimeMs;
			}
		}

		// Remove from waiting list
		delete tmpContext.WaitingTasks[pNodeHash];

		// Fire the completion event (custom resume event for beacon-dispatch, default for value-input)
		let tmpResumeEvent = tmpWaitingInfo.ResumeEventName || 'ValueInputComplete';
		tmpContext.Status = 'Running';
		this._log(tmpContext, `Input received for node [${pNodeHash}], resuming execution (event: ${tmpResumeEvent}).`);

		this._enqueueDownstreamEvents(pNodeHash, tmpResumeEvent, tmpContext);

		// Process the event queue
		this._processEventQueue(tmpContext,
			(pError) =>
			{
				if (pError)
				{
					this._log(tmpContext, `Execution error after resume: ${pError.message}`, 'error');
				}
				tmpManifestService.finalizeExecution(tmpContext);
				return fCallback(null, tmpContext);
			});
	}

	/**
	 * Force-error a waiting task so the operation continues on the Error path.
	 *
	 * Used when a beacon task is stuck or a user wants to abort a waiting
	 * task without providing input.  The task's Error event is fired so
	 * downstream error-handling nodes can run.
	 *
	 * @param {string} pRunHash - The execution run hash.
	 * @param {string} pNodeHash - The waiting task node hash.
	 * @param {function} fCallback - function(pError, pExecutionContext)
	 */
	forceErrorOnWaitingTask(pRunHash, pNodeHash, fCallback)
	{
		let tmpManifestService = this.fable.servicesMap['UltravisorExecutionManifest']
			? Object.values(this.fable.servicesMap['UltravisorExecutionManifest'])[0]
			: null;

		if (!tmpManifestService)
		{
			return fCallback(new Error('ExecutionEngine: UltravisorExecutionManifest service not found.'));
		}

		let tmpContext = tmpManifestService.getRun(pRunHash);

		if (!tmpContext)
		{
			return fCallback(new Error(`ExecutionEngine: run [${pRunHash}] not found.`));
		}

		if (tmpContext.Status !== 'WaitingForInput')
		{
			return fCallback(new Error(`ExecutionEngine: run [${pRunHash}] is not waiting for input (status: ${tmpContext.Status}).`));
		}

		let tmpWaitingInfo = tmpContext.WaitingTasks[pNodeHash];

		if (!tmpWaitingInfo)
		{
			return fCallback(new Error(`ExecutionEngine: node [${pNodeHash}] is not waiting for input.`));
		}

		this._log(tmpContext, `Task [${pNodeHash}] force-errored by user while waiting.`, 'warn');

		// Set error outputs for this task
		if (!tmpContext.TaskOutputs[pNodeHash])
		{
			tmpContext.TaskOutputs[pNodeHash] = {};
		}
		tmpContext.TaskOutputs[pNodeHash].Error = 'Force-errored while waiting';
		tmpContext.TaskOutputs[pNodeHash].ForceErrored = true;

		// Record the error in the task manifest
		let tmpTaskManifest = tmpContext.TaskManifests[pNodeHash];
		if (tmpTaskManifest && tmpTaskManifest.Executions && tmpTaskManifest.Executions.length > 0)
		{
			let tmpExecution = tmpTaskManifest.Executions[tmpTaskManifest.Executions.length - 1];
			let tmpNow = Date.now();
			tmpExecution.Status = 'Error';
			tmpExecution.StopTimeMs = tmpNow;
			tmpExecution.StopTime = new Date(tmpNow).toISOString();
			if (tmpExecution.StartTimeMs)
			{
				tmpExecution.ElapsedMs = tmpNow - tmpExecution.StartTimeMs;
			}
		}

		// Remove from waiting list
		delete tmpContext.WaitingTasks[pNodeHash];

		// Fire the Error event so the operation continues on the error path
		tmpContext.Status = 'Running';

		this._enqueueDownstreamEvents(pNodeHash, 'Error', tmpContext);

		// Process the event queue
		this._processEventQueue(tmpContext,
			(pError) =>
			{
				if (pError)
				{
					this._log(tmpContext, `Execution error after force-error: ${pError.message}`, 'error');
				}
				tmpManifestService.finalizeExecution(tmpContext);
				return fCallback(null, tmpContext);
			});
	}

	// ====================================================================
	// Internal: Event Queue Processing
	// ====================================================================

	/**
	 * Process events from the queue until it is empty.
	 *
	 * @param {object} pContext - The execution context.
	 * @param {function} fCallback - Called when queue is empty or operation is paused.
	 */
	_processEventQueue(pContext, fCallback)
	{
		if (pContext.PendingEvents.length === 0)
		{
			// Check if we're waiting for input
			if (Object.keys(pContext.WaitingTasks).length > 0)
			{
				pContext.Status = 'WaitingForInput';
				this._log(pContext, 'Operation paused: waiting for user input.');
			}
			return fCallback(null);
		}

		// Dequeue the next event
		let tmpEvent = pContext.PendingEvents.shift();
		this.log.info(`[Engine] processEventQueue: run=${pContext.Hash} dequeued event="${tmpEvent.EventName}" → node=${tmpEvent.TargetNodeHash} (${pContext.PendingEvents.length} remaining)`);

		let tmpDequeueManifest = this._getManifestService();
		if (tmpDequeueManifest)
		{
			tmpDequeueManifest.recordEvent(pContext, tmpEvent.TargetNodeHash, 'EventDequeued',
				`Dequeued [${tmpEvent.EventName}] for [${tmpEvent.TargetNodeHash}]`, 1);
		}

		this._executeTaskForEvent(tmpEvent.TargetNodeHash, tmpEvent.EventName, pContext,
			(pError) =>
			{
				if (pError)
				{
					this._log(pContext, `Error processing event [${tmpEvent.EventName}] on node [${tmpEvent.TargetNodeHash}]: ${pError.message}`, 'error');
					// Continue processing other events despite errors
				}

				// Recurse to process next event
				this._processEventQueue(pContext, fCallback);
			});
	}

	/**
	 * Execute a task node in response to an incoming event.
	 *
	 * @param {string} pNodeHash - The target node hash.
	 * @param {string} pEventName - The event that triggered this execution.
	 * @param {object} pContext - The execution context.
	 * @param {function} fCallback - Called when task execution is complete.
	 */
	_executeTaskForEvent(pNodeHash, pEventName, pContext, fCallback)
	{
		this.log.info(`[Engine] executeTask: run=${pContext.Hash} node=${pNodeHash} event="${pEventName}"`);
		let tmpNode = pContext._NodeMap[pNodeHash];

		if (!tmpNode)
		{
			this._log(pContext, `Node [${pNodeHash}] not found in graph.`, 'error');
			return fCallback(null);
		}

		// Handle built-in End node
		if (tmpNode.Type === 'end')
		{
			this._log(pContext, `Reached End node [${pNodeHash}].`);
			return fCallback(null);
		}

		// Handle built-in Start node (shouldn't be a target, but handle gracefully)
		if (tmpNode.Type === 'start')
		{
			return fCallback(null);
		}

		// Find the task type
		let tmpRegistry = this._getTaskTypeRegistry();

		if (!tmpRegistry)
		{
			return fCallback(new Error('TaskTypeRegistry service not found.'));
		}

		let tmpDefinitionHash = tmpNode.DefinitionHash || tmpNode.Type;
		let tmpDefinition = tmpRegistry.getDefinition(tmpDefinitionHash);

		if (!tmpDefinition)
		{
			this._log(pContext, `Unknown task type [${tmpDefinitionHash}] for node [${pNodeHash}].`, 'error');
			return fCallback(null);
		}

		// Resolve incoming state connections
		let tmpResolvedSettings = this._resolveStateConnections(pNodeHash, tmpNode, pContext);

		// Get the manifest service for recording
		let tmpManifestService = this._getManifestService();
		if (tmpManifestService)
		{
			tmpManifestService.recordTaskStart(pContext, pNodeHash, pEventName, {
				DefinitionHash: tmpDefinitionHash,
				TaskTypeName: tmpDefinition.Name || '',
				Category: tmpDefinition.Category || '',
				Capability: tmpDefinition.Capability || '',
				Action: tmpDefinition.Action || '',
				Tier: tmpDefinition.Tier || ''
			});
			tmpManifestService.recordEvent(pContext, pNodeHash, 'TaskStart',
				`Executing [${pNodeHash}] (${tmpDefinition.Name || tmpDefinitionHash}) triggered by [${pEventName}]`, 0);
		}

		this._log(pContext, `Executing node [${pNodeHash}] (${tmpDefinition.Name}) triggered by [${pEventName}]`);

		// Create task instance and execute
		let tmpTaskInstance = tmpRegistry.instantiateTaskType(tmpDefinitionHash);

		if (!tmpTaskInstance)
		{
			this._log(pContext, `Failed to instantiate task type [${tmpDefinitionHash}].`, 'error');
			return fCallback(null);
		}

		// Build the per-task execution context
		let tmpTaskContext = {
			GlobalState: pContext.GlobalState,
			OperationState: pContext.OperationState,
			TaskOutputs: pContext.TaskOutputs,
			StagingPath: pContext.StagingPath,
			OperationHash: pContext.OperationHash,
			NodeHash: pNodeHash,
			RunHash: pContext.Hash,
			RunMode: pContext.RunMode,
			StateManager: this._getStateManager(),
			TriggeringEventName: pEventName
		};

		// Build the fFireIntermediateEvent function for re-entrant tasks
		let fFireIntermediateEvent = (pIntermediateEventName, pIntermediateOutputs, fResumeCallback) =>
		{
			// Record the intermediate event
			if (tmpManifestService)
			{
				tmpManifestService.recordEvent(pContext, pNodeHash, 'IntermediateEvent',
					`Intermediate event [${pIntermediateEventName}] from [${pNodeHash}]`, 1);
			}

			// Store the intermediate outputs
			if (!pContext.TaskOutputs[pNodeHash])
			{
				pContext.TaskOutputs[pNodeHash] = {};
			}
			Object.assign(pContext.TaskOutputs[pNodeHash], pIntermediateOutputs);

			// Find downstream nodes for this intermediate event
			let tmpDownstreamEvents = this._getDownstreamEvents(pNodeHash, pIntermediateEventName, pContext);

			if (tmpDownstreamEvents.length === 0)
			{
				// No downstream connections for this event
				return fResumeCallback();
			}

			// Process the downstream sub-graph synchronously
			let tmpSubIndex = 0;

			let fProcessNextDownstream = () =>
			{
				if (tmpSubIndex >= tmpDownstreamEvents.length)
				{
					return fResumeCallback();
				}

				let tmpDownstreamEvent = tmpDownstreamEvents[tmpSubIndex];
				tmpSubIndex++;

				this._executeTaskForEvent(tmpDownstreamEvent.TargetNodeHash, tmpDownstreamEvent.EventName, pContext,
					(pError) =>
					{
						if (pError)
						{
							this._log(pContext, `Error in sub-graph: ${pError.message}`, 'error');
						}

						// Also process any events that were enqueued during sub-graph execution
						this._drainEventsForSubgraph(pContext, () =>
						{
							fProcessNextDownstream();
						});
					});
			};

			fProcessNextDownstream();
		};

		// Execute the task
		this.log.info(`[Engine] executeTask: running task type="${tmpNode.Type}" node=${pNodeHash}`);
		tmpTaskInstance.execute(tmpResolvedSettings, tmpTaskContext, (pError, pResult) =>
		{
			if (pError)
			{
				this.log.warn(`[Engine] executeTask: TASK ERROR node=${pNodeHash}: ${pError.message}`);
				this._log(pContext, `Task [${pNodeHash}] error: ${pError.message}`, 'error');
				if (tmpManifestService)
				{
					tmpManifestService.recordTaskError(pContext, pNodeHash, pError);
					tmpManifestService.recordEvent(pContext, pNodeHash, 'TaskError',
						`Error in [${pNodeHash}]: ${pError.message}`, 0);
				}

				// Fire error event if the task has one
				this._enqueueDownstreamEvents(pNodeHash, 'Error', pContext);
				return fCallback(null);
			}

			if (!pResult)
			{
				this._log(pContext, `Task [${pNodeHash}] returned no result.`, 'warn');
				return fCallback(null);
			}

			this.log.info(`[Engine] executeTask: task completed node=${pNodeHash} event="${pResult.EventToFire || '(none)'}" waitingForInput=${!!pResult.WaitingForInput} outputs=${JSON.stringify(Object.keys(pResult.Outputs || {}))}`);

			// Check for WaitingForInput (value-input or beacon-dispatch task)
			if (pResult.WaitingForInput)
			{
				pContext.WaitingTasks[pNodeHash] = {
					PromptMessage: pResult.PromptMessage || '',
					OutputAddress: pResult.OutputAddress || '',
					ResumeEventName: pResult.ResumeEventName || '',
					Timestamp: new Date().toISOString()
				};
				this._log(pContext, `Task [${pNodeHash}] is waiting for input (resume event: ${pResult.ResumeEventName || 'ValueInputComplete'}).`);
				if (tmpManifestService)
				{
					tmpManifestService.recordTaskComplete(pContext, pNodeHash, pResult);
					// Checkpoint: persist state so WaitingForInput survives restart
					if (pContext.StagingPath)
					{
						tmpManifestService._writeManifest(pContext, pContext.StagingPath);
					}
				}
				return fCallback(null);
			}

			// Store outputs in TaskOutputs
			if (pResult.Outputs && typeof(pResult.Outputs) === 'object')
			{
				if (!pContext.TaskOutputs[pNodeHash])
				{
					pContext.TaskOutputs[pNodeHash] = {};
				}
				Object.assign(pContext.TaskOutputs[pNodeHash], pResult.Outputs);
			}

			// Store any state writes from the result
			if (pResult.StateWrites && typeof(pResult.StateWrites) === 'object')
			{
				let tmpStateManager = this._getStateManager();
				let tmpWriteKeys = Object.keys(pResult.StateWrites);
				for (let i = 0; i < tmpWriteKeys.length; i++)
				{
					tmpStateManager.setAddress(tmpWriteKeys[i], pResult.StateWrites[tmpWriteKeys[i]],
						pContext, pNodeHash);
				}
			}

			// Determine if this result is an error event
			let tmpIsErrorResult = false;
			if (pResult.EventToFire && tmpDefinition && Array.isArray(tmpDefinition.EventOutputs))
			{
				for (let e = 0; e < tmpDefinition.EventOutputs.length; e++)
				{
					if (tmpDefinition.EventOutputs[e].Name === pResult.EventToFire
						&& tmpDefinition.EventOutputs[e].IsError)
					{
						tmpIsErrorResult = true;
						break;
					}
				}
			}

			// Log task messages
			if (Array.isArray(pResult.Log))
			{
				let tmpLogLevel = tmpIsErrorResult ? 'error' : 'trace';
				for (let i = 0; i < pResult.Log.length; i++)
				{
					this._log(pContext, `  [${pNodeHash}] ${pResult.Log[i]}`, tmpLogLevel);
				}
			}

			// Record completion and checkpoint state
			if (tmpManifestService)
			{
				tmpManifestService.recordTaskComplete(pContext, pNodeHash, pResult);
				tmpManifestService.recordEvent(pContext, pNodeHash, 'TaskComplete',
					`Completed [${pNodeHash}] -> ${pResult.EventToFire || 'no event'}`, 0);

				// Checkpoint: persist current state after each task so at most
				// we lose the currently-executing task on crash
				if (pContext.StagingPath)
				{
					tmpManifestService._writeManifest(pContext, pContext.StagingPath);
				}
			}

			// Fire the output event (enqueue downstream tasks)
			if (pResult.EventToFire)
			{
				let tmpQueueLenBefore = pContext.PendingEvents.length;
				this._enqueueDownstreamEvents(pNodeHash, pResult.EventToFire, pContext);
				let tmpHandled = pContext.PendingEvents.length > tmpQueueLenBefore;

				// Record an unhandled error on the context when no downstream
				// error handler is connected.
				if (tmpIsErrorResult && !tmpHandled)
				{
					let tmpErrorMessage = (Array.isArray(pResult.Log) && pResult.Log.length > 0)
						? pResult.Log.join('; ')
						: `Task [${pNodeHash}] fired error event.`;
					pContext.Errors.push({
						NodeHash: pNodeHash,
						Message: tmpErrorMessage,
						Timestamp: new Date().toISOString()
					});
				}
			}
			else if (tmpIsErrorResult)
			{
				// Error result with no EventToFire — still record the error
				let tmpErrorMessage = (Array.isArray(pResult.Log) && pResult.Log.length > 0)
					? pResult.Log.join('; ')
					: `Task [${pNodeHash}] fired error event.`;
				pContext.Errors.push({
					NodeHash: pNodeHash,
					Message: tmpErrorMessage,
					Timestamp: new Date().toISOString()
				});
			}

			return fCallback(null);
		},
		fFireIntermediateEvent);
	}

	// ====================================================================
	// Internal: State Connection Resolution
	// ====================================================================

	/**
	 * Resolve all incoming state connections for a node, producing merged settings.
	 *
	 * @param {string} pNodeHash - The target node hash.
	 * @param {object} pNode - The node definition from the graph.
	 * @param {object} pContext - The execution context.
	 * @returns {object} The resolved settings object.
	 */
	_resolveStateConnections(pNodeHash, pNode, pContext)
	{
		// Start with a copy of the node's static settings
		// Nodes may store config in Settings or Data (flow editor uses Data)
		let tmpSettings = {};

		if (pNode.Data && typeof(pNode.Data) === 'object')
		{
			tmpSettings = JSON.parse(JSON.stringify(pNode.Data));
		}
		if (pNode.Settings && typeof(pNode.Settings) === 'object')
		{
			Object.assign(tmpSettings, JSON.parse(JSON.stringify(pNode.Settings)));
		}

		// Find all incoming State connections targeting this node
		let tmpStateConnections = pContext._ConnectionMap.stateTargets[pNodeHash] || [];
		let tmpStateManager = this._getStateManager();
		let tmpPortLabelMap = pContext._PortLabelMap;

		for (let i = 0; i < tmpStateConnections.length; i++)
		{
			let tmpConn = tmpStateConnections[i];

			// Get the source port name
			let tmpSourcePortName = this._extractPortName(tmpConn.SourcePortHash, tmpPortLabelMap);
			let tmpTargetPortName = this._extractPortName(tmpConn.TargetPortHash, tmpPortLabelMap);

			// Read the source value from the source node's outputs
			let tmpSourceNodeOutputs = pContext.TaskOutputs[tmpConn.SourceNodeHash] || {};
			let tmpSourceValue = tmpSourceNodeOutputs[tmpSourcePortName];

			// Apply template if defined
			if (tmpConn.Data && tmpConn.Data.Template && typeof(tmpConn.Data.Template) === 'string')
			{
				let tmpTemplateContext = tmpStateManager.buildTemplateContext(pContext, tmpSourceValue);
				tmpSourceValue = this._resolveTemplate(tmpConn.Data.Template, tmpTemplateContext);
			}

			// Determine which settings key to write under. When a
			// state connection explicitly declares `Data.StateKey`,
			// honor it — this lets operations fan state into a
			// setting whose name doesn't match any physical port
			// (e.g. the storyboard's parameter-sweep connection
			// routes a value-input's InputValue into the sweep
			// task's `ParameterSets` setting even though the sweep
			// only exposes event trigger ports). Falls through to
			// the target port name for backward compatibility.
			let tmpSettingsKey = (tmpConn.Data && typeof(tmpConn.Data.StateKey) === 'string' && tmpConn.Data.StateKey)
				? tmpConn.Data.StateKey
				: tmpTargetPortName;

			// Write the resolved value into settings
			if (tmpSettingsKey && tmpSourceValue !== undefined)
			{
				tmpSettings[tmpSettingsKey] = tmpSourceValue;
			}
		}

		// Resolve any template expressions in settings values
		// (e.g. "{~D:Record.Operation.InputFilePath~}" -> actual value from state)
		let tmpTemplateContext = tmpStateManager.buildTemplateContext(pContext);

		let tmpSettingsKeys = Object.keys(tmpSettings);
		for (let i = 0; i < tmpSettingsKeys.length; i++)
		{
			let tmpKey = tmpSettingsKeys[i];
			let tmpVal = tmpSettings[tmpKey];

			if (typeof(tmpVal) === 'string' && tmpVal.indexOf('{~') >= 0)
			{
				// When the entire value is a single {~D:Record.X~} expression,
				// resolve via StateManager to preserve non-scalar types
				// (arrays, objects).  parseTemplate always returns strings.
				let tmpDataMatch = tmpVal.match(/^\{~D:Record\.(.+?)~\}$/);
				if (tmpDataMatch)
				{
					let tmpAddress = tmpDataMatch[1];
					let tmpResolved = tmpStateManager.resolveAddress(tmpAddress, pContext);
					if (tmpResolved !== undefined)
					{
						tmpSettings[tmpKey] = tmpResolved;
						continue;
					}
				}
				tmpSettings[tmpKey] = this._resolveTemplate(tmpVal, tmpTemplateContext);
			}
		}

		return tmpSettings;
	}

	// ====================================================================
	// Internal: Graph Traversal Helpers
	// ====================================================================

	/**
	 * Build a lookup map of nodes keyed by Hash.
	 */
	_buildNodeMap(pGraph)
	{
		let tmpMap = {};
		let tmpNodes = pGraph.Nodes || [];

		for (let i = 0; i < tmpNodes.length; i++)
		{
			let tmpNode = tmpNodes[i];

			// Normalize flow editor format: "Data" -> "Settings"
			if (!tmpNode.Settings && tmpNode.Data && typeof(tmpNode.Data) === 'object')
			{
				tmpNode.Settings = tmpNode.Data;
			}

			tmpMap[tmpNode.Hash] = tmpNode;
		}

		return tmpMap;
	}

	/**
	 * Build connection lookup maps for fast traversal.
	 * Creates two indices:
	 *   eventSources[sourceNodeHash] -> array of connections with ConnectionType='Event'
	 *   stateTargets[targetNodeHash] -> array of connections with ConnectionType='State'
	 *
	 * When ConnectionType is not explicitly set (flow editor format), the type is
	 * inferred from port hash convention (-eo-/-ei- vs -so-/-si-), node types
	 * (start/end are always event), or task type definitions.
	 */
	_buildConnectionMap(pGraph, pNodeMap, pPortLabelMap)
	{
		let tmpMap = {
			eventSources: {},
			stateTargets: {}
		};

		let tmpConnections = pGraph.Connections || [];

		for (let i = 0; i < tmpConnections.length; i++)
		{
			let tmpConn = tmpConnections[i];

			// Determine connection type (explicit or inferred)
			let tmpType = tmpConn.ConnectionType
				|| this._inferConnectionType(tmpConn, pNodeMap, pPortLabelMap);

			let tmpTypeLower = (tmpType || '').toLowerCase();
			if (tmpTypeLower === 'event')
			{
				if (!tmpMap.eventSources[tmpConn.SourceNodeHash])
				{
					tmpMap.eventSources[tmpConn.SourceNodeHash] = [];
				}
				tmpMap.eventSources[tmpConn.SourceNodeHash].push(tmpConn);
			}
			else if (tmpTypeLower === 'state')
			{
				if (!tmpMap.stateTargets[tmpConn.TargetNodeHash])
				{
					tmpMap.stateTargets[tmpConn.TargetNodeHash] = [];
				}
				tmpMap.stateTargets[tmpConn.TargetNodeHash].push(tmpConn);
			}
		}

		return tmpMap;
	}

	/**
	 * Find the Start node in the graph.
	 */
	_findStartNode(pContext)
	{
		let tmpNodes = pContext._Graph.Nodes || [];

		for (let i = 0; i < tmpNodes.length; i++)
		{
			if (tmpNodes[i].Type === 'start')
			{
				return tmpNodes[i];
			}
		}

		return null;
	}

	/**
	 * Enqueue downstream event connections from a source node's output event port.
	 *
	 * @param {string} pSourceNodeHash - The node firing the event.
	 * @param {string} pEventName - The event name (matches the source port name).
	 * @param {object} pContext - The execution context.
	 */
	/**
	 * Enqueue ALL downstream event connections from a source node, ignoring port name.
	 * Used for Start nodes which have a single output port.
	 */
	_enqueueAllDownstreamEvents(pSourceNodeHash, pContext)
	{
		let tmpConnections = pContext._ConnectionMap.eventSources[pSourceNodeHash] || [];
		let tmpPortLabelMap = pContext._PortLabelMap;

		for (let i = 0; i < tmpConnections.length; i++)
		{
			let tmpConn = tmpConnections[i];
			let tmpTargetPortName = this._extractPortName(tmpConn.TargetPortHash, tmpPortLabelMap);
			pContext.PendingEvents.push({
				TargetNodeHash: tmpConn.TargetNodeHash,
				EventName: tmpTargetPortName
			});
		}
	}

	_enqueueDownstreamEvents(pSourceNodeHash, pEventName, pContext)
	{
		let tmpConnections = pContext._ConnectionMap.eventSources[pSourceNodeHash] || [];
		let tmpPortLabelMap = pContext._PortLabelMap;

		for (let i = 0; i < tmpConnections.length; i++)
		{
			let tmpConn = tmpConnections[i];
			let tmpSourcePortName = this._extractPortName(tmpConn.SourcePortHash, tmpPortLabelMap);

			if (tmpSourcePortName === pEventName)
			{
				let tmpTargetPortName = this._extractPortName(tmpConn.TargetPortHash, tmpPortLabelMap);
				pContext.PendingEvents.push({
					TargetNodeHash: tmpConn.TargetNodeHash,
					EventName: tmpTargetPortName
				});
			}
		}
	}

	/**
	 * Get downstream event targets for an intermediate event (for sub-graph execution).
	 * Returns the targets directly instead of enqueuing them.
	 */
	_getDownstreamEvents(pSourceNodeHash, pEventName, pContext)
	{
		let tmpTargets = [];
		let tmpConnections = pContext._ConnectionMap.eventSources[pSourceNodeHash] || [];
		let tmpPortLabelMap = pContext._PortLabelMap;

		for (let i = 0; i < tmpConnections.length; i++)
		{
			let tmpConn = tmpConnections[i];
			let tmpSourcePortName = this._extractPortName(tmpConn.SourcePortHash, tmpPortLabelMap);

			if (tmpSourcePortName === pEventName)
			{
				let tmpTargetPortName = this._extractPortName(tmpConn.TargetPortHash, tmpPortLabelMap);
				tmpTargets.push({
					TargetNodeHash: tmpConn.TargetNodeHash,
					EventName: tmpTargetPortName
				});
			}
		}

		return tmpTargets;
	}

	/**
	 * Drain any events that were enqueued during sub-graph execution.
	 * This ensures intermediate event processing completes before
	 * the parent task continues.
	 */
	_drainEventsForSubgraph(pContext, fCallback)
	{
		if (pContext.PendingEvents.length === 0)
		{
			return fCallback();
		}

		let tmpEvent = pContext.PendingEvents.shift();

		this._executeTaskForEvent(tmpEvent.TargetNodeHash, tmpEvent.EventName, pContext,
			(pError) =>
			{
				if (pError)
				{
					this._log(pContext, `Error in sub-graph drain: ${pError.message}`, 'error');
				}

				this._drainEventsForSubgraph(pContext, fCallback);
			});
	}

	/**
	 * Extract the port name from a port hash.
	 *
	 * Supports two formats:
	 *   1. Programmatic: {NodeHash}-{portTypePrefix}-{Name}
	 *      e.g. 'TSK-READFILE-001-eo-ReadComplete' -> 'ReadComplete'
	 *   2. Flow editor: arbitrary hashes with port Labels stored in the graph
	 *      e.g. 'fp-read-done' -> looks up Label 'ReadComplete' from PortLabelMap
	 *
	 * @param {string} pPortHash - The port hash string.
	 * @param {object} [pPortLabelMap] - Optional mapping of port hash -> label.
	 */
	_extractPortName(pPortHash, pPortLabelMap)
	{
		if (!pPortHash || typeof(pPortHash) !== 'string')
		{
			return '';
		}

		// First try the standard -eo-/-ei-/-so-/-si- convention
		let tmpPrefixes = ['-ei-', '-eo-', '-si-', '-so-'];

		for (let i = 0; i < tmpPrefixes.length; i++)
		{
			let tmpIndex = pPortHash.lastIndexOf(tmpPrefixes[i]);
			if (tmpIndex > -1)
			{
				return pPortHash.substring(tmpIndex + tmpPrefixes[i].length);
			}
		}

		// Then try the port label map (flow editor format)
		if (pPortLabelMap && pPortLabelMap[pPortHash])
		{
			return pPortLabelMap[pPortHash];
		}

		// Fallback: return the hash as-is
		return pPortHash;
	}

	// ====================================================================
	// Internal: Template Resolution
	// ====================================================================

	/**
	 * Resolve a template string against a template context object.
	 *
	 * Uses Pict's parseTemplate for full template support. The template context
	 * from StateManager.buildTemplateContext() is passed as the record parameter,
	 * which Pict places at `Record` on the root data object.
	 *
	 * Template addresses use the `Record.` prefix to reach the context:
	 *   {~D:Record.Value~}                   -> the source value from the state connection
	 *   {~D:Record.Global.X~}               -> GlobalState.X
	 *   {~D:Record.Operation.X~}            -> OperationState.X
	 *   {~D:Record.TaskOutput.NodeHash.X~}  -> TaskOutputs[NodeHash].X
	 *   {~D:Record.Staging.Path~}           -> StagingPath
	 *
	 * @param {string} pTemplate - The template string.
	 * @param {object} pContext - The template context (from StateManager.buildTemplateContext).
	 * @returns {string} The resolved string.
	 */
	_resolveTemplate(pTemplate, pContext)
	{
		if (typeof(this.fable.parseTemplate) === 'function')
		{
			return this.fable.parseTemplate(pTemplate, pContext);
		}

		this.log.warn('ExecutionEngine._resolveTemplate: parseTemplate not available on fable instance. Template expressions will not be resolved.');
		return pTemplate;
	}

	// ====================================================================
	// Internal: Port and Connection Helpers
	// ====================================================================

	/**
	 * Build a lookup map from port hash -> port Label for all nodes in the graph.
	 * Used to resolve port names when hashes don't follow the -eo-/-ei- convention.
	 */
	_buildPortLabelMap(pGraph)
	{
		let tmpMap = {};
		let tmpNodes = pGraph.Nodes || [];

		for (let i = 0; i < tmpNodes.length; i++)
		{
			let tmpPorts = tmpNodes[i].Ports || [];

			for (let j = 0; j < tmpPorts.length; j++)
			{
				tmpMap[tmpPorts[j].Hash] = tmpPorts[j].Label || tmpPorts[j].Hash;
			}
		}

		return tmpMap;
	}

	/**
	 * Infer the ConnectionType when not explicitly set on a connection.
	 *
	 * Uses these heuristics in order:
	 *   1. Port hash convention: -eo-/-ei- -> Event, -so-/-si- -> State
	 *   2. Start/End node connections are always Event
	 *   3. Task type definitions: check if port labels match EventOutputs or StateOutputs
	 *   4. Default: Event
	 */
	_inferConnectionType(pConn, pNodeMap, pPortLabelMap)
	{
		let tmpSourcePortHash = pConn.SourcePortHash || '';
		let tmpTargetPortHash = pConn.TargetPortHash || '';

		// Check port hash convention
		if (tmpSourcePortHash.includes('-eo-') || tmpTargetPortHash.includes('-ei-'))
		{
			return 'Event';
		}
		if (tmpSourcePortHash.includes('-so-') || tmpTargetPortHash.includes('-si-'))
		{
			return 'State';
		}

		// Start and End nodes only have event ports
		let tmpSourceNode = pNodeMap ? pNodeMap[pConn.SourceNodeHash] : null;
		let tmpTargetNode = pNodeMap ? pNodeMap[pConn.TargetNodeHash] : null;

		if (tmpSourceNode && (tmpSourceNode.Type === 'start' || tmpSourceNode.Type === 'end'))
		{
			return 'Event';
		}
		if (tmpTargetNode && (tmpTargetNode.Type === 'start' || tmpTargetNode.Type === 'end'))
		{
			return 'Event';
		}

		// Look up port labels and check against task type definitions
		let tmpRegistry = this._getTaskTypeRegistry();

		if (tmpRegistry && tmpSourceNode)
		{
			let tmpSourceLabel = pPortLabelMap ? (pPortLabelMap[tmpSourcePortHash] || '') : '';
			let tmpDefHash = tmpSourceNode.DefinitionHash || tmpSourceNode.Type;
			let tmpDef = tmpRegistry.getDefinition(tmpDefHash);

			if (tmpDef)
			{
				if (tmpDef.EventOutputs)
				{
					for (let i = 0; i < tmpDef.EventOutputs.length; i++)
					{
						if (tmpDef.EventOutputs[i].Name === tmpSourceLabel)
						{
							return 'Event';
						}
					}
				}
				if (tmpDef.StateOutputs)
				{
					for (let i = 0; i < tmpDef.StateOutputs.length; i++)
					{
						if (tmpDef.StateOutputs[i].Name === tmpSourceLabel)
						{
							return 'State';
						}
					}
				}
			}
		}

		// Also check target node to classify
		if (tmpRegistry && tmpTargetNode)
		{
			let tmpTargetLabel = pPortLabelMap ? (pPortLabelMap[tmpTargetPortHash] || '') : '';
			let tmpDefHash = tmpTargetNode.DefinitionHash || tmpTargetNode.Type;
			let tmpDef = tmpRegistry.getDefinition(tmpDefHash);

			if (tmpDef)
			{
				if (tmpDef.EventInputs)
				{
					for (let i = 0; i < tmpDef.EventInputs.length; i++)
					{
						if (tmpDef.EventInputs[i].Name === tmpTargetLabel)
						{
							return 'Event';
						}
					}
				}
				if (tmpDef.SettingsInputs)
				{
					for (let i = 0; i < tmpDef.SettingsInputs.length; i++)
					{
						if (tmpDef.SettingsInputs[i].Name === tmpTargetLabel)
						{
							return 'State';
						}
					}
				}
			}
		}

		// Default to Event
		return 'Event';
	}

	// ====================================================================
	// Internal: Service Access
	// ====================================================================

	_getStateManager()
	{
		if (this.fable.servicesMap['UltravisorStateManager'])
		{
			return Object.values(this.fable.servicesMap['UltravisorStateManager'])[0];
		}
		return null;
	}

	_getTaskTypeRegistry()
	{
		if (this.fable.servicesMap['UltravisorTaskTypeRegistry'])
		{
			return Object.values(this.fable.servicesMap['UltravisorTaskTypeRegistry'])[0];
		}
		return null;
	}

	_getManifestService()
	{
		if (this.fable.servicesMap['UltravisorExecutionManifest'])
		{
			return Object.values(this.fable.servicesMap['UltravisorExecutionManifest'])[0];
		}
		return null;
	}
}

module.exports = UltravisorExecutionEngine;
