/**
 * HTTP beacon registration admission (UltravisorHTTPBeaconAdmission)
 *
 * A beacon on HTTP transport registers with POST /Beacon/Register. That
 * route needs a session but, by default, runs no join admission, so on a
 * secured hub any session holder can register a beacon with no JoinSecret.
 * The option makes the route run the admission the WebSocket path runs.
 *
 * These tests pin:
 *   - Unset (the default), on a secured hub too: exactly the old route.
 *   - 'audit': registered as before, plus one log per name that enforce
 *     would refuse.
 *   - 'enforce': refused registers get 403 with the reason (a timed-out
 *     auth beacon included), 503 only when admission itself fails, never
 *     401, and exactly one response and one fNext even if registering
 *     throws.
 *   - How the setting is read: what turns it on, and what is logged.
 *
 * The coordinator and the auth beacon bridge are real; the bridge's
 * validateBeaconJoin is replaced by a stub each test sets the answer of.
 * Every API-server method on the path is the real one.
 */

const libPict = require('pict');
const libFS = require('fs');
const libPath = require('path');

const Chai = require('chai');
const Expect = Chai.expect;

const libAPIServer = require('../source/web_server/Ultravisor-API-Server.cjs');
const libAuthBeaconBridge = require('../source/services/Ultravisor-AuthBeaconBridge.cjs');
const libUltravisorBeaconCoordinator = require('../source/services/Ultravisor-Beacon-Coordinator.cjs');
const libUltravisorBeaconQueueStore = require('../source/services/persistence/Ultravisor-Beacon-QueueStore.cjs');

const TEST_BASE = libPath.resolve(__dirname, '..', '.test_staging_http_beacon_admission');
const BOOTSTRAP_SECRET = 'bootstrap-s3cret';
const SESSION = { SessionID: 'session-operator', UserID: 'operator' };

const ALLOW = () => Promise.resolve({ Available: true, Allowed: true });
const DENY = (pReason) => () => Promise.resolve({ Available: true, Allowed: false, Reason: pReason });

let _HarnessCount = 0;

function ensureClean(pDir)
{
	if (libFS.existsSync(pDir)) { libFS.rmSync(pDir, { recursive: true, force: true }); }
	libFS.mkdirSync(pDir, { recursive: true });
}

function pause(pMs)
{
	return new Promise((fResolve) => setTimeout(fResolve, pMs));
}

// Every API-server method, bound to a stand-in, so a handler that calls a
// helper this file never names (added by a later option, say) still finds it.
function bindApiServerMethods(pSelf)
{
	let tmpProto = libAPIServer.prototype;
	Object.getOwnPropertyNames(tmpProto).forEach((pName) =>
	{
		let tmpDescriptor = Object.getOwnPropertyDescriptor(tmpProto, pName);
		if (pName !== 'constructor' && tmpDescriptor && typeof tmpDescriptor.value === 'function')
		{
			pSelf[pName] = tmpDescriptor.value.bind(pSelf);
		}
	});
	return pSelf;
}

/**
 * @param {object} pConfig - ProgramConfiguration
 * @param {object} [pOptions] - { AuthBeacon: true seeds a registered auth beacon }
 */
function buildHarness(pConfig, pOptions)
{
	let tmpOptions = pOptions || {};
	const tmpPath = libPath.join(TEST_BASE, 'hub-' + (_HarnessCount++));
	ensureClean(tmpPath);

	let tmpFable = new libPict({ Product: 'Ultravisor-HTTPBeaconAdmission-Test', LogStreams: [{ level: 'fatal' }], UltravisorFileStorePath: tmpPath, UltravisorHubInstanceID: 'testhub' });
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconQueueStore', libUltravisorBeaconQueueStore);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconCoordinator', libUltravisorBeaconCoordinator);
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorAuthBeaconBridge', libAuthBeaconBridge);
	Object.values(tmpFable.servicesMap.UltravisorBeaconQueueStore)[0].initialize(tmpPath);

	let tmpHarness =
	{
		coordinator: Object.values(tmpFable.servicesMap.UltravisorBeaconCoordinator)[0],
		bridge: Object.values(tmpFable.servicesMap.UltravisorAuthBeaconBridge)[0],
		session: SESSION,
		answer: ALLOW,
		validateCalls: 0,
		registerCalls: [],
		registerThrows: false,
		logs: []
	};

	if (tmpOptions.AuthBeacon)
	{
		tmpHarness.coordinator.registerBeacon({ Name: 'auth-beacon', Capabilities: ['Authentication'], MaxConcurrent: 4 }, 'session-auth');
	}

	tmpHarness.bridge.validateBeaconJoin = function ()
	{
		tmpHarness.validateCalls++;
		return tmpHarness.answer();
	};

	let fRealRegister = tmpHarness.coordinator.registerBeacon.bind(tmpHarness.coordinator);
	tmpHarness.coordinator.registerBeacon = function (pInfo, pSessionID)
	{
		tmpHarness.registerCalls.push({ Name: pInfo.Name, SessionID: pSessionID });
		if (tmpHarness.registerThrows)
		{
			throw new Error('store is down');
		}
		return fRealRegister(pInfo, pSessionID);
	};

	let fRecord = (pLevel) => (pMessage) => { tmpHarness.logs.push(pLevel + ' ' + pMessage); };
	let tmpSelf =
	{
		fable: { ProgramConfiguration: Object.assign({ UltravisorBootstrapAuthSecret: BOOTSTRAP_SECRET }, pConfig || {}), servicesMap: tmpFable.servicesMap, LogNoisiness: 0 },
		log: { info: fRecord('info'), warn: fRecord('warn'), error: fRecord('error'), debug: () => {}, trace: () => {} },
		_BeaconWebSockets: {},
		_OratorAuth: { getSessionForRequest: () => tmpHarness.session }
	};
	bindApiServerMethods(tmpSelf);
	tmpHarness.self = tmpSelf;
	return tmpHarness;
}

/**
 * POST /Beacon/Register through the real handler. Resolves once fNext has
 * run (or after 500ms), then waits a moment more so a second answer, if the
 * handler ever sent one, would be counted.
 */
async function httpRegister(pHarness, pBody)
{
	let tmpResult = { Code: null, Body: null, Sends: 0, Nexts: 0 };
	let fResolve = null;
	let tmpNexted = new Promise((fDone) => { fResolve = fDone; });
	let tmpResponse =
	{
		headersSent: false,
		send: function (pCodeOrBody, pBody)
		{
			tmpResult.Sends++;
			this.headersSent = true;
			if (typeof pCodeOrBody === 'number')
			{
				tmpResult.Code = pCodeOrBody;
				tmpResult.Body = pBody;
			}
			else
			{
				tmpResult.Code = 200;
				tmpResult.Body = pCodeOrBody;
			}
		}
	};
	let fNext = () => { tmpResult.Nexts++; fResolve(); };
	pHarness.self._handleBeaconHTTPRegister({ body: pBody }, tmpResponse, fNext);
	await Promise.race([tmpNexted, pause(500)]);
	await pause(20);
	return tmpResult;
}

function workerBody(pExtra)
{
	return Object.assign({ Name: 'worker-1', Capabilities: ['Shell'], MaxConcurrent: 1 }, pExtra || {});
}

function expectRegistered(pHarness, pResult, pName)
{
	Expect(pResult.Code, 'response code (body: ' + JSON.stringify(pResult.Body) + ')').to.equal(200);
	Expect(pResult.Body.BeaconID).to.be.a('string');
	Expect(pHarness.registerCalls.map((pCall) => pCall.Name)).to.deep.equal([pName || 'worker-1']);
	Expect(pResult.Sends, 'responses').to.equal(1);
	Expect(pResult.Nexts, 'fNext calls').to.equal(1);
}

function expectRefused(pHarness, pResult, pCode, pReason)
{
	Expect(pResult.Code).to.equal(pCode);
	Expect(pResult.Code).to.not.equal(401);
	if (pReason !== undefined)
	{
		Expect(pResult.Body.Reason).to.contain(pReason);
	}
	Expect(pHarness.registerCalls, 'nothing registered').to.deep.equal([]);
	Expect(pResult.Sends, 'responses').to.equal(1);
	Expect(pResult.Nexts, 'fNext calls').to.equal(1);
}

suite
(
	'HTTP beacon registration admission (UltravisorHTTPBeaconAdmission)',
	function ()
	{
		suiteTeardown(function () { if (libFS.existsSync(TEST_BASE)) { libFS.rmSync(TEST_BASE, { recursive: true, force: true }); } });

		suite
		(
			'Unset (the default): the route as before',
			function ()
			{
				test('the option is not in the default configuration, so state persistence cannot write it to disk', function ()
				{
					let tmpDefaults = require('../source/config/Ultravisor-Default-Command-Configuration.cjs');
					Expect(Object.keys(tmpDefaults).length, 'defaults were read').to.be.greaterThan(5);
					Expect(Object.prototype.hasOwnProperty.call(tmpDefaults, 'UltravisorHTTPBeaconAdmission')).to.equal(false);
				});

				test('promiscuous hub: registered with no JoinSecret, and admission never consulted', async function ()
				{
					let tmpHarness = buildHarness({ UltravisorNonPromiscuous: false });
					let tmpResult = await httpRegister(tmpHarness, workerBody());
					expectRegistered(tmpHarness, tmpResult);
					Expect(tmpHarness.registerCalls[0].SessionID).to.equal(SESSION.SessionID);
					Expect(tmpHarness.validateCalls).to.equal(0);
				});

				test('SECURED hub: still registered with no JoinSecret, and nothing is logged', async function ()
				{
					// The guard that proves the default is unchanged where it matters most.
					let tmpHarness = buildHarness({ UltravisorNonPromiscuous: true }, { AuthBeacon: true });
					tmpHarness.answer = DENY('would have been refused');
					let tmpResult = await httpRegister(tmpHarness, workerBody());
					expectRegistered(tmpHarness, tmpResult);
					Expect(tmpHarness.validateCalls).to.equal(0);
					Expect(tmpHarness.logs).to.deep.equal([]);
				});

				test('no session on a secured hub: the usual 401, before any admission', async function ()
				{
					let tmpHarness = buildHarness({ UltravisorNonPromiscuous: true, UltravisorHTTPBeaconAdmission: 'enforce' }, { AuthBeacon: true });
					tmpHarness.session = null;
					let tmpResult = await httpRegister(tmpHarness, workerBody());
					Expect(tmpResult.Code).to.equal(401);
					Expect(tmpHarness.validateCalls).to.equal(0);
					Expect(tmpHarness.registerCalls).to.deep.equal([]);
				});
			}
		);

		suite
		(
			'"enforce": a register must pass admission',
			function ()
			{
				const ENFORCE = { UltravisorNonPromiscuous: true, UltravisorHTTPBeaconAdmission: 'enforce' };

				test('refused by the auth beacon: 403 with its reason, nothing registered', async function ()
				{
					let tmpHarness = buildHarness(ENFORCE, { AuthBeacon: true });
					tmpHarness.answer = DENY('Invalid beacon-join secret');
					let tmpResult = await httpRegister(tmpHarness, workerBody({ JoinSecret: 'wrong' }));
					expectRefused(tmpHarness, tmpResult, 403, 'Invalid beacon-join secret');
					Expect(tmpHarness.validateCalls).to.equal(1);
				});

				test('allowed by the auth beacon: registered', async function ()
				{
					let tmpHarness = buildHarness(ENFORCE, { AuthBeacon: true });
					let tmpResult = await httpRegister(tmpHarness, workerBody({ JoinSecret: 'right' }));
					expectRegistered(tmpHarness, tmpResult);
					Expect(tmpHarness.validateCalls).to.equal(1);
				});

				test('no auth beacon registered: 403', async function ()
				{
					let tmpHarness = buildHarness(ENFORCE);
					let tmpResult = await httpRegister(tmpHarness, workerBody({ JoinSecret: 'right' }));
					expectRefused(tmpHarness, tmpResult, 403, 'No auth beacon connected');
				});

				test('the auth beacon itself, first to join: admitted on the bootstrap secret, refused on any other', async function ()
				{
					let tmpHarness = buildHarness(ENFORCE);
					let tmpWrong = await httpRegister(tmpHarness, { Name: 'auth-beacon', Capabilities: ['Authentication'], JoinSecret: 'wrong' });
					expectRefused(tmpHarness, tmpWrong, 403, 'Bootstrap auth secret mismatch');
					let tmpRight = await httpRegister(tmpHarness, { Name: 'auth-beacon', Capabilities: ['Authentication'], JoinSecret: BOOTSTRAP_SECRET });
					expectRegistered(tmpHarness, tmpRight, 'auth-beacon');
				});

				test('the auth beacon timed out: 403 with the timeout as the reason', async function ()
				{
					let tmpHarness = buildHarness(ENFORCE, { AuthBeacon: true });
					tmpHarness.answer = () => Promise.resolve({ Available: true, Allowed: false, Error: 'Direct dispatch timed out after 5000ms.' });
					let tmpResult = await httpRegister(tmpHarness, workerBody({ JoinSecret: 'right' }));
					expectRefused(tmpHarness, tmpResult, 403, 'timed out');
				});

				test('the admission check itself failed: 503', async function ()
				{
					let tmpHarness = buildHarness(ENFORCE, { AuthBeacon: true });
					tmpHarness.answer = () => Promise.reject(new Error('bridge exploded'));
					let tmpResult = await httpRegister(tmpHarness, workerBody({ JoinSecret: 'right' }));
					expectRefused(tmpHarness, tmpResult, 503, 'bridge exploded');
				});

				test('registering throws after admission: one 500, one fNext', async function ()
				{
					let tmpHarness = buildHarness(ENFORCE, { AuthBeacon: true });
					tmpHarness.registerThrows = true;
					let tmpResult = await httpRegister(tmpHarness, workerBody({ JoinSecret: 'right' }));
					Expect(tmpResult.Code).to.equal(500);
					Expect(tmpResult.Sends, 'responses').to.equal(1);
					Expect(tmpResult.Nexts, 'fNext calls').to.equal(1);
					Expect(tmpHarness.logs.filter((pLine) => /^error .*store is down/.test(pLine))).to.have.length(1);
				});

				test('true means enforce', async function ()
				{
					let tmpHarness = buildHarness({ UltravisorNonPromiscuous: true, UltravisorHTTPBeaconAdmission: true }, { AuthBeacon: true });
					tmpHarness.answer = DENY('no');
					let tmpResult = await httpRegister(tmpHarness, workerBody());
					expectRefused(tmpHarness, tmpResult, 403, 'no');
				});

				test('on a promiscuous hub it admits everything, and says so once', async function ()
				{
					let tmpHarness = buildHarness({ UltravisorNonPromiscuous: false, UltravisorHTTPBeaconAdmission: 'enforce' });
					expectRegistered(tmpHarness, await httpRegister(tmpHarness, workerBody()));
					await httpRegister(tmpHarness, workerBody({ Name: 'worker-2' }));
					Expect(tmpHarness.validateCalls).to.equal(0);
					Expect(tmpHarness.logs.filter((pLine) => pLine.indexOf('has no effect') >= 0)).to.have.length(1);
				});

				test('HTTP and WebSocket give the same answer for the same join', async function ()
				{
					let tmpHarness = buildHarness(ENFORCE, { AuthBeacon: true });
					tmpHarness.answer = DENY('Invalid beacon-join secret');
					let tmpHTTP = await httpRegister(tmpHarness, workerBody({ JoinSecret: 'wrong' }));

					let tmpFrames = [];
					let tmpSocket = { readyState: 1, send: (pText) => tmpFrames.push(JSON.parse(pText)), close: function () { this.readyState = 2; } };
					tmpHarness.self._handleBeaconWSRegister(tmpSocket, workerBody({ JoinSecret: 'wrong' }));
					await pause(20);
					let tmpRejected = tmpFrames.find((pFrame) => pFrame.EventType === 'BeaconRejected');
					Expect(tmpRejected, 'the WebSocket join was refused').to.be.an('object');
					Expect(tmpHTTP.Body.Reason).to.equal(tmpRejected.Reason);
				});
			}
		);

		suite
		(
			'"audit": registered as before, and logged',
			function ()
			{
				test('a register enforce would refuse is registered and logged once per name', async function ()
				{
					let tmpHarness = buildHarness({ UltravisorNonPromiscuous: true, UltravisorHTTPBeaconAdmission: 'audit' }, { AuthBeacon: true });
					tmpHarness.answer = DENY('Invalid beacon-join secret');
					let tmpResult = await httpRegister(tmpHarness, workerBody({ Name: 'worker "q"' }));
					expectRegistered(tmpHarness, tmpResult, 'worker "q"');
					await httpRegister(tmpHarness, workerBody({ Name: 'worker "q"' }));

					let tmpAudit = tmpHarness.logs.filter((pLine) => pLine.indexOf('[Admission:audit]') >= 0);
					Expect(tmpAudit).to.have.length(1);
					Expect(tmpAudit[0], 'the name is JSON-escaped').to.contain('"worker \\"q\\""');
					Expect(tmpAudit[0]).to.contain('Invalid beacon-join secret');
				});

				test('a register that passes is not logged', async function ()
				{
					let tmpHarness = buildHarness({ UltravisorNonPromiscuous: true, UltravisorHTTPBeaconAdmission: 'audit' }, { AuthBeacon: true });
					expectRegistered(tmpHarness, await httpRegister(tmpHarness, workerBody({ JoinSecret: 'right' })));
					Expect(tmpHarness.logs.filter((pLine) => pLine.indexOf('[Admission:audit]') >= 0)).to.deep.equal([]);
				});
			}
		);

		suite
		(
			'Reading the setting',
			function ()
			{
				function modeFor(pValue, pSecured)
				{
					let tmpHarness = buildHarness({ UltravisorNonPromiscuous: pSecured !== false });
					if (pValue !== undefined)
					{
						tmpHarness.self.fable.ProgramConfiguration.UltravisorHTTPBeaconAdmission = pValue;
					}
					return { Mode: tmpHarness.self._httpBeaconAdmissionMode(), Logs: tmpHarness.logs, Harness: tmpHarness };
				}

				test('unset: off, and nothing logged', function ()
				{
					let tmpRead = modeFor(undefined);
					Expect(tmpRead.Mode).to.equal('off');
					Expect(tmpRead.Logs).to.deep.equal([]);
				});

				test('true, "enforce", " Enforce ", "AUDIT", "off", false and null are recognized', function ()
				{
					[[true, 'enforce'], ['enforce', 'enforce'], [' Enforce ', 'enforce'], ['AUDIT', 'audit'], ['off', 'off'], [false, 'off'], [null, 'off']].forEach((pPair) =>
					{
						let tmpRead = modeFor(pPair[0]);
						Expect(tmpRead.Mode, JSON.stringify(pPair[0])).to.equal(pPair[1]);
						Expect(tmpRead.Logs, JSON.stringify(pPair[0])).to.deep.equal(['info [Admission] HTTP beacon registration admission: ' + pPair[1] + '.']);
					});
				});

				test('anything else is off, with a warning: the string "true", 1, "yes", "on"', function ()
				{
					['true', 1, 'yes', 'on'].forEach((pValue) =>
					{
						let tmpRead = modeFor(pValue);
						Expect(tmpRead.Mode, JSON.stringify(pValue)).to.equal('off');
						Expect(tmpRead.Logs.filter((pLine) => pLine.indexOf('warn ') === 0 && pLine.indexOf('is not "off", "audit", "enforce" or true') >= 0), JSON.stringify(pValue)).to.have.length(1);
					});
				});

				test('the mode is logged once, not per request, and again when the setting changes', function ()
				{
					let tmpRead = modeFor('audit');
					tmpRead.Harness.self._httpBeaconAdmissionMode();
					tmpRead.Harness.self._httpBeaconAdmissionMode();
					Expect(tmpRead.Logs).to.have.length(1);
					tmpRead.Harness.self.fable.ProgramConfiguration.UltravisorHTTPBeaconAdmission = 'enforce';
					tmpRead.Harness.self._httpBeaconAdmissionMode();
					Expect(tmpRead.Logs).to.have.length(2);
				});

				test('the route is wired to the handler, and the mode is logged at startup', function ()
				{
					let tmpSource = libFS.readFileSync(libPath.join(__dirname, '..', 'source', 'web_server', 'Ultravisor-API-Server.cjs'), 'utf8');
					Expect(tmpSource).to.match(/'\/Beacon\/Register',\s*this\._handleBeaconHTTPRegister\.bind\(this\)\s*\);\s*\/\/[^\n]*\n\s*this\._httpBeaconAdmissionMode\(\);/);
				});
			}
		);
	}
);
