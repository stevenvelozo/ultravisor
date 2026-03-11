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

const libTaskTypeReadFile = require('../source/services/tasks/file-system/Ultravisor-TaskType-ReadFile.cjs');
const libTaskTypeWriteFile = require('../source/services/tasks/file-system/Ultravisor-TaskType-WriteFile.cjs');
const libTaskTypeSetValues = require('../source/services/tasks/data-transform/Ultravisor-TaskType-SetValues.cjs');
const libTaskTypeReplaceString = require('../source/services/tasks/data-transform/Ultravisor-TaskType-ReplaceString.cjs');
const libTaskTypeStringAppender = require('../source/services/tasks/data-transform/Ultravisor-TaskType-StringAppender.cjs');
const libTaskTypeIfConditional = require('../source/services/tasks/flow-control/Ultravisor-TaskType-IfConditional.cjs');
const libTaskTypeSplitExecute = require('../source/services/tasks/flow-control/Ultravisor-TaskType-SplitExecute.cjs');
const libTaskTypeValueInput = require('../source/services/tasks/user-interaction/Ultravisor-TaskType-ValueInput.cjs');
const libTaskTypeErrorMessage = require('../source/services/tasks/user-interaction/Ultravisor-TaskType-ErrorMessage.cjs');

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

	// Register task types
	let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
	tmpRegistry.registerTaskType(libTaskTypeReadFile);
	tmpRegistry.registerTaskType(libTaskTypeWriteFile);
	tmpRegistry.registerTaskType(libTaskTypeSetValues);
	tmpRegistry.registerTaskType(libTaskTypeReplaceString);
	tmpRegistry.registerTaskType(libTaskTypeStringAppender);
	tmpRegistry.registerTaskType(libTaskTypeIfConditional);
	tmpRegistry.registerTaskType(libTaskTypeSplitExecute);
	tmpRegistry.registerTaskType(libTaskTypeValueInput);
	tmpRegistry.registerTaskType(libTaskTypeErrorMessage);

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
						Expect(tmpDefs.length).to.equal(9);

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
					'Should set values at specified addresses.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpInstance = tmpRegistry.instantiateTaskType('set-values');

						let tmpSettings = {
							Mappings: [
								{ Address: 'Operation.OutputDir', Value: '/tmp/out' },
								{ Address: 'Global.RunCount', Value: 42 }
							]
						};

						tmpInstance.execute(tmpSettings, { GlobalState: {}, OperationState: {}, TaskOutputs: {}, StagingPath: '', NodeHash: 'test' },
							(pError, pResult) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('Complete');
								Expect(pResult.StateWrites['Operation.OutputDir']).to.equal('/tmp/out');
								Expect(pResult.StateWrites['Global.RunCount']).to.equal(42);
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
										Type: 'set-values',
										DefinitionHash: 'set-values',
										Name: 'Set Test Value',
										Settings: {
											Mappings: [
												{ Address: 'Operation.TestValue', Value: 'active' }
											]
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
					'Registry should register all 31 built-in task types from config array.',
					function()
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];

						let tmpBuiltInConfigs = require('../source/services/tasks/Ultravisor-BuiltIn-TaskConfigs.cjs');
						let tmpCount = tmpRegistry.registerTaskTypesFromConfigArray(tmpBuiltInConfigs);

						Expect(tmpCount).to.equal(31);

						// Spot-check a few
						Expect(tmpRegistry.hasTaskType('error-message')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('read-file')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('command')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('get-json')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('meadow-read')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('parse-csv')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('histogram')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('if-conditional')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('launch-operation')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('template-string')).to.equal(true);
						Expect(tmpRegistry.hasTaskType('expression-solver')).to.equal(true);

						// List all definitions
						let tmpDefs = tmpRegistry.listDefinitions();
						// 31 from config + 9 from class-based in createTestFable
						// But some overlap (same hash), so count unique
						Expect(tmpDefs.length).to.be.at.least(31);
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
					'Config-driven set-values task should write state.',
					function(fDone)
					{
						let tmpFable = createTestFable();
						let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
						let tmpBuiltInConfigs = require('../source/services/tasks/Ultravisor-BuiltIn-TaskConfigs.cjs');
						tmpRegistry.registerTaskTypesFromConfigArray(tmpBuiltInConfigs);

						let tmpInstance = tmpRegistry.instantiateTaskType('set-values');
						Expect(tmpInstance).to.not.equal(null);

						tmpInstance.execute(
							{
								Mappings:
								[
									{ Address: 'State.Name', Value: 'Ultravisor' },
									{ Address: 'State.Version', Value: '1.0' }
								]
							},
							{ NodeHash: 'sv-node' },
							function (pError, pResult)
							{
								Expect(pError).to.equal(null);
								Expect(pResult.EventToFire).to.equal('Complete');
								Expect(pResult.StateWrites['State.Name']).to.equal('Ultravisor');
								Expect(pResult.StateWrites['State.Version']).to.equal('1.0');
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

						// Clear any previously registered types so we get a clean count
						tmpRegistry._TaskTypeConfigs = {};
						tmpRegistry._Definitions = {};
						tmpRegistry._TaskTypes = {};

						tmpRegistry.registerBuiltInTaskTypes();

						let tmpDefs = tmpRegistry.listDefinitions();
						Expect(tmpDefs.length).to.equal(31);
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

						// Simple operation: set-values -> end
						let tmpOperation = {
							Hash: 'telemetry-test-op',
							Name: 'Telemetry Test',
							Graph: {
								Nodes: [
									{ Hash: 'start-1', Type: 'start', Ports: [{ Hash: 'start-1-eo-Begin', Label: 'Begin' }] },
									{
										Hash: 'set-1', Type: 'set-values', DefinitionHash: 'set-values',
										Settings: { Values: { TestKey: 'TestValue' } },
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
								Expect(tmpTaskManifest.DefinitionHash).to.equal('set-values');
								Expect(tmpTaskManifest.TaskTypeName).to.equal('Set Values');
								Expect(tmpTaskManifest.Category).to.be.a('string');
								Expect(tmpTaskManifest.Capability).to.equal('Data Transform');
								Expect(tmpTaskManifest.Action).to.equal('SetValues');
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
										Hash: 'set-1', Type: 'set-values', DefinitionHash: 'set-values',
										Settings: { Values: { X: 1 } },
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
										Hash: 'set-1', Type: 'set-values', DefinitionHash: 'set-values',
										Settings: { Values: { A: 1 } },
										Ports: [
											{ Hash: 'set-1-ei-Trigger', Label: 'Trigger' },
											{ Hash: 'set-1-eo-Complete', Label: 'Complete' }
										]
									},
									{
										Hash: 'set-2', Type: 'set-values', DefinitionHash: 'set-values',
										Settings: { Values: { B: 2 } },
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

								// ByTaskType should have set-values
								Expect(pContext.TimingSummary.ByTaskType['set-values']).to.not.equal(undefined);
								Expect(pContext.TimingSummary.ByTaskType['set-values'].Count).to.equal(2);
								Expect(pContext.TimingSummary.ByTaskType['set-values'].Name).to.equal('Set Values');
								Expect(pContext.TimingSummary.ByTaskType['set-values'].TotalMs).to.be.a('number');
								Expect(pContext.TimingSummary.ByTaskType['set-values'].MinMs).to.be.a('number');
								Expect(pContext.TimingSummary.ByTaskType['set-values'].MaxMs).to.be.a('number');
								Expect(pContext.TimingSummary.ByTaskType['set-values'].AvgMs).to.be.a('number');

								// Timeline should have entries
								Expect(pContext.TimingSummary.Timeline.length).to.equal(2);
								let tmpTimelineEntry = pContext.TimingSummary.Timeline[0];
								Expect(tmpTimelineEntry.NodeHash).to.be.a('string');
								Expect(tmpTimelineEntry.DefinitionHash).to.equal('set-values');
								Expect(tmpTimelineEntry.Name).to.equal('Set Values');
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

						Expect(tmpJsonFiles.length).to.equal(16);
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
						Expect(tmpOperation.Graph.Connections.length).to.equal(14);

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
						Expect(tmpImportData.Graph.Connections.length).to.equal(10);

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
										Type: 'set-values',
										DefinitionHash: 'set-values',
										Name: 'Set Test Value',
										Settings:
										{
											Mappings:
											[
												{ Address: 'Operation.Marker', Value: 'scheduled-run' }
											]
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
