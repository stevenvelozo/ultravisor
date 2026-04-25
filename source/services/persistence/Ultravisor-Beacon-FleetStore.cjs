/**
 * Ultravisor Beacon Fleet Store
 *
 * SQLite-backed persistence for per-(beacon, model) installation state
 * and per-(beacon, runtime) state. Authoritative source of truth for
 * which beacons may be dispatched a given model and what code/runtime
 * the worker has currently received.
 *
 * Schema:    source/datamodel/Ultravisor-Fleet.json
 * Storage:   <storePath>/beacon/beacon-fleet.sqlite
 *
 * Mirrors the column-to-DDL machinery from Ultravisor-Beacon-QueueStore
 * — the two stores are siblings.  Forward-only ADD COLUMN migration
 * means the schema can grow over time without manual intervention.
 *
 * Threading: better-sqlite3 is synchronous; all methods return
 * immediately. WAL mode allows concurrent readers from other ultravisor
 * services if a separate connection is opened against the same file.
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
	// Same as QueueStore: defer the failure to initialize() so unit
	// tests that don't touch persistence can still load this module.
}

const TYPE_INTEGER_RE = /^(Integer|Int|FK|AutoID|AutoIdentity|ID|CreateIDUser|UpdateIDUser|DeleteIDUser|Boolean|Deleted)$/i;
const TYPE_NUMERIC_INT_SIZES = new Set(['int', 'integer', 'smallint', 'bigint', 'tinyint']);

const VALID_MODEL_STATUSES = new Set([
	'queued',       // operator clicked install but push hasn't started
	'installing',   // chunks in flight; PushProgressBytes meaningful
	'installed',    // worker has it on disk; tree-hash verified
	'error',        // last install attempt failed; LastError populated
	'uninstalling', // delete in flight
	'uninstalled'   // soft-deleted (Deleted=true on row)
]);

const VALID_RUNTIME_STATUSES = new Set([
	'pending',      // beacon connected; runtime push needed
	'pushing',      // chunks in flight
	'installed',    // worker has runtime; tree-hash verified
	'error'         // push failed; LastError populated
]);

class UltravisorBeaconFleetStore extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);
		this.serviceType = 'UltravisorBeaconFleetStore';
		this._DBPath = '';
		this._DB = null;
		this._Schema = null;
		this._Initialized = false;
		this._Enabled = false;
		this._Prepared = {};
	}

	// ── Lifecycle ────────────────────────────────────────────────

	initialize(pStorePath)
	{
		if (this._Initialized) return this._Enabled;
		this._Initialized = true;

		if (!pStorePath)
		{
			this.log.warn('BeaconFleetStore: no store path; persistence disabled.');
			return false;
		}
		if (!libBetterSqlite)
		{
			this.log.error('BeaconFleetStore: better-sqlite3 not installed; persistence disabled.');
			return false;
		}

		let tmpDir = libPath.join(pStorePath, 'beacon');
		try
		{
			if (!libFS.existsSync(tmpDir)) libFS.mkdirSync(tmpDir, { recursive: true });
		}
		catch (pError)
		{
			this.log.error(`BeaconFleetStore: failed to create [${tmpDir}]: ${pError.message}`);
			return false;
		}

		this._DBPath = libPath.join(tmpDir, 'beacon-fleet.sqlite');

		try
		{
			this._DB = new libBetterSqlite(this._DBPath);
			this._DB.pragma('journal_mode = WAL');
			this._DB.pragma('synchronous = NORMAL');
			this._DB.pragma('foreign_keys = ON');
		}
		catch (pError)
		{
			this.log.error(`BeaconFleetStore: failed to open [${this._DBPath}]: ${pError.message}`);
			return false;
		}

		let tmpSchemaPath = libPath.join(__dirname, '..', '..', 'datamodel', 'Ultravisor-Fleet.json');
		try
		{
			this._Schema = JSON.parse(libFS.readFileSync(tmpSchemaPath, 'utf8'));
		}
		catch (pError)
		{
			this.log.error(`BeaconFleetStore: failed to load schema [${tmpSchemaPath}]: ${pError.message}`);
			return false;
		}

		try
		{
			this._provisionTables();
		}
		catch (pError)
		{
			this.log.error(`BeaconFleetStore: schema provisioning failed: ${pError.message}`);
			return false;
		}

		this._Enabled = true;
		this.log.info(`BeaconFleetStore: ready at [${this._DBPath}].`);
		return true;
	}

	isEnabled() { return this._Enabled; }

	close()
	{
		if (this._DB)
		{
			try { this._DB.close(); } catch (e) { /* ignore */ }
			this._DB = null;
		}
		this._Enabled = false;
		this._Prepared = {};
	}

	// ── Schema provisioning ──────────────────────────────────────

	_columnToSql(pCol, pIsPrimary)
	{
		let tmpType = pCol.DataType || pCol.Type || 'String';
		let tmpSize = (pCol.Size || '').toString().toLowerCase();
		let tmpSqlType = 'TEXT';
		if (/^ID$/i.test(tmpType)) tmpSqlType = 'INTEGER';
		else if (/^Numeric$/i.test(tmpType))
			tmpSqlType = TYPE_NUMERIC_INT_SIZES.has(tmpSize) ? 'INTEGER' : 'REAL';
		else if (TYPE_INTEGER_RE.test(tmpType)) tmpSqlType = 'INTEGER';
		else if (/^(DateTime|Date)$/i.test(tmpType)) tmpSqlType = 'TEXT';

		let tmpDDL = `"${pCol.Column}" ${tmpSqlType}`;
		if (pIsPrimary) tmpDDL += ' PRIMARY KEY AUTOINCREMENT';
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
			let tmpPrimaryIdx = tmpCols.findIndex(
				(c) => /^ID$/i.test(c.DataType || c.Type || ''));
			let tmpDDLCols = tmpCols.map((c, idx) =>
				this._columnToSql(c, idx === tmpPrimaryIdx));
			let tmpCreate = `CREATE TABLE IF NOT EXISTS "${tmpTable.TableName}" (${tmpDDLCols.join(', ')})`;
			this._DB.exec(tmpCreate);

			// Forward-only ADD COLUMN
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
					this.log.info(`BeaconFleetStore: migrated ${tmpTable.TableName}.${c.Column}`);
				}
				catch (pAlterErr)
				{
					if (!/duplicate column/i.test(pAlterErr.message)) throw pAlterErr;
				}
			}
		}

		// Indices on the lookup paths. Per-(beacon, modelkey) unique
		// constraint via partial index — soft-deleted rows excluded so
		// re-installing a previously uninstalled model creates a fresh row.
		let tmpIndices =
		[
			'CREATE INDEX IF NOT EXISTS idx_modelinst_beacon ON BeaconModelInstallation(BeaconID, Deleted)',
			'CREATE INDEX IF NOT EXISTS idx_modelinst_model ON BeaconModelInstallation(ModelKey, Deleted)',
			'CREATE INDEX IF NOT EXISTS idx_modelinst_status ON BeaconModelInstallation(Status, Deleted)',
			'CREATE INDEX IF NOT EXISTS idx_modelinst_enabled ON BeaconModelInstallation(EnabledForDispatch, Deleted)',
			'CREATE UNIQUE INDEX IF NOT EXISTS uniq_modelinst_active ON BeaconModelInstallation(BeaconID, ModelKey) WHERE Deleted = 0',
			'CREATE INDEX IF NOT EXISTS idx_runtimeinst_beacon ON BeaconRuntimeInstallation(BeaconID, Deleted)',
			'CREATE INDEX IF NOT EXISTS idx_runtimeinst_runtime ON BeaconRuntimeInstallation(RuntimeName, Deleted)',
			'CREATE UNIQUE INDEX IF NOT EXISTS uniq_runtimeinst_active ON BeaconRuntimeInstallation(BeaconID, RuntimeName) WHERE Deleted = 0'
		];
		for (let tmpSql of tmpIndices) this._DB.exec(tmpSql);
	}

	// ── Internals ────────────────────────────────────────────────

	_prepare(pKey, pSql)
	{
		if (!this._Prepared[pKey]) this._Prepared[pKey] = this._DB.prepare(pSql);
		return this._Prepared[pKey];
	}

	_nowIso() { return new Date().toISOString(); }

	_genGuid()
	{
		// Lightweight RFC4122 v4-ish; same shape as the rest of the codebase.
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) =>
		{
			let r = Math.random() * 16 | 0;
			let v = c === 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}

	_boolToInt(pBool)
	{
		return pBool ? 1 : 0;
	}

	_intToBool(pInt)
	{
		return !!pInt;
	}

	_rowToModelInstallation(pRow)
	{
		if (!pRow) return null;
		return {
			IDBeaconModelInstallation: pRow.IDBeaconModelInstallation,
			GUID: pRow.GUIDBeaconModelInstallation,
			BeaconID: pRow.BeaconID,
			BeaconName: pRow.BeaconName,
			ModelKey: pRow.ModelKey,
			ModelName: pRow.ModelName,
			ModelSourceDir: pRow.ModelSourceDir,
			ExpectedTreeHash: pRow.ExpectedTreeHash,
			InstalledTreeHash: pRow.InstalledTreeHash,
			InstalledBytes: pRow.InstalledBytes || 0,
			Status: pRow.Status,
			EnabledForDispatch: this._intToBool(pRow.EnabledForDispatch),
			PushProgressBytes: pRow.PushProgressBytes || 0,
			PushTotalBytes: pRow.PushTotalBytes || 0,
			LastError: pRow.LastError,
			InstalledAt: pRow.InstalledAt,
			LastUpdatedAt: pRow.LastUpdatedAt,
			Source: pRow.Source,
			CreateDate: pRow.CreateDate,
			UpdateDate: pRow.UpdateDate
		};
	}

	_rowToRuntimeInstallation(pRow)
	{
		if (!pRow) return null;
		return {
			IDBeaconRuntimeInstallation: pRow.IDBeaconRuntimeInstallation,
			GUID: pRow.GUIDBeaconRuntimeInstallation,
			BeaconID: pRow.BeaconID,
			BeaconName: pRow.BeaconName,
			RuntimeName: pRow.RuntimeName,
			ExpectedRuntimeHash: pRow.ExpectedRuntimeHash,
			InstalledRuntimeHash: pRow.InstalledRuntimeHash,
			Status: pRow.Status,
			LastError: pRow.LastError,
			InstalledAt: pRow.InstalledAt,
			LastUpdatedAt: pRow.LastUpdatedAt,
			CreateDate: pRow.CreateDate,
			UpdateDate: pRow.UpdateDate
		};
	}

	// ── Model installation API ───────────────────────────────────

	/**
	 * Insert-or-update a (BeaconID, ModelKey) row. Returns the resulting
	 * model installation record.
	 */
	upsertModelInstallation(pInst)
	{
		if (!this._Enabled) return null;
		if (!pInst || !pInst.BeaconID || !pInst.ModelKey)
		{
			throw new Error('upsertModelInstallation: BeaconID and ModelKey required');
		}
		let tmpExisting = this.getModelInstallation(pInst.BeaconID, pInst.ModelKey);
		let tmpNow = this._nowIso();
		if (tmpExisting)
		{
			let tmpStmt = this._prepare('updateModelInst', `
				UPDATE BeaconModelInstallation
				SET BeaconName = COALESCE(?, BeaconName),
				    ModelName = COALESCE(?, ModelName),
				    ModelSourceDir = COALESCE(?, ModelSourceDir),
				    ExpectedTreeHash = COALESCE(?, ExpectedTreeHash),
				    InstalledTreeHash = COALESCE(?, InstalledTreeHash),
				    InstalledBytes = COALESCE(?, InstalledBytes),
				    Status = COALESCE(?, Status),
				    EnabledForDispatch = COALESCE(?, EnabledForDispatch),
				    PushProgressBytes = COALESCE(?, PushProgressBytes),
				    PushTotalBytes = COALESCE(?, PushTotalBytes),
				    LastError = ?,
				    InstalledAt = COALESCE(?, InstalledAt),
				    LastUpdatedAt = ?,
				    Source = COALESCE(?, Source),
				    UpdateDate = ?
				WHERE IDBeaconModelInstallation = ?`);
			tmpStmt.run(
				pInst.BeaconName == null ? null : pInst.BeaconName,
				pInst.ModelName == null ? null : pInst.ModelName,
				pInst.ModelSourceDir == null ? null : pInst.ModelSourceDir,
				pInst.ExpectedTreeHash == null ? null : pInst.ExpectedTreeHash,
				pInst.InstalledTreeHash == null ? null : pInst.InstalledTreeHash,
				pInst.InstalledBytes == null ? null : pInst.InstalledBytes,
				pInst.Status == null ? null : pInst.Status,
				pInst.EnabledForDispatch == null ? null : this._boolToInt(pInst.EnabledForDispatch),
				pInst.PushProgressBytes == null ? null : pInst.PushProgressBytes,
				pInst.PushTotalBytes == null ? null : pInst.PushTotalBytes,
				pInst.LastError == null ? null : pInst.LastError,
				pInst.InstalledAt == null ? null : pInst.InstalledAt,
				tmpNow,
				pInst.Source == null ? null : pInst.Source,
				tmpNow,
				tmpExisting.IDBeaconModelInstallation
			);
			return this.getModelInstallation(pInst.BeaconID, pInst.ModelKey);
		}
		let tmpStmt = this._prepare('insertModelInst', `
			INSERT INTO BeaconModelInstallation
				(GUIDBeaconModelInstallation, CreateDate, UpdateDate, Deleted,
				 BeaconID, BeaconName, ModelKey, ModelName, ModelSourceDir,
				 ExpectedTreeHash, InstalledTreeHash, InstalledBytes,
				 Status, EnabledForDispatch, PushProgressBytes, PushTotalBytes,
				 LastError, InstalledAt, LastUpdatedAt, Source)
			VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
		tmpStmt.run(
			this._genGuid(),
			tmpNow,
			tmpNow,
			pInst.BeaconID,
			pInst.BeaconName || '',
			pInst.ModelKey,
			pInst.ModelName || '',
			pInst.ModelSourceDir || '',
			pInst.ExpectedTreeHash || '',
			pInst.InstalledTreeHash || '',
			pInst.InstalledBytes || 0,
			pInst.Status || 'queued',
			this._boolToInt(pInst.EnabledForDispatch),
			pInst.PushProgressBytes || 0,
			pInst.PushTotalBytes || 0,
			pInst.LastError || null,
			pInst.InstalledAt || null,
			tmpNow,
			pInst.Source || 'operator'
		);
		return this.getModelInstallation(pInst.BeaconID, pInst.ModelKey);
	}

	getModelInstallation(pBeaconID, pModelKey)
	{
		if (!this._Enabled) return null;
		let tmpStmt = this._prepare('getModelInst', `
			SELECT * FROM BeaconModelInstallation
			WHERE BeaconID = ? AND ModelKey = ? AND Deleted = 0
			LIMIT 1`);
		let tmpRow = tmpStmt.get(pBeaconID, pModelKey);
		return this._rowToModelInstallation(tmpRow);
	}

	listModelInstallations(pFilters)
	{
		if (!this._Enabled) return [];
		let tmpFilters = pFilters || {};
		let tmpClauses = [ 'Deleted = 0' ];
		let tmpArgs = [];
		if (tmpFilters.BeaconID) { tmpClauses.push('BeaconID = ?'); tmpArgs.push(tmpFilters.BeaconID); }
		if (tmpFilters.ModelKey) { tmpClauses.push('ModelKey = ?'); tmpArgs.push(tmpFilters.ModelKey); }
		if (tmpFilters.Status)   { tmpClauses.push('Status = ?');   tmpArgs.push(tmpFilters.Status); }
		if (tmpFilters.EnabledForDispatch !== undefined)
		{
			tmpClauses.push('EnabledForDispatch = ?');
			tmpArgs.push(this._boolToInt(tmpFilters.EnabledForDispatch));
		}
		let tmpSql = `SELECT * FROM BeaconModelInstallation WHERE ${tmpClauses.join(' AND ')} ORDER BY BeaconName, ModelName`;
		let tmpStmt = this._DB.prepare(tmpSql);
		return tmpStmt.all(...tmpArgs).map((r) => this._rowToModelInstallation(r));
	}

	updateModelInstallationStatus(pBeaconID, pModelKey, pStatus, pExtras)
	{
		if (!this._Enabled) return null;
		if (!VALID_MODEL_STATUSES.has(pStatus))
		{
			throw new Error(`updateModelInstallationStatus: invalid status '${pStatus}'`);
		}
		let tmpExtras = pExtras || {};
		return this.upsertModelInstallation(Object.assign({
			BeaconID: pBeaconID,
			ModelKey: pModelKey,
			Status: pStatus
		}, tmpExtras));
	}

	setModelEnabled(pBeaconID, pModelKey, pEnabled)
	{
		if (!this._Enabled) return null;
		return this.upsertModelInstallation({
			BeaconID: pBeaconID,
			ModelKey: pModelKey,
			EnabledForDispatch: !!pEnabled
		});
	}

	deleteModelInstallation(pBeaconID, pModelKey)
	{
		if (!this._Enabled) return false;
		let tmpStmt = this._prepare('deleteModelInst', `
			UPDATE BeaconModelInstallation
			SET Deleted = 1, DeleteDate = ?, Status = 'uninstalled', LastUpdatedAt = ?
			WHERE BeaconID = ? AND ModelKey = ? AND Deleted = 0`);
		let tmpNow = this._nowIso();
		let tmpResult = tmpStmt.run(tmpNow, tmpNow, pBeaconID, pModelKey);
		return tmpResult.changes > 0;
	}

	/**
	 * Fast yes/no check used by the dispatch filter. Returns true only
	 * when the (beacon, model) row exists, is installed, and the
	 * operator toggle is on.
	 */
	isModelEnabledOn(pBeaconID, pModelKey)
	{
		if (!this._Enabled) return false;
		let tmpStmt = this._prepare('isModelEnabled', `
			SELECT 1 FROM BeaconModelInstallation
			WHERE BeaconID = ? AND ModelKey = ?
			  AND Deleted = 0 AND Status = 'installed' AND EnabledForDispatch = 1
			LIMIT 1`);
		return !!tmpStmt.get(pBeaconID, pModelKey);
	}

	// ── Runtime installation API ─────────────────────────────────

	upsertRuntimeInstallation(pInst)
	{
		if (!this._Enabled) return null;
		if (!pInst || !pInst.BeaconID || !pInst.RuntimeName)
		{
			throw new Error('upsertRuntimeInstallation: BeaconID and RuntimeName required');
		}
		let tmpExisting = this.getRuntimeInstallation(pInst.BeaconID, pInst.RuntimeName);
		let tmpNow = this._nowIso();
		if (tmpExisting)
		{
			let tmpStmt = this._prepare('updateRuntimeInst', `
				UPDATE BeaconRuntimeInstallation
				SET BeaconName = COALESCE(?, BeaconName),
				    ExpectedRuntimeHash = COALESCE(?, ExpectedRuntimeHash),
				    InstalledRuntimeHash = COALESCE(?, InstalledRuntimeHash),
				    Status = COALESCE(?, Status),
				    LastError = ?,
				    InstalledAt = COALESCE(?, InstalledAt),
				    LastUpdatedAt = ?,
				    UpdateDate = ?
				WHERE IDBeaconRuntimeInstallation = ?`);
			tmpStmt.run(
				pInst.BeaconName == null ? null : pInst.BeaconName,
				pInst.ExpectedRuntimeHash == null ? null : pInst.ExpectedRuntimeHash,
				pInst.InstalledRuntimeHash == null ? null : pInst.InstalledRuntimeHash,
				pInst.Status == null ? null : pInst.Status,
				pInst.LastError == null ? null : pInst.LastError,
				pInst.InstalledAt == null ? null : pInst.InstalledAt,
				tmpNow,
				tmpNow,
				tmpExisting.IDBeaconRuntimeInstallation
			);
			return this.getRuntimeInstallation(pInst.BeaconID, pInst.RuntimeName);
		}
		let tmpStmt = this._prepare('insertRuntimeInst', `
			INSERT INTO BeaconRuntimeInstallation
				(GUIDBeaconRuntimeInstallation, CreateDate, UpdateDate, Deleted,
				 BeaconID, BeaconName, RuntimeName,
				 ExpectedRuntimeHash, InstalledRuntimeHash, Status,
				 LastError, InstalledAt, LastUpdatedAt)
			VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
		tmpStmt.run(
			this._genGuid(),
			tmpNow, tmpNow,
			pInst.BeaconID,
			pInst.BeaconName || '',
			pInst.RuntimeName,
			pInst.ExpectedRuntimeHash || '',
			pInst.InstalledRuntimeHash || '',
			pInst.Status || 'pending',
			pInst.LastError || null,
			pInst.InstalledAt || null,
			tmpNow
		);
		return this.getRuntimeInstallation(pInst.BeaconID, pInst.RuntimeName);
	}

	getRuntimeInstallation(pBeaconID, pRuntimeName)
	{
		if (!this._Enabled) return null;
		let tmpStmt = this._prepare('getRuntimeInst', `
			SELECT * FROM BeaconRuntimeInstallation
			WHERE BeaconID = ? AND RuntimeName = ? AND Deleted = 0
			LIMIT 1`);
		return this._rowToRuntimeInstallation(tmpStmt.get(pBeaconID, pRuntimeName));
	}

	listRuntimeInstallations(pFilters)
	{
		if (!this._Enabled) return [];
		let tmpFilters = pFilters || {};
		let tmpClauses = [ 'Deleted = 0' ];
		let tmpArgs = [];
		if (tmpFilters.BeaconID)    { tmpClauses.push('BeaconID = ?');    tmpArgs.push(tmpFilters.BeaconID); }
		if (tmpFilters.RuntimeName) { tmpClauses.push('RuntimeName = ?'); tmpArgs.push(tmpFilters.RuntimeName); }
		if (tmpFilters.Status)      { tmpClauses.push('Status = ?');      tmpArgs.push(tmpFilters.Status); }
		let tmpSql = `SELECT * FROM BeaconRuntimeInstallation WHERE ${tmpClauses.join(' AND ')} ORDER BY BeaconName, RuntimeName`;
		return this._DB.prepare(tmpSql).all(...tmpArgs).map((r) => this._rowToRuntimeInstallation(r));
	}

	updateRuntimeInstallationStatus(pBeaconID, pRuntimeName, pStatus, pExtras)
	{
		if (!this._Enabled) return null;
		if (!VALID_RUNTIME_STATUSES.has(pStatus))
		{
			throw new Error(`updateRuntimeInstallationStatus: invalid status '${pStatus}'`);
		}
		return this.upsertRuntimeInstallation(Object.assign({
			BeaconID: pBeaconID,
			RuntimeName: pRuntimeName,
			Status: pStatus
		}, pExtras || {}));
	}
}

module.exports = UltravisorBeaconFleetStore;
module.exports.VALID_MODEL_STATUSES = VALID_MODEL_STATUSES;
module.exports.VALID_RUNTIME_STATUSES = VALID_RUNTIME_STATUSES;
