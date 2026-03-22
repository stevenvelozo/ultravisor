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

		// --- Streaming Dispatch Handlers ---
		// Map of WorkItemHash → { writeFrame, timeoutHandle }
		// Used by dispatchAndStream() for binary-framed streaming dispatch
		this._StreamDispatchHandlers = {};

		// --- WebSocket Push Handler ---
		// Called when a work item is enqueued to attempt immediate push
		// to a WebSocket-connected beacon.  Set by the API server.
		// Signature: function(pBeaconID, pSanitizedWorkItem) -> boolean
		this._WorkItemPushHandler = null;

		// --- Queue Journal ---
		// Cached reference to the BeaconQueueJournal service (if available).
		// Set lazily on first use via _getJournal().
		this._Journal = null;
		this._JournalChecked = false;

		// --- Work Item Hash Counter ---
		// Monotonic counter appended to WorkItemHash to prevent collisions
		// when multiple items are enqueued in the same millisecond.
		this._WorkItemCounter = 0;

		// --- Action Catalog ---
		// In-memory mirror of the persistent action catalog from HypervisorState.
		// Populated on beacon registration and from persisted state at startup.
		// Map of 'Capability:Action' → { Capability, Action, Description, SettingsSchema, SourceBeacons: [] }
		this._ActionCatalog = {};
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

	/**
	 * Get the queue journal service (lazy lookup, cached).
	 *
	 * @returns {object|null}
	 */
	_getJournal()
	{
		if (!this._JournalChecked)
		{
			this._JournalChecked = true;
			let tmpJournal = this._getService('UltravisorBeaconQueueJournal');
			if (tmpJournal && tmpJournal.isEnabled())
			{
				this._Journal = tmpJournal;
			}
		}
		return this._Journal;
	}

	/**
	 * Restore work queue and affinity bindings from the journal.
	 *
	 * Called once at startup after the journal service is initialized.
	 * Replays the journal and merges the resulting state into the
	 * coordinator's in-memory maps.
	 */
	restoreFromJournal()
	{
		let tmpJournal = this._getJournal();

		if (!tmpJournal)
		{
			return;
		}

		let tmpState = tmpJournal.replay();

		// Merge work queue
		let tmpRestoredWorkItems = Object.keys(tmpState.WorkQueue);
		for (let i = 0; i < tmpRestoredWorkItems.length; i++)
		{
			let tmpHash = tmpRestoredWorkItems[i];
			if (!this._WorkQueue[tmpHash])
			{
				this._WorkQueue[tmpHash] = tmpState.WorkQueue[tmpHash];
			}
		}

		// Merge affinity bindings
		let tmpRestoredBindings = Object.keys(tmpState.AffinityBindings);
		for (let i = 0; i < tmpRestoredBindings.length; i++)
		{
			let tmpKey = tmpRestoredBindings[i];
			if (!this._AffinityBindings[tmpKey])
			{
				this._AffinityBindings[tmpKey] = tmpState.AffinityBindings[tmpKey];
			}
		}

		let tmpQueueCount = Object.keys(this._WorkQueue).length;
		let tmpAffinityCount = Object.keys(this._AffinityBindings).length;

		if (tmpQueueCount > 0 || tmpAffinityCount > 0)
		{
			this.log.info(`BeaconCoordinator: restored state from journal — ${tmpQueueCount} work items, ${tmpAffinityCount} affinity bindings.`);
		}
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
			if (pBeaconInfo.Contexts)
			{
				tmpExistingBeacon.Contexts = pBeaconInfo.Contexts;
			}
			if (Array.isArray(pBeaconInfo.BindAddresses))
			{
				tmpExistingBeacon.BindAddresses = pBeaconInfo.BindAddresses;
			}

			this.log.info(`BeaconCoordinator: reconnected beacon [${tmpExistingBeacon.BeaconID}] "${tmpName}" with session [${tmpExistingBeacon.SessionID}].`);

			// Process action schemas into the persistent catalog on reconnect
			if (Array.isArray(pBeaconInfo.ActionSchemas) && pBeaconInfo.ActionSchemas.length > 0)
			{
				this._updateActionCatalog(tmpExistingBeacon.BeaconID, pBeaconInfo.ActionSchemas);
				this._registerCatalogTaskTypes();
			}

			// Process beacon-provided operation definitions on reconnect
			if (Array.isArray(pBeaconInfo.Operations) && pBeaconInfo.Operations.length > 0)
			{
				this._registerBeaconOperations(tmpExistingBeacon.BeaconID, pBeaconInfo.Operations);
			}

			// Probe reachability against other online beacons
			let tmpReachability = this._getService('UltravisorBeaconReachability');
			if (tmpReachability)
			{
				tmpReachability.onBeaconRegistered(tmpExistingBeacon.BeaconID);
			}

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
			Contexts: pBeaconInfo.Contexts || {},
			BindAddresses: Array.isArray(pBeaconInfo.BindAddresses) ? pBeaconInfo.BindAddresses : [],
			RegisteredAt: new Date().toISOString()
		};

		this._Beacons[tmpBeaconID] = tmpBeacon;
		this.log.info(`BeaconCoordinator: registered beacon [${tmpBeaconID}] "${tmpName}" with capabilities [${tmpBeacon.Capabilities.join(', ')}].`);

		// Process action schemas into the persistent catalog
		if (Array.isArray(pBeaconInfo.ActionSchemas) && pBeaconInfo.ActionSchemas.length > 0)
		{
			this._updateActionCatalog(tmpBeaconID, pBeaconInfo.ActionSchemas);
			this._registerCatalogTaskTypes();
		}

		// Process beacon-provided operation definitions
		if (Array.isArray(pBeaconInfo.Operations) && pBeaconInfo.Operations.length > 0)
		{
			this._registerBeaconOperations(tmpBeaconID, pBeaconInfo.Operations);
		}

		// Probe reachability against other online beacons
		let tmpReachability = this._getService('UltravisorBeaconReachability');
		if (tmpReachability)
		{
			tmpReachability.onBeaconRegistered(tmpBeaconID);
		}

		return tmpBeacon;
	}

	// ================================================================
	// Action Catalog
	// ================================================================

	/**
	 * Load the action catalog from persistent storage.
	 * Called once at startup after HypervisorState is initialized.
	 */
	loadActionCatalog()
	{
		let tmpState = this._getService('UltravisorHypervisorState');
		if (tmpState)
		{
			let tmpCatalog = tmpState.getActionCatalog();
			if (tmpCatalog && typeof(tmpCatalog) === 'object')
			{
				this._ActionCatalog = tmpCatalog;
				let tmpCount = Object.keys(this._ActionCatalog).length;
				if (tmpCount > 0)
				{
					this.log.info(`BeaconCoordinator: loaded ${tmpCount} action catalog entries from persistent storage.`);
					this._registerCatalogTaskTypes();
				}
			}
		}
	}

	/**
	 * Update the action catalog with schemas from a registering beacon.
	 *
	 * Each Capability:Action pair is upserted.  SourceBeacons tracks which
	 * beacons have reported this action.
	 *
	 * @param {string} pBeaconID - The registering beacon's ID
	 * @param {Array} pActionSchemas - Array of { Capability, Action, Description, SettingsSchema }
	 */
	_updateActionCatalog(pBeaconID, pActionSchemas)
	{
		for (let i = 0; i < pActionSchemas.length; i++)
		{
			let tmpSchema = pActionSchemas[i];
			let tmpKey = tmpSchema.Capability + ':' + tmpSchema.Action;

			if (this._ActionCatalog[tmpKey])
			{
				// Update description and schema (latest registration wins)
				this._ActionCatalog[tmpKey].Description = tmpSchema.Description || this._ActionCatalog[tmpKey].Description;
				this._ActionCatalog[tmpKey].SettingsSchema = tmpSchema.SettingsSchema || this._ActionCatalog[tmpKey].SettingsSchema;

				// Track source beacon
				if (this._ActionCatalog[tmpKey].SourceBeacons.indexOf(pBeaconID) === -1)
				{
					this._ActionCatalog[tmpKey].SourceBeacons.push(pBeaconID);
				}
			}
			else
			{
				this._ActionCatalog[tmpKey] = {
					Capability: tmpSchema.Capability,
					Action: tmpSchema.Action,
					Description: tmpSchema.Description || '',
					SettingsSchema: tmpSchema.SettingsSchema || [],
					SourceBeacons: [pBeaconID]
				};
			}
		}

		// Persist to HypervisorState
		let tmpState = this._getService('UltravisorHypervisorState');
		if (tmpState)
		{
			tmpState.updateActionCatalog(this._ActionCatalog);
		}

		this.log.info(`BeaconCoordinator: action catalog updated — ${Object.keys(this._ActionCatalog).length} entries.`);
	}

	/**
	 * Auto-generate and register task type configs from the action catalog.
	 *
	 * Each Capability:Action pair produces a config-driven task type that
	 * uses beaconDispatch() to execute.  Only registers types not already
	 * in the registry (built-in types take precedence).
	 */
	_registerCatalogTaskTypes()
	{
		let tmpRegistryServices = this.fable.servicesMap['UltravisorTaskTypeRegistry'];
		if (!tmpRegistryServices)
		{
			return;
		}

		let tmpRegistry = Object.values(tmpRegistryServices)[0];
		if (!tmpRegistry)
		{
			return;
		}

		let tmpBeaconDispatch = null;
		try
		{
			tmpBeaconDispatch = require('./tasks/Ultravisor-TaskHelper-BeaconDispatch.cjs');
		}
		catch (pError)
		{
			this.log.error(`BeaconCoordinator: could not load BeaconDispatch helper: ${pError.message}`);
			return;
		}

		let tmpKeys = Object.keys(this._ActionCatalog);
		let tmpRegistered = 0;

		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpEntry = this._ActionCatalog[tmpKeys[i]];
			let tmpHash = 'beacon-' + tmpEntry.Capability.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + tmpEntry.Action.toLowerCase().replace(/[^a-z0-9]/g, '-');

			// Skip if already registered (built-in types take precedence)
			if (tmpRegistry.hasTaskType(tmpHash))
			{
				continue;
			}

			// Build SettingsInputs from the action's SettingsSchema
			let tmpSettingsInputs = [];
			let tmpDefaultSettings = {};

			for (let j = 0; j < tmpEntry.SettingsSchema.length; j++)
			{
				let tmpField = tmpEntry.SettingsSchema[j];
				tmpSettingsInputs.push({
					Name: tmpField.Name,
					DataType: tmpField.DataType || 'String',
					Required: tmpField.Required || false,
					Description: tmpField.Description || ''
				});
				tmpDefaultSettings[tmpField.Name] = tmpField.Default || '';
			}

			// Add standard beacon dispatch settings
			tmpSettingsInputs.push({ Name: 'AffinityKey', DataType: 'String', Required: false, Description: 'Sticky routing key for beacon affinity.' });
			tmpSettingsInputs.push({ Name: 'TimeoutMs', DataType: 'Number', Required: false, Description: 'Work item timeout in milliseconds.' });
			tmpDefaultSettings.AffinityKey = '';
			tmpDefaultSettings.TimeoutMs = 300000;

			// Derive a display name from the action
			let tmpName = tmpEntry.Action.replace(/([a-z])([A-Z])/g, '$1 $2');

			let tmpConfig = {
				Definition: {
					Hash: tmpHash,
					Type: tmpHash,
					Name: tmpName,
					Description: tmpEntry.Description,
					Category: 'beacon-' + tmpEntry.Capability.toLowerCase().replace(/[^a-z0-9]/g, '-'),
					Capability: tmpEntry.Capability,
					Action: tmpEntry.Action,
					Tier: 'Beacon',
					EventInputs: [{ Name: 'Trigger' }],
					EventOutputs: [
						{ Name: 'Complete' },
						{ Name: 'Error', IsError: true }
					],
					SettingsInputs: tmpSettingsInputs,
					StateOutputs: [
						{ Name: 'Result', DataType: 'String', Description: 'Action result data.' },
						{ Name: 'StdOut', DataType: 'String', Description: 'Status message.' }
					],
					DefaultSettings: tmpDefaultSettings
				},
				Execute: this._createBeaconDispatchExecutor(tmpEntry.Capability, tmpEntry.Action, tmpBeaconDispatch, tmpSettingsInputs)
			};

			tmpRegistry.registerTaskTypeFromConfig(tmpConfig);
			tmpRegistered++;
		}

		if (tmpRegistered > 0)
		{
			this.log.info(`BeaconCoordinator: auto-registered ${tmpRegistered} task type(s) from action catalog.`);
		}
	}

	/**
	 * Create an Execute function for an auto-generated beacon task type.
	 *
	 * Coerces resolved settings to match the schema's DataType so that
	 * template-resolved strings like "80" become the number 80 when the
	 * schema says DataType: "Number".  This prevents brittle failures in
	 * downstream providers that are strict about types.
	 *
	 * @param {string} pCapability - The capability name
	 * @param {string} pAction - The action name
	 * @param {function} pBeaconDispatch - The beaconDispatch helper
	 * @param {Array} pSettingsSchema - SettingsInputs array with DataType info
	 * @returns {function} Execute function matching the task type config interface
	 */
	_createBeaconDispatchExecutor(pCapability, pAction, pBeaconDispatch, pSettingsSchema)
	{
		// Build a quick lookup of DataType by setting name
		let tmpTypeMap = {};
		if (Array.isArray(pSettingsSchema))
		{
			for (let i = 0; i < pSettingsSchema.length; i++)
			{
				tmpTypeMap[pSettingsSchema[i].Name] = pSettingsSchema[i].DataType || 'String';
			}
		}

		return function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			// Build settings object from resolved settings, excluding beacon dispatch meta-fields
			let tmpSettings = Object.assign({}, pResolvedSettings);
			delete tmpSettings.AffinityKey;
			delete tmpSettings.TimeoutMs;

			// Coerce types based on schema
			let tmpKeys = Object.keys(tmpSettings);
			for (let i = 0; i < tmpKeys.length; i++)
			{
				let tmpKey = tmpKeys[i];
				let tmpValue = tmpSettings[tmpKey];
				let tmpExpectedType = tmpTypeMap[tmpKey];

				if (tmpExpectedType === 'Number' && typeof tmpValue === 'string' && tmpValue.length > 0)
				{
					let tmpNum = Number(tmpValue);
					if (!isNaN(tmpNum))
					{
						tmpSettings[tmpKey] = tmpNum;
					}
				}
				else if (tmpExpectedType === 'Boolean' && typeof tmpValue === 'string')
				{
					tmpSettings[tmpKey] = (tmpValue === 'true' || tmpValue === '1');
				}
			}

			pBeaconDispatch(pTask, {
				Capability: pCapability,
				Action: pAction,
				Settings: tmpSettings,
				AffinityKey: pResolvedSettings.AffinityKey || '',
				TimeoutMs: pResolvedSettings.TimeoutMs || 300000
			}, pExecutionContext, fCallback);
		};
	}

	/**
	 * Register operation definitions provided by a beacon.
	 *
	 * @param {string} pBeaconID - The registering beacon's ID
	 * @param {Array} pOperations - Array of operation definition objects
	 */
	_registerBeaconOperations(pBeaconID, pOperations)
	{
		let tmpState = this._getService('UltravisorHypervisorState');
		if (!tmpState)
		{
			this.log.warn('BeaconCoordinator: HypervisorState not available; cannot register beacon operations.');
			return;
		}

		for (let i = 0; i < pOperations.length; i++)
		{
			let tmpOp = Object.assign({}, pOperations[i]);

			// Tag with beacon source
			tmpOp.SourceBeacon = pBeaconID;
			tmpOp.SourceType = 'Beacon';

			tmpState.updateOperation(tmpOp, (pError, pSavedOp) =>
			{
				if (pError)
				{
					this.log.error(`BeaconCoordinator: failed to register beacon operation: ${pError.message}`);
				}
				else
				{
					this.log.info(`BeaconCoordinator: registered beacon operation [${pSavedOp.Hash}] "${pSavedOp.Name || ''}".`);
				}
			});
		}
	}

	/**
	 * Get the full action catalog, annotated with availability.
	 *
	 * @returns {Array} Array of catalog entries, each with an Available boolean
	 */
	getActionCatalog()
	{
		let tmpResult = [];
		let tmpKeys = Object.keys(this._ActionCatalog);

		// Build set of capabilities from online beacons
		let tmpOnlineCapabilities = {};
		let tmpBeaconIDs = Object.keys(this._Beacons);
		for (let i = 0; i < tmpBeaconIDs.length; i++)
		{
			let tmpBeacon = this._Beacons[tmpBeaconIDs[i]];
			if (tmpBeacon.Status === 'Online')
			{
				for (let j = 0; j < tmpBeacon.Capabilities.length; j++)
				{
					tmpOnlineCapabilities[tmpBeacon.Capabilities[j]] = true;
				}
			}
		}

		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpEntry = this._ActionCatalog[tmpKeys[i]];
			tmpResult.push({
				Capability: tmpEntry.Capability,
				Action: tmpEntry.Action,
				Description: tmpEntry.Description,
				SettingsSchema: tmpEntry.SettingsSchema,
				Available: tmpOnlineCapabilities.hasOwnProperty(tmpEntry.Capability),
				SourceBeacons: tmpEntry.SourceBeacons
			});
		}

		return tmpResult;
	}

	/**
	 * Get the action catalog filtered by capability.
	 *
	 * @param {string} pCapability - Capability name to filter by
	 * @returns {Array} Filtered catalog entries
	 */
	getActionCatalogForCapability(pCapability)
	{
		return this.getActionCatalog().filter(
			(pEntry) => pEntry.Capability === pCapability
		);
	}

	// ================================================================
	// Beacon Lookup
	// ================================================================

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
	// Universal Address Resolution
	// ====================================================================

	/**
	 * Resolve a universal data address to a concrete URL.
	 *
	 * Universal addresses have the format:  >BeaconName/Context/Path
	 *
	 * The beacon is looked up by Name (not full ID) for human readability
	 * and stability across restarts.  The beacon's registered context
	 * provides the BaseURL used to build the concrete download URL.
	 *
	 * @param {string} pAddress - Universal address (e.g. ">retold-remote/File/Pictures/img.png")
	 * @returns {object|null} { URL, BeaconID, BeaconName, Context, Path } or null
	 */
	resolveUniversalAddress(pAddress)
	{
		if (!pAddress || typeof pAddress !== 'string' || pAddress.charAt(0) !== '>')
		{
			return null;
		}

		// Strip the leading '>' and split into parts
		let tmpParts = pAddress.substring(1).split('/');

		if (tmpParts.length < 3)
		{
			return null;
		}

		let tmpBeaconName = tmpParts[0];
		let tmpContext = tmpParts[1];
		let tmpPath = tmpParts.slice(2).join('/');

		// Look up beacon — try by ID first, then by name
		let tmpBeacon = this._Beacons[tmpBeaconName] || this.findBeaconByName(tmpBeaconName);

		if (!tmpBeacon)
		{
			let tmpRegistered = Object.values(this._Beacons).map((pB) => pB.Name);
			this.log.warn(`[Coordinator] resolveUniversalAddress: beacon "${tmpBeaconName}" not found. Registered beacons: [${tmpRegistered.join(', ')}]`);
			return null;
		}

		// Look up the context on the beacon
		let tmpContextDef = tmpBeacon.Contexts ? tmpBeacon.Contexts[tmpContext] : null;

		if (!tmpContextDef || !tmpContextDef.BaseURL)
		{
			this.log.warn(`[Coordinator] resolveUniversalAddress: context "${tmpContext}" not found on beacon "${tmpBeaconName}". Available contexts: [${Object.keys(tmpBeacon.Contexts || {}).join(', ')}]`);
			return null;
		}

		// Build the concrete URL.
		// BaseURL is the full reachable prefix, e.g.
		//   "http://localhost:7827/content/" or just "/content/"
		let tmpBaseURL = tmpContextDef.BaseURL;
		// Ensure trailing slash for clean join
		if (!tmpBaseURL.endsWith('/'))
		{
			tmpBaseURL = tmpBaseURL + '/';
		}

		// Encode path segments for URL safety
		let tmpEncodedPath = tmpPath.split('/').map(encodeURIComponent).join('/');

		let tmpURL = tmpBaseURL + tmpEncodedPath;

		return {
			URL: tmpURL,
			BeaconID: tmpBeacon.BeaconID,
			BeaconName: tmpBeacon.Name,
			Context: tmpContext,
			Path: tmpPath,
			Filename: tmpParts[tmpParts.length - 1]
		};
	}

	/**
	 * Scan an object for universal addresses and resolve them all.
	 *
	 * @param {object} pObject - Object to scan (e.g. work item Settings)
	 * @returns {object[]} Array of { Key, Address, Resolved } for each found address
	 */
	scanAndResolveAddresses(pObject)
	{
		let tmpResults = [];

		if (!pObject || typeof pObject !== 'object')
		{
			return tmpResults;
		}

		let tmpKeys = Object.keys(pObject);
		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpValue = pObject[tmpKeys[i]];
			if (typeof tmpValue === 'string' && tmpValue.charAt(0) === '>')
			{
				let tmpResolved = this.resolveUniversalAddress(tmpValue);
				if (tmpResolved)
				{
					tmpResults.push({
						Key: tmpKeys[i],
						Address: tmpValue,
						Resolved: tmpResolved
					});
				}
			}
		}

		return tmpResults;
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
		this.log.info(`[Coordinator] enqueueWorkItem: capability=${pWorkItemInfo.Capability} action=${pWorkItemInfo.Action} run=${pWorkItemInfo.RunHash} node=${pWorkItemInfo.NodeHash}`);
		let tmpTimestamp = Date.now();
		this._WorkItemCounter++;
		let tmpWorkItemHash = `wi-${pWorkItemInfo.RunHash || 'unknown'}-${pWorkItemInfo.NodeHash || 'unknown'}-${tmpTimestamp}-${this._WorkItemCounter}`;

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

		// Journal the enqueue
		let tmpJournal = this._getJournal();
		if (tmpJournal)
		{
			tmpJournal.appendEntry('enqueue', {
				WorkItemHash: tmpWorkItem.WorkItemHash,
				RunHash: tmpWorkItem.RunHash,
				NodeHash: tmpWorkItem.NodeHash,
				OperationHash: tmpWorkItem.OperationHash,
				Capability: tmpWorkItem.Capability,
				Action: tmpWorkItem.Action,
				Settings: tmpWorkItem.Settings,
				AffinityKey: tmpWorkItem.AffinityKey,
				AssignedBeaconID: tmpWorkItem.AssignedBeaconID,
				Status: tmpWorkItem.Status,
				TimeoutMs: tmpWorkItem.TimeoutMs,
				CreatedAt: tmpWorkItem.CreatedAt,
				ClaimedAt: tmpWorkItem.ClaimedAt
			});

			// If affinity pre-assigned, journal the binding too
			if (tmpWorkItem.AffinityKey && tmpWorkItem.Status === 'Assigned')
			{
				let tmpBinding = this._AffinityBindings[tmpWorkItem.AffinityKey];
				if (tmpBinding)
				{
					tmpJournal.appendEntry('affinity-create', tmpBinding);
				}
			}
		}

		// Attempt immediate push to a WebSocket-connected beacon
		if (tmpWorkItem.Status === 'Pending')
		{
			this._tryPushToWebSocketBeacon(tmpWorkItem);
		}
		else if (tmpWorkItem.Status === 'Assigned' && tmpWorkItem.AssignedBeaconID && this._WorkItemPushHandler)
		{
			// Affinity pre-assigned — push directly to the assigned beacon via WebSocket
			tmpWorkItem.Status = 'Running';
			let tmpPushed = this._WorkItemPushHandler(tmpWorkItem.AssignedBeaconID,
				this._sanitizeWorkItemForBeacon(tmpWorkItem));

			if (tmpPushed)
			{
				this.log.info(`BeaconCoordinator: pushed affinity-assigned work item [${tmpWorkItemHash}] to WebSocket beacon [${tmpWorkItem.AssignedBeaconID}].`);
			}
			else
			{
				// WebSocket push failed — revert to Assigned for HTTP poll pickup
				tmpWorkItem.Status = 'Assigned';
			}
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

				// Journal the claim and any affinity binding
				let tmpJournal = this._getJournal();
				if (tmpJournal)
				{
					tmpJournal.appendEntry('claim', {
						WorkItemHash: pWorkItem.WorkItemHash,
						BeaconID: tmpBeacon.BeaconID,
						ClaimedAt: pWorkItem.ClaimedAt
					});

					if (pWorkItem.AffinityKey && this._AffinityBindings[pWorkItem.AffinityKey])
					{
						tmpJournal.appendEntry('affinity-create', this._AffinityBindings[pWorkItem.AffinityKey]);
					}
				}

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

			// Journal the claim and any new affinity binding
			let tmpJournal = this._getJournal();
			if (tmpJournal)
			{
				tmpJournal.appendEntry('claim', {
					WorkItemHash: tmpWorkItem.WorkItemHash,
					BeaconID: pBeaconID,
					ClaimedAt: tmpWorkItem.ClaimedAt
				});

				if (tmpWorkItem.AffinityKey && this._AffinityBindings[tmpWorkItem.AffinityKey])
				{
					tmpJournal.appendEntry('affinity-create', this._AffinityBindings[tmpWorkItem.AffinityKey]);
				}
			}

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
	/**
	 * Record a binary result file uploaded by a beacon.
	 *
	 * Writes the file to the operation's staging directory so downstream
	 * tasks (like send-result) can find it.
	 *
	 * @param {string} pWorkItemHash - The work item hash
	 * @param {string} pFilename - Output filename (e.g. 'thumbnail.jpg')
	 * @param {Buffer} pFileBuffer - Raw file bytes
	 * @returns {object|null} { StagingPath, FilePath } on success, or null
	 */
	recordResultUpload(pWorkItemHash, pFilename, pFileBuffer)
	{
		let tmpWorkItem = this._WorkQueue[pWorkItemHash];
		if (!tmpWorkItem)
		{
			this.log.warn(`[Coordinator] recordResultUpload: work item [${pWorkItemHash}] not found.`);
			return null;
		}

		if (!tmpWorkItem.RunHash)
		{
			this.log.warn(`[Coordinator] recordResultUpload: work item [${pWorkItemHash}] has no RunHash.`);
			return null;
		}

		// Look up the operation's staging directory from the manifest
		let tmpManifest = this._getService('UltravisorExecutionManifest');
		if (!tmpManifest)
		{
			this.log.warn('[Coordinator] recordResultUpload: UltravisorExecutionManifest service not found.');
			return null;
		}

		let tmpContext = tmpManifest.getRun(tmpWorkItem.RunHash);
		if (!tmpContext || !tmpContext.StagingPath)
		{
			this.log.warn(`[Coordinator] recordResultUpload: run [${tmpWorkItem.RunHash}] not found or has no staging path.`);
			return null;
		}

		let tmpFilePath = require('path').join(tmpContext.StagingPath, pFilename);

		try
		{
			require('fs').writeFileSync(tmpFilePath, pFileBuffer);
			this.log.info(`[Coordinator] recordResultUpload: wrote ${pFileBuffer.length} bytes → ${tmpFilePath}`);

			// Store the uploaded file path on the work item so completeWorkItem can reference it
			tmpWorkItem.UploadedResultPath = tmpFilePath;

			return { StagingPath: tmpContext.StagingPath, FilePath: tmpFilePath };
		}
		catch (pWriteError)
		{
			this.log.error(`[Coordinator] recordResultUpload: write failed: ${pWriteError.message}`);
			return null;
		}
	}

	completeWorkItem(pWorkItemHash, pResult, fCallback)
	{
		this.log.info(`[Coordinator] completeWorkItem: ${pWorkItemHash} resultKeys=${pResult ? Object.keys(pResult).join(',') : '(null)'}`);
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

		// Journal the completion
		let tmpJournal = this._getJournal();
		if (tmpJournal)
		{
			tmpJournal.appendEntry('complete', { WorkItemHash: pWorkItemHash });
		}

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

		// Check for streaming dispatch handler (binary-framed streaming)
		if (this._resolveStreamDispatch(pWorkItemHash, null, {
			Success: true,
			WorkItemHash: pWorkItemHash,
			Outputs: tmpFinalResult.Outputs || {},
			Log: tmpFinalResult.Log || []
		}))
		{
			// Streaming dispatch — clean up and done
			delete this._WorkQueue[pWorkItemHash];
			return fCallback(null);
		}

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
		this.log.warn(`[Coordinator] failWorkItem: ${pWorkItemHash} error=${pError ? pError.message || JSON.stringify(pError) : '(null)'}`);
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

		// Journal the failure
		let tmpJournal = this._getJournal();
		if (tmpJournal)
		{
			tmpJournal.appendEntry('fail', { WorkItemHash: pWorkItemHash });
		}

		// Remove from Beacon's current work list
		this._removeWorkItemFromBeacon(tmpWorkItem.AssignedBeaconID, pWorkItemHash);

		this.log.warn(`BeaconCoordinator: work item [${pWorkItemHash}] failed: ${pError.ErrorMessage || 'Unknown error'}`);

		// Check for streaming dispatch handler (binary-framed streaming)
		if (this._resolveStreamDispatch(pWorkItemHash,
			new Error(pError.ErrorMessage || 'Beacon work item failed.'), null))
		{
			// Streaming dispatch — clean up and done
			delete this._WorkQueue[pWorkItemHash];
			return fCallback(null);
		}

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
	// Streaming Dispatch (binary-framed HTTP streaming)
	// ====================================================================

	/**
	 * Dispatch a work item and stream progress/results back via a
	 * frame writer function.
	 *
	 * Used by POST /Beacon/Work/DispatchStream to provide real-time
	 * progress and binary output streaming to external consumers.
	 * The frame writer receives typed events:
	 *   - 'progress': JSON progress data
	 *   - 'data':     intermediate binary data (decoded from base64)
	 *   - 'binary':   final binary output (decoded from base64)
	 *   - 'result':   JSON result metadata
	 *   - 'error':    JSON error data
	 *   - 'end':      stream complete (no data)
	 *
	 * @param {object} pWorkItemInfo - Work item details (same as dispatchAndWait)
	 * @param {function} fFrameWriter - function(pType, pData) called for each frame
	 */
	dispatchAndStream(pWorkItemInfo, fFrameWriter)
	{
		// Direct dispatch — no operation graph
		pWorkItemInfo.RunHash = '';
		pWorkItemInfo.NodeHash = '';
		pWorkItemInfo.OperationHash = '';

		// Enqueue the work item
		let tmpWorkItem = this.enqueueWorkItem(pWorkItemInfo);

		let tmpTimeoutMs = pWorkItemInfo.TimeoutMs || this.fable.settings.UltravisorBeaconWorkItemTimeoutMs || 300000;

		// Register timeout
		let tmpTimeoutHandle = setTimeout(
			() =>
			{
				let tmpEntry = this._StreamDispatchHandlers[tmpWorkItem.WorkItemHash];
				if (tmpEntry)
				{
					delete this._StreamDispatchHandlers[tmpWorkItem.WorkItemHash];

					// Clean up the work item from the queue
					let tmpWI = this._WorkQueue[tmpWorkItem.WorkItemHash];
					if (tmpWI)
					{
						this._removeWorkItemFromBeacon(tmpWI.AssignedBeaconID, tmpWorkItem.WorkItemHash);
						delete this._WorkQueue[tmpWorkItem.WorkItemHash];
					}

					this.log.warn(`BeaconCoordinator: streaming dispatch [${tmpWorkItem.WorkItemHash}] timed out after ${tmpTimeoutMs}ms.`);
					tmpEntry.writeFrame('error', { Error: `Dispatch timed out after ${tmpTimeoutMs}ms.` });
					tmpEntry.writeFrame('end', null);
				}
			},
			tmpTimeoutMs);

		this._StreamDispatchHandlers[tmpWorkItem.WorkItemHash] =
		{
			writeFrame: fFrameWriter,
			timeoutHandle: tmpTimeoutHandle
		};

		this.log.info(`BeaconCoordinator: streaming dispatch [${tmpWorkItem.WorkItemHash}] waiting for frames (timeout: ${tmpTimeoutMs}ms).`);
	}

	/**
	 * Check if a work item has a streaming dispatch handler registered.
	 * If so, write the result/error frames, clean up, and return true.
	 *
	 * @param {string} pWorkItemHash
	 * @param {object|null} pError - Error info (for fail path)
	 * @param {object|null} pResult - Result info (for complete path)
	 * @returns {boolean} True if a streaming handler was found and resolved
	 */
	_resolveStreamDispatch(pWorkItemHash, pError, pResult)
	{
		let tmpEntry = this._StreamDispatchHandlers[pWorkItemHash];

		if (!tmpEntry)
		{
			return false;
		}

		// Clear the timeout
		clearTimeout(tmpEntry.timeoutHandle);
		delete this._StreamDispatchHandlers[pWorkItemHash];

		if (pError)
		{
			tmpEntry.writeFrame('error', { Error: pError.message || 'Unknown error' });
			tmpEntry.writeFrame('end', null);
		}
		else
		{
			let tmpOutputs = (pResult && pResult.Outputs) ? pResult.Outputs : {};

			// If there's base64-encoded output data, decode and send as binary
			// frame before the result metadata (avoids re-encoding for the client)
			if (tmpOutputs.OutputData)
			{
				try
				{
					let tmpBinaryData = Buffer.from(tmpOutputs.OutputData, 'base64');
					tmpEntry.writeFrame('binary', tmpBinaryData);
					// Remove base64 data from result metadata (already sent as binary)
					delete tmpOutputs.OutputData;
				}
				catch (pDecodeError)
				{
					// If decode fails, leave it in the JSON result
				}
			}

			tmpEntry.writeFrame('result', pResult);
			tmpEntry.writeFrame('end', null);
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

		// Forward progress to streaming dispatch handler if one exists
		let tmpStreamEntry = this._StreamDispatchHandlers[pWorkItemHash];
		if (tmpStreamEntry)
		{
			// Send progress JSON frame
			tmpStreamEntry.writeFrame('progress', tmpWorkItem.Progress);

			// If the beacon included intermediate binary data (base64-encoded),
			// decode and send as a binary data frame
			if (pProgressData.BinaryData)
			{
				try
				{
					let tmpBinary = Buffer.from(pProgressData.BinaryData, 'base64');
					tmpStreamEntry.writeFrame('data', tmpBinary);
				}
				catch (pDecodeError)
				{
					// Ignore decode errors for intermediate data
				}
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

			// Journal the clear
			let tmpJournal = this._getJournal();
			if (tmpJournal)
			{
				tmpJournal.appendEntry('affinity-clear', { AffinityKey: pAffinityKey });
			}

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
		let tmpJournalRef = this._getJournal();
		for (let i = 0; i < tmpAffinityKeys.length; i++)
		{
			let tmpBinding = this._AffinityBindings[tmpAffinityKeys[i]];
			if (new Date(tmpBinding.ExpiresAt).getTime() < tmpNow)
			{
				delete this._AffinityBindings[tmpAffinityKeys[i]];

				if (tmpJournalRef)
				{
					tmpJournalRef.appendEntry('affinity-clear', { AffinityKey: tmpAffinityKeys[i] });
				}
			}
		}
	}
}

module.exports = UltravisorBeaconCoordinator;
module.exports.default_configuration = {};
