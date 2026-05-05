/**
 * Tests for Ultravisor-OutputStore: large per-port payloads get
 * lifted out of TaskOutputs to a file in the run's staging dir,
 * leaving a {$$ref, Bytes} shape behind. Read-side materialization
 * keeps the State edge contract transparent.
 *
 * The fix this guards against: Phase 2b typed-op pipelines emit
 * multi-megabyte `Result` strings; without the lift, manifests grow
 * proportionally and JSON.stringify of the manifest snapshot OOMs.
 */

const libPict = require('pict');
const libFS = require('fs');
const libPath = require('path');

const libOutputStore = require('../source/services/Ultravisor-OutputStore.cjs');
const libUltravisorTaskTypeRegistry = require('../source/services/Ultravisor-TaskTypeRegistry.cjs');
const libUltravisorStateManager = require('../source/services/Ultravisor-StateManager.cjs');
const libUltravisorExecutionEngine = require('../source/services/Ultravisor-ExecutionEngine.cjs');
const libUltravisorExecutionManifest = require('../source/services/Ultravisor-ExecutionManifest.cjs');

const Chai = require('chai');
const Expect = Chai.expect;

const TEST_STAGING_ROOT = libPath.resolve(__dirname, '..', '.test_staging_outputstore');

function _makeFable()
{
	let tmpFable = new libPict({
		Product: 'Ultravisor-OutputStore-Test',
		LogLevel: 5,
		UltravisorStagingRoot: TEST_STAGING_ROOT
	});
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorTaskTypeRegistry', libUltravisorTaskTypeRegistry);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorStateManager', libUltravisorStateManager);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionEngine', libUltravisorExecutionEngine);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionManifest', libUltravisorExecutionManifest);
	return tmpFable;
}

function _makeStagingDir()
{
	if (!libFS.existsSync(TEST_STAGING_ROOT))
	{
		libFS.mkdirSync(TEST_STAGING_ROOT, { recursive: true });
	}
	let tmpRunDir = libPath.resolve(TEST_STAGING_ROOT, 'run-' + Date.now() + '-' + Math.floor(Math.random() * 1e6));
	libFS.mkdirSync(tmpRunDir, { recursive: true });
	return tmpRunDir;
}

function _cleanup()
{
	if (libFS.existsSync(TEST_STAGING_ROOT))
	{
		libFS.rmSync(TEST_STAGING_ROOT, { recursive: true, force: true });
	}
}

suite
(
	'Ultravisor OutputStore',
	function()
	{
		setup(function() { _cleanup(); });
		teardown(function() { _cleanup(); delete process.env.UV_OUTPUT_STORE_THRESHOLD_BYTES; });

		suite
		(
			'lift and materialize',
			function()
			{
				test
				(
					'liftValue writes a string payload to disk and returns the ref shape',
					function()
					{
						let tmpStaging = _makeStagingDir();
						let tmpPayload = 'A'.repeat(2 * 1024 * 1024);
						let tmpRef = libOutputStore.liftValue(tmpStaging, 'node-A', 'Result', tmpPayload);

						Expect(libOutputStore.isOutputRef(tmpRef)).to.equal(true);
						Expect(tmpRef[libOutputStore.REF_KEY]).to.equal('outputs/node-A/Result.json');
						Expect(tmpRef.Bytes).to.equal(tmpPayload.length);

						let tmpAbsPath = libPath.resolve(tmpStaging, tmpRef[libOutputStore.REF_KEY]);
						Expect(libFS.existsSync(tmpAbsPath)).to.equal(true);
						let tmpStat = libFS.statSync(tmpAbsPath);
						Expect(tmpStat.size).to.equal(tmpPayload.length);
					}
				);

				test
				(
					'materializeRefValue round-trips the original string',
					function()
					{
						let tmpStaging = _makeStagingDir();
						let tmpPayload = 'hello-' + 'X'.repeat(2 * 1024 * 1024);
						let tmpRef = libOutputStore.liftValue(tmpStaging, 'node-A', 'Result', tmpPayload);

						let tmpRoundTrip = libOutputStore.materializeRefValue(tmpStaging, tmpRef);
						Expect(tmpRoundTrip).to.equal(tmpPayload);
					}
				);

				test
				(
					'materializeRefValue passes non-ref values through unchanged',
					function()
					{
						let tmpStaging = _makeStagingDir();
						Expect(libOutputStore.materializeRefValue(tmpStaging, 'plain string')).to.equal('plain string');
						Expect(libOutputStore.materializeRefValue(tmpStaging, 42)).to.equal(42);
						let tmpObj = { Foo: 'bar' };
						Expect(libOutputStore.materializeRefValue(tmpStaging, tmpObj)).to.equal(tmpObj);
					}
				);

				test
				(
					'materializeRefValue returns undefined when payload is missing on disk',
					function()
					{
						let tmpStaging = _makeStagingDir();
						let tmpFakeRef = {};
						tmpFakeRef[libOutputStore.REF_KEY] = 'outputs/missing/Result.json';
						tmpFakeRef.Bytes = 100;
						let tmpResult = libOutputStore.materializeRefValue(tmpStaging, tmpFakeRef);
						Expect(tmpResult).to.equal(undefined);
					}
				);

				test
				(
					'mergeAndLift lifts large strings and keeps small fields inline',
					function()
					{
						let tmpStaging = _makeStagingDir();
						let tmpContext = { TaskOutputs: {}, StagingPath: tmpStaging };
						let tmpLargePayload = 'B'.repeat(2 * 1024 * 1024);

						libOutputStore.mergeAndLift(tmpContext, 'node-X', {
							Result: tmpLargePayload,
							RecordCount: 100000,
							ElapsedMs: 4321
						});

						let tmpEntry = tmpContext.TaskOutputs['node-X'];
						Expect(libOutputStore.isOutputRef(tmpEntry.Result)).to.equal(true);
						Expect(tmpEntry.Result.Bytes).to.equal(tmpLargePayload.length);
						Expect(tmpEntry.RecordCount).to.equal(100000);
						Expect(tmpEntry.ElapsedMs).to.equal(4321);
					}
				);

				test
				(
					'mergeAndLift keeps strings under the default threshold inline',
					function()
					{
						let tmpStaging = _makeStagingDir();
						let tmpContext = { TaskOutputs: {}, StagingPath: tmpStaging };
						let tmpSmall = 'small payload';
						libOutputStore.mergeAndLift(tmpContext, 'node-S', { Result: tmpSmall });
						Expect(tmpContext.TaskOutputs['node-S'].Result).to.equal(tmpSmall);
					}
				);

				test
				(
					'env var threshold override changes the lift decision',
					function()
					{
						let tmpStaging = _makeStagingDir();
						process.env.UV_OUTPUT_STORE_THRESHOLD_BYTES = '64';
						let tmpContext = { TaskOutputs: {}, StagingPath: tmpStaging };
						libOutputStore.mergeAndLift(tmpContext, 'node-T', { Result: 'X'.repeat(128) });
						Expect(libOutputStore.isOutputRef(tmpContext.TaskOutputs['node-T'].Result)).to.equal(true);
					}
				);

				test
				(
					'mergeAndLift falls through to inline when no StagingPath is set',
					function()
					{
						let tmpContext = { TaskOutputs: {}, StagingPath: '' };
						let tmpLarge = 'C'.repeat(2 * 1024 * 1024);
						libOutputStore.mergeAndLift(tmpContext, 'node-N', { Result: tmpLarge });
						Expect(tmpContext.TaskOutputs['node-N'].Result).to.equal(tmpLarge);
					}
				);

				test
				(
					'inlineAllRefs walks TaskOutputs and follows every ref',
					function()
					{
						let tmpStaging = _makeStagingDir();
						let tmpContext = { TaskOutputs: {}, StagingPath: tmpStaging };
						let tmpPayloadA = 'A'.repeat(2 * 1024 * 1024);
						let tmpPayloadB = 'B'.repeat(2 * 1024 * 1024);
						libOutputStore.mergeAndLift(tmpContext, 'node-A', { Result: tmpPayloadA, Count: 5 });
						libOutputStore.mergeAndLift(tmpContext, 'node-B', { Payload: tmpPayloadB });

						let tmpInlined = libOutputStore.inlineAllRefs(tmpStaging, tmpContext.TaskOutputs);
						Expect(tmpInlined['node-A'].Result).to.equal(tmpPayloadA);
						Expect(tmpInlined['node-A'].Count).to.equal(5);
						Expect(tmpInlined['node-B'].Payload).to.equal(tmpPayloadB);
					}
				);
			}
		);

		suite
		(
			'engine integration',
			function()
			{
				test
				(
					'_resolveStateConnections materializes a ref into the downstream Settings',
					function()
					{
						let tmpFable = _makeFable();
						let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];
						let tmpStaging = _makeStagingDir();

						let tmpPayload = 'D'.repeat(2 * 1024 * 1024);
						let tmpContext = {
							TaskOutputs: {},
							StagingPath: tmpStaging,
							GlobalState: {},
							OperationState: {},
							_PortLabelMap: {},
							_ConnectionMap:
							{
								eventSources: {},
								stateTargets:
								{
									'node-B':
									[
										{
											SourceNodeHash: 'node-A',
											SourcePortHash: 'A-so-Result',
											TargetNodeHash: 'node-B',
											TargetPortHash: 'B-si-Input'
										}
									]
								}
							}
						};
						libOutputStore.mergeAndLift(tmpContext, 'node-A', { Result: tmpPayload });
						Expect(libOutputStore.isOutputRef(tmpContext.TaskOutputs['node-A'].Result)).to.equal(true);

						let tmpNodeB = { Hash: 'node-B', Data: {}, Settings: {} };
						let tmpResolved = tmpEngine._resolveStateConnections('node-B', tmpNodeB, tmpContext, { SettingsInputs: [] });
						Expect(tmpResolved.Input).to.equal(tmpPayload);
					}
				);

				test
				(
					'_serializableManifest emits the ref shape, not the payload',
					function()
					{
						let tmpFable = _makeFable();
						let tmpManifest = Object.values(tmpFable.servicesMap['UltravisorExecutionManifest'])[0];
						let tmpStaging = _makeStagingDir();

						let tmpPayload = 'E'.repeat(2 * 1024 * 1024);
						let tmpContext = {
							Hash: 'run-test-001',
							OperationHash: 'op-test',
							OperationName: 'Test Op',
							Status: 'Complete',
							RunMode: 'standard',
							StartTime: '2026-01-01T00:00:00.000Z',
							StopTime: '2026-01-01T00:00:01.000Z',
							ElapsedMs: 1000,
							Output: {},
							TaskManifests: {},
							TimingSummary: null,
							EventLog: [],
							Errors: [],
							Log: [],
							GlobalState: {},
							OperationState: {},
							TaskOutputs: {},
							StagingPath: tmpStaging
						};
						libOutputStore.mergeAndLift(tmpContext, 'node-A',
							{ Result: tmpPayload, RecordCount: 100000 });

						let tmpSerializable = tmpManifest._serializableManifest(tmpContext);
						let tmpJson = JSON.stringify(tmpSerializable);

						Expect(tmpJson.indexOf(tmpPayload)).to.equal(-1);
						Expect(tmpJson.indexOf('$$ref')).to.be.greaterThan(-1);
						Expect(tmpJson.length).to.be.lessThan(tmpPayload.length);
						Expect(tmpSerializable.TaskOutputs['node-A'].RecordCount).to.equal(100000);
						Expect(libOutputStore.isOutputRef(tmpSerializable.TaskOutputs['node-A'].Result)).to.equal(true);
					}
				);

				test
				(
					'StateManager.resolveAddress materializes Task and TaskOutput addresses',
					function()
					{
						let tmpFable = _makeFable();
						let tmpStateManager = Object.values(tmpFable.servicesMap['UltravisorStateManager'])[0];
						let tmpStaging = _makeStagingDir();

						let tmpPayload = 'F'.repeat(2 * 1024 * 1024);
						let tmpContext = {
							GlobalState: {},
							OperationState: {},
							TaskOutputs: {},
							StagingPath: tmpStaging
						};
						libOutputStore.mergeAndLift(tmpContext, 'node-A',
							{ Result: tmpPayload, RecordCount: 7 });

						Expect(tmpStateManager.resolveAddress('Task.Result', tmpContext, 'node-A')).to.equal(tmpPayload);
						Expect(tmpStateManager.resolveAddress('Task.RecordCount', tmpContext, 'node-A')).to.equal(7);
						Expect(tmpStateManager.resolveAddress('TaskOutput.node-A.Result', tmpContext)).to.equal(tmpPayload);
					}
				);
			}
		);
	}
);
