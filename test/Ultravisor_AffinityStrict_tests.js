/**
 * Strict affinity routing tests.
 *
 * AffinityKey has a dual role: name routing when it matches a registered
 * beacon, otherwise a session-stickiness hint where ANY capable beacon can
 * seed the binding. For designated-beacon work (the data-platform pattern:
 * many beacons share a capability, the caller names which one), that
 * fallback is a hazard — a work item aimed at a beacon that is mid-restart
 * silently runs on whichever beacon polls first (observed live: a schema
 * write landed on a customer source database).
 *
 * RequireAffinityMatch makes the designation strict across every
 * assignment path: enqueue pre-assign, WebSocket push, HTTP poll claim,
 * the scheduler's dispatch tick, and a hub restart that replays the queue
 * journal. The item waits Pending for the named beacon instead of falling
 * back. Pending items are outside the work-item timeout, so the wait lasts
 * until that beacon joins or the item is canceled.
 */

const libPict = require('pict');
const libFS = require('fs');
const libPath = require('path');

const Chai = require('chai');
const Expect = Chai.expect;

const libUltravisorBeaconCoordinator = require('../source/services/Ultravisor-Beacon-Coordinator.cjs');
const libUltravisorBeaconQueueStore = require('../source/services/persistence/Ultravisor-Beacon-QueueStore.cjs');
const libUltravisorBeaconScheduler = require('../source/services/Ultravisor-Beacon-Scheduler.cjs');
const libUltravisorBeaconQueueJournal = require('../source/services/persistence/Ultravisor-Beacon-QueueJournal.cjs');

const TEST_BASE = libPath.resolve(__dirname, '..', '.test_staging_affinity');

function ensureClean(pDir)
{
	if (libFS.existsSync(pDir)) { libFS.rmSync(pDir, { recursive: true, force: true }); }
	libFS.mkdirSync(pDir, { recursive: true });
}

function buildCoordinator(pSuffix)
{
	const tmpPath = libPath.join(TEST_BASE, pSuffix);
	ensureClean(tmpPath);
	let tmpFable = new libPict({ Product: 'Ultravisor-AffinityStrict-Test', LogLevel: 0, UltravisorFileStorePath: tmpPath, UltravisorHubInstanceID: 'testhub' });
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconQueueStore', libUltravisorBeaconQueueStore);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconCoordinator', libUltravisorBeaconCoordinator);
	let tmpStore = Object.values(tmpFable.servicesMap.UltravisorBeaconQueueStore)[0];
	tmpStore.initialize(tmpPath);
	return Object.values(tmpFable.servicesMap.UltravisorBeaconCoordinator)[0];
}

function registerBeacon(pCoordinator, pName)
{
	return pCoordinator.registerBeacon({ Name: pName, Capabilities: [ 'DataBeaconSchema' ], MaxConcurrent: 5 }, `session-${pName}`);
}

suite('Strict affinity routing', function ()
{
	suiteTeardown(function () { if (libFS.existsSync(TEST_BASE)) { libFS.rmSync(TEST_BASE, { recursive: true, force: true }); } });

	test('strict + named beacon registered routes directly to it', function ()
	{
		const tmpCoordinator = buildCoordinator('direct');
		const tmpTarget = registerBeacon(tmpCoordinator, 'private_data_lake_beacon');
		registerBeacon(tmpCoordinator, 'walbec');
		const tmpItem = tmpCoordinator.enqueueWorkItem(
			{ Capability: 'DataBeaconSchema', Action: 'EnsureSchema', Settings: {}, AffinityKey: 'private_data_lake_beacon', RequireAffinityMatch: true });
		Expect(tmpItem.Status).to.equal('Assigned');
		Expect(tmpItem.AssignedBeaconID).to.equal(tmpTarget.BeaconID);
	});

	test('strict + named beacon ABSENT stays pending — no sticky fallback, no foreign claim', function ()
	{
		const tmpCoordinator = buildCoordinator('absent');
		const tmpOther = registerBeacon(tmpCoordinator, 'walbec');
		const tmpItem = tmpCoordinator.enqueueWorkItem(
			{ Capability: 'DataBeaconSchema', Action: 'EnsureSchema', Settings: {}, AffinityKey: 'private_data_lake_beacon', RequireAffinityMatch: true });
		Expect(tmpItem.Status).to.equal('Pending');
		Expect(tmpItem.AssignedBeaconID || null).to.equal(null);

		// The wrong (capable!) beacon polls — it must NOT receive the item.
		const tmpClaimedByOther = tmpCoordinator.pollForWork(tmpOther.BeaconID);
		Expect(tmpClaimedByOther).to.equal(null);

		// The designated beacon comes back and polls — it gets the item.
		const tmpTarget = registerBeacon(tmpCoordinator, 'private_data_lake_beacon');
		const tmpClaimedByTarget = tmpCoordinator.pollForWork(tmpTarget.BeaconID);
		Expect(tmpClaimedByTarget).to.not.equal(null);
		Expect(tmpClaimedByTarget.WorkItemHash).to.equal(tmpItem.WorkItemHash);
	});

	test('non-strict keeps the legacy sticky-hint behavior (any capable beacon claims)', function ()
	{
		const tmpCoordinator = buildCoordinator('legacy');
		const tmpOther = registerBeacon(tmpCoordinator, 'walbec');
		const tmpItem = tmpCoordinator.enqueueWorkItem(
			{ Capability: 'DataBeaconSchema', Action: 'EnsureSchema', Settings: {}, AffinityKey: 'no-such-beacon' });
		Expect(tmpItem.Status).to.equal('Pending');
		const tmpClaimed = tmpCoordinator.pollForWork(tmpOther.BeaconID);
		Expect(tmpClaimed).to.not.equal(null, 'legacy session-affinity semantics preserved');
	});

	test('strict items are not pushed to non-matching WebSocket beacons', function ()
	{
		const tmpCoordinator = buildCoordinator('wspush');
		registerBeacon(tmpCoordinator, 'walbec');
		const tmpPushedTo = [];
		tmpCoordinator._WorkItemPushHandler = (pBeaconID) => { tmpPushedTo.push(pBeaconID); return true; };
		const tmpItem = tmpCoordinator.enqueueWorkItem(
			{ Capability: 'DataBeaconSchema', Action: 'EnsureSchema', Settings: {}, AffinityKey: 'private_data_lake_beacon', RequireAffinityMatch: true });
		Expect(tmpPushedTo.length).to.equal(0, 'no WS push to a non-matching beacon');
		Expect(tmpItem.Status).to.equal('Pending');
	});
});

suite('Affinity push capacity gating', function ()
{
	const libUltravisorBeaconCoordinatorB = require('../source/services/Ultravisor-Beacon-Coordinator.cjs');
	const libUltravisorBeaconQueueStoreB = require('../source/services/persistence/Ultravisor-Beacon-QueueStore.cjs');
	const libPathB = require('path');
	const libFSB = require('fs');
	const TEST_BASE_B = libPathB.resolve(__dirname, '..', '.test_staging_pushgate');

	function buildCoordinatorB(pSuffix)
	{
		const tmpPath = libPathB.join(TEST_BASE_B, pSuffix);
		if (libFSB.existsSync(tmpPath)) { libFSB.rmSync(tmpPath, { recursive: true, force: true }); }
		libFSB.mkdirSync(tmpPath, { recursive: true });
		let tmpFable = new (require('pict'))({ Product: 'Ultravisor-PushGate-Test', LogLevel: 0, UltravisorFileStorePath: tmpPath, UltravisorHubInstanceID: 'testhub' });
		tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconQueueStore', libUltravisorBeaconQueueStoreB);
		tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconCoordinator', libUltravisorBeaconCoordinatorB);
		Object.values(tmpFable.servicesMap.UltravisorBeaconQueueStore)[0].initialize(tmpPath);
		return Object.values(tmpFable.servicesMap.UltravisorBeaconCoordinator)[0];
	}

	suiteTeardown(function () { if (libFSB.existsSync(TEST_BASE_B)) { libFSB.rmSync(TEST_BASE_B, { recursive: true, force: true }); } });

	test('a burst of affinity-assigned items never exceeds the beacon running capacity; held items deliver on slot-free', function ()
	{
		const tmpCoordinator = buildCoordinatorB('burst');
		const tmpBeacon = tmpCoordinator.registerBeacon({ Name: 'private_data_lake_beacon', Capabilities: [ 'MeadowProxy' ], MaxConcurrent: 3 }, 'session-lake');
		const tmpPushed = [];
		tmpCoordinator._WorkItemPushHandler = (pBeaconID, pWorkItem) => { tmpPushed.push(pWorkItem.WorkItemHash); return true; };

		const tmpItems = [];
		for (let i = 0; i < 5; i++)
		{
			tmpItems.push(tmpCoordinator.enqueueWorkItem(
				{ Capability: 'MeadowProxy', Action: 'Request', Settings: { Chunk: i }, AffinityKey: 'private_data_lake_beacon', RequireAffinityMatch: true }));
		}

		Chai.expect(tmpPushed.length).to.equal(3, 'only MaxConcurrent items delivered in the burst');
		const tmpHeld = tmpItems.filter((pItem) => pItem.Status === 'Assigned');
		Chai.expect(tmpHeld.length).to.equal(2, 'overflow items held as Assigned, not lost');

		// Complete one running item — a held item must be delivered.
		const tmpRunningHash = tmpPushed[0];
		tmpCoordinator.completeWorkItem(tmpRunningHash, { Outputs: {} }, () => {});
		Chai.expect(tmpPushed.length).to.equal(4, 'slot-free delivery of a held item');

		tmpCoordinator.completeWorkItem(tmpPushed[1], { Outputs: {} }, () => {});
		Chai.expect(tmpPushed.length).to.equal(5, 'all five eventually delivered');
		Chai.expect(new Set(tmpPushed).size).to.equal(5, 'no duplicate deliveries');
	});

	test('a held item delivered on slot-free starts its event clock at delivery, not at enqueue', function ()
	{
		const tmpCoordinator = buildCoordinatorB('held-clock');
		tmpCoordinator.registerBeacon({ Name: 'private_data_lake_beacon', Capabilities: [ 'MeadowProxy' ], MaxConcurrent: 1 }, 'session-lake');
		const tmpPushed = [];
		tmpCoordinator._WorkItemPushHandler = (pBeaconID, pWorkItem) => { tmpPushed.push(pWorkItem.WorkItemHash); return true; };

		const tmpFirst = tmpCoordinator.enqueueWorkItem({ Capability: 'MeadowProxy', Action: 'Request', Settings: {}, AffinityKey: 'private_data_lake_beacon', RequireAffinityMatch: true });
		const tmpHeld = tmpCoordinator.enqueueWorkItem({ Capability: 'MeadowProxy', Action: 'Request', Settings: {}, AffinityKey: 'private_data_lake_beacon', RequireAffinityMatch: true });
		Chai.expect(tmpHeld.Status).to.equal('Assigned');

		// Held well past the stall threshold (2 x the 60s default heartbeat).
		const tmpLongAgo = new Date(Date.now() - 300000).toISOString();
		tmpHeld.LastEventAt = tmpLongAgo;
		tmpHeld.ClaimedAt = tmpLongAgo;

		const tmpBeforeDelivery = Date.now();
		tmpCoordinator.completeWorkItem(tmpFirst.WorkItemHash, { Outputs: {} }, () => {});

		Chai.expect(tmpPushed).to.include(tmpHeld.WorkItemHash);
		Chai.expect(tmpHeld.Status).to.equal('Running');
		for (const tmpField of [ 'LastEventAt', 'DispatchedAt', 'ClaimedAt' ])
		{
			Chai.expect(Date.parse(tmpHeld[tmpField]), tmpField).to.be.at.least(tmpBeforeDelivery);
		}
	});

	test('a failed delivery leaves a held item Assigned with its timestamps untouched', function ()
	{
		const tmpCoordinator = buildCoordinatorB('held-push-fail');
		tmpCoordinator.registerBeacon({ Name: 'private_data_lake_beacon', Capabilities: [ 'MeadowProxy' ], MaxConcurrent: 1 }, 'session-lake');
		let tmpAccept = true;
		tmpCoordinator._WorkItemPushHandler = () => tmpAccept;

		const tmpFirst = tmpCoordinator.enqueueWorkItem({ Capability: 'MeadowProxy', Action: 'Request', Settings: {}, AffinityKey: 'private_data_lake_beacon', RequireAffinityMatch: true });
		const tmpHeld = tmpCoordinator.enqueueWorkItem({ Capability: 'MeadowProxy', Action: 'Request', Settings: {}, AffinityKey: 'private_data_lake_beacon', RequireAffinityMatch: true });
		const tmpBefore = { LastEventAt: tmpHeld.LastEventAt, DispatchedAt: tmpHeld.DispatchedAt, ClaimedAt: tmpHeld.ClaimedAt };

		tmpAccept = false;
		tmpCoordinator.completeWorkItem(tmpFirst.WorkItemHash, { Outputs: {} }, () => {});

		Chai.expect(tmpHeld.Status).to.equal('Assigned');
		Chai.expect({ LastEventAt: tmpHeld.LastEventAt, DispatchedAt: tmpHeld.DispatchedAt, ClaimedAt: tmpHeld.ClaimedAt }).to.deep.equal(tmpBefore);
	});

	test('direct-dispatch callbacks resolve for held items once delivered and completed', function (fDone)
	{
		const tmpCoordinator = buildCoordinatorB('callbacks');
		tmpCoordinator.registerBeacon({ Name: 'private_data_lake_beacon', Capabilities: [ 'MeadowProxy' ], MaxConcurrent: 1 }, 'session-lake');
		const tmpDelivered = [];
		tmpCoordinator._WorkItemPushHandler = (pBeaconID, pWorkItem) => { tmpDelivered.push(pWorkItem.WorkItemHash); return true; };

		let tmpResolved = 0;
		const fEach = (pError) =>
		{
			Chai.expect(pError).to.equal(null);
			if (++tmpResolved === 2) { fDone(); }
		};
		tmpCoordinator.dispatchAndWait({ Capability: 'MeadowProxy', Action: 'Request', Settings: {}, AffinityKey: 'private_data_lake_beacon', RequireAffinityMatch: true, TimeoutMs: 5000 }, fEach);
		tmpCoordinator.dispatchAndWait({ Capability: 'MeadowProxy', Action: 'Request', Settings: {}, AffinityKey: 'private_data_lake_beacon', RequireAffinityMatch: true, TimeoutMs: 5000 }, fEach);

		Chai.expect(tmpDelivered.length).to.equal(1, 'second item held at capacity 1');
		tmpCoordinator.completeWorkItem(tmpDelivered[0], { Outputs: {} }, () => {});
		Chai.expect(tmpDelivered.length).to.equal(2, 'held item delivered after completion');
		tmpCoordinator.completeWorkItem(tmpDelivered[1], { Outputs: {} }, () => {});
	});
});

// ----------------------------------------------------------------------
// A hub wired the way the CLI wires it (coordinator, scheduler, queue
// journal) but with no timers: each test drives the dispatch tick itself.
// Every push is recorded, so a test can say exactly which beacon got what.
// The items are shaped on plansheet's hub dispatch: AffinityKey
// 'ps.<NodeKey>' with RequireAffinityMatch, so only that node's beacon may
// run them.
// ----------------------------------------------------------------------

const TEST_BASE_PATHS = libPath.resolve(__dirname, '..', '.test_staging_affinity_paths');

function cleanStorePath(pSuffix)
{
	const tmpPath = libPath.join(TEST_BASE_PATHS, pSuffix);
	ensureClean(tmpPath);
	return tmpPath;
}

function buildHub(pStorePath)
{
	const tmpFable = new libPict({ Product: 'Ultravisor-AffinityPaths-Test', LogLevel: 0, UltravisorFileStorePath: pStorePath, UltravisorHubInstanceID: 'testhub' });
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconQueueJournal', libUltravisorBeaconQueueJournal);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconCoordinator', libUltravisorBeaconCoordinator);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconScheduler', libUltravisorBeaconScheduler);
	const tmpJournal = Object.values(tmpFable.servicesMap.UltravisorBeaconQueueJournal)[0];
	tmpJournal.initialize(pStorePath);
	const tmpHub =
	{
		Coordinator: Object.values(tmpFable.servicesMap.UltravisorBeaconCoordinator)[0],
		Scheduler: Object.values(tmpFable.servicesMap.UltravisorBeaconScheduler)[0],
		Journal: tmpJournal,
		Pushed: []
	};
	tmpHub.Coordinator.setWorkItemPushHandler((pBeaconID, pWorkItem) =>
	{
		tmpHub.Pushed.push({ BeaconID: pBeaconID, WorkItemHash: pWorkItem.WorkItemHash });
		return true;
	});
	return tmpHub;
}

function joinBeacon(pHub, pName)
{
	return pHub.Coordinator.registerBeacon({ Name: pName, Capabilities: [ 'plansheet.deploy' ], MaxConcurrent: 1 }, `session-${pName}`);
}

function strictDeploy(pAffinityKey)
{
	return { Capability: 'plansheet.deploy', Action: 'DeployProd', Settings: { IDRun: 7 }, AffinityKey: pAffinityKey, RequireAffinityMatch: true };
}

suite('Strict affinity on every dispatch path', function ()
{
	suiteTeardown(function () { if (libFS.existsSync(TEST_BASE_PATHS)) { libFS.rmSync(TEST_BASE_PATHS, { recursive: true, force: true }); } });

	test('named beacon absent: the item holds Pending and no other capable beacon gets it (scheduler, push, poll)', function ()
	{
		const tmpHub = buildHub(cleanStorePath('absent'));
		const tmpOther = joinBeacon(tmpHub, 'ps.nk-other');
		const tmpItem = tmpHub.Coordinator.enqueueWorkItem(strictDeploy('ps.nk-target'));

		tmpHub.Scheduler._dispatchTick();
		tmpHub.Coordinator._dispatchPendingWorkItems();
		const tmpPolled = tmpHub.Coordinator.pollForWork(tmpOther.BeaconID);

		Expect(tmpPolled).to.equal(null);
		Expect(tmpItem.Status).to.equal('Pending');
		Expect(tmpItem.AssignedBeaconID || null).to.equal(null);
		Expect(tmpOther.CurrentWorkItems).to.deep.equal([]);
		Expect(tmpHub.Pushed).to.deep.equal([]);
	});

	test('the named beacon returns and the next dispatch tick hands it the item', function ()
	{
		const tmpHub = buildHub(cleanStorePath('returns'));
		joinBeacon(tmpHub, 'ps.nk-other');
		const tmpItem = tmpHub.Coordinator.enqueueWorkItem(strictDeploy('ps.nk-target'));
		tmpHub.Scheduler._dispatchTick();
		Expect(tmpItem.Status).to.equal('Pending');

		const tmpTarget = joinBeacon(tmpHub, 'ps.nk-target');
		tmpHub.Scheduler._dispatchTick();

		Expect(tmpItem.Status).to.equal('Dispatched');
		Expect(tmpItem.AssignedBeaconID).to.equal(tmpTarget.BeaconID);
		Expect(tmpHub.Pushed).to.deep.equal([ { BeaconID: tmpTarget.BeaconID, WorkItemHash: tmpItem.WorkItemHash } ]);
	});

	test('a clean deregistration releases the item to Pending, and only the named beacon gets it back', function ()
	{
		const tmpHub = buildHub(cleanStorePath('deregister'));
		const tmpTarget = joinBeacon(tmpHub, 'ps.nk-target');
		joinBeacon(tmpHub, 'ps.nk-other');
		const tmpItem = tmpHub.Coordinator.enqueueWorkItem(strictDeploy('ps.nk-target'));
		Expect(tmpItem.Status).to.equal('Running');
		Expect(tmpItem.AssignedBeaconID).to.equal(tmpTarget.BeaconID);

		// A stopped node sends Deregister: the hub drops its record and releases its work.
		tmpHub.Coordinator.deregisterBeacon(tmpTarget.BeaconID);
		Expect(tmpItem.Status).to.equal('Pending');
		tmpHub.Pushed.length = 0;

		tmpHub.Scheduler._dispatchTick();
		Expect(tmpItem.Status).to.equal('Pending');
		Expect(tmpHub.Pushed).to.deep.equal([]);

		const tmpBack = joinBeacon(tmpHub, 'ps.nk-target');
		tmpHub.Scheduler._dispatchTick();
		Expect(tmpItem.AssignedBeaconID).to.equal(tmpBack.BeaconID);
		Expect(tmpHub.Pushed.map((pPush) => pPush.BeaconID)).to.deep.equal([ tmpBack.BeaconID ]);
	});

	test('RequireAffinityMatch with an empty AffinityKey is never dispatched (enqueue push, scheduler, slot-free re-dispatch, poll)', function ()
	{
		const tmpHub = buildHub(cleanStorePath('empty-key'));
		const tmpOther = joinBeacon(tmpHub, 'ps.nk-other');
		const tmpItem = tmpHub.Coordinator.enqueueWorkItem(strictDeploy(''));

		tmpHub.Scheduler._dispatchTick();
		tmpHub.Coordinator._dispatchPendingWorkItems();
		const tmpPolled = tmpHub.Coordinator.pollForWork(tmpOther.BeaconID);

		Expect(tmpPolled).to.equal(null);
		Expect(tmpItem.Status).to.equal('Pending');
		Expect(tmpItem.AssignedBeaconID || null).to.equal(null);
		Expect(tmpHub.Pushed).to.deep.equal([]);
	});

	test('without RequireAffinityMatch an unmatched AffinityKey still falls back to a capable beacon', function ()
	{
		// Scheduler path: no push channel, so only the dispatch tick can place it.
		const tmpTickHub = buildHub(cleanStorePath('fallback-tick'));
		tmpTickHub.Coordinator.setWorkItemPushHandler(null);
		const tmpTickOther = joinBeacon(tmpTickHub, 'ps.nk-other');
		const tmpTickItem = tmpTickHub.Coordinator.enqueueWorkItem({ Capability: 'plansheet.deploy', Action: 'DeployDev', Settings: {}, AffinityKey: 'ps.nk-target' });
		Expect(tmpTickItem.Status).to.equal('Pending');
		tmpTickHub.Scheduler._dispatchTick();
		Expect(tmpTickItem.Status).to.equal('Dispatched');
		Expect(tmpTickItem.AssignedBeaconID).to.equal(tmpTickOther.BeaconID);

		// WebSocket path: pushed to the capable beacon at enqueue.
		const tmpPushHub = buildHub(cleanStorePath('fallback-push'));
		const tmpPushOther = joinBeacon(tmpPushHub, 'ps.nk-other');
		const tmpPushItem = tmpPushHub.Coordinator.enqueueWorkItem({ Capability: 'plansheet.deploy', Action: 'DeployDev', Settings: {}, AffinityKey: 'ps.nk-target' });
		Expect(tmpPushItem.AssignedBeaconID).to.equal(tmpPushOther.BeaconID);
		Expect(tmpPushHub.Pushed.map((pPush) => pPush.BeaconID)).to.deep.equal([ tmpPushOther.BeaconID ]);
	});

	test('the scheduler push itself refuses a beacon the item does not name', function ()
	{
		const tmpHub = buildHub(cleanStorePath('push-guard'));
		const tmpOther = joinBeacon(tmpHub, 'ps.nk-other');
		const tmpItem = tmpHub.Coordinator.enqueueWorkItem(strictDeploy('ps.nk-target'));

		tmpHub.Scheduler._dispatchItemToBeacon(tmpItem, tmpOther, tmpHub.Coordinator);

		Expect(tmpItem.Status).to.equal('Pending');
		Expect(tmpItem.AssignedBeaconID || null).to.equal(null);
		Expect(tmpOther.CurrentWorkItems).to.deep.equal([]);
		Expect(tmpHub.Pushed).to.deep.equal([]);
	});

	test('an item carrying another beacon id is still not delivered to that beacon', function ()
	{
		const tmpHub = buildHub(cleanStorePath('wrong-id'));
		const tmpOther = joinBeacon(tmpHub, 'ps.nk-other');
		const tmpPending = tmpHub.Coordinator.enqueueWorkItem(strictDeploy('ps.nk-target'));
		const tmpAssigned = tmpHub.Coordinator.enqueueWorkItem(strictDeploy('ps.nk-target'));
		// No path writes these states for a strict item; the delivery paths check anyway.
		tmpPending.AssignedBeaconID = tmpOther.BeaconID;
		tmpAssigned.Status = 'Assigned';
		tmpAssigned.AssignedBeaconID = tmpOther.BeaconID;

		tmpHub.Scheduler._dispatchTick();
		tmpHub.Coordinator._dispatchPendingWorkItems();
		const tmpPolled = tmpHub.Coordinator.pollForWork(tmpOther.BeaconID);

		Expect(tmpPolled).to.equal(null);
		Expect(tmpPending.Status).to.equal('Pending');
		Expect(tmpAssigned.Status).to.equal('Assigned');
		Expect(tmpHub.Pushed).to.deep.equal([]);
	});

	test('RequireAffinityMatch survives a hub restart: the replayed item still waits for its named beacon', function ()
	{
		const tmpPath = cleanStorePath('restart');
		const tmpBefore = buildHub(tmpPath);
		joinBeacon(tmpBefore, 'ps.nk-target');
		const tmpItem = tmpBefore.Coordinator.enqueueWorkItem(strictDeploy('ps.nk-target'));
		Expect(tmpItem.Status).to.equal('Running');

		// A new process replays the journal. Beacons rejoin in whatever order they reconnect.
		const tmpAfter = buildHub(tmpPath);
		tmpAfter.Coordinator.restoreFromJournal();
		const tmpRestored = tmpAfter.Coordinator.getWorkItem(tmpItem.WorkItemHash);
		Expect(tmpRestored.Status).to.equal('Pending');
		Expect(tmpRestored.RequireAffinityMatch).to.equal(true);

		joinBeacon(tmpAfter, 'ps.nk-other');
		tmpAfter.Scheduler._dispatchTick();
		tmpAfter.Coordinator._dispatchPendingWorkItems();
		Expect(tmpRestored.Status).to.equal('Pending');
		Expect(tmpAfter.Pushed).to.deep.equal([]);

		const tmpBack = joinBeacon(tmpAfter, 'ps.nk-target');
		tmpAfter.Scheduler._dispatchTick();
		Expect(tmpAfter.Pushed.map((pPush) => pPush.BeaconID)).to.deep.equal([ tmpBack.BeaconID ]);
	});

	test('RequireAffinityMatch survives journal compaction', function ()
	{
		const tmpPath = cleanStorePath('compact');
		const tmpBefore = buildHub(tmpPath);
		const tmpItem = tmpBefore.Coordinator.enqueueWorkItem(strictDeploy('ps.nk-target'));
		tmpBefore.Journal.compact(tmpBefore.Coordinator._WorkQueue, tmpBefore.Coordinator._AffinityBindings);

		const tmpAfter = buildHub(tmpPath);
		tmpAfter.Coordinator.restoreFromJournal();
		Expect(tmpAfter.Coordinator.getWorkItem(tmpItem.WorkItemHash).RequireAffinityMatch).to.equal(true);
	});
});

suite('A canceled work item stays canceled', function ()
{
	suiteTeardown(function () { if (libFS.existsSync(TEST_BASE_PATHS)) { libFS.rmSync(TEST_BASE_PATHS, { recursive: true, force: true }); } });

	test('a hub restart does not bring it back, and its beacon never receives it', function ()
	{
		const tmpPath = cleanStorePath('cancel-restart');
		const tmpBefore = buildHub(tmpPath);
		const tmpItem = tmpBefore.Coordinator.enqueueWorkItem(strictDeploy('ps.nk-target'));
		Expect(tmpBefore.Scheduler.requestCancel(tmpItem.WorkItemHash, 'run #7 was stopped').Canceled).to.equal(true);

		const tmpAfter = buildHub(tmpPath);
		tmpAfter.Coordinator.restoreFromJournal();
		Expect(tmpAfter.Coordinator.getWorkItem(tmpItem.WorkItemHash)).to.equal(null);

		joinBeacon(tmpAfter, 'ps.nk-target');
		tmpAfter.Scheduler._dispatchTick();
		Expect(tmpAfter.Pushed).to.deep.equal([]);
	});

	test('canceling an Assigned item frees its slot on the beacon', function ()
	{
		const tmpHub = buildHub(cleanStorePath('cancel-slot'));
		// No push channel, so the item stays Assigned to its beacon.
		tmpHub.Coordinator.setWorkItemPushHandler(null);
		const tmpTarget = joinBeacon(tmpHub, 'ps.nk-target');
		const tmpItem = tmpHub.Coordinator.enqueueWorkItem(strictDeploy('ps.nk-target'));
		Expect(tmpItem.Status).to.equal('Assigned');
		Expect(tmpTarget.CurrentWorkItems).to.include(tmpItem.WorkItemHash);

		Expect(tmpHub.Scheduler.requestCancel(tmpItem.WorkItemHash, 'stopped').Canceled).to.equal(true);

		Expect(tmpItem.Status).to.equal('Canceled');
		Expect(tmpTarget.CurrentWorkItems).to.not.include(tmpItem.WorkItemHash);
	});
});
