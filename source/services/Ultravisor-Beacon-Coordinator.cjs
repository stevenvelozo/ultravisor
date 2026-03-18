/**
 * Ultravisor Beacon Coordinator
 *
 * Server-side service that manages Beacon worker nodes, the work queue,
 * and affinity bindings for distributed task execution.
 *
 * The coordinator is transport-agnostic — its internal API (enqueueWorkItem,
 * completeWorkItem, failWorkItem) can be driven by any signaling channel
 * (HTTP polling, WebSocket, MQTT, email/SMS webhooks, etc.).
 *
 * @module Ultravisor-Beacon-Coordinator
 */

const libPictService = require('pict-serviceproviderbase');

class UltravisorBeaconCoordinator extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		// --- Registered Beacons ---
		// Map of BeaconID → Beacon record
		this._Beacons = {};

		// --- Work Queue ---
		// Map of WorkItemHash → Work item record
		this._WorkQueue = {};

		// --- Affinity Bindings ---
		// Map of AffinityKey → Binding record
		this._AffinityBindings = {};

		// --- Timeout Checker ---
		this._TimeoutInterval = null;
		this._TimeoutCheckIntervalMs = 10000; // Check every 10s

		// --- Direct Dispatch Callbacks ---
		// Map of WorkItemHash → { callback, timeoutHandle }
		// Used by dispatchAndWait() for synchronous HTTP dispatch
		this._DirectDispatchCallbacks = {};

		// --- WebSocket Push Handler ---
		// Called when a work item is enqueued to attempt immediate push
		// to a WebSocket-connected beacon.  Set by the API server.
		// Signature: function(pBeaconID, pSanitizedWorkItem) -> boolean
		this._WorkItemPushHandler = null;
	}

	/**
	 * Set the handler used to push work items to WebSocket-connected beacons.
	 *
	 * @param {function} fHandler - function(pBeaconID, pWorkItem) returns boolean
	 */
	setWorkItemPushHandler(fHandler)
	{
		this._WorkItemPushHandler = (typeof fHandler === 'function') ? fHandler : null;
	}

	// ====================================================================
	// Lifecycle
	// ====================================================================

	/**
	 * Start the timeout checker interval.
	 */
	startTimeoutChecker()
	{
		if (this._TimeoutInterval)
		{
			return;
		}

		this._TimeoutInterval = setInterval(
			() =>
			{
				this._checkTimeouts();
			},
			this._TimeoutCheckIntervalMs);

		this.log.info('BeaconCoordinator: timeout checker started.');
	}

	/**
	 * Stop the timeout checker interval.
	 */
	stopTimeoutChecker()
	{
		if (this._TimeoutInterval)
		{
			clearInterval(this._TimeoutInterval);
			this._TimeoutInterval = null;
			this.log.info('BeaconCoordinator: timeout checker stopped.');
		}
	}

	// ====================================================================
	// Beacon Registration
	// ====================================================================

	/**
	 * Register a new Beacon worker.
	 *
	 * If a beacon with the same Name already exists and is Offline,
	 * reclaim it (session-aware reconnection) instead of creating a
	 * new record.
	 *
	 * @param {object} pBeaconInfo - { Name, Capabilities, MaxConcurrent?, Tags? }
	 * @param {string} pSessionID - Optional session identifier
	 * @returns {object} The created or reclaimed Beacon record
	 */
	registerBeacon(pBeaconInfo, pSessionID)
	{
		let tmpName = pBeaconInfo.Name || 'unnamed';

		// Check for an existing offline beacon with the same name to reclaim
		let tmpExistingBeacon = this.findBeaconByName(tmpName);
		if (tmpExistingBeacon && tmpExistingBeacon.Status === 'Offline')
		{
			tmpExistingBeacon.SessionID = pSessionID || null;
			tmpExistingBeacon.LastHeartbeat = new Date().toISOString();
			tmpExistingBeacon.Status = 'Online';

			if (Array.isArray(pBeaconInfo.Capabilities))
			{
				tmpExistingBeacon.Capabilities = pBeaconInfo.Capabilities;
			}
			if (pBeaconInfo.MaxConcurrent)
			{
				tmpExistingBeacon.MaxConcurrent = pBeaconInfo.MaxConcurrent;
			}
			if (pBeaconInfo.Tags)
			{
				tmpExistingBeacon.Tags = pBeaconInfo.Tags;
			}

			this.log.info(`BeaconCoordinator: reconnected beacon [${tmpExistingBeacon.BeaconID}] "${tmpName}" with session [${tmpExistingBeacon.SessionID}].`);
			return tmpExistingBeacon;
		}

		let tmpTimestamp = Date.now();
		let tmpBeaconID = `bcn-${tmpName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${tmpTimestamp}`;

		let tmpBeacon = {
			BeaconID: tmpBeaconID,
			Name: tmpName,
			SessionID: pSessionID || null,
			Capabilities: Array.isArray(pBeaconInfo.Capabilities) ? pBeaconInfo.Capabilities : [],
			Status: 'Online',
			LastHeartbeat: new Date().toISOString(),
			CurrentWorkItems: [],
			MaxConcurrent: pBeaconInfo.MaxConcurrent || 1,
			Tags: pBeaconInfo.Tags || {},
			RegisteredAt: new Date().toISOString()
		};

		this._Beacons[tmpBeaconID] = tmpBeacon;
		this.log.info(`BeaconCoordinator: registered beacon [${tmpBeaconID}] "${tmpName}" with capabilities [${tmpBeacon.Capabilities.join(', ')}].`);

		return tmpBeacon;
	}

	/**
	 * Find a beacon by its Name property.
	 *
	 * @param {string} pName - The beacon name to search for
	 * @returns {object|null} The first matching Beacon record, or null
	 */
	findBeaconByName(pName)
	{
		let tmpBeaconIDs = Object.keys(this._Beacons);
		for (let i = 0; i < tmpBeaconIDs.length; i++)
		{
			let tmpBeacon = this._Beacons[tmpBeaconIDs[i]];
			if (tmpBeacon.Name === pName)
			{
				return tmpBeacon;
			}
		}
		return null;
	}

	/**
	 * Find a beacon by its SessionID property.
	 *
	 * @param {string} pSessionID - The session identifier to search for
	 * @returns {object|null} The first matching Beacon record, or null
	 */
	findBeaconBySessionID(pSessionID)
	{
		let tmpBeaconIDs = Object.keys(this._Beacons);
		for (let i = 0; i < tmpBeaconIDs.length; i++)
		{
			let tmpBeacon = this._Beacons[tmpBeaconIDs[i]];
			if (tmpBeacon.SessionID === pSessionID)
			{
				return tmpBeacon;
			}
		}
		return null;
	}

	/**
	 * Deregister a Beacon and release any assigned work items.
	 *
	 * @param {string} pBeaconID
	 * @returns {boolean} True if the Beacon was found and removed
	 */
	deregisterBeacon(pBeaconID)
	{
		let tmpBeacon = this._Beacons[pBeaconID];

		if (!tmpBeacon)
		{
			return false;
		}

		// Release any assigned work items back to Pending
		for (let i = 0; i < tmpBeacon.CurrentWorkItems.length; i++)
		{
			let tmpWorkItem = this._WorkQueue[tmpBeacon.CurrentWorkItems[i]];
			if (tmpWorkItem && (tmpWorkItem.Status === 'Assigned' || tmpWorkItem.Status === 'Running'))
			{
				tmpWorkItem.Status = 'Pending';
				tmpWorkItem.AssignedBeaconID = null;
				tmpWorkItem.ClaimedAt = null;
				this.log.warn(`BeaconCoordinator: released work item [${tmpWorkItem.WorkItemHash}] from deregistered beacon [${pBeaconID}].`);
			}
		}

		delete this._Beacons[pBeaconID];
		this.log.info(`BeaconCoordinator: deregistered beacon [${pBeaconID}].`);

		return true;
	}

	/**
	 * Process a heartbeat from a Beacon.
	 *
	 * @param {string} pBeaconID
	 * @returns {object|null} Updated Beacon record, or null if not found
	 */
	heartbeat(pBeaconID)
	{
		let tmpBeacon = this._Beacons[pBeaconID];

		if (!tmpBeacon)
		{
			return null;
		}

		tmpBeacon.LastHeartbeat = new Date().toISOString();

		// Update status based on current work load
		if (tmpBeacon.CurrentWorkItems.length >= tmpBeacon.MaxConcurrent)
		{
			tmpBeacon.Status = 'Busy';
		}
		else
		{
			tmpBeacon.Status = 'Online';
		}

		return tmpBeacon;
	}

	/**
	 * List all registered Beacons.
	 *
	 * @returns {Array} Array of Beacon records
	 */
	listBeacons()
	{
		return Object.values(this._Beacons);
	}

	/**
	 * Get a specific Beacon by ID.
	 *
	 * @param {string} pBeaconID
	 * @returns {object|null} Beacon record or null
	 */
	getBeacon(pBeaconID)
	{
		return this._Beacons[pBeaconID] || null;
	}

	// ====================================================================
	// Work Queue
	// ====================================================================

	/**
	 * Enqueue a work item for Beacon dispatch.
	 *
	 * Called by the beacon-dispatch task type when a task needs remote execution.
	 *
	 * @param {object} pWorkItemInfo - Work item details
	 * @returns {object} The created work item record
	 */
	enqueueWorkItem(pWorkItemInfo)
	{
		let tmpTimestamp = Date.now();
		let tmpWorkItemHash = `wi-${pWorkItemInfo.RunHash || 'unknown'}-${pWorkItemInfo.NodeHash || 'unknown'}-${tmpTimestamp}`;

		let tmpDefaultTimeout = this.fable.settings.UltravisorBeaconWorkItemTimeoutMs || 300000;

		let tmpWorkItem = {
			WorkItemHash: tmpWorkItemHash,
			RunHash: pWorkItemInfo.RunHash || '',
			NodeHash: pWorkItemInfo.NodeHash || '',
			OperationHash: pWorkItemInfo.OperationHash || '',
			Capability: pWorkItemInfo.Capability || 'Shell',
			Action: pWorkItemInfo.Action || 'Execute',
			Settings: pWorkItemInfo.Settings || {},
			AffinityKey: pWorkItemInfo.AffinityKey || '',
			AssignedBeaconID: null,
			Status: 'Pending',
			TimeoutMs: pWorkItemInfo.TimeoutMs || tmpDefaultTimeout,
			CreatedAt: new Date(tmpTimestamp).toISOString(),
			ClaimedAt: null,
			CompletedAt: null,
			Result: null
		};

		// Check for affinity binding — pre-assign to a specific Beacon
		if (tmpWorkItem.AffinityKey)
		{
			let tmpBinding = this._AffinityBindings[tmpWorkItem.AffinityKey];

			if (tmpBinding && this._Beacons[tmpBinding.BeaconID])
			{
				// Check if the binding has expired
				if (new Date(tmpBinding.ExpiresAt) > new Date())
				{
					tmpWorkItem.AssignedBeaconID = tmpBinding.BeaconID;
					tmpWorkItem.Status = 'Assigned';
					tmpWorkItem.ClaimedAt = new Date().toISOString();

					let tmpBeacon = this._Beacons[tmpBinding.BeaconID];
					tmpBeacon.CurrentWorkItems.push(tmpWorkItemHash);

					this.log.info(`BeaconCoordinator: work item [${tmpWorkItemHash}] pre-assigned to beacon [${tmpBinding.BeaconID}] via affinity [${tmpWorkItem.AffinityKey}].`);
				}
				else
				{
					// Binding expired, clean it up
					delete this._AffinityBindings[tmpWorkItem.AffinityKey];
				}
			}
		}

		this._WorkQueue[tmpWorkItemHash] = tmpWorkItem;
		this.log.info(`BeaconCoordinator: enqueued work item [${tmpWorkItemHash}] (${tmpWorkItem.Capability}/${tmpWorkItem.Action}) status=${tmpWorkItem.Status}.`);

		// Attempt immediate push to a WebSocket-connected beacon
		if (tmpWorkItem.Status === 'Pending')
		{
			this._tryPushToWebSocketBeacon(tmpWorkItem);
		}

		return tmpWorkItem;
	}

	/**
	 * Try to push a pending work item directly to a beacon via its
	 * WebSocket connection (if one exists).
	 *
	 * The push handler (set by the API server) returns true only when
	 * the beacon has a live WebSocket — this method is transport-agnostic.
	 * Beacons that connected via HTTP polling will simply return false
	 * and the work item stays in the queue for them to poll.
	 *
	 * @param {object} pWorkItem - The pending work item.
	 * @returns {boolean} True if the item was pushed successfully.
	 */
	_tryPushToWebSocketBeacon(pWorkItem)
	{
		if (!this._WorkItemPushHandler)
		{
			return false;
		}

		let tmpBeaconIDs = Object.keys(this._Beacons);

		for (let i = 0; i < tmpBeaconIDs.length; i++)
		{
			let tmpBeacon = this._Beacons[tmpBeaconIDs[i]];

			// Must be online, have capacity, and match capability
			if (tmpBeacon.Status !== 'Online' && tmpBeacon.Status !== 'Busy')
			{
				continue;
			}
			if (tmpBeacon.CurrentWorkItems.length >= tmpBeacon.MaxConcurrent)
			{
				continue;
			}
			if (tmpBeacon.Capabilities.indexOf(pWorkItem.Capability) === -1)
			{
				continue;
			}

			// Assign the work item to this beacon
			pWorkItem.Status = 'Running';
			pWorkItem.AssignedBeaconID = tmpBeacon.BeaconID;
			pWorkItem.ClaimedAt = new Date().toISOString();
			tmpBeacon.CurrentWorkItems.push(pWorkItem.WorkItemHash);

			// Create affinity binding if applicable
			if (pWorkItem.AffinityKey && !this._AffinityBindings[pWorkItem.AffinityKey])
			{
				let tmpAffinityTTL = this.fable.settings.UltravisorBeaconAffinityTTLMs || 3600000;
				this._AffinityBindings[pWorkItem.AffinityKey] = {
					AffinityKey: pWorkItem.AffinityKey,
					BeaconID: tmpBeacon.BeaconID,
					RunHash: pWorkItem.RunHash,
					CreatedAt: new Date().toISOString(),
					ExpiresAt: new Date(Date.now() + tmpAffinityTTL).toISOString()
				};
			}

			// Push via WebSocket
			let tmpPushed = this._WorkItemPushHandler(tmpBeacon.BeaconID,
				this._sanitizeWorkItemForBeacon(pWorkItem));

			if (tmpPushed)
			{
				this.log.info(`BeaconCoordinator: pushed work item [${pWorkItem.WorkItemHash}] to WebSocket beacon [${tmpBeacon.BeaconID}].`);
				return true;
			}
			else
			{
				// Push failed — revert assignment
				pWorkItem.Status = 'Pending';
				pWorkItem.AssignedBeaconID = null;
				pWorkItem.ClaimedAt = null;
				let tmpIdx = tmpBeacon.CurrentWorkItems.indexOf(pWorkItem.WorkItemHash);
				if (tmpIdx > -1)
				{
					tmpBeacon.CurrentWorkItems.splice(tmpIdx, 1);
				}
			}
		}

		return false;
	}

	/**
	 * Poll for available work matching a Beacon's capabilities.
	 *
	 * Returns the first matching work item and assigns it to the Beacon.
	 * Affinity-assigned items are prioritized for the matching Beacon.
	 *
	 * @param {string} pBeaconID - The polling Beacon's ID
	 * @returns {object|null} A work item, or null if none available
	 */
	pollForWork(pBeaconID)
	{
		let tmpBeacon = this._Beacons[pBeaconID];

		if (!tmpBeacon)
		{
			this.log.warn(`BeaconCoordinator: poll from unknown beacon [${pBeaconID}].`);
			return null;
		}

		// Update heartbeat on poll
		tmpBeacon.LastHeartbeat = new Date().toISOString();

		// Check if Beacon is at capacity
		if (tmpBeacon.CurrentWorkItems.length >= tmpBeacon.MaxConcurrent)
		{
			return null;
		}

		let tmpWorkItemHashes = Object.keys(this._WorkQueue);

		// First pass: check for affinity-assigned items for this Beacon
		for (let i = 0; i < tmpWorkItemHashes.length; i++)
		{
			let tmpWorkItem = this._WorkQueue[tmpWorkItemHashes[i]];

			if (tmpWorkItem.Status === 'Assigned' && tmpWorkItem.AssignedBeaconID === pBeaconID)
			{
				// This item was pre-assigned to us via affinity
				tmpWorkItem.Status = 'Running';
				this.log.info(`BeaconCoordinator: beacon [${pBeaconID}] picked up affinity-assigned work item [${tmpWorkItem.WorkItemHash}].`);
				return this._sanitizeWorkItemForBeacon(tmpWorkItem);
			}
		}

		// Second pass: check for unassigned items matching capabilities
		for (let i = 0; i < tmpWorkItemHashes.length; i++)
		{
			let tmpWorkItem = this._WorkQueue[tmpWorkItemHashes[i]];

			if (tmpWorkItem.Status !== 'Pending')
			{
				continue;
			}

			// Skip items assigned to a different Beacon (affinity)
			if (tmpWorkItem.AssignedBeaconID && tmpWorkItem.AssignedBeaconID !== pBeaconID)
			{
				continue;
			}

			// Check capability match
			if (tmpBeacon.Capabilities.indexOf(tmpWorkItem.Capability) === -1)
			{
				continue;
			}

			// Claim this work item
			tmpWorkItem.Status = 'Running';
			tmpWorkItem.AssignedBeaconID = pBeaconID;
			tmpWorkItem.ClaimedAt = new Date().toISOString();

			if (tmpBeacon.CurrentWorkItems.indexOf(tmpWorkItem.WorkItemHash) === -1)
			{
				tmpBeacon.CurrentWorkItems.push(tmpWorkItem.WorkItemHash);
			}

			// Create affinity binding if the work item has an AffinityKey
			if (tmpWorkItem.AffinityKey && !this._AffinityBindings[tmpWorkItem.AffinityKey])
			{
				let tmpAffinityTTL = this.fable.settings.UltravisorBeaconAffinityTTLMs || 3600000;
				this._AffinityBindings[tmpWorkItem.AffinityKey] = {
					AffinityKey: tmpWorkItem.AffinityKey,
					BeaconID: pBeaconID,
					RunHash: tmpWorkItem.RunHash,
					CreatedAt: new Date().toISOString(),
					ExpiresAt: new Date(Date.now() + tmpAffinityTTL).toISOString()
				};
				this.log.info(`BeaconCoordinator: created affinity binding [${tmpWorkItem.AffinityKey}] → beacon [${pBeaconID}].`);
			}

			this.log.info(`BeaconCoordinator: beacon [${pBeaconID}] claimed work item [${tmpWorkItem.WorkItemHash}].`);
			return this._sanitizeWorkItemForBeacon(tmpWorkItem);
		}

		return null;
	}

	/**
	 * Return a sanitized work item for the Beacon (only what it needs to execute).
	 *
	 * @param {object} pWorkItem
	 * @returns {object}
	 */
	_sanitizeWorkItemForBeacon(pWorkItem)
	{
		return {
			WorkItemHash: pWorkItem.WorkItemHash,
			Capability: pWorkItem.Capability,
			Action: pWorkItem.Action,
			Settings: pWorkItem.Settings,
			OperationHash: pWorkItem.OperationHash,
			TimeoutMs: pWorkItem.TimeoutMs
		};
	}

	/**
	 * Report successful completion of a work item.
	 *
	 * Resumes the paused operation via the ExecutionEngine.
	 *
	 * @param {string} pWorkItemHash
	 * @param {object} pResult - { Outputs, Log }
	 * @param {function} fCallback - function(pError)
	 */
	completeWorkItem(pWorkItemHash, pResult, fCallback)
	{
		let tmpWorkItem = this._WorkQueue[pWorkItemHash];

		if (!tmpWorkItem)
		{
			return fCallback(new Error(`BeaconCoordinator: work item [${pWorkItemHash}] not found.`));
		}

		if (tmpWorkItem.Status === 'Complete' || tmpWorkItem.Status === 'Error' || tmpWorkItem.Status === 'Timeout')
		{
			return fCallback(new Error(`BeaconCoordinator: work item [${pWorkItemHash}] already finalized (${tmpWorkItem.Status}).`));
		}

		tmpWorkItem.Status = 'Complete';
		tmpWorkItem.CompletedAt = new Date().toISOString();

		// Merge accumulated progress logs with the final completion log
		let tmpFinalResult = pResult || {};
		if (tmpWorkItem.AccumulatedLog && tmpWorkItem.AccumulatedLog.length > 0)
		{
			let tmpCompletionLog = tmpFinalResult.Log || [];
			tmpFinalResult.Log = tmpWorkItem.AccumulatedLog.concat(tmpCompletionLog);
		}

		tmpWorkItem.Result = tmpFinalResult;

		// Remove from Beacon's current work list
		this._removeWorkItemFromBeacon(tmpWorkItem.AssignedBeaconID, pWorkItemHash);

		this.log.info(`BeaconCoordinator: work item [${pWorkItemHash}] completed by beacon [${tmpWorkItem.AssignedBeaconID}].`);

		// Check for direct dispatch callback (synchronous HTTP dispatch)
		if (this._resolveDirectDispatch(pWorkItemHash, null, {
			Success: true,
			WorkItemHash: pWorkItemHash,
			Outputs: tmpFinalResult.Outputs || {},
			Log: tmpFinalResult.Log || []
		}))
		{
			// Direct dispatch — clean up and done
			delete this._WorkQueue[pWorkItemHash];
			return fCallback(null);
		}

		// No RunHash means this was a standalone work item (not part of an operation)
		if (!tmpWorkItem.RunHash)
		{
			delete this._WorkQueue[pWorkItemHash];
			return fCallback(null);
		}

		// Resume the paused operation
		let tmpEngine = this._getService('UltravisorExecutionEngine');

		if (!tmpEngine)
		{
			return fCallback(new Error('BeaconCoordinator: ExecutionEngine service not found.'));
		}

		// Build the structured outputs to pass to resumeOperation
		let tmpOutputs = tmpFinalResult.Outputs || {};

		// Include the BeaconID in the outputs so downstream tasks can reference it
		tmpOutputs.BeaconID = tmpWorkItem.AssignedBeaconID || '';

		tmpEngine.resumeOperation(tmpWorkItem.RunHash, tmpWorkItem.NodeHash, tmpOutputs,
			(pError, pContext) =>
			{
				if (pError)
				{
					this.log.error(`BeaconCoordinator: error resuming operation for work item [${pWorkItemHash}]: ${pError.message}`);
					return fCallback(pError);
				}

				this.log.info(`BeaconCoordinator: operation [${tmpWorkItem.RunHash}] resumed after work item [${pWorkItemHash}] completion.`);

				// Clean up the completed work item from the queue
				delete this._WorkQueue[pWorkItemHash];

				return fCallback(null);
			});
	}

	/**
	 * Report failure of a work item.
	 *
	 * Resumes the paused operation with an error result so the graph's
	 * error path can handle it.
	 *
	 * @param {string} pWorkItemHash
	 * @param {object} pError - { ErrorMessage, Log }
	 * @param {function} fCallback - function(pError)
	 */
	failWorkItem(pWorkItemHash, pError, fCallback)
	{
		let tmpWorkItem = this._WorkQueue[pWorkItemHash];

		if (!tmpWorkItem)
		{
			return fCallback(new Error(`BeaconCoordinator: work item [${pWorkItemHash}] not found.`));
		}

		if (tmpWorkItem.Status === 'Complete' || tmpWorkItem.Status === 'Error' || tmpWorkItem.Status === 'Timeout')
		{
			return fCallback(new Error(`BeaconCoordinator: work item [${pWorkItemHash}] already finalized (${tmpWorkItem.Status}).`));
		}

		tmpWorkItem.Status = 'Error';
		tmpWorkItem.CompletedAt = new Date().toISOString();
		tmpWorkItem.Result = { Error: pError.ErrorMessage || 'Unknown error', Log: pError.Log || [] };

		// Remove from Beacon's current work list
		this._removeWorkItemFromBeacon(tmpWorkItem.AssignedBeaconID, pWorkItemHash);

		this.log.warn(`BeaconCoordinator: work item [${pWorkItemHash}] failed: ${pError.ErrorMessage || 'Unknown error'}`);

		// Check for direct dispatch callback (synchronous HTTP dispatch)
		if (this._resolveDirectDispatch(pWorkItemHash,
			new Error(pError.ErrorMessage || 'Beacon work item failed.'), null))
		{
			// Direct dispatch — clean up and done
			delete this._WorkQueue[pWorkItemHash];
			return fCallback(null);
		}

		// No RunHash means this was a standalone work item (not part of an operation)
		if (!tmpWorkItem.RunHash)
		{
			delete this._WorkQueue[pWorkItemHash];
			return fCallback(null);
		}

		// Resume the operation — the beacon-dispatch task type fires 'Error' event
		// by storing error info in outputs; the ResumeEventName handles routing
		let tmpEngine = this._getService('UltravisorExecutionEngine');

		if (!tmpEngine)
		{
			return fCallback(new Error('BeaconCoordinator: ExecutionEngine service not found.'));
		}

		let tmpErrorOutputs = {
			StdOut: pError.ErrorMessage || 'Beacon work item failed.',
			ExitCode: -1,
			BeaconID: tmpWorkItem.AssignedBeaconID || '',
			_BeaconError: true
		};

		// Resume with 'Error' event by temporarily modifying the waiting task's ResumeEventName
		let tmpManifest = this._getService('UltravisorExecutionManifest');
		if (tmpManifest)
		{
			let tmpContext = tmpManifest.getRun(tmpWorkItem.RunHash);
			if (tmpContext && tmpContext.WaitingTasks[tmpWorkItem.NodeHash])
			{
				tmpContext.WaitingTasks[tmpWorkItem.NodeHash].ResumeEventName = 'Error';
			}
		}

		tmpEngine.resumeOperation(tmpWorkItem.RunHash, tmpWorkItem.NodeHash, tmpErrorOutputs,
			(pResumeError, pContext) =>
			{
				if (pResumeError)
				{
					this.log.error(`BeaconCoordinator: error resuming operation for failed work item [${pWorkItemHash}]: ${pResumeError.message}`);
					return fCallback(pResumeError);
				}

				this.log.info(`BeaconCoordinator: operation [${tmpWorkItem.RunHash}] resumed with error path after work item [${pWorkItemHash}] failure.`);

				// Clean up the failed work item
				delete this._WorkQueue[pWorkItemHash];

				return fCallback(null);
			});
	}

	/**
	 * List all work items (for admin view).
	 *
	 * @returns {Array} Array of work item records
	 */
	listWorkItems()
	{
		return Object.values(this._WorkQueue);
	}

	/**
	 * Get a specific work item by hash.
	 *
	 * @param {string} pWorkItemHash
	 * @returns {object|null}
	 */
	getWorkItem(pWorkItemHash)
	{
		return this._WorkQueue[pWorkItemHash] || null;
	}

	// ====================================================================
	// Direct Dispatch (synchronous HTTP dispatch)
	// ====================================================================

	/**
	 * Dispatch a work item and wait for completion.
	 *
	 * Used by the POST /Beacon/Work/Dispatch endpoint to provide
	 * synchronous request/response semantics for external consumers
	 * (e.g. retold-remote). The HTTP connection stays open until the
	 * beacon completes the work item.
	 *
	 * @param {object} pWorkItemInfo - Work item details (no RunHash/NodeHash needed)
	 * @param {function} fCallback - function(pError, pResult) called when work completes
	 */
	dispatchAndWait(pWorkItemInfo, fCallback)
	{
		// Ensure no RunHash — direct dispatch bypasses the operation graph
		pWorkItemInfo.RunHash = '';
		pWorkItemInfo.NodeHash = '';
		pWorkItemInfo.OperationHash = '';

		// Enqueue the work item
		let tmpWorkItem = this.enqueueWorkItem(pWorkItemInfo);

		let tmpTimeoutMs = pWorkItemInfo.TimeoutMs || this.fable.settings.UltravisorBeaconWorkItemTimeoutMs || 300000;

		// Register completion callback
		let tmpTimeoutHandle = setTimeout(
			() =>
			{
				// Timeout — clean up and call back with error
				let tmpEntry = this._DirectDispatchCallbacks[tmpWorkItem.WorkItemHash];
				if (tmpEntry)
				{
					delete this._DirectDispatchCallbacks[tmpWorkItem.WorkItemHash];

					// Clean up the work item from the queue
					let tmpWI = this._WorkQueue[tmpWorkItem.WorkItemHash];
					if (tmpWI)
					{
						this._removeWorkItemFromBeacon(tmpWI.AssignedBeaconID, tmpWorkItem.WorkItemHash);
						delete this._WorkQueue[tmpWorkItem.WorkItemHash];
					}

					this.log.warn(`BeaconCoordinator: direct dispatch [${tmpWorkItem.WorkItemHash}] timed out after ${tmpTimeoutMs}ms.`);
					tmpEntry.callback(new Error(`Direct dispatch timed out after ${tmpTimeoutMs}ms.`));
				}
			},
			tmpTimeoutMs);

		this._DirectDispatchCallbacks[tmpWorkItem.WorkItemHash] =
		{
			callback: fCallback,
			timeoutHandle: tmpTimeoutHandle
		};

		this.log.info(`BeaconCoordinator: direct dispatch [${tmpWorkItem.WorkItemHash}] waiting for completion (timeout: ${tmpTimeoutMs}ms).`);
	}

	/**
	 * Check if a work item has a direct dispatch callback registered.
	 * If so, call it and return true. Otherwise return false.
	 *
	 * @param {string} pWorkItemHash
	 * @param {object|null} pError - Error object (for fail path)
	 * @param {object|null} pResult - Result object (for complete path)
	 * @returns {boolean} True if a direct dispatch callback was found and called
	 */
	_resolveDirectDispatch(pWorkItemHash, pError, pResult)
	{
		let tmpEntry = this._DirectDispatchCallbacks[pWorkItemHash];

		if (!tmpEntry)
		{
			return false;
		}

		// Clear the timeout
		clearTimeout(tmpEntry.timeoutHandle);
		delete this._DirectDispatchCallbacks[pWorkItemHash];

		if (pError)
		{
			tmpEntry.callback(pError);
		}
		else
		{
			tmpEntry.callback(null, pResult);
		}

		return true;
	}

	// ====================================================================
	// Progress Reporting
	// ====================================================================

	/**
	 * Update progress for a running work item.
	 *
	 * Called by the Beacon during execution to report progress and
	 * stream log entries. Progress data is stored on the work item
	 * record and reflected in the manifest's WaitingTasks so it
	 * surfaces via GET /Manifest/:RunHash.
	 *
	 * @param {string} pWorkItemHash
	 * @param {object} pProgressData - { Percent?, Message?, Step?, TotalSteps?, Log? }
	 * @returns {boolean} true if progress was updated
	 */
	updateProgress(pWorkItemHash, pProgressData)
	{
		let tmpWorkItem = this._WorkQueue[pWorkItemHash];

		if (!tmpWorkItem)
		{
			return false;
		}

		if (tmpWorkItem.Status !== 'Running' && tmpWorkItem.Status !== 'Assigned')
		{
			return false;
		}

		// Update progress fields on the work item
		tmpWorkItem.Progress = {
			Percent: (pProgressData.Percent !== undefined) ? pProgressData.Percent : (tmpWorkItem.Progress ? tmpWorkItem.Progress.Percent : undefined),
			Message: pProgressData.Message || (tmpWorkItem.Progress ? tmpWorkItem.Progress.Message : ''),
			Step: (pProgressData.Step !== undefined) ? pProgressData.Step : (tmpWorkItem.Progress ? tmpWorkItem.Progress.Step : undefined),
			TotalSteps: (pProgressData.TotalSteps !== undefined) ? pProgressData.TotalSteps : (tmpWorkItem.Progress ? tmpWorkItem.Progress.TotalSteps : undefined),
			UpdatedAt: new Date().toISOString()
		};

		// Accumulate log entries
		if (Array.isArray(pProgressData.Log) && pProgressData.Log.length > 0)
		{
			if (!tmpWorkItem.AccumulatedLog)
			{
				tmpWorkItem.AccumulatedLog = [];
			}
			for (let i = 0; i < pProgressData.Log.length; i++)
			{
				tmpWorkItem.AccumulatedLog.push(pProgressData.Log[i]);
			}
		}

		// Update the manifest's WaitingTasks entry so progress surfaces
		// via GET /Manifest/:RunHash
		let tmpManifest = this._getService('UltravisorExecutionManifest');
		if (tmpManifest)
		{
			let tmpContext = tmpManifest.getRun(tmpWorkItem.RunHash);
			if (tmpContext && tmpContext.WaitingTasks[tmpWorkItem.NodeHash])
			{
				tmpContext.WaitingTasks[tmpWorkItem.NodeHash].Progress = tmpWorkItem.Progress;
			}
		}

		return true;
	}

	// ====================================================================
	// Affinity
	// ====================================================================

	/**
	 * List all active affinity bindings.
	 *
	 * @returns {Array}
	 */
	listAffinityBindings()
	{
		return Object.values(this._AffinityBindings);
	}

	/**
	 * Clear a specific affinity binding.
	 *
	 * @param {string} pAffinityKey
	 * @returns {boolean}
	 */
	clearAffinityBinding(pAffinityKey)
	{
		if (this._AffinityBindings[pAffinityKey])
		{
			delete this._AffinityBindings[pAffinityKey];
			return true;
		}
		return false;
	}

	// ====================================================================
	// Internal Helpers
	// ====================================================================

	/**
	 * Get a service by type name.
	 */
	_getService(pTypeName)
	{
		return this.fable.servicesMap[pTypeName]
			? Object.values(this.fable.servicesMap[pTypeName])[0]
			: null;
	}

	/**
	 * Remove a work item hash from a Beacon's CurrentWorkItems array.
	 */
	_removeWorkItemFromBeacon(pBeaconID, pWorkItemHash)
	{
		if (!pBeaconID)
		{
			return;
		}

		let tmpBeacon = this._Beacons[pBeaconID];

		if (!tmpBeacon)
		{
			return;
		}

		let tmpIndex = tmpBeacon.CurrentWorkItems.indexOf(pWorkItemHash);
		if (tmpIndex > -1)
		{
			tmpBeacon.CurrentWorkItems.splice(tmpIndex, 1);
		}

		// Update status
		if (tmpBeacon.CurrentWorkItems.length < tmpBeacon.MaxConcurrent)
		{
			tmpBeacon.Status = 'Online';
		}
	}

	/**
	 * Check for timed-out work items and dead Beacons.
	 */
	_checkTimeouts()
	{
		let tmpNow = Date.now();

		// Check work item timeouts
		let tmpWorkItemHashes = Object.keys(this._WorkQueue);
		for (let i = 0; i < tmpWorkItemHashes.length; i++)
		{
			let tmpWorkItem = this._WorkQueue[tmpWorkItemHashes[i]];

			if (tmpWorkItem.Status !== 'Running' && tmpWorkItem.Status !== 'Assigned')
			{
				continue;
			}

			let tmpClaimedTime = tmpWorkItem.ClaimedAt ? new Date(tmpWorkItem.ClaimedAt).getTime() : tmpNow;
			let tmpElapsed = tmpNow - tmpClaimedTime;

			if (tmpElapsed > tmpWorkItem.TimeoutMs)
			{
				this.log.warn(`BeaconCoordinator: work item [${tmpWorkItem.WorkItemHash}] timed out after ${tmpElapsed}ms.`);
				this.failWorkItem(tmpWorkItem.WorkItemHash,
					{ ErrorMessage: `Work item timed out after ${tmpElapsed}ms.`, Log: ['Timeout'] },
					(pError) =>
					{
						if (pError)
						{
							this.log.error(`BeaconCoordinator: error handling timeout for [${tmpWorkItem.WorkItemHash}]: ${pError.message}`);
						}
					});
			}
		}

		// Check Beacon heartbeat timeouts
		let tmpHeartbeatTimeout = this.fable.settings.UltravisorBeaconHeartbeatTimeoutMs || 60000;
		let tmpBeaconIDs = Object.keys(this._Beacons);
		for (let i = 0; i < tmpBeaconIDs.length; i++)
		{
			let tmpBeacon = this._Beacons[tmpBeaconIDs[i]];
			let tmpLastHeartbeat = new Date(tmpBeacon.LastHeartbeat).getTime();
			let tmpElapsed = tmpNow - tmpLastHeartbeat;

			if (tmpElapsed > tmpHeartbeatTimeout && tmpBeacon.Status !== 'Offline')
			{
				this.log.warn(`BeaconCoordinator: beacon [${tmpBeacon.BeaconID}] missed heartbeat (${tmpElapsed}ms since last), marking Offline.`);
				tmpBeacon.Status = 'Offline';
			}
		}

		// Clean up expired affinity bindings
		let tmpAffinityKeys = Object.keys(this._AffinityBindings);
		for (let i = 0; i < tmpAffinityKeys.length; i++)
		{
			let tmpBinding = this._AffinityBindings[tmpAffinityKeys[i]];
			if (new Date(tmpBinding.ExpiresAt).getTime() < tmpNow)
			{
				delete this._AffinityBindings[tmpAffinityKeys[i]];
			}
		}
	}
}

module.exports = UltravisorBeaconCoordinator;
module.exports.default_configuration = {};
