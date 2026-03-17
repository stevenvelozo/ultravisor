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

/**
 * Parse headers from a JSON string or return empty object.
 */
function _parseHeaders(pHeadersString)
{
	if (!pHeadersString || typeof(pHeadersString) !== 'string' || pHeadersString.trim().length === 0)
	{
		return {};
	}

	try
	{
		let tmpHeaders = JSON.parse(pHeadersString);
		if (typeof(tmpHeaders) === 'object' && tmpHeaders !== null)
		{
			return tmpHeaders;
		}
	}
	catch (pError)
	{
		// Not valid JSON — ignore
	}

	return {};
}


module.exports =
[
	// ── meadow-read ────────────────────────────────────────────
	{
		Definition: require('./definitions/meadow-read.json'),
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

			tmpRestClient.getJSON({ url: tmpURL, headers: _parseHeaders(pResolvedSettings.Headers) },
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
		Definition: require('./definitions/meadow-reads.json'),
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
				tmpURL += `/FilteredTo/${pResolvedSettings.Filter}/${pResolvedSettings.PageNumber || 0}/${pResolvedSettings.PageSize || 100}`;
			}

			tmpRestClient.getJSON({ url: tmpURL, headers: _parseHeaders(pResolvedSettings.Headers) },
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
						Outputs: { Records: tmpRecords, RecordCount: tmpRecords.length },
						StateWrites: tmpStateWrites,
						Log: [`MeadowReads: retrieved ${tmpRecords.length} ${tmpEntity} records`]
					});
				});
		}
	},

	// ── meadow-create ──────────────────────────────────────────
	{
		Definition: require('./definitions/meadow-create.json'),
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

			tmpRestClient.postJSON({ url: `${tmpEndpoint}/${tmpEntity}`, body: tmpBody, headers: _parseHeaders(pResolvedSettings.Headers) },
				function (pError, pResponse, pData)
				{
					if (pError)
					{
						return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`MeadowCreate: POST failed: ${pError.message}`] });
					}

					let tmpStateWrites = {};
					if (pResolvedSettings.Destination)
					{
						tmpStateWrites[pResolvedSettings.Destination] = pData;
					}

					return fCallback(null, {
						EventToFire: 'Complete',
						Outputs: { Created: pData },
						StateWrites: tmpStateWrites,
						Log: [`MeadowCreate: created ${tmpEntity} record`]
					});
				});
		}
	},

	// ── meadow-update ──────────────────────────────────────────
	{
		Definition: require('./definitions/meadow-update.json'),
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

			tmpRestClient.putJSON({ url: `${tmpEndpoint}/${tmpEntity}`, body: tmpBody, headers: _parseHeaders(pResolvedSettings.Headers) },
				function (pError, pResponse, pData)
				{
					if (pError)
					{
						return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`MeadowUpdate: PUT failed: ${pError.message}`] });
					}

					let tmpStateWrites = {};
					if (pResolvedSettings.Destination)
					{
						tmpStateWrites[pResolvedSettings.Destination] = pData;
					}

					return fCallback(null, {
						EventToFire: 'Complete',
						Outputs: { Updated: pData },
						StateWrites: tmpStateWrites,
						Log: [`MeadowUpdate: updated ${tmpEntity} record`]
					});
				});
		}
	},

	// ── meadow-delete ──────────────────────────────────────────
	{
		Definition: require('./definitions/meadow-delete.json'),
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

			tmpRestClient.delJSON({ url: `${tmpEndpoint}/${tmpEntity}/${tmpRecordID}`, headers: _parseHeaders(pResolvedSettings.Headers) },
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
		Definition: require('./definitions/meadow-count.json'),
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

			let tmpURL = `${tmpEndpoint}/${tmpEntity}s/Count`;
			if (pResolvedSettings.Filter)
			{
				tmpURL += '/FilteredTo/' + pResolvedSettings.Filter;
			}

			tmpRestClient.getJSON({ url: tmpURL, headers: _parseHeaders(pResolvedSettings.Headers) },
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
