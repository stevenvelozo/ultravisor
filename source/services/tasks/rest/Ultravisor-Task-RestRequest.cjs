const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

const libHTTP = require('http');
const libHTTPS = require('https');

class UltravisorTaskRestRequest extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Generic REST request with full control over method, body, headers
	 * and cookies.
	 *
	 * Task definition fields:
	 *   - URL: the endpoint to request (literal string)
	 *   - URLAddress (optional): dot-notation address into GlobalState
	 *       that resolves to the URL string.  When set, overrides URL.
	 *   - Method (optional): HTTP method (defaults to "GET")
	 *   - Body (optional): request body -- string or object (serialised
	 *       as JSON when object)
	 *   - ContentType (optional): Content-Type header value (defaults to
	 *       "application/json" when Body is an object, omitted otherwise)
	 *   - Headers (optional): object of request headers
	 *   - Cookies (optional): object of cookies to send (name:value pairs)
	 *   - StoreCookies (optional, default true): whether to capture
	 *       Set-Cookie response headers into pContext.GlobalState.Cookies
	 *   - CaptureToken (optional): extract a value from the JSON response
	 *       body and store it in the shared cookie jar.  Can be:
	 *       - A string: dot-notation path into the JSON body (the value
	 *           is stored as a cookie named "Token")
	 *       - An object: { "Address": "JSON.path", "Cookie": "CookieName" }
	 *   - CaptureHeader (optional): object mapping response header names
	 *       to GlobalState addresses.  E.g.
	 *       { "X-Auth-Token": "AuthToken" } stores the value of the
	 *       X-Auth-Token response header at GlobalState.AuthToken
	 *   - Destination (optional): manyfest address in GlobalState for the
	 *       response data (defaults to "Output")
	 *   - Persist (optional): where to store the response
	 *
	 * Shared cookie jar:
	 *   When the response contains Set-Cookie headers they are parsed and
	 *   stored at pContext.GlobalState.Cookies (an object keyed by cookie
	 *   name). Subsequent RestRequest tasks automatically include any
	 *   cookies found at that location. Task-level Cookies merge on top,
	 *   so explicit values override the jar.
	 *
	 * Token capture (CaptureToken):
	 *   Many APIs return session tokens in the JSON body rather than via
	 *   Set-Cookie headers.  CaptureToken extracts a value from the parsed
	 *   JSON response and stores it in GlobalState.Cookies so that
	 *   subsequent RestRequest tasks automatically send it.
	 *
	 * Retries:
	 *   When Retries is set to a number > 0, the request will be retried
	 *   up to that many times on network errors, timeouts, or non-2xx
	 *   status codes.  Each retry waits 1 second before re-attempting.
	 *   All retry attempts are logged in the manifest entry.
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		// Resolve URL from GlobalState via URLAddress, or fall back to literal URL
		let tmpURL = pTaskDefinition.URL || pTaskDefinition.Parameters || '';

		if (pTaskDefinition.URLAddress && typeof(pTaskDefinition.URLAddress) === 'string')
		{
			let tmpResolved = this.resolveAddress(pTaskDefinition.URLAddress, pContext);
			if (tmpResolved && typeof(tmpResolved) === 'string')
			{
				tmpURL = tmpResolved;
				pManifestEntry.Log.push(`RestRequest: resolved URL from GlobalState address "${pTaskDefinition.URLAddress}".`);
			}
			else
			{
				pManifestEntry.Log.push(`RestRequest: WARNING URLAddress "${pTaskDefinition.URLAddress}" could not be resolved, falling back to URL field.`);
			}
		}

		if (!tmpURL || tmpURL.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`RestRequest: missing URL (neither URL nor URLAddress provided a value).`);
			return fCallback(null, pManifestEntry);
		}

		let tmpMethod = (pTaskDefinition.Method || 'GET').toUpperCase();

		pManifestEntry.Log.push(`RestRequest: ${tmpMethod} ${tmpURL}`);

		// --- Build headers ---
		let tmpHeaders = Object.assign({}, pTaskDefinition.Headers || {});

		// --- Prepare request body ---
		let tmpBody = '';
		if (pTaskDefinition.hasOwnProperty('Body'))
		{
			if (typeof(pTaskDefinition.Body) === 'object' && pTaskDefinition.Body !== null)
			{
				tmpBody = JSON.stringify(pTaskDefinition.Body);
				if (!tmpHeaders['Content-Type'] && !pTaskDefinition.ContentType)
				{
					tmpHeaders['Content-Type'] = 'application/json';
				}
			}
			else if (typeof(pTaskDefinition.Body) === 'string')
			{
				tmpBody = pTaskDefinition.Body;
			}
			else
			{
				tmpBody = String(pTaskDefinition.Body);
			}
		}

		if (pTaskDefinition.ContentType && typeof(pTaskDefinition.ContentType) === 'string')
		{
			tmpHeaders['Content-Type'] = pTaskDefinition.ContentType;
		}

		if (tmpBody.length > 0)
		{
			tmpHeaders['Content-Length'] = Buffer.byteLength(tmpBody);
			pManifestEntry.Log.push(`RestRequest: body ${tmpBody.length} bytes.`);
		}

		// --- Build cookie header ---
		// Start with the shared cookie jar from GlobalState
		if (!pContext.GlobalState || typeof(pContext.GlobalState) !== 'object')
		{
			pContext.GlobalState = {};
		}

		let tmpCookieJar = pContext.GlobalState.Cookies;
		let tmpMergedCookies = {};

		// Merge shared jar cookies first
		if (tmpCookieJar && typeof(tmpCookieJar) === 'object')
		{
			let tmpJarKeys = Object.keys(tmpCookieJar);
			for (let i = 0; i < tmpJarKeys.length; i++)
			{
				tmpMergedCookies[tmpJarKeys[i]] = tmpCookieJar[tmpJarKeys[i]];
			}
		}

		// Merge task-level cookies on top (override jar values)
		if (pTaskDefinition.Cookies && typeof(pTaskDefinition.Cookies) === 'object')
		{
			let tmpTaskCookieKeys = Object.keys(pTaskDefinition.Cookies);
			for (let i = 0; i < tmpTaskCookieKeys.length; i++)
			{
				tmpMergedCookies[tmpTaskCookieKeys[i]] = pTaskDefinition.Cookies[tmpTaskCookieKeys[i]];
			}
		}

		let tmpCookieKeys = Object.keys(tmpMergedCookies);
		if (tmpCookieKeys.length > 0)
		{
			let tmpCookieString = tmpCookieKeys
				.map((pKey) => { return `${pKey}=${tmpMergedCookies[pKey]}`; })
				.join('; ');

			tmpHeaders['Cookie'] = tmpCookieString;
			pManifestEntry.Log.push(`RestRequest: sending ${tmpCookieKeys.length} cookie(s).`);
		}

		// --- Parse URL ---
		let tmpParsedURL;
		try
		{
			tmpParsedURL = new URL(tmpURL);
		}
		catch (pParseError)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`RestRequest: invalid URL: ${pParseError.message}`);
			return fCallback(null, pManifestEntry);
		}

		let tmpTransport = (tmpParsedURL.protocol === 'https:') ? libHTTPS : libHTTP;
		let tmpTimeout = (this.fable?.ProgramConfiguration?.UltravisorCommandTimeoutMilliseconds) || 300000;
		let tmpMaxRetries = (typeof(pTaskDefinition.Retries) === 'number' && pTaskDefinition.Retries > 0) ? pTaskDefinition.Retries : 0;

		let tmpRequestOptions = {
			method: tmpMethod,
			headers: tmpHeaders,
			timeout: tmpTimeout
		};

		// --- Retry wrapper ---
		let tmpAttempt = 0;
		let tmpSelf = this;

		let fPerformRequest = () =>
		{
			tmpAttempt++;

			if (tmpAttempt > 1)
			{
				pManifestEntry.Log.push(`RestRequest: retry attempt ${tmpAttempt - 1} of ${tmpMaxRetries}.`);
			}

			let tmpRequest = tmpTransport.request(tmpURL, tmpRequestOptions,
				(pResponse) =>
				{
					let tmpChunks = [];

					pResponse.on('data', (pChunk) => { tmpChunks.push(pChunk); });

					pResponse.on('end', () =>
					{
						let tmpBuffer = Buffer.concat(tmpChunks);
						let tmpResponseText = tmpBuffer.toString('utf8');

						pManifestEntry.Log.push(`RestRequest: received ${tmpBuffer.length} bytes, status ${pResponse.statusCode}.`);

						// --- Check for retryable HTTP status ---
						if (pResponse.statusCode >= 300 && tmpAttempt <= tmpMaxRetries)
						{
							pManifestEntry.Log.push(`RestRequest: non-2xx status ${pResponse.statusCode}, will retry in 1s.`);
							return setTimeout(fPerformRequest, 1000);
						}

						pManifestEntry.StopTime = new Date().toISOString();

						// --- Store response cookies in the shared jar ---
						let tmpStoreCookies = (pTaskDefinition.StoreCookies !== false);
						if (tmpStoreCookies)
						{
							tmpSelf._captureResponseCookies(pResponse, pContext, pManifestEntry);
						}

						// --- Build the result object ---
						let tmpResult = {
							StatusCode: pResponse.statusCode,
							Headers: pResponse.headers,
							Body: tmpResponseText
						};

						// Attempt to parse body as JSON for convenience
						try
						{
							tmpResult.JSON = JSON.parse(tmpResponseText);
						}
						catch (pIgnore)
						{
							// Not JSON -- that's fine, raw Body is still available
						}

						// --- CaptureToken: extract a token from JSON body into the cookie jar ---
						if (pTaskDefinition.CaptureToken && tmpResult.JSON)
						{
							tmpSelf._captureToken(pTaskDefinition.CaptureToken, tmpResult.JSON, pContext, pManifestEntry);
						}

						// --- CaptureHeader: extract response headers into GlobalState ---
						if (pTaskDefinition.CaptureHeader && typeof(pTaskDefinition.CaptureHeader) === 'object')
						{
							tmpSelf._captureHeaders(pTaskDefinition.CaptureHeader, pResponse.headers, pContext, pManifestEntry);
						}

						pManifestEntry.Output = JSON.stringify(tmpResult);

						if (pResponse.statusCode >= 300)
						{
							pManifestEntry.Status = 'Error';
							pManifestEntry.Log.push(`RestRequest: ${tmpMethod} failed with status ${pResponse.statusCode} after ${tmpAttempt} attempt(s).`);
						}
						else
						{
							pManifestEntry.Status = 'Complete';
							pManifestEntry.Success = true;
							pManifestEntry.Log.push(`RestRequest: ${tmpMethod} completed successfully.`);
						}

						// Store via Destination
						tmpSelf.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpResult);

						// Persist
						tmpSelf.storeResult(pTaskDefinition, pContext, pManifestEntry, tmpResult);

						return fCallback(null, pManifestEntry);
					});
				});

			tmpRequest.on('error', (pError) =>
			{
				pManifestEntry.Log.push(`RestRequest: request error: ${pError.message}`);

				if (tmpAttempt <= tmpMaxRetries)
				{
					pManifestEntry.Log.push(`RestRequest: will retry in 1s.`);
					return setTimeout(fPerformRequest, 1000);
				}

				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Error';
				pManifestEntry.Log.push(`RestRequest: ${tmpMethod} failed after ${tmpAttempt} attempt(s).`);
				return fCallback(null, pManifestEntry);
			});

			tmpRequest.on('timeout', () =>
			{
				tmpRequest.destroy();
				pManifestEntry.Log.push(`RestRequest: request timed out after ${tmpTimeout}ms.`);

				if (tmpAttempt <= tmpMaxRetries)
				{
					pManifestEntry.Log.push(`RestRequest: will retry in 1s.`);
					return setTimeout(fPerformRequest, 1000);
				}

				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Error';
				pManifestEntry.Log.push(`RestRequest: ${tmpMethod} failed after ${tmpAttempt} attempt(s).`);
				return fCallback(null, pManifestEntry);
			});

			if (tmpBody.length > 0)
			{
				tmpRequest.write(tmpBody);
			}

			tmpRequest.end();
		};

		fPerformRequest();
	}

	/**
	 * Parse Set-Cookie response headers and merge them into the shared
	 * cookie jar at pContext.GlobalState.Cookies.
	 *
	 * @param {object} pResponse - The HTTP response.
	 * @param {object} pContext - Execution context.
	 * @param {object} pManifestEntry - Manifest entry for logging.
	 */
	_captureResponseCookies(pResponse, pContext, pManifestEntry)
	{
		let tmpSetCookieHeaders = pResponse.headers['set-cookie'];

		if (!tmpSetCookieHeaders)
		{
			return;
		}

		// Normalise to an array (some HTTP libs return a single string)
		if (!Array.isArray(tmpSetCookieHeaders))
		{
			tmpSetCookieHeaders = [tmpSetCookieHeaders];
		}

		if (!pContext.GlobalState.Cookies || typeof(pContext.GlobalState.Cookies) !== 'object')
		{
			pContext.GlobalState.Cookies = {};
		}

		let tmpCapturedCount = 0;
		for (let i = 0; i < tmpSetCookieHeaders.length; i++)
		{
			let tmpCookieStr = tmpSetCookieHeaders[i];
			// Parse the first name=value pair from the Set-Cookie header
			let tmpSemiIndex = tmpCookieStr.indexOf(';');
			let tmpPairStr = (tmpSemiIndex !== -1) ? tmpCookieStr.substring(0, tmpSemiIndex) : tmpCookieStr;
			let tmpEqualsIndex = tmpPairStr.indexOf('=');

			if (tmpEqualsIndex !== -1)
			{
				let tmpName = tmpPairStr.substring(0, tmpEqualsIndex).trim();
				let tmpValue = tmpPairStr.substring(tmpEqualsIndex + 1).trim();
				pContext.GlobalState.Cookies[tmpName] = tmpValue;
				tmpCapturedCount++;
			}
		}

		if (tmpCapturedCount > 0)
		{
			pManifestEntry.Log.push(`RestRequest: captured ${tmpCapturedCount} cookie(s) into GlobalState.Cookies.`);
		}
	}

	/**
	 * Extract a token from the JSON response body and store it in the
	 * shared cookie jar at pContext.GlobalState.Cookies.
	 *
	 * CaptureToken can be:
	 *   - A string: dot-notation path into the JSON body.  The resolved
	 *     value is stored as a cookie named "Token".
	 *   - An object with:
	 *       { "Address": "JSON.path", "Cookie": "CookieName" }
	 *
	 * @param {string|object} pCaptureToken - The CaptureToken definition.
	 * @param {object} pJSON - The parsed JSON response body.
	 * @param {object} pContext - Execution context.
	 * @param {object} pManifestEntry - Manifest entry for logging.
	 */
	_captureToken(pCaptureToken, pJSON, pContext, pManifestEntry)
	{
		let tmpAddress;
		let tmpCookieName;

		if (typeof(pCaptureToken) === 'string')
		{
			tmpAddress = pCaptureToken;
			tmpCookieName = 'Token';
		}
		else if (typeof(pCaptureToken) === 'object' && pCaptureToken !== null)
		{
			tmpAddress = pCaptureToken.Address || '';
			tmpCookieName = pCaptureToken.Cookie || 'Token';
		}
		else
		{
			pManifestEntry.Log.push(`RestRequest: CaptureToken must be a string or object.`);
			return;
		}

		if (!tmpAddress || tmpAddress.length === 0)
		{
			pManifestEntry.Log.push(`RestRequest: CaptureToken address is empty.`);
			return;
		}

		// Walk the JSON body to resolve the token value
		let tmpParts = tmpAddress.split('.');
		let tmpValue = pJSON;
		for (let i = 0; i < tmpParts.length; i++)
		{
			if (tmpValue === null || tmpValue === undefined || typeof(tmpValue) !== 'object')
			{
				pManifestEntry.Log.push(`RestRequest: CaptureToken could not resolve "${tmpAddress}" in response body.`);
				return;
			}
			tmpValue = tmpValue[tmpParts[i]];
		}

		if (tmpValue === undefined || tmpValue === null)
		{
			pManifestEntry.Log.push(`RestRequest: CaptureToken resolved "${tmpAddress}" to null/undefined.`);
			return;
		}

		if (!pContext.GlobalState.Cookies || typeof(pContext.GlobalState.Cookies) !== 'object')
		{
			pContext.GlobalState.Cookies = {};
		}

		pContext.GlobalState.Cookies[tmpCookieName] = String(tmpValue);
		pManifestEntry.Log.push(`RestRequest: CaptureToken stored "${tmpAddress}" as cookie "${tmpCookieName}".`);
	}

	/**
	 * Extract response header values and store them at manyfest
	 * addresses in pContext.GlobalState.
	 *
	 * CaptureHeader is an object mapping response header names to
	 * GlobalState dot-notation addresses.  Header names are matched
	 * case-insensitively.
	 *
	 * @param {object} pCaptureHeader - Mapping of header name → GlobalState address.
	 * @param {object} pResponseHeaders - The response headers (lowercased by Node).
	 * @param {object} pContext - Execution context.
	 * @param {object} pManifestEntry - Manifest entry for logging.
	 */
	_captureHeaders(pCaptureHeader, pResponseHeaders, pContext, pManifestEntry)
	{
		let tmpKeys = Object.keys(pCaptureHeader);
		let tmpCapturedCount = 0;

		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpHeaderName = tmpKeys[i].toLowerCase();
			let tmpDestAddress = pCaptureHeader[tmpKeys[i]];

			if (typeof(tmpDestAddress) !== 'string' || tmpDestAddress.length === 0)
			{
				continue;
			}

			let tmpHeaderValue = pResponseHeaders[tmpHeaderName];
			if (tmpHeaderValue !== undefined)
			{
				this._Manyfest.setValueAtAddress(pContext.GlobalState, tmpDestAddress, tmpHeaderValue);
				tmpCapturedCount++;
			}
		}

		if (tmpCapturedCount > 0)
		{
			pManifestEntry.Log.push(`RestRequest: CaptureHeader stored ${tmpCapturedCount} header value(s) into GlobalState.`);
		}
	}
}

module.exports = UltravisorTaskRestRequest;
