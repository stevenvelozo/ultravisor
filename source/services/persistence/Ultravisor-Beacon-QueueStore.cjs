/**
 * Ultravisor Beacon Queue Store
 *
 * SQLite-backed persistence for the beacon work queue, runs, affinity
 * bindings, per-attempt history, and action defaults.  Now backed by
 * the meadow DAL (meadow + meadow-connection-sqlite) — the schema
 * lives in source/datamodel/Ultravisor-BeaconQueue.json (single source
 * of truth for both Stricture-style Columns and meadow-style
 * MeadowSchema blocks).
 *
 * Bootstrap path:
 *   1. meadow-connection-sqlite opens beacon-queue.sqlite (WAL mode is
 *      applied by the connector itself) and exposes a SchemaProvider
 *      that emits CREATE TABLE IF NOT EXISTS / CREATE INDEX statements.
 *   2. createTables + createAllIndices run idempotently.
 *   3. meadow-migrationmanager (introspect → diff → forward-only filter
 *      → generate ALTER → execute) handles forward-only ADD COLUMN /
 *      ADD INDEX drift since the last boot. Same path the lab uses.
 *
 * Public API is preserved verbatim (the 5 caller services don't change).
 * `initialize(pStorePath)` remains synchronous-returning: meadow's SQLite
 * provider is backed by better-sqlite3, whose calls resolve their
 * callbacks before returning. We capture results into a local variable
 * via _runSync and surface failure as a thrown error instead of an
 * unfulfilled promise.
 *
 * @module Ultravisor-Beacon-QueueStore
 */

const libPictService = require('pict-serviceproviderbase');
const libFS = require('fs');
const libPath = require('path');
const libMeadow = require('meadow');
const libMeadowConnectionSQLite = require('meadow-connection-sqlite');
const libMeadowMigrationManager = require('meadow-migrationmanager');

// better-sqlite3 isn't directly required any more; meadow-connection-sqlite
// pulls it in transitively. We keep no fallback shim — failures during
// initialize() now surface naturally from the connector.

const SCHEMA_PATH = libPath.join(__dirname, '..', '..', 'datamodel', 'Ultravisor-BeaconQueue.json');
const READS_CAP = 5000;

class UltravisorBeaconQueueStore extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.serviceType = 'UltravisorBeaconQueueStore';

		this._DBPath = '';
		this._DB = null;
		this._Schema = null;
		this._Initialized = false;
		this._Enabled = false;

		// One Meadow DAL per table.
		this._DAL = {};

		// Migration manager + connector handles, lazily set during initialize().
		this._SQLiteProvider = null;
		this._MM = null;
	}

	// ====================================================================
	// Lifecycle
	// ====================================================================

	/**
	 * Initialize the store: open SQLite via meadow-connection-sqlite,
	 * provision tables, run forward-only migrations.
	 *
	 * Synchronous-returning by exploiting better-sqlite3's sync nature —
	 * meadow's SQLite path resolves callbacks before its driver call
	 * returns. _runSync wraps a callback-style call and pulls the result
	 * back to the calling stack frame; if the callback didn't fire
	 * synchronously we throw immediately so the caller sees the
	 * deviation.
	 *
	 * @param {string} pStorePath - Base storage directory
	 * @returns {boolean} true on success
	 */
	initialize(pStorePath)
	{
		if (this._Initialized)
		{
			return this._Enabled;
		}
		this._Initialized = true;

		if (!pStorePath)
		{
			this.log.warn('BeaconQueueStore: no store path; persistence disabled.');
			return false;
		}

		let tmpDir = libPath.join(pStorePath, 'beacon');
		try
		{
			if (!libFS.existsSync(tmpDir))
			{
				libFS.mkdirSync(tmpDir, { recursive: true });
			}
		}
		catch (pError)
		{
			this.log.error(`BeaconQueueStore: failed to create [${tmpDir}]: ${pError.message}`);
			return false;
		}

		this._DBPath = libPath.join(tmpDir, 'beacon-queue.sqlite');

		try
		{
			this._Schema = JSON.parse(libFS.readFileSync(SCHEMA_PATH, 'utf8'));
		}
		catch (pError)
		{
			this.log.error(`BeaconQueueStore: failed to load schema [${SCHEMA_PATH}]: ${pError.message}`);
			return false;
		}

		// The meadow SQLite provider locates the better-sqlite3 handle
		// via fable.MeadowSQLiteProvider — that name is hard-coded in
		// meadow's own SQLite Provider getDB(). Register via the fable
		// service manager so the binding is created automatically;
		// using `new libMeadowConnectionSQLite(...)` directly leaves
		// fable.MeadowSQLiteProvider unset and CRUD calls fail with
		// "No SQLite database connection available".
		//
		// We point the connector at our DB file via fable.settings.SQLite,
		// which is what the connector's constructor reads.
		try
		{
			if (!this.fable.settings.SQLite) { this.fable.settings.SQLite = {}; }
			this.fable.settings.SQLite.SQLiteFilePath = this._DBPath;
			this.fable.settings.MeadowProvider = 'SQLite';

			this.fable.addAndInstantiateServiceTypeIfNotExists(
				'MeadowSQLiteProvider', libMeadowConnectionSQLite);
			this._SQLiteProvider = this.fable.MeadowSQLiteProvider;
		}
		catch (pError)
		{
			this.log.error(`BeaconQueueStore: failed to instantiate meadow-connection-sqlite: ${pError.message}`);
			return false;
		}

		try
		{
			this._runSync((cb) => this._SQLiteProvider.connectAsync(cb));
		}
		catch (pError)
		{
			this.log.error(`BeaconQueueStore: failed to open [${this._DBPath}]: ${pError.message}`);
			return false;
		}

		this._DB = this._SQLiteProvider.db;
		// Match the original WAL/synchronous tuning. The connector
		// already turns WAL on; the rest are still useful.
		try
		{
			this._DB.pragma('synchronous = NORMAL');
			this._DB.pragma('foreign_keys = ON');
		}
		catch (pError)
		{
			this.log.warn(`BeaconQueueStore: pragma tuning failed: ${pError.message}`);
		}

		try
		{
			this._instantiateDALs();
			this._bootstrapSchema();
		}
		catch (pError)
		{
			this.log.error(`BeaconQueueStore: schema provisioning failed: ${pError.message}`);
			return false;
		}

		this._Enabled = true;
		this.log.info(`BeaconQueueStore: ready at [${this._DBPath}].`);
		return true;
	}

	isEnabled()
	{
		return this._Enabled;
	}

	close()
	{
		if (this._DB)
		{
			try { this._DB.close(); } catch (pError) { /* ignore */ }
			this._DB = null;
		}
		this._SQLiteProvider = null;
		this._DAL = {};
		this._Enabled = false;
	}

	// ====================================================================
	// Sync-capture wrapper for meadow's callback-style API.
	//
	// meadow-connection-sqlite is synchronous (better-sqlite3); the
	// callbacks fire before doX returns. We exploit that to keep the
	// public sync API identical to the legacy raw-SQL implementation.
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
			throw new Error('BeaconQueueStore: meadow callback did not fire synchronously (unexpected).');
		}
		if (tmpResult.error) { throw tmpResult.error; }
		return tmpResult.args;
	}

	// ====================================================================
	// Schema bootstrap + DAL instantiation
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
				throw new Error(`BeaconQueueStore: model entry [${tmpNames[i]}] missing MeadowSchema.`);
			}
			let tmpDAL = libMeadow.new(this.fable).loadFromPackageObject(tmpMeadowSchema);
			tmpDAL.setProvider('SQLite');
			this._DAL[tmpNames[i]] = tmpDAL;
		}
	}

	/**
	 * Convert the model's high-level Schema entries (AutoIdentity / Integer /
	 * Boolean / String / Text / DateTime / CreateDate / UpdateDate /
	 * ForeignKey) to the lower-level meadow connector vocabulary the
	 * SQLite schemaProvider expects (ID / Numeric / Boolean / String /
	 * Text / DateTime). Mirrors the lab's _collectMeadowTables.
	 */
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
			throw new Error('BeaconQueueStore: SQLite schemaProvider not exposed by connector.');
		}

		let tmpMeadowSchema = { Tables: this._collectMeadowTables() };

		this._runSync((cb) => tmpSchemaProvider.createTables(tmpMeadowSchema, cb));
		this._runSync((cb) => tmpSchemaProvider.createAllIndices(tmpMeadowSchema, cb));

		this._runForwardMigrations(tmpSchemaProvider, tmpMeadowSchema);
	}

	/**
	 * Forward-only ADD COLUMN / ADD INDEX migration, scoped to our
	 * tables. Same shape as the lab's _runForwardMigrations.
	 */
	_runForwardMigrations(pSchemaProvider, pMeadowSchema)
	{
		if (!this._MM)
		{
			this._MM = new libMeadowMigrationManager(
				{
					Product: 'BeaconQueueStore',
					LogStreams: (this.fable.settings && this.fable.settings.LogStreams) || [{ streamtype: 'console', level: 'warn' }]
				});
			this._SchemaIntrospector = this._MM.instantiateServiceProvider('SchemaIntrospector');
			this._SchemaDiff         = this._MM.instantiateServiceProvider('SchemaDiff');
			this._MigrationGenerator = this._MM.instantiateServiceProvider('MigrationGenerator');
		}

		let tmpArgs = this._runSync((cb) => this._SchemaIntrospector.introspectDatabase(pSchemaProvider, cb));
		let tmpIntrospected = tmpArgs[0] || { Tables: [] };

		// Restrict the introspected snapshot to the tables we own —
		// other tables in the same DB file (none today, but defensive)
		// should not show up as drops we'd skip but still log.
		let tmpOwn = new Set(pMeadowSchema.Tables.map((pT) => pT.TableName));
		let tmpFilteredSource =
		{
			Tables: (tmpIntrospected.Tables || []).filter((pT) => tmpOwn.has(pT.TableName))
		};

		let tmpDiff = this._SchemaDiff.diffSchemas(tmpFilteredSource, pMeadowSchema);

		// Forward-only filter — keep ColumnsAdded / IndicesAdded only,
		// drop ColumnsRemoved / ColumnsModified / IndicesRemoved.
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

		for (let i = 0; i < tmpStatements.length; i++)
		{
			let tmpSql = tmpStatements[i];
			if (!tmpSql || tmpSql.trim().length === 0 || tmpSql.trim().indexOf('--') === 0) { continue; }
			try
			{
				this._DB.exec(tmpSql);
				this.log.info(`BeaconQueueStore: migrated ${tmpSql.replace(/\s+/g, ' ').slice(0, 120)}`);
			}
			catch (pExecErr)
			{
				if (/duplicate column|already exists/i.test(pExecErr.message || ''))
				{
					continue;
				}
				throw pExecErr;
			}
		}
	}

	// ====================================================================
	// Internal helpers
	// ====================================================================

	_dal(pTable)
	{
		let tmpDAL = this._DAL[pTable];
		if (!tmpDAL) { throw new Error(`BeaconQueueStore: unknown table [${pTable}]`); }
		return tmpDAL;
	}

	_idColumn(pTable)
	{
		let tmpEntry = this._Schema && this._Schema.Tables[pTable];
		return tmpEntry && tmpEntry.MeadowSchema && tmpEntry.MeadowSchema.DefaultIdentifier;
	}

	_nowIso()
	{
		return new Date().toISOString();
	}

	_serializeJSON(pValue)
	{
		if (pValue == null) return null;
		if (typeof pValue === 'string') return pValue;
		try { return JSON.stringify(pValue); } catch (pErr) { return null; }
	}

	_parseJSON(pValue, pFallback)
	{
		if (pValue == null || pValue === '') return (pFallback !== undefined) ? pFallback : null;
		if (typeof pValue !== 'string') return pValue;
		try { return JSON.parse(pValue); } catch (pErr) { return (pFallback !== undefined) ? pFallback : null; }
	}

	/**
	 * Coerce JS values into shapes the SQLite provider can bind:
	 *   boolean  → 0/1 (better-sqlite3 rejects bare booleans)
	 *   undefined → null
	 *   number / string / bigint / Buffer → passthrough
	 *   anything else → JSON-stringified
	 *
	 * Same rationale as the lab's _coerceRecord.
	 */
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
			tmpClean[tmpKeys[i]] = JSON.stringify(tmpV);
		}
		return tmpClean;
	}

	/**
	 * Insert a record via the meadow DAL and return the auto-incremented
	 * row id. Mirror of the lab's insert helper, scoped to our tables.
	 */
	_insert(pTable, pRecord)
	{
		let tmpDAL = this._dal(pTable);
		let tmpClean = this._coerceRecord(pRecord);
		let tmpQuery = tmpDAL.query.clone().setIDUser(0).addRecord(tmpClean);
		let tmpArgs = this._runSync((cb) => tmpDAL.doCreate(tmpQuery, cb));
		// doCreate callback: (err, query, queryRead, inserted).
		let tmpInserted = tmpArgs[2];
		let tmpIDCol = this._idColumn(pTable);
		return (tmpInserted && tmpIDCol) ? tmpInserted[tmpIDCol] : null;
	}

	/**
	 * Read a single record by exact-match filter. Returns null if not
	 * found. Multi-filter via the pFilters array of [col, val] pairs.
	 */
	_readOne(pTable, pFilters)
	{
		let tmpDAL = this._dal(pTable);
		let tmpQuery = tmpDAL.query.clone().setBegin(0).setCap(1);
		for (let i = 0; i < pFilters.length; i++)
		{
			tmpQuery.addFilter(pFilters[i][0], pFilters[i][1]);
		}
		let tmpArgs = this._runSync((cb) => tmpDAL.doReads(tmpQuery, cb));
		let tmpRecords = tmpArgs[1] || [];
		return tmpRecords.length > 0 ? tmpRecords[0] : null;
	}

	/**
	 * Update a record by primary key. The lookup-then-merge pattern
	 * preserves COALESCE-style "null patch field => keep existing value"
	 * semantics: nulls and undefined values in pPatch are dropped before
	 * the merge so they can't clobber non-null persisted values.
	 *
	 * Pass pSkipNullCoalesce=true to allow nulls to overwrite.
	 */
	_updateByID(pTable, pIDColumn, pIDValue, pPatch, pSkipNullCoalesce)
	{
		let tmpDAL = this._dal(pTable);
		let tmpExisting = this._readOne(pTable, [[pIDColumn, pIDValue]]);
		if (!tmpExisting) { return 0; }

		let tmpEffective = {};
		let tmpKeys = Object.keys(pPatch || {});
		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpV = pPatch[tmpKeys[i]];
			if (!pSkipNullCoalesce && (tmpV === null || tmpV === undefined))
			{
				continue;
			}
			tmpEffective[tmpKeys[i]] = tmpV;
		}

		let tmpMerged = Object.assign({}, tmpExisting, this._coerceRecord(tmpEffective));
		tmpMerged[pIDColumn] = pIDValue;
		let tmpQuery = tmpDAL.query.clone().setIDUser(0).addRecord(tmpMerged);
		this._runSync((cb) => tmpDAL.doUpdate(tmpQuery, cb));
		return 1;
	}

	// ====================================================================
	// Run lifecycle
	// ====================================================================

	insertRun(pRun)
	{
		if (!this._Enabled) return null;
		let tmpNow = this._nowIso();
		let tmpRecord = {
			GUIDBeaconRun: pRun.GUIDBeaconRun || '',
			Deleted: 0,
			RunID: pRun.RunID,
			IdempotencyKey: pRun.IdempotencyKey || '',
			SubmitterTag: pRun.SubmitterTag || '',
			State: pRun.State || 'Active',
			StartedAt: pRun.StartedAt || tmpNow,
			EndedAt: pRun.EndedAt || null,
			CanceledAt: pRun.CanceledAt || null,
			CancelReason: pRun.CancelReason || '',
			Metadata: this._serializeJSON(pRun.Metadata)
		};
		this._insert('BeaconRun', tmpRecord);
		return this.getRunByRunID(pRun.RunID);
	}

	getRunByRunID(pRunID)
	{
		if (!this._Enabled) return null;
		let tmpRow = this._readOne('BeaconRun', [['RunID', pRunID]]);
		return tmpRow ? this._hydrateRun(tmpRow) : null;
	}

	getRunByIdempotencyKey(pKey)
	{
		if (!this._Enabled || !pKey) return null;
		// Sort by IDBeaconRun DESC so the most recent run wins, matching
		// the original `ORDER BY IDBeaconRun DESC LIMIT 1`.
		let tmpDAL = this._dal('BeaconRun');
		let tmpQuery = tmpDAL.query.clone()
			.setBegin(0)
			.setCap(1)
			.addFilter('IdempotencyKey', pKey)
			.addSort({ Column: 'IDBeaconRun', Direction: 'Descending' });
		let tmpArgs = this._runSync((cb) => tmpDAL.doReads(tmpQuery, cb));
		let tmpRecords = tmpArgs[1] || [];
		return tmpRecords.length > 0 ? this._hydrateRun(tmpRecords[0]) : null;
	}

	updateRunState(pRunID, pState, pExtras)
	{
		if (!this._Enabled) return;
		let tmpExtras = pExtras || {};
		let tmpExisting = this._readOne('BeaconRun', [['RunID', pRunID]]);
		if (!tmpExisting) { return; }

		// Build patch with COALESCE semantics: only non-null fields
		// from pExtras overwrite existing values.
		let tmpPatch = { State: pState };
		if (tmpExtras.EndedAt) { tmpPatch.EndedAt = tmpExtras.EndedAt; }
		if (tmpExtras.CanceledAt) { tmpPatch.CanceledAt = tmpExtras.CanceledAt; }
		if (tmpExtras.CancelReason) { tmpPatch.CancelReason = tmpExtras.CancelReason; }

		this._updateByID('BeaconRun', 'IDBeaconRun', tmpExisting.IDBeaconRun, tmpPatch);
	}

	_hydrateRun(pRow)
	{
		return {
			IDBeaconRun: pRow.IDBeaconRun,
			GUIDBeaconRun: pRow.GUIDBeaconRun,
			RunID: pRow.RunID,
			IdempotencyKey: pRow.IdempotencyKey,
			SubmitterTag: pRow.SubmitterTag,
			State: pRow.State,
			StartedAt: pRow.StartedAt,
			EndedAt: pRow.EndedAt,
			CanceledAt: pRow.CanceledAt,
			CancelReason: pRow.CancelReason,
			Metadata: this._parseJSON(pRow.Metadata, {}),
			CreateDate: pRow.CreateDate,
			UpdateDate: pRow.UpdateDate
		};
	}

	// ====================================================================
	// Work item CRUD
	// ====================================================================

	upsertWorkItem(pItem)
	{
		if (!this._Enabled) return null;
		let tmpExisting = this.getWorkItemByHash(pItem.WorkItemHash);
		let tmpNow = this._nowIso();

		if (!tmpExisting)
		{
			let tmpRecord = {
				GUIDBeaconWorkItem: pItem.GUIDBeaconWorkItem || '',
				Deleted: 0,
				WorkItemHash: pItem.WorkItemHash,
				RunID: pItem.RunID || '',
				RunHash: pItem.RunHash || '',
				NodeHash: pItem.NodeHash || '',
				OperationHash: pItem.OperationHash || '',
				Capability: pItem.Capability || 'Shell',
				Action: pItem.Action || '',
				Settings: this._serializeJSON(pItem.Settings || {}),
				AffinityKey: pItem.AffinityKey || '',
				Priority: pItem.Priority || 0,
				Status: pItem.Status || 'Queued',
				AssignedBeaconID: pItem.AssignedBeaconID || '',
				TimeoutMs: pItem.TimeoutMs || 300000,
				MaxAttempts: pItem.MaxAttempts || 1,
				AttemptNumber: pItem.AttemptNumber || 0,
				RetryBackoffMs: pItem.RetryBackoffMs || 5000,
				EnqueuedAt: pItem.EnqueuedAt || tmpNow,
				AssignedAt: pItem.AssignedAt || null,
				DispatchedAt: pItem.DispatchedAt || null,
				StartedAt: pItem.StartedAt || null,
				CompletedAt: pItem.CompletedAt || null,
				CanceledAt: pItem.CanceledAt || null,
				CancelRequested: pItem.CancelRequested ? 1 : 0,
				CancelReason: pItem.CancelReason || '',
				LastError: pItem.LastError || '',
				LastEventAt: pItem.LastEventAt || tmpNow,
				QueueWaitMs: pItem.QueueWaitMs || 0,
				// Health is stored as TEXT-of-float so it can carry both
				// floats and a literal null without an extra column.
				Health: (pItem.Health == null) ? null : String(pItem.Health),
				HealthLabel: pItem.HealthLabel || 'Unknown',
				HealthReason: pItem.HealthReason || '',
				HealthComputedAt: pItem.HealthComputedAt || null,
				Result: this._serializeJSON(pItem.Result)
			};
			this._insert('BeaconWorkItem', tmpRecord);
		}
		else
		{
			this.updateWorkItem(pItem.WorkItemHash, pItem);
		}
		return this.getWorkItemByHash(pItem.WorkItemHash);
	}

	updateWorkItem(pHash, pPatch)
	{
		if (!this._Enabled) return;

		let tmpExisting = this._readOne('BeaconWorkItem', [['WorkItemHash', pHash]]);
		if (!tmpExisting) { return; }

		let tmpAllowed = [
			'RunID', 'RunHash', 'NodeHash', 'OperationHash', 'Capability', 'Action',
			'Settings', 'AffinityKey', 'Priority', 'Status', 'AssignedBeaconID',
			'TimeoutMs', 'MaxAttempts', 'AttemptNumber', 'RetryBackoffMs',
			'EnqueuedAt', 'AssignedAt', 'DispatchedAt', 'StartedAt', 'CompletedAt',
			'CanceledAt', 'CancelRequested', 'CancelReason', 'LastError',
			'LastEventAt', 'QueueWaitMs', 'Health', 'HealthLabel', 'HealthReason',
			'HealthComputedAt', 'Result'
		];

		// Build a sparse patch — only allowed keys that are explicitly
		// present on pPatch make it through. Field-specific
		// normalization (JSON for Settings/Result, Health → string,
		// CancelRequested → 0/1) is preserved verbatim from the legacy
		// implementation.
		let tmpEffective = {};
		let tmpHasField = false;
		for (let i = 0; i < tmpAllowed.length; i++)
		{
			let tmpKey = tmpAllowed[i];
			if (!(tmpKey in pPatch)) { continue; }
			let tmpVal = pPatch[tmpKey];
			if (tmpKey === 'Settings' || tmpKey === 'Result')
			{
				tmpVal = this._serializeJSON(tmpVal);
			}
			else if (tmpKey === 'Health')
			{
				tmpVal = (tmpVal == null) ? null : String(tmpVal);
			}
			else if (tmpKey === 'CancelRequested')
			{
				tmpVal = tmpVal ? 1 : 0;
			}
			tmpEffective[tmpKey] = tmpVal;
			tmpHasField = true;
		}
		if (!tmpHasField) { return; }

		// Note: the legacy update permitted explicit-null patches on
		// some columns (Health=null, AssignedAt=null, etc.) but the
		// COALESCE pattern on Run/Attempt updates does NOT. We pass
		// pSkipNullCoalesce=true here so a null-valued patch field
		// overwrites the persisted value, matching the legacy
		// "set the column to whatever's in the patch" behavior.
		this._updateByID('BeaconWorkItem', 'IDBeaconWorkItem', tmpExisting.IDBeaconWorkItem, tmpEffective, true);
	}

	getWorkItemByHash(pHash)
	{
		if (!this._Enabled) return null;
		let tmpRow = this._readOne('BeaconWorkItem', [['WorkItemHash', pHash]]);
		return tmpRow ? this._hydrateWorkItem(tmpRow) : null;
	}

	listWorkItems(pFilter)
	{
		if (!this._Enabled) return [];
		let tmpFilter = pFilter || {};
		let tmpDAL = this._dal('BeaconWorkItem');

		let tmpLimit = Math.max(1, Math.min(parseInt(tmpFilter.Limit, 10) || 500, READS_CAP));
		let tmpQuery = tmpDAL.query.clone().setBegin(0).setCap(tmpLimit);

		if (tmpFilter.Status)
		{
			if (Array.isArray(tmpFilter.Status))
			{
				tmpQuery.addFilter('Status', tmpFilter.Status, 'IN');
			}
			else
			{
				tmpQuery.addFilter('Status', tmpFilter.Status);
			}
		}
		if (tmpFilter.AssignedBeaconID)
		{
			tmpQuery.addFilter('AssignedBeaconID', tmpFilter.AssignedBeaconID);
		}
		if (tmpFilter.RunID)
		{
			tmpQuery.addFilter('RunID', tmpFilter.RunID);
		}
		if (tmpFilter.Capability)
		{
			tmpQuery.addFilter('Capability', tmpFilter.Capability);
		}

		// Sort handling. Default is "EnqueuedAt ASC" — any other order
		// can be passed in tmpFilter.OrderBy. Parse "Column DIR" pairs.
		let tmpOrder = (tmpFilter.OrderBy || 'EnqueuedAt ASC').trim();
		let tmpParts = tmpOrder.split(/\s+/);
		let tmpSortCol = tmpParts[0];
		let tmpSortDir = (tmpParts[1] || 'ASC').toUpperCase().startsWith('DESC') ? 'Descending' : 'Ascending';
		tmpQuery.addSort({ Column: tmpSortCol, Direction: tmpSortDir });

		let tmpArgs = this._runSync((cb) => tmpDAL.doReads(tmpQuery, cb));
		let tmpRows = tmpArgs[1] || [];
		return tmpRows.map((r) => this._hydrateWorkItem(r));
	}

	countByStatus()
	{
		if (!this._Enabled) return {};
		// Aggregate isn't directly supported by the DAL; drop to raw SQL
		// against the connector's better-sqlite3 handle. Same behavior,
		// same WHERE Deleted = 0 filter, same shape return.
		let tmpRows = this._DB.prepare(
			'SELECT Status, COUNT(*) as Count FROM BeaconWorkItem WHERE Deleted = 0 GROUP BY Status').all();
		let tmpOut = {};
		for (let r of tmpRows) { tmpOut[r.Status] = r.Count; }
		return tmpOut;
	}

	_hydrateWorkItem(pRow)
	{
		let tmpHealth = null;
		if (pRow.Health != null && pRow.Health !== '')
		{
			let tmpParsed = parseFloat(pRow.Health);
			if (!isNaN(tmpParsed)) { tmpHealth = tmpParsed; }
		}
		return {
			IDBeaconWorkItem: pRow.IDBeaconWorkItem,
			GUIDBeaconWorkItem: pRow.GUIDBeaconWorkItem,
			WorkItemHash: pRow.WorkItemHash,
			RunID: pRow.RunID,
			RunHash: pRow.RunHash,
			NodeHash: pRow.NodeHash,
			OperationHash: pRow.OperationHash,
			Capability: pRow.Capability,
			Action: pRow.Action,
			Settings: this._parseJSON(pRow.Settings, {}),
			AffinityKey: pRow.AffinityKey,
			Priority: pRow.Priority,
			Status: pRow.Status,
			AssignedBeaconID: pRow.AssignedBeaconID || null,
			TimeoutMs: pRow.TimeoutMs,
			MaxAttempts: pRow.MaxAttempts,
			AttemptNumber: pRow.AttemptNumber,
			RetryBackoffMs: pRow.RetryBackoffMs,
			EnqueuedAt: pRow.EnqueuedAt,
			AssignedAt: pRow.AssignedAt,
			DispatchedAt: pRow.DispatchedAt,
			StartedAt: pRow.StartedAt,
			CompletedAt: pRow.CompletedAt,
			CanceledAt: pRow.CanceledAt,
			CancelRequested: !!pRow.CancelRequested,
			CancelReason: pRow.CancelReason,
			LastError: pRow.LastError,
			LastEventAt: pRow.LastEventAt,
			QueueWaitMs: pRow.QueueWaitMs,
			Health: tmpHealth,
			HealthLabel: pRow.HealthLabel || 'Unknown',
			HealthReason: pRow.HealthReason,
			HealthComputedAt: pRow.HealthComputedAt,
			Result: this._parseJSON(pRow.Result)
		};
	}

	// ====================================================================
	// Events
	// ====================================================================

	appendEvent(pEvent)
	{
		if (!this._Enabled) return;
		this._insert('BeaconWorkItemEvent', {
			WorkItemHash: pEvent.WorkItemHash || '',
			RunID: pEvent.RunID || '',
			EventType: pEvent.EventType || '',
			FromStatus: pEvent.FromStatus || '',
			ToStatus: pEvent.ToStatus || '',
			BeaconID: pEvent.BeaconID || '',
			Payload: this._serializeJSON(pEvent.Payload)
		});
	}

	listEventsForWorkItem(pHash, pLimit)
	{
		if (!this._Enabled) return [];
		let tmpLimit = Math.max(1, Math.min(parseInt(pLimit, 10) || 200, 2000));
		let tmpDAL = this._dal('BeaconWorkItemEvent');
		let tmpQuery = tmpDAL.query.clone()
			.setBegin(0)
			.setCap(tmpLimit)
			.addFilter('WorkItemHash', pHash)
			.addSort({ Column: 'IDBeaconWorkItemEvent', Direction: 'Ascending' });
		let tmpArgs = this._runSync((cb) => tmpDAL.doReads(tmpQuery, cb));
		let tmpRows = tmpArgs[1] || [];
		return tmpRows.map((r) => ({
			IDBeaconWorkItemEvent: r.IDBeaconWorkItemEvent,
			CreateDate: r.CreateDate,
			WorkItemHash: r.WorkItemHash,
			RunID: r.RunID,
			EventType: r.EventType,
			FromStatus: r.FromStatus,
			ToStatus: r.ToStatus,
			BeaconID: r.BeaconID,
			Payload: this._parseJSON(r.Payload)
		}));
	}

	// ====================================================================
	// Attempts
	// ====================================================================

	insertAttempt(pAttempt)
	{
		if (!this._Enabled) return;
		let tmpNow = this._nowIso();
		this._insert('BeaconWorkItemAttempt', {
			WorkItemHash: pAttempt.WorkItemHash,
			AttemptNumber: pAttempt.AttemptNumber || 1,
			BeaconID: pAttempt.BeaconID || '',
			DispatchedAt: pAttempt.DispatchedAt || tmpNow,
			StartedAt: pAttempt.StartedAt || null,
			CompletedAt: pAttempt.CompletedAt || null,
			Outcome: pAttempt.Outcome || 'Dispatched',
			ErrorMessage: pAttempt.ErrorMessage || '',
			DurationMs: pAttempt.DurationMs || 0
		});
	}

	updateAttemptOutcome(pHash, pAttemptNumber, pPatch)
	{
		if (!this._Enabled) return;
		// COALESCE semantics: drop any patch field that is null so it
		// can't clobber the existing value. Same shape as the Run
		// updateRunState path.
		let tmpDAL = this._dal('BeaconWorkItemAttempt');
		let tmpQuery = tmpDAL.query.clone()
			.setBegin(0)
			.setCap(1)
			.addFilter('WorkItemHash', pHash)
			.addFilter('AttemptNumber', pAttemptNumber);
		let tmpArgs = this._runSync((cb) => tmpDAL.doReads(tmpQuery, cb));
		let tmpRecords = tmpArgs[1] || [];
		if (tmpRecords.length === 0) { return; }
		let tmpExisting = tmpRecords[0];

		let tmpEffective = {};
		if (pPatch.StartedAt) { tmpEffective.StartedAt = pPatch.StartedAt; }
		if (pPatch.CompletedAt) { tmpEffective.CompletedAt = pPatch.CompletedAt; }
		if (pPatch.Outcome) { tmpEffective.Outcome = pPatch.Outcome; }
		if (pPatch.ErrorMessage) { tmpEffective.ErrorMessage = pPatch.ErrorMessage; }
		if (pPatch.DurationMs != null) { tmpEffective.DurationMs = pPatch.DurationMs; }

		this._updateByID('BeaconWorkItemAttempt', 'IDBeaconWorkItemAttempt',
			tmpExisting.IDBeaconWorkItemAttempt, tmpEffective);
	}

	// ====================================================================
	// Affinity bindings
	// ====================================================================

	upsertAffinityBinding(pBinding)
	{
		if (!this._Enabled) return;
		let tmpExisting = this.getAffinityBinding(pBinding.AffinityKey);

		if (!tmpExisting)
		{
			this._insert('BeaconAffinityBinding', {
				AffinityKey: pBinding.AffinityKey,
				BeaconID: pBinding.BeaconID,
				ExpiresAt: pBinding.ExpiresAt || null,
				ClearedAt: null
			});
		}
		else
		{
			// Look up the IDBeaconAffinityBinding via the unfiltered
			// table so we can target a specific row to update — the
			// affinity key isn't unique once a binding has been
			// re-bound. The "active" one (ClearedAt IS NULL) is what
			// getAffinityBinding already returned.
			let tmpRow = this._readOne('BeaconAffinityBinding', [
				['AffinityKey', pBinding.AffinityKey],
				['BeaconID', tmpExisting.BeaconID]
			]);
			if (!tmpRow) { return; }

			this._updateByID('BeaconAffinityBinding', 'IDBeaconAffinityBinding',
				tmpRow.IDBeaconAffinityBinding,
				{
					BeaconID: pBinding.BeaconID,
					ExpiresAt: pBinding.ExpiresAt || null,
					ClearedAt: null
				},
				true);
		}
	}

	getAffinityBinding(pKey)
	{
		if (!this._Enabled) return null;
		// "Most recent active row for this key" — ClearedAt IS NULL OR ''
		// matches the legacy getAffinity statement. Since meadow's DAL
		// can't express IS NULL OR '' conveniently, the simplest path
		// is to fetch the most-recent rows for the key and filter in
		// memory.
		let tmpDAL = this._dal('BeaconAffinityBinding');
		let tmpQuery = tmpDAL.query.clone()
			.setBegin(0)
			.setCap(50)
			.addFilter('AffinityKey', pKey)
			.addSort({ Column: 'IDBeaconAffinityBinding', Direction: 'Descending' });
		let tmpArgs = this._runSync((cb) => tmpDAL.doReads(tmpQuery, cb));
		let tmpRows = tmpArgs[1] || [];
		for (let i = 0; i < tmpRows.length; i++)
		{
			let r = tmpRows[i];
			if (r.ClearedAt == null || r.ClearedAt === '')
			{
				return {
					AffinityKey: r.AffinityKey,
					BeaconID: r.BeaconID,
					ExpiresAt: r.ExpiresAt,
					ClearedAt: r.ClearedAt,
					CreateDate: r.CreateDate,
					UpdateDate: r.UpdateDate
				};
			}
		}
		return null;
	}

	clearAffinityBinding(pKey)
	{
		if (!this._Enabled) return;
		// Find every uncleared row for the key and stamp ClearedAt.
		// Bulk update in a transaction — semantically the same as the
		// legacy single-shot UPDATE that didn't filter by ClearedAt.
		let tmpDAL = this._dal('BeaconAffinityBinding');
		let tmpQuery = tmpDAL.query.clone()
			.setBegin(0)
			.setCap(READS_CAP)
			.addFilter('AffinityKey', pKey);
		let tmpArgs = this._runSync((cb) => tmpDAL.doReads(tmpQuery, cb));
		let tmpRows = tmpArgs[1] || [];
		let tmpNow = this._nowIso();
		for (let i = 0; i < tmpRows.length; i++)
		{
			this._updateByID('BeaconAffinityBinding', 'IDBeaconAffinityBinding',
				tmpRows[i].IDBeaconAffinityBinding,
				{ ClearedAt: tmpNow },
				true);
		}
	}

	listActiveAffinityBindings()
	{
		if (!this._Enabled) return [];
		let tmpDAL = this._dal('BeaconAffinityBinding');
		let tmpQuery = tmpDAL.query.clone().setBegin(0).setCap(READS_CAP);
		let tmpArgs = this._runSync((cb) => tmpDAL.doReads(tmpQuery, cb));
		let tmpRows = tmpArgs[1] || [];
		// Filter active bindings (ClearedAt IS NULL OR '') in memory —
		// matches the legacy listAffinities query.
		return tmpRows.filter((r) => r.ClearedAt == null || r.ClearedAt === '');
	}

	// ====================================================================
	// Action defaults
	// ====================================================================

	upsertActionDefault(pEntry)
	{
		if (!this._Enabled) return;
		let tmpExisting = this.getActionDefault(pEntry.Capability, pEntry.Action);
		if (!tmpExisting)
		{
			this._insert('BeaconActionDefault', {
				Capability: pEntry.Capability,
				Action: pEntry.Action || '',
				TimeoutMs: pEntry.TimeoutMs || 300000,
				MaxAttempts: pEntry.MaxAttempts || 1,
				RetryBackoffMs: pEntry.RetryBackoffMs || 5000,
				DefaultPriority: pEntry.DefaultPriority || 0,
				ExpectedWaitP95Ms: pEntry.ExpectedWaitP95Ms || 0,
				HeartbeatExpectedMs: pEntry.HeartbeatExpectedMs || 0,
				MinSamplesForBaseline: pEntry.MinSamplesForBaseline || 20
			});
		}
		else
		{
			// The legacy upsertActionDefault used a |-style fallback that
			// preserved existing values whenever the patch was 0/falsy
			// for several numeric fields. Reproduce that here:
			let tmpPatch =
			{
				TimeoutMs: pEntry.TimeoutMs || tmpExisting.TimeoutMs,
				MaxAttempts: pEntry.MaxAttempts || tmpExisting.MaxAttempts,
				RetryBackoffMs: pEntry.RetryBackoffMs || tmpExisting.RetryBackoffMs,
				DefaultPriority: (pEntry.DefaultPriority != null) ? pEntry.DefaultPriority : tmpExisting.DefaultPriority,
				ExpectedWaitP95Ms: (pEntry.ExpectedWaitP95Ms != null) ? pEntry.ExpectedWaitP95Ms : tmpExisting.ExpectedWaitP95Ms,
				HeartbeatExpectedMs: (pEntry.HeartbeatExpectedMs != null) ? pEntry.HeartbeatExpectedMs : tmpExisting.HeartbeatExpectedMs,
				MinSamplesForBaseline: (pEntry.MinSamplesForBaseline != null) ? pEntry.MinSamplesForBaseline : tmpExisting.MinSamplesForBaseline
			};
			this._updateByID('BeaconActionDefault', 'IDBeaconActionDefault',
				tmpExisting.IDBeaconActionDefault, tmpPatch, true);
		}
	}

	getActionDefault(pCapability, pAction)
	{
		if (!this._Enabled) return null;
		return this._readOne('BeaconActionDefault',
			[['Capability', pCapability], ['Action', pAction || '']]);
	}

	listActionDefaults()
	{
		if (!this._Enabled) return [];
		let tmpDAL = this._dal('BeaconActionDefault');
		let tmpQuery = tmpDAL.query.clone().setBegin(0).setCap(READS_CAP);
		let tmpArgs = this._runSync((cb) => tmpDAL.doReads(tmpQuery, cb));
		return tmpArgs[1] || [];
	}

	// ====================================================================
	// Aggregate queries for observability
	// ====================================================================

	queueWaitSamples(pCapability, pAction, pLimit)
	{
		if (!this._Enabled) return [];
		let tmpLimit = Math.max(1, Math.min(parseInt(pLimit, 10) || 200, 2000));
		// Aggregate-style read with a non-equality predicate (QueueWaitMs > 0)
		// and a projection. Drop to raw SQL on the connector's handle —
		// the DAL doesn't naturally express column-level projections or
		// "greater than" predicates and the query is read-only anyway.
		let tmpRows = this._DB.prepare(`
			SELECT QueueWaitMs FROM BeaconWorkItem
			WHERE Capability = ? AND Action = ? AND QueueWaitMs > 0 AND Deleted = 0
			ORDER BY IDBeaconWorkItem DESC LIMIT ${tmpLimit}
		`).all(pCapability, pAction || '');
		return tmpRows.map((r) => r.QueueWaitMs);
	}
}

module.exports = UltravisorBeaconQueueStore;
