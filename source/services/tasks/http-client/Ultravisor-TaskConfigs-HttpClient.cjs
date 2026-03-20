/**
 * Task configurations for the "HTTP Client" capability.
 *
 * General-purpose REST / HTTP request tasks.
 *
 * Contains:
 *   - add-header      — Accumulator: appends one HTTP header to a growing list.
 *   - get-json        — Performs an HTTP GET request and parses the response as JSON.
 *   - get-text        — Performs an HTTP GET request and returns the response as text.
 *   - send-json       — Sends JSON data via HTTP POST or PUT.
 *   - rest-request    — Performs a fully configurable HTTP REST request.
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
 * Parse headers from a JSON string, accumulated array, or object.
 * Supports the accumulator pattern: an array of {Name, Value} objects
 * built by chaining add-header nodes.
 */
function _parseHeaders(pHeaders)
{
	if (!pHeaders)
	{
		return {};
	}

	// Already a plain object (e.g. from state wire) — use directly
	if (typeof(pHeaders) === 'object' && !Array.isArray(pHeaders))
	{
		return pHeaders;
	}

	// Accumulated array of {Name, Value} objects from add-header nodes
	if (Array.isArray(pHeaders))
	{
		let tmpResult = {};
		for (let i = 0; i < pHeaders.length; i++)
		{
			if (pHeaders[i] && pHeaders[i].Name)
			{
				tmpResult[pHeaders[i].Name] = pHeaders[i].Value || '';
			}
		}
		return tmpResult;
	}

	// Legacy: JSON string
	if (typeof(pHeaders) === 'string' && pHeaders.trim().length > 0)
	{
		try
		{
			let tmpParsed = JSON.parse(pHeaders);
			if (typeof(tmpParsed) === 'object' && tmpParsed !== null)
			{
				// Could be a parsed array of {Name, Value} or a flat object
				if (Array.isArray(tmpParsed))
				{
					return _parseHeaders(tmpParsed);
				}
				return tmpParsed;
			}
		}
		catch (pError)
		{
			// Not valid JSON — ignore
		}
	}

	return {};
}


module.exports =
[
	// ── add-header (accumulator) ──────────────────────────────
	{
		Definition: require('./definitions/add-header.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpName = pResolvedSettings.Name || '';
			let tmpValue = pResolvedSettings.Value || '';
			let tmpListAddress = pResolvedSettings.ListAddress;

			if (!tmpListAddress)
			{
				return fCallback(null, {
					EventToFire: 'Complete',
					Outputs: { Headers: [] },
					Log: ['AddHeader: no ListAddress specified.']
				});
			}

			if (!tmpName)
			{
				return fCallback(null, {
					EventToFire: 'Complete',
					Outputs: { Headers: [] },
					Log: ['AddHeader: no header Name specified.']
				});
			}

			// Read existing accumulated list from state
			let tmpList = [];
			if (pExecutionContext.StateManager)
			{
				let tmpExisting = pExecutionContext.StateManager.resolveAddress(tmpListAddress, pExecutionContext, pExecutionContext.NodeHash);
				if (Array.isArray(tmpExisting))
				{
					tmpList = tmpExisting.slice();
				}
			}

			// Append new header
			tmpList.push({ Name: tmpName, Value: tmpValue });

			let tmpStateWrites = {};
			tmpStateWrites[tmpListAddress] = tmpList;

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: { Headers: tmpList },
				StateWrites: tmpStateWrites,
				Log: [`AddHeader: appended "${tmpName}: ${tmpValue}" (${tmpList.length} headers total)`]
			});
		}
	},

	// ── get-json ───────────────────────────────────────────────
	{
		Definition: require('./definitions/get-json.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpURL = pResolvedSettings.URL || '';
			if (!tmpURL)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['GetJSON: no URL specified.'] });
			}

			let tmpRestClient = _getService(pTask, 'RestClient');
			if (!tmpRestClient)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['GetJSON: RestClient service not found.'] });
			}

			let tmpRequestOptions = { url: tmpURL, headers: _parseHeaders(pResolvedSettings.Headers), timeout: pResolvedSettings.TimeoutMs || 30000 };

			tmpRestClient.getJSON(tmpRequestOptions,
				function (pError, pResponse, pData)
				{
					if (pError)
					{
						return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`GetJSON: request failed: ${pError.message}`] });
					}

					let tmpStateWrites = {};
					if (pResolvedSettings.Destination)
					{
						tmpStateWrites[pResolvedSettings.Destination] = pData;
					}

					return fCallback(null, {
						EventToFire: 'Complete',
						Outputs: { Data: pData, StatusCode: (pResponse && pResponse.statusCode) ? pResponse.statusCode : 0 },
						StateWrites: tmpStateWrites,
						Log: [`GetJSON: received response from ${tmpURL}`]
					});
				});
		}
	},

	// ── get-text ───────────────────────────────────────────────
	{
		Definition: require('./definitions/get-text.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpURL = pResolvedSettings.URL || '';
			if (!tmpURL)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['GetText: no URL specified.'] });
			}

			let tmpRestClient = _getService(pTask, 'RestClient');
			if (!tmpRestClient)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['GetText: RestClient service not found.'] });
			}

			let tmpRequestOptions = { url: tmpURL, headers: _parseHeaders(pResolvedSettings.Headers), timeout: pResolvedSettings.TimeoutMs || 30000 };

			tmpRestClient.getRawText(tmpRequestOptions,
				function (pError, pResponse, pData)
				{
					if (pError)
					{
						return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`GetText: request failed: ${pError.message}`] });
					}

					let tmpStateWrites = {};
					if (pResolvedSettings.Destination)
					{
						tmpStateWrites[pResolvedSettings.Destination] = pData;
					}

					return fCallback(null, {
						EventToFire: 'Complete',
						Outputs: { Data: pData, StatusCode: (pResponse && pResponse.statusCode) ? pResponse.statusCode : 0 },
						StateWrites: tmpStateWrites,
						Log: [`GetText: received ${(pData || '').length} chars from ${tmpURL}`]
					});
				});
		}
	},

	// ── send-json ──────────────────────────────────────────────
	{
		Definition: require('./definitions/send-json.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpURL = pResolvedSettings.URL || '';
			if (!tmpURL)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['SendJSON: no URL specified.'] });
			}

			let tmpRestClient = _getService(pTask, 'RestClient');
			if (!tmpRestClient)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['SendJSON: RestClient service not found.'] });
			}

			let tmpDataAddress = pResolvedSettings.DataAddress || '';
			let tmpBody = {};
			if (tmpDataAddress && pExecutionContext.StateManager)
			{
				tmpBody = pExecutionContext.StateManager.resolveAddress(tmpDataAddress, pExecutionContext, pExecutionContext.NodeHash);
				if (typeof(tmpBody) !== 'object') { tmpBody = { value: tmpBody }; }
			}

			let tmpMethod = (pResolvedSettings.Method || 'POST').toUpperCase();
			let tmpOptions = { url: tmpURL, body: tmpBody, headers: _parseHeaders(pResolvedSettings.Headers), timeout: pResolvedSettings.TimeoutMs || 30000 };

			let tmpDoRequest = (tmpMethod === 'PUT') ? tmpRestClient.putJSON.bind(tmpRestClient) : tmpRestClient.postJSON.bind(tmpRestClient);

			tmpDoRequest(tmpOptions,
				function (pError, pResponse, pData)
				{
					if (pError)
					{
						return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`SendJSON: request failed: ${pError.message}`] });
					}

					let tmpStateWrites = {};
					if (pResolvedSettings.Destination)
					{
						tmpStateWrites[pResolvedSettings.Destination] = pData;
					}

					return fCallback(null, {
						EventToFire: 'Complete',
						Outputs: { Response: pData, StatusCode: (pResponse && pResponse.statusCode) ? pResponse.statusCode : 0 },
						StateWrites: tmpStateWrites,
						Log: [`SendJSON: ${tmpMethod} to ${tmpURL} complete`]
					});
				});
		}
	},

	// ── rest-request ───────────────────────────────────────────
	{
		Definition: require('./definitions/rest-request.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpURL = pResolvedSettings.URL || '';
			if (!tmpURL)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['RestRequest: no URL specified.'] });
			}

			let tmpRestClient = _getService(pTask, 'RestClient');
			if (!tmpRestClient)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['RestRequest: RestClient service not found.'] });
			}

			let tmpMethod = (pResolvedSettings.Method || 'GET').toUpperCase();
			let tmpHeaders = _parseHeaders(pResolvedSettings.Headers);
			if (pResolvedSettings.ContentType)
			{
				tmpHeaders['Content-Type'] = pResolvedSettings.ContentType;
			}

			let tmpRequestOptions = { url: tmpURL, method: tmpMethod, headers: tmpHeaders, timeout: pResolvedSettings.TimeoutMs || 30000 };

			// Parse body for non-GET methods
			if (tmpMethod !== 'GET' && pResolvedSettings.Body)
			{
				try
				{
					tmpRequestOptions.body = JSON.parse(pResolvedSettings.Body);
				}
				catch (pParseError)
				{
					tmpRequestOptions.body = pResolvedSettings.Body;
				}
			}

			let tmpRetryDelayMs = pResolvedSettings.RetryDelayMs || 1000;

			function _doRequest(pRetriesLeft)
			{
				tmpRestClient.executeChunkedRequest(tmpRequestOptions,
					function (pError, pResponse, pData)
					{
						if (pError)
						{
							if (pRetriesLeft > 0)
							{
								return setTimeout(function () { _doRequest(pRetriesLeft - 1); }, tmpRetryDelayMs);
							}
							return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`RestRequest: ${tmpMethod} ${tmpURL} failed: ${pError.message}`] });
						}

						// Try to parse as JSON, fall back to raw string
						let tmpParsedData = pData;
						try
						{
							tmpParsedData = JSON.parse(pData);
						}
						catch (pParseError)
						{
							// keep raw string
						}

						let tmpStateWrites = {};
						if (pResolvedSettings.Destination)
						{
							tmpStateWrites[pResolvedSettings.Destination] = tmpParsedData;
						}

						return fCallback(null, {
							EventToFire: 'Complete',
							Outputs: { Response: tmpParsedData, StatusCode: (pResponse && pResponse.statusCode) ? pResponse.statusCode : 0, ResponseHeaders: (pResponse && pResponse.headers) ? JSON.stringify(pResponse.headers) : '{}' },
							StateWrites: tmpStateWrites,
							Log: [`RestRequest: ${tmpMethod} ${tmpURL} -> ${pResponse ? pResponse.statusCode : '?'}`]
						});
					});
			}

			_doRequest(pResolvedSettings.Retries || 0);
		}
	}
];
