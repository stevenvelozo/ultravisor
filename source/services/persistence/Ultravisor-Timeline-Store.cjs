/**
 * Ultravisor Timeline Store (Phase 5 — Pillar 1)
 *
 * Meadow-backed persistence for the normalized timeline event stream.
 * Two tables share the same shape: TimelineRecord (hot) and
 * TimelineRecordArchive (cold). The /Timeline endpoint queries via this
 * service; the aggregator writes via this service.
 *
 * Architecture:
 *   - Shares the existing UltravisorBeaconQueueStore's Meadow connector
 *     (`fable.MeadowSQLiteProvider`). Two timeline tables join the same
 *     beacon-queue.sqlite database in dev; in production every UV table
 *     lives in one Postgres / MySQL schema. Cold-tiering the archive
 *     is a deployment concern (Postgres partitioning, read replica,
 *     dedicated cold-storage connector) — not a code concern.
 *   - Pure Meadow CRUD (no raw better-sqlite3). The DALs use
 *     setProvider('SQLite') and resolve through fable's
 *     MeadowSQLiteProvider, exactly like BeaconQueueStore. A
 *     deployment that switches to Postgres replaces the connector
 *     class via fable.settings.MeadowProvider; no store code changes.
 *
 * Bootstrap:
 *   1. createTables / createAllIndices via the shared connector's
 *      schemaProvider (idempotent — IF NOT EXISTS).
 *   2. meadow-migrationmanager handles forward-only ADD COLUMN /
 *      ADD INDEX drift, scoped to our two tables.
 *
 * Public API:
 *   initialize()                       → boolean (sync return)
 *   isEnabled()                        → boolean
 *   insertBatch(pRecords)              → number actually inserted
 *   readRange(pFilter)                 → { Records: [...], More: boolean }
 *   countRange(pFilter)                → number
 *   archiveOlderThan(pCutoffIso)       → number moved to archive
 *
 * Idempotency: insertBatch dedups on EventGUID via a single SELECT IN
 * probe before fanning out the inserts. A retried event is a no-op.
 *
 * @module Ultravisor-Timeline-Store
 */

const libPictService = require('pict-serviceproviderbase');
const libFS = require('fs');
const libPath = require('path');
const libCrypto = require('crypto');
const libMeadow = require('meadow');
const libMeadowMigrationManager = require('meadow-migrationmanager');

const SCHEMA_PATH = libPath.join(__dirname, '..', '..', 'datamodel', 'Ultravisor-Timeline.json');
const READS_CAP_DEFAULT = 10000;

class UltravisorTimelineStore extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.serviceType = 'UltravisorTimelineStore';

		this._Schema = null;
		this._Initialized = false;
		this._Enabled = false;

		// One Meadow DAL per table.
		this._DAL = {};

		this._SQLiteProvider = null;
		this._MM = null;
	}

	// ====================================================================
	// Lifecycle
	// ====================================================================

	initialize()
	{
		if (this._Initialized) { return this._Enabled; }
		this._Initialized = true;

		try
		{
			this._Schema = JSON.parse(libFS.readFileSync(SCHEMA_PATH, 'utf8'));
		}
		catch (pError)
		{
			this.log.error(`TimelineStore: failed to load schema [${SCHEMA_PATH}]: ${pError.message}`);
			return false;
		}

		// Use the existing UV-wide Meadow connector. BeaconQueueStore
		// registers `fable.MeadowSQLiteProvider` during its initialize();
		// we ride on top of it. Order matters — TimelineStore must be
		// initialized *after* BeaconQueueStore in CLIProgram.cjs, which
		// it already is.
		this._SQLiteProvider = this.fable.MeadowSQLiteProvider;
		if (!this._SQLiteProvider)
		{
			this.log.warn('TimelineStore: fable.MeadowSQLiteProvider not available; persistence disabled.');
			return false;
		}

		try
		{
			this._instantiateDALs();
			this._bootstrapSchema();
		}
		catch (pError)
		{
			this.log.error(`TimelineStore: schema provisioning failed: ${pError.message}`);
			return false;
		}

		this._Enabled = true;
		this.log.info('TimelineStore: ready (sharing UltravisorBeaconQueueStore Meadow connector).');
		return true;
	}

	isEnabled() { return this._Enabled; }

	// ====================================================================
	// Sync wrapper for meadow's callback-style API.
	// better-sqlite3 fires callbacks synchronously; we exploit that.
	// (Postgres swap-in would need an async-returning equivalent here;
	// out of Phase 5 scope.)
	// ====================================================================

	_runSync(pAction)
	{
		let tmpResult = { fired: false, error: null, args: null };
		pAction((pErr, ...pRest) =>
		{
			tmpResult.fired = true;
			tmpResult.error = pErr || null;
			tmpResult.args = pRest;
		});
		if (!tmpResult.fired)
		{
			throw new Error('TimelineStore: meadow callback did not fire synchronously (unexpected).');
		}
		if (tmpResult.error) { throw tmpResult.error; }
		return tmpResult.args;
	}

	// ====================================================================
	// Schema bootstrap
	// ====================================================================

	_instantiateDALs()
	{
		let tmpTables = this._Schema.Tables || {};
		let tmpNames = Object.keys(tmpTables);
		for (let i = 0; i < tmpNames.length; i++)
		{
			let tmpEntry = tmpTables[tmpNames[i]];
			let tmpMeadowSchema = tmpEntry.MeadowSchema;
			if (!tmpMeadowSchema)
			{
				throw new Error(`TimelineStore: model entry [${tmpNames[i]}] missing MeadowSchema.`);
			}
			let tmpDAL = libMeadow.new(this.fable).loadFromPackageObject(tmpMeadowSchema);
			tmpDAL.setProvider('SQLite');
			this._DAL[tmpNames[i]] = tmpDAL;
		}
	}

	_collectMeadowTables()
	{
		const TYPE_TO_DATATYPE =
		{
			AutoIdentity: 'ID',
			AutoGUID:     'GUID',
			ForeignKey:   'ForeignKey',
			Integer:      'Numeric',
			Float:        'Decimal',
			Decimal:      'Decimal',
			Boolean:      'Boolean',
			Deleted:      'Boolean',
			CreateDate:   'DateTime',
			UpdateDate:   'DateTime',
			DeleteDate:   'DateTime',
			DateTime:     'DateTime',
			String:       'String',
			Text:         'Text',
			JSON:         'Text'
		};
		let tmpTables = [];
		let tmpNames = Object.keys(this._Schema.Tables || {});
		for (let i = 0; i < tmpNames.length; i++)
		{
			let tmpEntry = this._Schema.Tables[tmpNames[i]];
			let tmpSchema = tmpEntry.MeadowSchema && tmpEntry.MeadowSchema.Schema;
			if (!Array.isArray(tmpSchema)) { continue; }
			let tmpColumns = tmpSchema.map((pC) =>
			{
				let tmpDT = TYPE_TO_DATATYPE[pC.Type] || 'Text';
				let tmpCol = { Column: pC.Column, DataType: tmpDT };
				if (pC.Size && pC.Size !== 'Default' && pC.Size !== 'int')
				{
					tmpCol.Size = pC.Size;
				}
				if (pC.Indexed) { tmpCol.Indexed = pC.Indexed; }
				if (pC.IndexName) { tmpCol.IndexName = pC.IndexName; }
				return tmpCol;
			});
			tmpTables.push({ TableName: tmpEntry.TableName, Columns: tmpColumns });
		}
		return tmpTables;
	}

	_bootstrapSchema()
	{
		let tmpSchemaProvider = this._SQLiteProvider.schemaProvider;
		if (!tmpSchemaProvider || typeof tmpSchemaProvider.createTables !== 'function')
		{
			throw new Error('TimelineStore: SQLite schemaProvider not exposed by connector.');
		}
		let tmpMeadowSchema = { Tables: this._collectMeadowTables() };
		this._runSync((cb) => tmpSchemaProvider.createTables(tmpMeadowSchema, cb));
		this._runSync((cb) => tmpSchemaProvider.createAllIndices(tmpMeadowSchema, cb));
		this._runForwardMigrations(tmpSchemaProvider, tmpMeadowSchema);
	}

	_runForwardMigrations(pSchemaProvider, pMeadowSchema)
	{
		if (!this._MM)
		{
			this._MM = new libMeadowMigrationManager(
				{
					Product: 'TimelineStore',
					LogStreams: (this.fable.settings && this.fable.settings.LogStreams)
						|| [{ streamtype: 'console', level: 'warn' }]
				});
			this._SchemaIntrospector = this._MM.instantiateServiceProvider('SchemaIntrospector');
			this._SchemaDiff         = this._MM.instantiateServiceProvider('SchemaDiff');
			this._MigrationGenerator = this._MM.instantiateServiceProvider('MigrationGenerator');
		}

		let tmpArgs = this._runSync((cb) =>
			this._SchemaIntrospector.introspectDatabase(pSchemaProvider, cb));
		let tmpIntrospected = tmpArgs[0] || { Tables: [] };

		// Restrict to our tables — other tables in the same DB belong
		// to other stores and should not show up here as missing.
		let tmpOwn = new Set(pMeadowSchema.Tables.map((pT) => pT.TableName));
		let tmpFilteredSource =
		{
			Tables: (tmpIntrospected.Tables || []).filter((pT) => tmpOwn.has(pT.TableName))
		};

		let tmpDiff = this._SchemaDiff.diffSchemas(tmpFilteredSource, pMeadowSchema);
		let tmpModified = (tmpDiff.TablesModified || []).map((pM) => (
			{
				TableName: pM.TableName,
				ColumnsAdded: pM.ColumnsAdded || [],
				ColumnsRemoved: [], ColumnsModified: [],
				IndicesAdded: pM.IndicesAdded || [],
				IndicesRemoved: [],
				ForeignKeysAdded: pM.ForeignKeysAdded || [],
				ForeignKeysRemoved: []
			})).filter((pM) => pM.ColumnsAdded.length > 0 || pM.IndicesAdded.length > 0);

		if (tmpModified.length === 0) { return; }

		let tmpStatements = this._MigrationGenerator.generateMigrationStatements(
			{ TablesAdded: [], TablesRemoved: [], TablesModified: tmpModified }, 'SQLite');

		// Use the connector's underlying DB to apply migrations. This
		// is the same `this._SQLiteProvider.db` BeaconQueueStore uses.
		let tmpDB = this._SQLiteProvider.db;
		for (let i = 0; i < tmpStatements.length; i++)
		{
			let tmpSql = tmpStatements[i];
			if (!tmpSql || tmpSql.trim().length === 0 || tmpSql.trim().indexOf('--') === 0) { continue; }
			try
			{
				tmpDB.exec(tmpSql);
				this.log.info(`TimelineStore: migrated ${tmpSql.replace(/\s+/g, ' ').slice(0, 120)}`);
			}
			catch (pExecErr)
			{
				if (/duplicate column|already exists/i.test(pExecErr.message || '')) { continue; }
				throw pExecErr;
			}
		}
	}

	// ====================================================================
	// Helpers
	// ====================================================================

	_dal(pTable)
	{
		let tmpDAL = this._DAL[pTable];
		if (!tmpDAL) { throw new Error(`TimelineStore: unknown table [${pTable}]`); }
		return tmpDAL;
	}

	_nowIso() { return new Date().toISOString(); }

	_coerceRecord(pRecord)
	{
		let tmpClean = {};
		let tmpKeys = Object.keys(pRecord || {});
		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpV = pRecord[tmpKeys[i]];
			if (tmpV === undefined) { tmpClean[tmpKeys[i]] = null; continue; }
			if (tmpV === null) { tmpClean[tmpKeys[i]] = null; continue; }
			if (typeof tmpV === 'boolean') { tmpClean[tmpKeys[i]] = tmpV ? 1 : 0; continue; }
			if (typeof tmpV === 'number' || typeof tmpV === 'string'
				|| typeof tmpV === 'bigint' || Buffer.isBuffer(tmpV))
			{
				tmpClean[tmpKeys[i]] = tmpV;
				continue;
			}
			try { tmpClean[tmpKeys[i]] = JSON.stringify(tmpV); }
			catch (pErr) { tmpClean[tmpKeys[i]] = null; }
		}
		return tmpClean;
	}

	// ====================================================================
	// Insert (idempotent on EventGUID)
	// ====================================================================

	insertBatch(pRecords)
	{
		if (!this._Enabled || !Array.isArray(pRecords) || pRecords.length === 0) { return 0; }
		let tmpDAL = this._dal('TimelineRecord');

		// Dedup probe — one SELECT IN against existing EventGUIDs.
		let tmpExisting = new Set();
		let tmpGUIDs = pRecords.map((pR) => pR && pR.EventGUID).filter((pG) => !!pG);
		if (tmpGUIDs.length > 0)
		{
			let tmpProbeQuery = tmpDAL.query.clone()
				.setBegin(0)
				.setCap(tmpGUIDs.length)
				.addFilter('EventGUID', tmpGUIDs, 'IN', 'AND');
			try
			{
				let tmpArgs = this._runSync((cb) => tmpDAL.doReads(tmpProbeQuery, cb));
				let tmpRows = tmpArgs[1] || [];
				for (let i = 0; i < tmpRows.length; i++) { tmpExisting.add(tmpRows[i].EventGUID); }
			}
			catch (pErr)
			{
				this.log.warn(`TimelineStore: dedup probe failed: ${pErr.message}`);
			}
		}

		// Bulk-insert path: per-row Meadow doCreate is ~1ms each which
		// becomes a serialization point under huge-stress (~100 events/s
		// blocks the broadcast path 10% of the time). A multi-row
		// INSERT in a single transaction drains 100 rows in 1-2ms total
		// on SQLite. The SQL shape (INSERT INTO ... VALUES (?,?), (?,?))
		// works identically on SQLite, MySQL, and Postgres; positional
		// `?` is what better-sqlite3 / mysql2 want, and the meadow PG
		// connector translates `?` to `$N` in its own query layer (or,
		// worst case, the PG path can be an `_insertBatchPG` variant —
		// 15 lines, same structure). Reads still go through Meadow
		// DALs, which is where the cross-DB portability matters most.
		let tmpToInsert = [];
		let tmpNow = this._nowIso();
		for (let i = 0; i < pRecords.length; i++)
		{
			let tmpR = pRecords[i];
			if (!tmpR || !tmpR.EventGUID) { continue; }
			if (tmpExisting.has(tmpR.EventGUID)) { continue; }
			tmpToInsert.push({
				GUIDTimelineRecord: libCrypto.randomUUID(),
				CreateDate:    tmpNow,
				UpdateDate:    tmpNow,
				CreatingIDUser: 0,
				UpdatingIDUser: 0,
				Deleted: 0,
				DeleteDate: null,
				DeletingIDUser: 0,
				EventGUID:     tmpR.EventGUID,
				At:            tmpR.At || tmpNow,
				EndAt:         tmpR.EndAt || tmpR.At || tmpNow,
				EventType:     tmpR.EventType || '',
				RunHash:       tmpR.RunHash || '',
				OperationHash: tmpR.OperationHash || '',
				WorkItemHash:  tmpR.WorkItemHash || '',
				Capability:    tmpR.Capability || '',
				Action:        tmpR.Action || '',
				BeaconID:      tmpR.BeaconID || '',
				Status:        tmpR.Status || '',
				DurationMs:    Number.isFinite(tmpR.DurationMs) ? tmpR.DurationMs : 0,
				RawRefHash:    tmpR.RawRefHash || '',
				InsertedAt:    tmpNow
			});
		}
		if (tmpToInsert.length === 0) { return 0; }

		let tmpDB = this._SQLiteProvider && this._SQLiteProvider.db;
		if (!tmpDB)
		{
			this.log.warn('TimelineStore: bulk insert skipped — no DB handle on connector.');
			return 0;
		}

		const tmpCols = [
			'GUIDTimelineRecord','CreateDate','UpdateDate',
			'CreatingIDUser','UpdatingIDUser',
			'Deleted','DeleteDate','DeletingIDUser',
			'EventGUID','At','EndAt','EventType',
			'RunHash','OperationHash','WorkItemHash',
			'Capability','Action','BeaconID','Status',
			'DurationMs','RawRefHash','InsertedAt'
		];
		let tmpRowPlaceholders = '(' + tmpCols.map(() => '?').join(',') + ')';
		let tmpAllPlaceholders = tmpToInsert.map(() => tmpRowPlaceholders).join(',');
		let tmpSql = `INSERT INTO TimelineRecord (${tmpCols.join(',')}) VALUES ${tmpAllPlaceholders}`;
		let tmpParams = [];
		for (let i = 0; i < tmpToInsert.length; i++)
		{
			let tmpRow = tmpToInsert[i];
			for (let j = 0; j < tmpCols.length; j++)
			{
				let tmpV = tmpRow[tmpCols[j]];
				if (tmpV === undefined || tmpV === null) { tmpParams.push(null); }
				else if (typeof tmpV === 'boolean') { tmpParams.push(tmpV ? 1 : 0); }
				else { tmpParams.push(tmpV); }
			}
		}

		try
		{
			let tmpStmt = tmpDB.prepare(tmpSql);
			let tmpInfo = tmpStmt.run(tmpParams);
			return tmpInfo && tmpInfo.changes ? tmpInfo.changes : tmpToInsert.length;
		}
		catch (pErr)
		{
			this.log.warn(`TimelineStore: bulk insert failed (${tmpToInsert.length} rows): ${pErr.message}`);
			return 0;
		}
	}

	// ====================================================================
	// Read range
	// ====================================================================

	readRange(pFilter)
	{
		if (!this._Enabled) { return { Records: [], More: false }; }
		let tmpFilter = pFilter || {};
		let tmpLimit = Number.isFinite(tmpFilter.Limit) && tmpFilter.Limit > 0
			? Math.min(tmpFilter.Limit, READS_CAP_DEFAULT)
			: READS_CAP_DEFAULT;

		let tmpHot = this._readRangeOneTable('TimelineRecord', tmpFilter, tmpLimit + 1);
		let tmpRows = tmpHot;
		if (tmpFilter.IncludeArchive)
		{
			let tmpArchive = this._readRangeOneTable('TimelineRecordArchive', tmpFilter, tmpLimit + 1);
			tmpRows = tmpHot.concat(tmpArchive);
			tmpRows.sort((pA, pB) => (pA.At < pB.At) ? -1 : (pA.At > pB.At) ? 1 : 0);
		}

		let tmpSeen = new Set();
		let tmpOut = [];
		for (let i = 0; i < tmpRows.length && tmpOut.length < tmpLimit; i++)
		{
			let tmpG = tmpRows[i].EventGUID;
			if (tmpSeen.has(tmpG)) { continue; }
			tmpSeen.add(tmpG);
			tmpOut.push(this._projectRowForWire(tmpRows[i]));
		}
		let tmpMore = tmpRows.length > tmpLimit;
		return { Records: tmpOut, More: tmpMore };
	}

	_readRangeOneTable(pTable, pFilter, pCap)
	{
		let tmpDAL = this._dal(pTable);
		let tmpQuery = tmpDAL.query.clone().setBegin(0).setCap(pCap);

		// Range overlap: At < ToIso AND EndAt >= FromIso.
		if (pFilter.ToIso)   { tmpQuery.addFilter('At',    pFilter.ToIso,   '<',  'AND'); }
		if (pFilter.FromIso) { tmpQuery.addFilter('EndAt', pFilter.FromIso, '>=', 'AND'); }
		if (Array.isArray(pFilter.Capabilities) && pFilter.Capabilities.length > 0)
		{
			tmpQuery.addFilter('Capability', pFilter.Capabilities, 'IN', 'AND');
		}
		if (Array.isArray(pFilter.RunHashes) && pFilter.RunHashes.length > 0)
		{
			tmpQuery.addFilter('RunHash', pFilter.RunHashes, 'IN', 'AND');
		}
		if (pFilter.WorkItemHash)
		{
			tmpQuery.addFilter('WorkItemHash', pFilter.WorkItemHash, '=', 'AND');
		}
		tmpQuery.addSort({ Column: 'At', Direction: 'Ascending' });

		try
		{
			let tmpArgs = this._runSync((cb) => tmpDAL.doReads(tmpQuery, cb));
			return tmpArgs[1] || [];
		}
		catch (pErr)
		{
			this.log.warn(`TimelineStore: read failed on ${pTable}: ${pErr.message}`);
			return [];
		}
	}

	_projectRowForWire(pRow)
	{
		return {
			EventGUID:     pRow.EventGUID,
			At:            pRow.At,
			EndAt:         pRow.EndAt,
			EventType:     pRow.EventType,
			RunHash:       pRow.RunHash,
			OperationHash: pRow.OperationHash,
			WorkItemHash:  pRow.WorkItemHash,
			Capability:    pRow.Capability,
			Action:        pRow.Action,
			BeaconID:      pRow.BeaconID,
			Status:        pRow.Status,
			DurationMs:    pRow.DurationMs,
			RawRefHash:    pRow.RawRefHash
		};
	}

	countRange(pFilter)
	{
		if (!this._Enabled) { return 0; }
		let tmpFilter = pFilter || {};
		let tmpDAL = this._dal('TimelineRecord');
		let tmpQuery = tmpDAL.query.clone();
		if (tmpFilter.ToIso)   { tmpQuery.addFilter('At',    tmpFilter.ToIso,   '<',  'AND'); }
		if (tmpFilter.FromIso) { tmpQuery.addFilter('EndAt', tmpFilter.FromIso, '>=', 'AND'); }
		if (tmpFilter.WorkItemHash)
		{
			tmpQuery.addFilter('WorkItemHash', tmpFilter.WorkItemHash, '=', 'AND');
		}
		try
		{
			let tmpArgs = this._runSync((cb) => tmpDAL.doCount(tmpQuery, cb));
			return tmpArgs[1] || 0;
		}
		catch (pErr)
		{
			this.log.warn(`TimelineStore: count failed: ${pErr.message}`);
			return 0;
		}
	}

	// ====================================================================
	// Archive cycling
	// ====================================================================

	/**
	 * Move every hot row with At < pCutoffIso into the archive table.
	 * INSERT INTO ... SELECT then DELETE, in one transaction.
	 *
	 * Uses raw SQL on the shared connector's DB handle because Meadow
	 * doesn't expose INSERT-FROM-SELECT or batch DELETE-WHERE; portable
	 * to Postgres (same SQL works) and to MySQL (same SQL works).
	 */
	archiveOlderThan(pCutoffIso)
	{
		if (!this._Enabled || !pCutoffIso) { return 0; }
		let tmpDB = this._SQLiteProvider && this._SQLiteProvider.db;
		if (!tmpDB)
		{
			this.log.warn('TimelineStore: archive skipped — no DB handle on the connector.');
			return 0;
		}
		try
		{
			let tmpNow = this._nowIso();
			let tmpInsert = tmpDB.prepare(`
				INSERT INTO TimelineRecordArchive
					(GUIDTimelineRecordArchive, Deleted, CreateDate, UpdateDate,
					 CreatingIDUser, UpdatingIDUser,
					 EventGUID, At, EndAt, EventType, RunHash, OperationHash,
					 WorkItemHash, Capability, Action, BeaconID, Status,
					 DurationMs, RawRefHash, InsertedAt, ArchivedAt)
				SELECT
					GUIDTimelineRecord, Deleted, CreateDate, UpdateDate,
					CreatingIDUser, UpdatingIDUser,
					EventGUID, At, EndAt, EventType, RunHash, OperationHash,
					WorkItemHash, Capability, Action, BeaconID, Status,
					DurationMs, RawRefHash, InsertedAt, ?
				FROM TimelineRecord
				WHERE At < ?
			`);
			let tmpDelete = tmpDB.prepare('DELETE FROM TimelineRecord WHERE At < ?');
			let tmpTx = tmpDB.transaction((pCutoff, pNowIso) =>
			{
				let tmpRes = tmpInsert.run(pNowIso, pCutoff);
				let tmpDelRes = tmpDelete.run(pCutoff);
				return { Inserted: tmpRes.changes, Deleted: tmpDelRes.changes };
			});
			let tmpResult = tmpTx(pCutoffIso, tmpNow);
			if (tmpResult.Inserted !== tmpResult.Deleted)
			{
				this.log.warn(`TimelineStore: archive insert/delete mismatch (${tmpResult.Inserted}/${tmpResult.Deleted})`);
			}
			return tmpResult.Inserted;
		}
		catch (pErr)
		{
			this.log.error(`TimelineStore: archive cycle failed: ${pErr.message}`);
			return 0;
		}
	}
}

module.exports = UltravisorTimelineStore;
