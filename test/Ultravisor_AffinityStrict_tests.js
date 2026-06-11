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
 * RequireAffinityMatch makes the designation strict across all three
 * assignment paths: enqueue pre-assign, WebSocket push, and HTTP poll
 * claim. The item waits (bounded by the normal work-item timeout) for the
 * named beacon instead of falling back.
 */

const libPict = require('pict');
const libFS = require('fs');
const libPath = require('path');

const Chai = require('chai');
const Expect = Chai.expect;

const libUltravisorBeaconCoordinator = require('../source/services/Ultravisor-Beacon-Coordinator.cjs');
const libUltravisorBeaconQueueStore = require('../source/services/persistence/Ultravisor-Beacon-QueueStore.cjs');

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
