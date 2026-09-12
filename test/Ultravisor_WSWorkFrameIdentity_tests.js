/**
 * WebSocket work-frame identity (UltravisorBeaconWSWorkFrameIdentity)
 *
 * The WebSocket upgrade is never gated, and the handlers for WorkComplete,
 * WorkError, WorkProgress, WorkCancelAck, WorkCanceled and WorkResultUpload
 * act on whatever WorkItemHash a frame names, from any socket. completeWorkItem
 * only refuses a completion whose ReportingBeaconID is set and disagrees with
 * the assignment, so a frame from an unregistered socket (which carries no
 * BeaconID) is accepted. That lets a socket forge the result of a work item it
 * was never assigned, including the result of an AUTH_Login or
 * AUTH_ValidateBeaconJoin the hub dispatched through the bridge.
 *
 * The option makes the hub act on one of those frames only when it comes from
 * the socket that holds the item's assigned registration.
 *
 * These tests pin:
 *   - Unset (the default): every handler behaves exactly as before, and the
 *     forge succeeds. This is the standing hole, pinned so it cannot drift.
 *   - 'socket': a frame from any other socket is dropped, the forged AUTH
 *     completion no longer resolves its waiter, and the legitimate beacon
 *     still reports normally.
 *   - 'warn': as before, plus a warning.
 *
 * The coordinator, scheduler and queue store are the real services. A
 * finalized item (Complete, Error, Canceled) is removed from the queue, so
 * "honored" reads as the item being gone and "dropped" as it still sitting
 * Assigned.
 */

const libPict = require('pict');
const libFS = require('fs');
const libPath = require('path');

const Chai = require('chai');
const Expect = Chai.expect;

const libAPIServer = require('../source/web_server/Ultravisor-API-Server.cjs');
const libUltravisorBeaconCoordinator = require('../source/services/Ultravisor-Beacon-Coordinator.cjs');
const libUltravisorBeaconQueueStore = require('../source/services/persistence/Ultravisor-Beacon-QueueStore.cjs');
const libUltravisorBeaconRunManager = require('../source/services/Ultravisor-Beacon-RunManager.cjs');
const libUltravisorBeaconActionDefaults = require('../source/services/Ultravisor-Beacon-ActionDefaults.cjs');
const libUltravisorBeaconScheduler = require('../source/services/Ultravisor-Beacon-Scheduler.cjs');
const libUltravisorQueuePersistenceBridge = require('../source/services/Ultravisor-QueuePersistenceBridge.cjs');

const TEST_BASE = libPath.resolve(__dirname, '..', '.test_staging_ws_workframe');

const WS_OPEN = 1;

let _HarnessCount = 0;

function ensureClean(pDir)
{
	if (libFS.existsSync(pDir)) { libFS.rmSync(pDir, { recursive: true, force: true }); }
	libFS.mkdirSync(pDir, { recursive: true });
}

// Every API-server method, bound to a stand-in.
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

function getService(pFable, pName)
{
	let tmpMap = pFable.servicesMap[pName];
	return tmpMap ? Object.values(tmpMap)[0] : null;
}

function buildHarness(pMode)
{
	const tmpPath = libPath.join(TEST_BASE, 'hub-' + (_HarnessCount++));
	ensureClean(tmpPath);

	let tmpFable = new libPict({ Product: 'Ultravisor-WSWorkFrame-Test', LogStreams: [{ level: 'fatal' }], UltravisorFileStorePath: tmpPath, UltravisorHubInstanceID: 'testhub' });
	[
		['UltravisorBeaconQueueStore', libUltravisorBeaconQueueStore],
		['UltravisorBeaconCoordinator', libUltravisorBeaconCoordinator],
		['UltravisorBeaconRunManager', libUltravisorBeaconRunManager],
		['UltravisorBeaconActionDefaults', libUltravisorBeaconActionDefaults],
		['UltravisorBeaconScheduler', libUltravisorBeaconScheduler],
		['UltravisorQueuePersistenceBridge', libUltravisorQueuePersistenceBridge]
	].forEach((pPair) => tmpFable.addAndInstantiateServiceTypeIfNotExists(pPair[0], pPair[1]));
	getService(tmpFable, 'UltravisorBeaconQueueStore').initialize(tmpPath);

	let tmpHarness =
	{
		coordinator: getService(tmpFable, 'UltravisorBeaconCoordinator'),
		scheduler: getService(tmpFable, 'UltravisorBeaconScheduler'),
		warnings: []
	};
	// The push handler is what dispatchAndWait needs to place an item on a beacon.
	tmpHarness.coordinator.setWorkItemPushHandler(() => true);

	let tmpConfig = {};
	if (pMode !== undefined)
	{
		tmpConfig.UltravisorBeaconWSWorkFrameIdentity = pMode;
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

function fakeSocket(pBeaconID)
{
	return { readyState: WS_OPEN, _BeaconID: pBeaconID || null, Frames: [], send: function (pText) { this.Frames.push(JSON.parse(pText)); }, close: function () { this.readyState = 3; } };
}

// Register a beacon and map a socket to it, as a real WebSocket registration would.
function connectBeacon(pHarness, pName, pCapabilities)
{
	let tmpRecord = pHarness.coordinator.registerBeacon({ Name: pName, Capabilities: pCapabilities || ['Shell'], MaxConcurrent: 4 }, 'session-' + pName);
	let tmpSocket = fakeSocket(tmpRecord.BeaconID);
	pHarness.self._BeaconWebSockets[tmpRecord.BeaconID] = tmpSocket;
	return { BeaconID: tmpRecord.BeaconID, Socket: tmpSocket, Name: pName };
}

// Enqueue a Shell item already assigned to pBeacon (AffinityKey routing).
function assignedItem(pHarness, pBeacon)
{
	let tmpItem = pHarness.coordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute', Settings: { Command: 'echo' }, AffinityKey: pBeacon.Name });
	Expect(tmpItem.AssignedBeaconID, 'item assigned to the beacon').to.equal(pBeacon.BeaconID);
	return tmpItem;
}

function present(pHarness, pHash)
{
	return pHarness.coordinator.getWorkItem(pHash) !== null;
}

function statusOf(pHarness, pHash)
{
	let tmpItem = pHarness.coordinator.getWorkItem(pHash);
	return tmpItem ? tmpItem.Status : '(finalized)';
}

function complete(pHarness, pHash, pSocket, pOutputs)
{
	pHarness.self._handleBeaconWSWorkComplete({ WorkItemHash: pHash, Outputs: pOutputs || {} }, pSocket);
}

suite
(
	'WebSocket work-frame identity (UltravisorBeaconWSWorkFrameIdentity)',
	function ()
	{
		suiteTeardown(function () { if (libFS.existsSync(TEST_BASE)) { libFS.rmSync(TEST_BASE, { recursive: true, force: true }); } });

		suite
		(
			'Unset (the default): every handler acts as before, and the forge succeeds',
			function ()
			{
				test('the option is not in the default configuration, so state persistence cannot write it to disk', function ()
				{
					let tmpDefaults = require('../source/config/Ultravisor-Default-Command-Configuration.cjs');
					Expect(Object.keys(tmpDefaults).length, 'defaults were read').to.be.greaterThan(5);
					Expect(Object.prototype.hasOwnProperty.call(tmpDefaults, 'UltravisorBeaconWSWorkFrameIdentity')).to.equal(false);
				});

				test('WorkComplete from the assigned beacon completes the item (it leaves the queue)', function ()
				{
					let tmpHarness = buildHarness();
					let tmpA = connectBeacon(tmpHarness, 'beacon-a');
					let tmpItem = assignedItem(tmpHarness, tmpA);
					complete(tmpHarness, tmpItem.WorkItemHash, tmpA.Socket, { ok: true });
					Expect(present(tmpHarness, tmpItem.WorkItemHash), 'item finalized').to.equal(false);
				});

				test('WorkComplete from an unregistered socket still completes the item (the standing hole)', function ()
				{
					let tmpHarness = buildHarness();
					let tmpA = connectBeacon(tmpHarness, 'beacon-a');
					let tmpItem = assignedItem(tmpHarness, tmpA);
					complete(tmpHarness, tmpItem.WorkItemHash, fakeSocket(null), { forged: true });
					Expect(present(tmpHarness, tmpItem.WorkItemHash)).to.equal(false);
				});

				test('a forged WorkComplete resolves a dispatchAndWait AUTH waiter with attacker Outputs', async function ()
				{
					let tmpHarness = buildHarness();
					let tmpAuth = connectBeacon(tmpHarness, 'auth-beacon', ['Authentication']);
					let tmpAnswer = new Promise((fResolve) =>
						tmpHarness.coordinator.dispatchAndWait({ Capability: 'Authentication', Action: 'AUTH_Login', Settings: { Username: 'op', Password: 'p' }, AffinityKey: 'auth-beacon', TimeoutMs: 1000 },
							(pError, pResult) => fResolve({ Error: pError, Result: pResult })));
					let tmpItem = Object.values(tmpHarness.coordinator._WorkQueue).find((pWI) => pWI.Capability === 'Authentication');
					Expect(tmpItem.AssignedBeaconID).to.equal(tmpAuth.BeaconID);

					complete(tmpHarness, tmpItem.WorkItemHash, fakeSocket(null), { Allowed: true, SessionToken: 'forged' });
					let tmpAnswered = await tmpAnswer;
					Expect(tmpAnswered.Error).to.equal(null);
					Expect(tmpAnswered.Result.Outputs.Allowed, 'the forged login was accepted').to.equal(true);
				});

				test('only true, "socket" and "warn" turn it on: "true", 1 and false behave as unset', function ()
				{
					[ 'true', 1, false ].forEach((pValue) =>
					{
						let tmpHarness = buildHarness(pValue);
						let tmpA = connectBeacon(tmpHarness, 'beacon-a');
						let tmpItem = assignedItem(tmpHarness, tmpA);
						complete(tmpHarness, tmpItem.WorkItemHash, fakeSocket(null), {});
						Expect(present(tmpHarness, tmpItem.WorkItemHash), JSON.stringify(pValue)).to.equal(false);
						Expect(tmpHarness.warnings, JSON.stringify(pValue)).to.deep.equal([]);
					});
				});
			}
		);

		[ true, 'socket' ].forEach((pMode) =>
		{
			suite
			(
				'Socket mode (' + JSON.stringify(pMode) + '): a frame is honored only from the assigned beacon\'s socket',
				function ()
				{
					test('WorkComplete from the assigned socket still completes', function ()
					{
						let tmpHarness = buildHarness(pMode);
						let tmpA = connectBeacon(tmpHarness, 'beacon-a');
						let tmpItem = assignedItem(tmpHarness, tmpA);
						complete(tmpHarness, tmpItem.WorkItemHash, tmpA.Socket, { ok: true });
						Expect(present(tmpHarness, tmpItem.WorkItemHash)).to.equal(false);
					});

					test('WorkComplete from another beacon\'s socket is dropped', function ()
					{
						let tmpHarness = buildHarness(pMode);
						let tmpA = connectBeacon(tmpHarness, 'beacon-a');
						let tmpB = connectBeacon(tmpHarness, 'beacon-b');
						let tmpItem = assignedItem(tmpHarness, tmpA);
						complete(tmpHarness, tmpItem.WorkItemHash, tmpB.Socket, { forged: true });
						Expect(present(tmpHarness, tmpItem.WorkItemHash), 'still queued, not finalized').to.equal(true);
						Expect(tmpHarness.warnings.filter((pLine) => pLine.indexOf('dropped WorkComplete') >= 0)).to.have.length(1);
					});

					test('WorkComplete from an unregistered socket is dropped', function ()
					{
						let tmpHarness = buildHarness(pMode);
						let tmpA = connectBeacon(tmpHarness, 'beacon-a');
						let tmpItem = assignedItem(tmpHarness, tmpA);
						complete(tmpHarness, tmpItem.WorkItemHash, fakeSocket(null), { forged: true });
						Expect(present(tmpHarness, tmpItem.WorkItemHash)).to.equal(true);
					});

					test('the forged AUTH completion no longer resolves its waiter; it times out instead', async function ()
					{
						let tmpHarness = buildHarness(pMode);
						connectBeacon(tmpHarness, 'auth-beacon', ['Authentication']);
						let tmpAnswer = new Promise((fResolve) =>
							tmpHarness.coordinator.dispatchAndWait({ Capability: 'Authentication', Action: 'AUTH_Login', Settings: { Username: 'op', Password: 'p' }, AffinityKey: 'auth-beacon', TimeoutMs: 250 },
								(pError, pResult) => fResolve({ Error: pError, Result: pResult })));
						let tmpItem = Object.values(tmpHarness.coordinator._WorkQueue).find((pWI) => pWI.Capability === 'Authentication');

						complete(tmpHarness, tmpItem.WorkItemHash, fakeSocket(null), { Allowed: true, SessionToken: 'forged' });
						let tmpAnswered = await tmpAnswer;
						Expect(tmpAnswered.Error, 'the waiter got a timeout, not the forged result').to.be.an('error');
					});

					test('WorkError from a foreign socket is dropped; from the assigned socket it fails the item', function ()
					{
						let tmpHarness = buildHarness(pMode);
						let tmpA = connectBeacon(tmpHarness, 'beacon-a');
						let tmpB = connectBeacon(tmpHarness, 'beacon-b');
						let tmpItem = assignedItem(tmpHarness, tmpA);
						tmpHarness.self._handleBeaconWSWorkError({ WorkItemHash: tmpItem.WorkItemHash, ErrorMessage: 'forged' }, tmpB.Socket);
						Expect(present(tmpHarness, tmpItem.WorkItemHash), 'still queued, not finalized').to.equal(true);
						tmpHarness.self._handleBeaconWSWorkError({ WorkItemHash: tmpItem.WorkItemHash, ErrorMessage: 'real' }, tmpA.Socket);
						Expect(present(tmpHarness, tmpItem.WorkItemHash), 'failed and finalized').to.equal(false);
					});

					test('WorkProgress from a foreign socket is dropped; from the assigned socket it applies', function ()
					{
						let tmpHarness = buildHarness(pMode);
						let tmpA = connectBeacon(tmpHarness, 'beacon-a');
						let tmpB = connectBeacon(tmpHarness, 'beacon-b');
						let tmpItem = assignedItem(tmpHarness, tmpA);
						tmpHarness.self._handleBeaconWSWorkProgress({ WorkItemHash: tmpItem.WorkItemHash, ProgressData: { Percent: 99, Message: 'forged' } }, tmpB.Socket);
						Expect((tmpHarness.coordinator.getWorkItem(tmpItem.WorkItemHash).Progress || {}).Percent).to.not.equal(99);
						tmpHarness.self._handleBeaconWSWorkProgress({ WorkItemHash: tmpItem.WorkItemHash, ProgressData: { Percent: 50 } }, tmpA.Socket);
						Expect((tmpHarness.coordinator.getWorkItem(tmpItem.WorkItemHash).Progress || {}).Percent).to.equal(50);
					});

					test('WorkCancelAck from a foreign socket is dropped; from the assigned socket it records', function ()
					{
						let tmpHarness = buildHarness(pMode);
						let tmpA = connectBeacon(tmpHarness, 'beacon-a');
						let tmpB = connectBeacon(tmpHarness, 'beacon-b');
						let tmpItem = assignedItem(tmpHarness, tmpA);
						tmpHarness.self._handleBeaconWSWorkCancelAck({ WorkItemHash: tmpItem.WorkItemHash, BeaconID: tmpA.BeaconID }, tmpB.Socket);
						Expect(tmpHarness.coordinator.getWorkItem(tmpItem.WorkItemHash).CancelAcknowledgedAt || null).to.equal(null);
						tmpHarness.self._handleBeaconWSWorkCancelAck({ WorkItemHash: tmpItem.WorkItemHash, BeaconID: tmpA.BeaconID }, tmpA.Socket);
						Expect(tmpHarness.coordinator.getWorkItem(tmpItem.WorkItemHash).CancelAcknowledgedAt || null).to.not.equal(null);
					});

					test('WorkCanceled from a foreign socket is dropped; from the assigned socket it cancels', function ()
					{
						// confirmCancel sets Status to Canceled but leaves the item in the
						// queue, so this asserts the status, not mere presence.
						let tmpHarness = buildHarness(pMode);
						let tmpA = connectBeacon(tmpHarness, 'beacon-a');
						let tmpB = connectBeacon(tmpHarness, 'beacon-b');
						let tmpItem = assignedItem(tmpHarness, tmpA);
						tmpHarness.self._handleBeaconWSWorkCanceled({ WorkItemHash: tmpItem.WorkItemHash, Reason: 'forged' }, tmpB.Socket);
						Expect(statusOf(tmpHarness, tmpItem.WorkItemHash), 'foreign cancel dropped').to.not.equal('Canceled');
						tmpHarness.self._handleBeaconWSWorkCanceled({ WorkItemHash: tmpItem.WorkItemHash, Reason: 'real' }, tmpA.Socket);
						Expect(statusOf(tmpHarness, tmpItem.WorkItemHash), 'assigned cancel honored').to.equal('Canceled');
					});

					test('WorkResultUpload from a foreign socket is not authorized; from the assigned socket it is', function ()
					{
						let tmpHarness = buildHarness(pMode);
						let tmpA = connectBeacon(tmpHarness, 'beacon-a');
						let tmpItem = assignedItem(tmpHarness, tmpA);
						Expect(tmpHarness.self._wsWorkFrameAuthorized(fakeSocket(null), tmpItem.WorkItemHash, 'WorkResultUpload')).to.equal(false);
						Expect(tmpHarness.self._wsWorkFrameAuthorized(tmpA.Socket, tmpItem.WorkItemHash, 'WorkResultUpload')).to.equal(true);
					});

					test('a frame for an item with no assigned beacon is dropped, even from a registered socket', function ()
					{
						let tmpHarness = buildHarness(pMode);
						let tmpA = connectBeacon(tmpHarness, 'beacon-a');
						// An unroutable capability keeps the item Pending with no AssignedBeaconID.
						let tmpItem = tmpHarness.coordinator.enqueueWorkItem({ Capability: 'UnroutableCap', Action: 'Noop', Settings: {} });
						Expect(tmpItem.AssignedBeaconID || null, 'left unassigned').to.equal(null);
						complete(tmpHarness, tmpItem.WorkItemHash, tmpA.Socket, {});
						Expect(present(tmpHarness, tmpItem.WorkItemHash)).to.equal(true);
					});

					test('a socket displaced by a newer registration under the same name can no longer report', function ()
					{
						let tmpHarness = buildHarness(pMode);
						let tmpFirst = connectBeacon(tmpHarness, 'beacon-a');
						let tmpItem = assignedItem(tmpHarness, tmpFirst);
						// The beacon reconnects: same BeaconID reclaimed, a new socket mapped.
						let tmpNewSocket = fakeSocket(tmpFirst.BeaconID);
						tmpHarness.self._BeaconWebSockets[tmpFirst.BeaconID] = tmpNewSocket;
						complete(tmpHarness, tmpItem.WorkItemHash, tmpFirst.Socket, {});
						Expect(present(tmpHarness, tmpItem.WorkItemHash), 'old socket dropped').to.equal(true);
						complete(tmpHarness, tmpItem.WorkItemHash, tmpNewSocket, {});
						Expect(present(tmpHarness, tmpItem.WorkItemHash), 'new socket honored').to.equal(false);
					});
				}
			);
		});

		suite
		(
			'"warn": acts as before, plus a warning',
			function ()
			{
				test('a foreign frame still acts, and logs once per socket and frame type', function ()
				{
					let tmpHarness = buildHarness('warn');
					let tmpA = connectBeacon(tmpHarness, 'beacon-a');
					let tmpStranger = fakeSocket(null);
					let tmpItem = assignedItem(tmpHarness, tmpA);
					tmpHarness.self._handleBeaconWSWorkProgress({ WorkItemHash: tmpItem.WorkItemHash, ProgressData: { Percent: 10 } }, tmpStranger);
					tmpHarness.self._handleBeaconWSWorkProgress({ WorkItemHash: tmpItem.WorkItemHash, ProgressData: { Percent: 20 } }, tmpStranger);
					complete(tmpHarness, tmpItem.WorkItemHash, tmpStranger, {});
					Expect(present(tmpHarness, tmpItem.WorkItemHash), 'foreign completion honored in warn mode').to.equal(false);
					Expect(tmpHarness.warnings.filter((pLine) => pLine.indexOf('WorkProgress for') >= 0)).to.have.length(1);
					Expect(tmpHarness.warnings.filter((pLine) => pLine.indexOf('WorkComplete for') >= 0)).to.have.length(1);
				});

				test('a frame from the assigned socket is not logged', function ()
				{
					let tmpHarness = buildHarness('warn');
					let tmpA = connectBeacon(tmpHarness, 'beacon-a');
					let tmpItem = assignedItem(tmpHarness, tmpA);
					complete(tmpHarness, tmpItem.WorkItemHash, tmpA.Socket, {});
					Expect(tmpHarness.warnings).to.deep.equal([]);
				});
			}
		);

		suite
		(
			'Wiring',
			function ()
			{
				test('the router passes the socket to all six work-frame handlers', function ()
				{
					let tmpSource = libFS.readFileSync(libPath.join(__dirname, '..', 'source', 'web_server', 'Ultravisor-API-Server.cjs'), 'utf8');
					['WorkComplete', 'WorkError', 'WorkProgress', 'WorkCancelAck', 'WorkCanceled'].forEach((pFrame) =>
					{
						Expect(tmpSource, pFrame).to.contain('this._handleBeaconWS' + pFrame + '(tmpData, pWebSocket);');
					});
					Expect(tmpSource, 'WorkResultUpload').to.contain("this._wsWorkFrameAuthorized(pWebSocket, tmpData.WorkItemHash, 'WorkResultUpload')");
				});
			}
		);
	}
);
