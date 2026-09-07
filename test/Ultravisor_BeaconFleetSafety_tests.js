/**
 * Tests for the fleet-safety behaviors of the beacon coordinator and
 * scheduler.
 *
 * These cover hazards that cannot fire with a single beacon and become
 * reachable the moment a second beacon of the same capability exists:
 *
 *   - Cancellation actually reaching the beacon running the work, and
 *     the hub refusing a success report on work it called off.
 *   - A dropped WebSocket not handing running work to a second beacon.
 *   - A scheduled retry releasing the concurrency slot it was holding.
 *   - A late completion from a superseded attempt being refused.
 */

const libPict = require('pict');
const libFS = require('fs');
const libPath = require('path');

const Chai = require('chai');
const Expect = Chai.expect;

const libUltravisorBeaconCoordinator = require('../source/services/Ultravisor-Beacon-Coordinator.cjs');
const libUltravisorBeaconQueueStore = require('../source/services/persistence/Ultravisor-Beacon-QueueStore.cjs');
const libUltravisorBeaconRunManager = require('../source/services/Ultravisor-Beacon-RunManager.cjs');
const libUltravisorBeaconActionDefaults = require('../source/services/Ultravisor-Beacon-ActionDefaults.cjs');
const libUltravisorBeaconScheduler = require('../source/services/Ultravisor-Beacon-Scheduler.cjs');
const libUltravisorQueuePersistenceBridge = require('../source/services/Ultravisor-QueuePersistenceBridge.cjs');

const TEST_BASE = libPath.resolve(__dirname, '..', '.test_staging_fleetsafety');

function ensureClean(pDir)
{
	if (libFS.existsSync(pDir))
	{
		libFS.rmSync(pDir, { recursive: true, force: true });
	}
	libFS.mkdirSync(pDir, { recursive: true });
}

function buildFable(pStoragePath)
{
	let tmpFable = new libPict({
		Product: 'Ultravisor-FleetSafety-Test',
		LogLevel: 5,
		UltravisorFileStorePath: pStoragePath,
		UltravisorHubInstanceID: 'testhub'
	});

	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconQueueStore', libUltravisorBeaconQueueStore);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconCoordinator', libUltravisorBeaconCoordinator);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconRunManager', libUltravisorBeaconRunManager);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconActionDefaults', libUltravisorBeaconActionDefaults);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconScheduler', libUltravisorBeaconScheduler);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorQueuePersistenceBridge', libUltravisorQueuePersistenceBridge);

	let tmpStore = Object.values(tmpFable.servicesMap.UltravisorBeaconQueueStore)[0];
	tmpStore.initialize(pStoragePath);

	return tmpFable;
}

function getService(pFable, pName)
{
	let tmpMap = pFable.servicesMap[pName];
	return tmpMap ? Object.values(tmpMap)[0] : null;
}

function addStubBeacon(pCoordinator, pBeaconID, pMaxConcurrent)
{
	pCoordinator._Beacons[pBeaconID] = {
		BeaconID: pBeaconID,
		Name: pBeaconID,
		Capabilities: ['Shell'],
		MaxConcurrent: pMaxConcurrent || 1,
		CurrentWorkItems: [],
		Status: 'Online',
		LastHeartbeat: new Date().toISOString()
	};

	return pCoordinator._Beacons[pBeaconID];
}

/**
 * Put a work item into the state a beacon-dispatched item is really in:
 * Running, assigned, and occupying a slot on the beacon record.
 */
function dispatchToBeacon(pCoordinator, pWorkItemHash, pBeaconID)
{
	let tmpItem = pCoordinator._WorkQueue[pWorkItemHash];
	let tmpNowIso = new Date().toISOString();

	tmpItem.Status = 'Running';
	tmpItem.AssignedBeaconID = pBeaconID;
	tmpItem.ClaimedAt = tmpNowIso;
	tmpItem.DispatchedAt = tmpNowIso;
	tmpItem.LastEventAt = tmpNowIso;
	pCoordinator._Beacons[pBeaconID].CurrentWorkItems.push(pWorkItemHash);

	return tmpItem;
}

suite('Ultravisor Beacon Fleet Safety', () =>
{
	let _TestDir = '';

	setup(() =>
	{
		_TestDir = libPath.join(TEST_BASE, `t-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
		ensureClean(_TestDir);
	});

	suite('Cancel delivery to the running beacon', () =>
	{
		test('requestCancel on a Running item pushes the cancel to its beacon', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');
			let tmpScheduler = getService(tmpFable, 'UltravisorBeaconScheduler');

			addStubBeacon(tmpCoordinator, 'b-cancel');
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute' });
			dispatchToBeacon(tmpCoordinator, tmpItem.WorkItemHash, 'b-cancel');

			let tmpPushes = [];
			tmpCoordinator.setCancelPushHandler((pBeaconID, pWorkItemHash, pReason) =>
			{
				tmpPushes.push({ BeaconID: pBeaconID, WorkItemHash: pWorkItemHash, Reason: pReason });
				return true;
			});

			let tmpResult = tmpScheduler.requestCancel(tmpItem.WorkItemHash, 'operator stopped it');

			// The flag still gets set -- that part was never broken.
			Expect(tmpResult.CancelRequested).to.equal(true);

			// What was broken: the flag never left the hub.
			Expect(tmpPushes).to.have.length(1);
			Expect(tmpPushes[0].BeaconID).to.equal('b-cancel');
			Expect(tmpPushes[0].WorkItemHash).to.equal(tmpItem.WorkItemHash);
			Expect(tmpPushes[0].Reason).to.equal('operator stopped it');
			Expect(tmpResult.CancelDelivered).to.equal(true);
		});

		test('a beacon that stops cooperatively lands the item in Canceled, not Complete', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');
			let tmpScheduler = getService(tmpFable, 'UltravisorBeaconScheduler');

			let tmpBeacon = addStubBeacon(tmpCoordinator, 'b-coop');
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute' });
			dispatchToBeacon(tmpCoordinator, tmpItem.WorkItemHash, 'b-coop');

			tmpCoordinator.setCancelPushHandler(() => { return true; });
			tmpScheduler.requestCancel(tmpItem.WorkItemHash, 'halfway through');

			// The beacon acknowledges, winds the action down, and reports
			// the cancellation -- the cooperative path.
			tmpCoordinator.acknowledgeCancel(tmpItem.WorkItemHash, 'b-coop');
			let tmpConfirm = tmpScheduler.confirmCancel(tmpItem.WorkItemHash, 'halfway through');

			Expect(tmpConfirm.Canceled).to.equal(true);
			Expect(tmpCoordinator._WorkQueue[tmpItem.WorkItemHash].Status).to.equal('Canceled');
			// The slot the running item held has to come back.
			Expect(tmpBeacon.CurrentWorkItems).to.have.length(0);
		});

		test('a completion is refused once the beacon acknowledged the cancel', (fDone) =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');
			let tmpScheduler = getService(tmpFable, 'UltravisorBeaconScheduler');

			addStubBeacon(tmpCoordinator, 'b-ignores');
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute' });
			dispatchToBeacon(tmpCoordinator, tmpItem.WorkItemHash, 'b-ignores');

			tmpCoordinator.setCancelPushHandler(() => { return true; });
			tmpScheduler.requestCancel(tmpItem.WorkItemHash, 'stop please');
			tmpCoordinator.acknowledgeCancel(tmpItem.WorkItemHash, 'b-ignores');

			// The action ignored the flag and ran to completion anyway.
			tmpCoordinator.completeWorkItem(tmpItem.WorkItemHash,
				{ Outputs: { ExitCode: 0 }, Log: [] },
				(pError) =>
				{
					Expect(pError).to.be.an('error');
					Expect(pError.message).to.contain('cancel was requested and acknowledged');
					// And it must not be recorded as a success.
					Expect(tmpCoordinator._WorkQueue[tmpItem.WorkItemHash].Status).to.equal('Canceled');
					return fDone();
				});
		});

		test('a completion still lands when the cancel was never acknowledged', (fDone) =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');
			let tmpScheduler = getService(tmpFable, 'UltravisorBeaconScheduler');

			addStubBeacon(tmpCoordinator, 'b-raced');
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute' });
			dispatchToBeacon(tmpCoordinator, tmpItem.WorkItemHash, 'b-raced');

			// No push handler wired: the request never reached the beacon,
			// so the beacon finishing normally is a race, not a defect.
			tmpScheduler.requestCancel(tmpItem.WorkItemHash, 'too late');

			tmpCoordinator.completeWorkItem(tmpItem.WorkItemHash,
				{ Outputs: { ExitCode: 0 }, Log: [] },
				(pError) =>
				{
					Expect(pError).to.equal(null);
					return fDone();
				});
		});
	});

	suite('A dropped connection is not an abandonment', () =>
	{
		test('a lost connection keeps the beacon running work assigned to it', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');

			addStubBeacon(tmpCoordinator, 'b-dropped');
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute' });
			dispatchToBeacon(tmpCoordinator, tmpItem.WorkItemHash, 'b-dropped');

			tmpCoordinator.deregisterBeacon('b-dropped', { ConnectionLost: true });

			let tmpAfter = tmpCoordinator._WorkQueue[tmpItem.WorkItemHash];
			// Returning this to Pending is what let a second beacon start
			// running the same job while the first still had it.
			Expect(tmpAfter.Status).to.equal('Running');
			Expect(tmpAfter.AssignedBeaconID).to.equal('b-dropped');

			// The record survives so the reconnecting beacon reclaims the
			// same BeaconID by name instead of arriving as a stranger.
			Expect(tmpCoordinator._Beacons['b-dropped']).to.be.an('object');
			Expect(tmpCoordinator._Beacons['b-dropped'].Status).to.equal('Offline');
		});

		test('work held through a disconnect is not dispatched to a second beacon', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');

			addStubBeacon(tmpCoordinator, 'b-first');
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute' });
			dispatchToBeacon(tmpCoordinator, tmpItem.WorkItemHash, 'b-first');

			tmpCoordinator.deregisterBeacon('b-first', { ConnectionLost: true });

			// A second beacon of the same capability arrives and the hub
			// sweeps for anything dispatchable.
			addStubBeacon(tmpCoordinator, 'b-second');
			let tmpPushed = [];
			tmpCoordinator.setWorkItemPushHandler((pBeaconID, pWorkItem) =>
			{
				tmpPushed.push({ BeaconID: pBeaconID, WorkItemHash: pWorkItem.WorkItemHash });
				return true;
			});
			tmpCoordinator._dispatchPendingWorkItems();

			Expect(tmpPushed).to.have.length(0);
			Expect(tmpCoordinator._Beacons['b-second'].CurrentWorkItems).to.have.length(0);
		});

		test('an explicit deregister still releases running work', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');

			addStubBeacon(tmpCoordinator, 'b-quit');
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute' });
			dispatchToBeacon(tmpCoordinator, tmpItem.WorkItemHash, 'b-quit');

			// The beacon said it was going away, so its work really is free.
			let tmpRemoved = tmpCoordinator.deregisterBeacon('b-quit');

			Expect(tmpRemoved).to.equal(true);
			let tmpAfter = tmpCoordinator._WorkQueue[tmpItem.WorkItemHash];
			Expect(tmpAfter.Status).to.equal('Pending');
			Expect(tmpAfter.AssignedBeaconID).to.equal(null);
			Expect(tmpCoordinator._Beacons['b-quit']).to.equal(undefined);
		});

		test('work whose beacon never returns still frees itself through the stall path', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');
			let tmpScheduler = getService(tmpFable, 'UltravisorBeaconScheduler');

			let tmpBeacon = addStubBeacon(tmpCoordinator, 'b-gone');
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute' });
			dispatchToBeacon(tmpCoordinator, tmpItem.WorkItemHash, 'b-gone');
			tmpCoordinator.deregisterBeacon('b-gone', { ConnectionLost: true });

			// Backdate past HeartbeatExpectedMs (60s) x
			// STALL_HEARTBEAT_MULTIPLIER (2). The beacon is genuinely dead
			// rather than briefly disconnected, and the existing health
			// pass is what has to notice.
			let tmpQueued = tmpCoordinator._WorkQueue[tmpItem.WorkItemHash];
			tmpQueued.LastEventAt = new Date(Date.now() - 130000).toISOString();

			tmpScheduler._healthTick();

			// stallWorkItem finalizes and removes items with no RunHash.
			Expect(tmpCoordinator._WorkQueue[tmpItem.WorkItemHash]).to.equal(undefined);
			Expect(tmpBeacon.CurrentWorkItems).to.have.length(0);
		});
	});

	suite('Retry slot accounting', () =>
	{
		test('a scheduled retry releases the beacon concurrency slot', (fDone) =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');

			let tmpBeacon = addStubBeacon(tmpCoordinator, 'b-retry', 1);
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute' });
			// enqueueWorkItem does not carry MaxAttempts off the request;
			// set it on the queued record so the failure takes the retry
			// branch rather than the terminal one.
			tmpCoordinator._WorkQueue[tmpItem.WorkItemHash].MaxAttempts = 3;
			dispatchToBeacon(tmpCoordinator, tmpItem.WorkItemHash, 'b-retry');

			Expect(tmpBeacon.CurrentWorkItems).to.have.length(1);

			tmpCoordinator.failWorkItem(tmpItem.WorkItemHash,
				{ ErrorMessage: 'transient', Log: [] },
				(pError) =>
				{
					Expect(pError).to.equal(null);
					Expect(tmpCoordinator._WorkQueue[tmpItem.WorkItemHash].Status).to.equal('RetryScheduled');

					// At MaxConcurrent 1 a leaked slot retires this beacon
					// from every dispatch path with nothing reporting it.
					Expect(tmpBeacon.CurrentWorkItems).to.have.length(0);
					Expect(tmpCoordinator._runningCountForBeacon('b-retry')).to.equal(0);
					return fDone();
				});
		});
	});

	suite('Late completions from superseded attempts', () =>
	{
		test('a completion reporting a stale attempt number is refused', (fDone) =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');

			addStubBeacon(tmpCoordinator, 'b-attempt');
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute' });
			dispatchToBeacon(tmpCoordinator, tmpItem.WorkItemHash, 'b-attempt');

			// Attempt 1 was given up on and attempt 2 dispatched.
			tmpCoordinator._WorkQueue[tmpItem.WorkItemHash].AttemptNumber = 2;

			tmpCoordinator.completeWorkItem(tmpItem.WorkItemHash,
				{ Outputs: {}, Log: [], AttemptNumber: 1 },
				(pError) =>
				{
					Expect(pError).to.be.an('error');
					Expect(pError.message).to.contain('not the current attempt');
					// It must not be written under attempt 2's number.
					Expect(tmpCoordinator._WorkQueue[tmpItem.WorkItemHash].Status).to.equal('Running');
					return fDone();
				});
		});

		test('a completion from a beacon that is not the assignee is refused', (fDone) =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');

			addStubBeacon(tmpCoordinator, 'b-owner');
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute' });
			dispatchToBeacon(tmpCoordinator, tmpItem.WorkItemHash, 'b-owner');

			tmpCoordinator.completeWorkItem(tmpItem.WorkItemHash,
				{ Outputs: {}, Log: [], ReportingBeaconID: 'b-stranger' },
				(pError) =>
				{
					Expect(pError).to.be.an('error');
					Expect(pError.message).to.contain('is not the assigned beacon');
					Expect(tmpCoordinator._WorkQueue[tmpItem.WorkItemHash].Status).to.equal('Running');
					return fDone();
				});
		});

		test('a completion carrying no identity still completes', (fDone) =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');

			addStubBeacon(tmpCoordinator, 'b-legacy');
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute' });
			dispatchToBeacon(tmpCoordinator, tmpItem.WorkItemHash, 'b-legacy');

			// Every existing caller reports this way. Breaking them to
			// close the identity hole would be a worse trade.
			tmpCoordinator.completeWorkItem(tmpItem.WorkItemHash,
				{ Outputs: { ExitCode: 0 }, Log: [] },
				(pError) =>
				{
					Expect(pError).to.equal(null);
					return fDone();
				});
		});

		test('a completion whose identity matches the assignment completes', (fDone) =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');

			addStubBeacon(tmpCoordinator, 'b-match');
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute' });
			let tmpDispatched = dispatchToBeacon(tmpCoordinator, tmpItem.WorkItemHash, 'b-match');

			tmpCoordinator.completeWorkItem(tmpItem.WorkItemHash,
				{
					Outputs: { ExitCode: 0 },
					Log: [],
					ReportingBeaconID: 'b-match',
					AttemptNumber: tmpDispatched.AttemptNumber
				},
				(pError) =>
				{
					Expect(pError).to.equal(null);
					return fDone();
				});
		});
	});
});
