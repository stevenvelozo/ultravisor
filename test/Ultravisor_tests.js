/**
* Unit tests for Ultravisor
*/

const libPict = require('pict');
const libFS = require('fs');
const libPath = require('path');

const libUltravisorTaskTypeRegistry = require('../source/services/Ultravisor-TaskTypeRegistry.cjs');
const libUltravisorStateManager = require('../source/services/Ultravisor-StateManager.cjs');
const libUltravisorExecutionEngine = require('../source/services/Ultravisor-ExecutionEngine.cjs');
const libUltravisorExecutionManifest = require('../source/services/Ultravisor-ExecutionManifest.cjs');

const libUltravisorHypervisor = require('../source/services/Ultravisor-Hypervisor.cjs');
const libUltravisorHypervisorState = require('../source/services/Ultravisor-Hypervisor-State.cjs');
const libUltravisorHypervisorEventBase = require('../source/services/Ultravisor-Hypervisor-Event-Base.cjs');
const libUltravisorHypervisorEventCron = require('../source/services/events/Ultravisor-Hypervisor-Event-Cron.cjs');

const libUltravisorSchedulePersistenceBase = require('../source/services/Ultravisor-Schedule-Persistence-Base.cjs');
const libUltravisorSchedulePersistenceJSONFile = require('../source/services/persistence/Ultravisor-Schedule-Persistence-JSONFile.cjs');

const libUltravisorBeaconCoordinator = require('../source/services/Ultravisor-Beacon-Coordinator.cjs');
const libUltravisorBeaconQueueJournal = require('../source/services/persistence/Ultravisor-Beacon-QueueJournal.cjs');

const libBeaconCapabilityProvider = require('../source/beacon/Ultravisor-Beacon-CapabilityProvider.cjs');
const libBeaconProviderRegistry = require('../source/beacon/Ultravisor-Beacon-ProviderRegistry.cjs');
const libBeaconExecutor = require('../source/beacon/Ultravisor-Beacon-Executor.cjs');
const libBeaconProviderShell = require('../source/beacon/providers/Ultravisor-Beacon-Provider-Shell.cjs');
const libBeaconProviderFileSystem = require('../source/beacon/providers/Ultravisor-Beacon-Provider-FileSystem.cjs');
const libBeaconProviderLLM = require('../source/beacon/providers/Ultravisor-Beacon-Provider-LLM.cjs');

const libTaskTypeReadFile = require('../source/services/tasks/file-system/Ultravisor-TaskType-ReadFile.cjs');
const libTaskTypeWriteFile = require('../source/services/tasks/file-system/Ultravisor-TaskType-WriteFile.cjs');
const libTaskTypeReplaceString = require('../source/services/tasks/data-transform/Ultravisor-TaskType-ReplaceString.cjs');
const libTaskTypeStringAppender = require('../source/services/tasks/data-transform/Ultravisor-TaskType-StringAppender.cjs');
const libTaskTypeIfConditional = require('../source/services/tasks/flow-control/Ultravisor-TaskType-IfConditional.cjs');
const libTaskTypeSplitExecute = require('../source/services/tasks/flow-control/Ultravisor-TaskType-SplitExecute.cjs');
const libTaskTypeValueInput = require('../source/services/tasks/user-interaction/Ultravisor-TaskType-ValueInput.cjs');
const libTaskTypeErrorMessage = require('../source/services/tasks/user-interaction/Ultravisor-TaskType-ErrorMessage.cjs');
const libTaskTypeReadFileBuffered = require('../source/services/tasks/file-system/Ultravisor-TaskType-ReadFileBuffered.cjs');

var Chai = require("chai");
var Expect = Chai.expect;

// Test staging paths
const TEST_STAGING_ROOT = libPath.resolve(__dirname, '..', '.test_staging');
const TEST_INPUT_FILE = libPath.resolve(__dirname, '..', '.test_staging', 'test_input.txt');

/**
 * Helper: create a Pict instance with all Ultravisor services registered.
 * Uses Pict (not bare Fable) so that parseTemplate is available for
 * resolving {~D:Record.*~} template expressions in operation settings.
 */
function createTestFable()
{
	let tmpFable = new libPict(
		{
			Product: 'Ultravisor-Test',
			LogLevel: 5,
			UltravisorStagingRoot: TEST_STAGING_ROOT
		});

	// Register services
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorTaskTypeRegistry', libUltravisorTaskTypeRegistry);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorStateManager', libUltravisorStateManager);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionEngine', libUltravisorExecutionEngine);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionManifest', libUltravisorExecutionManifest);

	// Schedule-related services
	// Stub gatherProgramConfiguration for HypervisorState (normally provided by the Ultravisor application)
	if (typeof(tmpFable.gatherProgramConfiguration) !== 'function')
	{
		tmpFable.gatherProgramConfiguration = function() { return { GatherPhases: [], ConfigurationOutcome: {} }; };
	}
	if (!tmpFable.ProgramConfiguration)
	{
		tmpFable.ProgramConfiguration = {};
	}
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorHypervisorEventBase', libUltravisorHypervisorEventBase);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorHypervisorEventCron', libUltravisorHypervisorEventCron);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorHypervisorState', libUltravisorHypervisorState);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorHypervisor', libUltravisorHypervisor);

	// Schedule persistence services
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorSchedulePersistenceBase', libUltravisorSchedulePersistenceBase);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorSchedulePersistence', libUltravisorSchedulePersistenceJSONFile);

	// Beacon coordinator
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconCoordinator', libUltravisorBeaconCoordinator);

	// Register task types
	let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
	tmpRegistry.registerTaskType(libTaskTypeReadFile);
	tmpRegistry.registerTaskType(libTaskTypeWriteFile);
	tmpRegistry.registerTaskType(libTaskTypeReplaceString);
	tmpRegistry.registerTaskType(libTaskTypeStringAppender);
	tmpRegistry.registerTaskType(libTaskTypeIfConditional);
	tmpRegistry.registerTaskType(libTaskTypeSplitExecute);
	tmpRegistry.registerTaskType(libTaskTypeValueInput);
	tmpRegistry.registerTaskType(libTaskTypeErrorMessage);
	tmpRegistry.registerTaskType(libTaskTypeReadFileBuffered);

	// Also register all config-driven task types (set-value, event-counter, etc.)
	let tmpBuiltInConfigs = require('../source/services/tasks/Ultravisor-BuiltIn-TaskConfigs.cjs');
	tmpRegistry.registerTaskTypesFromConfigArray(tmpBuiltInConfigs);

	return tmpFable;
}

/**
 * Helper: ensure test staging folder and input file exist.
 */
function ensureTestFixtures()
{
	if (!libFS.existsSync(TEST_STAGING_ROOT))
	{
		libFS.mkdirSync(TEST_STAGING_ROOT, { recursive: true });
	}

	libFS.writeFileSync(TEST_INPUT_FILE, 'Hello, John!\nWelcome to Ultravisor.\nJohn is here.\n', 'utf8');
}

/**
 * Helper: clean up test staging folder.
 */
function cleanupTestStaging()
{
	if (libFS.existsSync(TEST_STAGING_ROOT))
	{
		libFS.rmSync(TEST_STAGING_ROOT, { recursive: true, force: true });
	}
}

suite
(
	'Ultravisor',
	function()
	{
		setup ( () => { ensureTestFixtures(); } );
		teardown ( () => { cleanupTestStaging(); } );

		suite
		(
			'TaskType Base',
			function()
			{
				test
				(
					'Base task type should have a definition.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpBase = require('../source/services/tasks/Ultravisor-TaskType-Base.cjs');
						let tmpInstance = new tmpBase(tmpFable, {}, 'test-base');
						Expect(tmpInstance.definition.Hash).to.equal('base');
						Expect(tmpInstance.definition.Name).to.equal('Base Task');
					}
				);
			}
		);

		suite
		(
			'TaskTypeRegistry',
			function()
			{
				test
				(
					'Registry should register and instantiate task types.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];

						Expect(tmpRegistry.hasTaskType('read-file')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('write-file')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('nonexistent')).to.equal(false);

						let tmpReadFileDef = tmpRegistry.getDefinition('read-file');
						Expect(tmpReadFileDef.Name).to.equal('Read File');
						Expect(tmpReadFileDef.Category).to.equal('file-io');
						Expect(tmpReadFileDef.Capability).to.equal('File System');
						Expect(tmpReadFileDef.Action).to.equal('Read');
						Expect(tmpReadFileDef.Tier).to.equal('Platform');
						Expect(tmpReadFileDef.EventInputs.length).to.be.greaterThan(0);
						Expect(tmpReadFileDef.EventOutputs.length).to.be.greaterThan(0);

						let tmpInstance = tmpRegistry.instantiateTaskType('read-file');
						Expect(tmpInstance).to.not.equal(null);
						Expect(tmpInstance.definition.Hash).to.equal('read-file');

						let tmpDefs = tmpRegistry.listDefinitions();
						Expect(tmpDefs.length).to.equal(56);

						// Verify all registered definitions have Capability, Action, and Tier
						for (let i = 0; i < tmpDefs.length; i++)
						{
							Expect(tmpDefs[i].Capability).to.be.a('string');
							Expect(tmpDefs[i].Capability.length).to.be.greaterThan(0);
							Expect(tmpDefs[i].Action).to.be.a('string');
							Expect(tmpDefs[i].Action.length).to.be.greaterThan(0);
							Expect(tmpDefs[i].Tier).to.be.a('string');
							Expect(tmpDefs[i].Tier).to.be.oneOf(['Engine', 'Platform', 'Service', 'Extension']);
						}
					}
				);
			}
		);

		suite
		(
			'StateManager',
			function()
			{
				test
				(
					'Should resolve and set addresses at all three state levels.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpStateManager = Object.values(tmpFable.servicesMap['UltravisorStateManager'])[0];

						let tmpContext = {
							GlobalState: { AppName: 'TestApp' },
							OperationState: { InputFilePath: '/tmp/test.txt' },
							TaskOutputs:
							{
								'node-001': { FileContent: 'Hello World', BytesRead: 11 }
							},
							StagingPath: '/tmp/staging'
						};

						// Global
						Expect(tmpStateManager.resolveAddress('Global.AppName', tmpContext)).to.equal('TestApp');

						// Operation
						Expect(tmpStateManager.resolveAddress('Operation.InputFilePath', tmpContext)).to.equal('/tmp/test.txt');

						// Task (own)
						Expect(tmpStateManager.resolveAddress('Task.FileContent', tmpContext, 'node-001')).to.equal('Hello World');

						// TaskOutput (specific)
						Expect(tmpStateManager.resolveAddress('TaskOutput.node-001.BytesRead', tmpContext)).to.equal(11);

						// Staging
						Expect(tmpStateManager.resolveAddress('Staging.Path', tmpContext)).to.equal('/tmp/staging');

						// Set addresses
						tmpStateManager.setAddress('Operation.OutputPath', '/tmp/out.txt', tmpContext);
						Expect(tmpContext.OperationState.OutputPath).to.equal('/tmp/out.txt');

						tmpStateManager.setAddress('Global.Counter', 42, tmpContext);
						Expect(tmpContext.GlobalState.Counter).to.equal(42);

						tmpStateManager.setAddress('Task.Result', 'success', tmpContext, 'node-002');
						Expect(tmpContext.TaskOutputs['node-002'].Result).to.equal('success');
					}
				);

				test
				(
					'Should build template context for Pict template resolution.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpStateManager = Object.values(tmpFable.servicesMap['UltravisorStateManager'])[0];

						let tmpContext = {
							GlobalState: { App: 'Test' },
							OperationState: { Path: '/data' },
							TaskOutputs: { 'n1': { Val: 42 } },
							StagingPath: '/staging'
						};

						let tmpTemplateCtx = tmpStateManager.buildTemplateContext(tmpContext, 'sourceVal');

						Expect(tmpTemplateCtx.Value).to.equal('sourceVal');
						Expect(tmpTemplateCtx.Global.App).to.equal('Test');
						Expect(tmpTemplateCtx.Operation.Path).to.equal('/data');
						Expect(tmpTemplateCtx.TaskOutput.n1.Val).to.equal(42);
						Expect(tmpTemplateCtx.Staging.Path).to.equal('/staging');
					}
				);

				test
				(
					'Should resolve and set Output addresses.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpStateManager = Object.values(tmpFable.servicesMap['UltravisorStateManager'])[0];

						let tmpContext = {
							GlobalState: {},
							OperationState: {},
							TaskOutputs: {},
							Output: { Summary: 'test result', Count: 7 },
							StagingPath: '/tmp/staging'
						};

						// Resolve Output
						Expect(tmpStateManager.resolveAddress('Output.Summary', tmpContext)).to.equal('test result');
						Expect(tmpStateManager.resolveAddress('Output.Count', tmpContext)).to.equal(7);

						// Resolve entire Output object
						let tmpOutput = tmpStateManager.resolveAddress('Output', tmpContext);
						Expect(tmpOutput.Summary).to.equal('test result');

						// Set Output
						tmpStateManager.setAddress('Output.NewKey', 'new value', tmpContext);
						Expect(tmpContext.Output.NewKey).to.equal('new value');

						// Set Output when Output is not initialized
						let tmpContext2 = {
							GlobalState: {},
							OperationState: {},
							TaskOutputs: {},
							StagingPath: ''
						};
						tmpStateManager.setAddress('Output.Result', 'done', tmpContext2);
						Expect(tmpContext2.Output.Result).to.equal('done');
					}
				);

				test
				(
					'Should include Output in template context.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpStateManager = Object.values(tmpFable.servicesMap['UltravisorStateManager'])[0];

						let tmpContext = {
							GlobalState: {},
							OperationState: {},
							TaskOutputs: {},
							Output: { Result: 'success' },
							StagingPath: ''
						};

						let tmpTemplateCtx = tmpStateManager.buildTemplateContext(tmpContext, null);

						Expect(tmpTemplateCtx.Output).to.not.equal(undefined);
						Expect(tmpTemplateCtx.Output.Result).to.equal('success');
					}
				);
			}
		);

		suite
		(
			'ReadFile TaskType',
			function()
			{
				test
				(
					'Should read a file and return its contents.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('read-file');

						let tmpSettings = { FilePath: TEST_INPUT_FILE, Encoding: 'utf8' };
						let tmpContext = {
							GlobalState: {},
							OperationState: {},
							TaskOutputs: {},
							StagingPath: TEST_STAGING_ROOT,
							NodeHash: 'test-read-001'
						};

						tmpInstance.execute(tmpSettings, tmpContext,
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('ReadComplete');
								Expect(pResult.Outputs.FileContent).to.contain('Hello, John!');
								Expect(pResult.Outputs.BytesRead).to.be.greaterThan(0);
								fDone();
							});
					}
				);

				test
				(
					'Should fire Error event when file not found.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('read-file');

						let tmpSettings = { FilePath: '/nonexistent/file.txt', Encoding: 'utf8' };
						let tmpContext = {
							GlobalState: {},
							OperationState: {},
							TaskOutputs: {},
							StagingPath: TEST_STAGING_ROOT,
							NodeHash: 'test-read-err'
						};

						tmpInstance.execute(tmpSettings, tmpContext,
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('Error');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'WriteFile TaskType',
			function()
			{
				test
				(
					'Should write content to a file.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('write-file');

						let tmpOutputPath = libPath.resolve(TEST_STAGING_ROOT, 'test_output.txt');
						let tmpSettings = { FilePath: tmpOutputPath, Content: 'Written by Ultravisor', Encoding: 'utf8' };
						let tmpContext = {
							GlobalState: {},
							OperationState: {},
							TaskOutputs: {},
							StagingPath: TEST_STAGING_ROOT,
							NodeHash: 'test-write-001'
						};

						tmpInstance.execute(tmpSettings, tmpContext,
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('WriteComplete');
								Expect(pResult.Outputs.BytesWritten).to.be.greaterThan(0);

								// Verify the file was actually written
								let tmpContent = libFS.readFileSync(tmpOutputPath, 'utf8');
								Expect(tmpContent).to.equal('Written by Ultravisor');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'ExecutionEngine',
			function()
			{
				test
				(
					'Should execute a simple read-file -> write-file operation.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

						let tmpOutputFile = 'output_copy.txt';

						// Define the operation graph
						let tmpOperation = {
							Hash: 'OPR-TEST-001',
							Name: 'Read and Write Test',
							Graph:
							{
								Nodes:
								[
									{
										Hash: 'node-start',
										Type: 'start',
										X: 0, Y: 0
									},
									{
										Hash: 'node-read',
										Type: 'read-file',
										DefinitionHash: 'read-file',
										Name: 'Read Input',
										Settings:
										{
											FilePath: TEST_INPUT_FILE,
											Encoding: 'utf8'
										},
										Ports: [],
										X: 200, Y: 0
									},
									{
										Hash: 'node-write',
										Type: 'write-file',
										DefinitionHash: 'write-file',
										Name: 'Write Output',
										Settings:
										{
											FilePath: tmpOutputFile,
											Encoding: 'utf8'
										},
										Ports: [],
										X: 400, Y: 0
									},
									{
										Hash: 'node-end',
										Type: 'end',
										X: 600, Y: 0
									}
								],
								Connections:
								[
									// Start -> ReadFile (event)
									{
										Hash: 'conn-start-read',
										ConnectionType: 'Event',
										SourceNodeHash: 'node-start',
										SourcePortHash: 'node-start-eo-Start',
										TargetNodeHash: 'node-read',
										TargetPortHash: 'node-read-ei-BeginRead'
									},
									// ReadFile -> WriteFile (event: ReadComplete -> BeginWrite)
									{
										Hash: 'conn-read-write-evt',
										ConnectionType: 'Event',
										SourceNodeHash: 'node-read',
										SourcePortHash: 'node-read-eo-ReadComplete',
										TargetNodeHash: 'node-write',
										TargetPortHash: 'node-write-ei-BeginWrite'
									},
									// ReadFile -> WriteFile (state: FileContent -> Content)
									{
										Hash: 'conn-read-write-state',
										ConnectionType: 'State',
										SourceNodeHash: 'node-read',
										SourcePortHash: 'node-read-so-FileContent',
										TargetNodeHash: 'node-write',
										TargetPortHash: 'node-write-si-Content'
									},
									// WriteFile -> End (event)
									{
										Hash: 'conn-write-end',
										ConnectionType: 'Event',
										SourceNodeHash: 'node-write',
										SourcePortHash: 'node-write-eo-WriteComplete',
										TargetNodeHash: 'node-end',
										TargetPortHash: 'node-end-ei-End'
									}
								],
								ViewState: {}
							}
						};

						tmpEngine.executeOperation(tmpOperation, { RunMode: 'debug' },
							(pError, pContext) =>
							{
								Expect(pError).to.equal(null);
								Expect(pContext.Status).to.equal('Complete');

								// Verify the output file was written in the staging folder
								let tmpStagingPath = pContext.StagingPath;
								let tmpOutputPath = libPath.resolve(tmpStagingPath, tmpOutputFile);

								Expect(libFS.existsSync(tmpOutputPath)).to.equal(true);

								let tmpOutputContent = libFS.readFileSync(tmpOutputPath, 'utf8');
								let tmpInputContent = libFS.readFileSync(TEST_INPUT_FILE, 'utf8');

								Expect(tmpOutputContent).to.equal(tmpInputContent);

								// Verify manifest was written
								let tmpManifestFiles = libFS.readdirSync(tmpStagingPath).filter(
									(f) => f.startsWith('Manifest_'));
								Expect(tmpManifestFiles.length).to.equal(1);

								// Verify state snapshots exist (debug mode)
								let tmpStatePath = libPath.resolve(tmpStagingPath, 'state');
								Expect(libFS.existsSync(tmpStatePath)).to.equal(true);

								// Verify task outputs were captured
								Expect(pContext.TaskOutputs['node-read']).to.not.equal(undefined);
								Expect(pContext.TaskOutputs['node-read'].FileContent).to.contain('Hello, John!');
								Expect(pContext.TaskOutputs['node-write']).to.not.equal(undefined);
								Expect(pContext.TaskOutputs['node-write'].BytesWritten).to.be.greaterThan(0);

								// Verify log entries
								Expect(pContext.Log.length).to.be.greaterThan(0);

								fDone();
							});
					}
				);

				test
				(
					'Should handle state connections with template transformation.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

						let tmpOperation = {
							Hash: 'OPR-TEST-002',
							Name: 'Template Transform Test',
							Graph:
							{
								Nodes:
								[
									{
										Hash: 'node-start',
										Type: 'start',
										X: 0, Y: 0
									},
									{
										Hash: 'node-read',
										Type: 'read-file',
										DefinitionHash: 'read-file',
										Name: 'Read Input',
										Settings:
										{
											FilePath: TEST_INPUT_FILE,
											Encoding: 'utf8'
										},
										Ports: [],
										X: 200, Y: 0
									},
									{
										Hash: 'node-write',
										Type: 'write-file',
										DefinitionHash: 'write-file',
										Name: 'Write with Modified Name',
										Settings:
										{
											FilePath: 'transformed_output.txt',
											Encoding: 'utf8'
										},
										Ports: [],
										X: 400, Y: 0
									},
									{
										Hash: 'node-end',
										Type: 'end',
										X: 600, Y: 0
									}
								],
								Connections:
								[
									{
										Hash: 'conn-01',
										ConnectionType: 'Event',
										SourceNodeHash: 'node-start',
										SourcePortHash: 'node-start-eo-Start',
										TargetNodeHash: 'node-read',
										TargetPortHash: 'node-read-ei-BeginRead'
									},
									{
										Hash: 'conn-02',
										ConnectionType: 'Event',
										SourceNodeHash: 'node-read',
										SourcePortHash: 'node-read-eo-ReadComplete',
										TargetNodeHash: 'node-write',
										TargetPortHash: 'node-write-ei-BeginWrite'
									},
									// State connection with template: prepend "COPY: " to content
									{
										Hash: 'conn-03',
										ConnectionType: 'State',
										SourceNodeHash: 'node-read',
										SourcePortHash: 'node-read-so-FileContent',
										TargetNodeHash: 'node-write',
										TargetPortHash: 'node-write-si-Content',
										Data:
										{
											Template: 'COPY: {~D:Record.Value~}'
										}
									},
									{
										Hash: 'conn-04',
										ConnectionType: 'Event',
										SourceNodeHash: 'node-write',
										SourcePortHash: 'node-write-eo-WriteComplete',
										TargetNodeHash: 'node-end',
										TargetPortHash: 'node-end-ei-End'
									}
								],
								ViewState: {}
							}
						};

						tmpEngine.executeOperation(tmpOperation, { RunMode: 'standard' },
							(pError, pContext) =>
							{
								Expect(pError).to.equal(null);
								Expect(pContext.Status).to.equal('Complete');

								// Verify the template was applied
								let tmpOutputPath = libPath.resolve(pContext.StagingPath, 'transformed_output.txt');
								let tmpContent = libFS.readFileSync(tmpOutputPath, 'utf8');

								Expect(tmpContent).to.contain('COPY: ');
								Expect(tmpContent).to.contain('Hello, John!');

								fDone();
							});
					}
				);

				test
				(
					'Should handle missing nodes gracefully.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

						let tmpOperation = {
							Hash: 'OPR-TEST-003',
							Name: 'Empty Operation',
							Graph:
							{
								Nodes:
								[
									{
										Hash: 'node-start',
										Type: 'start',
										X: 0, Y: 0
									},
									{
										Hash: 'node-end',
										Type: 'end',
										X: 200, Y: 0
									}
								],
								Connections:
								[
									{
										Hash: 'conn-01',
										ConnectionType: 'Event',
										SourceNodeHash: 'node-start',
										SourcePortHash: 'node-start-eo-Start',
										TargetNodeHash: 'node-end',
										TargetPortHash: 'node-end-ei-End'
									}
								],
								ViewState: {}
							}
						};

						tmpEngine.executeOperation(tmpOperation,
							(pError, pContext) =>
							{
								Expect(pError).to.equal(null);
								Expect(pContext.Status).to.equal('Complete');
								fDone();
							});
					}
				);

				test
				(
					'State connection Data.StateKey should override target port name when resolving settings.',
					function()
					{
						// The storyboard — long-form video operation wires
						// a value-input's InputValue state output into a
						// parameter-sweep task's `ParameterSets` setting
						// via an event-trigger target port. The target
						// port name can't match the setting name in that
						// shape, so the connection declares
						// `Data.StateKey: "ParameterSets"` and the engine
						// has to honor it. Without the StateKey override,
						// the value would land on `tmpSettings[<port name>]`
						// and the sweep task's `pResolvedSettings.ParameterSets`
						// would be undefined, causing "ParameterSets must be
						// a JSON array." at runtime.
						let tmpFable = createTestFable();
						let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

						let tmpNode = {
							Hash: 'sweep-node',
							Type: 'parameter-sweep',
							Data: {},
							Settings: {},
							Ports:
							[
								{ Direction: 'input', Hash: 'sweep-node-ei-begin', Label: 'BeginSweep', Side: 'left-bottom' }
							]
						};

						let tmpContext = {
							TaskOutputs: {
								'value-input-node': { InputValue: [ { prompt: 'beat 1' }, { prompt: 'beat 2' } ] }
							},
							_ConnectionMap: {
								stateTargets:
								{
									'sweep-node':
									[
										{
											Hash: 'state-conn',
											ConnectionType: 'state',
											SourceNodeHash: 'value-input-node',
											SourcePortHash: 'value-input-node-so-InputValue',
											TargetNodeHash: 'sweep-node',
											TargetPortHash: 'sweep-node-ei-begin',
											Data: { StateKey: 'ParameterSets' }
										}
									]
								}
							},
							_PortLabelMap:
							{
								'value-input-node-so-InputValue': 'InputValue',
								'sweep-node-ei-begin': 'begin'
							}
						};

						let tmpResolved = tmpEngine._resolveStateConnections('sweep-node', tmpNode, tmpContext);

						// The StateKey override routes InputValue into the
						// setting named ParameterSets, not into the target
						// port's label ("begin").
						Expect(Array.isArray(tmpResolved.ParameterSets)).to.equal(true);
						Expect(tmpResolved.ParameterSets.length).to.equal(2);
						Expect(tmpResolved.ParameterSets[0].prompt).to.equal('beat 1');
						// The target port's label-named key should NOT
						// have been populated when StateKey is present.
						Expect(tmpResolved.begin).to.equal(undefined);
					}
				);

				test
				(
					'State connection without Data.StateKey should still route by target port name.',
					function()
					{
						// Regression guard for the StateKey fallback: when
						// the state connection has no StateKey, the engine
						// must continue to use the target port name as the
						// settings key (backward compatibility for every
						// operation wired the old way, including the
						// template-transform test above).
						let tmpFable = createTestFable();
						let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

						let tmpNode = {
							Hash: 'write-node',
							Type: 'write-file',
							Data: {},
							Settings: {},
							Ports:
							[
								{ Direction: 'input', Hash: 'write-node-si-Content', Label: 'Content', Side: 'left-top' }
							]
						};

						let tmpContext = {
							TaskOutputs: {
								'read-node': { FileContent: 'hello world' }
							},
							_ConnectionMap: {
								stateTargets:
								{
									'write-node':
									[
										{
											Hash: 'legacy-state-conn',
											ConnectionType: 'state',
											SourceNodeHash: 'read-node',
											SourcePortHash: 'read-node-so-FileContent',
											TargetNodeHash: 'write-node',
											TargetPortHash: 'write-node-si-Content'
											// No Data.StateKey — fall through
										}
									]
								}
							},
							_PortLabelMap:
							{
								'read-node-so-FileContent': 'FileContent',
								'write-node-si-Content': 'Content'
							}
						};

						let tmpResolved = tmpEngine._resolveStateConnections('write-node', tmpNode, tmpContext);

						Expect(tmpResolved.Content).to.equal('hello world');
					}
				);
			}
		);

		suite
		(
			'ExecutionManifest',
			function()
			{
				test
				(
					'Should create and manage execution contexts.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpManifest = Object.values(tmpFable.servicesMap['UltravisorExecutionManifest'])[0];

						let tmpContext = tmpManifest.createExecutionContext(
							{ Hash: 'OPR-MANIFEST-TEST', Name: 'Manifest Test' }, 'debug');

						Expect(tmpContext.Hash).to.contain('run-OPR-MANIFEST-TEST');
						Expect(tmpContext.Status).to.equal('Pending');
						Expect(tmpContext.RunMode).to.equal('debug');
						Expect(tmpContext.StagingPath).to.not.equal('');
						Expect(libFS.existsSync(tmpContext.StagingPath)).to.equal(true);

						// Should be retrievable
						let tmpRetrieved = tmpManifest.getRun(tmpContext.Hash);
						Expect(tmpRetrieved).to.not.equal(null);
						Expect(tmpRetrieved.OperationHash).to.equal('OPR-MANIFEST-TEST');

						// List should include it
						let tmpList = tmpManifest.listRuns();
						Expect(tmpList.length).to.be.greaterThan(0);
					}
				);

				test
				(
					'Should include Output in execution context and persist it.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpManifest = Object.values(tmpFable.servicesMap['UltravisorExecutionManifest'])[0];

						let tmpContext = tmpManifest.createExecutionContext(
							{ Hash: 'OPR-OUTPUT-TEST', Name: 'Output Test' }, 'standard');

						// Output should be initialized as empty object
						Expect(tmpContext.Output).to.not.equal(undefined);
						Expect(typeof tmpContext.Output).to.equal('object');

						// Simulate task writing to Output
						tmpContext.Output.Result = 'success';
						tmpContext.Output.ItemCount = 42;

						// Mark as running and finalize
						tmpContext.Status = 'Running';
						tmpContext.StartTime = new Date().toISOString();
						tmpManifest.finalizeExecution(tmpContext);

						// Verify the manifest file includes Output
						let tmpManifestPath = libPath.resolve(tmpContext.StagingPath, 'Manifest_OPR-OUTPUT-TEST.json');
						Expect(libFS.existsSync(tmpManifestPath)).to.equal(true);

						let tmpSaved = JSON.parse(libFS.readFileSync(tmpManifestPath, 'utf8'));
						Expect(tmpSaved.Output).to.not.equal(undefined);
						Expect(tmpSaved.Output.Result).to.equal('success');
						Expect(tmpSaved.Output.ItemCount).to.equal(42);

						// State is always persisted now for checkpoint/resume
						Expect(tmpSaved.GlobalState).to.not.equal(undefined);
						Expect(tmpSaved.OperationState).to.not.equal(undefined);
						Expect(tmpSaved.TaskOutputs).to.not.equal(undefined);
					}
				);

				test
				(
					'Should include full state in debug mode manifest.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpManifest = Object.values(tmpFable.servicesMap['UltravisorExecutionManifest'])[0];

						let tmpContext = tmpManifest.createExecutionContext(
							{ Hash: 'OPR-DEBUG-TEST', Name: 'Debug Test' }, 'debug');

						// Populate state
						tmpContext.GlobalState.AppName = 'DebugApp';
						tmpContext.OperationState.InputFile = '/data/test.txt';
						tmpContext.TaskOutputs['node-1'] = { FileContent: 'hello' };
						tmpContext.Output.Summary = 'debug run complete';

						tmpContext.Status = 'Running';
						tmpContext.StartTime = new Date().toISOString();
						tmpManifest.finalizeExecution(tmpContext);

						// Verify the manifest file includes full state
						let tmpManifestPath = libPath.resolve(tmpContext.StagingPath, 'Manifest_OPR-DEBUG-TEST.json');
						let tmpSaved = JSON.parse(libFS.readFileSync(tmpManifestPath, 'utf8'));

						Expect(tmpSaved.Output.Summary).to.equal('debug run complete');
						Expect(tmpSaved.GlobalState).to.not.equal(undefined);
						Expect(tmpSaved.GlobalState.AppName).to.equal('DebugApp');
						Expect(tmpSaved.OperationState).to.not.equal(undefined);
						Expect(tmpSaved.OperationState.InputFile).to.equal('/data/test.txt');
						Expect(tmpSaved.TaskOutputs).to.not.equal(undefined);
						Expect(tmpSaved.TaskOutputs['node-1'].FileContent).to.equal('hello');

						// Verify output.json was written in state directory
						let tmpOutputPath = libPath.resolve(tmpContext.StagingPath, 'state', 'output.json');
						Expect(libFS.existsSync(tmpOutputPath)).to.equal(true);
						let tmpOutputState = JSON.parse(libFS.readFileSync(tmpOutputPath, 'utf8'));
						Expect(tmpOutputState.Summary).to.equal('debug run complete');
					}
				);
			}
		);

		suite
		(
			'ReplaceString TaskType',
			function()
			{
				test
				(
					'Should replace all occurrences of a search string.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('replace-string');

						let tmpSettings = {
							InputString: 'Hello, John! John is here.',
							SearchString: 'John',
							ReplaceString: 'Jane'
						};

						tmpInstance.execute(tmpSettings, { GlobalState: {}, OperationState: {}, TaskOutputs: {}, StagingPath: '', NodeHash: 'test' },
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('ReplaceComplete');
								Expect(pResult.Outputs.ReplacedString).to.equal('Hello, Jane! Jane is here.');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'SetValues TaskType',
			function()
			{
				test
				(
					'Should set value at specified address.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpBuiltInConfigs = require('../source/services/tasks/Ultravisor-BuiltIn-TaskConfigs.cjs');
						tmpRegistry.registerTaskTypesFromConfigArray(tmpBuiltInConfigs);
						let tmpInstance = tmpRegistry.instantiateTaskType('set-value');

						let tmpSettings = {
							Value: '/tmp/out',
							ToAddress: 'Operation.OutputDir'
						};

						tmpInstance.execute(tmpSettings, { GlobalState: {}, OperationState: {}, TaskOutputs: {}, StagingPath: '', NodeHash: 'test' },
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('Complete');
								Expect(pResult.StateWrites['Operation.OutputDir']).to.equal('/tmp/out');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'IfConditional TaskType',
			function()
			{
				test
				(
					'Should fire True when condition is met.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpStateManager = Object.values(tmpFable.servicesMap['UltravisorStateManager'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('if-conditional');

						let tmpContext = {
							GlobalState: {},
							OperationState: { Status: 'active' },
							TaskOutputs: {},
							StagingPath: '',
							NodeHash: 'test-if',
							StateManager: tmpStateManager
						};

						tmpInstance.execute(
							{ DataAddress: 'Operation.Status', CompareValue: 'active', Operator: '==' },
							tmpContext,
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('True');
								Expect(pResult.Outputs.Result).to.equal(true);
								fDone();
							});
					}
				);

				test
				(
					'Should fire False when condition is not met.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpStateManager = Object.values(tmpFable.servicesMap['UltravisorStateManager'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('if-conditional');

						let tmpContext = {
							GlobalState: {},
							OperationState: { Count: '5' },
							TaskOutputs: {},
							StagingPath: '',
							NodeHash: 'test-if',
							StateManager: tmpStateManager
						};

						tmpInstance.execute(
							{ DataAddress: 'Operation.Count', CompareValue: '10', Operator: '>' },
							tmpContext,
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('False');
								Expect(pResult.Outputs.Result).to.equal(false);
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'ValueInput TaskType',
			function()
			{
				test
				(
					'Should signal WaitingForInput.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('value-input');

						tmpInstance.execute(
							{ PromptMessage: 'Enter file path:', OutputAddress: 'Operation.FilePath' },
							{ GlobalState: {}, OperationState: {}, TaskOutputs: {}, StagingPath: '', NodeHash: 'test-input' },
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.WaitingForInput).to.equal(true);
								Expect(pResult.PromptMessage).to.equal('Enter file path:');
								Expect(pResult.OutputAddress).to.equal('Operation.FilePath');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'SplitExecute TaskType',
			function()
			{
				test
				(
					'Should emit first token on PerformSplit.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('split-execute');

						let tmpSettings = {
							InputString: 'alpha\nbeta\ngamma',
							SplitDelimiter: '\n'
						};

						let tmpContext = {
							GlobalState: {},
							OperationState: {},
							TaskOutputs: {},
							StagingPath: '',
							NodeHash: 'test-split',
							TriggeringEventName: 'PerformSplit'
						};

						tmpInstance.execute(tmpSettings, tmpContext,
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('TokenDataSent');
								Expect(pResult.Outputs.CurrentToken).to.equal('alpha');
								Expect(pResult.Outputs.TokenIndex).to.equal(0);
								Expect(pResult.Outputs.TokenCount).to.equal(3);
								Expect(pResult.Outputs.CompletedCount).to.equal(0);
								Expect(pResult.Outputs._Tokens).to.deep.equal(['alpha', 'beta', 'gamma']);
								fDone();
							});
					}
				);

				test
				(
					'Should advance tokens on StepComplete and fire CompletedAllSubtasks when done.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];

						let tmpNodeHash = 'test-split-loop';
						let tmpTokens = ['alpha', 'beta', 'gamma'];

						// Simulate stored state after PerformSplit emitted first token
						let tmpTaskOutputs = {};
						tmpTaskOutputs[tmpNodeHash] = {
							_Tokens: tmpTokens,
							CurrentToken: 'alpha',
							TokenIndex: 0,
							TokenCount: 3,
							CompletedCount: 0
						};

						// First StepComplete: should advance to 'beta'
						let tmpInstance1 = tmpRegistry.instantiateTaskType('split-execute');
						let tmpContext1 = {
							GlobalState: {},
							OperationState: {},
							TaskOutputs: tmpTaskOutputs,
							StagingPath: '',
							NodeHash: tmpNodeHash,
							TriggeringEventName: 'StepComplete'
						};

						tmpInstance1.execute({}, tmpContext1,
							(pError1, pResult1) =>
							{
								Expect(pError1).to.equal(null);
								Expect(pResult1.EventToFire).to.equal('TokenDataSent');
								Expect(pResult1.Outputs.CurrentToken).to.equal('beta');
								Expect(pResult1.Outputs.TokenIndex).to.equal(1);
								Expect(pResult1.Outputs.CompletedCount).to.equal(1);

								// Apply outputs (simulating what the engine does)
								Object.assign(tmpTaskOutputs[tmpNodeHash], pResult1.Outputs);

								// Second StepComplete: should advance to 'gamma'
								let tmpInstance2 = tmpRegistry.instantiateTaskType('split-execute');
								let tmpContext2 = {
									GlobalState: {},
									OperationState: {},
									TaskOutputs: tmpTaskOutputs,
									StagingPath: '',
									NodeHash: tmpNodeHash,
									TriggeringEventName: 'StepComplete'
								};

								tmpInstance2.execute({}, tmpContext2,
									(pError2, pResult2) =>
									{
										Expect(pError2).to.equal(null);
										Expect(pResult2.EventToFire).to.equal('TokenDataSent');
										Expect(pResult2.Outputs.CurrentToken).to.equal('gamma');
										Expect(pResult2.Outputs.TokenIndex).to.equal(2);
										Expect(pResult2.Outputs.CompletedCount).to.equal(2);

										// Apply outputs
										Object.assign(tmpTaskOutputs[tmpNodeHash], pResult2.Outputs);

										// Third StepComplete: should fire CompletedAllSubtasks
										let tmpInstance3 = tmpRegistry.instantiateTaskType('split-execute');
										let tmpContext3 = {
											GlobalState: {},
											OperationState: {},
											TaskOutputs: tmpTaskOutputs,
											StagingPath: '',
											NodeHash: tmpNodeHash,
											TriggeringEventName: 'StepComplete'
										};

										tmpInstance3.execute({}, tmpContext3,
											(pError3, pResult3) =>
											{
												Expect(pError3).to.equal(null);
												Expect(pResult3.EventToFire).to.equal('CompletedAllSubtasks');
												Expect(pResult3.Outputs.CompletedCount).to.equal(3);
												Expect(pResult3.Outputs.TokenCount).to.equal(3);
												fDone();
											});
									});
							});
					}
				);

				test
				(
					'Should fire CompletedAllSubtasks immediately for empty input.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('split-execute');

						let tmpContext = {
							GlobalState: {},
							OperationState: {},
							TaskOutputs: {},
							StagingPath: '',
							NodeHash: 'test-split-empty',
							TriggeringEventName: 'PerformSplit'
						};

						tmpInstance.execute(
							{ InputString: '', SplitDelimiter: '\n' },
							tmpContext,
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								// Empty string split by \n produces [''], which is 1 token
								// So it should fire TokenDataSent for that single empty token
								Expect(pResult.EventToFire).to.equal('TokenDataSent');
								Expect(pResult.Outputs.TokenCount).to.equal(1);
								Expect(pResult.Outputs.CurrentToken).to.equal('');
								fDone();
							});
					}
				);

				test
				(
					'Should fire Error for non-string input.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('split-execute');

						let tmpContext = {
							GlobalState: {},
							OperationState: {},
							TaskOutputs: {},
							StagingPath: '',
							NodeHash: 'test-split-err',
							TriggeringEventName: 'PerformSplit'
						};

						tmpInstance.execute(
							{ InputString: 42, SplitDelimiter: '\n' },
							tmpContext,
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('Error');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'ValueInput Pause/Resume',
			function()
			{
				test
				(
					'Should pause operation and resume when input is provided.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

						// Operation: Start -> ValueInput -> WriteFile -> End
						// ValueInput writes to Operation.UserValue
						// WriteFile uses Operation.UserValue as Content
						let tmpOperation = {
							Hash: 'OPR-RESUME-TEST',
							Name: 'Pause Resume Test',
							Graph:
							{
								Nodes:
								[
									{ Hash: 'node-start', Type: 'start', X: 0, Y: 0 },
									{
										Hash: 'node-input',
										Type: 'value-input',
										DefinitionHash: 'value-input',
										Name: 'Get User Value',
										Settings: { PromptMessage: 'Enter value:', OutputAddress: 'Operation.UserValue' },
										Ports: [],
										X: 200, Y: 0
									},
									{
										Hash: 'node-write',
										Type: 'write-file',
										DefinitionHash: 'write-file',
										Name: 'Write Value',
										Settings: { FilePath: 'user_output.txt', Encoding: 'utf8' },
										Ports: [],
										X: 400, Y: 0
									},
									{ Hash: 'node-end', Type: 'end', X: 600, Y: 0 }
								],
								Connections:
								[
									{
										Hash: 'c1', ConnectionType: 'Event',
										SourceNodeHash: 'node-start', SourcePortHash: 'node-start-eo-Start',
										TargetNodeHash: 'node-input', TargetPortHash: 'node-input-ei-RequestInput'
									},
									{
										Hash: 'c2', ConnectionType: 'Event',
										SourceNodeHash: 'node-input', SourcePortHash: 'node-input-eo-ValueInputComplete',
										TargetNodeHash: 'node-write', TargetPortHash: 'node-write-ei-BeginWrite'
									},
									{
										Hash: 'c3', ConnectionType: 'State',
										SourceNodeHash: 'node-input', SourcePortHash: 'node-input-so-InputValue',
										TargetNodeHash: 'node-write', TargetPortHash: 'node-write-si-Content'
									},
									{
										Hash: 'c4', ConnectionType: 'Event',
										SourceNodeHash: 'node-write', SourcePortHash: 'node-write-eo-WriteComplete',
										TargetNodeHash: 'node-end', TargetPortHash: 'node-end-ei-End'
									}
								],
								ViewState: {}
							}
						};

						tmpEngine.executeOperation(tmpOperation, {},
							(pError, pContext) =>
							{
								Expect(pError).to.equal(null);
								Expect(pContext.Status).to.equal('WaitingForInput');
								Expect(pContext.WaitingTasks['node-input']).to.not.equal(undefined);

								// Now resume with user input
								tmpEngine.resumeOperation(pContext.Hash, 'node-input', 'User provided value!',
									(pResumeError, pResumedContext) =>
									{
										Expect(pResumeError).to.equal(null);
										Expect(pResumedContext.Status).to.equal('Complete');

										// Verify the value was written
										let tmpOutputPath = libPath.resolve(pResumedContext.StagingPath, 'user_output.txt');
										Expect(libFS.existsSync(tmpOutputPath)).to.equal(true);

										let tmpContent = libFS.readFileSync(tmpOutputPath, 'utf8');
										Expect(tmpContent).to.equal('User provided value!');

										fDone();
									});
							});
					}
				);
			}
		);

		suite
		(
			'Full Walkthrough: Read -> Split -> Replace -> Append -> Write',
			function()
			{
				test
				(
					'Should read a file, split by lines, replace John with Jane, and write output.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

						// The input file has: "Hello, John!\nWelcome to Ultravisor.\nJohn is here.\n"
						// Expected output: "Hello, Jane!\nWelcome to Ultravisor.\nJane is here.\n"

						let tmpOperation = {
							Hash: 'OPR-WALKTHROUGH',
							Name: 'Full Walkthrough',
							Graph:
							{
								Nodes:
								[
									{ Hash: 'node-start', Type: 'start', X: 0, Y: 0 },
									{
										Hash: 'node-read',
										Type: 'read-file',
										DefinitionHash: 'read-file',
										Name: 'Read Input File',
										Settings: { FilePath: TEST_INPUT_FILE, Encoding: 'utf8' },
										Ports: [],
										X: 200, Y: 0
									},
									{
										Hash: 'node-split',
										Type: 'split-execute',
										DefinitionHash: 'split-execute',
										Name: 'Split By Lines',
										Settings: { SplitDelimiter: '\n' },
										Ports: [],
										X: 400, Y: 0
									},
									{
										Hash: 'node-replace',
										Type: 'replace-string',
										DefinitionHash: 'replace-string',
										Name: 'Replace John with Jane',
										Settings: { SearchString: 'John', ReplaceString: 'Jane' },
										Ports: [],
										X: 600, Y: 100
									},
									{
										Hash: 'node-append',
										Type: 'string-appender',
										DefinitionHash: 'string-appender',
										Name: 'Accumulate Lines',
										Settings: { OutputAddress: 'Operation.AccumulatedOutput', AppendNewline: true },
										Ports: [],
										X: 800, Y: 100
									},
									{
										Hash: 'node-write',
										Type: 'write-file',
										DefinitionHash: 'write-file',
										Name: 'Write Output File',
										Settings: { FilePath: 'walkthrough_output.txt', Encoding: 'utf8' },
										Ports: [],
										X: 1000, Y: 0
									},
									{ Hash: 'node-end', Type: 'end', X: 1200, Y: 0 }
								],
								Connections:
								[
									// Start -> ReadFile
									{
										Hash: 'c01', ConnectionType: 'Event',
										SourceNodeHash: 'node-start', SourcePortHash: 'node-start-eo-Start',
										TargetNodeHash: 'node-read', TargetPortHash: 'node-read-ei-BeginRead'
									},
									// ReadFile -> SplitExecute (event)
									{
										Hash: 'c02', ConnectionType: 'Event',
										SourceNodeHash: 'node-read', SourcePortHash: 'node-read-eo-ReadComplete',
										TargetNodeHash: 'node-split', TargetPortHash: 'node-split-ei-PerformSplit'
									},
									// ReadFile.FileContent -> SplitExecute.InputString (state)
									{
										Hash: 'c03', ConnectionType: 'State',
										SourceNodeHash: 'node-read', SourcePortHash: 'node-read-so-FileContent',
										TargetNodeHash: 'node-split', TargetPortHash: 'node-split-si-InputString'
									},
									// SplitExecute -> ReplaceString (event: TokenDataSent)
									{
										Hash: 'c04', ConnectionType: 'Event',
										SourceNodeHash: 'node-split', SourcePortHash: 'node-split-eo-TokenDataSent',
										TargetNodeHash: 'node-replace', TargetPortHash: 'node-replace-ei-Replace'
									},
									// SplitExecute.CurrentToken -> ReplaceString.InputString (state)
									{
										Hash: 'c05', ConnectionType: 'State',
										SourceNodeHash: 'node-split', SourcePortHash: 'node-split-so-CurrentToken',
										TargetNodeHash: 'node-replace', TargetPortHash: 'node-replace-si-InputString'
									},
									// ReplaceString -> StringAppender (event)
									{
										Hash: 'c06', ConnectionType: 'Event',
										SourceNodeHash: 'node-replace', SourcePortHash: 'node-replace-eo-ReplaceComplete',
										TargetNodeHash: 'node-append', TargetPortHash: 'node-append-ei-Append'
									},
									// ReplaceString.ReplacedString -> StringAppender.InputString (state)
									{
										Hash: 'c07', ConnectionType: 'State',
										SourceNodeHash: 'node-replace', SourcePortHash: 'node-replace-so-ReplacedString',
										TargetNodeHash: 'node-append', TargetPortHash: 'node-append-si-InputString'
									},
									// StringAppender.Completed -> SplitExecute.StepComplete (loop back)
									{
										Hash: 'c07b', ConnectionType: 'Event',
										SourceNodeHash: 'node-append', SourcePortHash: 'node-append-eo-Completed',
										TargetNodeHash: 'node-split', TargetPortHash: 'node-split-ei-StepComplete'
									},
									// SplitExecute.CompletedAllSubtasks -> WriteFile (event)
									{
										Hash: 'c08', ConnectionType: 'Event',
										SourceNodeHash: 'node-split', SourcePortHash: 'node-split-eo-CompletedAllSubtasks',
										TargetNodeHash: 'node-write', TargetPortHash: 'node-write-ei-BeginWrite'
									},
									// Operation.AccumulatedOutput -> WriteFile.Content (state)
									// We use the accumulated string from operation state
									{
										Hash: 'c09', ConnectionType: 'State',
										SourceNodeHash: 'node-append', SourcePortHash: 'node-append-so-AppendedString',
										TargetNodeHash: 'node-write', TargetPortHash: 'node-write-si-Content'
									},
									// WriteFile -> End (event)
									{
										Hash: 'c10', ConnectionType: 'Event',
										SourceNodeHash: 'node-write', SourcePortHash: 'node-write-eo-WriteComplete',
										TargetNodeHash: 'node-end', TargetPortHash: 'node-end-ei-End'
									}
								],
								ViewState: {}
							}
						};

						tmpEngine.executeOperation(tmpOperation, { RunMode: 'debug' },
							(pError, pContext) =>
							{
								Expect(pError).to.equal(null);
								Expect(pContext.Status).to.equal('Complete');

								// Verify the output file
								let tmpOutputPath = libPath.resolve(pContext.StagingPath, 'walkthrough_output.txt');
								Expect(libFS.existsSync(tmpOutputPath)).to.equal(true);

								let tmpContent = libFS.readFileSync(tmpOutputPath, 'utf8');

								// Should have Jane instead of John
								Expect(tmpContent).to.contain('Jane');
								Expect(tmpContent).to.not.contain('John');
								Expect(tmpContent).to.contain('Hello, Jane!');
								Expect(tmpContent).to.contain('Jane is here.');

								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'IfConditional Branching',
			function()
			{
				test
				(
					'Should branch to different write paths based on condition.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

						let tmpOperation = {
							Hash: 'OPR-BRANCH-TEST',
							Name: 'Branching Test',
							Graph:
							{
								Nodes:
								[
									{ Hash: 'node-start', Type: 'start', X: 0, Y: 0 },
									{
										Hash: 'node-setvals',
										Type: 'set-value',
										DefinitionHash: 'set-value',
										Name: 'Set Test Value',
										Settings: {
											Value: 'active',
											ToAddress: 'Operation.TestValue'
										},
										Ports: [],
										X: 200, Y: 0
									},
									{
										Hash: 'node-if',
										Type: 'if-conditional',
										DefinitionHash: 'if-conditional',
										Name: 'Check Status',
										Settings: { DataAddress: 'Operation.TestValue', CompareValue: 'active', Operator: '==' },
										Ports: [],
										X: 400, Y: 0
									},
									{
										Hash: 'node-write-true',
										Type: 'write-file',
										DefinitionHash: 'write-file',
										Name: 'Write True',
										Settings: { FilePath: 'branch_true.txt', Content: 'Condition was TRUE', Encoding: 'utf8' },
										Ports: [],
										X: 600, Y: -100
									},
									{
										Hash: 'node-write-false',
										Type: 'write-file',
										DefinitionHash: 'write-file',
										Name: 'Write False',
										Settings: { FilePath: 'branch_false.txt', Content: 'Condition was FALSE', Encoding: 'utf8' },
										Ports: [],
										X: 600, Y: 100
									},
									{ Hash: 'node-end', Type: 'end', X: 800, Y: 0 }
								],
								Connections:
								[
									{
										Hash: 'c1', ConnectionType: 'Event',
										SourceNodeHash: 'node-start', SourcePortHash: 'node-start-eo-Start',
										TargetNodeHash: 'node-setvals', TargetPortHash: 'node-setvals-ei-Execute'
									},
									{
										Hash: 'c2', ConnectionType: 'Event',
										SourceNodeHash: 'node-setvals', SourcePortHash: 'node-setvals-eo-Complete',
										TargetNodeHash: 'node-if', TargetPortHash: 'node-if-ei-Evaluate'
									},
									{
										Hash: 'c3', ConnectionType: 'Event',
										SourceNodeHash: 'node-if', SourcePortHash: 'node-if-eo-True',
										TargetNodeHash: 'node-write-true', TargetPortHash: 'node-write-true-ei-BeginWrite'
									},
									{
										Hash: 'c4', ConnectionType: 'Event',
										SourceNodeHash: 'node-if', SourcePortHash: 'node-if-eo-False',
										TargetNodeHash: 'node-write-false', TargetPortHash: 'node-write-false-ei-BeginWrite'
									},
									{
										Hash: 'c5', ConnectionType: 'Event',
										SourceNodeHash: 'node-write-true', SourcePortHash: 'node-write-true-eo-WriteComplete',
										TargetNodeHash: 'node-end', TargetPortHash: 'node-end-ei-End'
									},
									{
										Hash: 'c6', ConnectionType: 'Event',
										SourceNodeHash: 'node-write-false', SourcePortHash: 'node-write-false-eo-WriteComplete',
										TargetNodeHash: 'node-end', TargetPortHash: 'node-end-ei-End'
									}
								],
								ViewState: {}
							}
						};

						tmpEngine.executeOperation(tmpOperation, { RunMode: 'standard' },
							(pError, pContext) =>
							{
								Expect(pError).to.equal(null);
								Expect(pContext.Status).to.equal('Complete');

								// The True branch should have been taken
								let tmpTruePath = libPath.resolve(pContext.StagingPath, 'branch_true.txt');
								let tmpFalsePath = libPath.resolve(pContext.StagingPath, 'branch_false.txt');

								Expect(libFS.existsSync(tmpTruePath)).to.equal(true);
								Expect(libFS.existsSync(tmpFalsePath)).to.equal(false);

								let tmpContent = libFS.readFileSync(tmpTruePath, 'utf8');
								Expect(tmpContent).to.equal('Condition was TRUE');

								fDone();
							});
					}
				);
			}
		);


		// ════════════════════════════════════════════════════════════
		//  CONFIG-DRIVEN TASK TYPES
		// ════════════════════════════════════════════════════════════
		suite
		(
			'Config-Driven Task Types',
			function()
			{
				test
				(
					'Base class should use options.Definition when provided.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpBase = require('../source/services/tasks/Ultravisor-TaskType-Base.cjs');
						let tmpInstance = new tmpBase(tmpFable,
							{
								Definition:
								{
									Hash: 'test-config-task',
									Name: 'Test Config Task',
									Description: 'A task created from config.',
									Category: 'test'
								}
							},
							'test-config-task');

						Expect(tmpInstance.definition.Hash).to.equal('test-config-task');
						Expect(tmpInstance.definition.Name).to.equal('Test Config Task');
					}
				);

				test
				(
					'Base class should use options.Execute when provided.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpBase = require('../source/services/tasks/Ultravisor-TaskType-Base.cjs');
						let tmpExecuteCalled = false;

						let tmpInstance = new tmpBase(tmpFable,
							{
								Definition:
								{
									Hash: 'test-exec-task',
									Name: 'Test Exec Task',
									Category: 'test',
									EventInputs: [{ Name: 'Go' }],
									EventOutputs: [{ Name: 'Done' }],
									SettingsInputs: [],
									StateOutputs: [],
									DefaultSettings: {}
								},
								Execute: function (pTask, pSettings, pContext, fCb)
								{
									tmpExecuteCalled = true;
									return fCb(null, { EventToFire: 'Done', Outputs: {}, Log: ['Config exec ran.'] });
								}
							},
							'test-exec-task');

						tmpInstance.execute({}, { NodeHash: 'node-1' },
							function (pError, pResult)
							{
								Expect(pError).to.equal(null);
								Expect(tmpExecuteCalled).to.equal(true);
								Expect(pResult.EventToFire).to.equal('Done');
								fDone();
							});
					}
				);

				test
				(
					'Registry should register task type from config.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];

						let tmpDef = tmpRegistry.registerTaskTypeFromConfig(
							{
								Definition:
								{
									Hash: 'config-registered',
									Name: 'Config Registered',
									Category: 'test',
									EventInputs: [],
									EventOutputs: [{ Name: 'Done' }],
									SettingsInputs: [],
									StateOutputs: [],
									DefaultSettings: {}
								},
								Execute: function (pTask, pSettings, pContext, fCb)
								{
									return fCb(null, { EventToFire: 'Done', Outputs: {}, Log: ['ok'] });
								}
							});

						Expect(tmpDef).to.be.an('object');
						Expect(tmpDef.Hash).to.equal('config-registered');
						Expect(tmpRegistry.hasTaskType('config-registered')).to.equal(true);
						Expect(tmpRegistry.getDefinition('config-registered')).to.be.an('object');
					}
				);

				test
				(
					'Registry should instantiate config-driven task and execute it.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];

						tmpRegistry.registerTaskTypeFromConfig(
							{
								Definition:
								{
									Hash: 'config-exec-test',
									Name: 'Config Exec Test',
									Category: 'test',
									EventInputs: [{ Name: 'Run' }],
									EventOutputs: [{ Name: 'Complete' }],
									SettingsInputs: [{ Name: 'Greeting', DataType: 'String' }],
									StateOutputs: [{ Name: 'Message', DataType: 'String' }],
									DefaultSettings: { Greeting: 'Hello' }
								},
								Execute: function (pTask, pSettings, pContext, fCb)
								{
									let tmpMsg = pSettings.Greeting + ' World';
									return fCb(null, {
										EventToFire: 'Complete',
										Outputs: { Message: tmpMsg },
										Log: [tmpMsg]
									});
								}
							});

						let tmpInstance = tmpRegistry.instantiateTaskType('config-exec-test');
						Expect(tmpInstance).to.not.equal(null);
						Expect(tmpInstance.definition.Hash).to.equal('config-exec-test');

						tmpInstance.execute({ Greeting: 'Hi' }, { NodeHash: 'test-node' },
							function (pError, pResult)
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('Complete');
								Expect(pResult.Outputs.Message).to.equal('Hi World');
								fDone();
							});
					}
				);

				test
				(
					'Registry should register all 32 built-in task types from config array.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];

						let tmpBuiltInConfigs = require('../source/services/tasks/Ultravisor-BuiltIn-TaskConfigs.cjs');
						let tmpCount = tmpRegistry.registerTaskTypesFromConfigArray(tmpBuiltInConfigs);

						Expect(tmpCount).to.equal(56);

						// Spot-check a few
						Expect(tmpRegistry.hasTaskType('error-message')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('read-file')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('beacon-dispatch')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('command')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('get-json')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('meadow-read')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('parse-csv')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('histogram')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('if-conditional')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('launch-operation')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('template-string')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('expression-solver')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('read-file-buffered')).to.equal(true);

						// List all definitions
						let tmpDefs = tmpRegistry.listDefinitions();
						// 32 from config + 10 from class-based in createTestFable
						// But some overlap (same hash), so count unique
						Expect(tmpDefs.length).to.be.at.least(36);
					}
				);

				test
				(
					'Config-driven error-message task should execute correctly.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpBuiltInConfigs = require('../source/services/tasks/Ultravisor-BuiltIn-TaskConfigs.cjs');
						tmpRegistry.registerTaskTypesFromConfigArray(tmpBuiltInConfigs);

						let tmpInstance = tmpRegistry.instantiateTaskType('error-message');
						Expect(tmpInstance).to.not.equal(null);

						tmpInstance.execute(
							{ MessageTemplate: 'Something went wrong!' },
							{ NodeHash: 'err-node' },
							function (pError, pResult)
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('Complete');
								Expect(pResult.Log[0]).to.contain('Something went wrong!');
								fDone();
							});
					}
				);

				test
				(
					'Config-driven read-file task should read a file.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpBuiltInConfigs = require('../source/services/tasks/Ultravisor-BuiltIn-TaskConfigs.cjs');
						tmpRegistry.registerTaskTypesFromConfigArray(tmpBuiltInConfigs);

						let tmpInstance = tmpRegistry.instantiateTaskType('read-file');
						Expect(tmpInstance).to.not.equal(null);

						tmpInstance.execute(
							{ FilePath: TEST_INPUT_FILE, Encoding: 'utf8' },
							{ NodeHash: 'read-node', StagingPath: TEST_STAGING_ROOT },
							function (pError, pResult)
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('ReadComplete');
								Expect(pResult.Outputs.FileContent).to.contain('Hello, John!');
								Expect(pResult.Outputs.BytesRead).to.be.above(0);
								fDone();
							});
					}
				);

				test
				(
					'Config-driven command task should execute a shell command.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpBuiltInConfigs = require('../source/services/tasks/Ultravisor-BuiltIn-TaskConfigs.cjs');
						tmpRegistry.registerTaskTypesFromConfigArray(tmpBuiltInConfigs);

						let tmpInstance = tmpRegistry.instantiateTaskType('command');
						Expect(tmpInstance).to.not.equal(null);

						tmpInstance.execute(
							{ Command: 'echo', Parameters: 'hello from config' },
							{ NodeHash: 'cmd-node', StagingPath: TEST_STAGING_ROOT },
							function (pError, pResult)
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('Complete');
								Expect(pResult.Outputs.StdOut).to.contain('hello from config');
								Expect(pResult.Outputs.ExitCode).to.equal(0);
								fDone();
							});
					}
				);

				test
				(
					'Config-driven parse-csv task should parse CSV data.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpBuiltInConfigs = require('../source/services/tasks/Ultravisor-BuiltIn-TaskConfigs.cjs');
						tmpRegistry.registerTaskTypesFromConfigArray(tmpBuiltInConfigs);

						let tmpInstance = tmpRegistry.instantiateTaskType('parse-csv');
						Expect(tmpInstance).to.not.equal(null);

						// Set up mock state manager
						let tmpCSVData = 'Name,Age,City\nAlice,30,Portland\nBob,25,Seattle\n';
						let tmpStateManager =
						{
							resolveAddress: function (pAddress)
							{
								if (pAddress === 'TestCSV') { return tmpCSVData; }
								return undefined;
							}
						};

						tmpInstance.execute(
							{ SourceAddress: 'TestCSV', Delimiter: ',', HasHeaders: true, Destination: '' },
							{ NodeHash: 'csv-node', StateManager: tmpStateManager },
							function (pError, pResult)
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('Complete');
								Expect(pResult.Outputs.Records).to.be.an('array');
								Expect(pResult.Outputs.Records.length).to.equal(2);
								Expect(pResult.Outputs.Records[0].Name).to.equal('Alice');
								Expect(pResult.Outputs.Records[0].Age).to.equal('30');
								Expect(pResult.Outputs.Records[1].Name).to.equal('Bob');
								fDone();
							});
					}
				);

				test
				(
					'Config-driven set-value task should write state.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpBuiltInConfigs = require('../source/services/tasks/Ultravisor-BuiltIn-TaskConfigs.cjs');
						tmpRegistry.registerTaskTypesFromConfigArray(tmpBuiltInConfigs);

						let tmpInstance = tmpRegistry.instantiateTaskType('set-value');
						Expect(tmpInstance).to.not.equal(null);

						tmpInstance.execute(
							{
								Value: 'Ultravisor',
								ToAddress: 'State.Name'
							},
							{ NodeHash: 'sv-node' },
							function (pError, pResult)
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('Complete');
								Expect(pResult.StateWrites['State.Name']).to.equal('Ultravisor');
								fDone();
							});
					}
				);

				test
				(
					'registerBuiltInTaskTypes should load all configs.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];

						// Configs already registered by createTestFable — verify all present
						let tmpDefs = tmpRegistry.listDefinitions();
						Expect(tmpDefs.length).to.equal(56);
					}
				);
			}
		);

		suite
		(
			'Manifest Telemetry',
			function()
			{
				test
				(
					'Task executions should have timing data and metadata.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

						// Simple operation: set-value -> end
						let tmpOperation = {
							Hash: 'telemetry-test-op',
							Name: 'Telemetry Test',
							Graph: {
								Nodes: [
									{ Hash: 'start-1', Type: 'start', Ports: [{ Hash: 'start-1-eo-Begin', Label: 'Begin' }] },
									{
										Hash: 'set-1', Type: 'set-value', DefinitionHash: 'set-value',
										Settings: { Value: 'TestValue', ToAddress: 'State.TestKey' },
										Ports: [
											{ Hash: 'set-1-ei-Trigger', Label: 'Trigger' },
											{ Hash: 'set-1-eo-Complete', Label: 'Complete' }
										]
									},
									{ Hash: 'end-1', Type: 'end', Ports: [{ Hash: 'end-1-ei-Finish', Label: 'Finish' }] }
								],
								Connections: [
									{ SourceNodeHash: 'start-1', SourcePortHash: 'start-1-eo-Begin', TargetNodeHash: 'set-1', TargetPortHash: 'set-1-ei-Trigger', ConnectionType: 'Event' },
									{ SourceNodeHash: 'set-1', SourcePortHash: 'set-1-eo-Complete', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' }
								]
							}
						};

						tmpEngine.executeOperation(tmpOperation,
							function (pError, pContext)
							{
								Expect(pError).to.equal(null);
								Expect(pContext.Status).to.equal('Complete');

								// Verify TaskManifests have metadata
								let tmpTaskManifest = pContext.TaskManifests['set-1'];
								Expect(tmpTaskManifest).to.not.equal(undefined);
								Expect(tmpTaskManifest.DefinitionHash).to.equal('set-value');
								Expect(tmpTaskManifest.TaskTypeName).to.equal('Set Value');
								Expect(tmpTaskManifest.Category).to.be.a('string');
								Expect(tmpTaskManifest.Capability).to.equal('Data Transform');
								Expect(tmpTaskManifest.Action).to.equal('SetValue');
								Expect(tmpTaskManifest.Tier).to.equal('Engine');

								// Verify execution has timing data
								Expect(tmpTaskManifest.Executions.length).to.be.greaterThan(0);
								let tmpExec = tmpTaskManifest.Executions[0];
								Expect(tmpExec.StartTimeMs).to.be.a('number');
								Expect(tmpExec.StopTimeMs).to.be.a('number');
								Expect(tmpExec.ElapsedMs).to.be.a('number');
								Expect(tmpExec.ElapsedMs).to.be.at.least(0);

								fDone();
							});
					}
				);

				test
				(
					'EventLog should contain events with verbosity levels.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

						let tmpOperation = {
							Hash: 'eventlog-test-op',
							Name: 'EventLog Test',
							Graph: {
								Nodes: [
									{ Hash: 'start-1', Type: 'start', Ports: [{ Hash: 'start-1-eo-Begin', Label: 'Begin' }] },
									{
										Hash: 'set-1', Type: 'set-value', DefinitionHash: 'set-value',
										Settings: { Value: 1, ToAddress: 'State.X' },
										Ports: [
											{ Hash: 'set-1-ei-Trigger', Label: 'Trigger' },
											{ Hash: 'set-1-eo-Complete', Label: 'Complete' }
										]
									},
									{ Hash: 'end-1', Type: 'end', Ports: [{ Hash: 'end-1-ei-Finish', Label: 'Finish' }] }
								],
								Connections: [
									{ SourceNodeHash: 'start-1', SourcePortHash: 'start-1-eo-Begin', TargetNodeHash: 'set-1', TargetPortHash: 'set-1-ei-Trigger', ConnectionType: 'Event' },
									{ SourceNodeHash: 'set-1', SourcePortHash: 'set-1-eo-Complete', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' }
								]
							}
						};

						tmpEngine.executeOperation(tmpOperation,
							function (pError, pContext)
							{
								Expect(pError).to.equal(null);

								// Verify EventLog exists and has entries
								Expect(pContext.EventLog).to.be.an('array');
								Expect(pContext.EventLog.length).to.be.greaterThan(0);

								// Verify event structure
								let tmpFirstEvent = pContext.EventLog[0];
								Expect(tmpFirstEvent.Timestamp).to.be.a('string');
								Expect(tmpFirstEvent.TimestampMs).to.be.a('number');
								Expect(tmpFirstEvent.EventName).to.be.a('string');
								Expect(tmpFirstEvent.Message).to.be.a('string');
								Expect(tmpFirstEvent.Verbosity).to.be.a('number');

								// TaskStart and TaskComplete should be verbosity 0
								let tmpStartEvents = pContext.EventLog.filter(function(pE) { return pE.EventName === 'TaskStart'; });
								let tmpCompleteEvents = pContext.EventLog.filter(function(pE) { return pE.EventName === 'TaskComplete'; });

								Expect(tmpStartEvents.length).to.be.greaterThan(0);
								Expect(tmpCompleteEvents.length).to.be.greaterThan(0);

								for (let i = 0; i < tmpStartEvents.length; i++)
								{
									Expect(tmpStartEvents[i].Verbosity).to.equal(0);
								}
								for (let i = 0; i < tmpCompleteEvents.length; i++)
								{
									Expect(tmpCompleteEvents[i].Verbosity).to.equal(0);
								}

								fDone();
							});
					}
				);

				test
				(
					'TimingSummary should be computed on finalize.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

						let tmpOperation = {
							Hash: 'summary-test-op',
							Name: 'Summary Test',
							Graph: {
								Nodes: [
									{ Hash: 'start-1', Type: 'start', Ports: [{ Hash: 'start-1-eo-Begin', Label: 'Begin' }] },
									{
										Hash: 'set-1', Type: 'set-value', DefinitionHash: 'set-value',
										Settings: { Value: 1, ToAddress: 'State.A' },
										Ports: [
											{ Hash: 'set-1-ei-Trigger', Label: 'Trigger' },
											{ Hash: 'set-1-eo-Complete', Label: 'Complete' }
										]
									},
									{
										Hash: 'set-2', Type: 'set-value', DefinitionHash: 'set-value',
										Settings: { Value: 2, ToAddress: 'State.B' },
										Ports: [
											{ Hash: 'set-2-ei-Trigger', Label: 'Trigger' },
											{ Hash: 'set-2-eo-Complete', Label: 'Complete' }
										]
									},
									{ Hash: 'end-1', Type: 'end', Ports: [{ Hash: 'end-1-ei-Finish', Label: 'Finish' }] }
								],
								Connections: [
									{ SourceNodeHash: 'start-1', SourcePortHash: 'start-1-eo-Begin', TargetNodeHash: 'set-1', TargetPortHash: 'set-1-ei-Trigger', ConnectionType: 'Event' },
									{ SourceNodeHash: 'set-1', SourcePortHash: 'set-1-eo-Complete', TargetNodeHash: 'set-2', TargetPortHash: 'set-2-ei-Trigger', ConnectionType: 'Event' },
									{ SourceNodeHash: 'set-2', SourcePortHash: 'set-2-eo-Complete', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' }
								]
							}
						};

						tmpEngine.executeOperation(tmpOperation,
							function (pError, pContext)
							{
								Expect(pError).to.equal(null);

								// Verify TimingSummary exists
								Expect(pContext.TimingSummary).to.be.an('object');
								Expect(pContext.TimingSummary.ByCategory).to.be.an('object');
								Expect(pContext.TimingSummary.ByTaskType).to.be.an('object');
								Expect(pContext.TimingSummary.Timeline).to.be.an('array');

								// ByTaskType should have set-value
								Expect(pContext.TimingSummary.ByTaskType['set-value']).to.not.equal(undefined);
								Expect(pContext.TimingSummary.ByTaskType['set-value'].Count).to.equal(2);
								Expect(pContext.TimingSummary.ByTaskType['set-value'].Name).to.equal('Set Value');
								Expect(pContext.TimingSummary.ByTaskType['set-value'].TotalMs).to.be.a('number');
								Expect(pContext.TimingSummary.ByTaskType['set-value'].MinMs).to.be.a('number');
								Expect(pContext.TimingSummary.ByTaskType['set-value'].MaxMs).to.be.a('number');
								Expect(pContext.TimingSummary.ByTaskType['set-value'].AvgMs).to.be.a('number');

								// Timeline should have entries
								Expect(pContext.TimingSummary.Timeline.length).to.equal(2);
								let tmpTimelineEntry = pContext.TimingSummary.Timeline[0];
								Expect(tmpTimelineEntry.NodeHash).to.be.a('string');
								Expect(tmpTimelineEntry.DefinitionHash).to.equal('set-value');
								Expect(tmpTimelineEntry.Name).to.equal('Set Value');
								Expect(tmpTimelineEntry.ElapsedMs).to.be.a('number');
								Expect(tmpTimelineEntry.StartTimeMs).to.be.a('number');

								// ByCategory should have the data category
								let tmpCategoryKeys = Object.keys(pContext.TimingSummary.ByCategory);
								Expect(tmpCategoryKeys.length).to.be.greaterThan(0);
								let tmpFirstCat = pContext.TimingSummary.ByCategory[tmpCategoryKeys[0]];
								Expect(tmpFirstCat.Count).to.be.a('number');
								Expect(tmpFirstCat.TotalMs).to.be.a('number');

								// ByCapability should have Data Transform
								Expect(pContext.TimingSummary.ByCapability).to.be.an('object');
								let tmpCapabilityKeys = Object.keys(pContext.TimingSummary.ByCapability);
								Expect(tmpCapabilityKeys.length).to.be.greaterThan(0);
								Expect(pContext.TimingSummary.ByCapability['Data Transform']).to.not.equal(undefined);
								Expect(pContext.TimingSummary.ByCapability['Data Transform'].Count).to.equal(2);

								// Timeline entries should include Capability
								Expect(pContext.TimingSummary.Timeline[0].Capability).to.be.a('string');

								fDone();
							});
					}
				);
			}
		);
	}
);

suite
	(
		'Operation Library',
		function ()
		{
			let tmpLibraryPath = libPath.resolve(__dirname, '..', 'operation-library');

			test
				(
					'Library folder should contain JSON files',
					function (fDone)
					{
						let tmpFiles = libFS.readdirSync(tmpLibraryPath);
						let tmpJsonFiles = tmpFiles.filter(function (pFile) { return pFile.endsWith('.json'); });

						Expect(tmpJsonFiles.length).to.equal(23);
						// Original three
						Expect(tmpJsonFiles).to.include('file-search-replace.json');
						Expect(tmpJsonFiles).to.include('config-processor.json');
						Expect(tmpJsonFiles).to.include('template-processor.json');
						// Sample of new additions
						Expect(tmpJsonFiles).to.include('simple-echo.json');
						Expect(tmpJsonFiles).to.include('git-status-report.json');
						Expect(tmpJsonFiles).to.include('api-data-pipeline.json');
						Expect(tmpJsonFiles).to.include('npm-project-validator.json');
						Expect(tmpJsonFiles).to.include('text-sanitizer.json');

						fDone();
					}
				);

			test
				(
					'Library JSON files should have valid operation format',
					function (fDone)
					{
						let tmpFiles = libFS.readdirSync(tmpLibraryPath);
						let tmpJsonFiles = tmpFiles.filter(function (pFile) { return pFile.endsWith('.json'); });

						for (let i = 0; i < tmpJsonFiles.length; i++)
						{
							let tmpFilePath = libPath.join(tmpLibraryPath, tmpJsonFiles[i]);
							let tmpContent = libFS.readFileSync(tmpFilePath, 'utf8');
							let tmpOperation = JSON.parse(tmpContent);

							// Required fields
							Expect(tmpOperation.Name).to.be.a('string');
							Expect(tmpOperation.Name.length).to.be.greaterThan(0);
							Expect(tmpOperation.Graph).to.be.an('object');
							Expect(tmpOperation.Graph.Nodes).to.be.an('array');
							Expect(tmpOperation.Graph.Nodes.length).to.be.greaterThan(0);
							Expect(tmpOperation.Graph.Connections).to.be.an('array');
							Expect(tmpOperation.Graph.ViewState).to.be.an('object');

							// Metadata fields
							Expect(tmpOperation.Description).to.be.a('string');
							Expect(tmpOperation.Tags).to.be.an('array');
							Expect(tmpOperation.Author).to.be.a('string');
							Expect(tmpOperation.Version).to.be.a('string');

							// Node structure validation
							for (let j = 0; j < tmpOperation.Graph.Nodes.length; j++)
							{
								let tmpNode = tmpOperation.Graph.Nodes[j];
								Expect(tmpNode.Hash).to.be.a('string');
								Expect(tmpNode.Type).to.be.a('string');
								Expect(tmpNode.Ports).to.be.an('array');
								Expect(tmpNode.Data).to.be.an('object');
							}

							// Connection structure validation
							for (let k = 0; k < tmpOperation.Graph.Connections.length; k++)
							{
								let tmpConn = tmpOperation.Graph.Connections[k];
								Expect(tmpConn.Hash).to.be.a('string');
								Expect(tmpConn.SourceNodeHash).to.be.a('string');
								Expect(tmpConn.TargetNodeHash).to.be.a('string');
							}
						}

						fDone();
					}
				);

			test
				(
					'File Search & Replace should have expected nodes',
					function (fDone)
					{
						let tmpFilePath = libPath.join(tmpLibraryPath, 'file-search-replace.json');
						let tmpOperation = JSON.parse(libFS.readFileSync(tmpFilePath, 'utf8'));

						Expect(tmpOperation.Name).to.equal('File Search & Replace');
						Expect(tmpOperation.Graph.Nodes.length).to.equal(9);
						Expect(tmpOperation.Graph.Connections.length).to.equal(15);

						// Verify it has Start and End nodes
						let tmpNodeTypes = tmpOperation.Graph.Nodes.map(function (pNode) { return pNode.Type; });
						Expect(tmpNodeTypes).to.include('start');
						Expect(tmpNodeTypes).to.include('end');
						Expect(tmpNodeTypes).to.include('split-execute');
						Expect(tmpNodeTypes).to.include('value-input');

						fDone();
					}
				);

			test
				(
					'Import from library should produce valid operation data',
					function (fDone)
					{
						// Read a library operation
						let tmpFilePath = libPath.join(tmpLibraryPath, 'config-processor.json');
						let tmpLibOp = JSON.parse(libFS.readFileSync(tmpFilePath, 'utf8'));

						// Simulate import: strip metadata, keep operation fields
						let tmpImportData =
						{
							Name: tmpLibOp.Name,
							Description: tmpLibOp.Description,
							Graph: tmpLibOp.Graph
						};

						// Verify import data has correct structure for updateOperation
						Expect(tmpImportData.Name).to.equal('Config File Processor');
						Expect(tmpImportData.Description).to.be.a('string');
						Expect(tmpImportData.Description.length).to.be.greaterThan(0);
						Expect(tmpImportData.Graph).to.be.an('object');
						Expect(tmpImportData.Graph.Nodes).to.be.an('array');
						Expect(tmpImportData.Graph.Nodes.length).to.equal(7);
						Expect(tmpImportData.Graph.Connections).to.be.an('array');
						Expect(tmpImportData.Graph.Connections.length).to.equal(12);

						// Verify no library-only metadata leaked through
						Expect(tmpImportData.Tags).to.be.undefined;
						Expect(tmpImportData.Author).to.be.undefined;
						Expect(tmpImportData.Version).to.be.undefined;
						Expect(tmpImportData.Hash).to.be.undefined;

						fDone();
					}
				);

			test
				(
					'Export format should contain required fields',
					function (fDone)
					{
						// Simulate a stored operation
						let tmpOperation =
						{
							Hash: 'OPR-0001',
							Name: 'Export Test Op',
							Description: 'Testing export format',
							Graph:
							{
								Nodes: [{ Hash: 'n1', Type: 'start', X: 0, Y: 0, Width: 100, Height: 80, Title: 'Start', Ports: [], Data: {} }],
								Connections: [],
								ViewState: { PanX: 0, PanY: 0, Zoom: 1 }
							},
							CreatedAt: '2026-01-01T00:00:00.000Z',
							UpdatedAt: '2026-01-01T00:00:00.000Z'
						};

						// Build the export object (same logic as the /Operation/:Hash/Export endpoint)
						let tmpExport =
						{
							Hash: tmpOperation.Hash,
							Name: tmpOperation.Name || '',
							Description: tmpOperation.Description || '',
							Graph: tmpOperation.Graph || { Nodes: [], Connections: [], ViewState: {} },
							SavedLayouts: tmpOperation.SavedLayouts || [],
							InitialGlobalState: tmpOperation.InitialGlobalState || {},
							InitialOperationState: tmpOperation.InitialOperationState || {},
							ExportedAt: new Date().toISOString()
						};

						Expect(tmpExport.Hash).to.equal('OPR-0001');
						Expect(tmpExport.Name).to.equal('Export Test Op');
						Expect(tmpExport.Description).to.equal('Testing export format');
						Expect(tmpExport.Graph.Nodes).to.be.an('array');
						Expect(tmpExport.Graph.Nodes.length).to.equal(1);
						Expect(tmpExport.SavedLayouts).to.be.an('array');
						Expect(tmpExport.InitialGlobalState).to.be.an('object');
						Expect(tmpExport.InitialOperationState).to.be.an('object');
						Expect(tmpExport.ExportedAt).to.be.a('string');

						// Internal fields should not leak into export
						Expect(tmpExport.CreatedAt).to.be.undefined;
						Expect(tmpExport.UpdatedAt).to.be.undefined;

						// Export should round-trip as valid JSON
						let tmpJsonString = JSON.stringify(tmpExport, null, '\t');
						let tmpParsed = JSON.parse(tmpJsonString);
						Expect(tmpParsed.Name).to.equal('Export Test Op');
						Expect(tmpParsed.Graph.Nodes.length).to.equal(1);

						fDone();
					}
				);

			test
				(
					'Directory traversal should be prevented',
					function (fDone)
					{
						// Verify our path safety logic
						let tmpBadNames = ['../../../etc/passwd', '..\\..\\etc\\passwd', 'foo/../bar.json', 'test/bad.json'];

						for (let i = 0; i < tmpBadNames.length; i++)
						{
							let tmpFileName = tmpBadNames[i];
							let tmpIsValid = tmpFileName.endsWith('.json') &&
								tmpFileName.indexOf('/') < 0 &&
								tmpFileName.indexOf('\\') < 0 &&
								tmpFileName.indexOf('..') < 0;
							Expect(tmpIsValid).to.be.false;
						}

						// Verify good names pass
						let tmpGoodNames = ['file-search-replace.json', 'config-processor.json', 'my-operation.json'];
						for (let i = 0; i < tmpGoodNames.length; i++)
						{
							let tmpFileName = tmpGoodNames[i];
							let tmpIsValid = tmpFileName.endsWith('.json') &&
								tmpFileName.indexOf('/') < 0 &&
								tmpFileName.indexOf('\\') < 0 &&
								tmpFileName.indexOf('..') < 0;
							Expect(tmpIsValid).to.be.true;
						}

						fDone();
					}
				);
		}
	);

		// ================================================================
		// Schedule System Tests
		// ================================================================

		suite
		(
			'HypervisorEventBase',
			function()
			{
				test
				(
					'Active state should default to false.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpEventBase = Object.values(tmpFable.servicesMap['UltravisorHypervisorEventBase'])[0];

						Expect(tmpEventBase.active).to.equal(false);
					}
				);

				test
				(
					'start() should set active to true.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpEventBase = Object.values(tmpFable.servicesMap['UltravisorHypervisorEventBase'])[0];

						tmpEventBase.start({}, function() {});
						Expect(tmpEventBase.active).to.equal(true);
					}
				);

				test
				(
					'stop() should set active back to false.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpEventBase = Object.values(tmpFable.servicesMap['UltravisorHypervisorEventBase'])[0];

						tmpEventBase.start({}, function() {});
						Expect(tmpEventBase.active).to.equal(true);
						tmpEventBase.stop();
						Expect(tmpEventBase.active).to.equal(false);
					}
				);
			}
		);

		suite
		(
			'HypervisorEventCron',
			function()
			{
				test
				(
					'jobCount should start at 0.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpCron = Object.values(tmpFable.servicesMap['UltravisorHypervisorEventCron'])[0];

						Expect(tmpCron.jobCount).to.equal(0);
					}
				);

				test
				(
					'start() should create a cron job and increment jobCount.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpCron = Object.values(tmpFable.servicesMap['UltravisorHypervisorEventCron'])[0];

						// Use a yearly expression so it never fires during the test
						let tmpEntry = { GUID: 'test-job-1', CronExpression: '0 0 1 1 *' };
						tmpCron.start(tmpEntry, function() {});

						Expect(tmpCron.jobCount).to.equal(1);

						// Cleanup
						tmpCron.stop();
					}
				);

				test
				(
					'stopJob() should remove a specific job.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpCron = Object.values(tmpFable.servicesMap['UltravisorHypervisorEventCron'])[0];

						tmpCron.start({ GUID: 'job-a', CronExpression: '0 0 1 1 *' }, function() {});
						tmpCron.start({ GUID: 'job-b', CronExpression: '0 0 1 1 *' }, function() {});

						Expect(tmpCron.jobCount).to.equal(2);

						tmpCron.stopJob('job-a');
						Expect(tmpCron.jobCount).to.equal(1);

						// Cleanup
						tmpCron.stop();
					}
				);

				test
				(
					'stop() should remove all jobs.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpCron = Object.values(tmpFable.servicesMap['UltravisorHypervisorEventCron'])[0];

						tmpCron.start({ GUID: 'job-1', CronExpression: '0 0 1 1 *' }, function() {});
						tmpCron.start({ GUID: 'job-2', CronExpression: '0 0 1 1 *' }, function() {});
						tmpCron.start({ GUID: 'job-3', CronExpression: '0 0 1 1 *' }, function() {});

						Expect(tmpCron.jobCount).to.equal(3);

						tmpCron.stop();
						Expect(tmpCron.jobCount).to.equal(0);
					}
				);

				test
				(
					'Invalid cron expression should be handled gracefully.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpCron = Object.values(tmpFable.servicesMap['UltravisorHypervisorEventCron'])[0];

						// Should not throw
						tmpCron.start({ GUID: 'bad-job', CronExpression: 'not-a-cron-expression' }, function() {});

						// Job should not have been added (creation failed)
						Expect(tmpCron.jobCount).to.equal(0);

						tmpCron.stop();
					}
				);

				test
				(
					'Cron tick should fire the callback.',
					function(fDone)
					{
						this.timeout(4000);

						let tmpFable = createTestFable();
						let tmpCron = Object.values(tmpFable.servicesMap['UltravisorHypervisorEventCron'])[0];

						let tmpTickCount = 0;

						// Use 6-field cron syntax (cron v4): fire every second
						tmpCron.start(
							{ GUID: 'fast-job', CronExpression: '*/1 * * * * *' },
							function(pEntry)
							{
								tmpTickCount++;

								if (tmpTickCount >= 1)
								{
									tmpCron.stop();
									Expect(pEntry.GUID).to.equal('fast-job');
									Expect(tmpTickCount).to.be.greaterThan(0);
									fDone();
								}
							});
					}
				);
			}
		);

		suite
		(
			'HypervisorState',
			function()
			{
				test
				(
					'generateOperationHash() should produce sequential hashes.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpState = Object.values(tmpFable.servicesMap['UltravisorHypervisorState'])[0];

						let tmpHash1 = tmpState.generateOperationHash();
						let tmpHash2 = tmpState.generateOperationHash();

						Expect(tmpHash1).to.match(/^OPR-\d{4}$/);
						Expect(tmpHash2).to.match(/^OPR-\d{4}$/);

						// Second hash should have a higher number than the first
						let tmpNum1 = parseInt(tmpHash1.split('-')[1], 10);
						let tmpNum2 = parseInt(tmpHash2.split('-')[1], 10);
						Expect(tmpNum2).to.equal(tmpNum1 + 1);
					}
				);

				test
				(
					'generateTemplateHash() should produce type-based sequential hashes.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpState = Object.values(tmpFable.servicesMap['UltravisorHypervisorState'])[0];

						let tmpHash1 = tmpState.generateTemplateHash('read-file');
						let tmpHash2 = tmpState.generateTemplateHash('read-file');
						let tmpHash3 = tmpState.generateTemplateHash('write-file');

						Expect(tmpHash1).to.match(/^TMPL-READFILE-\d{3}$/);
						Expect(tmpHash2).to.match(/^TMPL-READFILE-\d{3}$/);
						Expect(tmpHash3).to.match(/^TMPL-WRITEFILE-\d{3}$/);
					}
				);

				test
				(
					'Operation CRUD: create, get, list, update, delete.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpState = Object.values(tmpFable.servicesMap['UltravisorHypervisorState'])[0];

						// Create without hash (auto-generated)
						tmpState.updateOperation(
							{ Name: 'Test Op', Description: 'A test operation' },
							function(pError, pOp)
							{
								Expect(pError).to.equal(null);
								Expect(pOp.Hash).to.match(/^OPR-/);
								Expect(pOp.Name).to.equal('Test Op');
								Expect(pOp.Graph).to.be.an('object');
								Expect(pOp.CreatedAt).to.be.a('string');

								let tmpHash = pOp.Hash;

								// Get
								tmpState.getOperation(tmpHash,
									function(pError2, pOp2)
									{
										Expect(pError2).to.equal(null);
										Expect(pOp2.Name).to.equal('Test Op');

										// Update
										tmpState.updateOperation(
											{ Hash: tmpHash, Name: 'Updated Op' },
											function(pError3, pOp3)
											{
												Expect(pError3).to.equal(null);
												Expect(pOp3.Name).to.equal('Updated Op');
												Expect(pOp3.UpdatedAt).to.be.a('string');

												// List
												tmpState.getOperationList(
													function(pError4, pList)
													{
														Expect(pError4).to.equal(null);
														Expect(pList.length).to.be.greaterThan(0);

														let tmpFound = pList.find(function(o) { return o.Hash === tmpHash; });
														Expect(tmpFound).to.not.equal(undefined);

														// Delete
														tmpState.deleteOperation(tmpHash,
															function(pError5, pResult)
															{
																Expect(pError5).to.equal(null);
																Expect(pResult).to.equal(true);

																// Verify deleted
																tmpState.getOperation(tmpHash,
																	function(pError6)
																	{
																		Expect(pError6).to.not.equal(null);
																		fDone();
																	});
															});
													});
											});
									});
							});
					}
				);

				test
				(
					'Node Template CRUD: create, get, list, delete.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpState = Object.values(tmpFable.servicesMap['UltravisorHypervisorState'])[0];

						// Create without hash (auto-generated from Type)
						tmpState.updateNodeTemplate(
							{ Type: 'read-file', Name: 'My Reader', Settings: { Encoding: 'utf8' } },
							function(pError, pTmpl)
							{
								Expect(pError).to.equal(null);
								Expect(pTmpl.Hash).to.match(/^TMPL-READFILE-/);
								Expect(pTmpl.Name).to.equal('My Reader');

								let tmpHash = pTmpl.Hash;

								// Get
								tmpState.getNodeTemplate(tmpHash,
									function(pError2, pTmpl2)
									{
										Expect(pError2).to.equal(null);
										Expect(pTmpl2.Settings.Encoding).to.equal('utf8');

										// List
										tmpState.getNodeTemplateList(
											function(pError3, pList)
											{
												Expect(pError3).to.equal(null);
												Expect(pList.length).to.be.greaterThan(0);

												// Delete
												tmpState.deleteNodeTemplate(tmpHash,
													function(pError4, pResult)
													{
														Expect(pError4).to.equal(null);
														Expect(pResult).to.equal(true);

														// Verify deleted
														tmpState.getNodeTemplate(tmpHash,
															function(pError5)
															{
																Expect(pError5).to.not.equal(null);
																fDone();
															});
													});
											});
									});
							});
					}
				);

				test
				(
					'Global state: get and update.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpState = Object.values(tmpFable.servicesMap['UltravisorHypervisorState'])[0];

						// Initial global state should be empty (or whatever was loaded)
						let tmpGlobal = tmpState.getGlobalState();
						Expect(tmpGlobal).to.be.an('object');

						// Update global state
						tmpState.updateGlobalState({ Counter: 42, AppName: 'TestApp' });

						let tmpUpdated = tmpState.getGlobalState();
						Expect(tmpUpdated.Counter).to.equal(42);
						Expect(tmpUpdated.AppName).to.equal('TestApp');

						// Returned object should be a copy (not a reference)
						tmpUpdated.Counter = 999;
						Expect(tmpState.getGlobalState().Counter).to.equal(42);
					}
				);

				test
				(
					'Error cases: get nonexistent operation and template.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpState = Object.values(tmpFable.servicesMap['UltravisorHypervisorState'])[0];

						tmpState.getOperation('NONEXISTENT',
							function(pError)
							{
								Expect(pError).to.not.equal(null);
								Expect(pError.message).to.contain('not found');

								tmpState.deleteOperation('NONEXISTENT',
									function(pError2)
									{
										Expect(pError2).to.not.equal(null);

										tmpState.getNodeTemplate('NONEXISTENT',
											function(pError3)
											{
												Expect(pError3).to.not.equal(null);

												tmpState.deleteNodeTemplate('NONEXISTENT',
													function(pError4)
													{
														Expect(pError4).to.not.equal(null);
														fDone();
													});
											});
									});
							});
					}
				);

				test
				(
					'updateNodeTemplate with invalid input should return error.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpState = Object.values(tmpFable.servicesMap['UltravisorHypervisorState'])[0];

						tmpState.updateNodeTemplate(null,
							function(pError)
							{
								Expect(pError).to.not.equal(null);
								Expect(pError.message).to.contain('valid object');

								tmpState.updateOperation(null,
									function(pError2)
									{
										Expect(pError2).to.not.equal(null);
										Expect(pError2.message).to.contain('valid object');
										fDone();
									});
							});
					}
				);
			}
		);

		suite
		(
			'Hypervisor Schedule',
			function()
			{
				test
				(
					'getSchedule() should start empty.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpHypervisor = Object.values(tmpFable.servicesMap['UltravisorHypervisor'])[0];

						Expect(tmpHypervisor.getSchedule()).to.be.an('array');
						Expect(tmpHypervisor.getSchedule().length).to.equal(0);
					}
				);

				test
				(
					'scheduleOperation() should create a valid schedule entry.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpHypervisor = Object.values(tmpFable.servicesMap['UltravisorHypervisor'])[0];

						tmpHypervisor.scheduleOperation('OPR-0001', 'cron', '30 2 * * 1',
							function(pError, pEntry)
							{
								Expect(pError).to.equal(null);
								Expect(pEntry).to.be.an('object');
								Expect(pEntry.GUID).to.contain('sched-op-OPR-0001');
								Expect(pEntry.TargetType).to.equal('Operation');
								Expect(pEntry.TargetHash).to.equal('OPR-0001');
								Expect(pEntry.ScheduleType).to.equal('cron');
								Expect(pEntry.CronExpression).to.equal('30 2 * * 1');
								Expect(pEntry.Active).to.equal(false);
								Expect(pEntry.CreatedAt).to.be.a('string');

								Expect(tmpHypervisor.getSchedule().length).to.equal(1);

								fDone();
							});
					}
				);

				test
				(
					'_resolveScheduleExpression() should resolve schedule types correctly.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpHypervisor = Object.values(tmpFable.servicesMap['UltravisorHypervisor'])[0];

						Expect(tmpHypervisor._resolveScheduleExpression('daily', null)).to.equal('0 0 * * *');
						Expect(tmpHypervisor._resolveScheduleExpression('hourly', null)).to.equal('0 * * * *');
						Expect(tmpHypervisor._resolveScheduleExpression('cron', '30 2 * * 1')).to.equal('30 2 * * 1');
						Expect(tmpHypervisor._resolveScheduleExpression('daily', '30 8 * * *')).to.equal('30 8 * * *');

						// Default fallback
						Expect(tmpHypervisor._resolveScheduleExpression(null, null)).to.equal('0 * * * *');
					}
				);

				test
				(
					'startSchedule() should activate entries and start cron jobs.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpHypervisor = Object.values(tmpFable.servicesMap['UltravisorHypervisor'])[0];
						let tmpCron = Object.values(tmpFable.servicesMap['UltravisorHypervisorEventCron'])[0];

						// Schedule a non-firing operation (yearly cron)
						tmpHypervisor.scheduleOperation('OPR-0001', 'cron', '0 0 1 1 *',
							function(pError, pEntry)
							{
								Expect(pEntry.Active).to.equal(false);

								tmpHypervisor.startSchedule(
									function()
									{
										Expect(pEntry.Active).to.equal(true);
										Expect(tmpCron.jobCount).to.equal(1);

										// Cleanup
										tmpHypervisor.stopSchedule();
										Expect(tmpCron.jobCount).to.equal(0);

										fDone();
									});
							});
					}
				);

				test
				(
					'stopSchedule() should deactivate all entries.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpHypervisor = Object.values(tmpFable.servicesMap['UltravisorHypervisor'])[0];
						let tmpCron = Object.values(tmpFable.servicesMap['UltravisorHypervisorEventCron'])[0];

						tmpHypervisor.scheduleOperation('OPR-A', 'cron', '0 0 1 1 *',
							function()
							{
								tmpHypervisor.scheduleOperation('OPR-B', 'cron', '0 0 1 1 *',
									function()
									{
										tmpHypervisor.startSchedule(
											function()
											{
												Expect(tmpCron.jobCount).to.equal(2);

												let tmpSchedule = tmpHypervisor.getSchedule();
												Expect(tmpSchedule[0].Active).to.equal(true);
												Expect(tmpSchedule[1].Active).to.equal(true);

												tmpHypervisor.stopSchedule(
													function()
													{
														Expect(tmpSchedule[0].Active).to.equal(false);
														Expect(tmpSchedule[1].Active).to.equal(false);
														Expect(tmpCron.jobCount).to.equal(0);

														fDone();
													});
											});
									});
							});
					}
				);

				test
				(
					'removeScheduleEntry() should remove by GUID.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpHypervisor = Object.values(tmpFable.servicesMap['UltravisorHypervisor'])[0];

						tmpHypervisor.scheduleOperation('OPR-0001', 'cron', '0 0 1 1 *',
							function(pError, pEntry)
							{
								Expect(tmpHypervisor.getSchedule().length).to.equal(1);

								tmpHypervisor.removeScheduleEntry(pEntry.GUID,
									function(pError2, pResult)
									{
										Expect(pError2).to.equal(null);
										Expect(pResult).to.equal(true);
										Expect(tmpHypervisor.getSchedule().length).to.equal(0);

										fDone();
									});
							});
					}
				);

				test
				(
					'removeScheduleEntry() for nonexistent GUID should return error.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpHypervisor = Object.values(tmpFable.servicesMap['UltravisorHypervisor'])[0];

						tmpHypervisor.removeScheduleEntry('nonexistent-guid',
							function(pError)
							{
								Expect(pError).to.not.equal(null);
								Expect(pError.message).to.contain('not found');
								fDone();
							});
					}
				);

				test
				(
					'startSchedule() should skip already-active entries.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpHypervisor = Object.values(tmpFable.servicesMap['UltravisorHypervisor'])[0];
						let tmpCron = Object.values(tmpFable.servicesMap['UltravisorHypervisorEventCron'])[0];

						tmpHypervisor.scheduleOperation('OPR-0001', 'cron', '0 0 1 1 *',
							function()
							{
								tmpHypervisor.startSchedule(
									function()
									{
										Expect(tmpCron.jobCount).to.equal(1);

										// Start again — should not duplicate
										tmpHypervisor.startSchedule(
											function()
											{
												Expect(tmpCron.jobCount).to.equal(1);

												tmpHypervisor.stopSchedule();
												fDone();
											});
									});
							});
					}
				);
			}
		);

		suite
		(
			'Hypervisor End-to-End Schedule',
			function()
			{
				test
				(
					'Scheduled operation should execute when cron fires.',
					function(fDone)
					{
						this.timeout(5000);

						let tmpFable = createTestFable();
						let tmpHypervisor = Object.values(tmpFable.servicesMap['UltravisorHypervisor'])[0];
						let tmpState = Object.values(tmpFable.servicesMap['UltravisorHypervisorState'])[0];
						let tmpManifest = Object.values(tmpFable.servicesMap['UltravisorExecutionManifest'])[0];

						// Create a simple operation in the state store
						let tmpOperation = {
							Hash: 'OPR-SCHED-TEST',
							Name: 'Scheduled Test Op',
							Graph:
							{
								Nodes:
								[
									{ Hash: 'node-start', Type: 'start', X: 0, Y: 0 },
									{
										Hash: 'node-set',
										Type: 'set-value',
										DefinitionHash: 'set-value',
										Name: 'Set Test Value',
										Settings:
										{
											Value: 'scheduled-run',
											ToAddress: 'Operation.Marker'
										},
										Ports: [],
										X: 200, Y: 0
									},
									{ Hash: 'node-end', Type: 'end', X: 400, Y: 0 }
								],
								Connections:
								[
									{
										Hash: 'conn-1',
										ConnectionType: 'Event',
										SourceNodeHash: 'node-start',
										SourcePortHash: 'node-start-eo-Start',
										TargetNodeHash: 'node-set',
										TargetPortHash: 'node-set-ei-Execute'
									},
									{
										Hash: 'conn-2',
										ConnectionType: 'Event',
										SourceNodeHash: 'node-set',
										SourcePortHash: 'node-set-eo-Complete',
										TargetNodeHash: 'node-end',
										TargetPortHash: 'node-end-ei-End'
									}
								],
								ViewState: {}
							}
						};

						// Store the operation so Hypervisor can find it
						tmpState.updateOperation(tmpOperation,
							function(pError)
							{
								Expect(pError).to.equal(null);

								// Schedule it with a fast-firing cron
								tmpHypervisor.scheduleOperation('OPR-SCHED-TEST', 'cron', '*/1 * * * * *',
									function(pError2)
									{
										Expect(pError2).to.equal(null);

										// Start the schedule
										tmpHypervisor.startSchedule(
											function()
											{
												// Wait for at least one tick and execution
												setTimeout(
													function()
													{
														tmpHypervisor.stopSchedule();

														// Check that at least one run was recorded
														let tmpRuns = tmpManifest.listRuns();
														let tmpScheduledRuns = tmpRuns.filter(
															function(r) { return r.OperationHash === 'OPR-SCHED-TEST'; });

														Expect(tmpScheduledRuns.length).to.be.greaterThan(0);
														Expect(tmpScheduledRuns[0].Status).to.equal('Complete');

														fDone();
													}, 2500);
											});
									});
							});
					}
				);
			}
		);

		// ================================================================
		// Schedule Persistence Tests
		// ================================================================

		suite
		(
			'Schedule Persistence Base',
			function()
			{
				test
				(
					'Service type should be set correctly.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpBase = Object.values(tmpFable.servicesMap['UltravisorSchedulePersistenceBase'])[0];

						Expect(tmpBase.serviceType).to.equal('UltravisorSchedulePersistenceBase');
					}
				);

				test
				(
					'loadSchedule() should return not-implemented error.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpBase = Object.values(tmpFable.servicesMap['UltravisorSchedulePersistenceBase'])[0];

						tmpBase.loadSchedule(
							function(pError)
							{
								Expect(pError).to.be.an.instanceof(Error);
								Expect(pError.message).to.contain('not implemented');
								fDone();
							});
					}
				);

				test
				(
					'saveSchedule() should return not-implemented error.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpBase = Object.values(tmpFable.servicesMap['UltravisorSchedulePersistenceBase'])[0];

						tmpBase.saveSchedule([],
							function(pError)
							{
								Expect(pError).to.be.an.instanceof(Error);
								Expect(pError.message).to.contain('not implemented');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Schedule Persistence JSONFile',
			function()
			{
				let tmpPersistenceTestPath;

				setup(function()
				{
					if (!libFS.existsSync(TEST_STAGING_ROOT))
					{
						libFS.mkdirSync(TEST_STAGING_ROOT, { recursive: true });
					}
					tmpPersistenceTestPath = libPath.resolve(TEST_STAGING_ROOT, '.ultravisor-persist-test.json');
					// Clean up any leftover file
					if (libFS.existsSync(tmpPersistenceTestPath))
					{
						libFS.unlinkSync(tmpPersistenceTestPath);
					}
				});

				teardown(function()
				{
					if (libFS.existsSync(tmpPersistenceTestPath))
					{
						libFS.unlinkSync(tmpPersistenceTestPath);
					}
				});

				/**
				 * Helper: create a fable configured so the JSONFile provider
				 * resolves to tmpPersistenceTestPath.
				 */
				function createPersistenceFable()
				{
					let tmpFable = createTestFable();

					// Point the config path to our test file
					tmpFable.settings.ProgramConfigurationFileName = tmpPersistenceTestPath;

					return tmpFable;
				}

				test
				(
					'loadSchedule() should return empty array when no file exists.',
					function(fDone)
					{
						let tmpFable = createPersistenceFable();
						let tmpProvider = Object.values(tmpFable.servicesMap['UltravisorSchedulePersistence'])[0];

						tmpProvider.loadSchedule(
							function(pError, pSchedule)
							{
								Expect(pError).to.equal(null);
								Expect(pSchedule).to.be.an('array');
								Expect(pSchedule.length).to.equal(0);
								fDone();
							});
					}
				);

				test
				(
					'saveSchedule() and loadSchedule() should round-trip a schedule.',
					function(fDone)
					{
						let tmpFable = createPersistenceFable();
						let tmpProvider = Object.values(tmpFable.servicesMap['UltravisorSchedulePersistence'])[0];

						let tmpSchedule = [
							{
								GUID: 'test-persist-1',
								TargetType: 'Operation',
								TargetHash: 'OPR-0001',
								ScheduleType: 'daily',
								CronExpression: '0 0 * * *',
								Active: false,
								CreatedAt: '2026-01-01T00:00:00.000Z'
							},
							{
								GUID: 'test-persist-2',
								TargetType: 'Operation',
								TargetHash: 'OPR-0002',
								ScheduleType: 'cron',
								CronExpression: '30 8 * * 1-5',
								Active: false,
								CreatedAt: '2026-01-02T00:00:00.000Z'
							}
						];

						tmpProvider.saveSchedule(tmpSchedule,
							function(pSaveError)
							{
								Expect(pSaveError).to.equal(null);

								// Now load it back
								tmpProvider.loadSchedule(
									function(pLoadError, pLoaded)
									{
										Expect(pLoadError).to.equal(null);
										Expect(pLoaded).to.be.an('array');
										Expect(pLoaded.length).to.equal(2);
										Expect(pLoaded[0].GUID).to.equal('test-persist-1');
										Expect(pLoaded[1].CronExpression).to.equal('30 8 * * 1-5');
										fDone();
									});
							});
					}
				);

				test
				(
					'Schedule data should coexist with other config keys.',
					function(fDone)
					{
						let tmpFable = createPersistenceFable();
						let tmpProvider = Object.values(tmpFable.servicesMap['UltravisorSchedulePersistence'])[0];

						// Write some pre-existing config data
						libFS.writeFileSync(tmpPersistenceTestPath, JSON.stringify(
						{
							Operations: { 'OPR-0001': { Name: 'Test Op' } },
							GlobalState: { Marker: 'keep-me' }
						}, null, '\t'), 'utf8');

						let tmpSchedule = [{ GUID: 'test-coexist', TargetHash: 'OPR-0001' }];

						tmpProvider.saveSchedule(tmpSchedule,
							function(pSaveError)
							{
								Expect(pSaveError).to.equal(null);

								// Read the raw file to verify other keys survived
								let tmpRaw = JSON.parse(libFS.readFileSync(tmpPersistenceTestPath, 'utf8'));
								Expect(tmpRaw.Operations['OPR-0001'].Name).to.equal('Test Op');
								Expect(tmpRaw.GlobalState.Marker).to.equal('keep-me');
								Expect(tmpRaw.Schedule).to.be.an('array');
								Expect(tmpRaw.Schedule.length).to.equal(1);
								fDone();
							});
					}
				);

				test
				(
					'Persisted data should survive across fresh provider instances.',
					function(fDone)
					{
						let tmpFable1 = createPersistenceFable();
						let tmpProvider1 = Object.values(tmpFable1.servicesMap['UltravisorSchedulePersistence'])[0];

						let tmpSchedule = [{ GUID: 'survive-test', TargetHash: 'OPR-SURVIVE' }];

						tmpProvider1.saveSchedule(tmpSchedule,
							function(pSaveError)
							{
								Expect(pSaveError).to.equal(null);

								// Create an entirely new fable + provider
								let tmpFable2 = createPersistenceFable();
								let tmpProvider2 = Object.values(tmpFable2.servicesMap['UltravisorSchedulePersistence'])[0];

								tmpProvider2.loadSchedule(
									function(pLoadError, pLoaded)
									{
										Expect(pLoadError).to.equal(null);
										Expect(pLoaded.length).to.equal(1);
										Expect(pLoaded[0].GUID).to.equal('survive-test');
										Expect(pLoaded[0].TargetHash).to.equal('OPR-SURVIVE');
										fDone();
									});
							});
					}
				);
			}
		);

		suite
		(
			'Hypervisor Schedule Persistence Integration',
			function()
			{
				let tmpIntegrationTestPath;

				setup(function()
				{
					if (!libFS.existsSync(TEST_STAGING_ROOT))
					{
						libFS.mkdirSync(TEST_STAGING_ROOT, { recursive: true });
					}
					tmpIntegrationTestPath = libPath.resolve(TEST_STAGING_ROOT, '.ultravisor-integration-test.json');
					if (libFS.existsSync(tmpIntegrationTestPath))
					{
						libFS.unlinkSync(tmpIntegrationTestPath);
					}
				});

				teardown(function()
				{
					if (libFS.existsSync(tmpIntegrationTestPath))
					{
						libFS.unlinkSync(tmpIntegrationTestPath);
					}
				});

				function createIntegrationFable()
				{
					let tmpFable = createTestFable();
					tmpFable.settings.ProgramConfigurationFileName = tmpIntegrationTestPath;
					return tmpFable;
				}

				test
				(
					'scheduleOperation() should auto-persist the schedule.',
					function(fDone)
					{
						let tmpFable = createIntegrationFable();
						let tmpHypervisor = Object.values(tmpFable.servicesMap['UltravisorHypervisor'])[0];

						tmpHypervisor.scheduleOperation('OPR-AUTO-1', 'daily', null,
							function(pError, pEntry)
							{
								Expect(pError).to.equal(null);

								// Verify the file was written
								Expect(libFS.existsSync(tmpIntegrationTestPath)).to.equal(true);
								let tmpRaw = JSON.parse(libFS.readFileSync(tmpIntegrationTestPath, 'utf8'));
								Expect(tmpRaw.Schedule).to.be.an('array');
								Expect(tmpRaw.Schedule.length).to.equal(1);
								Expect(tmpRaw.Schedule[0].TargetHash).to.equal('OPR-AUTO-1');
								fDone();
							});
					}
				);

				test
				(
					'removeScheduleEntry() should auto-persist the updated schedule.',
					function(fDone)
					{
						let tmpFable = createIntegrationFable();
						let tmpHypervisor = Object.values(tmpFable.servicesMap['UltravisorHypervisor'])[0];

						tmpHypervisor.scheduleOperation('OPR-REMOVE-1', 'hourly', null,
							function(pError, pEntry)
							{
								Expect(pError).to.equal(null);

								let tmpGUID = pEntry.GUID;

								tmpHypervisor.removeScheduleEntry(tmpGUID,
									function(pRemoveError)
									{
										Expect(pRemoveError).to.equal(null);

										let tmpRaw = JSON.parse(libFS.readFileSync(tmpIntegrationTestPath, 'utf8'));
										Expect(tmpRaw.Schedule).to.be.an('array');
										Expect(tmpRaw.Schedule.length).to.equal(0);
										fDone();
									});
							});
					}
				);

				test
				(
					'loadSchedule() should populate _Schedule from persisted data.',
					function(fDone)
					{
						// First, persist a schedule via one fable instance
						let tmpFable1 = createIntegrationFable();
						let tmpHypervisor1 = Object.values(tmpFable1.servicesMap['UltravisorHypervisor'])[0];

						tmpHypervisor1.scheduleOperation('OPR-LOAD-1', 'cron', '15 3 * * *',
							function(pError)
							{
								Expect(pError).to.equal(null);

								// Create a fresh fable — its Hypervisor starts with empty _Schedule
								let tmpFable2 = createIntegrationFable();
								let tmpHypervisor2 = Object.values(tmpFable2.servicesMap['UltravisorHypervisor'])[0];

								Expect(tmpHypervisor2.getSchedule().length).to.equal(0);

								tmpHypervisor2.loadSchedule(
									function(pLoadError)
									{
										Expect(pLoadError).to.equal(null);
										Expect(tmpHypervisor2.getSchedule().length).to.equal(1);
										Expect(tmpHypervisor2.getSchedule()[0].TargetHash).to.equal('OPR-LOAD-1');
										Expect(tmpHypervisor2.getSchedule()[0].CronExpression).to.equal('15 3 * * *');
										fDone();
									});
							});
					}
				);
			}
		);

	// ============================================================
	// Beacon Coordinator
	// ============================================================
	suite
		(
			'Beacon Coordinator',
			function ()
			{
				test
					(
						'should register and list Beacons.',
						function ()
						{
							let tmpFable = createTestFable();
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];
							Expect(tmpCoordinator).to.not.equal(undefined);

							let tmpBeacon = tmpCoordinator.registerBeacon({
								Name: 'TestWorker',
								Capabilities: ['Shell', 'FileSystem'],
								MaxConcurrent: 2,
								Tags: { gpu: false }
							});

							Expect(tmpBeacon.BeaconID).to.be.a('string');
							Expect(tmpBeacon.BeaconID).to.contain('bcn-testworker-');
							Expect(tmpBeacon.Name).to.equal('TestWorker');
							Expect(tmpBeacon.Capabilities).to.deep.equal(['Shell', 'FileSystem']);
							Expect(tmpBeacon.MaxConcurrent).to.equal(2);
							Expect(tmpBeacon.Status).to.equal('Online');

							let tmpList = tmpCoordinator.listBeacons();
							Expect(tmpList.length).to.equal(1);
							Expect(tmpList[0].BeaconID).to.equal(tmpBeacon.BeaconID);
						}
					);

				test
					(
						'should deregister a Beacon.',
						function ()
						{
							let tmpFable = createTestFable();
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];

							let tmpBeacon = tmpCoordinator.registerBeacon({ Name: 'Worker1', Capabilities: ['Shell'] });
							Expect(tmpCoordinator.listBeacons().length).to.equal(1);

							let tmpRemoved = tmpCoordinator.deregisterBeacon(tmpBeacon.BeaconID);
							Expect(tmpRemoved).to.equal(true);
							Expect(tmpCoordinator.listBeacons().length).to.equal(0);

							let tmpNotFound = tmpCoordinator.deregisterBeacon('nonexistent');
							Expect(tmpNotFound).to.equal(false);
						}
					);

				test
					(
						'should process heartbeats.',
						function ()
						{
							let tmpFable = createTestFable();
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];

							let tmpBeacon = tmpCoordinator.registerBeacon({ Name: 'HeartbeatTest', Capabilities: ['Shell'] });
							let tmpOriginalHeartbeat = tmpBeacon.LastHeartbeat;

							let tmpUpdated = tmpCoordinator.heartbeat(tmpBeacon.BeaconID);
							Expect(tmpUpdated).to.not.equal(null);
							Expect(tmpUpdated.Status).to.equal('Online');

							let tmpMissing = tmpCoordinator.heartbeat('nonexistent');
							Expect(tmpMissing).to.equal(null);
						}
					);

				test
					(
						'should enqueue and poll work items.',
						function ()
						{
							let tmpFable = createTestFable();
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];

							let tmpBeacon = tmpCoordinator.registerBeacon({ Name: 'PollWorker', Capabilities: ['Shell'] });

							// Enqueue a work item
							let tmpWorkItem = tmpCoordinator.enqueueWorkItem({
								RunHash: 'run-test-1',
								NodeHash: 'node-cmd-1',
								OperationHash: 'OPR-TEST',
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'echo', Parameters: 'hello' }
							});

							Expect(tmpWorkItem.WorkItemHash).to.be.a('string');
							Expect(tmpWorkItem.Status).to.equal('Pending');

							// Poll for work
							let tmpPolled = tmpCoordinator.pollForWork(tmpBeacon.BeaconID);
							Expect(tmpPolled).to.not.equal(null);
							Expect(tmpPolled.WorkItemHash).to.equal(tmpWorkItem.WorkItemHash);
							Expect(tmpPolled.Capability).to.equal('Shell');
							Expect(tmpPolled.Settings.Command).to.equal('echo');

							// Verify the work item is now Running
							let tmpInternalItem = tmpCoordinator.getWorkItem(tmpWorkItem.WorkItemHash);
							Expect(tmpInternalItem.Status).to.equal('Running');
							Expect(tmpInternalItem.AssignedBeaconID).to.equal(tmpBeacon.BeaconID);

							// Second poll should return null (at capacity, MaxConcurrent=1)
							let tmpSecondPoll = tmpCoordinator.pollForWork(tmpBeacon.BeaconID);
							Expect(tmpSecondPoll).to.equal(null);
						}
					);

				test
					(
						'should not return work items for mismatched capabilities.',
						function ()
						{
							let tmpFable = createTestFable();
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];

							let tmpBeacon = tmpCoordinator.registerBeacon({ Name: 'FileWorker', Capabilities: ['FileSystem'] });

							tmpCoordinator.enqueueWorkItem({
								RunHash: 'run-test-2',
								NodeHash: 'node-shell-1',
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'echo', Parameters: 'test' }
							});

							// Should not match — Beacon has FileSystem, work item needs Shell
							let tmpPolled = tmpCoordinator.pollForWork(tmpBeacon.BeaconID);
							Expect(tmpPolled).to.equal(null);
						}
					);

				test
					(
						'should create and use affinity bindings.',
						function ()
						{
							let tmpFable = createTestFable();
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];

							let tmpBeacon1 = tmpCoordinator.registerBeacon({ Name: 'Worker1', Capabilities: ['Shell'], MaxConcurrent: 5 });
							let tmpBeacon2 = tmpCoordinator.registerBeacon({ Name: 'Worker2', Capabilities: ['Shell'], MaxConcurrent: 5 });

							// Enqueue first work item with affinity key
							tmpCoordinator.enqueueWorkItem({
								RunHash: 'run-test-3',
								NodeHash: 'node-1',
								Capability: 'Shell',
								Action: 'Execute',
								AffinityKey: '/videos/movie.mp4',
								Settings: { Command: 'ffprobe', Parameters: '/videos/movie.mp4' }
							});

							// Beacon1 claims it first
							let tmpPolled1 = tmpCoordinator.pollForWork(tmpBeacon1.BeaconID);
							Expect(tmpPolled1).to.not.equal(null);

							// Verify affinity binding was created
							let tmpBindings = tmpCoordinator.listAffinityBindings();
							Expect(tmpBindings.length).to.equal(1);
							Expect(tmpBindings[0].AffinityKey).to.equal('/videos/movie.mp4');
							Expect(tmpBindings[0].BeaconID).to.equal(tmpBeacon1.BeaconID);

							// Enqueue second work item with same affinity key
							let tmpWorkItem2 = tmpCoordinator.enqueueWorkItem({
								RunHash: 'run-test-3',
								NodeHash: 'node-2',
								Capability: 'Shell',
								Action: 'Execute',
								AffinityKey: '/videos/movie.mp4',
								Settings: { Command: 'ffmpeg', Parameters: '-i /videos/movie.mp4 ...' }
							});

							// Should be pre-assigned to Beacon1 via affinity
							Expect(tmpWorkItem2.Status).to.equal('Assigned');
							Expect(tmpWorkItem2.AssignedBeaconID).to.equal(tmpBeacon1.BeaconID);

							// Beacon2 should NOT get it
							let tmpPolledB2 = tmpCoordinator.pollForWork(tmpBeacon2.BeaconID);
							Expect(tmpPolledB2).to.equal(null);

							// Beacon1 should get it
							let tmpPolledB1 = tmpCoordinator.pollForWork(tmpBeacon1.BeaconID);
							Expect(tmpPolledB1).to.not.equal(null);
							Expect(tmpPolledB1.Settings.Command).to.equal('ffmpeg');
						}
					);

				test
					(
						'should clear affinity bindings.',
						function ()
						{
							let tmpFable = createTestFable();
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];

							let tmpBeacon = tmpCoordinator.registerBeacon({ Name: 'AffinityWorker', Capabilities: ['Shell'], MaxConcurrent: 5 });

							tmpCoordinator.enqueueWorkItem({
								RunHash: 'run-aff',
								NodeHash: 'n1',
								Capability: 'Shell',
								AffinityKey: '/data/file.csv',
								Settings: { Command: 'cat', Parameters: '/data/file.csv' }
							});

							tmpCoordinator.pollForWork(tmpBeacon.BeaconID);
							Expect(tmpCoordinator.listAffinityBindings().length).to.equal(1);

							let tmpCleared = tmpCoordinator.clearAffinityBinding('/data/file.csv');
							Expect(tmpCleared).to.equal(true);
							Expect(tmpCoordinator.listAffinityBindings().length).to.equal(0);

							let tmpNotFound = tmpCoordinator.clearAffinityBinding('/nonexistent');
							Expect(tmpNotFound).to.equal(false);
						}
					);

				test
					(
						'beacon-dispatch task type should be registered with correct definition.',
						function ()
						{
							let tmpFable = createTestFable();
							let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
							let tmpBuiltInConfigs = require('../source/services/tasks/Ultravisor-BuiltIn-TaskConfigs.cjs');
							tmpRegistry.registerTaskTypesFromConfigArray(tmpBuiltInConfigs);

							let tmpDef = tmpRegistry.getDefinition('beacon-dispatch');
							Expect(tmpDef).to.not.equal(undefined);
							Expect(tmpDef.Name).to.equal('Beacon Dispatch');
							Expect(tmpDef.Capability).to.equal('Extension');
							Expect(tmpDef.Action).to.equal('Dispatch');
							Expect(tmpDef.Tier).to.equal('Extension');
							Expect(tmpDef.EventOutputs.length).to.equal(2);
							Expect(tmpDef.EventOutputs[0].Name).to.equal('Complete');
							Expect(tmpDef.EventOutputs[1].Name).to.equal('Error');
							Expect(tmpDef.EventOutputs[1].IsError).to.equal(true);
							Expect(tmpDef.SettingsInputs.length).to.equal(8);
							Expect(tmpDef.StateOutputs.length).to.equal(4);
						}
					);

				test
					(
						'beacon-dispatch should return WaitingForInput with ResumeEventName when Beacons are registered.',
						function (fDone)
						{
							let tmpFable = createTestFable();
							let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];

							// Register built-in task types including beacon-dispatch
							tmpRegistry.registerBuiltInTaskTypes();

							// Register a Beacon so dispatch doesn't fail
							tmpCoordinator.registerBeacon({ Name: 'TestBeacon', Capabilities: ['Shell'] });

							// Build a simple operation with beacon-dispatch
							let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];
							let tmpManifest = Object.values(tmpFable.servicesMap['UltravisorExecutionManifest'])[0];

							let tmpOperation = {
								Hash: 'OPR-BEACON-TEST',
								Name: 'Beacon Dispatch Test',
								Graph: {
									Nodes: [
										{ Hash: 'start-1', Type: 'start', Ports: [{ Hash: 'start-1-eo-Begin', Label: 'Begin' }] },
										{
											Hash: 'dispatch-1', Type: 'beacon-dispatch', DefinitionHash: 'beacon-dispatch',
											Settings: { RemoteCapability: 'Shell', RemoteAction: 'Execute', Command: 'echo', Parameters: 'hello' },
											Ports: [
												{ Hash: 'dispatch-1-ei-Trigger', Label: 'Trigger' },
												{ Hash: 'dispatch-1-eo-Complete', Label: 'Complete' },
												{ Hash: 'dispatch-1-eo-Error', Label: 'Error' }
											]
										},
										{ Hash: 'end-1', Type: 'end', Ports: [{ Hash: 'end-1-ei-Finish', Label: 'Finish' }] }
									],
									Connections: [
										{ SourceNodeHash: 'start-1', SourcePortHash: 'start-1-eo-Begin', TargetNodeHash: 'dispatch-1', TargetPortHash: 'dispatch-1-ei-Trigger', ConnectionType: 'Event' },
										{ SourceNodeHash: 'dispatch-1', SourcePortHash: 'dispatch-1-eo-Complete', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' }
									]
								}
							};

							tmpEngine.executeOperation(tmpOperation,
								function (pError, pContext)
								{
									Expect(pError).to.equal(null);
									// Should be WaitingForInput (beacon-dispatch pauses until Beacon completes)
									Expect(pContext.Status).to.equal('WaitingForInput');

									// Verify WaitingTasks has the dispatch node
									Expect(pContext.WaitingTasks['dispatch-1']).to.not.equal(undefined);
									Expect(pContext.WaitingTasks['dispatch-1'].ResumeEventName).to.equal('complete');

									// Verify a work item was enqueued
									let tmpWorkItems = tmpCoordinator.listWorkItems();
									Expect(tmpWorkItems.length).to.equal(1);
									Expect(tmpWorkItems[0].Capability).to.equal('Shell');
									Expect(tmpWorkItems[0].Settings.Command).to.equal('echo');
									Expect(tmpWorkItems[0].RunHash).to.equal(pContext.Hash);

									fDone();
								});
						}
					);

				test
					(
						'should complete work item and resume operation via custom ResumeEventName.',
						function (fDone)
						{
							let tmpFable = createTestFable();
							let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];
							let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

							tmpRegistry.registerBuiltInTaskTypes();

							// Register a Beacon
							let tmpBeacon = tmpCoordinator.registerBeacon({ Name: 'ResumeTestBeacon', Capabilities: ['Shell'] });

							// Build operation with beacon-dispatch
							let tmpOperation = {
								Hash: 'OPR-RESUME-TEST',
								Name: 'Resume Test',
								Graph: {
									Nodes: [
										{ Hash: 'start-1', Type: 'start', Ports: [{ Hash: 'start-1-eo-Begin', Label: 'Begin' }] },
										{
											Hash: 'dispatch-1', Type: 'beacon-dispatch', DefinitionHash: 'beacon-dispatch',
											Settings: { RemoteCapability: 'Shell', Command: 'echo', Parameters: 'world' },
											Ports: [
												{ Hash: 'dispatch-1-ei-Trigger', Label: 'Trigger' },
												{ Hash: 'dispatch-1-eo-Complete', Label: 'Complete' },
												{ Hash: 'dispatch-1-eo-Error', Label: 'Error' }
											]
										},
										{ Hash: 'end-1', Type: 'end', Ports: [{ Hash: 'end-1-ei-Finish', Label: 'Finish' }] }
									],
									Connections: [
										{ SourceNodeHash: 'start-1', SourcePortHash: 'start-1-eo-Begin', TargetNodeHash: 'dispatch-1', TargetPortHash: 'dispatch-1-ei-Trigger', ConnectionType: 'Event' },
										{ SourceNodeHash: 'dispatch-1', SourcePortHash: 'dispatch-1-eo-Complete', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' }
									]
								}
							};

							// Execute — should pause at beacon-dispatch
							tmpEngine.executeOperation(tmpOperation,
								function (pError, pContext)
								{
									Expect(pContext.Status).to.equal('WaitingForInput');
									let tmpRunHash = pContext.Hash;

									// Simulate Beacon polling for work
									let tmpWorkItem = tmpCoordinator.pollForWork(tmpBeacon.BeaconID);
									Expect(tmpWorkItem).to.not.equal(null);

									// Simulate Beacon completing the work
									tmpCoordinator.completeWorkItem(tmpWorkItem.WorkItemHash,
										{
											Outputs: { StdOut: 'world\n', ExitCode: 0, Result: 'world\n' },
											Log: ['echo world executed']
										},
										function (pCompleteError)
										{
											Expect(pCompleteError).to.equal(null);

											// The operation should have resumed and completed
											let tmpManifest = Object.values(tmpFable.servicesMap['UltravisorExecutionManifest'])[0];
											let tmpFinalContext = tmpManifest.getRun(tmpRunHash);
											Expect(tmpFinalContext.Status).to.equal('Complete');

											// Verify structured outputs were merged into TaskOutputs
											Expect(tmpFinalContext.TaskOutputs['dispatch-1']).to.not.equal(undefined);
											Expect(tmpFinalContext.TaskOutputs['dispatch-1'].StdOut).to.equal('world\n');
											Expect(tmpFinalContext.TaskOutputs['dispatch-1'].ExitCode).to.equal(0);
											Expect(tmpFinalContext.TaskOutputs['dispatch-1'].BeaconID).to.equal(tmpBeacon.BeaconID);

											fDone();
										});
								});
						}
					);

				test
					(
						'should fail work item and fire Error event.',
						function (fDone)
						{
							let tmpFable = createTestFable();
							let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];
							let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

							tmpRegistry.registerBuiltInTaskTypes();
							let tmpBeacon = tmpCoordinator.registerBeacon({ Name: 'FailTestBeacon', Capabilities: ['Shell'] });

							let tmpOperation = {
								Hash: 'OPR-FAIL-TEST',
								Name: 'Fail Test',
								Graph: {
									Nodes: [
										{ Hash: 'start-1', Type: 'start', Ports: [{ Hash: 'start-1-eo-Begin', Label: 'Begin' }] },
										{
											Hash: 'dispatch-1', Type: 'beacon-dispatch', DefinitionHash: 'beacon-dispatch',
											Settings: { RemoteCapability: 'Shell', Command: 'badcommand' },
											Ports: [
												{ Hash: 'dispatch-1-ei-Trigger', Label: 'Trigger' },
												{ Hash: 'dispatch-1-eo-Complete', Label: 'Complete' },
												{ Hash: 'dispatch-1-eo-Error', Label: 'Error' }
											]
										},
										{ Hash: 'end-1', Type: 'end', Ports: [{ Hash: 'end-1-ei-Finish', Label: 'Finish' }] }
									],
									Connections: [
										{ SourceNodeHash: 'start-1', SourcePortHash: 'start-1-eo-Begin', TargetNodeHash: 'dispatch-1', TargetPortHash: 'dispatch-1-ei-Trigger', ConnectionType: 'Event' },
										// Error path leads to end
										{ SourceNodeHash: 'dispatch-1', SourcePortHash: 'dispatch-1-eo-Error', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' }
									]
								}
							};

							tmpEngine.executeOperation(tmpOperation,
								function (pError, pContext)
								{
									Expect(pContext.Status).to.equal('WaitingForInput');
									let tmpRunHash = pContext.Hash;

									let tmpWorkItem = tmpCoordinator.pollForWork(tmpBeacon.BeaconID);
									Expect(tmpWorkItem).to.not.equal(null);

									// Simulate failure
									tmpCoordinator.failWorkItem(tmpWorkItem.WorkItemHash,
										{ ErrorMessage: 'Command not found: badcommand', Log: ['FAIL'] },
										function (pFailError)
										{
											Expect(pFailError).to.equal(null);

											// The operation should have resumed via Error event path
											let tmpManifest = Object.values(tmpFable.servicesMap['UltravisorExecutionManifest'])[0];
											let tmpFinalContext = tmpManifest.getRun(tmpRunHash);
											Expect(tmpFinalContext.Status).to.equal('Complete');

											// Error outputs should be in TaskOutputs
											Expect(tmpFinalContext.TaskOutputs['dispatch-1']._BeaconError).to.equal(true);

											fDone();
										});
								});
						}
					);

				test
					(
						'backward compat: resumeOperation with scalar value should still work for value-input.',
						function (fDone)
						{
							let tmpFable = createTestFable();
							let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
							let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

							tmpRegistry.registerBuiltInTaskTypes();

							let tmpOperation = {
								Hash: 'OPR-COMPAT-TEST',
								Name: 'Backward Compat Test',
								Graph: {
									Nodes: [
										{ Hash: 'start-1', Type: 'start', Ports: [{ Hash: 'start-1-eo-Begin', Label: 'Begin' }] },
										{
											Hash: 'input-1', Type: 'value-input', DefinitionHash: 'value-input',
											Settings: { PromptMessage: 'Enter name:', OutputAddress: 'Operation.UserName' },
											Ports: [
												{ Hash: 'input-1-ei-RequestInput', Label: 'RequestInput' },
												{ Hash: 'input-1-eo-ValueInputComplete', Label: 'ValueInputComplete' }
											]
										},
										{ Hash: 'end-1', Type: 'end', Ports: [{ Hash: 'end-1-ei-Finish', Label: 'Finish' }] }
									],
									Connections: [
										{ SourceNodeHash: 'start-1', SourcePortHash: 'start-1-eo-Begin', TargetNodeHash: 'input-1', TargetPortHash: 'input-1-ei-RequestInput', ConnectionType: 'Event' },
										{ SourceNodeHash: 'input-1', SourcePortHash: 'input-1-eo-ValueInputComplete', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' }
									]
								}
							};

							tmpEngine.executeOperation(tmpOperation,
								function (pError, pContext)
								{
									Expect(pContext.Status).to.equal('WaitingForInput');
									let tmpRunHash = pContext.Hash;

									// Resume with a scalar value (backward compat)
									tmpEngine.resumeOperation(tmpRunHash, 'input-1', 'TestUser',
										function (pResumeError, pResumedContext)
										{
											Expect(pResumeError).to.equal(null);
											Expect(pResumedContext.Status).to.equal('Complete');

											// Scalar value should be stored as InputValue
											Expect(pResumedContext.TaskOutputs['input-1'].InputValue).to.equal('TestUser');

											// OutputAddress should have been written
											Expect(pResumedContext.OperationState.UserName).to.equal('TestUser');

											fDone();
										});
								});
						}
					);

				test
					(
						'should update progress on a running work item and surface in WaitingTasks.',
						function (fDone)
						{
							let tmpFable = createTestFable();
							let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];
							let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];
							let tmpManifest = Object.values(tmpFable.servicesMap['UltravisorExecutionManifest'])[0];

							tmpRegistry.registerBuiltInTaskTypes();
							let tmpBeacon = tmpCoordinator.registerBeacon({ Name: 'ProgressTestBeacon', Capabilities: ['Shell'] });

							let tmpOperation = {
								Hash: 'OPR-PROGRESS-TEST',
								Name: 'Progress Test',
								Graph: {
									Nodes: [
										{ Hash: 'start-1', Type: 'start', Ports: [{ Hash: 'start-1-eo-Begin', Label: 'Begin' }] },
										{
											Hash: 'dispatch-1', Type: 'beacon-dispatch', DefinitionHash: 'beacon-dispatch',
											Settings: { RemoteCapability: 'Shell', Command: 'echo', Parameters: 'progress' },
											Ports: [
												{ Hash: 'dispatch-1-ei-Trigger', Label: 'Trigger' },
												{ Hash: 'dispatch-1-eo-Complete', Label: 'Complete' }
											]
										},
										{ Hash: 'end-1', Type: 'end', Ports: [{ Hash: 'end-1-ei-Finish', Label: 'Finish' }] }
									],
									Connections: [
										{ SourceNodeHash: 'start-1', SourcePortHash: 'start-1-eo-Begin', TargetNodeHash: 'dispatch-1', TargetPortHash: 'dispatch-1-ei-Trigger', ConnectionType: 'Event' },
										{ SourceNodeHash: 'dispatch-1', SourcePortHash: 'dispatch-1-eo-Complete', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' }
									]
								}
							};

							tmpEngine.executeOperation(tmpOperation,
								function (pError, pContext)
								{
									Expect(pContext.Status).to.equal('WaitingForInput');
									let tmpRunHash = pContext.Hash;

									// Poll for work
									let tmpWorkItem = tmpCoordinator.pollForWork(tmpBeacon.BeaconID);
									Expect(tmpWorkItem).to.not.equal(null);

									// Report progress
									let tmpUpdated = tmpCoordinator.updateProgress(tmpWorkItem.WorkItemHash,
										{ Percent: 50, Message: 'Halfway done', Step: 1, TotalSteps: 2, Log: ['Step 1 complete'] });
									Expect(tmpUpdated).to.equal(true);

									// Verify progress surfaces in WaitingTasks
									let tmpRunContext = tmpManifest.getRun(tmpRunHash);
									Expect(tmpRunContext.WaitingTasks['dispatch-1'].Progress).to.not.equal(undefined);
									Expect(tmpRunContext.WaitingTasks['dispatch-1'].Progress.Percent).to.equal(50);
									Expect(tmpRunContext.WaitingTasks['dispatch-1'].Progress.Message).to.equal('Halfway done');

									// Verify work item has accumulated log
									let tmpFullWorkItem = tmpCoordinator.getWorkItem(tmpWorkItem.WorkItemHash);
									Expect(tmpFullWorkItem.AccumulatedLog).to.be.an('array');
									Expect(tmpFullWorkItem.AccumulatedLog.length).to.equal(1);
									Expect(tmpFullWorkItem.AccumulatedLog[0]).to.equal('Step 1 complete');

									// Complete the work item — accumulated log should merge
									tmpCoordinator.completeWorkItem(tmpWorkItem.WorkItemHash,
										{ Outputs: { StdOut: 'done', ExitCode: 0, Result: 'done' }, Log: ['Final step'] },
										function (pCompleteError)
										{
											Expect(pCompleteError).to.equal(null);
											let tmpFinalContext = tmpManifest.getRun(tmpRunHash);
											Expect(tmpFinalContext.Status).to.equal('Complete');
											fDone();
										});
								});
						}
					);

				test
					(
						'updateProgress should return false for non-existent work item.',
						function ()
						{
							let tmpFable = createTestFable();
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];

							let tmpResult = tmpCoordinator.updateProgress('wi-nonexistent', { Percent: 50 });
							Expect(tmpResult).to.equal(false);
						}
					);
			}
		);

	// =========================================================================
	// Beacon Queue Journal (persistence)
	// =========================================================================
	suite
		(
			'Beacon Queue Journal',
			function ()
			{
				const TEST_JOURNAL_ROOT = libPath.resolve(__dirname, '..', '.test_journal');

				/**
				 * Helper: create a Pict with Coordinator + Journal for persistence tests.
				 */
				function createJournalTestFable()
				{
					let tmpFable = new libPict(
						{
							Product: 'Ultravisor-JournalTest',
							LogLevel: 5,
							UltravisorStagingRoot: TEST_STAGING_ROOT,
							UltravisorFileStorePath: TEST_JOURNAL_ROOT,
							UltravisorBeaconJournalCompactThreshold: 5
						});

					tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconCoordinator', libUltravisorBeaconCoordinator);
					tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconQueueJournal', libUltravisorBeaconQueueJournal);

					// Initialize the journal service
					let tmpJournal = Object.values(tmpFable.servicesMap['UltravisorBeaconQueueJournal'])[0];
					tmpJournal.initialize(TEST_JOURNAL_ROOT);

					return tmpFable;
				}

				/**
				 * Helper: clean up journal test files.
				 */
				function cleanupJournalDir()
				{
					let tmpBeaconDir = libPath.join(TEST_JOURNAL_ROOT, 'beacon');
					if (libFS.existsSync(tmpBeaconDir))
					{
						libFS.rmSync(tmpBeaconDir, { recursive: true, force: true });
					}
				}

				setup(function()
				{
					cleanupJournalDir();
				});

				teardown(function()
				{
					cleanupJournalDir();
				});

				test
					(
						'Journal initializes and creates directory',
						function ()
						{
							let tmpFable = createJournalTestFable();
							let tmpJournal = Object.values(tmpFable.servicesMap['UltravisorBeaconQueueJournal'])[0];

							Expect(tmpJournal.isEnabled()).to.equal(true);
							Expect(libFS.existsSync(libPath.join(TEST_JOURNAL_ROOT, 'beacon'))).to.equal(true);
						}
					);

				test
					(
						'Journal is disabled when no store path is provided',
						function ()
						{
							let tmpFable = new libPict({ Product: 'Ultravisor-JournalDisabledTest', LogLevel: 5 });
							tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconQueueJournal', libUltravisorBeaconQueueJournal);
							let tmpJournal = Object.values(tmpFable.servicesMap['UltravisorBeaconQueueJournal'])[0];

							tmpJournal.initialize(null);
							Expect(tmpJournal.isEnabled()).to.equal(false);

							// Append should be a no-op
							tmpJournal.appendEntry('enqueue', { WorkItemHash: 'test' });
						}
					);

				test
					(
						'enqueueWorkItem writes journal entry',
						function ()
						{
							let tmpFable = createJournalTestFable();
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];

							let tmpWorkItem = tmpCoordinator.enqueueWorkItem({
								RunHash: 'test-run-1',
								NodeHash: 'node-1',
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'echo hello' }
							});

							Expect(tmpWorkItem.WorkItemHash).to.be.a('string');

							// Verify journal file was written
							let tmpJournalPath = libPath.join(TEST_JOURNAL_ROOT, 'beacon', 'queue-journal.jsonl');
							Expect(libFS.existsSync(tmpJournalPath)).to.equal(true);

							let tmpContent = libFS.readFileSync(tmpJournalPath, 'utf8');
							let tmpLines = tmpContent.trim().split('\n');
							Expect(tmpLines.length).to.equal(1);

							let tmpEntry = JSON.parse(tmpLines[0]);
							Expect(tmpEntry.op).to.equal('enqueue');
							Expect(tmpEntry.d.WorkItemHash).to.equal(tmpWorkItem.WorkItemHash);
							Expect(tmpEntry.d.Capability).to.equal('Shell');
						}
					);

				test
					(
						'completeWorkItem writes journal entry',
						function (fDone)
						{
							let tmpFable = createJournalTestFable();
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];

							let tmpWorkItem = tmpCoordinator.enqueueWorkItem({
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'echo hello' }
							});

							// Register a beacon and claim the work
							let tmpBeacon = tmpCoordinator.registerBeacon({
								Name: 'test-beacon',
								Capabilities: ['Shell']
							});
							let tmpWork = tmpCoordinator.pollForWork(tmpBeacon.BeaconID);
							Expect(tmpWork).to.not.equal(null);

							// Complete the work
							tmpCoordinator.completeWorkItem(tmpWorkItem.WorkItemHash,
								{ Outputs: { StdOut: 'hello' }, Log: ['done'] },
								(pError) =>
								{
									Expect(pError).to.equal(null);

									// Verify journal has enqueue + claim + complete entries
									let tmpJournalPath = libPath.join(TEST_JOURNAL_ROOT, 'beacon', 'queue-journal.jsonl');
									let tmpContent = libFS.readFileSync(tmpJournalPath, 'utf8');
									let tmpLines = tmpContent.trim().split('\n');

									// Should have: enqueue, claim, complete (at minimum)
									let tmpOps = tmpLines.map((l) => JSON.parse(l).op);
									Expect(tmpOps).to.include('enqueue');
									Expect(tmpOps).to.include('claim');
									Expect(tmpOps).to.include('complete');

									fDone();
								});
						}
					);

				test
					(
						'failWorkItem writes journal entry',
						function (fDone)
						{
							let tmpFable = createJournalTestFable();
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];

							let tmpWorkItem = tmpCoordinator.enqueueWorkItem({
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'exit 1' }
							});

							// Register a beacon and claim the work
							let tmpBeacon = tmpCoordinator.registerBeacon({
								Name: 'test-beacon-fail',
								Capabilities: ['Shell']
							});
							tmpCoordinator.pollForWork(tmpBeacon.BeaconID);

							// Fail the work
							tmpCoordinator.failWorkItem(tmpWorkItem.WorkItemHash,
								{ ErrorMessage: 'test failure', Log: ['failed'] },
								(pError) =>
								{
									Expect(pError).to.equal(null);

									let tmpJournalPath = libPath.join(TEST_JOURNAL_ROOT, 'beacon', 'queue-journal.jsonl');
									let tmpContent = libFS.readFileSync(tmpJournalPath, 'utf8');
									let tmpLines = tmpContent.trim().split('\n');
									let tmpOps = tmpLines.map((l) => JSON.parse(l).op);

									Expect(tmpOps).to.include('fail');

									fDone();
								});
						}
					);

				test
					(
						'replay restores pending work items',
						function ()
						{
							// Phase 1: create items with journal
							let tmpFable1 = createJournalTestFable();
							let tmpCoordinator1 = Object.values(tmpFable1.servicesMap['UltravisorBeaconCoordinator'])[0];

							let tmpWI1 = tmpCoordinator1.enqueueWorkItem({
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'echo first' }
							});

							let tmpWI2 = tmpCoordinator1.enqueueWorkItem({
								Capability: 'ImageMagick',
								Action: 'Convert',
								Settings: { InputPath: '/tmp/test.jpg' }
							});

							Expect(Object.keys(tmpCoordinator1._WorkQueue).length).to.equal(2);

							// Phase 2: create a fresh fable and replay journal
							let tmpFable2 = createJournalTestFable();
							let tmpCoordinator2 = Object.values(tmpFable2.servicesMap['UltravisorBeaconCoordinator'])[0];

							// Before restore, queue is empty
							Expect(Object.keys(tmpCoordinator2._WorkQueue).length).to.equal(0);

							tmpCoordinator2.restoreFromJournal();

							// After restore, both items should be present
							Expect(Object.keys(tmpCoordinator2._WorkQueue).length).to.equal(2);
							Expect(tmpCoordinator2._WorkQueue[tmpWI1.WorkItemHash]).to.not.equal(undefined);
							Expect(tmpCoordinator2._WorkQueue[tmpWI2.WorkItemHash]).to.not.equal(undefined);

							// Both should be Pending
							Expect(tmpCoordinator2._WorkQueue[tmpWI1.WorkItemHash].Status).to.equal('Pending');
							Expect(tmpCoordinator2._WorkQueue[tmpWI2.WorkItemHash].Status).to.equal('Pending');
						}
					);

				test
					(
						'replay resets Running items to Pending',
						function ()
						{
							// Phase 1: enqueue and claim an item
							let tmpFable1 = createJournalTestFable();
							let tmpCoordinator1 = Object.values(tmpFable1.servicesMap['UltravisorBeaconCoordinator'])[0];

							let tmpWI = tmpCoordinator1.enqueueWorkItem({
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'sleep 100' }
							});

							let tmpBeacon = tmpCoordinator1.registerBeacon({
								Name: 'worker-1',
								Capabilities: ['Shell']
							});
							tmpCoordinator1.pollForWork(tmpBeacon.BeaconID);
							Expect(tmpCoordinator1._WorkQueue[tmpWI.WorkItemHash].Status).to.equal('Running');

							// Phase 2: replay in a new coordinator
							let tmpFable2 = createJournalTestFable();
							let tmpCoordinator2 = Object.values(tmpFable2.servicesMap['UltravisorBeaconCoordinator'])[0];
							tmpCoordinator2.restoreFromJournal();

							// Running items get reset to Pending on replay
							Expect(tmpCoordinator2._WorkQueue[tmpWI.WorkItemHash].Status).to.equal('Pending');
							Expect(tmpCoordinator2._WorkQueue[tmpWI.WorkItemHash].AssignedBeaconID).to.equal(null);
						}
					);

				test
					(
						'replay does not include completed items',
						function (fDone)
						{
							// Phase 1: enqueue, claim, and complete an item
							let tmpFable1 = createJournalTestFable();
							let tmpCoordinator1 = Object.values(tmpFable1.servicesMap['UltravisorBeaconCoordinator'])[0];

							let tmpWI = tmpCoordinator1.enqueueWorkItem({
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'echo done' }
							});

							let tmpBeacon = tmpCoordinator1.registerBeacon({
								Name: 'worker-complete',
								Capabilities: ['Shell']
							});
							tmpCoordinator1.pollForWork(tmpBeacon.BeaconID);

							tmpCoordinator1.completeWorkItem(tmpWI.WorkItemHash,
								{ Outputs: { StdOut: 'done' }, Log: ['ok'] },
								(pError) =>
								{
									Expect(pError).to.equal(null);

									// Phase 2: replay
									let tmpFable2 = createJournalTestFable();
									let tmpCoordinator2 = Object.values(tmpFable2.servicesMap['UltravisorBeaconCoordinator'])[0];
									tmpCoordinator2.restoreFromJournal();

									// Completed item should NOT be in the restored queue
									Expect(Object.keys(tmpCoordinator2._WorkQueue).length).to.equal(0);

									fDone();
								});
						}
					);

				test
					(
						'replay restores affinity bindings',
						function ()
						{
							// Phase 1: create a work item with affinity
							let tmpFable1 = createJournalTestFable();
							let tmpCoordinator1 = Object.values(tmpFable1.servicesMap['UltravisorBeaconCoordinator'])[0];

							tmpCoordinator1.enqueueWorkItem({
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'echo test' },
								AffinityKey: 'project-alpha'
							});

							// Register a beacon and claim it — this creates an affinity binding
							let tmpBeacon = tmpCoordinator1.registerBeacon({
								Name: 'affinity-worker',
								Capabilities: ['Shell']
							});
							tmpCoordinator1.pollForWork(tmpBeacon.BeaconID);

							Expect(tmpCoordinator1._AffinityBindings['project-alpha']).to.not.equal(undefined);

							// Phase 2: replay
							let tmpFable2 = createJournalTestFable();
							let tmpCoordinator2 = Object.values(tmpFable2.servicesMap['UltravisorBeaconCoordinator'])[0];
							tmpCoordinator2.restoreFromJournal();

							// Affinity binding should be restored
							Expect(tmpCoordinator2._AffinityBindings['project-alpha']).to.not.equal(undefined);
							Expect(tmpCoordinator2._AffinityBindings['project-alpha'].BeaconID).to.contain('affinity-worker');
						}
					);

				test
					(
						'compaction writes snapshot and truncates journal',
						function ()
						{
							let tmpFable = createJournalTestFable();
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];
							let tmpJournal = Object.values(tmpFable.servicesMap['UltravisorBeaconQueueJournal'])[0];

							// Enqueue a few items
							tmpCoordinator.enqueueWorkItem({
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'echo one' }
							});

							tmpCoordinator.enqueueWorkItem({
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'echo two' }
							});

							// Manually trigger compaction
							tmpJournal.compact(tmpCoordinator._WorkQueue, tmpCoordinator._AffinityBindings);

							// Snapshot file should exist
							let tmpSnapshotPath = libPath.join(TEST_JOURNAL_ROOT, 'beacon', 'queue-snapshot.json');
							Expect(libFS.existsSync(tmpSnapshotPath)).to.equal(true);

							let tmpSnapshot = JSON.parse(libFS.readFileSync(tmpSnapshotPath, 'utf8'));
							Expect(Object.keys(tmpSnapshot.WorkQueue).length).to.equal(2);

							// Journal should have only the compact marker
							let tmpJournalPath = libPath.join(TEST_JOURNAL_ROOT, 'beacon', 'queue-journal.jsonl');
							let tmpJournalContent = libFS.readFileSync(tmpJournalPath, 'utf8').trim();
							let tmpJournalLines = tmpJournalContent.split('\n');
							Expect(tmpJournalLines.length).to.equal(1);
							Expect(JSON.parse(tmpJournalLines[0]).op).to.equal('compact');
						}
					);

				test
					(
						'replay after compaction restores correct state',
						function (fDone)
						{
							let tmpFable1 = createJournalTestFable();
							let tmpCoordinator1 = Object.values(tmpFable1.servicesMap['UltravisorBeaconCoordinator'])[0];
							let tmpJournal1 = Object.values(tmpFable1.servicesMap['UltravisorBeaconQueueJournal'])[0];

							// Enqueue three items
							let tmpWI1 = tmpCoordinator1.enqueueWorkItem({
								Capability: 'Shell', Action: 'Execute',
								Settings: { Command: 'echo one' }
							});
							let tmpWI2 = tmpCoordinator1.enqueueWorkItem({
								Capability: 'Shell', Action: 'Execute',
								Settings: { Command: 'echo two' }
							});
							let tmpWI3 = tmpCoordinator1.enqueueWorkItem({
								Capability: 'Shell', Action: 'Execute',
								Settings: { Command: 'echo three' }
							});

							// Complete the first item
							let tmpBeacon = tmpCoordinator1.registerBeacon({
								Name: 'compact-worker',
								Capabilities: ['Shell']
							});
							tmpCoordinator1.pollForWork(tmpBeacon.BeaconID);

							tmpCoordinator1.completeWorkItem(tmpWI1.WorkItemHash,
								{ Outputs: { StdOut: 'one' }, Log: [] },
								(pError) =>
								{
									Expect(pError).to.equal(null);

									// Compact (state: WI2 + WI3 pending)
									tmpJournal1.compact(tmpCoordinator1._WorkQueue, tmpCoordinator1._AffinityBindings);

									// Enqueue a fourth item AFTER compaction
									let tmpWI4 = tmpCoordinator1.enqueueWorkItem({
										Capability: 'Shell', Action: 'Execute',
										Settings: { Command: 'echo four' }
									});

									// Phase 2: replay in a new coordinator
									let tmpFable2 = createJournalTestFable();
									let tmpCoordinator2 = Object.values(tmpFable2.servicesMap['UltravisorBeaconCoordinator'])[0];
									tmpCoordinator2.restoreFromJournal();

									// Should have WI2, WI3 (from snapshot), WI4 (from journal)
									// WI1 was completed before compaction — should NOT appear
									Expect(Object.keys(tmpCoordinator2._WorkQueue).length).to.equal(3);
									Expect(tmpCoordinator2._WorkQueue[tmpWI1.WorkItemHash]).to.equal(undefined);
									Expect(tmpCoordinator2._WorkQueue[tmpWI2.WorkItemHash]).to.not.equal(undefined);
									Expect(tmpCoordinator2._WorkQueue[tmpWI3.WorkItemHash]).to.not.equal(undefined);
									Expect(tmpCoordinator2._WorkQueue[tmpWI4.WorkItemHash]).to.not.equal(undefined);

									fDone();
								});
						}
					);

				test
					(
						'auto-compaction triggers when threshold is reached',
						function ()
						{
							// Threshold is set to 5 in createJournalTestFable
							let tmpFable = createJournalTestFable();
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];

							// Enqueue 5 items (each write = 1 journal entry, so 5 entries triggers compaction)
							for (let i = 0; i < 5; i++)
							{
								tmpCoordinator.enqueueWorkItem({
									Capability: 'Shell',
									Action: 'Execute',
									Settings: { Command: `echo item-${i}` }
								});
							}

							// After compaction, snapshot should exist
							let tmpSnapshotPath = libPath.join(TEST_JOURNAL_ROOT, 'beacon', 'queue-snapshot.json');
							Expect(libFS.existsSync(tmpSnapshotPath)).to.equal(true);

							let tmpSnapshot = JSON.parse(libFS.readFileSync(tmpSnapshotPath, 'utf8'));
							Expect(Object.keys(tmpSnapshot.WorkQueue).length).to.equal(5);

							// Journal should be truncated (just compact marker)
							let tmpJournalPath = libPath.join(TEST_JOURNAL_ROOT, 'beacon', 'queue-journal.jsonl');
							let tmpJournalContent = libFS.readFileSync(tmpJournalPath, 'utf8').trim();
							let tmpJournalLines = tmpJournalContent.split('\n');
							Expect(tmpJournalLines.length).to.equal(1);
							Expect(JSON.parse(tmpJournalLines[0]).op).to.equal('compact');
						}
					);

				test
					(
						'clearAffinityBinding writes journal entry',
						function ()
						{
							let tmpFable = createJournalTestFable();
							let tmpCoordinator = Object.values(tmpFable.servicesMap['UltravisorBeaconCoordinator'])[0];

							// Create a work item with affinity and claim it
							tmpCoordinator.enqueueWorkItem({
								Capability: 'Shell',
								Action: 'Execute',
								Settings: {},
								AffinityKey: 'clear-test-key'
							});
							let tmpBeacon = tmpCoordinator.registerBeacon({
								Name: 'clear-worker',
								Capabilities: ['Shell']
							});
							tmpCoordinator.pollForWork(tmpBeacon.BeaconID);

							Expect(tmpCoordinator._AffinityBindings['clear-test-key']).to.not.equal(undefined);

							// Clear the affinity
							let tmpResult = tmpCoordinator.clearAffinityBinding('clear-test-key');
							Expect(tmpResult).to.equal(true);

							// Verify journal has affinity-clear entry
							let tmpJournalPath = libPath.join(TEST_JOURNAL_ROOT, 'beacon', 'queue-journal.jsonl');
							let tmpContent = libFS.readFileSync(tmpJournalPath, 'utf8');
							let tmpLines = tmpContent.trim().split('\n');
							let tmpOps = tmpLines.map((l) => JSON.parse(l).op);
							Expect(tmpOps).to.include('affinity-clear');

							// Replay in new coordinator — affinity should be gone
							let tmpFable2 = createJournalTestFable();
							let tmpCoordinator2 = Object.values(tmpFable2.servicesMap['UltravisorBeaconCoordinator'])[0];
							tmpCoordinator2.restoreFromJournal();
							Expect(tmpCoordinator2._AffinityBindings['clear-test-key']).to.equal(undefined);
						}
					);

				test
					(
						'journal replay is idempotent — restoring twice does not duplicate items',
						function ()
						{
							// Phase 1: create items
							let tmpFable1 = createJournalTestFable();
							let tmpCoordinator1 = Object.values(tmpFable1.servicesMap['UltravisorBeaconCoordinator'])[0];

							tmpCoordinator1.enqueueWorkItem({
								Capability: 'Shell', Action: 'Execute',
								Settings: { Command: 'echo test' }
							});

							// Phase 2: restore — should have 1 item
							let tmpFable2 = createJournalTestFable();
							let tmpCoordinator2 = Object.values(tmpFable2.servicesMap['UltravisorBeaconCoordinator'])[0];
							tmpCoordinator2.restoreFromJournal();
							Expect(Object.keys(tmpCoordinator2._WorkQueue).length).to.equal(1);

							// Restore again — still 1 item (not 2)
							tmpCoordinator2.restoreFromJournal();
							Expect(Object.keys(tmpCoordinator2._WorkQueue).length).to.equal(1);
						}
					);
			}
		);

	// =========================================================================
	// Beacon Capability Providers
	// =========================================================================
	suite
		(
			'Beacon Capability Providers',
			function ()
			{
				setup ( () => { ensureTestFixtures(); } );
				teardown ( () => { cleanupTestStaging(); } );

				// --- Base Class ---
				test
					(
						'base class should have default Name and Capability.',
						function ()
						{
							let tmpProvider = new libBeaconCapabilityProvider();
							Expect(tmpProvider.Name).to.equal('BaseProvider');
							Expect(tmpProvider.Capability).to.equal('Unknown');
						}
					);

				test
					(
						'base class actions should return empty object.',
						function ()
						{
							let tmpProvider = new libBeaconCapabilityProvider();
							let tmpActions = tmpProvider.actions;
							Expect(Object.keys(tmpActions).length).to.equal(0);
						}
					);

				test
					(
						'base class getCapabilities should return [Capability].',
						function ()
						{
							let tmpProvider = new libBeaconCapabilityProvider();
							tmpProvider.Capability = 'TestCap';
							let tmpCaps = tmpProvider.getCapabilities();
							Expect(tmpCaps).to.deep.equal(['TestCap']);
						}
					);

				test
					(
						'base class describeActions should return structured array.',
						function ()
						{
							let tmpProvider = new libBeaconProviderShell();
							let tmpDescriptions = tmpProvider.describeActions();
							Expect(tmpDescriptions.length).to.be.greaterThan(0);
							Expect(tmpDescriptions[0].Capability).to.equal('Shell');
							Expect(tmpDescriptions[0].Action).to.equal('Execute');
						}
					);

				test
					(
						'base class initialize and shutdown should call callbacks.',
						function (fDone)
						{
							let tmpProvider = new libBeaconCapabilityProvider();
							tmpProvider.initialize(function (pError)
							{
								Expect(pError).to.equal(null);
								tmpProvider.shutdown(function (pError2)
								{
									Expect(pError2).to.equal(null);
									fDone();
								});
							});
						}
					);

				test
					(
						'base class execute should return error for unimplemented action.',
						function (fDone)
						{
							let tmpProvider = new libBeaconCapabilityProvider();
							tmpProvider.execute('DoSomething', {}, {}, function (pError)
							{
								Expect(pError).to.be.an.instanceOf(Error);
								Expect(pError.message).to.contain('has not implemented execute()');
								fDone();
							});
						}
					);

				// --- Provider Registry ---
				test
					(
						'registry should register a provider and track capabilities.',
						function ()
						{
							let tmpRegistry = new libBeaconProviderRegistry();
							let tmpProvider = new libBeaconProviderShell();
							let tmpResult = tmpRegistry.registerProvider(tmpProvider);

							Expect(tmpResult).to.equal(true);
							Expect(tmpRegistry.getCapabilities()).to.deep.equal(['Shell']);
						}
					);

				test
					(
						'registry should resolve Capability:Action to correct provider.',
						function ()
						{
							let tmpRegistry = new libBeaconProviderRegistry();
							tmpRegistry.registerProvider(new libBeaconProviderShell());

							let tmpResolved = tmpRegistry.resolve('Shell', 'Execute');
							Expect(tmpResolved).to.not.equal(null);
							Expect(tmpResolved.provider.Name).to.equal('Shell');
							Expect(tmpResolved.action).to.equal('Execute');
						}
					);

				test
					(
						'registry should fall back to default action when Action is empty.',
						function ()
						{
							let tmpRegistry = new libBeaconProviderRegistry();
							tmpRegistry.registerProvider(new libBeaconProviderShell());

							let tmpResolved = tmpRegistry.resolve('Shell', '');
							Expect(tmpResolved).to.not.equal(null);
							Expect(tmpResolved.action).to.equal('Execute');
						}
					);

				test
					(
						'registry should return null for unknown capability.',
						function ()
						{
							let tmpRegistry = new libBeaconProviderRegistry();
							tmpRegistry.registerProvider(new libBeaconProviderShell());

							let tmpResolved = tmpRegistry.resolve('VideoProcessing', 'Transcode');
							Expect(tmpResolved).to.equal(null);
						}
					);

				test
					(
						'registry should load built-in provider by name.',
						function ()
						{
							let tmpRegistry = new libBeaconProviderRegistry();
							let tmpResult = tmpRegistry.loadProvider({ Source: 'Shell' });
							Expect(tmpResult).to.equal(true);
							Expect(tmpRegistry.getCapabilities()).to.deep.equal(['Shell']);
						}
					);

				test
					(
						'registry should aggregate capabilities from multiple providers.',
						function ()
						{
							let tmpRegistry = new libBeaconProviderRegistry();
							tmpRegistry.loadProvider({ Source: 'Shell' });
							tmpRegistry.loadProvider({ Source: 'FileSystem' });

							let tmpCaps = tmpRegistry.getCapabilities();
							Expect(tmpCaps).to.include('Shell');
							Expect(tmpCaps).to.include('FileSystem');
							Expect(tmpCaps.length).to.equal(2);
						}
					);

				test
					(
						'registry should initialize all providers in sequence.',
						function (fDone)
						{
							let tmpRegistry = new libBeaconProviderRegistry();
							tmpRegistry.loadProvider({ Source: 'Shell' });
							tmpRegistry.loadProvider({ Source: 'FileSystem' });

							tmpRegistry.initializeAll(function (pError)
							{
								Expect(pError).to.equal(null);
								tmpRegistry.shutdownAll(function (pError2)
								{
									Expect(pError2).to.equal(null);
									fDone();
								});
							});
						}
					);

				test
					(
						'registry should return false for provider without Capability.',
						function ()
						{
							let tmpRegistry = new libBeaconProviderRegistry();
							let tmpResult = tmpRegistry.registerProvider({});
							Expect(tmpResult).to.equal(false);
						}
					);

				// --- Shell Provider ---
				test
					(
						'Shell provider should execute echo command.',
						function (fDone)
						{
							let tmpProvider = new libBeaconProviderShell();
							let tmpWorkItem = {
								WorkItemHash: 'wi-test-1',
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'echo', Parameters: 'hello provider' },
								TimeoutMs: 10000
							};

							tmpProvider.execute('Execute', tmpWorkItem, { StagingPath: process.cwd() },
								function (pError, pResult)
								{
									Expect(pError).to.equal(null);
									Expect(pResult.Outputs.ExitCode).to.equal(0);
									Expect(pResult.Outputs.StdOut).to.contain('hello provider');
									fDone();
								});
						}
					);

				test
					(
						'Shell provider should handle missing command.',
						function (fDone)
						{
							let tmpProvider = new libBeaconProviderShell();
							let tmpWorkItem = {
								WorkItemHash: 'wi-test-2',
								Settings: {}
							};

							tmpProvider.execute('Execute', tmpWorkItem, {},
								function (pError, pResult)
								{
									Expect(pError).to.equal(null);
									Expect(pResult.Outputs.ExitCode).to.equal(-1);
									Expect(pResult.Outputs.StdOut).to.contain('No command');
									fDone();
								});
						}
					);

				test
					(
						'Shell provider should handle command failure with non-zero exit code.',
						function (fDone)
						{
							let tmpProvider = new libBeaconProviderShell();
							let tmpWorkItem = {
								WorkItemHash: 'wi-test-3',
								Settings: { Command: 'false' },
								TimeoutMs: 5000
							};

							tmpProvider.execute('Execute', tmpWorkItem, { StagingPath: process.cwd() },
								function (pError, pResult)
								{
									Expect(pError).to.equal(null);
									Expect(pResult.Outputs.ExitCode).to.not.equal(0);
									fDone();
								});
						}
					);

				// --- FileSystem Provider ---
				test
					(
						'FileSystem provider should read a file.',
						function (fDone)
						{
							let tmpProvider = new libBeaconProviderFileSystem();
							let tmpWorkItem = {
								WorkItemHash: 'wi-fs-read-1',
								Settings: { FilePath: TEST_INPUT_FILE }
							};

							tmpProvider.execute('Read', tmpWorkItem, { StagingPath: TEST_STAGING_ROOT },
								function (pError, pResult)
								{
									Expect(pError).to.equal(null);
									Expect(pResult.Outputs.ExitCode).to.equal(0);
									Expect(pResult.Outputs.Result).to.contain('Hello, John!');
									fDone();
								});
						}
					);

				test
					(
						'FileSystem provider should write and read back a file.',
						function (fDone)
						{
							let tmpProvider = new libBeaconProviderFileSystem();
							let tmpWritePath = libPath.resolve(TEST_STAGING_ROOT, 'provider_write_test.txt');
							let tmpWriteItem = {
								WorkItemHash: 'wi-fs-write-1',
								Settings: { FilePath: tmpWritePath, Content: 'Provider write test content' }
							};

							tmpProvider.execute('Write', tmpWriteItem, { StagingPath: TEST_STAGING_ROOT },
								function (pError, pResult)
								{
									Expect(pError).to.equal(null);
									Expect(pResult.Outputs.ExitCode).to.equal(0);

									// Read it back
									let tmpReadItem = { WorkItemHash: 'wi-fs-read-2', Settings: { FilePath: tmpWritePath } };
									tmpProvider.execute('Read', tmpReadItem, { StagingPath: TEST_STAGING_ROOT },
										function (pReadError, pReadResult)
										{
											Expect(pReadError).to.equal(null);
											Expect(pReadResult.Outputs.Result).to.equal('Provider write test content');

											// Clean up
											try { libFS.unlinkSync(tmpWritePath); } catch(e) {}
											fDone();
										});
								});
						}
					);

				test
					(
						'FileSystem provider should list files in a directory.',
						function (fDone)
						{
							let tmpProvider = new libBeaconProviderFileSystem();
							let tmpListItem = {
								WorkItemHash: 'wi-fs-list-1',
								Settings: { Folder: TEST_STAGING_ROOT }
							};

							tmpProvider.execute('List', tmpListItem, { StagingPath: TEST_STAGING_ROOT },
								function (pError, pResult)
								{
									Expect(pError).to.equal(null);
									Expect(pResult.Outputs.ExitCode).to.equal(0);
									let tmpFiles = JSON.parse(pResult.Outputs.Result);
									Expect(tmpFiles).to.be.an('array');
									Expect(tmpFiles.length).to.be.greaterThan(0);
									fDone();
								});
						}
					);

				test
					(
						'FileSystem provider should enforce AllowedPaths.',
						function (fDone)
						{
							let tmpProvider = new libBeaconProviderFileSystem({ AllowedPaths: ['/restricted/path'] });
							let tmpReadItem = {
								WorkItemHash: 'wi-fs-restricted',
								Settings: { FilePath: '/tmp/not_allowed.txt' }
							};

							tmpProvider.execute('Read', tmpReadItem, {},
								function (pError, pResult)
								{
									Expect(pError).to.equal(null);
									Expect(pResult.Outputs.ExitCode).to.equal(-1);
									Expect(pResult.Outputs.StdOut).to.contain('not allowed');
									fDone();
								});
						}
					);

				test
					(
						'FileSystem provider should handle unknown action.',
						function (fDone)
						{
							let tmpProvider = new libBeaconProviderFileSystem();
							tmpProvider.execute('Delete', {}, {},
								function (pError, pResult)
								{
									Expect(pError).to.equal(null);
									Expect(pResult.Outputs.ExitCode).to.equal(-1);
									Expect(pResult.Outputs.StdOut).to.contain('Unknown FileSystem action');
									fDone();
								});
						}
					);

				// --- Executor with Providers ---
				test
					(
						'executor should route Shell/Execute to Shell provider.',
						function (fDone)
						{
							let tmpExecutor = new libBeaconExecutor({ StagingPath: TEST_STAGING_ROOT });
							tmpExecutor.providerRegistry.loadProvider({ Source: 'Shell' });

							let tmpWorkItem = {
								WorkItemHash: 'wi-exec-1',
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'echo', Parameters: 'executor test' },
								TimeoutMs: 5000
							};

							tmpExecutor.execute(tmpWorkItem,
								function (pError, pResult)
								{
									Expect(pError).to.equal(null);
									Expect(pResult.Outputs.ExitCode).to.equal(0);
									Expect(pResult.Outputs.StdOut).to.contain('executor test');
									fDone();
								});
						}
					);

				test
					(
						'executor should route FileSystem/Read to FileSystem provider.',
						function (fDone)
						{
							let tmpExecutor = new libBeaconExecutor({ StagingPath: TEST_STAGING_ROOT });
							tmpExecutor.providerRegistry.loadProvider({ Source: 'Shell' });
							tmpExecutor.providerRegistry.loadProvider({ Source: 'FileSystem' });

							let tmpWorkItem = {
								WorkItemHash: 'wi-exec-2',
								Capability: 'FileSystem',
								Action: 'Read',
								Settings: { FilePath: TEST_INPUT_FILE }
							};

							tmpExecutor.execute(tmpWorkItem,
								function (pError, pResult)
								{
									Expect(pError).to.equal(null);
									Expect(pResult.Outputs.ExitCode).to.equal(0);
									Expect(pResult.Outputs.Result).to.contain('Hello, John!');
									fDone();
								});
						}
					);

				test
					(
						'executor should return error for unknown capability.',
						function (fDone)
						{
							let tmpExecutor = new libBeaconExecutor({ StagingPath: TEST_STAGING_ROOT });
							tmpExecutor.providerRegistry.loadProvider({ Source: 'Shell' });

							let tmpWorkItem = {
								WorkItemHash: 'wi-exec-3',
								Capability: 'VideoProcessing',
								Action: 'Transcode',
								Settings: {}
							};

							tmpExecutor.execute(tmpWorkItem,
								function (pError, pResult)
								{
									Expect(pError).to.equal(null);
									Expect(pResult.Outputs.ExitCode).to.equal(-1);
									Expect(pResult.Outputs.StdOut).to.contain('Unknown capability');
									fDone();
								});
						}
					);

				test
					(
						'executor should derive capabilities from loaded providers.',
						function ()
						{
							let tmpExecutor = new libBeaconExecutor({ StagingPath: TEST_STAGING_ROOT });
							tmpExecutor.providerRegistry.loadProvider({ Source: 'Shell' });
							tmpExecutor.providerRegistry.loadProvider({ Source: 'FileSystem' });

							let tmpCaps = tmpExecutor.providerRegistry.getCapabilities();
							Expect(tmpCaps).to.include('Shell');
							Expect(tmpCaps).to.include('FileSystem');
						}
					);

				test
					(
						'executor should pass progress callback through to provider.',
						function (fDone)
						{
							let tmpExecutor = new libBeaconExecutor({ StagingPath: TEST_STAGING_ROOT });
							tmpExecutor.providerRegistry.loadProvider({ Source: 'Shell' });

							let tmpProgressCalled = false;
							let fProgress = function () { tmpProgressCalled = true; };

							// Shell provider doesn't call fReportProgress itself,
							// but the callback should be passed through without error
							let tmpWorkItem = {
								WorkItemHash: 'wi-exec-progress',
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'echo', Parameters: 'progress test' },
								TimeoutMs: 5000
							};

							tmpExecutor.execute(tmpWorkItem,
								function (pError, pResult)
								{
									Expect(pError).to.equal(null);
									Expect(pResult.Outputs.ExitCode).to.equal(0);
									fDone();
								}, fProgress);
						}
					);

				// --- Backward Compatibility ---
				test
					(
						'backward compat: Capabilities array should auto-convert to Providers.',
						function ()
						{
							// Simulate what BeaconClient does internally
							let tmpCapabilities = ['Shell', 'FileSystem'];
							let tmpProviders = tmpCapabilities.map(function (pCap)
							{
								return { Source: pCap, Config: {} };
							});

							let tmpRegistry = new libBeaconProviderRegistry();
							let tmpCount = tmpRegistry.loadProviders(tmpProviders);
							Expect(tmpCount).to.equal(2);
							Expect(tmpRegistry.getCapabilities()).to.include('Shell');
							Expect(tmpRegistry.getCapabilities()).to.include('FileSystem');
						}
					);

				test
					(
						'backward compat: default to Shell when no config.',
						function ()
						{
							let tmpRegistry = new libBeaconProviderRegistry();
							let tmpProviders = [{ Source: 'Shell' }];
							let tmpCount = tmpRegistry.loadProviders(tmpProviders);
							Expect(tmpCount).to.equal(1);
							Expect(tmpRegistry.getCapabilities()).to.deep.equal(['Shell']);
						}
					);
			}
		);

		suite
		(
			'Beacon File Transfer',
			function ()
			{
				this.timeout(15000);

				test
					(
						'executor should handle execute without file transfer (backward compat).',
						function (fDone)
						{
							// Ensure staging dir exists for exec cwd
							if (!libFS.existsSync(TEST_STAGING_ROOT))
							{
								libFS.mkdirSync(TEST_STAGING_ROOT, { recursive: true });
							}

							let tmpExecutor = new libBeaconExecutor({ StagingPath: TEST_STAGING_ROOT });
							let tmpProviders = [{ Source: 'Shell' }];
							tmpExecutor.providerRegistry.loadProviders(tmpProviders);

							let tmpWorkItem = {
								WorkItemHash: 'compat-test-01',
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'echo "no file transfer"' }
							};

							tmpExecutor.execute(tmpWorkItem, function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult).to.be.an('object');
								Expect(pResult.Outputs).to.be.an('object');
								Expect(pResult.Outputs.StdOut).to.contain('no file transfer');
								Expect(pResult.Outputs.ExitCode).to.equal(0);
								fDone();
							});
						}
					);

				test
					(
						'executor should substitute {OutputPath} in Command.',
						function (fDone)
						{
							let tmpExecutor = new libBeaconExecutor({ StagingPath: TEST_STAGING_ROOT });
							let tmpProviders = [{ Source: 'Shell' }];
							tmpExecutor.providerRegistry.loadProviders(tmpProviders);

							let tmpWorkItem = {
								WorkItemHash: 'subst-test-01',
								Capability: 'Shell',
								Action: 'Execute',
								Settings: {
									Command: 'echo "output={OutputPath}"',
									OutputFilename: 'result.txt'
								}
							};

							tmpExecutor.execute(tmpWorkItem, function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult).to.be.an('object');
								Expect(pResult.Outputs.StdOut).to.contain('output=');
								Expect(pResult.Outputs.StdOut).to.not.contain('{OutputPath}');

								tmpExecutor._cleanupWorkDir('subst-test-01');
								fDone();
							});
						}
					);

				test
					(
						'executor should create and clean up work directories.',
						function ()
						{
							let tmpExecutor = new libBeaconExecutor({ StagingPath: TEST_STAGING_ROOT });

							let tmpWorkItem = { WorkItemHash: 'cleanup-test-01', Settings: {} };
							let tmpDir = tmpExecutor._getWorkDir(tmpWorkItem);

							Expect(libFS.existsSync(tmpDir)).to.be.true;

							tmpExecutor._cleanupWorkDir('cleanup-test-01');
							Expect(libFS.existsSync(tmpDir)).to.be.false;
						}
					);

				test
					(
						'executor should create affinity-scoped directories.',
						function ()
						{
							let tmpExecutor = new libBeaconExecutor({ StagingPath: TEST_STAGING_ROOT });

							let tmpWorkItem = {
								WorkItemHash: 'affinity-test-01',
								Settings: { AffinityKey: 'test-video.mp4' }
							};

							let tmpDir = tmpExecutor._getAffinityDir(tmpWorkItem);

							Expect(libFS.existsSync(tmpDir)).to.be.true;
							Expect(tmpDir).to.contain('affinity-');

							let tmpDir2 = tmpExecutor._getAffinityDir(tmpWorkItem);
							Expect(tmpDir2).to.equal(tmpDir);

							tmpExecutor.cleanupAffinityDirs();
							Expect(libFS.existsSync(tmpDir)).to.be.false;
						}
					);

				test
					(
						'executor should collect output files as base64.',
						function (fDone)
						{
							let tmpExecutor = new libBeaconExecutor({ StagingPath: TEST_STAGING_ROOT });
							let tmpProviders = [{ Source: 'Shell' }];
							tmpExecutor.providerRegistry.loadProviders(tmpProviders);

							let tmpWorkItem = {
								WorkItemHash: 'collect-test-01',
								Capability: 'Shell',
								Action: 'Execute',
								Settings: {
									Command: 'echo "test output data" > "{OutputPath}"',
									OutputFilename: 'output.txt',
									ReturnOutputAsBase64: true
								}
							};

							tmpExecutor.execute(tmpWorkItem, function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult).to.be.an('object');
								Expect(pResult.Outputs).to.be.an('object');
								Expect(pResult.Outputs.OutputData).to.be.a('string');
								Expect(pResult.Outputs.OutputFilename).to.equal('output.txt');
								Expect(pResult.Outputs.OutputSize).to.be.above(0);

								let tmpDecoded = Buffer.from(pResult.Outputs.OutputData, 'base64').toString('utf8');
								Expect(tmpDecoded).to.contain('test output data');

								fDone();
							});
						}
					);

				test
					(
						'executor should format file sizes correctly.',
						function ()
						{
							let tmpExecutor = new libBeaconExecutor({ StagingPath: TEST_STAGING_ROOT });

							let tmpTestFile = libPath.join(TEST_STAGING_ROOT, 'size_test.txt');
							libFS.writeFileSync(tmpTestFile, 'hello');

							let tmpSize = tmpExecutor._formatFileSize(tmpTestFile);
							Expect(tmpSize).to.equal('5 B');

							let tmpUnknown = tmpExecutor._formatFileSize('/nonexistent/file');
							Expect(tmpUnknown).to.equal('unknown size');

							libFS.unlinkSync(tmpTestFile);
						}
					);

				test
					(
						'executor should sanitize affinity key for directory name.',
						function ()
						{
							let tmpExecutor = new libBeaconExecutor({ StagingPath: TEST_STAGING_ROOT });

							let tmpWorkItem = {
								Settings: { AffinityKey: 'path/to/file with spaces!@#$.mp4' }
							};

							let tmpDir = tmpExecutor._getAffinityDir(tmpWorkItem);
							Expect(tmpDir).to.contain('affinity-');
							Expect(tmpDir).to.not.contain('!');

							tmpExecutor.cleanupAffinityDirs();
						}
					);
			}
		);

		suite
		(
			'Beacon Direct Dispatch',
			function ()
			{
				this.timeout(15000);

				test
					(
						'coordinator dispatchAndWait should register callback and fire on completion.',
						function (fDone)
						{
							let tmpFable = createTestFable();
							let tmpCoordinator = tmpFable.services.UltravisorBeaconCoordinator;

							tmpCoordinator.registerBeacon(
							{
								Name: 'dispatch-test-beacon',
								Capabilities: ['Shell']
							});

							let tmpWorkItemInfo = {
								Capability: 'Shell',
								Action: 'Execute',
								Settings: { Command: 'echo "dispatch test"' },
								TimeoutMs: 10000
							};

							tmpCoordinator.dispatchAndWait(tmpWorkItemInfo,
								function (pDispatchError, pResult)
								{
									Expect(pDispatchError).to.be.null;
									Expect(pResult).to.be.an('object');
									Expect(pResult.Success).to.be.true;
									Expect(pResult.WorkItemHash).to.be.a('string');
									fDone();
								});

							// Simulate beacon completing the work item after 100ms
							setTimeout(function ()
							{
								let tmpKeys = Object.keys(tmpCoordinator._WorkQueue);
								let tmpDispatchKey = tmpKeys.find(function (pKey)
								{
									return tmpCoordinator._WorkQueue[pKey] && !tmpCoordinator._WorkQueue[pKey].RunHash;
								});

								if (tmpDispatchKey)
								{
									tmpCoordinator.completeWorkItem(tmpDispatchKey,
									{
										Outputs: { StdOut: 'dispatch test', ExitCode: 0, Result: '' },
										Log: ['test log']
									},
									function () {});
								}
							}, 100);
						}
					);

				test
					(
						'coordinator dispatchAndWait should fire callback with error on failWorkItem.',
						function (fDone)
						{
							let tmpFable = createTestFable();
							let tmpCoordinator = tmpFable.services.UltravisorBeaconCoordinator;

							tmpCoordinator.registerBeacon(
							{
								Name: 'fail-test-beacon',
								Capabilities: ['Shell']
							});

							let tmpWorkItemInfo = {
								Capability: 'Shell',
								Settings: { Command: 'fail-test' },
								TimeoutMs: 10000
							};

							tmpCoordinator.dispatchAndWait(tmpWorkItemInfo,
								function (pDispatchError)
								{
									Expect(pDispatchError).to.be.an('error');
									Expect(pDispatchError.message).to.contain('something went wrong');
									fDone();
								});

							// Simulate beacon failing the work item after 100ms
							setTimeout(function ()
							{
								let tmpKeys = Object.keys(tmpCoordinator._WorkQueue);
								let tmpDispatchKey = tmpKeys.find(function (pKey)
								{
									return tmpCoordinator._WorkQueue[pKey] && !tmpCoordinator._WorkQueue[pKey].RunHash;
								});

								if (tmpDispatchKey)
								{
									tmpCoordinator.failWorkItem(tmpDispatchKey,
										{ ErrorMessage: 'something went wrong', Log: ['test failure'] },
										function () {});
								}
							}, 100);
						}
					);

				test
					(
						'coordinator dispatchAndWait should timeout and call callback with error.',
						function (fDone)
						{
							let tmpFable = createTestFable();
							let tmpCoordinator = tmpFable.services.UltravisorBeaconCoordinator;

							tmpCoordinator.registerBeacon(
							{
								Name: 'timeout-test-beacon',
								Capabilities: ['Shell']
							});

							let tmpWorkItemInfo = {
								Capability: 'Shell',
								Settings: { Command: 'timeout-test' },
								TimeoutMs: 200
							};

							tmpCoordinator.dispatchAndWait(tmpWorkItemInfo,
								function (pDispatchError)
								{
									Expect(pDispatchError).to.be.an('error');
									Expect(pDispatchError.message).to.contain('timed out');
									fDone();
								});
						}
					);

				test
					(
						'operation-graph work items should still call resumeOperation (backward compat).',
						function (fDone)
						{
							let tmpFable = createTestFable();
							let tmpCoordinator = tmpFable.services.UltravisorBeaconCoordinator;

							tmpCoordinator.registerBeacon(
							{
								Name: 'compat-beacon',
								Capabilities: ['Shell']
							});

							let tmpResult = tmpCoordinator.enqueueWorkItem(
							{
								RunHash: 'test-run-hash',
								NodeHash: 'test-node-hash',
								Capability: 'Shell',
								Settings: { Command: 'echo compat' }
							});

							Expect(tmpResult).to.be.an('object');
							Expect(tmpResult.WorkItemHash).to.be.a('string');
							let tmpWorkItemHash = tmpResult.WorkItemHash;

							// completeWorkItem with a RunHash will try resumeOperation
							// which will fail (no engine run context), but should not
							// have a direct dispatch callback registered
							tmpCoordinator.completeWorkItem(tmpWorkItemHash,
							{
								Outputs: { StdOut: 'compat', ExitCode: 0 },
								Log: []
							},
							function (pError)
							{
								// The direct dispatch callback should NOT be involved
								Expect(tmpCoordinator._DirectDispatchCallbacks[tmpWorkItemHash]).to.be.undefined;
								fDone();
							});
						}
					);
			}
		);

	// =========================================================================
	// LLM Beacon Provider
	// =========================================================================
	suite
		(
			'LLM Beacon Provider',
			function ()
			{
				// --- Construction & Identity ---
				test
					(
						'LLM provider should have correct Name and Capability.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'openai', BaseURL: 'https://api.openai.com', Model: 'gpt-4' });
							Expect(tmpProvider.Name).to.equal('LLM');
							Expect(tmpProvider.Capability).to.equal('LLM');
						}
					);

				test
					(
						'LLM provider should store config values.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({
								Backend: 'anthropic',
								BaseURL: 'https://api.anthropic.com',
								APIKey: 'test-key-123',
								Model: 'claude-sonnet-4-20250514',
								DefaultParameters: { Temperature: 0.5, MaxTokens: 2048 },
								TimeoutMs: 60000
							});
							Expect(tmpProvider._Backend).to.equal('anthropic');
							Expect(tmpProvider._BaseURL).to.equal('https://api.anthropic.com');
							Expect(tmpProvider._Model).to.equal('claude-sonnet-4-20250514');
							Expect(tmpProvider._TimeoutMs).to.equal(60000);
							Expect(tmpProvider._DefaultParameters.Temperature).to.equal(0.5);
						}
					);

				test
					(
						'LLM provider should default to openai backend.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({});
							Expect(tmpProvider._Backend).to.equal('openai');
							Expect(tmpProvider._TimeoutMs).to.equal(120000);
						}
					);

				// --- Actions ---
				test
					(
						'LLM provider should declare ChatCompletion, Embedding, and ToolUse actions.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({});
							let tmpActions = tmpProvider.actions;
							Expect(tmpActions).to.have.property('ChatCompletion');
							Expect(tmpActions).to.have.property('Embedding');
							Expect(tmpActions).to.have.property('ToolUse');
							Expect(tmpActions.ChatCompletion.SettingsSchema.length).to.be.greaterThan(0);
						}
					);

				test
					(
						'LLM provider should describe actions correctly.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({});
							let tmpDescriptions = tmpProvider.describeActions();
							Expect(tmpDescriptions.length).to.equal(3);
							Expect(tmpDescriptions[0].Capability).to.equal('LLM');
						}
					);

				test
					(
						'LLM provider getCapabilities should return [LLM].',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({});
							let tmpCaps = tmpProvider.getCapabilities();
							Expect(tmpCaps).to.deep.equal(['LLM']);
						}
					);

				// --- API Key Resolution ---
				test
					(
						'LLM provider should resolve $ENV_VAR API keys.',
						function ()
						{
							process.env.TEST_LLM_API_KEY = 'resolved-key-value';
							let tmpProvider = new libBeaconProviderLLM({ APIKey: '$TEST_LLM_API_KEY' });
							let tmpResolved = tmpProvider._resolveAPIKey(tmpProvider._APIKeyConfig);
							Expect(tmpResolved).to.equal('resolved-key-value');
							delete process.env.TEST_LLM_API_KEY;
						}
					);

				test
					(
						'LLM provider should return literal API keys directly.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ APIKey: 'sk-literal-key' });
							let tmpResolved = tmpProvider._resolveAPIKey(tmpProvider._APIKeyConfig);
							Expect(tmpResolved).to.equal('sk-literal-key');
						}
					);

				test
					(
						'LLM provider should return empty string for missing env var.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ APIKey: '$NONEXISTENT_VAR_12345' });
							let tmpResolved = tmpProvider._resolveAPIKey(tmpProvider._APIKeyConfig);
							Expect(tmpResolved).to.equal('');
						}
					);

				// --- Initialize & Shutdown ---
				test
					(
						'LLM provider should initialize and resolve API key.',
						function (fDone)
						{
							process.env.TEST_LLM_INIT_KEY = 'init-resolved';
							let tmpProvider = new libBeaconProviderLLM({
								Backend: 'openai',
								BaseURL: 'https://api.openai.com/v1',
								APIKey: '$TEST_LLM_INIT_KEY',
								Model: 'gpt-4'
							});

							tmpProvider.initialize(function (pError)
							{
								Expect(pError).to.equal(null);
								Expect(tmpProvider._ResolvedAPIKey).to.equal('init-resolved');
								delete process.env.TEST_LLM_INIT_KEY;
								fDone();
							});
						}
					);

				test
					(
						'LLM provider should shutdown cleanly.',
						function (fDone)
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'openai' });
							tmpProvider.shutdown(function (pError)
							{
								Expect(pError).to.equal(null);
								fDone();
							});
						}
					);

				// --- Message Parsing ---
				test
					(
						'LLM provider should parse Messages JSON array.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({});
							let tmpMessages = tmpProvider._parseMessages({
								Messages: JSON.stringify([
									{ role: 'user', content: 'Hello' },
									{ role: 'assistant', content: 'Hi there' }
								])
							});
							Expect(tmpMessages.length).to.equal(2);
							Expect(tmpMessages[0].role).to.equal('user');
						}
					);

				test
					(
						'LLM provider should treat plain string Messages as user message.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({});
							let tmpMessages = tmpProvider._parseMessages({
								Messages: 'Just a plain question'
							});
							Expect(tmpMessages.length).to.equal(1);
							Expect(tmpMessages[0].role).to.equal('user');
							Expect(tmpMessages[0].content).to.equal('Just a plain question');
						}
					);

				test
					(
						'LLM provider should prepend SystemPrompt to messages.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({});
							let tmpMessages = tmpProvider._parseMessages({
								SystemPrompt: 'You are helpful.',
								Messages: JSON.stringify([{ role: 'user', content: 'Hello' }])
							});
							Expect(tmpMessages.length).to.equal(2);
							Expect(tmpMessages[0].role).to.equal('system');
							Expect(tmpMessages[0].content).to.equal('You are helpful.');
						}
					);

				test
					(
						'LLM provider should not duplicate SystemPrompt if system message exists.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({});
							let tmpMessages = tmpProvider._parseMessages({
								SystemPrompt: 'You are helpful.',
								Messages: JSON.stringify([
									{ role: 'system', content: 'Existing system prompt.' },
									{ role: 'user', content: 'Hello' }
								])
							});
							Expect(tmpMessages.length).to.equal(2);
							Expect(tmpMessages[0].content).to.equal('Existing system prompt.');
						}
					);

				// --- Request Body Building ---
				test
					(
						'LLM provider should build OpenAI chat request body.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'openai' });
							let tmpMessages = [{ role: 'user', content: 'Hello' }];
							let tmpBody = tmpProvider._buildChatRequestBody(tmpMessages, 'gpt-4', { Temperature: 0.5, MaxTokens: 100 }, false);
							Expect(tmpBody.model).to.equal('gpt-4');
							Expect(tmpBody.messages).to.deep.equal(tmpMessages);
							Expect(tmpBody.temperature).to.equal(0.5);
							Expect(tmpBody.max_tokens).to.equal(100);
						}
					);

				test
					(
						'LLM provider should build Anthropic chat request body with separated system.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'anthropic' });
							let tmpMessages = [
								{ role: 'system', content: 'Be helpful.' },
								{ role: 'user', content: 'Hello' }
							];
							let tmpBody = tmpProvider._buildChatRequestBody(tmpMessages, 'claude-sonnet-4-20250514', { MaxTokens: 1024 }, false);
							Expect(tmpBody.model).to.equal('claude-sonnet-4-20250514');
							Expect(tmpBody.system).to.equal('Be helpful.');
							Expect(tmpBody.messages.length).to.equal(1);
							Expect(tmpBody.messages[0].role).to.equal('user');
							Expect(tmpBody.max_tokens).to.equal(1024);
						}
					);

				test
					(
						'LLM provider should build Ollama chat request body with options.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'ollama' });
							let tmpMessages = [{ role: 'user', content: 'Hello' }];
							let tmpBody = tmpProvider._buildChatRequestBody(tmpMessages, 'llama3', { Temperature: 0.8, MaxTokens: 512 }, false);
							Expect(tmpBody.model).to.equal('llama3');
							Expect(tmpBody.messages).to.deep.equal(tmpMessages);
							Expect(tmpBody.stream).to.equal(false);
							Expect(tmpBody.options.temperature).to.equal(0.8);
							Expect(tmpBody.options.num_predict).to.equal(512);
						}
					);

				// --- Request Options ---
				test
					(
						'LLM provider should build OpenAI request options with Bearer auth.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'openai', BaseURL: 'https://api.openai.com', APIKey: 'sk-test' });
							tmpProvider._ResolvedAPIKey = 'sk-test';
							let tmpInfo = tmpProvider._buildRequestOptions('chat', { model: 'gpt-4', messages: [] });
							Expect(tmpInfo.options.hostname).to.equal('api.openai.com');
							Expect(tmpInfo.options.path).to.equal('/v1/chat/completions');
							Expect(tmpInfo.options.headers['Authorization']).to.equal('Bearer sk-test');
						}
					);

				test
					(
						'LLM provider should build Anthropic request options with x-api-key.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'anthropic', BaseURL: 'https://api.anthropic.com', APIKey: 'ak-test' });
							tmpProvider._ResolvedAPIKey = 'ak-test';
							let tmpInfo = tmpProvider._buildRequestOptions('chat', { model: 'claude-sonnet-4-20250514', messages: [] });
							Expect(tmpInfo.options.path).to.equal('/v1/messages');
							Expect(tmpInfo.options.headers['x-api-key']).to.equal('ak-test');
							Expect(tmpInfo.options.headers['anthropic-version']).to.equal('2023-06-01');
						}
					);

				test
					(
						'LLM provider should build Ollama request options without auth.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'ollama', BaseURL: 'http://localhost:11434' });
							let tmpInfo = tmpProvider._buildRequestOptions('chat', { model: 'llama3', messages: [] });
							Expect(tmpInfo.options.hostname).to.equal('localhost');
							Expect(tmpInfo.options.port).to.equal('11434');
							Expect(tmpInfo.options.path).to.equal('/api/chat');
							Expect(tmpInfo.protocol).to.equal('http:');
							Expect(tmpInfo.options.headers['Authorization']).to.be.undefined;
						}
					);

				test
					(
						'LLM provider should use embedding paths.',
						function ()
						{
							let tmpProviderOAI = new libBeaconProviderLLM({ Backend: 'openai', BaseURL: 'https://api.openai.com' });
							let tmpInfoOAI = tmpProviderOAI._buildRequestOptions('embedding', { model: 'text-embedding-3-small', input: 'test' });
							Expect(tmpInfoOAI.options.path).to.equal('/v1/embeddings');

							let tmpProviderOllama = new libBeaconProviderLLM({ Backend: 'ollama', BaseURL: 'http://localhost:11434' });
							let tmpInfoOllama = tmpProviderOllama._buildRequestOptions('embedding', { model: 'llama3', prompt: 'test' });
							Expect(tmpInfoOllama.options.path).to.equal('/api/embeddings');
						}
					);

				// --- Response Parsing ---
				test
					(
						'LLM provider should parse OpenAI chat response.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'openai' });
							let tmpParsed = tmpProvider._parseChatResponse({
								model: 'gpt-4',
								choices: [{ message: { content: 'Hello back!' }, finish_reason: 'stop' }],
								usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
							});
							Expect(tmpParsed.Content).to.equal('Hello back!');
							Expect(tmpParsed.Model).to.equal('gpt-4');
							Expect(tmpParsed.FinishReason).to.equal('stop');
							Expect(tmpParsed.PromptTokens).to.equal(10);
							Expect(tmpParsed.CompletionTokens).to.equal(5);
							Expect(tmpParsed.TotalTokens).to.equal(15);
						}
					);

				test
					(
						'LLM provider should parse Anthropic chat response.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'anthropic' });
							let tmpParsed = tmpProvider._parseChatResponse({
								model: 'claude-sonnet-4-20250514',
								content: [{ type: 'text', text: 'Hello from Claude!' }],
								stop_reason: 'end_turn',
								usage: { input_tokens: 12, output_tokens: 8 }
							});
							Expect(tmpParsed.Content).to.equal('Hello from Claude!');
							Expect(tmpParsed.Model).to.equal('claude-sonnet-4-20250514');
							Expect(tmpParsed.FinishReason).to.equal('end_turn');
							Expect(tmpParsed.PromptTokens).to.equal(12);
							Expect(tmpParsed.CompletionTokens).to.equal(8);
							Expect(tmpParsed.TotalTokens).to.equal(20);
						}
					);

				test
					(
						'LLM provider should parse Ollama chat response.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'ollama' });
							let tmpParsed = tmpProvider._parseChatResponse({
								model: 'llama3',
								message: { role: 'assistant', content: 'Ollama says hi!' },
								done: true,
								prompt_eval_count: 20,
								eval_count: 10
							});
							Expect(tmpParsed.Content).to.equal('Ollama says hi!');
							Expect(tmpParsed.Model).to.equal('llama3');
							Expect(tmpParsed.FinishReason).to.equal('stop');
							Expect(tmpParsed.TotalTokens).to.equal(30);
						}
					);

				test
					(
						'LLM provider should parse OpenAI embedding response.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'openai' });
							let tmpParsed = tmpProvider._parseEmbeddingResponse({
								model: 'text-embedding-3-small',
								data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }]
							});
							Expect(tmpParsed.Dimensions).to.equal(4);
							Expect(tmpParsed.Model).to.equal('text-embedding-3-small');
							let tmpEmbedding = JSON.parse(tmpParsed.Embedding);
							Expect(tmpEmbedding).to.deep.equal([0.1, 0.2, 0.3, 0.4]);
						}
					);

				test
					(
						'LLM provider should parse Ollama embedding response.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'ollama' });
							let tmpParsed = tmpProvider._parseEmbeddingResponse({
								model: 'llama3',
								embedding: [0.5, 0.6, 0.7]
							});
							Expect(tmpParsed.Dimensions).to.equal(3);
							let tmpEmbedding = JSON.parse(tmpParsed.Embedding);
							Expect(tmpEmbedding).to.deep.equal([0.5, 0.6, 0.7]);
						}
					);

				// --- Tool Use Response Parsing ---
				test
					(
						'LLM provider should parse OpenAI tool use response.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'openai' });
							let tmpParsed = tmpProvider._parseToolUseResponse({
								model: 'gpt-4',
								choices: [{
									message: {
										content: '',
										tool_calls: [
											{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"NYC"}' } }
										]
									},
									finish_reason: 'tool_calls'
								}],
								usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 }
							});
							Expect(tmpParsed.ToolCallCount).to.equal(1);
							Expect(tmpParsed.FinishReason).to.equal('tool_calls');
							let tmpToolCalls = JSON.parse(tmpParsed.ToolCalls);
							Expect(tmpToolCalls[0].function.name).to.equal('get_weather');
						}
					);

				test
					(
						'LLM provider should parse Anthropic tool use response and normalize to OpenAI format.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'anthropic' });
							let tmpParsed = tmpProvider._parseToolUseResponse({
								model: 'claude-sonnet-4-20250514',
								content: [
									{ type: 'text', text: 'Let me check the weather.' },
									{ type: 'tool_use', id: 'tu_1', name: 'get_weather', input: { city: 'NYC' } }
								],
								stop_reason: 'tool_use',
								usage: { input_tokens: 40, output_tokens: 30 }
							});
							Expect(tmpParsed.Content).to.equal('Let me check the weather.');
							Expect(tmpParsed.ToolCallCount).to.equal(1);
							let tmpToolCalls = JSON.parse(tmpParsed.ToolCalls);
							Expect(tmpToolCalls[0].type).to.equal('function');
							Expect(tmpToolCalls[0].function.name).to.equal('get_weather');
							let tmpArgs = JSON.parse(tmpToolCalls[0].function.arguments);
							Expect(tmpArgs.city).to.equal('NYC');
						}
					);

				// --- Tool Definitions ---
				test
					(
						'LLM provider should add OpenAI-format tools to request body.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'openai' });
							let tmpBody = { model: 'gpt-4', messages: [] };
							let tmpTools = [{ type: 'function', function: { name: 'get_weather', parameters: { type: 'object' } } }];
							tmpProvider._addToolsToRequestBody(tmpBody, tmpTools, 'auto');
							Expect(tmpBody.tools).to.deep.equal(tmpTools);
							Expect(tmpBody.tool_choice).to.equal('auto');
						}
					);

				test
					(
						'LLM provider should convert OpenAI tool format to Anthropic format.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'anthropic' });
							let tmpBody = { model: 'claude-sonnet-4-20250514', messages: [] };
							let tmpTools = [{ type: 'function', function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object' } } }];
							tmpProvider._addToolsToRequestBody(tmpBody, tmpTools, 'auto');
							Expect(tmpBody.tools[0].name).to.equal('get_weather');
							Expect(tmpBody.tools[0].input_schema).to.deep.equal({ type: 'object' });
							Expect(tmpBody.tool_choice.type).to.equal('auto');
						}
					);

				// --- Registry Integration ---
				test
					(
						'LLM provider should register in ProviderRegistry.',
						function ()
						{
							let tmpRegistry = new libBeaconProviderRegistry();
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'openai', Model: 'gpt-4' });
							let tmpResult = tmpRegistry.registerProvider(tmpProvider);
							Expect(tmpResult).to.equal(true);
							Expect(tmpRegistry.getCapabilities()).to.include('LLM');
						}
					);

				test
					(
						'LLM provider should resolve LLM:ChatCompletion in registry.',
						function ()
						{
							let tmpRegistry = new libBeaconProviderRegistry();
							tmpRegistry.registerProvider(new libBeaconProviderLLM({ Backend: 'openai' }));
							let tmpResolved = tmpRegistry.resolve('LLM', 'ChatCompletion');
							Expect(tmpResolved).to.not.equal(null);
							Expect(tmpResolved.provider.Name).to.equal('LLM');
							Expect(tmpResolved.action).to.equal('ChatCompletion');
						}
					);

				test
					(
						'LLM provider should load as built-in from registry.',
						function ()
						{
							let tmpRegistry = new libBeaconProviderRegistry();
							let tmpResult = tmpRegistry.loadProvider({ Source: 'LLM', Config: { Backend: 'ollama', BaseURL: 'http://localhost:11434', Model: 'llama3' } });
							Expect(tmpResult).to.equal(true);
							Expect(tmpRegistry.getCapabilities()).to.include('LLM');
							let tmpResolved = tmpRegistry.resolve('LLM', 'Embedding');
							Expect(tmpResolved.action).to.equal('Embedding');
						}
					);

				// --- Execute Routing ---
				test
					(
						'LLM provider should return error for unknown action.',
						function (fDone)
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'openai' });
							tmpProvider.execute('UnknownAction', {}, {}, function (pError)
							{
								Expect(pError).to.be.an.instanceOf(Error);
								Expect(pError.message).to.contain('unknown action');
								fDone();
							});
						}
					);

				test
					(
						'LLM provider should handle empty messages gracefully.',
						function (fDone)
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'openai' });
							tmpProvider.execute('ChatCompletion', { Settings: {} }, {}, function (pError, pResult)
							{
								Expect(pError).to.equal(null);
								Expect(pResult.Outputs.Content).to.equal('');
								Expect(pResult.Outputs.FinishReason).to.equal('error');
								fDone();
							});
						}
					);

				test
					(
						'LLM provider should handle empty embedding text gracefully.',
						function (fDone)
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'openai' });
							tmpProvider.execute('Embedding', { Settings: {} }, {}, function (pError, pResult)
							{
								Expect(pError).to.equal(null);
								Expect(pResult.Outputs.Embedding).to.equal('[]');
								fDone();
							});
						}
					);

				test
					(
						'LLM provider should handle empty tool use gracefully.',
						function (fDone)
						{
							let tmpProvider = new libBeaconProviderLLM({ Backend: 'openai' });
							tmpProvider.execute('ToolUse', { Settings: { Messages: JSON.stringify([{ role: 'user', content: 'test' }]) } }, {}, function (pError, pResult)
							{
								Expect(pError).to.equal(null);
								Expect(pResult.Outputs.ToolCalls).to.equal('[]');
								Expect(pResult.Outputs.FinishReason).to.equal('error');
								fDone();
							});
						}
					);

				// --- Safe JSON Parsing ---
				test
					(
						'LLM provider should safely parse invalid JSON.',
						function ()
						{
							let tmpProvider = new libBeaconProviderLLM({});
							Expect(tmpProvider._safeParseJSON('not json', 'fallback')).to.equal('fallback');
							Expect(tmpProvider._safeParseJSON(null, [])).to.deep.equal([]);
							Expect(tmpProvider._safeParseJSON('{"a":1}', null)).to.deep.equal({ a: 1 });
						}
					);

				// --- LLM Task Config Registration ---
				test
					(
						'LLM task configs should be included in built-in task configs.',
						function ()
						{
							let tmpAllConfigs = require('../source/services/tasks/Ultravisor-BuiltIn-TaskConfigs.cjs');
							let tmpLLMConfigs = tmpAllConfigs.filter(function (pConfig)
							{
								return pConfig.Definition && pConfig.Definition.Category === 'llm';
							});
							Expect(tmpLLMConfigs.length).to.equal(5);

							let tmpHashes = tmpLLMConfigs.map(function (pConfig) { return pConfig.Definition.Hash; });
							Expect(tmpHashes).to.include('add-message');
							Expect(tmpHashes).to.include('add-tool');
							Expect(tmpHashes).to.include('llm-chat-completion');
							Expect(tmpHashes).to.include('llm-embedding');
							Expect(tmpHashes).to.include('llm-tool-use');
						}
					);

				test
					(
						'LLM chat completion task should have conversation settings.',
						function ()
						{
							let tmpAllConfigs = require('../source/services/tasks/Ultravisor-BuiltIn-TaskConfigs.cjs');
							let tmpChatConfig = tmpAllConfigs.find(function (pConfig)
							{
								return pConfig.Definition && pConfig.Definition.Hash === 'llm-chat-completion';
							});

							Expect(tmpChatConfig).to.not.be.undefined;
							let tmpSettingNames = tmpChatConfig.Definition.SettingsInputs.map(function (pS) { return pS.Name; });
							Expect(tmpSettingNames).to.include('ConversationAddress');
							Expect(tmpSettingNames).to.include('AppendToConversation');
							Expect(tmpSettingNames).to.include('ConversationMaxMessages');
							Expect(tmpSettingNames).to.include('ConversationMaxTokens');
							Expect(tmpSettingNames).to.include('PersistConversation');
							Expect(tmpSettingNames).to.include('ConversationPersistAddress');
							Expect(tmpSettingNames).to.include('SystemPrompt');
							Expect(tmpSettingNames).to.include('UserPrompt');
							Expect(tmpSettingNames).to.include('InputAddress');
							Expect(tmpSettingNames).to.include('Destination');
						}
					);
			}
		);

		suite
		(
			'ReadFileBuffered TaskType',
			function()
			{
				setup ( () => { ensureTestFixtures(); } );
				teardown ( () => { cleanupTestStaging(); } );

				test
				(
					'Should read a file in a single chunk when file is smaller than buffer.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('read-file-buffered');

						let tmpSettings = {
							FilePath: TEST_INPUT_FILE,
							Encoding: 'utf8',
							MaxBufferSize: 65536,
							SplitCharacter: '\n',
							ByteOffset: 0
						};

						tmpInstance.execute(tmpSettings, { GlobalState: {}, OperationState: {}, TaskOutputs: {}, StagingPath: TEST_STAGING_ROOT, NodeHash: 'test' },
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('ReadComplete');
								Expect(pResult.Outputs.IsComplete).to.equal(true);
								Expect(pResult.Outputs.FileContent).to.contain('Hello');
								Expect(pResult.Outputs.BytesRead).to.be.greaterThan(0);
								Expect(pResult.Outputs.FileName).to.equal('test_input.txt');
								Expect(pResult.Outputs.TotalFileSize).to.be.greaterThan(0);
								fDone();
							});
					}
				);

				test
				(
					'Should read a file in chunks with continuation via ByteOffset.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('read-file-buffered');

						// Use a very small buffer to force chunking
						let tmpSettings = {
							FilePath: TEST_INPUT_FILE,
							Encoding: 'utf8',
							MaxBufferSize: 20,
							SplitCharacter: '\n',
							ByteOffset: 0
						};

						tmpInstance.execute(tmpSettings, { GlobalState: {}, OperationState: {}, TaskOutputs: {}, StagingPath: TEST_STAGING_ROOT, NodeHash: 'test' },
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('ReadComplete');
								Expect(pResult.Outputs.IsComplete).to.equal(false);
								Expect(pResult.Outputs.ByteOffset).to.be.greaterThan(0);
								Expect(pResult.Outputs.ByteOffset).to.be.lessThan(pResult.Outputs.TotalFileSize);

								// Continue reading from the new offset
								let tmpSettings2 = {
									FilePath: TEST_INPUT_FILE,
									Encoding: 'utf8',
									MaxBufferSize: 65536,
									SplitCharacter: '\n',
									ByteOffset: pResult.Outputs.ByteOffset
								};

								tmpInstance.execute(tmpSettings2, { GlobalState: {}, OperationState: {}, TaskOutputs: {}, StagingPath: TEST_STAGING_ROOT, NodeHash: 'test' },
									(pError2, pResult2) =>
									{
										Expect(pError2).to.equal(null);
										Expect(pResult2.EventToFire).to.equal('ReadComplete');
										Expect(pResult2.Outputs.IsComplete).to.equal(true);
										Expect(pResult2.Outputs.BytesRead).to.be.greaterThan(0);
										fDone();
									});
							});
					}
				);

				test
				(
					'Should return error when no FilePath specified.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('read-file-buffered');

						tmpInstance.execute({ FilePath: '' }, { GlobalState: {}, OperationState: {}, TaskOutputs: {}, StagingPath: '', NodeHash: 'test' },
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('Error');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'ReadFile MaxBytes',
			function()
			{
				setup ( () => { ensureTestFixtures(); } );
				teardown ( () => { cleanupTestStaging(); } );

				test
				(
					'Should limit bytes read when MaxBytes is set.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('read-file');

						let tmpSettings = {
							FilePath: TEST_INPUT_FILE,
							Encoding: 'utf8',
							MaxBytes: 5
						};

						tmpInstance.execute(tmpSettings, { GlobalState: {}, OperationState: {}, TaskOutputs: {}, StagingPath: TEST_STAGING_ROOT, NodeHash: 'test' },
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('ReadComplete');
								Expect(pResult.Outputs.FileContent).to.equal('Hello');
								Expect(pResult.Outputs.FileName).to.equal('test_input.txt');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'ReplaceString UseRegex',
			function()
			{
				test
				(
					'Should support regex replacement.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('replace-string');

						let tmpSettings = {
							InputString: 'Hello 123 World 456',
							SearchString: '\\d+',
							ReplaceString: '#',
							UseRegex: true
						};

						tmpInstance.execute(tmpSettings, { GlobalState: {}, OperationState: {}, TaskOutputs: {}, StagingPath: '', NodeHash: 'test' },
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('ReplaceComplete');
								Expect(pResult.Outputs.ReplacedString).to.equal('Hello # World #');
								Expect(pResult.Outputs.ReplacementCount).to.equal(2);
								fDone();
							});
					}
				);

				test
				(
					'Should support case-insensitive replacement.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('replace-string');

						let tmpSettings = {
							InputString: 'Hello hello HELLO',
							SearchString: 'hello',
							ReplaceString: 'hi',
							CaseSensitive: false
						};

						tmpInstance.execute(tmpSettings, { GlobalState: {}, OperationState: {}, TaskOutputs: {}, StagingPath: '', NodeHash: 'test' },
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('ReplaceComplete');
								Expect(pResult.Outputs.ReplacedString).to.equal('hi hi hi');
								Expect(pResult.Outputs.ReplacementCount).to.equal(3);
								fDone();
							});
					}
				);
			}
		);
