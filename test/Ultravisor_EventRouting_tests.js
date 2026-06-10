/**
 * Ultravisor — Event-Routing Behavioral Suite (see EVENT-ROUTING-TEST-PLAN.md)
 *
 * In-process engine runs validating the event-routing fixes end to end:
 *   T1-T3  value-input auto-resolve branches fire ValueInputComplete and the
 *          downstream node actually runs (these fired unroutable 'complete'
 *          before the fix — programmatic runs silently stranded).
 *   T4     interactive pause -> resume routes through the SAME wiring
 *          (convergence invariant).
 *   T5     a task firing an undeclared event logs the unrouted-event warning
 *          and downstream does not run.
 *   T6     a failed beacon work item routes the graph's Error edge
 *          (failWorkItem resume — 'error' never matched before the fix).
 */
const Chai = require('chai');
const Expect = Chai.expect;
const libPath = require('path');
const libFS = require('fs');
const libPict = require('pict');

const libUltravisorTaskTypeRegistry = require('../source/services/Ultravisor-TaskTypeRegistry.cjs');
const libUltravisorStateManager = require('../source/services/Ultravisor-StateManager.cjs');
const libUltravisorExecutionEngine = require('../source/services/Ultravisor-ExecutionEngine.cjs');
const libUltravisorExecutionManifest = require('../source/services/Ultravisor-ExecutionManifest.cjs');
const libUltravisorBeaconCoordinator = require('../source/services/Ultravisor-Beacon-Coordinator.cjs');

const TEST_STAGING_ROOT = libPath.resolve(__dirname, '..', '.test_staging_event_routing');

function createTestFable()
{
	if (!libFS.existsSync(TEST_STAGING_ROOT))
	{
		libFS.mkdirSync(TEST_STAGING_ROOT, { recursive: true });
	}
	let tmpFable = new libPict({ Product: 'Ultravisor-EventRouting-Test', LogLevel: 5, UltravisorStagingRoot: TEST_STAGING_ROOT });
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorTaskTypeRegistry', libUltravisorTaskTypeRegistry);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorStateManager', libUltravisorStateManager);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionEngine', libUltravisorExecutionEngine);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionManifest', libUltravisorExecutionManifest);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconCoordinator', libUltravisorBeaconCoordinator);
	let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
	tmpRegistry.registerBuiltInTaskTypes();
	return tmpFable;
}

function getService(pFable, pName)
{
	let tmpMap = pFable.servicesMap[pName];
	return tmpMap ? Object.values(tmpMap)[0] : null;
}

// start -> input-1 (value-input) -> marker (error-message) -> end
function buildValueInputGraph(pInputSettings)
{
	return {
		Hash: 'OPR-EVENT-ROUTING-VI',
		Name: 'Event Routing — value-input',
		Graph: {
			Nodes: [
				{ Hash: 'start-1', Type: 'start', Ports: [ { Hash: 'start-1-eo-Begin', Label: 'Begin' } ] },
				{
					Hash: 'input-1', Type: 'value-input', DefinitionHash: 'value-input',
					Settings: pInputSettings,
					Ports: [
						{ Hash: 'input-1-ei-Trigger', Label: 'Trigger' },
						{ Hash: 'input-1-eo-ValueInputComplete', Label: 'ValueInputComplete' }
					]
				},
				{
					Hash: 'marker-1', Type: 'error-message', DefinitionHash: 'error-message',
					Settings: { Message: 'marker reached — downstream of value-input ran' },
					Ports: [
						{ Hash: 'marker-1-ei-Execute', Label: 'Execute' },
						{ Hash: 'marker-1-eo-Complete', Label: 'Complete' }
					]
				},
				{ Hash: 'end-1', Type: 'end', Ports: [ { Hash: 'end-1-ei-Finish', Label: 'Finish' } ] }
			],
			Connections: [
				{ SourceNodeHash: 'start-1', SourcePortHash: 'start-1-eo-Begin', TargetNodeHash: 'input-1', TargetPortHash: 'input-1-ei-Trigger', ConnectionType: 'Event' },
				{ SourceNodeHash: 'input-1', SourcePortHash: 'input-1-eo-ValueInputComplete', TargetNodeHash: 'marker-1', TargetPortHash: 'marker-1-ei-Execute', ConnectionType: 'Event' },
				{ SourceNodeHash: 'marker-1', SourcePortHash: 'marker-1-eo-Complete', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' }
			]
		}
	};
}

suite('Event routing — behavioral validation (EVENT-ROUTING-TEST-PLAN.md L2)', () =>
{
	suite('value-input auto-resolve fires ValueInputComplete (C)', () =>
	{
		test('T1: pre-seeded state auto-resolves and downstream runs', (fDone) =>
		{
			let tmpFable = createTestFable();
			let tmpEngine = getService(tmpFable, 'UltravisorExecutionEngine');
			let tmpOperation = buildValueInputGraph({ PromptMessage: 'Value?', OutputAddress: 'Operation.TestValue' });
			tmpEngine.executeOperation(tmpOperation, { OperationState: { TestValue: 'pre-seeded' } },
				(pError, pContext) =>
				{
					Expect(pError).to.equal(null);
					Expect(pContext.Status).to.equal('Complete', 'auto-resolve must not pause');
					Expect(pContext.TaskOutputs['input-1'].InputValue).to.equal('pre-seeded');
					Expect(pContext.TaskOutputs['marker-1']).to.not.equal(undefined, 'downstream marker must run — ValueInputComplete must route');
					fDone();
				});
		});

		test('T2: programmatic DefaultValue auto-resolves and downstream runs', (fDone) =>
		{
			let tmpFable = createTestFable();
			let tmpEngine = getService(tmpFable, 'UltravisorExecutionEngine');
			let tmpOperation = buildValueInputGraph({ PromptMessage: 'Value?', OutputAddress: 'Operation.TestValue', DefaultValue: 'the-default' });
			tmpEngine.executeOperation(tmpOperation, { OperationState: { SomethingElse: 'present' } },
				(pError, pContext) =>
				{
					Expect(pError).to.equal(null);
					Expect(pContext.Status).to.equal('Complete');
					Expect(pContext.TaskOutputs['input-1'].InputValue).to.equal('the-default');
					Expect(pContext.TaskOutputs['marker-1']).to.not.equal(undefined, 'downstream marker must run');
					fDone();
				});
		});

		test('T3: programmatic optional field auto-resolves empty and downstream runs', (fDone) =>
		{
			let tmpFable = createTestFable();
			let tmpEngine = getService(tmpFable, 'UltravisorExecutionEngine');
			let tmpOperation = buildValueInputGraph({ PromptMessage: 'Value?', OutputAddress: 'Operation.TestValue', InputSchema: { Required: false } });
			tmpEngine.executeOperation(tmpOperation, { OperationState: { SomethingElse: 'present' } },
				(pError, pContext) =>
				{
					Expect(pError).to.equal(null);
					Expect(pContext.Status).to.equal('Complete');
					Expect(pContext.TaskOutputs['input-1'].InputValue).to.equal('');
					Expect(pContext.TaskOutputs['marker-1']).to.not.equal(undefined, 'downstream marker must run');
					fDone();
				});
		});

		test('T4: interactive pause then resume routes the same wiring (convergence)', (fDone) =>
		{
			let tmpFable = createTestFable();
			let tmpEngine = getService(tmpFable, 'UltravisorExecutionEngine');
			let tmpOperation = buildValueInputGraph({ PromptMessage: 'Value?', OutputAddress: 'Operation.TestValue' });
			tmpEngine.executeOperation(tmpOperation,
				(pError, pContext) =>
				{
					Expect(pError).to.equal(null);
					Expect(pContext.Status).to.equal('Waiting', 'interactive mode must pause');
					Expect(pContext.TaskOutputs['marker-1']).to.equal(undefined, 'downstream must not run before input');
					tmpEngine.resumeOperation(pContext.Hash, 'input-1', 'typed-by-user',
						(pResumeError, pResumedContext) =>
						{
							Expect(pResumeError).to.equal(null);
							Expect(pResumedContext.Status).to.equal('Complete');
							Expect(pResumedContext.TaskOutputs['marker-1']).to.not.equal(undefined, 'downstream marker must run after resume');
							fDone();
						});
				});
		});
	});

	suite('unrouted-event diagnostic (D)', () =>
	{
		test('T5: undeclared fired event warns and strands downstream (visibly)', (fDone) =>
		{
			let tmpFable = createTestFable();
			let tmpRegistry = getService(tmpFable, 'UltravisorTaskTypeRegistry');
			let tmpEngine = getService(tmpFable, 'UltravisorExecutionEngine');

			tmpRegistry.registerTaskTypesFromConfigArray([
				{
					Definition: {
						Hash: 'mismatch-firer', Type: 'mismatch-firer', Name: 'Mismatch Firer', Category: 'test', Tier: 'Core',
						EventInputs: [ { Name: 'Trigger' } ],
						EventOutputs: [ { Name: 'Complete' } ],
						SettingsInputs: [], StateOutputs: [], DefaultSettings: {}
					},
					Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
					{
						return fCallback(null, { EventToFire: 'Mismatched', Outputs: { Ran: true }, Log: [] });
					}
				}
			]);

			let tmpOperation = {
				Hash: 'OPR-EVENT-ROUTING-WARN',
				Name: 'Event Routing — unrouted warn',
				Graph: {
					Nodes: [
						{ Hash: 'start-1', Type: 'start', Ports: [ { Hash: 'start-1-eo-Begin', Label: 'Begin' } ] },
						{ Hash: 'mf-1', Type: 'mismatch-firer', DefinitionHash: 'mismatch-firer', Settings: {},
						  Ports: [ { Hash: 'mf-1-ei-Trigger', Label: 'Trigger' }, { Hash: 'mf-1-eo-Complete', Label: 'Complete' } ] },
						{ Hash: 'marker-1', Type: 'error-message', DefinitionHash: 'error-message', Settings: { Message: 'should not run' },
						  Ports: [ { Hash: 'marker-1-ei-Execute', Label: 'Execute' }, { Hash: 'marker-1-eo-Complete', Label: 'Complete' } ] },
						{ Hash: 'end-1', Type: 'end', Ports: [ { Hash: 'end-1-ei-Finish', Label: 'Finish' } ] }
					],
					Connections: [
						{ SourceNodeHash: 'start-1', SourcePortHash: 'start-1-eo-Begin', TargetNodeHash: 'mf-1', TargetPortHash: 'mf-1-ei-Trigger', ConnectionType: 'Event' },
						{ SourceNodeHash: 'mf-1', SourcePortHash: 'mf-1-eo-Complete', TargetNodeHash: 'marker-1', TargetPortHash: 'marker-1-ei-Execute', ConnectionType: 'Event' },
						{ SourceNodeHash: 'marker-1', SourcePortHash: 'marker-1-eo-Complete', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' }
					]
				}
			};

			tmpEngine.executeOperation(tmpOperation,
				(pError, pContext) =>
				{
					Expect(pError).to.equal(null);
					Expect(pContext.TaskOutputs['marker-1']).to.equal(undefined, 'downstream must not run on a mismatched event');
					let tmpWarnLine = pContext.Log.find((pLine) => pLine.indexOf('fired event [Mismatched]') >= 0 && pLine.indexOf('[mf-1]') >= 0);
					Expect(tmpWarnLine).to.not.equal(undefined, 'the unrouted-event warning must name the node and event');
					fDone();
				});
		});
	});

	suite('beacon failure routes the Error edge (B, end-to-end)', () =>
	{
		test('T6: failWorkItem resumes the graph down the Error connection', (fDone) =>
		{
			let tmpFable = createTestFable();
			let tmpEngine = getService(tmpFable, 'UltravisorExecutionEngine');
			let tmpCoordinator = getService(tmpFable, 'UltravisorBeaconCoordinator');
			tmpCoordinator.registerBeacon({ Name: 'TestBeacon', Capabilities: [ 'Shell' ] });

			let tmpOperation = {
				Hash: 'OPR-EVENT-ROUTING-ERR',
				Name: 'Event Routing — error edge',
				Graph: {
					Nodes: [
						{ Hash: 'start-1', Type: 'start', Ports: [ { Hash: 'start-1-eo-Begin', Label: 'Begin' } ] },
						{ Hash: 'dispatch-1', Type: 'beacon-dispatch', DefinitionHash: 'beacon-dispatch',
						  Settings: { RemoteCapability: 'Shell', RemoteAction: 'Execute', Command: 'echo', Parameters: 'hello' },
						  Ports: [
							{ Hash: 'dispatch-1-ei-Trigger', Label: 'Trigger' },
							{ Hash: 'dispatch-1-eo-Complete', Label: 'Complete' },
							{ Hash: 'dispatch-1-eo-Error', Label: 'Error' }
						  ] },
						{ Hash: 'err-marker-1', Type: 'error-message', DefinitionHash: 'error-message', Settings: { Message: 'error edge reached' },
						  Ports: [ { Hash: 'err-marker-1-ei-Execute', Label: 'Execute' }, { Hash: 'err-marker-1-eo-Complete', Label: 'Complete' } ] },
						{ Hash: 'end-1', Type: 'end', Ports: [ { Hash: 'end-1-ei-Finish', Label: 'Finish' } ] }
					],
					Connections: [
						{ SourceNodeHash: 'start-1', SourcePortHash: 'start-1-eo-Begin', TargetNodeHash: 'dispatch-1', TargetPortHash: 'dispatch-1-ei-Trigger', ConnectionType: 'Event' },
						{ SourceNodeHash: 'dispatch-1', SourcePortHash: 'dispatch-1-eo-Complete', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' },
						{ SourceNodeHash: 'dispatch-1', SourcePortHash: 'dispatch-1-eo-Error', TargetNodeHash: 'err-marker-1', TargetPortHash: 'err-marker-1-ei-Execute', ConnectionType: 'Event' },
						{ SourceNodeHash: 'err-marker-1', SourcePortHash: 'err-marker-1-eo-Complete', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' }
					]
				}
			};

			tmpEngine.executeOperation(tmpOperation,
				(pError, pContext) =>
				{
					Expect(pError).to.equal(null);
					Expect(pContext.Status).to.equal('Waiting', 'dispatch must pause for the beacon');
					let tmpWorkItems = tmpCoordinator.listWorkItems();
					Expect(tmpWorkItems.length).to.equal(1);
					let tmpHash = tmpWorkItems[0].WorkItemHash;
					tmpCoordinator._WorkQueue[tmpHash].MaxAttempts = 1;

					tmpCoordinator.failWorkItem(tmpHash, { ErrorMessage: 'synthetic beacon failure' },
						(pFailError) =>
						{
							Expect(pFailError).to.not.exist;
							Expect(pContext.TaskOutputs['err-marker-1']).to.not.equal(undefined,
								'the Error edge must route to the error marker — before the fix the lowercase resume event stranded it');
							fDone();
						});
				});
		});
	});
});
