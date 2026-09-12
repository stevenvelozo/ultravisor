/**
 * Refusing Authentication on the HTTP dispatch routes
 * (UltravisorRefuseAuthenticationDispatch)
 *
 * POST /Beacon/Work/Dispatch, /Beacon/Work/DispatchStream and
 * /Beacon/Work/Enqueue accept any capability from any session holder,
 * Authentication included, which lets a caller use the auth beacon to test
 * credentials or reach the user-management actions without the admin check.
 * The hub's own calls to the auth beacon never use these routes.
 *
 * These tests pin:
 *   - Unset, or anything but true and "true": all three routes pass
 *     Authentication through to the coordinator, as before.
 *   - On: all three answer 403 and dispatch nothing. DispatchStream never
 *     starts its stream, and Enqueue creates no run.
 *   - Other capabilities, and the hub's in-process calls, are untouched.
 *
 * The routes are the real handlers, captured from wireEndpoints against a
 * stub Orator, in the manner of Ultravisor_AffinityRoutePlumbing_tests.js.
 */

const libPict = require('pict');

const Chai = require('chai');
const Expect = Chai.expect;

const libUltravisorAPIServer = require('../source/web_server/Ultravisor-API-Server.cjs');
const libAuthBeaconBridge = require('../source/services/Ultravisor-AuthBeaconBridge.cjs');

const ROUTES = ['POST /Beacon/Work/Dispatch', 'POST /Beacon/Work/DispatchStream', 'POST /Beacon/Work/Enqueue'];
const AUTH_BODY = { Capability: 'Authentication', Action: 'AUTH_Login', Settings: { Username: 'someone', Password: 'guess' } };

function buildRouteHarness(pConfig, pSettings)
{
	let tmpFable = new libPict({ Product: 'Ultravisor-RefuseAuthDispatch-Test', LogStreams: [{ level: 'fatal' }] });
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorAPIServer', libUltravisorAPIServer);
	let tmpServer = Object.values(tmpFable.servicesMap.UltravisorAPIServer)[0];
	if (pConfig)
	{
		tmpFable.ProgramConfiguration = pConfig;
	}
	if (pSettings)
	{
		Object.assign(tmpFable.settings, pSettings);
	}

	let tmpRoutes = {};
	let fCapture = (pMethod) => (pPath, ...pHandlers) => { tmpRoutes[`${pMethod} ${pPath}`] = pHandlers[pHandlers.length - 1]; };
	tmpServer._OratorServer = { get: fCapture('GET'), post: fCapture('POST'), put: fCapture('PUT'), del: fCapture('DEL'), bodyParser: function () {}, server: {} };
	tmpServer._Orator = {};
	tmpServer._requireSession = function () { return { LoggedIn: true, SessionID: 'session-test' }; };
	tmpServer._admissionGate = function () { return { Admitted: true }; };

	let tmpHarness = { routes: tmpRoutes, captured: [], runs: [] };
	let tmpCoordinator =
	{
		listBeacons: function () { return [ { Name: 'some-beacon' } ]; },
		enqueueWorkItem: function (pInfo) { tmpHarness.captured.push(pInfo); return { WorkItemHash: 'wi-test', Status: 'Pending', EnqueuedAt: '', Priority: null }; },
		dispatchAndWait: function (pInfo) { tmpHarness.captured.push(pInfo); },
		dispatchAndStream: function (pInfo) { tmpHarness.captured.push(pInfo); }
	};
	let tmpRunManager = { startRun: function (pInfo) { tmpHarness.runs.push(pInfo); return { RunID: 'run-test' }; } };
	tmpServer._getService = function (pName)
	{
		if (pName === 'UltravisorBeaconCoordinator') { return tmpCoordinator; }
		if (pName === 'UltravisorBeaconRunManager') { return tmpRunManager; }
		return null;
	};

	tmpServer.wireEndpoints(function () {});
	return tmpHarness;
}

function invokeRoute(pHarness, pRoute, pBody)
{
	let tmpResult = { Code: null, Body: null, WroteHead: false, Nexts: 0 };
	let tmpRequest = { body: pBody, headers: {}, connection: { setTimeout: function () {} } };
	let tmpResponse =
	{
		send: function (pCodeOrBody, pBody)
		{
			if (typeof pCodeOrBody === 'number') { tmpResult.Code = pCodeOrBody; tmpResult.Body = pBody; }
			else { tmpResult.Code = 200; tmpResult.Body = pCodeOrBody; }
		},
		writeHead: function () { tmpResult.WroteHead = true; },
		write: function () {},
		end: function () {}
	};
	let tmpHandler = pHarness.routes[pRoute];
	Expect(tmpHandler, pRoute + ' is registered').to.be.a('function');
	tmpHandler(tmpRequest, tmpResponse, function () { tmpResult.Nexts++; });
	return tmpResult;
}

suite
(
	'Refusing Authentication on the HTTP dispatch routes (UltravisorRefuseAuthenticationDispatch)',
	function ()
	{
		suite
		(
			'Unset (the default): the routes as before',
			function ()
			{
				test('the option is not in the default configuration, so state persistence cannot write it to disk', function ()
				{
					let tmpDefaults = require('../source/config/Ultravisor-Default-Command-Configuration.cjs');
					Expect(Object.keys(tmpDefaults).length, 'defaults were read').to.be.greaterThan(5);
					Expect(Object.prototype.hasOwnProperty.call(tmpDefaults, 'UltravisorRefuseAuthenticationDispatch')).to.equal(false);
				});

				test('all three routes pass Authentication through to the coordinator', function ()
				{
					ROUTES.forEach((pRoute) =>
					{
						let tmpHarness = buildRouteHarness();
						let tmpResult = invokeRoute(tmpHarness, pRoute, AUTH_BODY);
						Expect(tmpResult.Code, pRoute).to.not.equal(403);
						Expect(tmpHarness.captured.map((pInfo) => pInfo.Capability), pRoute).to.deep.equal(['Authentication']);
					});
				});

				test('only true and "true" turn it on: false, "false", 1 and "yes" leave the routes open', function ()
				{
					[false, 'false', 1, 'yes'].forEach((pValue) =>
					{
						let tmpHarness = buildRouteHarness({ UltravisorRefuseAuthenticationDispatch: pValue });
						invokeRoute(tmpHarness, 'POST /Beacon/Work/Dispatch', AUTH_BODY);
						Expect(tmpHarness.captured.length, JSON.stringify(pValue)).to.equal(1);
					});
				});
			}
		);

		suite
		(
			'On: Authentication is refused on all three routes',
			function ()
			{
				[
					{ Label: 'true in ProgramConfiguration', Config: { UltravisorRefuseAuthenticationDispatch: true } },
					{ Label: '"true" in ProgramConfiguration', Config: { UltravisorRefuseAuthenticationDispatch: 'true' } },
					{ Label: 'true in settings', Settings: { UltravisorRefuseAuthenticationDispatch: true } },
					{ Label: 'false in ProgramConfiguration, true in settings', Config: { UltravisorRefuseAuthenticationDispatch: false }, Settings: { UltravisorRefuseAuthenticationDispatch: true } }
				].forEach((pCase) =>
				{
					test(pCase.Label + ': 403, nothing dispatched, no stream started, no run created', function ()
					{
						ROUTES.forEach((pRoute) =>
						{
							let tmpHarness = buildRouteHarness(pCase.Config, pCase.Settings);
							let tmpResult = invokeRoute(tmpHarness, pRoute, AUTH_BODY);
							Expect(tmpResult.Code, pRoute).to.equal(403);
							Expect(tmpResult.Body.Error, pRoute).to.contain('reserved');
							Expect(tmpResult.Nexts, pRoute + ' fNext').to.equal(1);
							Expect(tmpHarness.captured, pRoute + ' dispatched').to.deep.equal([]);
							Expect(tmpResult.WroteHead, pRoute + ' started a stream').to.equal(false);
							Expect(tmpHarness.runs, pRoute + ' created a run').to.deep.equal([]);
						});
					});
				});

				test('other capabilities go through as before, AffinityKey and RequireAffinityMatch intact', function ()
				{
					let tmpHarness = buildRouteHarness({ UltravisorRefuseAuthenticationDispatch: true });
					invokeRoute(tmpHarness, 'POST /Beacon/Work/Dispatch', { Capability: 'DataBeaconSchema', Action: 'EnsureSchema', AffinityKey: 'lake', RequireAffinityMatch: true });
					Expect(tmpHarness.captured).to.have.length(1);
					Expect(tmpHarness.captured[0].Capability).to.equal('DataBeaconSchema');
					Expect(tmpHarness.captured[0].AffinityKey).to.equal('lake');
					Expect(tmpHarness.captured[0].RequireAffinityMatch).to.equal(true);
				});

				test('a request without a Capability still gets the 400 it always did', function ()
				{
					let tmpHarness = buildRouteHarness({ UltravisorRefuseAuthenticationDispatch: true });
					Expect(invokeRoute(tmpHarness, 'POST /Beacon/Work/Dispatch', { Action: 'AUTH_Login' }).Code).to.equal(400);
				});

				test('the hub\'s own calls to the auth beacon still go out', async function ()
				{
					// The bridge dispatches in-process; it never goes through these routes.
					let tmpFable = new libPict({ Product: 'Ultravisor-RefuseAuthDispatch-Test', LogStreams: [{ level: 'fatal' }] });
					tmpFable.ProgramConfiguration = { UltravisorRefuseAuthenticationDispatch: true };
					let tmpCaptured = [];
					tmpFable.servicesMap['UltravisorBeaconCoordinator'] = { Mock:
					{
						listBeacons: () => [{ BeaconID: 'b-auth', Name: 'auth-beacon', Capabilities: ['Authentication'], Status: 'Online' }],
						dispatchAndWait: (pInfo, fCallback) => { tmpCaptured.push(pInfo); setImmediate(() => fCallback(null, { Outputs: { Valid: true } })); }
					} };
					tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorAuthBeaconBridge', libAuthBeaconBridge);
					let tmpResult = await Object.values(tmpFable.servicesMap.UltravisorAuthBeaconBridge)[0].validateSession('token');
					Expect(tmpResult.Valid).to.equal(true);
					Expect(tmpCaptured.map((pInfo) => pInfo.Capability)).to.deep.equal(['Authentication']);
				});

				test('the refusal sits right after each route\'s Capability check', function ()
				{
					let tmpSource = require('fs').readFileSync(require('path').join(__dirname, '..', 'source', 'web_server', 'Ultravisor-API-Server.cjs'), 'utf8');
					Expect(tmpSource.match(/this\._refuseReservedCapability\(tmpBody, pResponse, fNext\)/g) || [], 'call sites').to.have.length(3);
				});
			}
		);
	}
);
