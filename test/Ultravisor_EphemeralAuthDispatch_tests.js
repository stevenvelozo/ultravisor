/**
 * Ephemeral auth dispatches (UltravisorEphemeralAuthDispatches)
 *
 * Every call the hub makes to the auth beacon is a work item with
 * Capability 'Authentication'. Its Settings carry the credential being
 * checked (a beacon's JoinSecret, a user's Password, the bootstrap admin
 * Token), and its Result can carry a SessionToken. By default the hub
 * persists these like any other work item: the queue journal, the
 * compaction snapshot, and the queue store through the persistence bridge.
 *
 * With the option set to true, a standalone Authentication item (no
 * RunHash) is stamped Ephemeral at enqueue and skipped by every one of
 * those writes. These tests pin:
 *
 *   - Option unset, or anything but true: the item is persisted exactly as
 *     before, secret and all. This is the default and must not drift.
 *   - Option on: the secret and the result reach none of the journal, the
 *     snapshot or the store, through enqueue, scheduler dispatch, complete,
 *     fail, compaction and restart.
 *   - The scope is exactly standalone Authentication items. An item with a
 *     RunHash, or of another capability, is persisted as before.
 *   - The auth beacon still receives the same work item.
 *
 * The coordinator, scheduler, journal, queue store, persistence bridge and
 * auth beacon bridge are the real services, on a scratch directory.
 */

const libPict = require('pict');
const libFS = require('fs');
const libPath = require('path');

const Chai = require('chai');
const Expect = Chai.expect;

const libUltravisorBeaconCoordinator = require('../source/services/Ultravisor-Beacon-Coordinator.cjs');
const libUltravisorBeaconQueueStore = require('../source/services/persistence/Ultravisor-Beacon-QueueStore.cjs');
const libUltravisorBeaconQueueJournal = require('../source/services/persistence/Ultravisor-Beacon-QueueJournal.cjs');
const libUltravisorBeaconRunManager = require('../source/services/Ultravisor-Beacon-RunManager.cjs');
const libUltravisorBeaconActionDefaults = require('../source/services/Ultravisor-Beacon-ActionDefaults.cjs');
const libUltravisorBeaconScheduler = require('../source/services/Ultravisor-Beacon-Scheduler.cjs');
const libUltravisorQueuePersistenceBridge = require('../source/services/Ultravisor-QueuePersistenceBridge.cjs');
const libUltravisorAuthBeaconBridge = require('../source/services/Ultravisor-AuthBeaconBridge.cjs');

const TEST_BASE = libPath.resolve(__dirname, '..', '.test_staging_ephemeral_auth');

const SECRET = 'join-s3cret-that-must-not-reach-disk';
const TOKEN = 'session-t0ken-that-must-not-reach-disk';

const ON_IN_CONFIG = { Where: 'ProgramConfiguration', Value: true };
const ON_IN_SETTINGS = { Where: 'settings', Value: true };

let _HubCount = 0;

function ensureClean(pDir)
{
	if (libFS.existsSync(pDir)) { libFS.rmSync(pDir, { recursive: true, force: true }); }
	libFS.mkdirSync(pDir, { recursive: true });
}

function pause(pMs)
{
	return new Promise((fResolve) => setTimeout(fResolve, pMs));
}

function getService(pFable, pName)
{
	let tmpMap = pFable.servicesMap[pName];
	return tmpMap ? Object.values(tmpMap)[0] : null;
}

/**
 * A hub's queue services on a scratch directory. pOption, when given, is
 * applied AFTER the services exist, which is the order Headlight applies its
 * overrides in: { Where: 'ProgramConfiguration' | 'settings', Value }.
 * Pass pDir to open an existing directory, as a restarted hub would.
 */
function buildHub(pOption, pDir)
{
	let tmpDir = pDir || libPath.join(TEST_BASE, 'hub-' + (_HubCount++));
	if (!pDir)
	{
		ensureClean(tmpDir);
	}

	let tmpFable = new libPict({ Product: 'Ultravisor-EphemeralAuth-Test', LogStreams: [{ level: 'fatal' }], UltravisorFileStorePath: tmpDir, UltravisorHubInstanceID: 'testhub' });
	[
		['UltravisorBeaconQueueStore', libUltravisorBeaconQueueStore],
		['UltravisorBeaconQueueJournal', libUltravisorBeaconQueueJournal],
		['UltravisorBeaconCoordinator', libUltravisorBeaconCoordinator],
		['UltravisorBeaconRunManager', libUltravisorBeaconRunManager],
		['UltravisorBeaconActionDefaults', libUltravisorBeaconActionDefaults],
		['UltravisorBeaconScheduler', libUltravisorBeaconScheduler],
		['UltravisorQueuePersistenceBridge', libUltravisorQueuePersistenceBridge],
		['UltravisorAuthBeaconBridge', libUltravisorAuthBeaconBridge]
	].forEach((pPair) => tmpFable.addAndInstantiateServiceTypeIfNotExists(pPair[0], pPair[1]));

	let tmpHub =
	{
		dir: tmpDir,
		fable: tmpFable,
		store: getService(tmpFable, 'UltravisorBeaconQueueStore'),
		journal: getService(tmpFable, 'UltravisorBeaconQueueJournal'),
		coordinator: getService(tmpFable, 'UltravisorBeaconCoordinator'),
		scheduler: getService(tmpFable, 'UltravisorBeaconScheduler'),
		bridge: getService(tmpFable, 'UltravisorAuthBeaconBridge')
	};
	tmpHub.store.initialize(tmpDir);
	tmpHub.journal.initialize(tmpDir);

	if (pOption && pOption.Where === 'settings')
	{
		tmpFable.settings.UltravisorEphemeralAuthDispatches = pOption.Value;
	}
	else if (pOption)
	{
		tmpFable.ProgramConfiguration = Object.assign({}, tmpFable.ProgramConfiguration || {}, { UltravisorEphemeralAuthDispatches: pOption.Value });
	}
	return tmpHub;
}

function addStubBeacon(pCoordinator, pBeaconID, pCapabilities)
{
	pCoordinator._Beacons[pBeaconID] = {
		BeaconID: pBeaconID,
		Name: pBeaconID,
		Capabilities: pCapabilities || ['Shell'],
		MaxConcurrent: 4,
		CurrentWorkItems: [],
		Status: 'Online',
		LastHeartbeat: new Date().toISOString()
	};
}

// What the auth beacon bridge enqueues for a beacon join check.
function authJoinItem(pSecret, pExtra)
{
	return Object.assign(
		{
			Capability: 'Authentication',
			Action: 'AUTH_ValidateBeaconJoin',
			Settings: { BeaconName: 'worker-1', JoinSecret: pSecret || SECRET },
			AffinityKey: 'auth'
		}, pExtra || {});
}

function readOrEmpty(pPath)
{
	return libFS.existsSync(pPath) ? libFS.readFileSync(pPath, 'utf8') : '';
}

function journalText(pHub)
{
	return readOrEmpty(libPath.join(pHub.dir, 'beacon', 'queue-journal.jsonl'));
}

function snapshotText(pHub)
{
	return readOrEmpty(libPath.join(pHub.dir, 'beacon', 'queue-snapshot.json'));
}

// The journal entries ({t, op, d}) that mention a work item.
function journalEntries(pHub, pHash)
{
	return journalText(pHub).split('\n').filter(Boolean)
		.map((pLine) => JSON.parse(pLine))
		.filter((pEntry) => JSON.stringify(pEntry.d).indexOf(pHash) >= 0);
}

function storeRow(pHub, pHash)
{
	return pHub.store.getWorkItemByHash(pHash) || null;
}

function storeEvents(pHub, pHash)
{
	return (pHub.store.listEventsForWorkItem(pHash) || []).map((pEvent) => pEvent.EventType);
}

function viaCallback(fCall)
{
	return new Promise((fResolve) => fCall((pError, pResult) => fResolve({ Error: pError, Result: pResult })));
}

function expectNothingOnDisk(pHub, pHash, pSecrets)
{
	let tmpJournal = journalText(pHub);
	pSecrets.forEach((pSecret) => Expect(tmpJournal, 'journal text').to.not.contain(pSecret));
	Expect(journalEntries(pHub, pHash).map((pEntry) => pEntry.op), 'journal ops for the item').to.not.include('enqueue');
	Expect(storeRow(pHub, pHash), 'queue store row').to.equal(null);
	Expect(storeEvents(pHub, pHash), 'queue store events').to.deep.equal([]);
}

suite
(
	'Ephemeral auth dispatches (UltravisorEphemeralAuthDispatches)',
	function ()
	{
		suiteTeardown(function () { if (libFS.existsSync(TEST_BASE)) { libFS.rmSync(TEST_BASE, { recursive: true, force: true }); } });

		suite
		(
			'Option unset (the default): persisted exactly as before',
			function ()
			{
				test('the option is not in the default configuration, so state persistence cannot write it to disk', function ()
				{
					let tmpDefaults = require('../source/config/Ultravisor-Default-Command-Configuration.cjs');
					Expect(Object.keys(tmpDefaults).length, 'defaults were read').to.be.greaterThan(5);
					Expect(Object.prototype.hasOwnProperty.call(tmpDefaults, 'UltravisorEphemeralAuthDispatches')).to.equal(false);
				});

				test('an Authentication item is persisted with its secret: store row, enqueued event, journal line', async function ()
				{
					let tmpHub = buildHub();
					let tmpItem = tmpHub.coordinator.enqueueWorkItem(authJoinItem());
					await pause(20);

					Expect(tmpItem).to.not.have.property('Ephemeral');
					Expect(storeRow(tmpHub, tmpItem.WorkItemHash).Settings.JoinSecret).to.equal(SECRET);
					Expect(storeEvents(tmpHub, tmpItem.WorkItemHash)).to.include('enqueued');
					Expect(journalEntries(tmpHub, tmpItem.WorkItemHash).map((pEntry) => pEntry.op)).to.include('enqueue');
					Expect(journalText(tmpHub)).to.contain(SECRET);
				});

				test('only a literal true turns it on: "true", 1, "yes" and false persist like unset', async function ()
				{
					let tmpOptions =
					[
						{ Where: 'ProgramConfiguration', Value: 'true' },
						{ Where: 'settings', Value: 1 },
						{ Where: 'ProgramConfiguration', Value: 'yes' },
						{ Where: 'settings', Value: false }
					];
					for (let i = 0; i < tmpOptions.length; i++)
					{
						let tmpLabel = tmpOptions[i].Where + '=' + JSON.stringify(tmpOptions[i].Value);
						let tmpHub = buildHub(tmpOptions[i]);
						let tmpItem = tmpHub.coordinator.enqueueWorkItem(authJoinItem());
						await pause(20);
						Expect(tmpItem, tmpLabel).to.not.have.property('Ephemeral');
						Expect(storeRow(tmpHub, tmpItem.WorkItemHash), tmpLabel).to.not.equal(null);
						Expect(journalText(tmpHub), tmpLabel).to.contain(SECRET);
					}
				});
			}
		);

		suite
		(
			'Option on: its Settings and Result never reach disk',
			function ()
			{
				[ON_IN_CONFIG, ON_IN_SETTINGS].forEach((pOption) =>
				{
					test('set in ' + pOption.Where + ' after the services exist: stamped Ephemeral, nothing written at enqueue', async function ()
					{
						let tmpHub = buildHub(pOption);
						let tmpItem = tmpHub.coordinator.enqueueWorkItem(authJoinItem());
						await pause(20);
						Expect(tmpItem.Ephemeral).to.equal(true);
						Expect(tmpItem.Settings.JoinSecret, 'the item in memory is untouched').to.equal(SECRET);
						expectNothingOnDisk(tmpHub, tmpItem.WorkItemHash, [SECRET]);
					});
				});

				test('scheduler dispatch writes nothing for it, while a Shell item in the same tick is written', async function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					let tmpAuth = tmpHub.coordinator.enqueueWorkItem(authJoinItem());
					let tmpShell = tmpHub.coordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute', Settings: { Command: 'echo control' } });
					addStubBeacon(tmpHub.coordinator, 'auth-1', ['Authentication']);
					addStubBeacon(tmpHub.coordinator, 'shell-1', ['Shell']);
					tmpHub.scheduler._dispatchTick();
					await pause(20);

					Expect(tmpAuth.Status, 'the dispatch site ran for the auth item').to.equal('Dispatched');
					Expect(storeRow(tmpHub, tmpShell.WorkItemHash).Status, 'the dispatch site wrote the Shell item').to.equal('Dispatched');
					expectNothingOnDisk(tmpHub, tmpAuth.WorkItemHash, [SECRET]);
				});

				test('complete writes nothing for it, and its result never reaches disk', async function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					let tmpItem = tmpHub.coordinator.enqueueWorkItem(authJoinItem());
					let tmpDone = await viaCallback((fDone) => tmpHub.coordinator.completeWorkItem(tmpItem.WorkItemHash, { Outputs: { Allowed: true, SessionToken: TOKEN } }, fDone));
					await pause(20);
					Expect(tmpDone.Error).to.equal(null);
					expectNothingOnDisk(tmpHub, tmpItem.WorkItemHash, [SECRET, TOKEN]);
				});

				test('fail writes nothing for it', async function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					let tmpItem = tmpHub.coordinator.enqueueWorkItem(authJoinItem());
					let tmpDone = await viaCallback((fDone) => tmpHub.coordinator.failWorkItem(tmpItem.WorkItemHash, { message: 'refused' }, fDone));
					await pause(20);
					Expect(tmpItem.Status, 'the item was failed').to.equal('Error');
					Expect(tmpDone.Error || null).to.equal(null);
					expectNothingOnDisk(tmpHub, tmpItem.WorkItemHash, [SECRET]);
				});

				test('compaction leaves it out of the snapshot, and keeps an in-flight Shell item', async function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					let tmpAuth = tmpHub.coordinator.enqueueWorkItem(authJoinItem());
					let tmpShell = tmpHub.coordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute', Settings: { Command: 'echo control' } });
					tmpHub.journal.compact(tmpHub.coordinator._WorkQueue, tmpHub.coordinator._AffinityBindings);

					let tmpSnapshot = snapshotText(tmpHub);
					Expect(tmpSnapshot, 'the snapshot was written').to.contain(tmpShell.WorkItemHash);
					Expect(tmpSnapshot).to.not.contain(SECRET);
					Expect(tmpSnapshot).to.not.contain(tmpAuth.WorkItemHash);
				});

				test('a restart does not bring it back; an in-flight Shell item does come back', async function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					let tmpAuth = tmpHub.coordinator.enqueueWorkItem(authJoinItem());
					let tmpShell = tmpHub.coordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute', Settings: { Command: 'echo control' } });
					tmpHub.journal.compact(tmpHub.coordinator._WorkQueue, tmpHub.coordinator._AffinityBindings);
					await pause(20);

					let tmpRestarted = buildHub(ON_IN_CONFIG, tmpHub.dir);
					tmpRestarted.coordinator.restoreFromJournal();
					Expect(tmpRestarted.coordinator._WorkQueue[tmpShell.WorkItemHash], 'the Shell item came back').to.be.an('object');
					Expect(tmpRestarted.coordinator._WorkQueue[tmpAuth.WorkItemHash], 'the auth item did not').to.equal(undefined);
				});
			}
		);

		suite
		(
			'Option on: the poll, stall, progress and cancel sites skip it too',
			function ()
			{
				// A beacon on HTTP transport claims work by polling, and the claimed item
				// can then stall, report progress or be canceled. Each is its own write site.
				function pollOne(pHub, pExtra)
				{
					let tmpItem = pHub.coordinator.enqueueWorkItem(authJoinItem(SECRET, pExtra));
					addStubBeacon(pHub.coordinator, 'auth-1', ['Authentication']);
					let tmpPolled = pHub.coordinator.pollForWork('auth-1');
					Expect(tmpPolled && tmpPolled.WorkItemHash, 'the poll claimed the item').to.equal(tmpItem.WorkItemHash);
					Expect(tmpPolled.Settings.JoinSecret, 'the beacon still gets the secret').to.equal(SECRET);
					Expect(tmpItem.Status).to.equal('Running');
					return tmpItem;
				}

				test('poll, first pass: an item already assigned to the polling beacon', async function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					addStubBeacon(tmpHub.coordinator, 'auth-1', ['Authentication']);
					// An AffinityKey naming a registered beacon assigns the item at enqueue.
					let tmpItem = tmpHub.coordinator.enqueueWorkItem(authJoinItem(SECRET, { AffinityKey: 'auth-1' }));
					Expect(tmpItem.Status, 'assigned at enqueue').to.equal('Assigned');
					let tmpPolled = tmpHub.coordinator.pollForWork('auth-1');
					await pause(20);
					Expect(tmpPolled.WorkItemHash).to.equal(tmpItem.WorkItemHash);
					Expect(tmpItem.Status).to.equal('Running');
					expectNothingOnDisk(tmpHub, tmpItem.WorkItemHash, [SECRET]);
				});

				test('poll, second pass: an item from the free pool', async function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					let tmpItem = pollOne(tmpHub);
					await pause(20);
					expectNothingOnDisk(tmpHub, tmpItem.WorkItemHash, [SECRET]);
				});

				test('stall', async function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					let tmpItem = pollOne(tmpHub);
					let tmpDone = await viaCallback((fDone) => tmpHub.coordinator.stallWorkItem(tmpItem.WorkItemHash, fDone));
					await pause(20);
					Expect(tmpDone.Error || null).to.equal(null);
					Expect(tmpItem._StallFinalized, 'the stall ran').to.equal(true);
					expectNothingOnDisk(tmpHub, tmpItem.WorkItemHash, [SECRET]);
				});

				test('progress', async function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					let tmpItem = pollOne(tmpHub);
					let tmpUpdated = tmpHub.coordinator.updateProgress(tmpItem.WorkItemHash, { Percent: 50, Message: 'halfway' });
					await pause(20);
					Expect(tmpUpdated, 'the progress update ran').to.equal(true);
					expectNothingOnDisk(tmpHub, tmpItem.WorkItemHash, [SECRET]);
				});

				test('cancel before dispatch', async function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					let tmpItem = tmpHub.coordinator.enqueueWorkItem(authJoinItem());
					let tmpResult = tmpHub.scheduler.requestCancel(tmpItem.WorkItemHash, 'test');
					await pause(20);
					Expect(tmpResult.Canceled, 'the cancel ran').to.equal(true);
					expectNothingOnDisk(tmpHub, tmpItem.WorkItemHash, [SECRET]);
				});

				test('cancel after dispatch', async function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					let tmpItem = pollOne(tmpHub);
					tmpHub.scheduler.requestCancel(tmpItem.WorkItemHash, 'test');
					await pause(20);
					Expect(tmpItem.CancelRequested, 'the cancel request ran').to.equal(true);
					expectNothingOnDisk(tmpHub, tmpItem.WorkItemHash, [SECRET]);
				});
			}
		);

		suite
		(
			'Every persistence write site is gated',
			function ()
			{
				// The tests above drive the common write sites. This pins all of them,
				// including the scheduler's stall, recovery, health and reorder sites, and
				// any site added later: each place that picks up the persistence bridge
				// must check for an ephemeral item before it writes.
				[
					{ File: 'Ultravisor-Beacon-Coordinator.cjs', Gate: 'this._shouldPersistWorkItem(' },
					{ File: 'Ultravisor-Beacon-Scheduler.cjs', Gate: 'Ephemeral !== true' }
				].forEach((pCase) =>
				{
					test(pCase.File + ': every bridge pickup is followed by a gate that skips ephemeral items', function ()
					{
						let tmpText = libFS.readFileSync(libPath.join(__dirname, '..', 'source', 'services', pCase.File), 'utf8');
						let tmpLines = tmpText.split('\n');
						let tmpPickups = [];
						for (let i = 0; i < tmpLines.length; i++)
						{
							let tmpMatch = /let (tmp\w+) = this\._(getQueuePersistenceBridge|getBridge)\(\);/.exec(tmpLines[i]);
							if (tmpMatch)
							{
								tmpPickups.push({ Line: i + 1, Variable: tmpMatch[1], Next: (tmpLines[i + 1] || '').trim() });
							}
						}
						// A pattern that matched nothing would pass every assertion below.
						Expect(tmpPickups.length, 'bridge pickups found').to.be.at.least(7);
						tmpPickups.forEach((pPickup) =>
						{
							Expect(pPickup.Next.indexOf('if (' + pPickup.Variable + ' && '), 'line ' + pPickup.Line + ': the next line gates on ' + pPickup.Variable).to.equal(0);
							Expect(pPickup.Next, 'line ' + pPickup.Line + ': ' + pPickup.Variable + ' writes without checking Ephemeral').to.contain(pCase.Gate);
						});
						Expect(tmpText.match(/_(getQueuePersistenceBridge|getBridge)\(\)\s*\./g) || [], 'the bridge used inline, outside any gate').to.deep.equal([]);
					});
				});
			}
		);

		suite
		(
			'Option on: the scope is exactly standalone Authentication items',
			function ()
			{
				test('an Authentication item with a RunHash is persisted as before (operation graphs need the journal)', async function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					let tmpItem = tmpHub.coordinator.enqueueWorkItem(authJoinItem(SECRET, { RunHash: 'run-1', NodeHash: 'node-1' }));
					await pause(20);
					Expect(tmpItem).to.not.have.property('Ephemeral');
					Expect(storeRow(tmpHub, tmpItem.WorkItemHash)).to.not.equal(null);
					Expect(journalText(tmpHub)).to.contain(SECRET);
				});

				test('another capability is persisted as before', async function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					let tmpItem = tmpHub.coordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute', Settings: { Command: 'echo ' + SECRET } });
					await pause(20);
					Expect(tmpItem).to.not.have.property('Ephemeral');
					Expect(storeRow(tmpHub, tmpItem.WorkItemHash)).to.not.equal(null);
					Expect(journalText(tmpHub)).to.contain(SECRET);
				});

				test('a non-Authentication item journals the same line with the option on or off', async function ()
				{
					let fNormalized = (pHub, pHash) => journalEntries(pHub, pHash)
						.map((pEntry) => JSON.stringify(pEntry).split(pHash).join('<HASH>').replace(/\d{4}-\d{2}-\d{2}T[0-9:.]+Z/g, '<T>'));
					let tmpOff = buildHub();
					let tmpOn = buildHub(ON_IN_CONFIG);
					let tmpOffItem = tmpOff.coordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute', Settings: { Command: 'echo same' } });
					let tmpOnItem = tmpOn.coordinator.enqueueWorkItem({ Capability: 'Shell', Action: 'Execute', Settings: { Command: 'echo same' } });

					let tmpOffLines = fNormalized(tmpOff, tmpOffItem.WorkItemHash);
					Expect(tmpOffLines.length, 'the item was journaled').to.be.greaterThan(0);
					Expect(fNormalized(tmpOn, tmpOnItem.WorkItemHash)).to.deep.equal(tmpOffLines);
				});
			}
		);

		suite
		(
			'Option on: the auth beacon still gets the same work item',
			function ()
			{
				test('the payload sent to a beacon still carries the Settings, and no Ephemeral field', function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					let tmpItem = tmpHub.coordinator.enqueueWorkItem(authJoinItem());
					let tmpWire = tmpHub.coordinator._sanitizeWorkItemForBeacon(tmpItem);
					Expect(tmpWire.Settings.JoinSecret).to.equal(SECRET);
					Expect(tmpWire).to.not.have.property('Ephemeral');
				});

				test('end to end through the auth beacon bridge: the join is answered, and nothing reaches disk', async function ()
				{
					let tmpHub = buildHub(ON_IN_CONFIG);
					addStubBeacon(tmpHub.coordinator, 'auth-1', ['Authentication']);
					let tmpAnswer = tmpHub.bridge.validateBeaconJoin('worker-9', SECRET, ['Shell']);

					// The auth beacon's reply. Completing on a later tick matches a real
					// beacon; a synchronous completion would race the callback registration.
					await new Promise((fResolve) => setImmediate(fResolve));
					let tmpItem = Object.values(tmpHub.coordinator._WorkQueue).find((pItem) => pItem.Capability === 'Authentication');
					Expect(tmpItem, 'the bridge enqueued a join check').to.be.an('object');
					Expect(tmpItem.Ephemeral).to.equal(true);
					await viaCallback((fDone) => tmpHub.coordinator.completeWorkItem(tmpItem.WorkItemHash, { Outputs: { Allowed: true, SessionToken: TOKEN } }, fDone));

					let tmpResult = await tmpAnswer;
					Expect(tmpResult.Available).to.equal(true);
					Expect(tmpResult.Allowed).to.equal(true);
					await pause(20);
					expectNothingOnDisk(tmpHub, tmpItem.WorkItemHash, [SECRET, TOKEN]);
				});
			}
		);
	}
);
