/**
 * WebSocket frame identity (UltravisorBeaconWSFrameIdentity)
 *
 * A beacon's BeaconHeartbeat and Deregister frames carry a BeaconID, and by
 * default the hub acts on whichever beacon the frame names, so any socket
 * can keep another beacon alive or deregister it. The option makes those
 * two frames act on the beacon the socket itself registered.
 *
 * These tests pin:
 *   - Unset, or any value but true, 'socket' and 'warn': exactly the old
 *     behaviour, including the parts socket mode exists to change.
 *   - 'warn': the old behaviour, plus one warning per socket and frame type.
 *   - 'socket': frames act on the socket's own current registration, frames
 *     from a socket with none are dropped, and a registration that finishes
 *     admission after its socket closed or asked to stop is not bound.
 *
 * The coordinator is real, and so is every API-server method on the path:
 * the register handler, admission, the heartbeat and deregister handlers and
 * the close handler. Sockets are fakes that record what the hub sends. Only
 * the auth beacon bridge's validateBeaconJoin is replaced, so admission can
 * be held open and released by the test.
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

const TEST_BASE = libPath.resolve(__dirname, '..', '.test_staging_ws_frame_identity');
const BOOTSTRAP_SECRET = 'bootstrap-s3cret';
const OLD = '2000-01-01T00:00:00.000Z';

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

function tick()
{
	return new Promise((fResolve) => setImmediate(fResolve));
}

/**
 * @param {*} pMode - UltravisorBeaconWSFrameIdentity; undefined leaves it unset
 * @param {boolean} [pSecured] - UltravisorNonPromiscuous, so admission goes
 *   through the auth beacon and can be held open
 */
function buildHarness(pMode, pSecured)
{
	const tmpPath = libPath.join(TEST_BASE, 'hub-' + (_HarnessCount++));
	ensureClean(tmpPath);

	let tmpFable = new libPict({ Product: 'Ultravisor-WSFrameIdentity-Test', LogStreams: [{ level: 'fatal' }], UltravisorFileStorePath: tmpPath, UltravisorHubInstanceID: 'testhub' });
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconQueueStore', libUltravisorBeaconQueueStore);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconCoordinator', libUltravisorBeaconCoordinator);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorAuthBeaconBridge', libAuthBeaconBridge);
	Object.values(tmpFable.servicesMap.UltravisorBeaconQueueStore)[0].initialize(tmpPath);

	let tmpHarness =
	{
		coordinator: Object.values(tmpFable.servicesMap.UltravisorBeaconCoordinator)[0],
		bridge: Object.values(tmpFable.servicesMap.UltravisorAuthBeaconBridge)[0],
		holdAdmission: false,
		heldAdmissions: [],
		warnings: []
	};

	// Joins the auth beacon would vet: allowed, at once or when released.
	tmpHarness.bridge.validateBeaconJoin = function ()
	{
		if (tmpHarness.holdAdmission)
		{
			return new Promise((fResolve) => tmpHarness.heldAdmissions.push(fResolve));
		}
		return Promise.resolve({ Available: true, Allowed: true });
	};

	let tmpConfig = { UltravisorNonPromiscuous: pSecured === true, UltravisorBootstrapAuthSecret: BOOTSTRAP_SECRET };
	if (pMode !== undefined)
	{
		tmpConfig.UltravisorBeaconWSFrameIdentity = pMode;
	}
	let tmpSelf =
	{
		fable: { ProgramConfiguration: tmpConfig, servicesMap: tmpFable.servicesMap, LogNoisiness: 0 },
		log: { info: () => {}, warn: (pMessage) => tmpHarness.warnings.push(pMessage), error: () => {}, debug: () => {}, trace: () => {} },
		_BeaconWebSockets: {}
	};
	bindApiServerMethods(tmpSelf);
	tmpHarness.self = tmpSelf;
	return tmpHarness;
}

function fakeSocket()
{
	return {
		readyState: WS_OPEN,
		Frames: [],
		send: function (pText) { this.Frames.push(JSON.parse(pText)); },
		close: function () { this.readyState = WS_CLOSING; }
	};
}

/**
 * A BeaconRegister frame through the real handler. Returns the socket and,
 * once admission has settled, the BeaconID the hub answered with.
 */
async function register(pHarness, pName, pCapabilities, pSocket)
{
	let tmpSocket = pSocket || fakeSocket();
	pHarness.self._handleBeaconWSRegister(tmpSocket,
		{ Name: pName, Capabilities: pCapabilities || ['Shell'], MaxConcurrent: 2, JoinSecret: BOOTSTRAP_SECRET });
	await tick();
	let tmpRegistered = tmpSocket.Frames.find((pFrame) => pFrame.EventType === 'BeaconRegistered');
	return { Socket: tmpSocket, BeaconID: tmpRegistered ? tmpRegistered.BeaconID : null };
}

async function releaseAdmissions(pHarness)
{
	let tmpHeld = pHarness.heldAdmissions.splice(0);
	tmpHeld.forEach((fResolve) => fResolve({ Available: true, Allowed: true }));
	await tick();
}

function heartbeat(pHarness, pSocket, pBeaconID)
{
	pHarness.self._handleBeaconWSHeartbeat({ Action: 'BeaconHeartbeat', BeaconID: pBeaconID }, pSocket);
}

function deregister(pHarness, pSocket, pBeaconID)
{
	pHarness.self._handleBeaconWSDeregister(pSocket, { Action: 'Deregister', BeaconID: pBeaconID });
}

function dropSocket(pHarness, pSocket)
{
	pSocket.readyState = WS_CLOSED;
	pHarness.self._cleanupBeaconWS(pSocket);
}

function record(pHarness, pBeaconID)
{
	return pHarness.coordinator.getBeacon(pBeaconID);
}

// Two Shell beacons, A and B, with B running one work item.
async function twoBeacons(pHarness)
{
	let tmpA = await register(pHarness, 'beacon-a');
	let tmpB = await register(pHarness, 'beacon-b');
	let tmpItem = pHarness.coordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute', Settings: { Command: 'echo' } });
	pHarness.coordinator.pollForWork(tmpB.BeaconID);
	Expect(tmpItem.Status, 'B is running the item').to.equal('Running');
	record(pHarness, tmpA.BeaconID).LastHeartbeat = OLD;
	record(pHarness, tmpB.BeaconID).LastHeartbeat = OLD;
	return { A: tmpA, B: tmpB, Item: tmpItem };
}

/**
 * A secured hub whose worker W is running an item and then drops, and
 * reconnects on a new socket whose admission is held open.
 */
async function workerReconnectingWithAdmissionHeld(pHarness)
{
	await register(pHarness, 'auth-beacon', ['Authentication']);
	let tmpFirst = await register(pHarness, 'worker-w');
	Expect(tmpFirst.BeaconID, 'W joined').to.be.a('string');
	let tmpItem = pHarness.coordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute', Settings: { Command: 'echo' } });
	pHarness.coordinator.pollForWork(tmpFirst.BeaconID);
	dropSocket(pHarness, tmpFirst.Socket);
	Expect(record(pHarness, tmpFirst.BeaconID).Status, 'W after the drop').to.equal('Offline');
	Expect(tmpItem.Status, 'W holds its work after the drop').to.equal('Running');

	pHarness.holdAdmission = true;
	let tmpReconnect = await register(pHarness, 'worker-w');
	Expect(pHarness.heldAdmissions.length, 'admission is held open').to.equal(1);
	return { BeaconID: tmpFirst.BeaconID, Item: tmpItem, Socket: tmpReconnect.Socket };
}

suite
(
	'WebSocket frame identity (UltravisorBeaconWSFrameIdentity)',
	function ()
	{
		suiteTeardown(function () { if (libFS.existsSync(TEST_BASE)) { libFS.rmSync(TEST_BASE, { recursive: true, force: true }); } });

		suite
		(
			'Unset (the default): frames act on the BeaconID they name, as before',
			function ()
			{
				test('the option is not in the default configuration, so state persistence cannot write it to disk', function ()
				{
					let tmpDefaults = require('../source/config/Ultravisor-Default-Command-Configuration.cjs');
					Expect(Object.keys(tmpDefaults).length, 'defaults were read').to.be.greaterThan(5);
					Expect(Object.prototype.hasOwnProperty.call(tmpDefaults, 'UltravisorBeaconWSFrameIdentity')).to.equal(false);
				});

				test('a heartbeat naming another beacon updates that beacon', async function ()
				{
					let tmpHarness = buildHarness();
					let tmpHub = await twoBeacons(tmpHarness);
					heartbeat(tmpHarness, tmpHub.A.Socket, tmpHub.B.BeaconID);
					Expect(record(tmpHarness, tmpHub.B.BeaconID).LastHeartbeat).to.not.equal(OLD);
					Expect(record(tmpHarness, tmpHub.A.BeaconID).LastHeartbeat).to.equal(OLD);
				});

				test('a heartbeat on a socket with no registration still updates, and revives, the beacon it names', async function ()
				{
					let tmpHarness = buildHarness();
					let tmpHub = await twoBeacons(tmpHarness);
					dropSocket(tmpHarness, tmpHub.A.Socket);
					Expect(record(tmpHarness, tmpHub.A.BeaconID).Status).to.equal('Offline');
					heartbeat(tmpHarness, fakeSocket(), tmpHub.A.BeaconID);
					Expect(record(tmpHarness, tmpHub.A.BeaconID).Status).to.equal('Online');
				});

				test('a Deregister naming another beacon deregisters that beacon and releases its work', async function ()
				{
					let tmpHarness = buildHarness();
					let tmpHub = await twoBeacons(tmpHarness);
					deregister(tmpHarness, tmpHub.A.Socket, tmpHub.B.BeaconID);
					Expect(record(tmpHarness, tmpHub.B.BeaconID)).to.equal(null);
					Expect(tmpHub.Item.Status).to.equal('Pending');
					Expect(record(tmpHarness, tmpHub.A.BeaconID)).to.be.an('object');
					Expect(tmpHub.A.Socket._BeaconID).to.equal(null);
				});

				test('a Deregister on a socket that a newer registration displaced still acts on the BeaconID it names', async function ()
				{
					let tmpHarness = buildHarness();
					let tmpFirst = await register(tmpHarness, 'beacon-a');
					let tmpSecond = await register(tmpHarness, 'beacon-a');
					Expect(tmpSecond.BeaconID, 'reclaimed the same record').to.equal(tmpFirst.BeaconID);
					deregister(tmpHarness, tmpFirst.Socket, tmpFirst.BeaconID);
					Expect(record(tmpHarness, tmpFirst.BeaconID)).to.equal(null);
				});

				test('a registration that finishes admission after its socket closed is still bound', async function ()
				{
					let tmpHarness = buildHarness(undefined, true);
					let tmpW = await workerReconnectingWithAdmissionHeld(tmpHarness);
					dropSocket(tmpHarness, tmpW.Socket);
					await releaseAdmissions(tmpHarness);
					Expect(record(tmpHarness, tmpW.BeaconID).Status).to.equal('Online');
					Expect(tmpHarness.self._BeaconWebSockets[tmpW.BeaconID]).to.equal(tmpW.Socket);
				});

				test('only true, "socket" and "warn" turn it on: "true", "SOCKET", 1 and false behave as unset', async function ()
				{
					let tmpValues = ['true', 'SOCKET', 1, false];
					for (let i = 0; i < tmpValues.length; i++)
					{
						let tmpHarness = buildHarness(tmpValues[i]);
						let tmpHub = await twoBeacons(tmpHarness);
						heartbeat(tmpHarness, tmpHub.A.Socket, tmpHub.B.BeaconID);
						Expect(record(tmpHarness, tmpHub.B.BeaconID).LastHeartbeat, JSON.stringify(tmpValues[i])).to.not.equal(OLD);
						Expect(tmpHarness.warnings, JSON.stringify(tmpValues[i])).to.deep.equal([]);
					}
				});
			}
		);

		suite
		(
			'"warn": as before, plus a warning',
			function ()
			{
				test('mismatched heartbeats and Deregisters act as before, each logged once per socket', async function ()
				{
					let tmpHarness = buildHarness('warn');
					let tmpHub = await twoBeacons(tmpHarness);
					heartbeat(tmpHarness, tmpHub.A.Socket, tmpHub.B.BeaconID);
					heartbeat(tmpHarness, tmpHub.A.Socket, tmpHub.B.BeaconID);
					heartbeat(tmpHarness, tmpHub.A.Socket, tmpHub.B.BeaconID);
					Expect(record(tmpHarness, tmpHub.B.BeaconID).LastHeartbeat).to.not.equal(OLD);
					Expect(tmpHarness.warnings.filter((pLine) => pLine.indexOf('BeaconHeartbeat named') >= 0), 'heartbeat warnings').to.have.length(1);

					deregister(tmpHarness, tmpHub.A.Socket, tmpHub.B.BeaconID);
					Expect(record(tmpHarness, tmpHub.B.BeaconID)).to.equal(null);
					Expect(tmpHarness.warnings.filter((pLine) => pLine.indexOf('Deregister named') >= 0), 'deregister warnings').to.have.length(1);
				});

				test('frames naming the socket\'s own beacon are not logged', async function ()
				{
					let tmpHarness = buildHarness('warn');
					let tmpHub = await twoBeacons(tmpHarness);
					heartbeat(tmpHarness, tmpHub.A.Socket, tmpHub.A.BeaconID);
					deregister(tmpHarness, tmpHub.A.Socket, tmpHub.A.BeaconID);
					Expect(tmpHarness.warnings).to.deep.equal([]);
				});
			}
		);

		[true, 'socket'].forEach((pMode) =>
		{
			suite
			(
				'Socket mode (' + JSON.stringify(pMode) + '): frames act on the socket\'s own registration',
				function ()
				{
					test('a heartbeat naming another beacon updates this socket\'s beacon instead', async function ()
					{
						let tmpHarness = buildHarness(pMode);
						let tmpHub = await twoBeacons(tmpHarness);
						heartbeat(tmpHarness, tmpHub.A.Socket, tmpHub.B.BeaconID);
						Expect(record(tmpHarness, tmpHub.A.BeaconID).LastHeartbeat).to.not.equal(OLD);
						Expect(record(tmpHarness, tmpHub.B.BeaconID).LastHeartbeat).to.equal(OLD);
					});

					test('a Deregister naming another beacon deregisters this socket\'s beacon; the other and its work are untouched', async function ()
					{
						let tmpHarness = buildHarness(pMode);
						let tmpHub = await twoBeacons(tmpHarness);
						deregister(tmpHarness, tmpHub.A.Socket, tmpHub.B.BeaconID);
						Expect(record(tmpHarness, tmpHub.A.BeaconID)).to.equal(null);
						Expect(record(tmpHarness, tmpHub.B.BeaconID)).to.be.an('object');
						Expect(tmpHub.Item.Status).to.equal('Running');
						Expect(tmpHarness.self._BeaconWebSockets[tmpHub.B.BeaconID]).to.equal(tmpHub.B.Socket);
					});

					test('a frame naming its own beacon has exactly the default effect', async function ()
					{
						let tmpHarness = buildHarness(pMode);
						let tmpHub = await twoBeacons(tmpHarness);
						heartbeat(tmpHarness, tmpHub.B.Socket, tmpHub.B.BeaconID);
						Expect(record(tmpHarness, tmpHub.B.BeaconID).LastHeartbeat).to.not.equal(OLD);

						deregister(tmpHarness, tmpHub.B.Socket, tmpHub.B.BeaconID);
						Expect(record(tmpHarness, tmpHub.B.BeaconID)).to.equal(null);
						Expect(tmpHub.Item.Status).to.equal('Pending');
						Expect(tmpHub.B.Socket._BeaconID).to.equal(null);
						Expect(tmpHarness.self._BeaconWebSockets[tmpHub.B.BeaconID]).to.equal(undefined);
						Expect(tmpHub.B.Socket.Frames.map((pFrame) => pFrame.EventType)).to.include('Deregistered');
						Expect(tmpHarness.warnings).to.deep.equal([]);
					});

					test('frames on a socket with no registration change nothing, and do not revive an Offline beacon', async function ()
					{
						let tmpHarness = buildHarness(pMode);
						let tmpHub = await twoBeacons(tmpHarness);
						dropSocket(tmpHarness, tmpHub.A.Socket);
						let tmpStranger = fakeSocket();

						heartbeat(tmpHarness, tmpStranger, tmpHub.A.BeaconID);
						Expect(record(tmpHarness, tmpHub.A.BeaconID).Status).to.equal('Offline');
						deregister(tmpHarness, tmpStranger, tmpHub.B.BeaconID);
						Expect(record(tmpHarness, tmpHub.B.BeaconID)).to.be.an('object');
						Expect(tmpHub.Item.Status).to.equal('Running');
						Expect(tmpStranger.Frames.map((pFrame) => pFrame.EventType), 'the reply is still sent').to.include('Deregistered');
						Expect(tmpHarness.warnings.filter((pLine) => pLine.indexOf('dropped') >= 0)).to.have.length(2);
					});

					test('a socket that a newer registration displaced can no longer act on the record', async function ()
					{
						let tmpHarness = buildHarness(pMode);
						let tmpFirst = await register(tmpHarness, 'beacon-a');
						let tmpSecond = await register(tmpHarness, 'beacon-a');
						Expect(tmpSecond.BeaconID).to.equal(tmpFirst.BeaconID);
						record(tmpHarness, tmpFirst.BeaconID).LastHeartbeat = OLD;

						heartbeat(tmpHarness, tmpFirst.Socket, tmpFirst.BeaconID);
						Expect(record(tmpHarness, tmpFirst.BeaconID).LastHeartbeat).to.equal(OLD);
						deregister(tmpHarness, tmpFirst.Socket, tmpFirst.BeaconID);
						Expect(record(tmpHarness, tmpFirst.BeaconID)).to.be.an('object');
						Expect(tmpHarness.self._BeaconWebSockets[tmpFirst.BeaconID]).to.equal(tmpSecond.Socket);
					});
				}
			);

			suite
			(
				'Socket mode (' + JSON.stringify(pMode) + '): a registration that finishes admission late is not bound',
				function ()
				{
					test('after its socket closed: not bound, and the dropped record keeps its work', async function ()
					{
						let tmpHarness = buildHarness(pMode, true);
						let tmpW = await workerReconnectingWithAdmissionHeld(tmpHarness);
						dropSocket(tmpHarness, tmpW.Socket);
						await releaseAdmissions(tmpHarness);

						Expect(record(tmpHarness, tmpW.BeaconID).Status).to.equal('Offline');
						Expect(tmpW.Item.Status).to.equal('Running');
						Expect(tmpHarness.self._BeaconWebSockets[tmpW.BeaconID]).to.equal(undefined);
						Expect(tmpW.Socket.Frames.map((pFrame) => pFrame.EventType)).to.not.include('BeaconRegistered');
					});

					test('after it asked to stop: its record is deregistered and its work released', async function ()
					{
						let tmpHarness = buildHarness(pMode, true);
						let tmpW = await workerReconnectingWithAdmissionHeld(tmpHarness);
						deregister(tmpHarness, tmpW.Socket, tmpW.BeaconID);
						Expect(record(tmpHarness, tmpW.BeaconID), 'the Deregister itself was dropped').to.be.an('object');
						await releaseAdmissions(tmpHarness);

						Expect(record(tmpHarness, tmpW.BeaconID)).to.equal(null);
						Expect(tmpW.Item.Status).to.equal('Pending');
						Expect(tmpHarness.self._BeaconWebSockets[tmpW.BeaconID]).to.equal(undefined);
					});

					test('a stop request does not deregister a record that another live socket now holds', async function ()
					{
						let tmpHarness = buildHarness(pMode, true);
						let tmpW = await workerReconnectingWithAdmissionHeld(tmpHarness);
						deregister(tmpHarness, tmpW.Socket, tmpW.BeaconID);

						// A third connection from W gets in first.
						tmpHarness.holdAdmission = false;
						let tmpLive = await register(tmpHarness, 'worker-w');
						Expect(tmpLive.BeaconID).to.equal(tmpW.BeaconID);
						await releaseAdmissions(tmpHarness);

						Expect(record(tmpHarness, tmpW.BeaconID).Status).to.equal('Online');
						Expect(tmpHarness.self._BeaconWebSockets[tmpW.BeaconID]).to.equal(tmpLive.Socket);
					});
				}
			);
		});

		suite
		(
			'Wiring',
			function ()
			{
				test('the frame router hands the socket to the heartbeat handler', function ()
				{
					// The router lives inside the WebSocket server setup, which these tests
					// do not start. Without the socket, socket mode would drop every heartbeat.
					let tmpSource = libFS.readFileSync(libPath.join(__dirname, '..', 'source', 'web_server', 'Ultravisor-API-Server.cjs'), 'utf8');
					Expect(tmpSource).to.contain('this._handleBeaconWSHeartbeat(tmpData, pWebSocket);');
					Expect(tmpSource).to.contain('this._handleBeaconWSDeregister(pWebSocket, tmpData);');
				});
			}
		);
	}
);
