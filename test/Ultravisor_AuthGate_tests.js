/**
 * Ultravisor-AuthBeaconBridge — three-mode coverage tests
 *
 * Exercises the auth-mode + user-management detection path that drives
 * the web UI's login gate.  Three modes, all driven by what's in the
 * beacon coordinator (which the bridge queries lazily):
 *
 *   1. PROMISCUOUS   — no beacon advertising the Authentication
 *      capability.  isAvailable() === false; getAuthBeaconTags() === {}.
 *      /status sees AuthMode 'promiscuous' + SupportsUserManagement false.
 *
 *   2. SECURED INTERNAL — an auth beacon with `UserManagement: internal`
 *      tag.  isAvailable() === true; getAuthBeaconTags().UserManagement
 *      === 'internal'.  /status sees AuthMode 'authenticated' +
 *      SupportsUserManagement true.
 *
 *   3. SECURED EXTERNAL — an auth beacon with `UserManagement: external`
 *      tag.  isAvailable() === true; getAuthBeaconTags().UserManagement
 *      === 'external'.  /status sees AuthMode 'authenticated' +
 *      SupportsUserManagement false.
 *
 * We mock the coordinator with the same minimal shape Reachability's
 * tests use — listBeacons() returns the snapshot the bridge consumes,
 * full stop.  This keeps the test fast and focused on the gate logic
 * without booting Ultravisor's full service graph or an HTTP server.
 */

const libPict = require('pict');
const libBridge = require('../source/services/Ultravisor-AuthBeaconBridge.cjs');
const libAPIServer = require('../source/web_server/Ultravisor-API-Server.cjs');

var Chai = require('chai');
var Expect = Chai.expect;

/**
 * Build a Pict instance with a mock BeaconCoordinator that returns the
 * supplied beacon list, and the real Auth-Beacon Bridge attached.
 *
 * @param {Array<object>} pBeacons  — coordinator listBeacons() return value
 * @returns {{ fable, bridge, coordinator }}
 */
function _buildHarness(pBeacons)
{
	let tmpFable = new libPict(
		{
			Product: 'Ultravisor-Test-AuthGate',
			LogLevel: 5
		});

	let tmpCoord =
		{
			serviceType: 'UltravisorBeaconCoordinator',
			Hash: 'MockCoordinator',
			_Beacons: pBeacons || [],
			listBeacons: function () { return this._Beacons; },
			setBeacons: function (pNew) { this._Beacons = pNew || []; }
		};

	if (!tmpFable.servicesMap['UltravisorBeaconCoordinator'])
	{
		tmpFable.servicesMap['UltravisorBeaconCoordinator'] = {};
	}
	tmpFable.servicesMap['UltravisorBeaconCoordinator'][tmpCoord.Hash] = tmpCoord;

	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorAuthBeaconBridge', libBridge);
	let tmpBridge = Object.values(tmpFable.servicesMap['UltravisorAuthBeaconBridge'])[0];

	return { fable: tmpFable, bridge: tmpBridge, coordinator: tmpCoord };
}

/**
 * Compute what /status would emit for AuthEnabled / AuthMode /
 * SupportsUserManagement given a bridge.  This mirrors the logic in
 * Ultravisor-API-Server.cjs's /status handler — the test asserts the
 * three-mode story is consistent without booting the Orator server.
 */
function _statusSnapshot(pBridge)
{
	let tmpAuthEnabled = pBridge.isAvailable();
	let tmpSupportsUM = false;
	if (tmpAuthEnabled)
	{
		let tmpTags = pBridge.getAuthBeaconTags();
		let tmpTag = (tmpTags && tmpTags.UserManagement) || 'internal';
		tmpSupportsUM = (tmpTag === 'internal');
	}
	return {
		AuthEnabled: tmpAuthEnabled,
		AuthMode: tmpAuthEnabled ? 'authenticated' : 'promiscuous',
		SupportsUserManagement: tmpSupportsUM
	};
}

suite
(
	'Ultravisor Auth Gate — three modes',
	function ()
	{
		suite
		(
			'Mode 1 — promiscuous (no auth beacon)',
			function ()
			{
				test
				(
					'isAvailable returns false when no beacon advertises Authentication',
					function ()
					{
						let tmp = _buildHarness([]);
						Expect(tmp.bridge.isAvailable()).to.equal(false);
					}
				);

				test
				(
					'getAuthBeaconTags returns an empty object',
					function ()
					{
						let tmp = _buildHarness([]);
						Expect(tmp.bridge.getAuthBeaconTags()).to.deep.equal({});
					}
				);

				test
				(
					'A status snapshot reports promiscuous + no user mgmt',
					function ()
					{
						let tmp = _buildHarness([]);
						let tmpStatus = _statusSnapshot(tmp.bridge);
						Expect(tmpStatus.AuthEnabled).to.equal(false);
						Expect(tmpStatus.AuthMode).to.equal('promiscuous');
						Expect(tmpStatus.SupportsUserManagement).to.equal(false);
					}
				);

				test
				(
					'Beacons that lack the Authentication capability do not arm the gate',
					function ()
					{
						let tmp = _buildHarness(
						[
							{ BeaconID: 'b1', Name: 'data', Capabilities: ['DataMapping'], Tags: {} }
						]);
						let tmpStatus = _statusSnapshot(tmp.bridge);
						Expect(tmpStatus.AuthMode).to.equal('promiscuous');
					}
				);
			}
		);

		suite
		(
			'Mode 2 — secured + internal user management',
			function ()
			{
				let _Harness = null;
				setup
				(
					function ()
					{
						_Harness = _buildHarness(
						[
							{
								BeaconID: 'b-auth',
								Name: 'auth-beacon',
								Capabilities: ['Authentication'],
								Tags: { Role: 'auth', UserManagement: 'internal' }
							}
						]);
					}
				);

				test
				(
					'isAvailable returns true',
					function ()
					{
						Expect(_Harness.bridge.isAvailable()).to.equal(true);
					}
				);

				test
				(
					'getAuthBeaconTags returns the registration tags',
					function ()
					{
						let tmpTags = _Harness.bridge.getAuthBeaconTags();
						Expect(tmpTags.Role).to.equal('auth');
						Expect(tmpTags.UserManagement).to.equal('internal');
					}
				);

				test
				(
					'Status snapshot reports authenticated + user mgmt available',
					function ()
					{
						let tmpStatus = _statusSnapshot(_Harness.bridge);
						Expect(tmpStatus.AuthMode).to.equal('authenticated');
						Expect(tmpStatus.SupportsUserManagement).to.equal(true);
					}
				);

				test
				(
					'Missing UserManagement tag defaults to internal (back-compat)',
					function ()
					{
						_Harness.coordinator.setBeacons(
						[
							{
								BeaconID: 'b-auth-legacy',
								Capabilities: ['Authentication'],
								Tags: { Role: 'auth' } // no UserManagement
							}
						]);
						let tmpStatus = _statusSnapshot(_Harness.bridge);
						Expect(tmpStatus.SupportsUserManagement).to.equal(true);
					}
				);
			}
		);

		suite
		(
			'Mode 3 — secured + external auth (no in-app user mgmt)',
			function ()
			{
				let _Harness = null;
				setup
				(
					function ()
					{
						_Harness = _buildHarness(
						[
							{
								BeaconID: 'b-auth-ext',
								Name: 'auth-beacon',
								Capabilities: ['Authentication'],
								Tags: { Role: 'auth', UserManagement: 'external' }
							}
						]);
					}
				);

				test
				(
					'isAvailable returns true',
					function ()
					{
						Expect(_Harness.bridge.isAvailable()).to.equal(true);
					}
				);

				test
				(
					'getAuthBeaconTags reports external user management',
					function ()
					{
						let tmpTags = _Harness.bridge.getAuthBeaconTags();
						Expect(tmpTags.UserManagement).to.equal('external');
					}
				);

				test
				(
					'Status snapshot reports authenticated + user mgmt hidden',
					function ()
					{
						let tmpStatus = _statusSnapshot(_Harness.bridge);
						Expect(tmpStatus.AuthMode).to.equal('authenticated');
						Expect(tmpStatus.SupportsUserManagement).to.equal(false);
					}
				);
			}
		);

		suite
		(
			'Mode transitions (hot-attach/detach)',
			function ()
			{
				test
				(
					'Detaching the auth beacon flips the mode back to promiscuous',
					function ()
					{
						let tmp = _buildHarness(
						[
							{
								BeaconID: 'b-auth',
								Capabilities: ['Authentication'],
								Tags: { Role: 'auth', UserManagement: 'internal' }
							}
						]);
						Expect(_statusSnapshot(tmp.bridge).AuthMode).to.equal('authenticated');
						tmp.coordinator.setBeacons([]);
						Expect(_statusSnapshot(tmp.bridge).AuthMode).to.equal('promiscuous');
						Expect(_statusSnapshot(tmp.bridge).SupportsUserManagement).to.equal(false);
					}
				);

				test
				(
					'Swapping internal → external auth beacon flips SupportsUserManagement',
					function ()
					{
						let tmp = _buildHarness(
						[
							{
								BeaconID: 'b-auth',
								Capabilities: ['Authentication'],
								Tags: { Role: 'auth', UserManagement: 'internal' }
							}
						]);
						Expect(_statusSnapshot(tmp.bridge).SupportsUserManagement).to.equal(true);
						tmp.coordinator.setBeacons(
						[
							{
								BeaconID: 'b-auth-ext',
								Capabilities: ['Authentication'],
								Tags: { Role: 'auth', UserManagement: 'external' }
							}
						]);
						Expect(_statusSnapshot(tmp.bridge).SupportsUserManagement).to.equal(false);
					}
				);
			}
		);
	}
);

/**
 * HTTP route-enforcement coverage for the global authentication gate
 * (_enforceAuthentication / _isAuthExemptRoute / _resolveSession on
 * Ultravisor-API-Server).  Uses the REAL bridge wired to a mock
 * coordinator — so authenticated mode is armed exactly as production does
 * it, by a beacon advertising the Authentication capability — and the REAL
 * API-server methods, with only _OratorAuth's session lookup stubbed.
 *
 * This gate is what stops an unauthenticated client from reading /Beacon,
 * /Operation, /Schedule, ... directly over HTTP when an auth-beacon is
 * connected, while leaving promiscuous mode wide open and keeping the
 * login/bootstrap/static surface reachable.
 */
function _buildApiSelf(pBridge, pSession, pNonPromiscuous)
{
	let tmpSelf =
	{
		// The UltravisorNonPromiscuous flag lives in ProgramConfiguration —
		// the authoritative "secured" signal that _isSecuredMode() reads.
		fable: { ProgramConfiguration: { UltravisorNonPromiscuous: !!pNonPromiscuous } },
		// Stubbed session lookup — the only orator-auth surface the gate
		// touches.  Returns whatever session the test wants to simulate.
		_OratorAuth: { getSessionForRequest: function () { return pSession; } },
		_getService: function (pName)
		{
			return (pName === 'UltravisorAuthBeaconBridge') ? pBridge : null;
		}
	};
	['_anonymousSession', '_isSecuredMode', '_resolveSession', '_isAuthExemptRoute', '_enforceAuthentication',
		'_wsConsumerAuthorized', '_rejectWSUnauthenticatedSubscription'].forEach(
		function (pMethod) { tmpSelf[pMethod] = libAPIServer.prototype[pMethod].bind(tmpSelf); });
	return tmpSelf;
}

function _mockRequest(pRoutePath, pUrl)
{
	return { route: pRoutePath ? { path: pRoutePath } : undefined, url: pUrl || pRoutePath || '' };
}

function _runGate(pSelf, pRequest)
{
	let tmpOutcome = { next: 'UNCALLED', code: null };
	let tmpResponse = { send: function (pCode) { tmpOutcome.code = pCode; } };
	let tmpNext = function (pArg) { tmpOutcome.next = (pArg === undefined) ? 'PASS' : pArg; };
	pSelf._enforceAuthentication(pRequest, tmpResponse, tmpNext);
	return tmpOutcome;
}

const _AUTH_BEACON = [{ BeaconID: 'b-auth', Capabilities: ['Authentication'], Tags: { Role: 'auth', UserManagement: 'internal' } }];

suite
(
	'Ultravisor Auth Gate — HTTP route enforcement',
	function ()
	{
		suite
		(
			'Secured mode (armed by a connected auth-beacon — safety net)',
			function ()
			{
				test
				(
					'Management read (GET /Beacon) with NO session → 401 and chain stops',
					function ()
					{
						let tmp = _buildHarness(_AUTH_BEACON);
						let tmpSelf = _buildApiSelf(tmp.bridge, null);
						let tmpOut = _runGate(tmpSelf, _mockRequest('/Beacon'));
						Expect(tmpOut.code).to.equal(401);
						// next(false) short-circuits restify's use-chain so the
						// matched route handler never runs.
						Expect(tmpOut.next).to.equal(false);
					}
				);

				test
				(
					'Management read (GET /Beacon) WITH a valid session → passes through',
					function ()
					{
						let tmp = _buildHarness(_AUTH_BEACON);
						let tmpSelf = _buildApiSelf(tmp.bridge, { SessionID: 'u1', Authenticated: true });
						let tmpOut = _runGate(tmpSelf, _mockRequest('/Beacon'));
						Expect(tmpOut.code).to.equal(null);
						Expect(tmpOut.next).to.equal('PASS');
					}
				);

				test
				(
					'The wider management surface is gated too (no session → 401)',
					function ()
					{
						let tmp = _buildHarness(_AUTH_BEACON);
						let tmpSelf = _buildApiSelf(tmp.bridge, null);
						['/Operation', '/Schedule', '/Manifest', '/Fleet', '/Timeline', '/TaskType'].forEach(
							function (pPath)
							{
								let tmpOut = _runGate(tmpSelf, _mockRequest(pPath));
								Expect(tmpOut.code, pPath + ' should 401').to.equal(401);
							});
					}
				);

				test
				(
					'Exempt routes stay open without a session (so login can happen)',
					function ()
					{
						let tmp = _buildHarness(_AUTH_BEACON);
						let tmpSelf = _buildApiSelf(tmp.bridge, null);
						let tmpCases =
						[
							_mockRequest('/*', '/js/pict.min.js'),        // static UI asset
							_mockRequest('/', '/'),                        // root redirect
							_mockRequest('/status', '/status'),           // UI auth-mode probe
							_mockRequest('/package', '/package'),
							_mockRequest('/Beacon/BootstrapAdmin', '/Beacon/BootstrapAdmin'),
							_mockRequest('/1.0/Authenticate', '/1.0/Authenticate'),
							_mockRequest(undefined, '/1.0/CheckSession')   // route.path absent → URL fallback
						];
						tmpCases.forEach(function (pReq)
						{
							let tmpOut = _runGate(tmpSelf, pReq);
							Expect(tmpOut.code, (pReq.url || '') + ' should not 401').to.equal(null);
							Expect(tmpOut.next, (pReq.url || '') + ' should pass').to.equal('PASS');
						});
					}
				);
			}
		);

		suite
		(
			'Promiscuous mode (no auth-beacon)',
			function ()
			{
				test
				(
					'Management read (GET /Beacon) with no session → passes (anonymous)',
					function ()
					{
						let tmp = _buildHarness([]); // nothing advertises Authentication
						let tmpSelf = _buildApiSelf(tmp.bridge, null);
						let tmpOut = _runGate(tmpSelf, _mockRequest('/Beacon'));
						Expect(tmpOut.code).to.equal(null);
						Expect(tmpOut.next).to.equal('PASS');
					}
				);
			}
		);

		suite
		(
			'Secured mode (armed by the UltravisorNonPromiscuous flag, no auth-beacon)',
			function ()
			{
				test
				(
					'Flag set + no auth-beacon + no session → still 401 (hard-armed, fails closed)',
					function ()
					{
						let tmp = _buildHarness([]); // NO auth-beacon connected
						let tmpSelf = _buildApiSelf(tmp.bridge, null, true); // UltravisorNonPromiscuous = true
						let tmpOut = _runGate(tmpSelf, _mockRequest('/Beacon'));
						Expect(tmpOut.code).to.equal(401);
						Expect(tmpOut.next).to.equal(false);
					}
				);

				test
				(
					'Flag set + a valid session → passes once credentials are presented',
					function ()
					{
						let tmp = _buildHarness([]);
						let tmpSelf = _buildApiSelf(tmp.bridge, { SessionID: 'u1' }, true);
						let tmpOut = _runGate(tmpSelf, _mockRequest('/Beacon'));
						Expect(tmpOut.code).to.equal(null);
						Expect(tmpOut.next).to.equal('PASS');
					}
				);

				test
				(
					'Flag set → exempt routes (/status, /1.0/*, static) stay open so login can happen',
					function ()
					{
						let tmp = _buildHarness([]);
						let tmpSelf = _buildApiSelf(tmp.bridge, null, true);
						['/status', '/1.0/Authenticate', '/*', '/'].forEach(function (pPath)
						{
							let tmpOut = _runGate(tmpSelf, _mockRequest(pPath, pPath));
							Expect(tmpOut.code, pPath + ' should not 401').to.equal(null);
						});
					}
				);
			}
		);

		suite
		(
			'_isSecuredMode() decision',
			function ()
			{
				test
				(
					'NonPromiscuous flag set → secured, even with no auth-beacon',
					function ()
					{
						let tmp = _buildHarness([]);
						let tmpSelf = _buildApiSelf(tmp.bridge, null, true);
						Expect(tmpSelf._isSecuredMode()).to.equal(true);
					}
				);

				test
				(
					'No flag + a connected auth-beacon → secured (safety net)',
					function ()
					{
						let tmp = _buildHarness(_AUTH_BEACON);
						let tmpSelf = _buildApiSelf(tmp.bridge, null, false);
						Expect(tmpSelf._isSecuredMode()).to.equal(true);
					}
				);

				test
				(
					'No flag + no auth-beacon → promiscuous (open)',
					function ()
					{
						let tmp = _buildHarness([]);
						let tmpSelf = _buildApiSelf(tmp.bridge, null, false);
						Expect(tmpSelf._isSecuredMode()).to.equal(false);
					}
				);
			}
		);
	}
);

/**
 * WebSocket consumer-subscription gate.  WS upgrades bypass the HTTP gate, so
 * event-stream subscriptions (Subscribe / QueueSubscribe) are gated at the
 * frame level by _wsConsumerAuthorized(), keyed off the same _isSecuredMode().
 * Beacons authenticate at the frame level (BeaconRegister) and never send a
 * subscription frame, so they are unaffected.
 */
function _mockWS()
{
	let tmpWS =
	{
		_Authenticated: false,
		sent: [],
		closed: null,
		send: function (pStr) { this.sent.push(JSON.parse(pStr)); },
		close: function (pCode, pReason) { this.closed = { code: pCode, reason: pReason }; }
	};
	return tmpWS;
}

suite
(
	'Ultravisor Auth Gate — WebSocket subscriptions',
	function ()
	{
		suite
		(
			'Secured mode',
			function ()
			{
				test
				(
					'A connection that authenticated on upgrade MAY subscribe',
					function ()
					{
						let tmpSelf = _buildApiSelf(_buildHarness([]).bridge, null, true);
						Expect(tmpSelf._wsConsumerAuthorized({ _Authenticated: true })).to.equal(true);
					}
				);

				test
				(
					'A connection with no valid session MAY NOT subscribe',
					function ()
					{
						let tmpSelf = _buildApiSelf(_buildHarness([]).bridge, null, true);
						Expect(tmpSelf._wsConsumerAuthorized({ _Authenticated: false })).to.equal(false);
					}
				);

				test
				(
					'Rejection emits execution.auth_required and closes with 1008',
					function ()
					{
						let tmpSelf = _buildApiSelf(_buildHarness([]).bridge, null, true);
						let tmpWS = _mockWS();
						tmpSelf._rejectWSUnauthenticatedSubscription(tmpWS, 'execution');
						Expect(tmpWS.sent.length).to.equal(1);
						Expect(tmpWS.sent[0].EventType).to.equal('execution.auth_required');
						Expect(tmpWS.sent[0].LoggedIn).to.equal(false);
						Expect(tmpWS.closed.code).to.equal(1008);
					}
				);

				test
				(
					'Queue-stream rejection emits queue.auth_required',
					function ()
					{
						let tmpSelf = _buildApiSelf(_buildHarness([]).bridge, null, true);
						let tmpWS = _mockWS();
						tmpSelf._rejectWSUnauthenticatedSubscription(tmpWS, 'queue');
						Expect(tmpWS.sent[0].EventType).to.equal('queue.auth_required');
						Expect(tmpWS.closed.code).to.equal(1008);
					}
				);
			}
		);

		suite
		(
			'Promiscuous mode',
			function ()
			{
				test
				(
					'Any connection may subscribe — no session needed (unchanged)',
					function ()
					{
						let tmpSelf = _buildApiSelf(_buildHarness([]).bridge, null, false);
						Expect(tmpSelf._wsConsumerAuthorized({ _Authenticated: false })).to.equal(true);
					}
				);
			}
		);
	}
);
