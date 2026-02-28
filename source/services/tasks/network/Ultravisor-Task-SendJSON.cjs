const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libHTTP = require('http');
const libHTTPS = require('https');

class UltravisorTaskSendJSON extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Send JSON data to a REST URL using any HTTP method.
	 *
	 * Task definition fields:
	 *   - URL: the endpoint to request
	 *   - Method (optional): HTTP method (defaults to POST)
	 *   - Data (optional): object to serialise and send as the request body
	 *   - Headers (optional): object of request headers
	 *   - Persist (optional): where to store the response
	 *       string  -- manyfest address into GlobalState
	 *       { Address: "..." } -- same as string form
	 *       { File: "..." }   -- writes response to a staging file
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpURL = pTaskDefinition.URL || pTaskDefinition.Parameters || '';

		if (!tmpURL || tmpURL.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`SendJSON: missing URL.`);
			return fCallback(null, pManifestEntry);
		}

		let tmpMethod = (pTaskDefinition.Method || 'POST').toUpperCase();
		let tmpBody = pTaskDefinition.hasOwnProperty('Data')
			? JSON.stringify(pTaskDefinition.Data)
			: '';

		pManifestEntry.Log.push(`SendJSON: ${tmpMethod} ${tmpURL} (${tmpBody.length} bytes body)`);

		let tmpHeaders = Object.assign(
			{
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			},
			pTaskDefinition.Headers || {});

		if (tmpBody.length > 0)
		{
			tmpHeaders['Content-Length'] = Buffer.byteLength(tmpBody);
		}

		let tmpParsedURL;
		try
		{
			tmpParsedURL = new URL(tmpURL);
		}
		catch (pParseError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`SendJSON: invalid URL: ${pParseError.message}`);
			return fCallback(null, pManifestEntry);
		}

		let tmpTransport = (tmpParsedURL.protocol === 'https:') ? libHTTPS : libHTTP;
		let tmpTimeout = (this.fable?.ProgramConfiguration?.UltravisorCommandTimeoutMilliseconds) || 300000;

		let tmpRequestOptions = {
			method: tmpMethod,
			headers: tmpHeaders,
			timeout: tmpTimeout
		};

		let tmpRequest = tmpTransport.request(tmpURL, tmpRequestOptions,
			(pResponse) =>
			{
				let tmpData = '';

				pResponse.on('data', (pChunk) => { tmpData += pChunk; });

				pResponse.on('end', () =>
				{
					pManifestEntry.StopTime = new Date().toISOString();
					pManifestEntry.Log.push(`SendJSON: received ${tmpData.length} bytes, status ${pResponse.statusCode}.`);

					try
					{
						let tmpParsed = JSON.parse(tmpData);
						pManifestEntry.Output = JSON.stringify(tmpParsed);
					}
					catch (pJsonError)
					{
						pManifestEntry.Output = tmpData.substring(0, 2000);
					}

					pManifestEntry.Status = 'Complete';
					pManifestEntry.Success = true;
					pManifestEntry.Log.push(`SendJSON: ${tmpMethod} completed successfully.`);

					// Persist the response (parsed JSON if possible, raw string otherwise)
					if (pTaskDefinition.Persist)
					{
						let tmpPersistData;
						try
						{
							tmpPersistData = JSON.parse(pManifestEntry.Output);
						}
						catch (pIgnore)
						{
							tmpPersistData = pManifestEntry.Output;
						}
						this.storeResult(pTaskDefinition, pContext, pManifestEntry, tmpPersistData);
					}

					return fCallback(null, pManifestEntry);
				});
			});

		tmpRequest.on('error', (pError) =>
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`SendJSON: request error: ${pError.message}`);
			return fCallback(null, pManifestEntry);
		});

		tmpRequest.on('timeout', () =>
		{
			tmpRequest.destroy();
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`SendJSON: request timed out after ${tmpTimeout}ms.`);
			return fCallback(null, pManifestEntry);
		});

		if (tmpBody.length > 0)
		{
			tmpRequest.write(tmpBody);
		}

		tmpRequest.end();
	}
}

module.exports = UltravisorTaskSendJSON;
