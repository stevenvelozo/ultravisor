const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libHTTP = require('http');
const libHTTPS = require('https');

class UltravisorTaskGetBinary extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Download a binary file from an HTTP/HTTPS URL.
	 *
	 * Task definition fields:
	 *   - URL: the endpoint to download from
	 *   - Headers (optional): object of request headers
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the binary data is stored as base64 (defaults to "Output")
	 *   - Persist (optional): where to store the downloaded content
	 *       string  -- manyfest address into GlobalState (stores base64)
	 *       { Address: "..." } -- same as string form
	 *       { File: "..." }   -- writes the raw binary to a staging file
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpURL = pTaskDefinition.URL || pTaskDefinition.Parameters || '';

		if (!tmpURL || tmpURL.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetBinary: missing URL.`);
			return fCallback(null, pManifestEntry);
		}

		pManifestEntry.Log.push(`GetBinary: GET ${tmpURL}`);

		let tmpHeaders = Object.assign({}, pTaskDefinition.Headers || {});

		let tmpParsedURL;
		try
		{
			tmpParsedURL = new URL(tmpURL);
		}
		catch (pParseError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetBinary: invalid URL: ${pParseError.message}`);
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
				let tmpChunks = [];

				pResponse.on('data', (pChunk) => { tmpChunks.push(pChunk); });

				pResponse.on('end', () =>
				{
					let tmpBuffer = Buffer.concat(tmpChunks);

					pManifestEntry.StopTime = new Date().toISOString();
					pManifestEntry.Log.push(`GetBinary: received ${tmpBuffer.length} bytes, status ${pResponse.statusCode}.`);

					pManifestEntry.Output = `${tmpBuffer.length} bytes downloaded`;
					pManifestEntry.Status = 'Complete';
					pManifestEntry.Success = true;
					pManifestEntry.Log.push(`GetBinary: download completed successfully.`);

					this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpBuffer.toString('base64'));

					// Persist the result
					if (pTaskDefinition.Persist)
					{
						let tmpPersist = pTaskDefinition.Persist;
						let tmpIsAddressPersist = (typeof(tmpPersist) === 'string') ||
							(typeof(tmpPersist) === 'object' && tmpPersist !== null && tmpPersist.Address);

						if (tmpIsAddressPersist)
						{
							this.storeResult(pTaskDefinition, pContext, pManifestEntry, tmpBuffer.toString('base64'));
						}
						else
						{
							this.storeResult(pTaskDefinition, pContext, pManifestEntry, tmpBuffer);
						}
					}

					return fCallback(null, pManifestEntry);
				});
			});

		tmpRequest.on('error', (pError) =>
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetBinary: request error: ${pError.message}`);
			return fCallback(null, pManifestEntry);
		});

		tmpRequest.on('timeout', () =>
		{
			tmpRequest.destroy();
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`GetBinary: request timed out after ${tmpTimeout}ms.`);
			return fCallback(null, pManifestEntry);
		});

		tmpRequest.end();
	}
}

module.exports = UltravisorTaskGetBinary;
