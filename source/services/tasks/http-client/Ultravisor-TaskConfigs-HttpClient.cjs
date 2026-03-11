/**
 * Task configurations for the "HTTP Client" capability.
 *
 * General-purpose REST / HTTP request tasks.
 *
 * Contains:
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
	// ── get-json ───────────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'get-json',
			Name: 'Get JSON',
			Description: 'Performs an HTTP GET request and parses the response as JSON.',
			Category: 'rest',
			Capability: 'HTTP Client',
			Action: 'GetJSON',
			Tier: 'Platform',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Complete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'URL', DataType: 'String', Required: true, Description: 'URL to GET' },
				{ Name: 'Headers', DataType: 'String', Required: false, Description: 'JSON string of request headers' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store response data' }
			],
			StateOutputs: [
				{ Name: 'Data', DataType: 'Object', Description: 'Parsed JSON response' }
			],
			DefaultSettings: { URL: '', Headers: '', Destination: '' }
		},
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

			let tmpRequestOptions = { url: tmpURL, headers: _parseHeaders(pResolvedSettings.Headers) };

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
						Outputs: { Data: pData },
						StateWrites: tmpStateWrites,
						Log: [`GetJSON: received response from ${tmpURL}`]
					});
				});
		}
	},

	// ── get-text ───────────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'get-text',
			Name: 'Get Text',
			Description: 'Performs an HTTP GET request and returns the response as text.',
			Category: 'rest',
			Capability: 'HTTP Client',
			Action: 'GetText',
			Tier: 'Platform',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Complete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'URL', DataType: 'String', Required: true, Description: 'URL to GET' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store response text' }
			],
			StateOutputs: [
				{ Name: 'Data', DataType: 'String', Description: 'Response text' }
			],
			DefaultSettings: { URL: '', Destination: '' }
		},
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

			tmpRestClient.getRawText(tmpURL,
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
						Outputs: { Data: pData },
						StateWrites: tmpStateWrites,
						Log: [`GetText: received ${(pData || '').length} chars from ${tmpURL}`]
					});
				});
		}
	},

	// ── send-json ──────────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'send-json',
			Name: 'Send JSON',
			Description: 'Sends JSON data via HTTP POST or PUT.',
			Category: 'rest',
			Capability: 'HTTP Client',
			Action: 'SendJSON',
			Tier: 'Platform',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Complete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'URL', DataType: 'String', Required: true, Description: 'URL to send data to' },
				{ Name: 'Method', DataType: 'String', Required: false, Description: 'HTTP method (POST or PUT)' },
				{ Name: 'Address', DataType: 'String', Required: false, Description: 'State address of the data to send' },
				{ Name: 'Headers', DataType: 'String', Required: false, Description: 'JSON string of request headers' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store response' }
			],
			StateOutputs: [
				{ Name: 'Response', DataType: 'Object', Description: 'Response data' }
			],
			DefaultSettings: { URL: '', Method: 'POST', Address: '', Headers: '', Destination: '' }
		},
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

			let tmpBody = {};
			if (pResolvedSettings.Address && pExecutionContext.StateManager)
			{
				tmpBody = pExecutionContext.StateManager.resolveAddress(pResolvedSettings.Address, pExecutionContext, pExecutionContext.NodeHash);
				if (typeof(tmpBody) !== 'object') { tmpBody = { value: tmpBody }; }
			}

			let tmpMethod = (pResolvedSettings.Method || 'POST').toUpperCase();
			let tmpOptions = { url: tmpURL, body: tmpBody, headers: _parseHeaders(pResolvedSettings.Headers) };

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
						Outputs: { Response: pData },
						StateWrites: tmpStateWrites,
						Log: [`SendJSON: ${tmpMethod} to ${tmpURL} complete`]
					});
				});
		}
	},

	// ── rest-request ───────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'rest-request',
			Name: 'REST Request',
			Description: 'Performs a fully configurable HTTP REST request.',
			Category: 'rest',
			Capability: 'HTTP Client',
			Action: 'Request',
			Tier: 'Platform',
			EventInputs: [{ Name: 'In' }],
			EventOutputs: [
				{ Name: 'Complete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'URL', DataType: 'String', Required: true, Description: 'URL to request' },
				{ Name: 'Method', DataType: 'String', Required: false, Description: 'HTTP method (GET, POST, PUT, DELETE, etc.)' },
				{ Name: 'ContentType', DataType: 'String', Required: false, Description: 'Content-Type header' },
				{ Name: 'Headers', DataType: 'String', Required: false, Description: 'JSON string of request headers' },
				{ Name: 'Body', DataType: 'String', Required: false, Description: 'Request body (JSON string or raw text)' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store response' },
				{ Name: 'Retries', DataType: 'Number', Required: false, Description: 'Number of retries on failure' }
			],
			StateOutputs: [
				{ Name: 'Response', DataType: 'Object', Description: 'Response data' }
			],
			DefaultSettings: { URL: '', Method: 'GET', ContentType: 'application/json', Headers: '', Body: '', Destination: '', Retries: 0 }
		},
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

			let tmpRequestOptions = { url: tmpURL, method: tmpMethod, headers: tmpHeaders };

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

			tmpRestClient.executeChunkedRequest(tmpRequestOptions,
				function (pError, pResponse, pData)
				{
					if (pError)
					{
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
						Outputs: { Response: tmpParsedData },
						StateWrites: tmpStateWrites,
						Log: [`RestRequest: ${tmpMethod} ${tmpURL} -> ${pResponse ? pResponse.statusCode : '?'}`]
					});
				});
		}
	}
];
