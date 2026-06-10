/**
 * Ultravisor — If-Conditional Expression Suite
 *
 * Covers the if-conditional task's Expression evaluation in BOTH variants
 * (the config-driven tier entry and the class-based TaskType). Both previously
 * called `fable.ExpressionParser.resolve`, which does not exist (fable's API is
 * `solve`) — the throw was caught and EVERY Expression-based conditional
 * silently routed down the False branch.
 *
 * Coercion is load-bearing: solve returns STRINGS, and boolean comparisons
 * come back as '1'/'0'. The string '0' is truthy in JS, so without explicit
 * coercion a false comparison would route True. C2/K2 pin that trap.
 */
const Chai = require('chai');
const Expect = Chai.expect;
const libFS = require('fs');
const libPath = require('path');
const libPict = require('pict');

const libFlowControlConfigs = require('../source/services/tasks/flow-control/Ultravisor-TaskConfigs-FlowControl.cjs');
const libTaskTypeIfConditional = require('../source/services/tasks/flow-control/Ultravisor-TaskType-IfConditional.cjs');
const libUltravisorTaskTypeRegistry = require('../source/services/Ultravisor-TaskTypeRegistry.cjs');
const libUltravisorStateManager = require('../source/services/Ultravisor-StateManager.cjs');
const libUltravisorExecutionEngine = require('../source/services/Ultravisor-ExecutionEngine.cjs');
const libUltravisorExecutionManifest = require('../source/services/Ultravisor-ExecutionManifest.cjs');

const TEST_STAGING_ROOT = libPath.resolve(__dirname, '..', '.test_staging_if_conditional');

const IF_CONFIG = libFlowControlConfigs.find((pConfig) => pConfig.Definition && pConfig.Definition.Type === 'if-conditional');

function buildRealFable()
{
	return new libPict({ Product: 'Ultravisor-IfConditional-Test', LogStreams: [ { streamtype: 'console', level: 'fatal' } ] });
}

function executeConfig(pFable, pSettings, pExecutionContext)
{
	let tmpResult = null;
	IF_CONFIG.Execute({ fable: pFable, log: pFable.log }, pSettings || {}, pExecutionContext || {},
		(pError, pCallbackResult) => { tmpResult = pCallbackResult; });
	return tmpResult;
}

suite('If-Conditional expression evaluation', () =>
{
	suite('config-driven executor', () =>
	{
		let _Fable = null;
		suiteSetup(() => { _Fable = buildRealFable(); });

		test('C1: a true comparison routes True', () =>
		{
			Expect(executeConfig(_Fable, { Expression: '2 > 1' }, {}).EventToFire).to.equal('True');
		});

		test('C2: a false comparison routes False (the "0"-string coercion trap)', () =>
		{
			Expect(executeConfig(_Fable, { Expression: '1 > 2' }, {}).EventToFire).to.equal('False');
		});

		test('C3: expressions reference Operation state and branch on its value', () =>
		{
			Expect(executeConfig(_Fable, { Expression: 'Operation.X > 5' }, { OperationState: { X: 9 } }).EventToFire).to.equal('True');
			Expect(executeConfig(_Fable, { Expression: 'Operation.X > 5' }, { OperationState: { X: 3 } }).EventToFire).to.equal('False');
		});

		test('C4: the DataAddress comparison path still works (regression)', () =>
		{
			let tmpContext = { StateManager: { resolveAddress: () => 5 }, NodeHash: 'n' };
			Expect(executeConfig(_Fable, { DataAddress: 'Operation.Y', CompareValue: 5, Operator: '==' }, tmpContext).EventToFire).to.equal('True');
			tmpContext.StateManager.resolveAddress = () => 7;
			Expect(executeConfig(_Fable, { DataAddress: 'Operation.Y', CompareValue: 5, Operator: '==' }, tmpContext).EventToFire).to.equal('False');
		});

		test('C5: a parser throw routes False (declared event)', () =>
		{
			let tmpThrowingFable = { ExpressionParser: { solve: () => { throw new Error('synthetic parser failure'); } }, manifest: {}, log: _Fable.log };
			let tmpResult = null;
			IF_CONFIG.Execute({ fable: tmpThrowingFable, log: _Fable.log }, { Expression: '2 > 1' }, {},
				(pError, pCallbackResult) => { tmpResult = pCallbackResult; });
			Expect(tmpResult.EventToFire).to.equal('False');
			Expect(IF_CONFIG.Definition.EventOutputs.map((pOutput) => pOutput.Name)).to.include(tmpResult.EventToFire);
		});
	});

	suite('class-based TaskType twin', () =>
	{
		function executeClass(pSettings, pExecutionContext)
		{
			let tmpFable = buildRealFable();
			tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorTaskTypeRegistry', libUltravisorTaskTypeRegistry);
			let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
			tmpRegistry.registerTaskType(libTaskTypeIfConditional);
			let tmpInstance = tmpRegistry.instantiateTaskType('if-conditional');
			let tmpResult = null;
			tmpInstance.execute(pSettings || {}, pExecutionContext || {}, (pError, pCallbackResult) => { tmpResult = pCallbackResult; });
			return tmpResult;
		}

		test('K1: a true comparison routes True', () =>
		{
			Expect(executeClass({ Expression: '2 > 1' }, { OperationState: {} }).EventToFire).to.equal('True');
		});

		test('K2: a false comparison routes False (the "0"-string coercion trap)', () =>
		{
			Expect(executeClass({ Expression: '1 > 2' }, { OperationState: {} }).EventToFire).to.equal('False');
		});
	});

	suite('engine integration', () =>
	{
		function buildConditionalGraph()
		{
			return {
				Hash: 'OPR-IF-CONDITIONAL-E1',
				Name: 'If-conditional branch routing',
				Graph: {
					Nodes: [
						{ Hash: 'start-1', Type: 'start', Ports: [ { Hash: 'start-1-eo-Begin', Label: 'Begin' } ] },
						{ Hash: 'if-1', Type: 'if-conditional', DefinitionHash: 'if-conditional',
						  Settings: { Expression: 'Operation.X > 5' },
						  Ports: [
							{ Hash: 'if-1-ei-Evaluate', Label: 'Evaluate' },
							{ Hash: 'if-1-eo-True', Label: 'True' },
							{ Hash: 'if-1-eo-False', Label: 'False' }
						  ] },
						{ Hash: 'true-marker', Type: 'error-message', DefinitionHash: 'error-message', Settings: { Message: 'true branch' },
						  Ports: [ { Hash: 'true-marker-ei-Execute', Label: 'Execute' }, { Hash: 'true-marker-eo-Complete', Label: 'Complete' } ] },
						{ Hash: 'false-marker', Type: 'error-message', DefinitionHash: 'error-message', Settings: { Message: 'false branch' },
						  Ports: [ { Hash: 'false-marker-ei-Execute', Label: 'Execute' }, { Hash: 'false-marker-eo-Complete', Label: 'Complete' } ] },
						{ Hash: 'end-1', Type: 'end', Ports: [ { Hash: 'end-1-ei-Finish', Label: 'Finish' } ] }
					],
					Connections: [
						{ SourceNodeHash: 'start-1', SourcePortHash: 'start-1-eo-Begin', TargetNodeHash: 'if-1', TargetPortHash: 'if-1-ei-Evaluate', ConnectionType: 'Event' },
						{ SourceNodeHash: 'if-1', SourcePortHash: 'if-1-eo-True', TargetNodeHash: 'true-marker', TargetPortHash: 'true-marker-ei-Execute', ConnectionType: 'Event' },
						{ SourceNodeHash: 'if-1', SourcePortHash: 'if-1-eo-False', TargetNodeHash: 'false-marker', TargetPortHash: 'false-marker-ei-Execute', ConnectionType: 'Event' },
						{ SourceNodeHash: 'true-marker', SourcePortHash: 'true-marker-eo-Complete', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' },
						{ SourceNodeHash: 'false-marker', SourcePortHash: 'false-marker-eo-Complete', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' }
					]
				}
			};
		}

		function runWithX(pXValue, fAssert, fDone)
		{
			if (!libFS.existsSync(TEST_STAGING_ROOT)) { libFS.mkdirSync(TEST_STAGING_ROOT, { recursive: true }); }
			let tmpFable = new libPict({ Product: 'Ultravisor-IfConditional-Engine-Test', LogLevel: 5, UltravisorStagingRoot: TEST_STAGING_ROOT });
			tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorTaskTypeRegistry', libUltravisorTaskTypeRegistry);
			tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorStateManager', libUltravisorStateManager);
			tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionEngine', libUltravisorExecutionEngine);
			tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionManifest', libUltravisorExecutionManifest);
			let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
			tmpRegistry.registerBuiltInTaskTypes();
			let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];
			tmpEngine.executeOperation(buildConditionalGraph(), { OperationState: { X: pXValue } },
				(pError, pContext) =>
				{
					Expect(pError).to.equal(null);
					Expect(pContext.Status).to.equal('Complete');
					fAssert(pContext);
					fDone();
				});
		}

		test('E1: X=9 routes the True branch only', (fDone) =>
		{
			runWithX(9, (pContext) =>
			{
				Expect(pContext.TaskOutputs['true-marker']).to.not.equal(undefined, 'true branch must run');
				Expect(pContext.TaskOutputs['false-marker']).to.equal(undefined, 'false branch must not run');
			}, fDone);
		});

		test('E2: X=3 routes the False branch only', (fDone) =>
		{
			runWithX(3, (pContext) =>
			{
				Expect(pContext.TaskOutputs['false-marker']).to.not.equal(undefined, 'false branch must run');
				Expect(pContext.TaskOutputs['true-marker']).to.equal(undefined, 'true branch must not run');
			}, fDone);
		});
	});
});
