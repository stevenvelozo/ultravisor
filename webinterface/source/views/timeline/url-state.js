/**
 * url-state.js
 *
 * Read / write the timeline view's URL params. Pict's PictRouter
 * handles route paths but not query strings, so we parse window.location
 * directly. Resolves relative time specs (now, now-2m, now+30s) against
 * the user's clock; the server resolves the same form against its own
 * clock, and a minor skew shows up in the response's `Now` field.
 *
 * Recognized params:
 *   from      ISO or relative   (default: 'now-2m')
 *   to        ISO or relative   (default: 'now+30s')
 *   mode      'live' | 'replay' (default: 'live')
 *   focus     'runHash:abc' / 'capability:Loader' / 'beacon:bcn-xyz' / null
 *   bucket    'auto' | 'raw' | '<duration>' (default: 'auto')
 */

function read()
{
	let tmpParams = {};
	let tmpQuery = (typeof window !== 'undefined' && window.location.search) || '';
	if (tmpQuery.charAt(0) === '?') { tmpQuery = tmpQuery.slice(1); }
	let tmpPairs = tmpQuery.split('&');
	for (let i = 0; i < tmpPairs.length; i++)
	{
		if (!tmpPairs[i]) continue;
		let tmpEq = tmpPairs[i].indexOf('=');
		let tmpK, tmpV;
		if (tmpEq < 0) { tmpK = tmpPairs[i]; tmpV = ''; }
		else { tmpK = tmpPairs[i].slice(0, tmpEq); tmpV = tmpPairs[i].slice(tmpEq + 1); }
		try { tmpK = decodeURIComponent(tmpK); } catch (pErr) { /* leave raw */ }
		try { tmpV = decodeURIComponent(tmpV); } catch (pErr) { /* leave raw */ }
		tmpParams[tmpK] = tmpV;
	}

	let tmpState =
	{
		FromIso: tmpParams.from   || 'now-2m',
		ToIso:   tmpParams.to     || 'now+30s',
		Mode:    tmpParams.mode   || 'live',
		Bucket:  tmpParams.bucket || 'auto',
		Focus:   null
	};

	if (tmpParams.focus)
	{
		let tmpColon = tmpParams.focus.indexOf(':');
		if (tmpColon > 0)
		{
			tmpState.Focus =
			{
				Kind: tmpParams.focus.slice(0, tmpColon),
				Hash: tmpParams.focus.slice(tmpColon + 1)
			};
		}
	}

	// Light validation.
	if (tmpState.Mode !== 'live' && tmpState.Mode !== 'replay')
	{
		tmpState.Mode = 'live';
	}

	return tmpState;
}

function write(pState)
{
	if (typeof window === 'undefined') return;
	let tmpParams = [];
	if (pState.FromIso) tmpParams.push('from=' + encodeURIComponent(pState.FromIso));
	if (pState.ToIso)   tmpParams.push('to=' + encodeURIComponent(pState.ToIso));
	if (pState.Mode)    tmpParams.push('mode=' + encodeURIComponent(pState.Mode));
	if (pState.Bucket && pState.Bucket !== 'auto') tmpParams.push('bucket=' + encodeURIComponent(pState.Bucket));
	if (pState.Focus && pState.Focus.Kind && pState.Focus.Hash)
	{
		tmpParams.push('focus=' + encodeURIComponent(pState.Focus.Kind + ':' + pState.Focus.Hash));
	}
	let tmpHash = window.location.hash || '';
	let tmpNewURL = window.location.pathname + (tmpParams.length > 0 ? ('?' + tmpParams.join('&')) : '') + tmpHash;
	try
	{
		window.history.replaceState({}, '', tmpNewURL);
	}
	catch (pErr) { /* best effort */ }
}

// Resolve "now", "now-2m", "now+30s", "now-1h", "now-7d", or an ISO
// string. Mirrors the server's _resolveRelativeTime so the client can
// match what the endpoint will pick.
function resolveTime(pSpec, pNowMs)
{
	if (!pSpec) return null;
	let tmpStr = String(pSpec).trim();
	let tmpNow = (typeof pNowMs === 'number') ? pNowMs : Date.now();
	if (tmpStr === 'now') return new Date(tmpNow).toISOString();
	let tmpMatch = tmpStr.match(/^now\s*([+-])\s*(\d+)\s*([smhd])?$/i);
	if (tmpMatch)
	{
		let tmpSign = tmpMatch[1] === '-' ? -1 : 1;
		let tmpVal = parseInt(tmpMatch[2], 10);
		let tmpUnit = (tmpMatch[3] || 's').toLowerCase();
		let tmpMul = tmpUnit === 'd' ? 86400000
			: tmpUnit === 'h' ? 3600000
			: tmpUnit === 'm' ? 60000
			: 1000;
		return new Date(tmpNow + tmpSign * tmpVal * tmpMul).toISOString();
	}
	let tmpParsed = Date.parse(tmpStr);
	if (Number.isFinite(tmpParsed)) return new Date(tmpParsed).toISOString();
	return null;
}

module.exports =
{
	read:        read,
	write:       write,
	resolveTime: resolveTime
};
