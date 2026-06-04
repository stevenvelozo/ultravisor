/**
 * Tests for UltravisorTimelineStore.archiveOlderThan — the hot→cold archive
 * cycle that moves aged TimelineRecord rows into TimelineRecordArchive in a
 * single transaction.
 *
 * The archive cycle drives its transaction directly against the shared
 * connector's DB handle (fable.MeadowSQLiteProvider.db). Under the node:sqlite
 * DatabaseSync driver that handle has no better-sqlite3-style `.transaction(fn)`
 * helper, so these tests stand up the real connector and assert rows actually
 * move — exercising the manual BEGIN/COMMIT/ROLLBACK path end to end.
 */

const libPict = require('pict');
const libFS = require('fs');
const libPath = require('path');

const Chai = require('chai');
const Expect = Chai.expect;

const libUltravisorBeaconQueueStore = require('../source/services/persistence/Ultravisor-Beacon-QueueStore.cjs');
const libUltravisorTimelineStore = require('../source/services/persistence/Ultravisor-Timeline-Store.cjs');

const TEST_BASE = libPath.resolve(__dirname, '..', '.test_staging_timeline');

const OLD_ISO    = '2020-01-01T00:00:00.000Z';
const RECENT_ISO = '2026-01-01T00:00:00.000Z';
const CUTOFF_ISO = '2023-01-01T00:00:00.000Z';

function ensureClean(pDir)
{
	if (libFS.existsSync(pDir))
	{
		libFS.rmSync(pDir, { recursive: true, force: true });
	}
	libFS.mkdirSync(pDir, { recursive: true });
}

/**
 * Stand up a pict/fable instance with the SQLite-backed beacon queue store
 * (which registers fable.MeadowSQLiteProvider) and the timeline store on top.
 *
 * @param {string} pStoragePath - scratch directory for the SQLite file
 * @return {{ Fable: object, TimelineStore: object }}
 */
function buildTimelineStack(pStoragePath)
{
	let tmpFable = new libPict({
		Product: 'Ultravisor-Timeline-Archive-Test',
		LogLevel: 5,
		UltravisorFileStorePath: pStoragePath,
		UltravisorHubInstanceID: 'testhub'
	});

	// BeaconQueueStore.initialize() registers fable.MeadowSQLiteProvider; the
	// timeline store shares that connector and must initialize after it.
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconQueueStore', libUltravisorBeaconQueueStore);
	let tmpQueueStore = Object.values(tmpFable.servicesMap.UltravisorBeaconQueueStore)[0];
	tmpQueueStore.initialize(pStoragePath);

	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorTimelineStore', libUltravisorTimelineStore);
	let tmpTimelineStore = Object.values(tmpFable.servicesMap.UltravisorTimelineStore)[0];
	tmpTimelineStore.initialize();

	return { Fable: tmpFable, TimelineStore: tmpTimelineStore };
}

/**
 * @param {object} pFable - the fable instance holding MeadowSQLiteProvider
 * @param {string} pTable - table to count
 * @return {number} row count
 */
function countTable(pFable, pTable)
{
	return pFable.MeadowSQLiteProvider.db
		.prepare(`SELECT COUNT(*) AS cnt FROM ${pTable}`)
		.get().cnt;
}

function makeEvent(pGUID, pAtIso)
{
	return {
		EventGUID:  pGUID,
		At:         pAtIso,
		EndAt:      pAtIso,
		EventType:  'Run',
		Capability: 'Shell',
		Action:     'Execute',
		Status:     'Complete'
	};
}

suite('Ultravisor Timeline Archive', () =>
{
	let _TestDir = '';

	setup(() =>
	{
		_TestDir = libPath.join(TEST_BASE, `t-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
		ensureClean(_TestDir);
	});

	suiteTeardown(() =>
	{
		if (libFS.existsSync(TEST_BASE))
		{
			libFS.rmSync(TEST_BASE, { recursive: true, force: true });
		}
	});

	test('initializes against the shared SQLite connector and is enabled', () =>
	{
		let tmpStack = buildTimelineStack(_TestDir);
		Expect(tmpStack.Fable.MeadowSQLiteProvider).to.be.an('object');
		Expect(tmpStack.TimelineStore.isEnabled()).to.equal(true);
		Expect(countTable(tmpStack.Fable, 'TimelineRecord')).to.equal(0);
		Expect(countTable(tmpStack.Fable, 'TimelineRecordArchive')).to.equal(0);
	});

	test('archiveOlderThan moves only rows older than the cutoff into the archive table', () =>
	{
		let { Fable: tmpFable, TimelineStore: tmpStore } = buildTimelineStack(_TestDir);

		let tmpInserted = tmpStore.insertBatch([
			makeEvent('evt-old-1', OLD_ISO),
			makeEvent('evt-old-2', OLD_ISO),
			makeEvent('evt-old-3', OLD_ISO),
			makeEvent('evt-new-1', RECENT_ISO),
			makeEvent('evt-new-2', RECENT_ISO)
		]);
		Expect(tmpInserted).to.equal(5);
		Expect(countTable(tmpFable, 'TimelineRecord')).to.equal(5);
		Expect(countTable(tmpFable, 'TimelineRecordArchive')).to.equal(0);

		let tmpMoved = tmpStore.archiveOlderThan(CUTOFF_ISO);

		Expect(tmpMoved).to.equal(3);
		Expect(countTable(tmpFable, 'TimelineRecord')).to.equal(2);
		Expect(countTable(tmpFable, 'TimelineRecordArchive')).to.equal(3);
	});

	test('archived rows preserve EventGUID and stamp ArchivedAt', () =>
	{
		let { Fable: tmpFable, TimelineStore: tmpStore } = buildTimelineStack(_TestDir);
		tmpStore.insertBatch([ makeEvent('evt-archive-me', OLD_ISO) ]);

		let tmpMoved = tmpStore.archiveOlderThan(CUTOFF_ISO);
		Expect(tmpMoved).to.equal(1);

		let tmpRows = tmpFable.MeadowSQLiteProvider.db
			.prepare('SELECT EventGUID, At, ArchivedAt FROM TimelineRecordArchive')
			.all();
		Expect(tmpRows).to.have.lengthOf(1);
		Expect(tmpRows[0].EventGUID).to.equal('evt-archive-me');
		Expect(tmpRows[0].At).to.equal(OLD_ISO);
		Expect(tmpRows[0].ArchivedAt).to.be.a('string').with.length.greaterThan(0);
	});

	test('archiveOlderThan is a no-op (returns 0) when nothing predates the cutoff', () =>
	{
		let { Fable: tmpFable, TimelineStore: tmpStore } = buildTimelineStack(_TestDir);
		tmpStore.insertBatch([
			makeEvent('evt-new-1', RECENT_ISO),
			makeEvent('evt-new-2', RECENT_ISO)
		]);

		let tmpMoved = tmpStore.archiveOlderThan(CUTOFF_ISO);

		Expect(tmpMoved).to.equal(0);
		Expect(countTable(tmpFable, 'TimelineRecord')).to.equal(2);
		Expect(countTable(tmpFable, 'TimelineRecordArchive')).to.equal(0);
	});

	test('archiveOlderThan returns 0 for a missing cutoff without touching either table', () =>
	{
		let { Fable: tmpFable, TimelineStore: tmpStore } = buildTimelineStack(_TestDir);
		tmpStore.insertBatch([ makeEvent('evt-old-1', OLD_ISO) ]);

		Expect(tmpStore.archiveOlderThan(null)).to.equal(0);
		Expect(tmpStore.archiveOlderThan('')).to.equal(0);

		Expect(countTable(tmpFable, 'TimelineRecord')).to.equal(1);
		Expect(countTable(tmpFable, 'TimelineRecordArchive')).to.equal(0);
	});
});
