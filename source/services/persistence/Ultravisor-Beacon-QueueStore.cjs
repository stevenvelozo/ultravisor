/**
 * Ultravisor Beacon Queue Store
 *
 * SQLite-backed persistence for the beacon work queue, runs, affinity
 * bindings, per-attempt history, and action defaults.  Replaces the
 * former JSONL journal as the durable store of record.
 *
 * Schema is driven by the stricture intermediate model at
 * source/datamodel/Ultravisor-BeaconQueue.json.  DDL is generated
 * directly (CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN for
 * forward-only drift), avoiding the meadow bootstrap chain.
 *
 * SQLite WAL mode is enabled on open — crash-safe, concurrent reader
 * support, no separate journal file to reason about.
 *
 * @module Ultravisor-Beacon-QueueStore
 */

const libPictService = require('pict-serviceproviderbase');
const libFS = require('fs');
const libPath = require('path');

let libBetterSqlite = null;
try
{
	libBetterSqlite = require('better-sqlite3');
}
catch (pError)
{
	// better-sqlite3 is a hard requirement at runtime but we defer the
	// failure to initialize() so unit tests that don't touch persistence
	// can still load the module.
}

const TYPE_INTEGER_RE = /^(Integer|Int|FK|AutoID|AutoIdentity|ID|CreateIDUser|UpdateIDUser|DeleteIDUser|Boolean|Deleted)$/i;
const TYPE_NUMERIC_INT_SIZES = new Set(['int', 'integer', 'smallint', 'bigint', 'tinyint']);

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

		// Prepared statement cache — compiled once, reused per call.
		this._Prepared = {};
	}

	// ====================================================================
	// Lifecycle
	// ====================================================================

	/**
	 * Initialize the store: open SQLite, apply WAL, provision tables.
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

		if (!libBetterSqlite)
		{
			this.log.error('BeaconQueueStore: better-sqlite3 not installed; persistence disabled.');
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
			this._DB = new libBetterSqlite(this._DBPath);
			this._DB.pragma('journal_mode = WAL');
			this._DB.pragma('synchronous = NORMAL');
			this._DB.pragma('foreign_keys = ON');
		}
		catch (pError)
		{
			this.log.error(`BeaconQueueStore: failed to open [${this._DBPath}]: ${pError.message}`);
			return false;
		}

		let tmpSchemaPath = libPath.join(__dirname, '..', '..', 'datamodel', 'Ultravisor-BeaconQueue.json');
		try
		{
			this._Schema = JSON.parse(libFS.readFileSync(tmpSchemaPath, 'utf8'));
		}
		catch (pError)
		{
			this.log.error(`BeaconQueueStore: failed to load schema [${tmpSchemaPath}]: ${pError.message}`);
			return false;
		}

		try
		{
			this._provisionTables();
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
		this._Enabled = false;
		this._Prepared = {};
	}

	// ====================================================================
	// Schema provisioning
	// ====================================================================

	/**
	 * Translate a stricture column spec to a SQLite column DDL fragment.
	 * Forward-only drift uses the same mapping for ALTER TABLE ADD COLUMN.
	 */
	_columnToSql(pCol, pIsPrimary)
	{
		let tmpType = pCol.DataType || pCol.Type || 'String';
		let tmpSize = (pCol.Size || '').toString().toLowerCase();

		let tmpSqlType = 'TEXT';
		if (/^ID$/i.test(tmpType))
		{
			tmpSqlType = 'INTEGER';
		}
		else if (/^Numeric$/i.test(tmpType))
		{
			tmpSqlType = TYPE_NUMERIC_INT_SIZES.has(tmpSize) ? 'INTEGER' : 'REAL';
		}
		else if (TYPE_INTEGER_RE.test(tmpType))
		{
			tmpSqlType = 'INTEGER';
		}
		else if (/^(DateTime|Date)$/i.test(tmpType))
		{
			tmpSqlType = 'TEXT';
		}
		else
		{
			tmpSqlType = 'TEXT';
		}

		let tmpDDL = `"${pCol.Column}" ${tmpSqlType}`;
		if (pIsPrimary)
		{
			tmpDDL += ' PRIMARY KEY AUTOINCREMENT';
		}
		return tmpDDL;
	}

	_provisionTables()
	{
		let tmpTables = this._Schema.Tables || {};
		for (let tmpName of Object.keys(tmpTables))
		{
			let tmpTable = tmpTables[tmpName];
			let tmpCols = tmpTable.Columns || [];
			if (tmpCols.length === 0) continue;

			// Convention: first ID column is the primary key.
			let tmpPrimaryIdx = tmpCols.findIndex((c) => /^ID$/i.test(c.DataType || c.Type || ''));
			let tmpDDLCols = tmpCols.map((c, idx) =>
				this._columnToSql(c, idx === tmpPrimaryIdx));

			let tmpCreate = `CREATE TABLE IF NOT EXISTS "${tmpTable.TableName}" (${tmpDDLCols.join(', ')})`;
			this._DB.exec(tmpCreate);

			// Forward-only ADD COLUMN migration
			let tmpExisting = {};
			let tmpInfo = this._DB.prepare(`PRAGMA table_info("${tmpTable.TableName}")`).all();
			for (let r of tmpInfo) tmpExisting[r.name] = r;

			for (let c of tmpCols)
			{
				if (tmpExisting[c.Column]) continue;
				let tmpAdd = this._columnToSql(c, false);
				try
				{
					this._DB.exec(`ALTER TABLE "${tmpTable.TableName}" ADD COLUMN ${tmpAdd}`);
					this.log.info(`BeaconQueueStore: migrated ${tmpTable.TableName}.${c.Column}`);
				}
				catch (pAlterErr)
				{
					if (!/duplicate column/i.test(pAlterErr.message))
					{
						throw pAlterErr;
					}
				}
			}
		}

		// Useful indices on hot lookup paths.
		let tmpIndices = [
			'CREATE INDEX IF NOT EXISTS idx_workitem_hash ON BeaconWorkItem(WorkItemHash)',
			'CREATE INDEX IF NOT EXISTS idx_workitem_status ON BeaconWorkItem(Status)',
			'CREATE INDEX IF NOT EXISTS idx_workitem_runid ON BeaconWorkItem(RunID)',
			'CREATE INDEX IF NOT EXISTS idx_workitem_assigned ON BeaconWorkItem(AssignedBeaconID, Status)',
			'CREATE INDEX IF NOT EXISTS idx_workitem_priority ON BeaconWorkItem(Status, Priority, EnqueuedAt)',
			'CREATE INDEX IF NOT EXISTS idx_run_runid ON BeaconRun(RunID)',
			'CREATE INDEX IF NOT EXISTS idx_run_idempotency ON BeaconRun(IdempotencyKey)',
			'CREATE INDEX IF NOT EXISTS idx_affinity_key ON BeaconAffinityBinding(AffinityKey)',
			'CREATE INDEX IF NOT EXISTS idx_event_hash ON BeaconWorkItemEvent(WorkItemHash)',
			'CREATE INDEX IF NOT EXISTS idx_action_default ON BeaconActionDefault(Capability, Action)'
		];
		for (let tmpSql of tmpIndices)
		{
			this._DB.exec(tmpSql);
		}
	}

	// ====================================================================
	// Internal helpers
	// ====================================================================

	_prepare(pKey, pSql)
	{
		if (!this._Prepared[pKey])
		{
			this._Prepared[pKey] = this._DB.prepare(pSql);
		}
		return this._Prepared[pKey];
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

	// ====================================================================
	// Run lifecycle
	// ====================================================================

	insertRun(pRun)
	{
		if (!this._Enabled) return null;
		let tmpStmt = this._prepare('insertRun', `
			INSERT INTO BeaconRun
			(GUIDBeaconRun, CreateDate, UpdateDate, Deleted, RunID, IdempotencyKey,
			 SubmitterTag, State, StartedAt, EndedAt, CanceledAt, CancelReason, Metadata)
			VALUES (@GUIDBeaconRun, @CreateDate, @UpdateDate, 0, @RunID, @IdempotencyKey,
			        @SubmitterTag, @State, @StartedAt, @EndedAt, @CanceledAt, @CancelReason, @Metadata)
		`);
		let tmpNow = this._nowIso();
		let tmpRec = {
			GUIDBeaconRun: pRun.GUIDBeaconRun || '',
			CreateDate: tmpNow,
			UpdateDate: tmpNow,
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
		tmpStmt.run(tmpRec);
		return this.getRunByRunID(pRun.RunID);
	}

	getRunByRunID(pRunID)
	{
		if (!this._Enabled) return null;
		let tmpStmt = this._prepare('getRunByRunID',
			'SELECT * FROM BeaconRun WHERE RunID = ? AND Deleted = 0 LIMIT 1');
		let tmpRow = tmpStmt.get(pRunID);
		return tmpRow ? this._hydrateRun(tmpRow) : null;
	}

	getRunByIdempotencyKey(pKey)
	{
		if (!this._Enabled || !pKey) return null;
		let tmpStmt = this._prepare('getRunByIdempotency',
			'SELECT * FROM BeaconRun WHERE IdempotencyKey = ? AND Deleted = 0 ORDER BY IDBeaconRun DESC LIMIT 1');
		let tmpRow = tmpStmt.get(pKey);
		return tmpRow ? this._hydrateRun(tmpRow) : null;
	}

	updateRunState(pRunID, pState, pExtras)
	{
		if (!this._Enabled) return;
		let tmpExtras = pExtras || {};
		let tmpStmt = this._prepare('updateRunState', `
			UPDATE BeaconRun
			SET State = @State,
			    EndedAt = COALESCE(@EndedAt, EndedAt),
			    CanceledAt = COALESCE(@CanceledAt, CanceledAt),
			    CancelReason = COALESCE(@CancelReason, CancelReason),
			    UpdateDate = @UpdateDate
			WHERE RunID = @RunID
		`);
		tmpStmt.run({
			RunID: pRunID,
			State: pState,
			EndedAt: tmpExtras.EndedAt || null,
			CanceledAt: tmpExtras.CanceledAt || null,
			CancelReason: tmpExtras.CancelReason || null,
			UpdateDate: this._nowIso()
		});
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
			let tmpInsert = this._prepare('insertWorkItem', `
				INSERT INTO BeaconWorkItem
				(GUIDBeaconWorkItem, CreateDate, UpdateDate, Deleted,
				 WorkItemHash, RunID, RunHash, NodeHash, OperationHash,
				 Capability, Action, Settings, AffinityKey, Priority,
				 Status, AssignedBeaconID, TimeoutMs, MaxAttempts, AttemptNumber,
				 RetryBackoffMs, EnqueuedAt, AssignedAt, DispatchedAt, StartedAt,
				 CompletedAt, CanceledAt, CancelRequested, CancelReason,
				 LastError, LastEventAt, QueueWaitMs,
				 Health, HealthLabel, HealthReason, HealthComputedAt, Result)
				VALUES
				(@GUIDBeaconWorkItem, @CreateDate, @UpdateDate, 0,
				 @WorkItemHash, @RunID, @RunHash, @NodeHash, @OperationHash,
				 @Capability, @Action, @Settings, @AffinityKey, @Priority,
				 @Status, @AssignedBeaconID, @TimeoutMs, @MaxAttempts, @AttemptNumber,
				 @RetryBackoffMs, @EnqueuedAt, @AssignedAt, @DispatchedAt, @StartedAt,
				 @CompletedAt, @CanceledAt, @CancelRequested, @CancelReason,
				 @LastError, @LastEventAt, @QueueWaitMs,
				 @Health, @HealthLabel, @HealthReason, @HealthComputedAt, @Result)
			`);
			tmpInsert.run({
				GUIDBeaconWorkItem: pItem.GUIDBeaconWorkItem || '',
				CreateDate: tmpNow,
				UpdateDate: tmpNow,
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
				Health: (pItem.Health == null) ? null : String(pItem.Health),
				HealthLabel: pItem.HealthLabel || 'Unknown',
				HealthReason: pItem.HealthReason || '',
				HealthComputedAt: pItem.HealthComputedAt || null,
				Result: this._serializeJSON(pItem.Result)
			});
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
		let tmpFields = [];
		let tmpParams = { WorkItemHash: pHash, UpdateDate: this._nowIso() };
		let tmpAllowed = [
			'RunID', 'RunHash', 'NodeHash', 'OperationHash', 'Capability', 'Action',
			'Settings', 'AffinityKey', 'Priority', 'Status', 'AssignedBeaconID',
			'TimeoutMs', 'MaxAttempts', 'AttemptNumber', 'RetryBackoffMs',
			'EnqueuedAt', 'AssignedAt', 'DispatchedAt', 'StartedAt', 'CompletedAt',
			'CanceledAt', 'CancelRequested', 'CancelReason', 'LastError',
			'LastEventAt', 'QueueWaitMs', 'Health', 'HealthLabel', 'HealthReason',
			'HealthComputedAt', 'Result'
		];
		for (let tmpKey of tmpAllowed)
		{
			if (!(tmpKey in pPatch)) continue;
			let tmpVal = pPatch[tmpKey];
			if (tmpKey === 'Settings' || tmpKey === 'Result')
			{
				tmpVal = this._serializeJSON(tmpVal);
			}
			else if (tmpKey === 'Health' && tmpVal != null)
			{
				tmpVal = String(tmpVal);
			}
			else if (tmpKey === 'CancelRequested')
			{
				tmpVal = tmpVal ? 1 : 0;
			}
			tmpFields.push(`"${tmpKey}" = @${tmpKey}`);
			tmpParams[tmpKey] = tmpVal;
		}
		if (tmpFields.length === 0) return;
		tmpFields.push('UpdateDate = @UpdateDate');

		let tmpSql = `UPDATE BeaconWorkItem SET ${tmpFields.join(', ')} WHERE WorkItemHash = @WorkItemHash`;
		// Not cached — field list varies per call.
		this._DB.prepare(tmpSql).run(tmpParams);
	}

	getWorkItemByHash(pHash)
	{
		if (!this._Enabled) return null;
		let tmpStmt = this._prepare('getWorkItemByHash',
			'SELECT * FROM BeaconWorkItem WHERE WorkItemHash = ? AND Deleted = 0 LIMIT 1');
		let tmpRow = tmpStmt.get(pHash);
		return tmpRow ? this._hydrateWorkItem(tmpRow) : null;
	}

	listWorkItems(pFilter)
	{
		if (!this._Enabled) return [];
		let tmpFilter = pFilter || {};
		let tmpWhere = ['Deleted = 0'];
		let tmpParams = {};

		if (tmpFilter.Status)
		{
			if (Array.isArray(tmpFilter.Status))
			{
				let tmpKeys = tmpFilter.Status.map((s, i) => `@status_${i}`);
				tmpWhere.push(`Status IN (${tmpKeys.join(',')})`);
				tmpFilter.Status.forEach((s, i) => { tmpParams[`status_${i}`] = s; });
			}
			else
			{
				tmpWhere.push('Status = @Status');
				tmpParams.Status = tmpFilter.Status;
			}
		}
		if (tmpFilter.AssignedBeaconID)
		{
			tmpWhere.push('AssignedBeaconID = @AssignedBeaconID');
			tmpParams.AssignedBeaconID = tmpFilter.AssignedBeaconID;
		}
		if (tmpFilter.RunID)
		{
			tmpWhere.push('RunID = @RunID');
			tmpParams.RunID = tmpFilter.RunID;
		}
		if (tmpFilter.Capability)
		{
			tmpWhere.push('Capability = @Capability');
			tmpParams.Capability = tmpFilter.Capability;
		}

		let tmpOrder = tmpFilter.OrderBy || 'EnqueuedAt ASC';
		let tmpLimit = Math.max(1, Math.min(parseInt(tmpFilter.Limit, 10) || 500, 5000));

		let tmpSql = `SELECT * FROM BeaconWorkItem WHERE ${tmpWhere.join(' AND ')} ORDER BY ${tmpOrder} LIMIT ${tmpLimit}`;
		let tmpRows = this._DB.prepare(tmpSql).all(tmpParams);
		return tmpRows.map((r) => this._hydrateWorkItem(r));
	}

	countByStatus()
	{
		if (!this._Enabled) return {};
		let tmpStmt = this._prepare('countByStatus',
			'SELECT Status, COUNT(*) as Count FROM BeaconWorkItem WHERE Deleted = 0 GROUP BY Status');
		let tmpRows = tmpStmt.all();
		let tmpOut = {};
		for (let r of tmpRows) tmpOut[r.Status] = r.Count;
		return tmpOut;
	}

	_hydrateWorkItem(pRow)
	{
		let tmpHealth = null;
		if (pRow.Health != null && pRow.Health !== '')
		{
			let tmpParsed = parseFloat(pRow.Health);
			if (!isNaN(tmpParsed)) tmpHealth = tmpParsed;
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
		let tmpStmt = this._prepare('appendEvent', `
			INSERT INTO BeaconWorkItemEvent
			(CreateDate, WorkItemHash, RunID, EventType, FromStatus, ToStatus, BeaconID, Payload)
			VALUES (@CreateDate, @WorkItemHash, @RunID, @EventType, @FromStatus, @ToStatus, @BeaconID, @Payload)
		`);
		tmpStmt.run({
			CreateDate: this._nowIso(),
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
		let tmpStmt = this._DB.prepare(
			`SELECT * FROM BeaconWorkItemEvent WHERE WorkItemHash = ? ORDER BY IDBeaconWorkItemEvent ASC LIMIT ${tmpLimit}`);
		return tmpStmt.all(pHash).map((r) => ({
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
		let tmpStmt = this._prepare('insertAttempt', `
			INSERT INTO BeaconWorkItemAttempt
			(CreateDate, UpdateDate, WorkItemHash, AttemptNumber, BeaconID,
			 DispatchedAt, StartedAt, CompletedAt, Outcome, ErrorMessage, DurationMs)
			VALUES (@CreateDate, @UpdateDate, @WorkItemHash, @AttemptNumber, @BeaconID,
			        @DispatchedAt, @StartedAt, @CompletedAt, @Outcome, @ErrorMessage, @DurationMs)
		`);
		let tmpNow = this._nowIso();
		tmpStmt.run({
			CreateDate: tmpNow,
			UpdateDate: tmpNow,
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
		let tmpStmt = this._prepare('updateAttemptOutcome', `
			UPDATE BeaconWorkItemAttempt
			SET StartedAt = COALESCE(@StartedAt, StartedAt),
			    CompletedAt = COALESCE(@CompletedAt, CompletedAt),
			    Outcome = COALESCE(@Outcome, Outcome),
			    ErrorMessage = COALESCE(@ErrorMessage, ErrorMessage),
			    DurationMs = COALESCE(@DurationMs, DurationMs),
			    UpdateDate = @UpdateDate
			WHERE WorkItemHash = @WorkItemHash AND AttemptNumber = @AttemptNumber
		`);
		tmpStmt.run({
			WorkItemHash: pHash,
			AttemptNumber: pAttemptNumber,
			StartedAt: pPatch.StartedAt || null,
			CompletedAt: pPatch.CompletedAt || null,
			Outcome: pPatch.Outcome || null,
			ErrorMessage: pPatch.ErrorMessage || null,
			DurationMs: pPatch.DurationMs || null,
			UpdateDate: this._nowIso()
		});
	}

	// ====================================================================
	// Affinity bindings
	// ====================================================================

	upsertAffinityBinding(pBinding)
	{
		if (!this._Enabled) return;
		let tmpExisting = this.getAffinityBinding(pBinding.AffinityKey);
		let tmpNow = this._nowIso();
		if (!tmpExisting)
		{
			let tmpStmt = this._prepare('insertAffinity', `
				INSERT INTO BeaconAffinityBinding
				(CreateDate, UpdateDate, AffinityKey, BeaconID, ExpiresAt, ClearedAt)
				VALUES (@CreateDate, @UpdateDate, @AffinityKey, @BeaconID, @ExpiresAt, @ClearedAt)
			`);
			tmpStmt.run({
				CreateDate: tmpNow,
				UpdateDate: tmpNow,
				AffinityKey: pBinding.AffinityKey,
				BeaconID: pBinding.BeaconID,
				ExpiresAt: pBinding.ExpiresAt || null,
				ClearedAt: null
			});
		}
		else
		{
			let tmpStmt = this._prepare('updateAffinity', `
				UPDATE BeaconAffinityBinding
				SET BeaconID = @BeaconID, ExpiresAt = @ExpiresAt, ClearedAt = NULL, UpdateDate = @UpdateDate
				WHERE AffinityKey = @AffinityKey
			`);
			tmpStmt.run({
				AffinityKey: pBinding.AffinityKey,
				BeaconID: pBinding.BeaconID,
				ExpiresAt: pBinding.ExpiresAt || null,
				UpdateDate: tmpNow
			});
		}
	}

	getAffinityBinding(pKey)
	{
		if (!this._Enabled) return null;
		let tmpStmt = this._prepare('getAffinity', `
			SELECT * FROM BeaconAffinityBinding
			WHERE AffinityKey = ? AND (ClearedAt IS NULL OR ClearedAt = '')
			ORDER BY IDBeaconAffinityBinding DESC LIMIT 1
		`);
		let tmpRow = tmpStmt.get(pKey);
		return tmpRow ? {
			AffinityKey: tmpRow.AffinityKey,
			BeaconID: tmpRow.BeaconID,
			ExpiresAt: tmpRow.ExpiresAt,
			ClearedAt: tmpRow.ClearedAt,
			CreateDate: tmpRow.CreateDate,
			UpdateDate: tmpRow.UpdateDate
		} : null;
	}

	clearAffinityBinding(pKey)
	{
		if (!this._Enabled) return;
		let tmpStmt = this._prepare('clearAffinity', `
			UPDATE BeaconAffinityBinding
			SET ClearedAt = @ClearedAt, UpdateDate = @UpdateDate
			WHERE AffinityKey = @AffinityKey
		`);
		let tmpNow = this._nowIso();
		tmpStmt.run({ AffinityKey: pKey, ClearedAt: tmpNow, UpdateDate: tmpNow });
	}

	listActiveAffinityBindings()
	{
		if (!this._Enabled) return [];
		let tmpStmt = this._prepare('listAffinities', `
			SELECT * FROM BeaconAffinityBinding
			WHERE ClearedAt IS NULL OR ClearedAt = ''
		`);
		return tmpStmt.all();
	}

	// ====================================================================
	// Action defaults
	// ====================================================================

	upsertActionDefault(pEntry)
	{
		if (!this._Enabled) return;
		let tmpExisting = this.getActionDefault(pEntry.Capability, pEntry.Action);
		let tmpNow = this._nowIso();
		if (!tmpExisting)
		{
			let tmpStmt = this._prepare('insertActionDefault', `
				INSERT INTO BeaconActionDefault
				(CreateDate, UpdateDate, Capability, Action, TimeoutMs, MaxAttempts,
				 RetryBackoffMs, DefaultPriority, ExpectedWaitP95Ms, HeartbeatExpectedMs, MinSamplesForBaseline)
				VALUES (@CreateDate, @UpdateDate, @Capability, @Action, @TimeoutMs, @MaxAttempts,
				        @RetryBackoffMs, @DefaultPriority, @ExpectedWaitP95Ms, @HeartbeatExpectedMs, @MinSamplesForBaseline)
			`);
			tmpStmt.run({
				CreateDate: tmpNow,
				UpdateDate: tmpNow,
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
			let tmpStmt = this._prepare('updateActionDefault', `
				UPDATE BeaconActionDefault
				SET TimeoutMs = @TimeoutMs, MaxAttempts = @MaxAttempts,
				    RetryBackoffMs = @RetryBackoffMs, DefaultPriority = @DefaultPriority,
				    ExpectedWaitP95Ms = @ExpectedWaitP95Ms,
				    HeartbeatExpectedMs = @HeartbeatExpectedMs,
				    MinSamplesForBaseline = @MinSamplesForBaseline,
				    UpdateDate = @UpdateDate
				WHERE Capability = @Capability AND Action = @Action
			`);
			tmpStmt.run({
				Capability: pEntry.Capability,
				Action: pEntry.Action || '',
				TimeoutMs: pEntry.TimeoutMs || tmpExisting.TimeoutMs,
				MaxAttempts: pEntry.MaxAttempts || tmpExisting.MaxAttempts,
				RetryBackoffMs: pEntry.RetryBackoffMs || tmpExisting.RetryBackoffMs,
				DefaultPriority: (pEntry.DefaultPriority != null) ? pEntry.DefaultPriority : tmpExisting.DefaultPriority,
				ExpectedWaitP95Ms: (pEntry.ExpectedWaitP95Ms != null) ? pEntry.ExpectedWaitP95Ms : tmpExisting.ExpectedWaitP95Ms,
				HeartbeatExpectedMs: (pEntry.HeartbeatExpectedMs != null) ? pEntry.HeartbeatExpectedMs : tmpExisting.HeartbeatExpectedMs,
				MinSamplesForBaseline: (pEntry.MinSamplesForBaseline != null) ? pEntry.MinSamplesForBaseline : tmpExisting.MinSamplesForBaseline,
				UpdateDate: tmpNow
			});
		}
	}

	getActionDefault(pCapability, pAction)
	{
		if (!this._Enabled) return null;
		let tmpStmt = this._prepare('getActionDefault', `
			SELECT * FROM BeaconActionDefault
			WHERE Capability = ? AND Action = ? LIMIT 1
		`);
		return tmpStmt.get(pCapability, pAction || '') || null;
	}

	listActionDefaults()
	{
		if (!this._Enabled) return [];
		return this._DB.prepare('SELECT * FROM BeaconActionDefault').all();
	}

	// ====================================================================
	// Aggregate queries for observability
	// ====================================================================

	queueWaitSamples(pCapability, pAction, pLimit)
	{
		if (!this._Enabled) return [];
		let tmpLimit = Math.max(1, Math.min(parseInt(pLimit, 10) || 200, 2000));
		let tmpStmt = this._DB.prepare(`
			SELECT QueueWaitMs FROM BeaconWorkItem
			WHERE Capability = ? AND Action = ? AND QueueWaitMs > 0 AND Deleted = 0
			ORDER BY IDBeaconWorkItem DESC LIMIT ${tmpLimit}
		`);
		return tmpStmt.all(pCapability, pAction || '').map((r) => r.QueueWaitMs);
	}
}

module.exports = UltravisorBeaconQueueStore;
