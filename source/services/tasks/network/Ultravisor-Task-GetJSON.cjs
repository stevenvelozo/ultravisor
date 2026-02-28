const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libHTTP = require('http');
const libHTTPS = require('https');

class UltravisorTaskGetJSON extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Perform an HTTP/HTTPS GET and parse the response as JSON.
	 *
	 * Task definition fields:
	 *   - URL: the endpoint to request
	 *   - Headers (optional): object of request headers
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the parsed object is stored (defaults to "Output")
	 *   - Persist (optional): where to store the parsed response
	 *       string  -- manyfest address into GlobalState
	 *       { Address: "..." } -- same as string form
	 *       { File: "..." }   -- writes JSON to a staging file
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpURL = pTaskDefinition.URL || pTaskDefinition.Parameters || '';

		if (!tmpURL || tmpURL.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetJSON: missing URL.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`GetJSON: GET ${tmpURL}`);

		let tmpHeaders = Object.assign({ 'Accept': 'application/json' }, pTaskDefinition.Headers || {});

		let tmpParsedURL;
		try
		{
			tmpParsedURL = new URL(tmpURL);
		}
		catch (pParseError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetJSON: invalid URL: ${pParseError.message}`);
			return fCallback(null, pManifestEntry);
		}

		let tmpTransport = (tmpParsedURL.protocol === 'https:') ? libHTTPS : libHTTP;
		let tmpTimeout = (this.fable?.ProgramConfiguration?.UltravisorCommandTimeoutMilliseconds) || 300000;

		let tmpRequestOptions = {
			method: 'GET',
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
					pManifestEntry.Log.push(`GetJSON: received ${tmpData.length} bytes, status ${pResponse.statusCode}.`);

					try
					{
						let tmpParsed = JSON.parse(tmpData);
						pManifestEntry.Output = JSON.stringify(tmpParsed);
						pManifestEntry.Status = 'Complete';
						pManifestEntry.Success = true;
						pManifestEntry.Log.push(`GetJSON: parsed JSON successfully.`);

						this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpParsed);
						this.storeResult(pTaskDefinition, pContext, pManifestEntry, tmpParsed);
					}
					catch (pJsonError)
					{
						pManifestEntry.Output = tmpData.substring(0, 2000);
						pManifestEntry.Status = 'Error';
						pManifestEntry.Log.push(`GetJSON: failed to parse response as JSON: ${pJsonError.message}`);
					}

					return fCallback(null, pManifestEntry);
				});
			});

		tmpRequest.on('error', (pError) =>
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetJSON: request error: ${pError.message}`);
			return fCallback(null, pManifestEntry);
		});

		tmpRequest.on('timeout', () =>
		{
			tmpRequest.destroy();
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetJSON: request timed out after ${tmpTimeout}ms.`);
			return fCallback(null, pManifestEntry);
		});

		tmpRequest.end();
	}
}

module.exports = UltravisorTaskGetJSON;
