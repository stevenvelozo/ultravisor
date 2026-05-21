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
