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
		tmpContext._ConnectionMap = this._buildConnectionMap(pOperationDefinition.Graph);

		// Mark as running
		tmpContext.Status = 'Running';
		tmpContext.StartTime = new Date().toISOString();
		tmpContext.Log.push(`Operation [${pOperationDefinition.Hash}] started at ${tmpContext.StartTime}`);

		// Find Start node and enqueue its output events
		let tmpStartNode = this._findStartNode(tmpContext);

		if (!tmpStartNode)
		{
			tmpContext.Status = 'Error';
			tmpContext.Log.push('No Start node found in the graph.');
			tmpManifestService.finalizeExecution(tmpContext);
			return fCallback(new Error('No Start node found in the graph.'), tmpContext);
		}

		// Fire the Start event from the Start node
		this._enqueueDownstreamEvents(tmpStartNode.Hash, 'Start', tmpContext);

		// Process the event queue
		this._processEventQueue(tmpContext,
			(pError) =>
			{
				if (pError)
				{
					tmpContext.Log.push(`Execution error: ${pError.message}`);
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
	 * Resume a paused operation after a value-input task receives input.
	 *
	 * @param {string} pRunHash - The execution run hash.
	 * @param {string} pNodeHash - The waiting task node hash.
	 * @param {*} pValue - The provided value.
	 * @param {function} fCallback - function(pError, pExecutionContext)
	 */
	resumeOperation(pRunHash, pNodeHash, pValue, fCallback)
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

		// Get the StateManager to write the value
		let tmpStateManager = this._getStateManager();

		// Write the value to the specified output address
		if (tmpWaitingInfo.OutputAddress)
		{
			tmpStateManager.setAddress(tmpWaitingInfo.OutputAddress, pValue, tmpContext, pNodeHash);
		}

		// Also store in task outputs
		if (!tmpContext.TaskOutputs[pNodeHash])
		{
			tmpContext.TaskOutputs[pNodeHash] = {};
		}
		tmpContext.TaskOutputs[pNodeHash].InputValue = pValue;

		// Remove from waiting list
		delete tmpContext.WaitingTasks[pNodeHash];

		// Fire the completion event
		tmpContext.Status = 'Running';
		tmpContext.Log.push(`Value input received for node [${pNodeHash}], resuming execution.`);

		this._enqueueDownstreamEvents(pNodeHash, 'ValueInputComplete', tmpContext);

		// Process the event queue
		this._processEventQueue(tmpContext,
			(pError) =>
			{
				if (pError)
				{
					tmpContext.Log.push(`Execution error after resume: ${pError.message}`);
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
				pContext.Log.push('Operation paused: waiting for user input.');
			}
			return fCallback(null);
		}

		// Dequeue the next event
		let tmpEvent = pContext.PendingEvents.shift();

		this._executeTaskForEvent(tmpEvent.TargetNodeHash, tmpEvent.EventName, pContext,
			(pError) =>
			{
				if (pError)
				{
					pContext.Log.push(`Error processing event [${tmpEvent.EventName}] on node [${tmpEvent.TargetNodeHash}]: ${pError.message}`);
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
		let tmpNode = pContext._NodeMap[pNodeHash];

		if (!tmpNode)
		{
			pContext.Log.push(`Node [${pNodeHash}] not found in graph.`);
			return fCallback(null);
		}

		// Handle built-in End node
		if (tmpNode.Type === 'end')
		{
			pContext.Log.push(`Reached End node [${pNodeHash}].`);
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
			pContext.Log.push(`Unknown task type [${tmpDefinitionHash}] for node [${pNodeHash}].`);
			return fCallback(null);
		}

		// Resolve incoming state connections
		let tmpResolvedSettings = this._resolveStateConnections(pNodeHash, tmpNode, pContext);

		// Get the manifest service for recording
		let tmpManifestService = this._getManifestService();
		if (tmpManifestService)
		{
			tmpManifestService.recordTaskStart(pContext, pNodeHash, pEventName);
		}

		pContext.Log.push(`Executing node [${pNodeHash}] (${tmpDefinition.Name}) triggered by [${pEventName}]`);

		// Create task instance and execute
		let tmpTaskInstance = tmpRegistry.instantiateTaskType(tmpDefinitionHash);

		if (!tmpTaskInstance)
		{
			pContext.Log.push(`Failed to instantiate task type [${tmpDefinitionHash}].`);
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
			StateManager: this._getStateManager()
		};

		// Build the fFireIntermediateEvent function for re-entrant tasks
		let fFireIntermediateEvent = (pIntermediateEventName, pIntermediateOutputs, fResumeCallback) =>
		{
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
							pContext.Log.push(`Error in sub-graph: ${pError.message}`);
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
		tmpTaskInstance.execute(tmpResolvedSettings, tmpTaskContext, (pError, pResult) =>
		{
			if (pError)
			{
				pContext.Log.push(`Task [${pNodeHash}] error: ${pError.message}`);
				if (tmpManifestService)
				{
					tmpManifestService.recordTaskError(pContext, pNodeHash, pError);
				}

				// Fire error event if the task has one
				this._enqueueDownstreamEvents(pNodeHash, 'Error', pContext);
				return fCallback(null);
			}

			if (!pResult)
			{
				pContext.Log.push(`Task [${pNodeHash}] returned no result.`);
				return fCallback(null);
			}

			// Check for WaitingForInput (value-input task)
			if (pResult.WaitingForInput)
			{
				pContext.WaitingTasks[pNodeHash] = {
					PromptMessage: pResult.PromptMessage || '',
					OutputAddress: pResult.OutputAddress || '',
					Timestamp: new Date().toISOString()
				};
				pContext.Log.push(`Task [${pNodeHash}] is waiting for user input.`);
				if (tmpManifestService)
				{
					tmpManifestService.recordTaskComplete(pContext, pNodeHash, pResult);
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

			// Log task messages
			if (Array.isArray(pResult.Log))
			{
				for (let i = 0; i < pResult.Log.length; i++)
				{
					pContext.Log.push(`  [${pNodeHash}] ${pResult.Log[i]}`);
				}
			}

			// Record completion
			if (tmpManifestService)
			{
				tmpManifestService.recordTaskComplete(pContext, pNodeHash, pResult);
			}

			// Fire the output event (enqueue downstream tasks)
			if (pResult.EventToFire)
			{
				this._enqueueDownstreamEvents(pNodeHash, pResult.EventToFire, pContext);
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
		let tmpSettings = {};

		if (pNode.Settings && typeof(pNode.Settings) === 'object')
		{
			tmpSettings = JSON.parse(JSON.stringify(pNode.Settings));
		}

		// Find all incoming State connections targeting this node
		let tmpStateConnections = pContext._ConnectionMap.stateTargets[pNodeHash] || [];
		let tmpStateManager = this._getStateManager();

		for (let i = 0; i < tmpStateConnections.length; i++)
		{
			let tmpConn = tmpStateConnections[i];

			// Get the source port name
			let tmpSourcePortName = this._extractPortName(tmpConn.SourcePortHash);
			let tmpTargetPortName = this._extractPortName(tmpConn.TargetPortHash);

			// Read the source value from the source node's outputs
			let tmpSourceNodeOutputs = pContext.TaskOutputs[tmpConn.SourceNodeHash] || {};
			let tmpSourceValue = tmpSourceNodeOutputs[tmpSourcePortName];

			// Apply template if defined
			if (tmpConn.Data && tmpConn.Data.Template && typeof(tmpConn.Data.Template) === 'string')
			{
				let tmpTemplateContext = tmpStateManager.buildTemplateContext(pContext, tmpSourceValue);
				tmpSourceValue = this._resolveTemplate(tmpConn.Data.Template, tmpTemplateContext);
			}

			// Write the resolved value into settings
			if (tmpTargetPortName && tmpSourceValue !== undefined)
			{
				tmpSettings[tmpTargetPortName] = tmpSourceValue;
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
			tmpMap[tmpNodes[i].Hash] = tmpNodes[i];
		}

		return tmpMap;
	}

	/**
	 * Build connection lookup maps for fast traversal.
	 * Creates two indices:
	 *   eventSources[sourceNodeHash] -> array of connections with ConnectionType='Event'
	 *   stateTargets[targetNodeHash] -> array of connections with ConnectionType='State'
	 */
	_buildConnectionMap(pGraph)
	{
		let tmpMap = {
			eventSources: {},
			stateTargets: {}
		};

		let tmpConnections = pGraph.Connections || [];

		for (let i = 0; i < tmpConnections.length; i++)
		{
			let tmpConn = tmpConnections[i];

			if (tmpConn.ConnectionType === 'Event')
			{
				if (!tmpMap.eventSources[tmpConn.SourceNodeHash])
				{
					tmpMap.eventSources[tmpConn.SourceNodeHash] = [];
				}
				tmpMap.eventSources[tmpConn.SourceNodeHash].push(tmpConn);
			}
			else if (tmpConn.ConnectionType === 'State')
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
	_enqueueDownstreamEvents(pSourceNodeHash, pEventName, pContext)
	{
		let tmpConnections = pContext._ConnectionMap.eventSources[pSourceNodeHash] || [];

		for (let i = 0; i < tmpConnections.length; i++)
		{
			let tmpConn = tmpConnections[i];
			let tmpSourcePortName = this._extractPortName(tmpConn.SourcePortHash);

			if (tmpSourcePortName === pEventName)
			{
				let tmpTargetPortName = this._extractPortName(tmpConn.TargetPortHash);
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

		for (let i = 0; i < tmpConnections.length; i++)
		{
			let tmpConn = tmpConnections[i];
			let tmpSourcePortName = this._extractPortName(tmpConn.SourcePortHash);

			if (tmpSourcePortName === pEventName)
			{
				let tmpTargetPortName = this._extractPortName(tmpConn.TargetPortHash);
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
					pContext.Log.push(`Error in sub-graph drain: ${pError.message}`);
				}

				this._drainEventsForSubgraph(pContext, fCallback);
			});
	}

	/**
	 * Extract the port name from a port hash.
	 * Port hashes follow the pattern: {NodeHash}-{portTypePrefix}-{Name}
	 * e.g. 'TSK-READFILE-001-eo-ReadComplete' -> 'ReadComplete'
	 */
	_extractPortName(pPortHash)
	{
		if (!pPortHash || typeof(pPortHash) !== 'string')
		{
			return '';
		}

		// Find the port type prefix (ei-, eo-, si-, so-)
		let tmpPrefixes = ['-ei-', '-eo-', '-si-', '-so-'];

		for (let i = 0; i < tmpPrefixes.length; i++)
		{
			let tmpIndex = pPortHash.lastIndexOf(tmpPrefixes[i]);
			if (tmpIndex > -1)
			{
				return pPortHash.substring(tmpIndex + tmpPrefixes[i].length);
			}
		}

		// Fallback: return the hash as-is (e.g. for simple port hashes)
		return pPortHash;
	}

	// ====================================================================
	// Internal: Template Resolution
	// ====================================================================

	/**
	 * Resolve a template string against a template context object.
	 *
	 * Replaces {~D:Address~} patterns using Manyfest address resolution.
	 * Address examples:
	 *   {~D:Value~}                   -> the source value from the state connection
	 *   {~D:Global.X~}               -> GlobalState.X
	 *   {~D:Operation.X~}            -> OperationState.X
	 *   {~D:TaskOutput.NodeHash.X~}  -> TaskOutputs[NodeHash].X
	 *   {~D:Staging.Path~}           -> StagingPath
	 *
	 * If Pict's parseTemplate is available, delegates to it for full template support.
	 * Otherwise falls back to simple {~D:...~} pattern resolution via Manyfest.
	 *
	 * @param {string} pTemplate - The template string.
	 * @param {object} pContext - The template context (from StateManager.buildTemplateContext).
	 * @returns {string} The resolved string.
	 */
	_resolveTemplate(pTemplate, pContext)
	{
		// If Pict's parseTemplate is available, use it (provides full template support)
		if (typeof(this.fable.parseTemplate) === 'function')
		{
			return this.fable.parseTemplate(pTemplate, pContext);
		}

		// Fallback: simple {~D:Address~} pattern resolution
		let tmpStateManager = this._getStateManager();

		if (!tmpStateManager)
		{
			return pTemplate;
		}

		return pTemplate.replace(/\{~D:([^~]+)~\}/g,
			(pMatch, pAddress) =>
			{
				let tmpValue = tmpStateManager._resolveFromObject(pContext, pAddress);
				return tmpValue !== undefined ? String(tmpValue) : '';
			});
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
