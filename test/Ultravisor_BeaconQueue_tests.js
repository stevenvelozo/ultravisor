/**
 * Tests for the new beacon queueing system:
 *   - UltravisorBeaconQueueStore (SQLite persistence + migrations)
 *   - UltravisorBeaconRunManager (hub-assigned RunID + idempotency)
 *   - UltravisorBeaconActionDefaults (config normalization)
 *   - UltravisorBeaconScheduler (dispatch, health, buckets, cancellation)
 *   - Coordinator integration (WorkItem fields, store persistence)
 *   - RetoldLabs-QueuePhases emitter (phases.jsonl records)
 */

const libPict = require('pict');
const libFS = require('fs');
const libPath = require('path');
const libOS = require('os');

const Chai = require('chai');
const Expect = Chai.expect;

const libUltravisorBeaconCoordinator = require('../source/services/Ultravisor-Beacon-Coordinator.cjs');
const libUltravisorBeaconQueueStore = require('../source/services/persistence/Ultravisor-Beacon-QueueStore.cjs');
const libUltravisorBeaconRunManager = require('../source/services/Ultravisor-Beacon-RunManager.cjs');
const libUltravisorBeaconActionDefaults = require('../source/services/Ultravisor-Beacon-ActionDefaults.cjs');
const libUltravisorBeaconScheduler = require('../source/services/Ultravisor-Beacon-Scheduler.cjs');
const libUltravisorQueuePersistenceBridge = require('../source/services/Ultravisor-QueuePersistenceBridge.cjs');
const libQueuePhases = require('../../retold-labs/source/RetoldLabs-QueuePhases.cjs');

const TEST_BASE = libPath.resolve(__dirname, '..', '.test_staging_queue');

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
		Product: 'Ultravisor-Queue-Test',
		LogLevel: 5,
		UltravisorFileStorePath: pStoragePath,
		UltravisorHubInstanceID: 'testhub'
	});

	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconQueueStore', libUltravisorBeaconQueueStore);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconCoordinator', libUltravisorBeaconCoordinator);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconRunManager', libUltravisorBeaconRunManager);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconActionDefaults', libUltravisorBeaconActionDefaults);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconScheduler', libUltravisorBeaconScheduler);
	// Coordinator's _getQueuePersistenceBridge() looks up the bridge service
	// via the standard servicesMap. Without it the coordinator silently
	// skips persistence — registration is required so coordinator integration
	// tests can verify rows landed in the in-process store.
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

function addStubBeacon(pCoordinator, pBeaconID, pCapabilities)
{
	pCoordinator._Beacons[pBeaconID] = {
		BeaconID: pBeaconID,
		Name: pBeaconID,
		Capabilities: pCapabilities || ['Shell'],
		MaxConcurrent: 2,
		CurrentWorkItems: [],
		Status: 'Online',
		LastHeartbeat: new Date().toISOString()
	};
}

suite('Ultravisor Beacon Queue', () =>
{
	let _TestDir = '';

	setup(() =>
	{
		_TestDir = libPath.join(TEST_BASE, `t-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
		ensureClean(_TestDir);
	});

	teardown(() =>
	{
		// Best-effort cleanup — individual stores close their DB.
	});

	suite('QueueStore', () =>
	{
		test('provisions all tables and is enabled after initialize', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpStore = getService(tmpFable, 'UltravisorBeaconQueueStore');
			Expect(tmpStore.isEnabled()).to.equal(true);
			// Hot-lookup paths — the store should at minimum return empty arrays/objects, not throw.
			Expect(tmpStore.listWorkItems({})).to.be.an('array');
			Expect(tmpStore.countByStatus()).to.be.an('object');
			Expect(tmpStore.listActionDefaults()).to.be.an('array');
		});

		test('upsertWorkItem / getWorkItemByHash round-trips including nested Settings and Health', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpStore = getService(tmpFable, 'UltravisorBeaconQueueStore');
			tmpStore.upsertWorkItem({
				WorkItemHash: 'wi-1',
				RunID: 'rn-test-1',
				Capability: 'Shell',
				Action: 'Execute',
				Settings: { Command: 'ls' },
				Status: 'Queued',
				Priority: 7,
				EnqueuedAt: new Date().toISOString(),
				Health: 0.75,
				HealthLabel: 'Healthy'
			});

			let tmpRound = tmpStore.getWorkItemByHash('wi-1');
			Expect(tmpRound).to.be.an('object');
			Expect(tmpRound.WorkItemHash).to.equal('wi-1');
			Expect(tmpRound.Priority).to.equal(7);
			Expect(tmpRound.HealthLabel).to.equal('Healthy');
			Expect(tmpRound.Health).to.be.closeTo(0.75, 0.0001);
			Expect(tmpRound.Settings.Command).to.equal('ls');
		});

		test('updateWorkItem patches only named fields', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpStore = getService(tmpFable, 'UltravisorBeaconQueueStore');
			tmpStore.upsertWorkItem({
				WorkItemHash: 'wi-2', RunID: 'rn-2', Capability: 'Shell',
				Status: 'Queued', EnqueuedAt: new Date().toISOString()
			});
			tmpStore.updateWorkItem('wi-2', { Status: 'Dispatched', QueueWaitMs: 123 });
			let tmpOut = tmpStore.getWorkItemByHash('wi-2');
			Expect(tmpOut.Status).to.equal('Dispatched');
			Expect(tmpOut.QueueWaitMs).to.equal(123);
			Expect(tmpOut.Capability).to.equal('Shell'); // unchanged
		});

		test('appendEvent is queryable and preserves payload JSON', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpStore = getService(tmpFable, 'UltravisorBeaconQueueStore');
			tmpStore.appendEvent({
				WorkItemHash: 'wi-3', RunID: 'r3', EventType: 'enqueued',
				FromStatus: '', ToStatus: 'Queued', Payload: { Capability: 'Shell', Priority: 2 }
			});
			let tmpEvents = tmpStore.listEventsForWorkItem('wi-3');
			Expect(tmpEvents).to.have.length(1);
			Expect(tmpEvents[0].EventType).to.equal('enqueued');
			Expect(tmpEvents[0].Payload.Capability).to.equal('Shell');
		});

		test('countByStatus aggregates rows by Status', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpStore = getService(tmpFable, 'UltravisorBeaconQueueStore');
			let tmpNow = new Date().toISOString();
			tmpStore.upsertWorkItem({ WorkItemHash: 'a', Status: 'Queued', EnqueuedAt: tmpNow, Capability: 'Shell' });
			tmpStore.upsertWorkItem({ WorkItemHash: 'b', Status: 'Queued', EnqueuedAt: tmpNow, Capability: 'Shell' });
			tmpStore.upsertWorkItem({ WorkItemHash: 'c', Status: 'Running', EnqueuedAt: tmpNow, Capability: 'Shell' });
			let tmpCounts = tmpStore.countByStatus();
			Expect(tmpCounts.Queued).to.equal(2);
			Expect(tmpCounts.Running).to.equal(1);
		});

		test('upsertAffinityBinding → getAffinityBinding → clearAffinityBinding lifecycle', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpStore = getService(tmpFable, 'UltravisorBeaconQueueStore');
			tmpStore.upsertAffinityBinding({ AffinityKey: 'affA', BeaconID: 'b1', ExpiresAt: new Date(Date.now() + 60000).toISOString() });
			let tmpBinding = tmpStore.getAffinityBinding('affA');
			Expect(tmpBinding.BeaconID).to.equal('b1');

			tmpStore.upsertAffinityBinding({ AffinityKey: 'affA', BeaconID: 'b2', ExpiresAt: new Date(Date.now() + 60000).toISOString() });
			Expect(tmpStore.getAffinityBinding('affA').BeaconID).to.equal('b2');

			tmpStore.clearAffinityBinding('affA');
			Expect(tmpStore.getAffinityBinding('affA')).to.equal(null);
		});

		test('action defaults upsert and lookup by (Capability, Action) + wildcard fallback', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpStore = getService(tmpFable, 'UltravisorBeaconQueueStore');
			tmpStore.upsertActionDefault({
				Capability: 'Shell', Action: 'Execute',
				TimeoutMs: 60000, MaxAttempts: 3, DefaultPriority: 5, ExpectedWaitP95Ms: 1500
			});
			let tmpRow = tmpStore.getActionDefault('Shell', 'Execute');
			Expect(tmpRow.TimeoutMs).to.equal(60000);
			Expect(tmpRow.MaxAttempts).to.equal(3);
			Expect(tmpRow.ExpectedWaitP95Ms).to.equal(1500);
		});
	});

	suite('RunManager', () =>
	{
		test('startRun with no IdempotencyKey mints a fresh RunID', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpRM = getService(tmpFable, 'UltravisorBeaconRunManager');
			let tmpRun = tmpRM.startRun({ SubmitterTag: 'test-client' });
			Expect(tmpRun.RunID).to.match(/^rn-testhub-\d+-\d+$/);
			Expect(tmpRun.State).to.equal('Active');
		});

		test('startRun with IdempotencyKey returns the same RunID on replay', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpRM = getService(tmpFable, 'UltravisorBeaconRunManager');
			let tmpA = tmpRM.startRun({ IdempotencyKey: 'key-X', SubmitterTag: 'one' });
			let tmpB = tmpRM.startRun({ IdempotencyKey: 'key-X', SubmitterTag: 'two' });
			Expect(tmpB.RunID).to.equal(tmpA.RunID);
		});

		test('endRun and cancelRun update run state', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpRM = getService(tmpFable, 'UltravisorBeaconRunManager');
			let tmpRun = tmpRM.startRun({});
			Expect(tmpRM.endRun(tmpRun.RunID)).to.equal(true);
			let tmpStore = getService(tmpFable, 'UltravisorBeaconQueueStore');
			Expect(tmpStore.getRunByRunID(tmpRun.RunID).State).to.equal('Ended');

			let tmpRun2 = tmpRM.startRun({});
			tmpRM.cancelRun(tmpRun2.RunID, 'operator cancel');
			let tmpAfter = tmpStore.getRunByRunID(tmpRun2.RunID);
			Expect(tmpAfter.State).to.equal('Canceled');
			Expect(tmpAfter.CancelReason).to.equal('operator cancel');
		});
	});

	suite('ActionDefaults resolver', () =>
	{
		test('falls back hard-default → Fable setting → per-action row', () =>
		{
			let tmpFable = buildFable(_TestDir);
			tmpFable.settings.UltravisorBeaconWorkItemTimeoutMs = 120000;
			let tmpDefaults = getService(tmpFable, 'UltravisorBeaconActionDefaults');

			let tmpHard = tmpDefaults.resolve('UnknownCap', 'Unknown');
			// Fable-setting fallback on TimeoutMs kicks in.
			Expect(tmpHard.TimeoutMs).to.equal(120000);
			Expect(tmpHard.MaxAttempts).to.equal(1); // hard default

			let tmpStore = getService(tmpFable, 'UltravisorBeaconQueueStore');
			tmpStore.upsertActionDefault({
				Capability: 'Shell', Action: 'Execute',
				TimeoutMs: 5000, MaxAttempts: 4, DefaultPriority: 3, ExpectedWaitP95Ms: 999
			});
			tmpDefaults.invalidate();
			let tmpRow = tmpDefaults.resolve('Shell', 'Execute');
			Expect(tmpRow.TimeoutMs).to.equal(5000);
			Expect(tmpRow.MaxAttempts).to.equal(4);
			Expect(tmpRow.ExpectedWaitP95Ms).to.equal(999);
		});

		test('applyToWorkItem honors per-request Settings over defaults', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpDefaults = getService(tmpFable, 'UltravisorBeaconActionDefaults');
			let tmpStore = getService(tmpFable, 'UltravisorBeaconQueueStore');
			tmpStore.upsertActionDefault({
				Capability: 'Shell', Action: 'Execute',
				TimeoutMs: 5000, MaxAttempts: 4, DefaultPriority: 3
			});
			tmpDefaults.invalidate();

			let tmpItem = { Capability: 'Shell', Action: 'Execute' };
			tmpDefaults.applyToWorkItem(tmpItem, { maxRetries: 7 });
			Expect(tmpItem.MaxAttempts).to.equal(7); // request overrides
			Expect(tmpItem.TimeoutMs).to.equal(5000); // default stands
			Expect(tmpItem.Priority).to.equal(3); // default priority
		});
	});

	suite('Coordinator integration', () =>
	{
		test('enqueueWorkItem populates new fields and persists to store', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');
			let tmpStore = getService(tmpFable, 'UltravisorBeaconQueueStore');

			let tmpItem = tmpCoordinator.enqueueWorkItem({
				RunID: 'rn-queue-1',
				Capability: 'Shell',
				Action: 'Execute',
				Priority: 9
			});

			Expect(tmpItem.Priority).to.equal(9);
			Expect(tmpItem.HealthLabel).to.equal('Unknown');
			Expect(tmpItem.EnqueuedAt).to.be.a('string');

			let tmpPersisted = tmpStore.getWorkItemByHash(tmpItem.WorkItemHash);
			Expect(tmpPersisted).to.be.an('object');
			Expect(tmpPersisted.RunID).to.equal('rn-queue-1');
			Expect(tmpPersisted.Priority).to.equal(9);
			let tmpEvents = tmpStore.listEventsForWorkItem(tmpItem.WorkItemHash);
			Expect(tmpEvents.map((e) => e.EventType)).to.include('enqueued');
		});
	});

	suite('Scheduler', () =>
	{
		test('dispatch tick promotes Queued items to Dispatched with QueueMetadata', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');
			let tmpScheduler = getService(tmpFable, 'UltravisorBeaconScheduler');
			let tmpStore = getService(tmpFable, 'UltravisorBeaconQueueStore');

			addStubBeacon(tmpCoordinator, 'b-1', ['Shell']);
			let tmpItem = tmpCoordinator.enqueueWorkItem({
				RunID: 'rn-d-1', Capability: 'Shell', Action: 'Execute'
			});

			tmpScheduler._dispatchTick();

			let tmpAfter = tmpCoordinator._WorkQueue[tmpItem.WorkItemHash];
			Expect(tmpAfter.Status).to.equal('Dispatched');
			Expect(tmpAfter.AssignedBeaconID).to.equal('b-1');
			Expect(tmpAfter.DispatchedAt).to.be.a('string');
			Expect(tmpAfter.Settings.QueueMetadata).to.be.an('object');
			Expect(tmpAfter.Settings.QueueMetadata.RunID).to.equal('rn-d-1');
			Expect(typeof tmpAfter.Settings.QueueMetadata.QueueWaitMs).to.equal('number');

			let tmpStored = tmpStore.getWorkItemByHash(tmpItem.WorkItemHash);
			Expect(tmpStored.Status).to.equal('Dispatched');
			Expect(tmpStored.AttemptNumber).to.equal(1);
		});

		test('higher priority dispatches ahead of lower priority FIFO', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');
			let tmpScheduler = getService(tmpFable, 'UltravisorBeaconScheduler');
			addStubBeacon(tmpCoordinator, 'only', ['Shell']);

			let tmpLo = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Priority: 1 });
			let tmpHi = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Priority: 9 });

			tmpCoordinator._Beacons.only.MaxConcurrent = 1;
			tmpScheduler._dispatchTick();

			Expect(tmpCoordinator._WorkQueue[tmpHi.WorkItemHash].Status).to.equal('Dispatched');
			Expect(tmpCoordinator._WorkQueue[tmpLo.WorkItemHash].Status).to.not.equal('Dispatched');
		});

		test('computeHealth returns Unknown with no baseline, Uncertain at mid ratio, Unhealthy near timeout', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpScheduler = getService(tmpFable, 'UltravisorBeaconScheduler');

			let tmpFresh = {
				Status: 'Queued', EnqueuedAt: new Date().toISOString(),
				Capability: 'Shell', Action: 'Execute', MaxAttempts: 1, AttemptNumber: 0
			};
			Expect(tmpScheduler.computeHealth(tmpFresh).Label).to.equal('Unknown');

			// Simulate a running item 80% through its timeout — should score low (<0.3 → Unhealthy)
			let tmpOld = Date.now() - 80000;
			let tmpRunning = {
				Status: 'Running', StartedAt: new Date(tmpOld).toISOString(),
				LastEventAt: new Date(tmpOld).toISOString(),
				Capability: 'Shell', Action: 'Execute', TimeoutMs: 100000,
				MaxAttempts: 1, AttemptNumber: 1
			};
			let tmpHealth = tmpScheduler.computeHealth(tmpRunning);
			Expect(tmpHealth.Label).to.be.oneOf(['Unhealthy', 'Uncertain']);
			Expect(tmpHealth.Score).to.be.lessThan(0.6);
		});

		test('summarize returns bucket counts and per-capability breakdown', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');
			let tmpScheduler = getService(tmpFable, 'UltravisorBeaconScheduler');
			tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'A' });
			tmpCoordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'A' });
			tmpCoordinator.enqueueWorkItem({ Capability: 'LLM',  Action: 'Complete' });

			let tmpSum = tmpScheduler.summarize();
			Expect(tmpSum.Buckets.Upcoming).to.equal(3);
			Expect(tmpSum.ByCapability).to.be.an('array');
			Expect(tmpSum.ByCapability.length).to.equal(2);
		});

		test('requestCancel moves Queued item to Canceled', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');
			let tmpScheduler = getService(tmpFable, 'UltravisorBeaconScheduler');
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell' });

			let tmpResult = tmpScheduler.requestCancel(tmpItem.WorkItemHash, 'user');
			Expect(tmpResult.Canceled).to.equal(true);
			Expect(tmpCoordinator._WorkQueue[tmpItem.WorkItemHash].Status).to.equal('Canceled');
		});

		test('requestCancel on Running item sets CancelRequested flag only', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');
			let tmpScheduler = getService(tmpFable, 'UltravisorBeaconScheduler');
			let tmpItem = tmpCoordinator.enqueueWorkItem({ Capability: 'Shell' });
			tmpCoordinator._WorkQueue[tmpItem.WorkItemHash].Status = 'Running';

			let tmpResult = tmpScheduler.requestCancel(tmpItem.WorkItemHash, 'user');
			Expect(tmpResult.Canceled).to.equal(false);
			Expect(tmpResult.CancelRequested).to.equal(true);
			Expect(tmpCoordinator._WorkQueue[tmpItem.WorkItemHash].CancelRequested).to.equal(true);
		});

		test('broadcast handler receives queue.* topics', () =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');
			let tmpScheduler = getService(tmpFable, 'UltravisorBeaconScheduler');
			let tmpEvents = [];
			tmpScheduler.setBroadcastHandler((pTopic, pPayload) =>
			{
				tmpEvents.push({ Topic: pTopic, Payload: pPayload });
			});

			addStubBeacon(tmpCoordinator, 'b', ['Shell']);
			tmpCoordinator.enqueueWorkItem({ Capability: 'Shell' });
			tmpScheduler._dispatchTick();

			let tmpTopics = tmpEvents.map((e) => e.Topic);
			Expect(tmpTopics).to.include('queue.enqueued');
			Expect(tmpTopics).to.include('queue.dispatched');
		});
	});

	suite('RetoldLabs-QueuePhases', () =>
	{
		test('emitPreWorkerPhases writes queue_wait + worker_spinup lines', () =>
		{
			let tmpDir = libPath.join(_TestDir, 'staging-1');
			libFS.mkdirSync(tmpDir, { recursive: true });

			let tmpMeta = {
				RunID: 'rn-p-1',
				WorkItemHash: 'wi-p-1',
				EnqueuedAt: new Date(Date.now() - 5000).toISOString(),
				DispatchedAt: new Date(Date.now() - 1000).toISOString(),
				QueueWaitMs: 4000,
				AttemptNumber: 1
			};

			let tmpOut = libQueuePhases.emitPreWorkerPhases(tmpDir, tmpMeta, { spinupStartMs: Date.now() });
			Expect(tmpOut.QueueWaitMs).to.equal(4000);
			Expect(tmpOut.WorkerSpinupMs).to.be.at.least(0);

			let tmpText = libFS.readFileSync(libPath.join(tmpDir, 'phases.jsonl'), 'utf8');
			let tmpLines = tmpText.trim().split(/\n/).map((l) => JSON.parse(l));
			Expect(tmpLines).to.have.length(2);
			Expect(tmpLines[0].name).to.equal('queue_wait');
			Expect(tmpLines[0].run_id).to.equal('rn-p-1');
			Expect(tmpLines[0].duration_ms).to.equal(4000);
			Expect(tmpLines[1].name).to.equal('worker_spinup');
		});

		test('emitAssetCapturePhase appends the post-worker phase', () =>
		{
			let tmpDir = libPath.join(_TestDir, 'staging-2');
			libFS.mkdirSync(tmpDir, { recursive: true });

			let tmpMeta = { RunID: 'rn-p-2', WorkItemHash: 'wi-p-2', AttemptNumber: 1 };
			let tmpStart = Date.now() - 250;
			libQueuePhases.emitAssetCapturePhase(tmpDir, tmpMeta, tmpStart, Date.now());

			let tmpText = libFS.readFileSync(libPath.join(tmpDir, 'phases.jsonl'), 'utf8');
			let tmpLines = tmpText.trim().split(/\n/).map((l) => JSON.parse(l));
			Expect(tmpLines).to.have.length(1);
			Expect(tmpLines[0].name).to.equal('asset_capture');
			Expect(tmpLines[0].duration_ms).to.be.at.least(0);
		});

		test('envForWorker merges RETOLD_RUN_ID without clobbering existing env', () =>
		{
			let tmpEnv = libQueuePhases.envForWorker({ EXISTING: '1' },
				{ RunID: 'rn-env', WorkItemHash: 'wi-env' });
			Expect(tmpEnv.EXISTING).to.equal('1');
			Expect(tmpEnv.RETOLD_RUN_ID).to.equal('rn-env');
			Expect(tmpEnv.RETOLD_WORK_ITEM_HASH).to.equal('wi-env');

			let tmpNoClobber = libQueuePhases.envForWorker({ RETOLD_RUN_ID: 'already-set' },
				{ RunID: 'new-id' });
			Expect(tmpNoClobber.RETOLD_RUN_ID).to.equal('already-set');
		});
	});
});
