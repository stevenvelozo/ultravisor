/**
 * Strict-affinity ROUTE plumbing tests.
 *
 * The Coordinator enforces RequireAffinityMatch correctly (see
 * Ultravisor_AffinityStrict_tests.js), but that is only half the feature:
 * the work item never carries the flag unless the API-server dispatch
 * routes read it off the request body and pass it into the work item info.
 *
 * That seam was the actual hole — the routes plumbed AffinityKey and
 * Settings but dropped RequireAffinityMatch, so every dispatched setup
 * item was silently non-strict and a capability-shared item could land on
 * a foreign beacon (observed live: an EnsureSchema landed on a customer
 * oracle source beacon instead of the named postgres lake beacon).
 *
 * These tests invoke the registered route handlers directly against a
 * capturing Orator + a mock Coordinator — no HTTP listener, no full
 * service graph — and assert the body's RequireAffinityMatch reaches the
 * work item.
 */

const libPict = require('pict');

const Chai = require('chai');
const Expect = Chai.expect;

const libUltravisorAPIServer = require('../source/web_server/Ultravisor-API-Server.cjs');

/**
 * Instantiate the API server, swap in a capturing Orator stub + a mock
 * Coordinator, and wire the routes so each handler is captured by
 * "METHOD path" without binding a socket.
 *
 * @returns {{ routes: object, captured: object[] }}
 */
function buildRouteHarness()
{
	let tmpFable = new libPict({ Product: 'Ultravisor-AffinityRoute-Test', LogLevel: 0 });
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorAPIServer', libUltravisorAPIServer);
	let tmpServer = Object.values(tmpFable.servicesMap.UltravisorAPIServer)[0];

	let tmpRoutes = {};
	function captureVerb(pMethod)
	{
		return function (pPath, ...pHandlers)
		{
			tmpRoutes[`${pMethod} ${pPath}`] = pHandlers[pHandlers.length - 1];
		};
	}
	tmpServer._OratorServer =
	{
		get: captureVerb('GET'),
		post: captureVerb('POST'),
		put: captureVerb('PUT'),
		del: captureVerb('DEL'),
		bodyParser: function () {},
		server: {}
	};
	tmpServer._Orator = {};

	// The dispatch handlers gate on session + admission; short-circuit both.
	tmpServer._requireSession = function () { return { LoggedIn: true }; };
	tmpServer._admissionGate = function () { return { Admitted: true }; };

	let tmpCaptured = [];
	let tmpCoordinator =
	{
		listBeacons: function () { return [ { Name: 'private_data_lake_beacon' } ]; },
		enqueueWorkItem: function (pWorkItemInfo)
		{
			tmpCaptured.push(pWorkItemInfo);
			return { WorkItemHash: 'wi-test', Status: 'Pending', EnqueuedAt: '', Priority: null };
		},
		dispatchAndWait: function (pWorkItemInfo) { tmpCaptured.push(pWorkItemInfo); },
		dispatchAndStream: function (pWorkItemInfo) { tmpCaptured.push(pWorkItemInfo); }
	};
	tmpServer._getService = function (pName) { return (pName === 'UltravisorBeaconCoordinator') ? tmpCoordinator : null; };

	tmpServer.wireEndpoints(function () {});
	return { routes: tmpRoutes, captured: tmpCaptured };
}

/**
 * Invoke a captured route handler with a synthetic request/response.
 * @param {Function} pHandler
 * @param {object} pBody
 */
function invokeRoute(pHandler, pBody)
{
	let tmpRequest = { body: pBody, headers: {}, connection: { setTimeout: function () {} } };
	let tmpResponse = { send: function () {} };
	pHandler(tmpRequest, tmpResponse, function () {});
}

suite('Strict affinity — dispatch route plumbing', function ()
{
	test('/Beacon/Work/Dispatch carries RequireAffinityMatch from the body into the work item', function ()
	{
		let tmpHarness = buildRouteHarness();
		let tmpHandler = tmpHarness.routes['POST /Beacon/Work/Dispatch'];
		Expect(tmpHandler, '/Beacon/Work/Dispatch route registered').to.be.a('function');
		invokeRoute(tmpHandler,
			{ Capability: 'DataBeaconSchema', Action: 'EnsureSchema', AffinityKey: 'private_data_lake_beacon', RequireAffinityMatch: true, Settings: {} });
		Expect(tmpHarness.captured.length).to.equal(1);
		Expect(tmpHarness.captured[0].AffinityKey).to.equal('private_data_lake_beacon');
		Expect(tmpHarness.captured[0].RequireAffinityMatch).to.equal(true);
	});

	test('/Beacon/Work/Dispatch defaults to non-strict when RequireAffinityMatch is omitted', function ()
	{
		let tmpHarness = buildRouteHarness();
		let tmpHandler = tmpHarness.routes['POST /Beacon/Work/Dispatch'];
		invokeRoute(tmpHandler,
			{ Capability: 'DataBeaconSchema', Action: 'EnsureSchema', AffinityKey: 'private_data_lake_beacon', Settings: {} });
		Expect(tmpHarness.captured[0].RequireAffinityMatch).to.equal(false);
	});

	test('/Beacon/Work/Enqueue carries RequireAffinityMatch into the work item', function ()
	{
		let tmpHarness = buildRouteHarness();
		let tmpHandler = tmpHarness.routes['POST /Beacon/Work/Enqueue'];
		Expect(tmpHandler, '/Beacon/Work/Enqueue route registered').to.be.a('function');
		invokeRoute(tmpHandler,
			{ RunID: 'run-1', Capability: 'DataBeaconSchema', Action: 'EnsureSchema', AffinityKey: 'private_data_lake_beacon', RequireAffinityMatch: true, Settings: {} });
		Expect(tmpHarness.captured.length).to.equal(1);
		Expect(tmpHarness.captured[0].RequireAffinityMatch).to.equal(true);
	});
});
