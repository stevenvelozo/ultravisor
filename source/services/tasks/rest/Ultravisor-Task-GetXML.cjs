const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libHTTP = require('http');
const libHTTPS = require('https');

class UltravisorTaskGetXML extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Perform an HTTP/HTTPS GET and return the response as XML text.
	 *
	 * The raw XML string is returned in Output. No parsing is performed
	 * -- the caller is responsible for interpreting the XML structure.
	 *
	 * Task definition fields:
	 *   - URL: the endpoint to request
	 *   - Headers (optional): object of request headers
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the XML response is stored (defaults to "Output")
	 *   - Persist (optional): where to store the XML response
	 *       string  -- manyfest address into GlobalState
	 *       { Address: "..." } -- same as string form
	 *       { File: "..." }   -- writes the XML to a staging file
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpURL = pTaskDefinition.URL || pTaskDefinition.Parameters || '';

		if (!tmpURL || tmpURL.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetXML: missing URL.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`GetXML: GET ${tmpURL}`);

		let tmpHeaders = Object.assign({ 'Accept': 'application/xml, text/xml' }, pTaskDefinition.Headers || {});

		let tmpParsedURL;
		try
		{
			tmpParsedURL = new URL(tmpURL);
		}
		catch (pParseError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetXML: invalid URL: ${pParseError.message}`);
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
					pManifestEntry.Log.push(`GetXML: received ${tmpData.length} bytes, status ${pResponse.statusCode}.`);

					pManifestEntry.Output = tmpData;
					pManifestEntry.Status = 'Complete';
					pManifestEntry.Success = true;
					pManifestEntry.Log.push(`GetXML: response received successfully.`);

					this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpData);
					this.storeResult(pTaskDefinition, pContext, pManifestEntry, tmpData);

					return fCallback(null, pManifestEntry);
				});
			});

		tmpRequest.on('error', (pError) =>
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetXML: request error: ${pError.message}`);
			return fCallback(null, pManifestEntry);
		});

		tmpRequest.on('timeout', () =>
		{
			tmpRequest.destroy();
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetXML: request timed out after ${tmpTimeout}ms.`);
			return fCallback(null, pManifestEntry);
		});

		tmpRequest.end();
	}
}

module.exports = UltravisorTaskGetXML;
