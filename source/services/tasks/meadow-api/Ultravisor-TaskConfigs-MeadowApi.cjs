/**
 * Task configurations for the "Meadow API" capability.
 *
 * REST calls to a Meadow API server for CRUD operations.
 *
 * Contains:
 *   - meadow-read     — Reads a single record by ID from a Meadow REST endpoint.
 *   - meadow-reads    — Reads multiple records with optional filter.
 *   - meadow-create   — Creates a new record via a Meadow REST endpoint.
 *   - meadow-update   — Updates a record via a Meadow REST endpoint.
 *   - meadow-delete   — Deletes a record by ID via a Meadow REST endpoint.
 *   - meadow-count    — Counts records for an entity via a Meadow REST endpoint.
 */


// ── Module-scoped helpers ───────────────────────────────────────────

/**
 * Get a service instance from the fable services map.
 */
function _getService(pTask, pTypeName)
{
	if (pTask.fable.servicesMap[pTypeName])
	{
		return Object.values(pTask.fable.servicesMap[pTypeName])[0];
	}
	return null;
}


module.exports =
[
	// ── meadow-read ────────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'meadow-read',
			Type: 'meadow-read',
			Name: 'Meadow Read',
			Description: 'Reads a single record by ID from a Meadow REST endpoint.',
			Category: 'meadow',
			Capability: 'Meadow API',
			Action: 'Read',
			Tier: 'Service',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Complete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'Entity', DataType: 'String', Required: true, Description: 'Entity/table name' },
				{ Name: 'Endpoint', DataType: 'String', Required: true, Description: 'Base URL of the Meadow API' },
				{ Name: 'RecordID', DataType: 'String', Required: true, Description: 'ID of the record to read' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store the record' }
			],
			StateOutputs: [
				{ Name: 'Record', DataType: 'Object', Description: 'The retrieved record' }
			],
			DefaultSettings: { Entity: '', Endpoint: '', RecordID: '', Destination: '' }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpEntity = pResolvedSettings.Entity || '';
			let tmpEndpoint = pResolvedSettings.Endpoint || '';
			let tmpRecordID = pResolvedSettings.RecordID || '';

			if (!tmpEntity || !tmpEndpoint || !tmpRecordID)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['MeadowRead: Entity, Endpoint, and RecordID are required.'] });
			}

			let tmpRestClient = _getService(pTask, 'RestClient');
			if (!tmpRestClient)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['MeadowRead: RestClient service not found.'] });
			}

			let tmpURL = `${tmpEndpoint}/${tmpEntity}/${tmpRecordID}`;

			tmpRestClient.getJSON(tmpURL,
				function (pError, pResponse, pData)
				{
					if (pError)
					{
						return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`MeadowRead: GET ${tmpURL} failed: ${pError.message}`] });
					}

					let tmpStateWrites = {};
					if (pResolvedSettings.Destination)
					{
						tmpStateWrites[pResolvedSettings.Destination] = pData;
					}

					return fCallback(null, {
						EventToFire: 'Complete',
						Outputs: { Record: pData },
						StateWrites: tmpStateWrites,
						Log: [`MeadowRead: retrieved ${tmpEntity} #${tmpRecordID}`]
					});
				});
		}
	},

	// ── meadow-reads ───────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'meadow-reads',
			Type: 'meadow-reads',
			Name: 'Meadow Reads',
			Description: 'Reads multiple records from a Meadow REST endpoint with optional filter.',
			Category: 'meadow',
			Capability: 'Meadow API',
			Action: 'ReadMany',
			Tier: 'Service',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Complete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'Entity', DataType: 'String', Required: true, Description: 'Entity/table name' },
				{ Name: 'Endpoint', DataType: 'String', Required: true, Description: 'Base URL of the Meadow API' },
				{ Name: 'Filter', DataType: 'String', Required: false, Description: 'Meadow filter expression' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store the records' }
			],
			StateOutputs: [
				{ Name: 'Records', DataType: 'Array', Description: 'Retrieved records' }
			],
			DefaultSettings: { Entity: '', Endpoint: '', Filter: '', Destination: '' }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpEntity = pResolvedSettings.Entity || '';
			let tmpEndpoint = pResolvedSettings.Endpoint || '';

			if (!tmpEntity || !tmpEndpoint)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['MeadowReads: Entity and Endpoint are required.'] });
			}

			let tmpRestClient = _getService(pTask, 'RestClient');
			if (!tmpRestClient)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['MeadowReads: RestClient service not found.'] });
			}

			let tmpURL = `${tmpEndpoint}/${tmpEntity}s`;
			if (pResolvedSettings.Filter)
			{
				tmpURL += `/FilteredTo/${pResolvedSettings.Filter}/0/100`;
			}

			tmpRestClient.getJSON(tmpURL,
				function (pError, pResponse, pData)
				{
					if (pError)
					{
						return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`MeadowReads: GET ${tmpURL} failed: ${pError.message}`] });
					}

					let tmpRecords = Array.isArray(pData) ? pData : [];
					let tmpStateWrites = {};
					if (pResolvedSettings.Destination)
					{
						tmpStateWrites[pResolvedSettings.Destination] = tmpRecords;
					}

					return fCallback(null, {
						EventToFire: 'Complete',
						Outputs: { Records: tmpRecords },
						StateWrites: tmpStateWrites,
						Log: [`MeadowReads: retrieved ${tmpRecords.length} ${tmpEntity} records`]
					});
				});
		}
	},

	// ── meadow-create ──────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'meadow-create',
			Type: 'meadow-create',
			Name: 'Meadow Create',
			Description: 'Creates a new record via a Meadow REST endpoint.',
			Category: 'meadow',
			Capability: 'Meadow API',
			Action: 'Create',
			Tier: 'Service',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Complete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'Entity', DataType: 'String', Required: true, Description: 'Entity/table name' },
				{ Name: 'Endpoint', DataType: 'String', Required: true, Description: 'Base URL of the Meadow API' },
				{ Name: 'DataAddress', DataType: 'String', Required: false, Description: 'State address of the record data to create' }
			],
			StateOutputs: [
				{ Name: 'Created', DataType: 'Object', Description: 'The created record' }
			],
			DefaultSettings: { Entity: '', Endpoint: '', DataAddress: '' }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpEntity = pResolvedSettings.Entity || '';
			let tmpEndpoint = pResolvedSettings.Endpoint || '';

			if (!tmpEntity || !tmpEndpoint)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['MeadowCreate: Entity and Endpoint are required.'] });
			}

			let tmpRestClient = _getService(pTask, 'RestClient');
			if (!tmpRestClient)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['MeadowCreate: RestClient service not found.'] });
			}

			let tmpBody = {};
			if (pResolvedSettings.DataAddress && pExecutionContext.StateManager)
			{
				let tmpData = pExecutionContext.StateManager.resolveAddress(pResolvedSettings.DataAddress, pExecutionContext, pExecutionContext.NodeHash);
				if (typeof(tmpData) === 'object' && tmpData !== null) { tmpBody = tmpData; }
			}

			tmpRestClient.postJSON({ url: `${tmpEndpoint}/${tmpEntity}`, body: tmpBody },
				function (pError, pResponse, pData)
				{
					if (pError)
					{
						return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`MeadowCreate: POST failed: ${pError.message}`] });
					}

					return fCallback(null, {
						EventToFire: 'Complete',
						Outputs: { Created: pData },
						Log: [`MeadowCreate: created ${tmpEntity} record`]
					});
				});
		}
	},

	// ── meadow-update ──────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'meadow-update',
			Type: 'meadow-update',
			Name: 'Meadow Update',
			Description: 'Updates a record via a Meadow REST endpoint.',
			Category: 'meadow',
			Capability: 'Meadow API',
			Action: 'Update',
			Tier: 'Service',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Complete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'Entity', DataType: 'String', Required: true, Description: 'Entity/table name' },
				{ Name: 'Endpoint', DataType: 'String', Required: true, Description: 'Base URL of the Meadow API' },
				{ Name: 'DataAddress', DataType: 'String', Required: false, Description: 'State address of the record data to update' }
			],
			StateOutputs: [
				{ Name: 'Updated', DataType: 'Object', Description: 'The updated record' }
			],
			DefaultSettings: { Entity: '', Endpoint: '', DataAddress: '' }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpEntity = pResolvedSettings.Entity || '';
			let tmpEndpoint = pResolvedSettings.Endpoint || '';

			if (!tmpEntity || !tmpEndpoint)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['MeadowUpdate: Entity and Endpoint are required.'] });
			}

			let tmpRestClient = _getService(pTask, 'RestClient');
			if (!tmpRestClient)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['MeadowUpdate: RestClient service not found.'] });
			}

			let tmpBody = {};
			if (pResolvedSettings.DataAddress && pExecutionContext.StateManager)
			{
				let tmpData = pExecutionContext.StateManager.resolveAddress(pResolvedSettings.DataAddress, pExecutionContext, pExecutionContext.NodeHash);
				if (typeof(tmpData) === 'object' && tmpData !== null) { tmpBody = tmpData; }
			}

			tmpRestClient.putJSON({ url: `${tmpEndpoint}/${tmpEntity}`, body: tmpBody },
				function (pError, pResponse, pData)
				{
					if (pError)
					{
						return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`MeadowUpdate: PUT failed: ${pError.message}`] });
					}

					return fCallback(null, {
						EventToFire: 'Complete',
						Outputs: { Updated: pData },
						Log: [`MeadowUpdate: updated ${tmpEntity} record`]
					});
				});
		}
	},

	// ── meadow-delete ──────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'meadow-delete',
			Type: 'meadow-delete',
			Name: 'Meadow Delete',
			Description: 'Deletes a record by ID via a Meadow REST endpoint.',
			Category: 'meadow',
			Capability: 'Meadow API',
			Action: 'Delete',
			Tier: 'Service',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Done' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'Entity', DataType: 'String', Required: true, Description: 'Entity/table name' },
				{ Name: 'Endpoint', DataType: 'String', Required: true, Description: 'Base URL of the Meadow API' },
				{ Name: 'RecordID', DataType: 'String', Required: true, Description: 'ID of the record to delete' }
			],
			StateOutputs: [],
			DefaultSettings: { Entity: '', Endpoint: '', RecordID: '' }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpEntity = pResolvedSettings.Entity || '';
			let tmpEndpoint = pResolvedSettings.Endpoint || '';
			let tmpRecordID = pResolvedSettings.RecordID || '';

			if (!tmpEntity || !tmpEndpoint || !tmpRecordID)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['MeadowDelete: Entity, Endpoint, and RecordID are required.'] });
			}

			let tmpRestClient = _getService(pTask, 'RestClient');
			if (!tmpRestClient)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['MeadowDelete: RestClient service not found.'] });
			}

			tmpRestClient.delJSON({ url: `${tmpEndpoint}/${tmpEntity}/${tmpRecordID}` },
				function (pError, pResponse, pData)
				{
					if (pError)
					{
						return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`MeadowDelete: DELETE failed: ${pError.message}`] });
					}

					return fCallback(null, {
						EventToFire: 'Done',
						Outputs: {},
						Log: [`MeadowDelete: deleted ${tmpEntity} #${tmpRecordID}`]
					});
				});
		}
	},

	// ── meadow-count ───────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'meadow-count',
			Type: 'meadow-count',
			Name: 'Meadow Count',
			Description: 'Counts records for an entity via a Meadow REST endpoint.',
			Category: 'meadow',
			Capability: 'Meadow API',
			Action: 'Count',
			Tier: 'Service',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Complete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'Entity', DataType: 'String', Required: true, Description: 'Entity/table name' },
				{ Name: 'Endpoint', DataType: 'String', Required: true, Description: 'Base URL of the Meadow API' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store the count' }
			],
			StateOutputs: [
				{ Name: 'Count', DataType: 'Number', Description: 'Number of records' }
			],
			DefaultSettings: { Entity: '', Endpoint: '', Destination: '' }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpEntity = pResolvedSettings.Entity || '';
			let tmpEndpoint = pResolvedSettings.Endpoint || '';

			if (!tmpEntity || !tmpEndpoint)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['MeadowCount: Entity and Endpoint are required.'] });
			}

			let tmpRestClient = _getService(pTask, 'RestClient');
			if (!tmpRestClient)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['MeadowCount: RestClient service not found.'] });
			}

			tmpRestClient.getJSON(`${tmpEndpoint}/${tmpEntity}s/Count`,
				function (pError, pResponse, pData)
				{
					if (pError)
					{
						return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`MeadowCount: GET failed: ${pError.message}`] });
					}

					let tmpCount = (typeof(pData) === 'object' && pData !== null && 'Count' in pData) ? pData.Count : pData;
					let tmpStateWrites = {};
					if (pResolvedSettings.Destination)
					{
						tmpStateWrites[pResolvedSettings.Destination] = tmpCount;
					}

					return fCallback(null, {
						EventToFire: 'Complete',
						Outputs: { Count: tmpCount },
						StateWrites: tmpStateWrites,
						Log: [`MeadowCount: ${tmpEntity} count = ${tmpCount}`]
					});
				});
		}
	}
];
