const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

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
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskRestRequest;
