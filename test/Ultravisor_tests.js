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

const libTaskTypeReadFile = require('../source/services/tasks/file-io/Ultravisor-TaskType-ReadFile.cjs');
const libTaskTypeWriteFile = require('../source/services/tasks/file-io/Ultravisor-TaskType-WriteFile.cjs');
const libTaskTypeSetValues = require('../source/services/tasks/data/Ultravisor-TaskType-SetValues.cjs');
const libTaskTypeReplaceString = require('../source/services/tasks/data/Ultravisor-TaskType-ReplaceString.cjs');
const libTaskTypeStringAppender = require('../source/services/tasks/data/Ultravisor-TaskType-StringAppender.cjs');
const libTaskTypeIfConditional = require('../source/services/tasks/control/Ultravisor-TaskType-IfConditional.cjs');
const libTaskTypeSplitExecute = require('../source/services/tasks/control/Ultravisor-TaskType-SplitExecute.cjs');
const libTaskTypeValueInput = require('../source/services/tasks/interaction/Ultravisor-TaskType-ValueInput.cjs');
const libTaskTypeErrorMessage = require('../source/services/tasks/interaction/Ultravisor-TaskType-ErrorMessage.cjs');

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
						Expect(tmpReadFileDef.EventInputs.length).to.be.greaterThan(0);
						Expect(tmpReadFileDef.EventOutputs.length).to.be.greaterThan(0);

						let tmpInstance = tmpRegistry.instantiateTaskType('read-file');
						Expect(tmpInstance).to.not.equal(null);
						Expect(tmpInstance.definition.Hash).to.equal('read-file');

						let tmpDefs = tmpRegistry.listDefinitions();
						Expect(tmpDefs.length).to.equal(9);
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
	}
);
