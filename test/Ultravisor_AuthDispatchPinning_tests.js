/**
 * Pinning the hub's calls to the auth beacon (UltravisorAuthDispatchPinned)
 *
 * The auth beacon bridge sends every AUTH_* call with the affinity key
 * 'auth', and the coordinator matches an affinity key against beacon Names
 * before it checks capabilities. A beacon registered under the Name 'auth'
 * therefore receives every login and join secret. With the option on, the
 * bridge sends each call to the live auth beacon by its own Name, with
 * RequireAffinityMatch.
 *
 * These tests pin:
 *   - Unset, or anything but true and "true": the dispatch object is exactly
 *     the old one, and on a real coordinator it lands where it always did,
 *     including on a beacon named 'auth'.
 *   - On: the call goes to the live auth beacon and never to an Offline
 *     record, and it falls back to the old shape when no auth beacon is live.
 *   - The bridge's other answers (isAvailable, getAuthBeaconID,
 *     getAuthBeaconTags) do not change either way.
 */

const libPict = require('pict');
const libFS = require('fs');
const libPath = require('path');

const Chai = require('chai');
const Expect = Chai.expect;

const libAuthBeaconBridge = require('../source/services/Ultravisor-AuthBeaconBridge.cjs');
const libUltravisorBeaconCoordinator = require('../source/services/Ultravisor-Beacon-Coordinator.cjs');
const libUltravisorBeaconQueueStore = require('../source/services/persistence/Ultravisor-Beacon-QueueStore.cjs');

const TEST_BASE = libPath.resolve(__dirname, '..', '.test_staging_auth_dispatch_pinning');

// What 1.3.26 sends for dispatchAction('AUTH_Probe', { X: 1 }).
const LEGACY_DISPATCH = { Capability: 'Authentication', Action: 'AUTH_Probe', Settings: { X: 1 }, AffinityKey: 'auth', TimeoutMs: 5000 };

const SHELL_NAMED_AUTH = { BeaconID: 'b-shell', Name: 'auth', Capabilities: ['Shell'], Status: 'Online', Tags: {} };
const LIVE_AUTH = { BeaconID: 'b-auth', Name: 'auth-beacon', Capabilities: ['Authentication'], Status: 'Online', Tags: { Role: 'auth', UserManagement: 'internal' } };
const OFFLINE_AUTH = { BeaconID: 'b-old', Name: 'old-auth', Capabilities: ['Authentication'], Status: 'Offline', Tags: { Role: 'auth' } };

let _HarnessCount = 0;

function tick()
{
	return new Promise((fResolve) => setImmediate(fResolve));
}

/**
 * The real bridge on a mock coordinator that records what it is asked to
 * dispatch and answers at once.
 */
function captureHarness(pBeacons, pConfig, pSettings)
{
	let tmpFable = new libPict({ Product: 'Ultravisor-AuthDispatchPinning-Test', LogStreams: [{ level: 'fatal' }] });
	let tmpCaptured = [];
	let tmpCoordinator =
	{
		serviceType: 'UltravisorBeaconCoordinator',
		Hash: 'MockCoordinator',
		_Beacons: pBeacons || [],
		listBeacons: function () { return this._Beacons; },
		dispatchAndWait: function (pInfo, fCallback)
		{
			tmpCaptured.push(JSON.parse(JSON.stringify(pInfo)));
			setImmediate(() => fCallback(null, { Outputs: { Allowed: true } }));
		}
	};
	tmpFable.servicesMap['UltravisorBeaconCoordinator'] = tmpFable.servicesMap['UltravisorBeaconCoordinator'] || {};
	tmpFable.servicesMap['UltravisorBeaconCoordinator'][tmpCoordinator.Hash] = tmpCoordinator;
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorAuthBeaconBridge', libAuthBeaconBridge);
	if (pConfig)
	{
		tmpFable.ProgramConfiguration = pConfig;
	}
	if (pSettings)
	{
		Object.assign(tmpFable.settings, pSettings);
	}
	return { fable: tmpFable, bridge: Object.values(tmpFable.servicesMap.UltravisorAuthBeaconBridge)[0], captured: tmpCaptured };
}

async function probe(pHarness)
{
	await pHarness.bridge.dispatchAction('AUTH_Probe', { X: 1 });
	return pHarness.captured[pHarness.captured.length - 1];
}

/**
 * The real bridge and a real coordinator with two beacons: a Shell beacon
 * registered under the Name 'auth', and the auth beacon. Records each push.
 */
function realHarness(pConfig)
{
	const tmpPath = libPath.join(TEST_BASE, 'hub-' + (_HarnessCount++));
	if (libFS.existsSync(tmpPath)) { libFS.rmSync(tmpPath, { recursive: true, force: true }); }
	libFS.mkdirSync(tmpPath, { recursive: true });

	let tmpFable = new libPict({ Product: 'Ultravisor-AuthDispatchPinning-Test', LogStreams: [{ level: 'fatal' }], UltravisorFileStorePath: tmpPath, UltravisorHubInstanceID: 'testhub' });
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconQueueStore', libUltravisorBeaconQueueStore);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconCoordinator', libUltravisorBeaconCoordinator);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorAuthBeaconBridge', libAuthBeaconBridge);
	Object.values(tmpFable.servicesMap.UltravisorBeaconQueueStore)[0].initialize(tmpPath);
	if (pConfig)
	{
		tmpFable.ProgramConfiguration = pConfig;
	}

	let tmpCoordinator = Object.values(tmpFable.servicesMap.UltravisorBeaconCoordinator)[0];
	let tmpBridge = Object.values(tmpFable.servicesMap.UltravisorAuthBeaconBridge)[0];
	tmpBridge._TimeoutMs = 200;
	let tmpShell = tmpCoordinator.registerBeacon({ Name: 'auth', Capabilities: ['Shell'], MaxConcurrent: 4 }, 'session-shell');
	let tmpAuth = tmpCoordinator.registerBeacon({ Name: 'auth-beacon', Capabilities: ['Authentication'], MaxConcurrent: 4 }, 'session-auth');
	let tmpPushed = [];
	tmpCoordinator.setWorkItemPushHandler((pBeaconID, pWorkItem) =>
	{
		tmpPushed.push({ BeaconID: pBeaconID, Action: pWorkItem.Action, Settings: pWorkItem.Settings });
		return true;
	});
	return { bridge: tmpBridge, pushed: tmpPushed, ShellID: tmpShell.BeaconID, AuthID: tmpAuth.BeaconID };
}

suite
(
	'Pinning the hub\'s calls to the auth beacon (UltravisorAuthDispatchPinned)',
	function ()
	{
		suiteTeardown(function () { if (libFS.existsSync(TEST_BASE)) { libFS.rmSync(TEST_BASE, { recursive: true, force: true }); } });

		suite
		(
			'Unset (the default): the old dispatch',
			function ()
			{
				test('the option is not in the default configuration, so state persistence cannot write it to disk', function ()
				{
					let tmpDefaults = require('../source/config/Ultravisor-Default-Command-Configuration.cjs');
					Expect(Object.keys(tmpDefaults).length, 'defaults were read').to.be.greaterThan(5);
					Expect(Object.prototype.hasOwnProperty.call(tmpDefaults, 'UltravisorAuthDispatchPinned')).to.equal(false);
				});

				test('the dispatch object is exactly the old one, with no RequireAffinityMatch key', async function ()
				{
					let tmpCaptured = await probe(captureHarness([SHELL_NAMED_AUTH, LIVE_AUTH]));
					Expect(tmpCaptured).to.deep.equal(LEGACY_DISPATCH);
					Expect(tmpCaptured).to.not.have.property('RequireAffinityMatch');
				});

				test('only true and "true" turn it on: false, "false", 1 and "yes" leave the old object', async function ()
				{
					let tmpValues = [false, 'false', 1, 'yes'];
					for (let i = 0; i < tmpValues.length; i++)
					{
						let tmpCaptured = await probe(captureHarness([SHELL_NAMED_AUTH, LIVE_AUTH], { UltravisorAuthDispatchPinned: tmpValues[i] }));
						Expect(tmpCaptured, JSON.stringify(tmpValues[i])).to.deep.equal(LEGACY_DISPATCH);
					}
				});

				test('on a real coordinator, a login goes to the beacon named "auth": the hole the option closes', async function ()
				{
					let tmpHub = realHarness();
					tmpHub.bridge.login('operator', 'the-password');
					await tick();
					Expect(tmpHub.pushed.map((pPush) => pPush.BeaconID)).to.deep.equal([tmpHub.ShellID]);
					Expect(tmpHub.pushed[0].Settings.Password).to.equal('the-password');
				});
			}
		);

		suite
		(
			'On: pinned to the live auth beacon',
			function ()
			{
				[
					{ Label: 'true in ProgramConfiguration', Config: { UltravisorAuthDispatchPinned: true } },
					{ Label: '"true" in ProgramConfiguration', Config: { UltravisorAuthDispatchPinned: 'true' } },
					{ Label: 'true in settings', Settings: { UltravisorAuthDispatchPinned: true } },
					{ Label: 'false in ProgramConfiguration, true in settings', Config: { UltravisorAuthDispatchPinned: false }, Settings: { UltravisorAuthDispatchPinned: true } }
				].forEach((pCase) =>
				{
					test(pCase.Label + ': pinned by Name, strictly', async function ()
					{
						let tmpCaptured = await probe(captureHarness([SHELL_NAMED_AUTH, LIVE_AUTH], pCase.Config, pCase.Settings));
						Expect(tmpCaptured).to.deep.equal(Object.assign({}, LEGACY_DISPATCH, { AffinityKey: 'auth-beacon', RequireAffinityMatch: true }));
					});
				});

				test('an Offline auth record listed first is passed over for the live one', async function ()
				{
					let tmpCaptured = await probe(captureHarness([OFFLINE_AUTH, LIVE_AUTH], { UltravisorAuthDispatchPinned: true }));
					Expect(tmpCaptured.AffinityKey).to.equal('auth-beacon');
				});

				test('a Busy auth beacon counts as live', async function ()
				{
					let tmpBusy = Object.assign({}, LIVE_AUTH, { Status: 'Busy' });
					let tmpCaptured = await probe(captureHarness([tmpBusy], { UltravisorAuthDispatchPinned: true }));
					Expect(tmpCaptured.AffinityKey).to.equal('auth-beacon');
				});

				test('no live auth beacon: the old shape, never a pin to an Offline record', async function ()
				{
					let tmpCaptured = await probe(captureHarness([OFFLINE_AUTH], { UltravisorAuthDispatchPinned: true }));
					Expect(tmpCaptured).to.deep.equal(LEGACY_DISPATCH);
				});

				test('an embedder\'s self-beacon name is pinned the same way', async function ()
				{
					let tmpSelf = Object.assign({}, LIVE_AUTH, { Name: 'headlight-auth-self' });
					let tmpCaptured = await probe(captureHarness([tmpSelf], { UltravisorAuthDispatchPinned: true }));
					Expect(tmpCaptured.AffinityKey).to.equal('headlight-auth-self');
				});

				test('on a real coordinator, the same login goes only to the auth beacon', async function ()
				{
					let tmpHub = realHarness({ UltravisorAuthDispatchPinned: true });
					tmpHub.bridge.login('operator', 'the-password');
					await tick();
					Expect(tmpHub.pushed.map((pPush) => pPush.BeaconID)).to.deep.equal([tmpHub.AuthID]);
				});
			}
		);

		suite
		(
			'The bridge\'s other answers do not change',
			function ()
			{
				test('isAvailable, getAuthBeaconID and getAuthBeaconTags are the same with it on or off', function ()
				{
					let tmpBeacons = [OFFLINE_AUTH, SHELL_NAMED_AUTH, LIVE_AUTH];
					let tmpOff = captureHarness(tmpBeacons).bridge;
					let tmpOn = captureHarness(tmpBeacons, { UltravisorAuthDispatchPinned: true }).bridge;
					Expect(tmpOn.isAvailable()).to.equal(tmpOff.isAvailable());
					Expect(tmpOn.getAuthBeaconID()).to.equal(tmpOff.getAuthBeaconID());
					Expect(tmpOn.getAuthBeaconTags()).to.deep.equal(tmpOff.getAuthBeaconTags());
					Expect(tmpOff.getAuthBeaconID(), 'still the first Authentication record, Offline or not').to.equal('b-old');
				});
			}
		);
	}
);
