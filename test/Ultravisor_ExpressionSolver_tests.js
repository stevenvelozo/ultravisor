/**
 * Ultravisor — Expression-Solver Task Suite
 *
 * Covers the expression-solver task's evaluation paths. The task previously
 * called `fable.ExpressionParser.resolve`, which does not exist (fable's API
 * is `solve`), so EVERY execution failed and — because the node fires `Error`
 * and most graphs wire no Error edge — the failure surfaced only as a stranded
 * downstream and a Failed run. These tests drive the executor directly (real
 * fable ExpressionParser) and one full in-process engine run.
 */
const Chai = require('chai');
const Expect = Chai.expect;
const libFS = require('fs');
const libPath = require('path');
const libPict = require('pict');

const libDataTransformConfigs = require('../source/services/tasks/data-transform/Ultravisor-TaskConfigs-DataTransform.cjs');
const libUltravisorTaskTypeRegistry = require('../source/services/Ultravisor-TaskTypeRegistry.cjs');
const libUltravisorStateManager = require('../source/services/Ultravisor-StateManager.cjs');
const libUltravisorExecutionEngine = require('../source/services/Ultravisor-ExecutionEngine.cjs');
const libUltravisorExecutionManifest = require('../source/services/Ultravisor-ExecutionManifest.cjs');

const TEST_STAGING_ROOT = libPath.resolve(__dirname, '..', '.test_staging_expression_solver');

const SOLVER_CONFIG = libDataTransformConfigs.find((pConfig) => pConfig.Definition && pConfig.Definition.Type === 'expression-solver');

function buildRealFable()
{
	return new libPict({ Product: 'Ultravisor-ExprSolver-Test', LogStreams: [ { streamtype: 'console', level: 'fatal' } ] });
}

function executeSolver(pFable, pSettings, pExecutionContext)
{
	let tmpResult = null;
	SOLVER_CONFIG.Execute({ fable: pFable, log: pFable.log }, pSettings || {}, pExecutionContext || {},
		(pError, pCallbackResult) => { tmpResult = pCallbackResult; });
	return tmpResult;
}

suite('Expression Solver task', () =>
{
	suite('executor (real fable ExpressionParser)', () =>
	{
		let _Fable = null;
		suiteSetup(() => { _Fable = buildRealFable(); });

		test('U1: plain arithmetic evaluates', () =>
		{
			let tmpOut = executeSolver(_Fable, { Expression: '6 * 7' }, {});
			Expect(tmpOut.EventToFire).to.equal('Complete');
			Expect(tmpOut.Outputs.Result).to.equal('42');
		});

		test('U2: expressions can reference Operation state directly', () =>
		{
			let tmpOut = executeSolver(_Fable, { Expression: 'Operation.X + 1' }, { OperationState: { X: 41 } });
			Expect(tmpOut.EventToFire).to.equal('Complete');
			Expect(tmpOut.Outputs.Result).to.equal('42');
		});

		test('U3: Destination produces a StateWrite of the result', () =>
		{
			let tmpOut = executeSolver(_Fable, { Expression: '6 * 7', Destination: 'Operation.Result' }, {});
			Expect(tmpOut.StateWrites).to.deep.equal({ 'Operation.Result': '42' });
		});

		test('U4: empty expression completes with an empty result', () =>
		{
			let tmpOut = executeSolver(_Fable, { Expression: '' }, {});
			Expect(tmpOut.EventToFire).to.equal('Complete');
			Expect(tmpOut.Outputs.Result).to.equal('');
		});

		test('U5: a parser throw fires the declared Error event', () =>
		{
			let tmpThrowingFable = { ExpressionParser: { solve: () => { throw new Error('synthetic parser failure'); } }, manifest: {}, log: _Fable.log };
			let tmpResult = null;
			SOLVER_CONFIG.Execute({ fable: tmpThrowingFable, log: _Fable.log }, { Expression: '6 * 7' }, {},
				(pError, pCallbackResult) => { tmpResult = pCallbackResult; });
			Expect(tmpResult.EventToFire).to.equal('Error');
			Expect(tmpResult.Outputs.Result).to.equal('');
			let tmpDeclared = SOLVER_CONFIG.Definition.EventOutputs.map((pOutput) => pOutput.Name);
			Expect(tmpDeclared).to.include(tmpResult.EventToFire);
		});
	});

	suite('engine integration', () =>
	{
		test('E1: solver evaluates a template-resolved expression and downstream runs', (fDone) =>
		{
			if (!libFS.existsSync(TEST_STAGING_ROOT)) { libFS.mkdirSync(TEST_STAGING_ROOT, { recursive: true }); }
			let tmpFable = new libPict({ Product: 'Ultravisor-ExprSolver-Engine-Test', LogLevel: 5, UltravisorStagingRoot: TEST_STAGING_ROOT });
			tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorTaskTypeRegistry', libUltravisorTaskTypeRegistry);
			tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorStateManager', libUltravisorStateManager);
			tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionEngine', libUltravisorExecutionEngine);
			tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionManifest', libUltravisorExecutionManifest);
			let tmpRegistry = Object.values(tmpFable.servicesMap['UltravisorTaskTypeRegistry'])[0];
			tmpRegistry.registerBuiltInTaskTypes();
			let tmpEngine = Object.values(tmpFable.servicesMap['UltravisorExecutionEngine'])[0];

			let tmpOperation = {
				Hash: 'OPR-EXPR-SOLVER-E1',
				Name: 'Expression solver integration',
				Graph: {
					Nodes: [
						{ Hash: 'start-1', Type: 'start', Ports: [ { Hash: 'start-1-eo-Begin', Label: 'Begin' } ] },
						{ Hash: 'solve-1', Type: 'expression-solver', DefinitionHash: 'expression-solver',
						  Settings: { Expression: '{~D:Record.Operation.Expression~}', Destination: 'Operation.Result' },
						  Ports: [
							{ Hash: 'solve-1-ei-In', Label: 'In' },
							{ Hash: 'solve-1-eo-Complete', Label: 'Complete' },
							{ Hash: 'solve-1-eo-Error', Label: 'Error' }
						  ] },
						{ Hash: 'marker-1', Type: 'error-message', DefinitionHash: 'error-message', Settings: { Message: 'downstream of solver ran' },
						  Ports: [ { Hash: 'marker-1-ei-Execute', Label: 'Execute' }, { Hash: 'marker-1-eo-Complete', Label: 'Complete' } ] },
						{ Hash: 'end-1', Type: 'end', Ports: [ { Hash: 'end-1-ei-Finish', Label: 'Finish' } ] }
					],
					Connections: [
						{ SourceNodeHash: 'start-1', SourcePortHash: 'start-1-eo-Begin', TargetNodeHash: 'solve-1', TargetPortHash: 'solve-1-ei-In', ConnectionType: 'Event' },
						{ SourceNodeHash: 'solve-1', SourcePortHash: 'solve-1-eo-Complete', TargetNodeHash: 'marker-1', TargetPortHash: 'marker-1-ei-Execute', ConnectionType: 'Event' },
						{ SourceNodeHash: 'marker-1', SourcePortHash: 'marker-1-eo-Complete', TargetNodeHash: 'end-1', TargetPortHash: 'end-1-ei-Finish', ConnectionType: 'Event' }
					]
				}
			};

			tmpEngine.executeOperation(tmpOperation, { OperationState: { Expression: '6 * 7' } },
				(pError, pContext) =>
				{
					Expect(pError).to.equal(null);
					Expect(pContext.Status).to.equal('Complete');
					Expect(pContext.TaskOutputs['solve-1'].Result).to.equal('42');
					Expect(pContext.TaskOutputs['marker-1']).to.not.equal(undefined, 'downstream of the solver must run');
					Expect(pContext.OperationState.Result).to.equal('42', 'Destination StateWrite must land at Operation.Result');
					fDone();
				});
		});
	});
});
