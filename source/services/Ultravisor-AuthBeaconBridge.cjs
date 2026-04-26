/**
 * Ultravisor-AuthBeaconBridge
 *
 * Talks to whichever beacon advertises the `Authentication` capability
 * via dispatchAndWait, presents a clean async surface to the rest of
 * the hub. The bridge is the only thing that knows the auth beacon
 * exists — every other call site (API server, coordinator non-
 * promiscuous mode) just asks the bridge "is this session valid?"
 * or "is this beacon allowed to join?" and gets a Promise back.
 *
 * Design notes
 * ============
 * - The bridge has NO local cache. Sessions are short-lived and
 *   security-sensitive; caching invalidation here is more dangerous
 *   than the extra dispatch cost. If the auth beacon becomes a
 *   bottleneck, that's where caching should land — it owns the
 *   lifecycle.
 *
 * - The bridge is OPTIONAL — when the coordinator can't find an auth
 *   beacon, methods resolve with `{Available:false, ...}` and the
 *   caller decides how to proceed (typically: fail-closed in non-
 *   promiscuous mode, fall back to legacy auth in promiscuous mode).
 *
 * - Bridge methods all return Promises (not callbacks) because they're
 *   meant to be awaited in async route handlers and middleware. The
 *   underlying coordinator.dispatchAndWait is callback-based, so we
 *   wrap it once here.
 */

const libPictService = require('pict-serviceproviderbase');

// Default bridge dispatch timeout. Authentication should be FAST —
// password hashing + DB lookup measured in single-digit ms, session
// validation usually a Map.get(). 5s is generous.
const DEFAULT_BRIDGE_TIMEOUT_MS = 5000;

class UltravisorAuthBeaconBridge extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
		this.serviceType = 'UltravisorAuthBeaconBridge';
		this._TimeoutMs = (pOptions && pOptions.TimeoutMs) || DEFAULT_BRIDGE_TIMEOUT_MS;
	}

	/**
	 * Look up the BeaconID currently advertising the Authentication
	 * capability. Returns null when no auth beacon is connected.
	 *
	 * If multiple beacons advertise Authentication, the FIRST one is
	 * returned — for now we don't elect a primary. A future enhancement
	 * could weight by tags (e.g., Tags.Role==='auth' wins).
	 */
	getAuthBeaconID()
	{
		let tmpCoord = this._coord();
		if (!tmpCoord) return null;
		let tmpBeacons = tmpCoord.listBeacons() || [];
		for (let i = 0; i < tmpBeacons.length; i++)
		{
			let tmpCaps = tmpBeacons[i].Capabilities || [];
			if (tmpCaps.indexOf('Authentication') >= 0)
			{
				return tmpBeacons[i].BeaconID;
			}
		}
		return null;
	}

	/**
	 * @returns {boolean} true iff some beacon claims Authentication
	 */
	isAvailable()
	{
		return this.getAuthBeaconID() !== null;
	}

	/**
	 * Run a Login on the auth beacon. Returns the auth beacon's
	 * Outputs unchanged so callers can read SessionToken / UserContext
	 * / ExpiresAt directly.
	 */
	login(pUsername, pPassword, pMethod)
	{
		return this._dispatchAuthAction('AUTH_Login',
		{
			Username: pUsername,
			Password: pPassword,
			Method: pMethod || 'password'
		});
	}

	validateSession(pSessionToken)
	{
		return this._dispatchAuthAction('AUTH_ValidateSession',
		{
			SessionToken: pSessionToken || ''
		});
	}

	logout(pSessionToken)
	{
		return this._dispatchAuthAction('AUTH_Logout',
		{
			SessionToken: pSessionToken || ''
		});
	}

	authorizeAction(pSessionToken, pCapability, pAction)
	{
		return this._dispatchAuthAction('AUTH_AuthorizeAction',
		{
			SessionToken: pSessionToken || '',
			Capability: pCapability || '',
			Action: pAction || ''
		});
	}

	validateBeaconJoin(pBeaconName, pJoinSecret, pBeaconCapabilities)
	{
		return this._dispatchAuthAction('AUTH_ValidateBeaconJoin',
		{
			BeaconName: pBeaconName || '',
			JoinSecret: pJoinSecret || '',
			Capabilities: Array.isArray(pBeaconCapabilities) ? pBeaconCapabilities : []
		});
	}

	/**
	 * Generic dispatch — for callers (e.g. the orator-authentication
	 * Beacon provider) that want to forward an arbitrary AUTH_* action
	 * without one of the named convenience methods above. Same return
	 * shape as the rest of the bridge: a Promise resolving to
	 * `{Available, ...Outputs}` (or `{Available:false, Reason}` if the
	 * auth beacon isn't reachable).
	 */
	dispatchAction(pAction, pSettings)
	{
		return this._dispatchAuthAction(pAction, pSettings || {});
	}

	// ============== User management ==============
	//
	// Convenience wrappers around the AUTH_*User actions. Authorization
	// is the caller's job — these dispatch unconditionally; protect the
	// HTTP routes (or whatever surface invokes them) with a session +
	// role check before letting them through.

	listUsers(pSelector)
	{
		return this._dispatchAuthAction('AUTH_ListUsers', { Selector: pSelector || null });
	}

	getUser(pUserID)
	{
		return this._dispatchAuthAction('AUTH_GetUser', { UserID: pUserID });
	}

	createUser(pUserSpec)
	{
		return this._dispatchAuthAction('AUTH_CreateUser', { UserSpec: pUserSpec || {} });
	}

	updateUser(pUserID, pUpdates)
	{
		return this._dispatchAuthAction('AUTH_UpdateUser',
			{ UserID: pUserID, Updates: pUpdates || {} });
	}

	deleteUser(pUserID)
	{
		return this._dispatchAuthAction('AUTH_DeleteUser', { UserID: pUserID });
	}

	setUserPassword(pUserID, pNewPassword)
	{
		return this._dispatchAuthAction('AUTH_SetUserPassword',
			{ UserID: pUserID, NewPassword: pNewPassword });
	}

	changePassword(pUserID, pCurrentPassword, pNewPassword)
	{
		return this._dispatchAuthAction('AUTH_ChangePassword',
		{
			UserID: pUserID,
			CurrentPassword: pCurrentPassword,
			NewPassword: pNewPassword
		});
	}

	/**
	 * One-time admin bootstrap. Dispatches AUTH_BootstrapAdmin to the
	 * auth beacon, which validates the token and creates the admin user
	 * atomically. Intentionally NOT gated by an admin session — that
	 * would be a chicken-and-egg problem (no admin exists yet to
	 * authenticate). The auth beacon's bootstrap token IS the auth.
	 */
	bootstrapAdmin(pToken, pUserSpec)
	{
		return this._dispatchAuthAction('AUTH_BootstrapAdmin',
		{
			Token: pToken,
			UserSpec: pUserSpec || {}
		});
	}

	// ============== Internals ==============

	_coord()
	{
		// Resolve lazily — the coordinator can be added/replaced after
		// the bridge is constructed.
		let tmpMap = this.fable && this.fable.servicesMap
			&& this.fable.servicesMap['UltravisorBeaconCoordinator'];
		return tmpMap ? Object.values(tmpMap)[0] : null;
	}

	_dispatchAuthAction(pActionName, pSettings)
	{
		return new Promise((fResolve) =>
		{
			let tmpCoord = this._coord();
			if (!tmpCoord)
			{
				return fResolve(
				{
					Available: false,
					Reason: 'BeaconCoordinator not available'
				});
			}
			let tmpAuthID = this.getAuthBeaconID();
			if (!tmpAuthID)
			{
				return fResolve(
				{
					Available: false,
					Reason: 'No beacon currently advertises Authentication'
				});
			}
			tmpCoord.dispatchAndWait(
			{
				Capability: 'Authentication',
				Action: pActionName,
				Settings: pSettings,
				AffinityKey: 'auth',                 // single auth beacon at a time
				TimeoutMs: this._TimeoutMs
			},
			(pError, pResult) =>
			{
				if (pError)
				{
					return fResolve(
					{
						Available: true,
						Error: pError.message || String(pError),
						// Surface a sane default — most callers want a
						// boolean Allowed/Valid/Success they can branch on.
						Allowed: false, Valid: false, Success: false
					});
				}
				// pResult.Outputs is the action's response payload.
				// Tag Available:true so callers can distinguish "auth
				// beacon answered no" from "auth beacon not reachable."
				let tmpOut = (pResult && pResult.Outputs) || {};
				return fResolve(Object.assign({ Available: true }, tmpOut));
			});
		});
	}
}

module.exports = UltravisorAuthBeaconBridge;
