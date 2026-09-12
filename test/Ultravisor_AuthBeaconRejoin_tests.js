/**
 * Auth beacon rejoin on the bootstrap secret (UltravisorAuthBeaconRejoinViaBootstrap)
 *
 * In non-promiscuous mode the auth beacon's first join is checked against
 * UltravisorBootstrapAuthSecret, and every later join is sent to the auth
 * beacon to validate. When the auth beacon's WebSocket drops, the hub keeps
 * its record, so the bridge still reports an auth beacon and the auth
 * beacon's own reconnect is sent to itself to validate. Nothing answers, and
 * the reconnect is refused until the hub restarts.
 *
 * The opt-in lets that reconnect present the bootstrap secret instead.
 * These tests pin three things:
 *
 *   - With the key unset, or set to anything but true, admission routes
 *     exactly as it did before the key existed.
 *   - With it on, the auth beacon coming back for its own dropped record is
 *     admitted on the bootstrap secret, and gets that record back.
 *   - Every other shape keeps the validate path: a socket still mapped for
 *     the record (open or closing), an auth beacon on HTTP transport, a
 *     record heartbeated since the drop, a second auth beacon that is live,
 *     a new name, a record that is not an auth record.
 *
 * Everything around the admission decision is real: the coordinator, the
 * bridge, the WebSocket register handler, the rejection path and the close
 * handler. A join goes in through _handleBeaconWSRegister on a fake socket,
 * and a drop goes through _cleanupBeaconWS, so the record fields the check
 * reads are the ones the hub actually writes. Only the bridge's
 * validateBeaconJoin is replaced, by a recorder that refuses.
 */

const libPict = require('pict');
const libFS = require('fs');
const libPath = require('path');

const Chai = require('chai');
const Expect = Chai.expect;

const libAPIServer = require('../source/web_server/Ultravisor-API-Server.cjs');
const libAuthBeaconBridge = require('../source/services/Ultravisor-AuthBeaconBridge.cjs');
const libUltravisorBeaconCoordinator = require('../source/services/Ultravisor-Beacon-Coordinator.cjs');
const libUltravisorBeaconQueueStore = require('../source/services/persistence/Ultravisor-Beacon-QueueStore.cjs');

const TEST_BASE = libPath.resolve(__dirname, '..', '.test_staging_auth_rejoin');

const BOOTSTRAP_SECRET = 'bootstrap-s3cret';
const VALIDATE_REFUSAL = 'refused on the validate path (test recorder)';
const REJOIN_ON = { UltravisorAuthBeaconRejoinViaBootstrap: true };

// ws readyState values, as the hub compares them.
const WS_OPEN = 1;
const WS_CLOSING = 2;
const WS_CLOSED = 3;

// Every API-server method, bound to a stand-in, so a handler that calls a
// helper this file never names (added by a later option, say) still finds it.
function bindApiServerMethods(pSelf)
{
	let tmpProto = libAPIServer.prototype;
	Object.getOwnPropertyNames(tmpProto).forEach((pName) =>
	{
		let tmpDescriptor = Object.getOwnPropertyDescriptor(tmpProto, pName);
		if (pName !== 'constructor' && tmpDescriptor && typeof tmpDescriptor.value === 'function')
		{
			pSelf[pName] = tmpDescriptor.value.bind(pSelf);
		}
	});
	return pSelf;
}

let _HarnessCount = 0;

function ensureClean(pDir)
{
	if (libFS.existsSync(pDir)) { libFS.rmSync(pDir, { recursive: true, force: true }); }
	libFS.mkdirSync(pDir, { recursive: true });
}

function pause(pMs)
{
	return new Promise((fResolve) => setTimeout(fResolve, pMs));
}

/**
 * A real coordinator and bridge, and an API-server stand-in carrying the
 * real register, admission and close methods.
 *
 * @param {object} [pConfig] - merged over a secured hub's ProgramConfiguration
 */
function buildHarness(pConfig)
{
	const tmpPath = libPath.join(TEST_BASE, 'hub-' + (_HarnessCount++));
	ensureClean(tmpPath);

	let tmpFable = new libPict({ Product: 'Ultravisor-AuthBeaconRejoin-Test', LogStreams: [{ level: 'fatal' }], UltravisorFileStorePath: tmpPath, UltravisorHubInstanceID: 'testhub' });
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconQueueStore', libUltravisorBeaconQueueStore);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconCoordinator', libUltravisorBeaconCoordinator);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorAuthBeaconBridge', libAuthBeaconBridge);
	Object.values(tmpFable.servicesMap.UltravisorBeaconQueueStore)[0].initialize(tmpPath);

	let tmpHarness =
	{
		coordinator: Object.values(tmpFable.servicesMap.UltravisorBeaconCoordinator)[0],
		bridge: Object.values(tmpFable.servicesMap.UltravisorAuthBeaconBridge)[0],
		validateCalls: [],
		rejoinChecks: 0,
		logLines: []
	};

	// A dropped auth beacon cannot answer. The recorder answers the way that ends.
	tmpHarness.bridge.validateBeaconJoin = function (pName, pJoinSecret, pCapabilities)
	{
		tmpHarness.validateCalls.push({ Name: pName, JoinSecret: pJoinSecret, Capabilities: pCapabilities });
		return Promise.resolve({ Available: true, Allowed: false, Reason: VALIDATE_REFUSAL });
	};

	let fRecord = (pLevel) => (pMessage) => { tmpHarness.logLines.push(pLevel + ' ' + pMessage); };
	let tmpSelf =
	{
		fable:
		{
			ProgramConfiguration: Object.assign(
				{ UltravisorNonPromiscuous: true, UltravisorBootstrapAuthSecret: BOOTSTRAP_SECRET }, pConfig || {}),
			servicesMap: tmpFable.servicesMap,
			LogNoisiness: 0
		},
		log: { info: fRecord('info'), warn: fRecord('warn'), error: fRecord('error'), debug: () => {}, trace: () => {} },
		_BeaconWebSockets: {}
	};
	bindApiServerMethods(tmpSelf);

	// Count calls to the rejoin check, so the short-circuit order can be asserted.
	let fRealCheck = tmpSelf._isRejoinableAuthRecord;
	tmpSelf._isRejoinableAuthRecord = function (pName)
	{
		tmpHarness.rejoinChecks++;
		return fRealCheck(pName);
	};

	tmpHarness.self = tmpSelf;
	return tmpHarness;
}

/**
 * A socket the register and reject paths can write to. It records what the
 * hub sends.
 */
function fakeSocket(pReadyState)
{
	return {
		readyState: (pReadyState === undefined) ? WS_OPEN : pReadyState,
		Frames: [],
		CloseCode: null,
		send: function (pText) { this.Frames.push(JSON.parse(pText)); },
		close: function (pCode) { this.CloseCode = pCode; this.readyState = WS_CLOSING; }
	};
}

/**
 * Send a BeaconRegister frame through the real WebSocket register handler
 * and wait for admission to settle. The validate path resolves a promise,
 * so a macrotask is enough.
 */
async function join(pHarness, pName, pOptions)
{
	let tmpOptions = pOptions || {};
	let tmpSocket = fakeSocket();
	pHarness.self._handleBeaconWSRegister(tmpSocket,
		{
			Name: pName,
			Capabilities: tmpOptions.Capabilities || ['Authentication'],
			MaxConcurrent: 4,
			JoinSecret: (tmpOptions.JoinSecret === undefined) ? BOOTSTRAP_SECRET : tmpOptions.JoinSecret
		});
	await new Promise((fResolve) => setImmediate(fResolve));

	let tmpRegistered = tmpSocket.Frames.find((pFrame) => pFrame.EventType === 'BeaconRegistered');
	let tmpRejected = tmpSocket.Frames.find((pFrame) => pFrame.EventType === 'BeaconRejected');
	return {
		Socket: tmpSocket,
		Admitted: !!tmpRegistered,
		BeaconID: tmpRegistered ? tmpRegistered.BeaconID : null,
		Reason: tmpRejected ? tmpRejected.Reason : null,
		CloseCode: tmpSocket.CloseCode
	};
}

/**
 * The socket closes: run what the hub's 'close' listener runs.
 */
function dropSocket(pHarness, pSocket)
{
	pSocket.readyState = WS_CLOSED;
	pHarness.self._cleanupBeaconWS(pSocket);
}

/**
 * Register a record the way HTTP /Beacon/Register does: no admission and no
 * socket. Pass pSocketState to also map a socket for it, as a WebSocket
 * register would.
 */
function seedRecord(pHarness, pName, pCapabilities, pSocketState)
{
	let tmpRecord = pHarness.coordinator.registerBeacon({ Name: pName, Capabilities: pCapabilities, MaxConcurrent: 4 }, 'session-' + pName);
	if (pSocketState !== undefined)
	{
		let tmpSocket = fakeSocket(pSocketState);
		tmpSocket._BeaconID = tmpRecord.BeaconID;
		pHarness.self._BeaconWebSockets[tmpRecord.BeaconID] = tmpSocket;
	}
	return tmpRecord;
}

/**
 * The case the key exists for: the auth beacon joins on the bootstrap
 * secret, then its socket drops. Returns the dropped record.
 */
async function authBeaconDropped(pHarness, pName)
{
	let tmpFirst = await join(pHarness, pName || 'auth-beacon');
	Expect(tmpFirst.Admitted, 'first join on the bootstrap secret').to.equal(true);
	dropSocket(pHarness, tmpFirst.Socket);

	let tmpRecord = pHarness.coordinator.getBeacon(tmpFirst.BeaconID);
	Expect(tmpRecord.Status, 'record after the drop').to.equal('Offline');
	Expect(tmpRecord.DisconnectedAt, 'DisconnectedAt after the drop').to.be.a('string');
	Expect(pHarness.self._BeaconWebSockets[tmpFirst.BeaconID], 'socket entry after the drop').to.equal(undefined);
	Expect(pHarness.bridge.isAvailable(), 'the bridge still reports an auth beacon').to.equal(true);

	pHarness.validateCalls.length = 0;
	pHarness.rejoinChecks = 0;
	pHarness.logLines.length = 0;
	return tmpRecord;
}

function expectValidatePath(pHarness, pResult, pName)
{
	Expect(pResult.Admitted, 'admitted').to.equal(false);
	Expect(pResult.Reason).to.equal(VALIDATE_REFUSAL);
	Expect(pResult.CloseCode).to.equal(4403);
	Expect(pHarness.validateCalls.map((pCall) => pCall.Name), 'joins sent to the auth beacon').to.deep.equal([pName]);
}

function expectBootstrapAdmit(pHarness, pResult)
{
	Expect(pResult.Admitted, 'admitted (refusal reason: ' + pResult.Reason + ')').to.equal(true);
	Expect(pHarness.validateCalls, 'joins sent to the auth beacon').to.deep.equal([]);
}

suite
(
	'Auth beacon rejoin on the bootstrap secret',
	function ()
	{
		suiteTeardown(function () { if (libFS.existsSync(TEST_BASE)) { libFS.rmSync(TEST_BASE, { recursive: true, force: true }); } });

		suite
		(
			'Key unset (the default): routing is unchanged',
			function ()
			{
				test('the key is not in the default configuration, so state persistence cannot write it to disk', function ()
				{
					let tmpDefaults = require('../source/config/Ultravisor-Default-Command-Configuration.cjs');
					Expect(Object.keys(tmpDefaults).length, 'defaults were read').to.be.greaterThan(5);
					Expect(Object.prototype.hasOwnProperty.call(tmpDefaults, 'UltravisorAuthBeaconRejoinViaBootstrap')).to.equal(false);
				});

				test('a dropped auth beacon\'s reconnect is sent to itself to validate, and refused', async function ()
				{
					let tmpHarness = buildHarness();
					await authBeaconDropped(tmpHarness);
					let tmpRejoin = await join(tmpHarness, 'auth-beacon');
					expectValidatePath(tmpHarness, tmpRejoin, 'auth-beacon');
					Expect(tmpHarness.rejoinChecks, 'rejoin checks run').to.equal(0);
				});

				test('only a literal true turns it on: "true", 1, "yes", false and null route like unset', async function ()
				{
					let tmpValues = ['true', 1, 'yes', false, null];
					for (let i = 0; i < tmpValues.length; i++)
					{
						let tmpHarness = buildHarness({ UltravisorAuthBeaconRejoinViaBootstrap: tmpValues[i] });
						await authBeaconDropped(tmpHarness);
						let tmpRejoin = await join(tmpHarness, 'auth-beacon');
						expectValidatePath(tmpHarness, tmpRejoin, 'auth-beacon');
						Expect(tmpHarness.rejoinChecks, 'rejoin checks run for ' + JSON.stringify(tmpValues[i])).to.equal(0);
					}
				});

				test('a promiscuous hub admits at once and never runs the rejoin check, even with the key on', async function ()
				{
					let tmpHarness = buildHarness({ UltravisorNonPromiscuous: false, UltravisorAuthBeaconRejoinViaBootstrap: true });
					let tmpFirst = await join(tmpHarness, 'auth-beacon', { JoinSecret: '' });
					Expect(tmpFirst.Admitted).to.equal(true);
					dropSocket(tmpHarness, tmpFirst.Socket);

					let tmpRejoin = await join(tmpHarness, 'auth-beacon', { JoinSecret: 'anything' });
					Expect(tmpRejoin.Admitted).to.equal(true);
					Expect(tmpHarness.validateCalls).to.deep.equal([]);
					Expect(tmpHarness.rejoinChecks).to.equal(0);
				});

				test('a dropped auth record still arms secured mode with the flag unset, key on or off', async function ()
				{
					// _isSecuredMode() counts any record advertising Authentication, whatever
					// its Status. Nothing here may narrow that to live records.
					let tmpKeys = [undefined, true];
					for (let i = 0; i < tmpKeys.length; i++)
					{
						let tmpHarness = buildHarness({ UltravisorNonPromiscuous: false, UltravisorAuthBeaconRejoinViaBootstrap: tmpKeys[i] });
						let tmpFirst = await join(tmpHarness, 'auth-beacon');
						dropSocket(tmpHarness, tmpFirst.Socket);
						Expect(tmpHarness.coordinator.getBeacon(tmpFirst.BeaconID).Status).to.equal('Offline');
						Expect(tmpHarness.self._isSecuredMode(), 'secured mode with key ' + tmpKeys[i]).to.equal(true);
					}
				});
			}
		);

		suite
		(
			'Key on: the auth beacon gets its own dropped record back',
			function ()
			{
				test('admitted on the bootstrap secret, without asking the dropped auth beacon', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					await authBeaconDropped(tmpHarness);
					let tmpRejoin = await join(tmpHarness, 'auth-beacon');
					expectBootstrapAdmit(tmpHarness, tmpRejoin);
					Expect(tmpHarness.rejoinChecks).to.equal(1);
					Expect(tmpHarness.logLines.filter((pLine) => pLine.indexOf('is reclaiming its dropped record') >= 0)).to.have.length(1);
				});

				test('it reclaims the same record: same BeaconID, Online, new socket mapped, no second auth record', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					let tmpRecord = await authBeaconDropped(tmpHarness);
					let tmpRejoin = await join(tmpHarness, 'auth-beacon');

					Expect(tmpRejoin.BeaconID).to.equal(tmpRecord.BeaconID);
					Expect(tmpHarness.coordinator.getBeacon(tmpRecord.BeaconID).Status).to.equal('Online');
					Expect(tmpHarness.self._BeaconWebSockets[tmpRecord.BeaconID]).to.equal(tmpRejoin.Socket);
					let tmpAuthRecords = tmpHarness.coordinator.listBeacons()
						.filter((pBeacon) => (pBeacon.Capabilities || []).indexOf('Authentication') >= 0);
					Expect(tmpAuthRecords).to.have.length(1);
					Expect(tmpHarness.bridge.getAuthBeaconID()).to.equal(tmpRecord.BeaconID);
				});

				test('once it is back, another join under its name goes to the validate path', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					let tmpRecord = await authBeaconDropped(tmpHarness);
					await pause(5);
					let tmpRejoin = await join(tmpHarness, 'auth-beacon');
					expectBootstrapAdmit(tmpHarness, tmpRejoin);

					let tmpSecond = await join(tmpHarness, 'auth-beacon');
					expectValidatePath(tmpHarness, tmpSecond, 'auth-beacon');
					Expect(tmpHarness.self._BeaconWebSockets[tmpRecord.BeaconID], 'the rejoined socket is still the one mapped').to.equal(tmpRejoin.Socket);
				});

				test('it can drop and come back more than once', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					let tmpRecord = await authBeaconDropped(tmpHarness);
					for (let i = 0; i < 3; i++)
					{
						let tmpRejoin = await join(tmpHarness, 'auth-beacon');
						expectBootstrapAdmit(tmpHarness, tmpRejoin);
						Expect(tmpRejoin.BeaconID, 'rejoin ' + (i + 1)).to.equal(tmpRecord.BeaconID);
						dropSocket(tmpHarness, tmpRejoin.Socket);
					}
				});

				test('a wrong bootstrap secret is refused, and not passed on to the validate path', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					await authBeaconDropped(tmpHarness);
					let tmpRejoin = await join(tmpHarness, 'auth-beacon', { JoinSecret: 'wrong' });
					Expect(tmpRejoin.Admitted).to.equal(false);
					Expect(tmpRejoin.Reason).to.equal('Bootstrap auth secret mismatch');
					Expect(tmpHarness.validateCalls).to.deep.equal([]);
				});

				test('with no bootstrap secret configured, the rejoin is refused', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					await authBeaconDropped(tmpHarness);
					tmpHarness.self.fable.ProgramConfiguration.UltravisorBootstrapAuthSecret = '';
					let tmpRejoin = await join(tmpHarness, 'auth-beacon', { JoinSecret: '' });
					Expect(tmpRejoin.Admitted).to.equal(false);
					Expect(tmpRejoin.Reason).to.contain('requires UltravisorBootstrapAuthSecret');
					Expect(tmpHarness.validateCalls).to.deep.equal([]);
				});

				test('a dropped record flipped back to Online by a finished work item is still rejoinable', async function ()
				{
					// _removeWorkItemFromBeacon sets Status to Online with no socket behind it.
					// The check reads the socket entry and the timestamps, never Status.
					let tmpHarness = buildHarness(REJOIN_ON);
					let tmpRecord = await authBeaconDropped(tmpHarness);
					tmpHarness.coordinator._removeWorkItemFromBeacon(tmpRecord.BeaconID, 'no-such-work-item');
					Expect(tmpRecord.Status, 'the flip happened').to.equal('Online');

					let tmpRejoin = await join(tmpHarness, 'auth-beacon');
					expectBootstrapAdmit(tmpHarness, tmpRejoin);
				});

				test('a drop in the same millisecond as the last heartbeat still counts as dropped', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					let tmpRecord = await authBeaconDropped(tmpHarness);
					tmpRecord.LastHeartbeat = tmpRecord.DisconnectedAt;
					let tmpRejoin = await join(tmpHarness, 'auth-beacon');
					expectBootstrapAdmit(tmpHarness, tmpRejoin);
				});

				test('a second auth record whose socket is only closing does not count as live', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					await authBeaconDropped(tmpHarness);
					seedRecord(tmpHarness, 'auth-standby', ['Authentication'], WS_CLOSING);
					let tmpRejoin = await join(tmpHarness, 'auth-beacon');
					expectBootstrapAdmit(tmpHarness, tmpRejoin);
				});
			}
		);

		suite
		(
			'Key on: every other shape keeps the validate path',
			function ()
			{
				test('a socket still mapped for the record, open or closing, keeps the validate path', async function ()
				{
					let tmpStates = [WS_OPEN, WS_CLOSING];
					for (let i = 0; i < tmpStates.length; i++)
					{
						let tmpHarness = buildHarness(REJOIN_ON);
						let tmpRecord = await authBeaconDropped(tmpHarness);
						// Everything else about the record says dropped. Only the socket entry
						// is left to refuse it.
						let tmpSocket = fakeSocket(tmpStates[i]);
						tmpSocket._BeaconID = tmpRecord.BeaconID;
						tmpHarness.self._BeaconWebSockets[tmpRecord.BeaconID] = tmpSocket;

						let tmpRejoin = await join(tmpHarness, 'auth-beacon');
						expectValidatePath(tmpHarness, tmpRejoin, 'auth-beacon');
					}
				});

				test('its socket never dropped: a second process under its name keeps the validate path', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					let tmpFirst = await join(tmpHarness, 'auth-beacon');
					Expect(tmpFirst.Admitted).to.equal(true);

					let tmpSecond = await join(tmpHarness, 'auth-beacon');
					expectValidatePath(tmpHarness, tmpSecond, 'auth-beacon');
					Expect(tmpHarness.self._BeaconWebSockets[tmpFirst.BeaconID]).to.equal(tmpFirst.Socket);
				});

				test('an auth beacon on HTTP transport (no socket, never dropped) keeps the validate path', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					seedRecord(tmpHarness, 'auth-beacon', ['Authentication']);
					let tmpJoin = await join(tmpHarness, 'auth-beacon');
					expectValidatePath(tmpHarness, tmpJoin, 'auth-beacon');
				});

				test('a record heartbeated since the drop keeps the validate path', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					let tmpRecord = await authBeaconDropped(tmpHarness);
					await pause(5);
					tmpHarness.coordinator.heartbeat(tmpRecord.BeaconID);
					let tmpRejoin = await join(tmpHarness, 'auth-beacon');
					expectValidatePath(tmpHarness, tmpRejoin, 'auth-beacon');
				});

				test('while another auth beacon has an open socket, it validates the join as before', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					await authBeaconDropped(tmpHarness);
					seedRecord(tmpHarness, 'auth-standby', ['Authentication'], WS_OPEN);
					let tmpRejoin = await join(tmpHarness, 'auth-beacon');
					expectValidatePath(tmpHarness, tmpRejoin, 'auth-beacon');
				});

				test('a new name claiming Authentication keeps the validate path, and gets no record', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					await authBeaconDropped(tmpHarness);
					let tmpJoin = await join(tmpHarness, 'auth-impostor');
					expectValidatePath(tmpHarness, tmpJoin, 'auth-impostor');
					Expect(tmpHarness.coordinator.findBeaconByName('auth-impostor')).to.equal(null);
				});

				test('a dropped record under that name that is not an auth record keeps the validate path', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					await authBeaconDropped(tmpHarness);
					let tmpWorker = seedRecord(tmpHarness, 'worker-1', ['Shell'], WS_OPEN);
					dropSocket(tmpHarness, tmpHarness.self._BeaconWebSockets[tmpWorker.BeaconID]);
					Expect(tmpWorker.DisconnectedAt, 'the worker record was dropped').to.be.a('string');

					let tmpJoin = await join(tmpHarness, 'worker-1');
					expectValidatePath(tmpHarness, tmpJoin, 'worker-1');
				});

				test('a beacon that does not claim Authentication never reaches the rejoin check', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					await authBeaconDropped(tmpHarness);
					let tmpJoin = await join(tmpHarness, 'worker-2', { Capabilities: ['Shell'], JoinSecret: 'mesh-secret' });
					expectValidatePath(tmpHarness, tmpJoin, 'worker-2');
					Expect(tmpHarness.rejoinChecks).to.equal(0);
				});
			}
		);

		suite
		(
			'The rejoin check fails closed',
			function ()
			{
				// Each case starts from a record that passes, so a false is the thing under test.

				test('no coordinator', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					await authBeaconDropped(tmpHarness);
					Expect(tmpHarness.self._isRejoinableAuthRecord('auth-beacon'), 'control').to.equal(true);
					tmpHarness.self._getService = () => null;
					Expect(tmpHarness.self._isRejoinableAuthRecord('auth-beacon')).to.equal(false);
				});

				test('no name', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					await authBeaconDropped(tmpHarness);
					Expect(tmpHarness.self._isRejoinableAuthRecord('auth-beacon'), 'control').to.equal(true);
					Expect(tmpHarness.self._isRejoinableAuthRecord('')).to.equal(false);
					Expect(tmpHarness.self._isRejoinableAuthRecord(undefined)).to.equal(false);
				});

				test('a record whose Capabilities is not an array', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					let tmpRecord = await authBeaconDropped(tmpHarness);
					Expect(tmpHarness.self._isRejoinableAuthRecord('auth-beacon'), 'control').to.equal(true);
					tmpRecord.Capabilities = 'Authentication';
					Expect(tmpHarness.self._isRejoinableAuthRecord('auth-beacon')).to.equal(false);
				});

				test('a coordinator that throws: the check logs, returns false, and the join is validated', async function ()
				{
					let tmpHarness = buildHarness(REJOIN_ON);
					await authBeaconDropped(tmpHarness);
					Expect(tmpHarness.self._isRejoinableAuthRecord('auth-beacon'), 'control').to.equal(true);
					tmpHarness.coordinator.findBeaconByName = () => { throw new Error('lookup failed'); };

					let tmpRejoin = await join(tmpHarness, 'auth-beacon');
					expectValidatePath(tmpHarness, tmpRejoin, 'auth-beacon');
					Expect(tmpHarness.logLines.filter((pLine) => /^warn .*rejoin check .*lookup failed/.test(pLine))).to.have.length(1);
				});
			}
		);
	}
);
