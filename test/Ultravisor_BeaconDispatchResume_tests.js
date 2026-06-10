/**
 * Ultravisor — Beacon-Dispatch Resume Event Regression Suite
 *
 * The execution engine matches resume/fire events against connection port
 * names CASE-SENSITIVELY (_enqueueDownstreamEvents). Two call sites shipped
 * lowercase event names that match no EventOutputs port, silently stranding
 * every downstream node while the run still terminated 'Complete':
 *
 *   1. The generic beacon-dispatch task config paused with
 *      ResumeEventName 'complete' (definition declares 'Complete').
 *   2. BeaconCoordinator.failWorkItem set the waiting task's
 *      ResumeEventName to 'error' (definition declares 'Error').
 *
 * These tests pin both call sites to event names that exist in the
 * beacon-dispatch definition's EventOutputs, so the bug class cannot
 * silently return.
 */
const Chai = require('chai');
const Expect = Chai.expect;
const libFS = require('fs');
const libPath = require('path');
const libPict = require('pict');

const libExtensionTaskConfigs = require('../source/services/tasks/extension/Ultravisor-TaskConfigs-Extension.cjs');
const libUltravisorBeaconCoordinator = require('../source/services/Ultravisor-Beacon-Coordinator.cjs');
const libUltravisorBeaconQueueStore = require('../source/services/persistence/Ultravisor-Beacon-QueueStore.cjs');
const libUltravisorBeaconRunManager = require('../source/services/Ultravisor-Beacon-RunManager.cjs');
const libUltravisorBeaconActionDefaults = require('../source/services/Ultravisor-Beacon-ActionDefaults.cjs');
const libUltravisorBeaconScheduler = require('../source/services/Ultravisor-Beacon-Scheduler.cjs');
const libUltravisorQueuePersistenceBridge = require('../source/services/Ultravisor-QueuePersistenceBridge.cjs');

const TEST_BASE = libPath.resolve(__dirname, '..', '.test_staging_dispatch_resume');

const BEACON_DISPATCH_CONFIG = libExtensionTaskConfigs.find((pConfig) => pConfig.Definition && pConfig.Definition.Type === 'beacon-dispatch');
const EVENT_OUTPUT_NAMES = BEACON_DISPATCH_CONFIG.Definition.EventOutputs.map((pOutput) => pOutput.Name);

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
		Product: 'Ultravisor-DispatchResume-Test',
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

function buildStubTask()
{
	let tmpCoordinatorStub =
	{
		listBeacons: () => [ { BeaconID: 'b-1' } ],
		enqueueWorkItem: () => ({ WorkItemHash: 'wi-test-1' }),
		scanAndResolveAddresses: () => []
	};
	return {
		fable: { servicesMap: { UltravisorBeaconCoordinator: { stub: tmpCoordinatorStub } } },
		log: { info: () => {}, warn: () => {}, error: () => {} }
	};
}

function executeDispatch(pTask, pSettings)
{
	let tmpResult = null;
	BEACON_DISPATCH_CONFIG.Execute(pTask,
		Object.assign({ RemoteCapability: 'TestCap', RemoteAction: 'TestAction', AffinityKey: '', TimeoutMs: 1000, InputData: '' }, pSettings || {}),
		{ RunHash: 'run-test', NodeHash: 'node-test', OperationHash: 'op-test' },
		(pError, pCallbackResult) => { tmpResult = pCallbackResult; });
	return tmpResult;
}

suite('Beacon-Dispatch Resume Events', () =>
{
	suite('beacon-dispatch task config (Extension)', () =>
	{
		test('pause result ResumeEventName is a declared EventOutput (Complete)', () =>
		{
			let tmpResult = executeDispatch(buildStubTask());
			Expect(tmpResult.WaitingForInput).to.equal(true);
			Expect(tmpResult.ResumeEventName).to.equal('Complete');
			Expect(EVENT_OUTPUT_NAMES).to.include(tmpResult.ResumeEventName,
				'ResumeEventName must exactly match an EventOutputs Name — the engine event match is case-sensitive');
		});

		test('no-coordinator failure fires a declared EventOutput (Error)', () =>
		{
			let tmpTask = buildStubTask();
			tmpTask.fable.servicesMap = {};
			let tmpResult = executeDispatch(tmpTask);
			Expect(tmpResult.EventToFire).to.equal('Error');
			Expect(EVENT_OUTPUT_NAMES).to.include(tmpResult.EventToFire);
		});

		test('no-beacons failure fires a declared EventOutput (Error)', () =>
		{
			let tmpTask = buildStubTask();
			Object.values(tmpTask.fable.servicesMap.UltravisorBeaconCoordinator)[0].listBeacons = () => [];
			let tmpResult = executeDispatch(tmpTask);
			Expect(tmpResult.EventToFire).to.equal('Error');
			Expect(EVENT_OUTPUT_NAMES).to.include(tmpResult.EventToFire);
		});
	});

	suite('BeaconCoordinator.failWorkItem error resume', () =>
	{
		let _TestDir = '';

		setup(() =>
		{
			_TestDir = libPath.join(TEST_BASE, `t-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
			ensureClean(_TestDir);
		});

		test('sets the waiting task ResumeEventName to a declared EventOutput (Error)', (fDone) =>
		{
			let tmpFable = buildFable(_TestDir);
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');

			let tmpWorkItem = tmpCoordinator.enqueueWorkItem(
				{ RunHash: 'run-fail-1', NodeHash: 'node-fail-1', OperationHash: 'op-fail-1', Capability: 'Shell', Action: 'Execute', Settings: {} });
			// Exhaust retries so failWorkItem routes to the error path instead of RetryScheduled.
			tmpCoordinator._WorkQueue[tmpWorkItem.WorkItemHash].MaxAttempts = 1;

			let tmpContext = { WaitingTasks: { 'node-fail-1': { ResumeEventName: 'Complete' } }, Errors: [] };
			tmpFable.servicesMap['UltravisorExecutionManifest'] =
				{ stub: { getRun: () => tmpContext, recordTaskError: () => {} } };
			tmpFable.servicesMap['UltravisorExecutionEngine'] =
				{ stub: { resumeOperation: (pRunHash, pNodeHash, pOutputs, fCallback) => fCallback(null, tmpContext) } };

			tmpCoordinator.failWorkItem(tmpWorkItem.WorkItemHash, { ErrorMessage: 'synthetic failure' }, (pError) =>
			{
				Expect(pError).to.not.exist;
				Expect(tmpContext.WaitingTasks['node-fail-1'].ResumeEventName).to.equal('Error');
				Expect(EVENT_OUTPUT_NAMES).to.include(tmpContext.WaitingTasks['node-fail-1'].ResumeEventName,
					'error resume must route to the Error EventOutput — lowercase silently strands the error branch');
				fDone();
			});
		});
	});
});
