/**
 * Redacting Authentication settings on the read routes
 * (UltravisorRedactAuthDispatchSettings)
 *
 * GET /Beacon/Work and GET /Beacon/Queue return live work items to any hub
 * session, with their Settings intact. For an Authentication item that Settings
 * object holds the credential the hub is checking (a beacon's JoinSecret, a
 * password, a bootstrap token), and its Result can hold a session token. When
 * the key is on, those fields are blanked on Authentication items in the
 * response, without touching the in-memory item.
 *
 * These tests pin:
 *   - Unset (the default): the responses are byte-identical to before.
 *   - On: Authentication items come back with Settings {Redacted:true} and no
 *     real Outputs or Result; other capabilities are untouched; the in-memory
 *     items are never mutated; and GET /Beacon/Queue redacts its History too.
 *
 * The two GET routes are the real handlers, captured from wireEndpoints against
 * a stub Orator, in the manner of Ultravisor_RefuseAuthenticationDispatch_tests.js.
 */

const libPict = require('pict');

const Chai = require('chai');
const Expect = Chai.expect;

const libUltravisorAPIServer = require('../source/web_server/Ultravisor-API-Server.cjs');

const SECRET = 'pls_a-join-token-that-must-not-leak';
const TOKEN = 'session-token-that-must-not-leak';

function authItem(pHash)
{
	return { WorkItemHash: pHash, Capability: 'Authentication', Action: 'AUTH_ValidateBeaconJoin', Status: 'Running', Settings: { BeaconName: 'worker-1', JoinSecret: SECRET }, Result: { Outputs: { Allowed: true, SessionToken: TOKEN } } };
}
function shellItem(pHash)
{
	return { WorkItemHash: pHash, Capability: 'Shell', Action: 'Execute', Status: 'Running', Settings: { Command: 'echo hello' } };
}

function buildRouteHarness(pConfig, pWorkItems, pHistoryItems)
{
	let tmpFable = new libPict({ Product: 'Ultravisor-RedactAuth-Test', LogStreams: [{ level: 'fatal' }] });
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorAPIServer', libUltravisorAPIServer);
	let tmpServer = Object.values(tmpFable.servicesMap.UltravisorAPIServer)[0];
	if (pConfig)
	{
		tmpFable.ProgramConfiguration = pConfig;
	}

	let tmpRoutes = {};
	let fCapture = (pMethod) => (pPath, ...pHandlers) => { tmpRoutes[`${pMethod} ${pPath}`] = pHandlers[pHandlers.length - 1]; };
	tmpServer._OratorServer = { get: fCapture('GET'), post: fCapture('POST'), put: fCapture('PUT'), del: fCapture('DEL'), bodyParser: function () {}, server: {} };
	tmpServer._Orator = {};
	tmpServer._requireSession = function () { return { LoggedIn: true }; };

	let tmpItems = pWorkItems || [];
	let tmpCoordinator =
	{
		listWorkItems: function () { return tmpItems; },
		listAffinityBindings: function () { return []; }
	};
	let tmpScheduler =
	{
		summarize: function () { return { Total: tmpItems.length }; },
		listBuckets: function () { return tmpItems.map((pItem) => Object.assign({ Bucket: 'Working' }, pItem)); }
	};
	let tmpBridge = pHistoryItems
		? { listWorkItems: function () { return Promise.resolve({ WorkItems: pHistoryItems }); } }
		: null;
	tmpServer._getService = function (pName)
	{
		if (pName === 'UltravisorBeaconCoordinator') { return tmpCoordinator; }
		if (pName === 'UltravisorBeaconScheduler') { return tmpScheduler; }
		if (pName === 'UltravisorQueuePersistenceBridge') { return tmpBridge; }
		return null;
	};

	tmpServer.wireEndpoints(function () {});
	return { server: tmpServer, routes: tmpRoutes, items: tmpItems };
}

function invokeRoute(pHarness, pRoute, pUrl)
{
	return new Promise((fResolve) =>
	{
		let tmpRequest = { headers: {}, url: pUrl || pRoute.split(' ')[1] };
		let tmpResponse = { send: function (pBody) { fResolve(pBody); } };
		let tmpHandler = pHarness.routes[pRoute];
		Expect(tmpHandler, pRoute + ' is registered').to.be.a('function');
		tmpHandler(tmpRequest, tmpResponse, function () {});
	});
}

function jsonHas(pValue, pNeedle)
{
	return JSON.stringify(pValue).indexOf(pNeedle) >= 0;
}

suite
(
	'Redacting Authentication settings on the read routes (UltravisorRedactAuthDispatchSettings)',
	function ()
	{
		suite
		(
			'Unset (the default): responses are byte-identical',
			function ()
			{
				test('the option is not in the default configuration, so state persistence cannot write it to disk', function ()
				{
					let tmpDefaults = require('../source/config/Ultravisor-Default-Command-Configuration.cjs');
					Expect(Object.keys(tmpDefaults).length, 'defaults were read').to.be.greaterThan(5);
					Expect(Object.prototype.hasOwnProperty.call(tmpDefaults, 'UltravisorRedactAuthDispatchSettings')).to.equal(false);
				});

				test('GET /Beacon/Work returns the Authentication Settings unchanged', async function ()
				{
					let tmpHarness = buildRouteHarness(null, [ authItem('wi-1'), shellItem('wi-2') ]);
					let tmpBody = await invokeRoute(tmpHarness, 'GET /Beacon/Work');
					Expect(tmpBody[0].Settings.JoinSecret).to.equal(SECRET);
					Expect(jsonHas(tmpBody, SECRET)).to.equal(true);
				});

				test('GET /Beacon/Queue returns the Authentication Settings unchanged', async function ()
				{
					let tmpHarness = buildRouteHarness(null, [ authItem('wi-1') ]);
					let tmpBody = await invokeRoute(tmpHarness, 'GET /Beacon/Queue');
					Expect(tmpBody.Items[0].Settings.JoinSecret).to.equal(SECRET);
				});

				test('values other than true / "true" leave it off: 1, "yes", false, "false"', async function ()
				{
					// This key uses _isOptInFlagOn, which accepts the string "true"
					// (templated config renders booleans as strings), so "true" is
					// covered by the "on" suite below, not here.
					let tmpValues = [ 1, 'yes', false, 'false' ];
					for (let i = 0; i < tmpValues.length; i++)
					{
						let tmpHarness = buildRouteHarness({ UltravisorRedactAuthDispatchSettings: tmpValues[i] }, [ authItem('wi-1') ]);
						let tmpBody = await invokeRoute(tmpHarness, 'GET /Beacon/Work');
						Expect(tmpBody[0].Settings.JoinSecret, JSON.stringify(tmpValues[i])).to.equal(SECRET);
					}
				});
			}
		);

		suite
		(
			'On: Authentication credentials are blanked',
			function ()
			{
				[ true, 'true' ].forEach((pValue) =>
				{
					test('set to ' + JSON.stringify(pValue) + ': GET /Beacon/Work blanks Settings, Outputs and Result on Authentication items only', async function ()
					{
						let tmpHarness = buildRouteHarness({ UltravisorRedactAuthDispatchSettings: pValue }, [ authItem('wi-1'), shellItem('wi-2') ]);
						let tmpBody = await invokeRoute(tmpHarness, 'GET /Beacon/Work');

						Expect(tmpBody[0].Settings).to.deep.equal({ Redacted: true });
						Expect(tmpBody[0].Result).to.deep.equal({ Redacted: true });
						Expect(jsonHas(tmpBody, SECRET), 'no join secret anywhere in the response').to.equal(false);
						Expect(jsonHas(tmpBody, TOKEN), 'no session token anywhere in the response').to.equal(false);
						// A non-Authentication item is untouched.
						Expect(tmpBody[1].Settings.Command).to.equal('echo hello');
					});
				});

				test('the in-memory work item is never mutated', async function ()
				{
					let tmpHarness = buildRouteHarness({ UltravisorRedactAuthDispatchSettings: true }, [ authItem('wi-1') ]);
					await invokeRoute(tmpHarness, 'GET /Beacon/Work');
					Expect(tmpHarness.items[0].Settings.JoinSecret, 'the live item still holds its secret').to.equal(SECRET);
				});

				test('GET /Beacon/Queue blanks the Authentication Settings in Items', async function ()
				{
					let tmpHarness = buildRouteHarness({ UltravisorRedactAuthDispatchSettings: true }, [ authItem('wi-1'), shellItem('wi-2') ]);
					let tmpBody = await invokeRoute(tmpHarness, 'GET /Beacon/Queue');
					Expect(tmpBody.Items[0].Settings).to.deep.equal({ Redacted: true });
					Expect(tmpBody.Items[0].Bucket, 'the bucket label survives').to.equal('Working');
					Expect(tmpBody.Items[1].Settings.Command).to.equal('echo hello');
				});

				test('GET /Beacon/Queue?include=history blanks the Authentication Settings in History too', async function ()
				{
					let tmpHarness = buildRouteHarness({ UltravisorRedactAuthDispatchSettings: true }, [ shellItem('wi-2') ], [ authItem('wi-hist') ]);
					let tmpBody = await invokeRoute(tmpHarness, 'GET /Beacon/Queue', '/Beacon/Queue?include=history');
					Expect(tmpBody.History[0].Settings).to.deep.equal({ Redacted: true });
					Expect(jsonHas(tmpBody.History, SECRET)).to.equal(false);
				});
			}
		);
	}
);
