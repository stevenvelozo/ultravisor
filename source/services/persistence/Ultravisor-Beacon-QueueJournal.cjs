/**
 * Ultravisor Beacon Queue Journal
 *
 * Write-ahead JSONL journal for persisting the Beacon work queue and
 * affinity bindings across coordinator restarts.
 *
 * Each state mutation (enqueue, claim, complete, fail, affinity change)
 * appends a single line to a JSONL file.  On startup the journal is
 * replayed to rebuild in-memory state.  Periodic compaction writes a
 * full snapshot and truncates the journal.
 *
 * Journal entry format:
 *   {"t":"<ISO timestamp>","op":"<operation>","d":{<payload>}}
 *
 * Operations:
 *   enqueue          — full work item record
 *   claim            — { WorkItemHash, BeaconID, ClaimedAt }
 *   complete         — { WorkItemHash }
 *   fail             — { WorkItemHash }
 *   affinity-create  — full affinity binding record
 *   affinity-clear   — { AffinityKey }
 *   compact          — (no inline data; full state in snapshot file)
 *
 * @module Ultravisor-Beacon-QueueJournal
 */

const libPictService = require('pict-serviceproviderbase');
const libFS = require('fs');
const libPath = require('path');

class UltravisorBeaconQueueJournal extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this._JournalPath = '';
		this._SnapshotPath = '';

		this._WriteCount = 0;
		this._CompactThreshold = 500;

		this._Enabled = false;
		this._Initialized = false;
	}

	// ====================================================================
	// Lifecycle
	// ====================================================================

	/**
	 * Initialize the journal service.
	 *
	 * Creates the storage directory if needed and sets file paths.
	 * Does NOT replay — the coordinator calls replay() separately
	 * so it can merge the results into its own state.
	 *
	 * @param {string} pStorePath - Base storage directory (e.g. UltravisorFileStorePath)
	 */
	initialize(pStorePath)
	{
		if (!pStorePath)
		{
			this.log.warn('BeaconQueueJournal: no store path provided; persistence disabled.');
			return;
		}

		let tmpBeaconDir = libPath.join(pStorePath, 'beacon');

		try
		{
			if (!libFS.existsSync(tmpBeaconDir))
			{
				libFS.mkdirSync(tmpBeaconDir, { recursive: true });
			}
		}
		catch (pError)
		{
			this.log.error(`BeaconQueueJournal: failed to create directory [${tmpBeaconDir}]: ${pError.message}`);
			return;
		}

		this._JournalPath = libPath.join(tmpBeaconDir, 'queue-journal.jsonl');
		this._SnapshotPath = libPath.join(tmpBeaconDir, 'queue-snapshot.json');

		this._CompactThreshold = this.fable.settings.UltravisorBeaconJournalCompactThreshold || 500;

		this._Enabled = true;
		this._Initialized = true;

		this.log.info(`BeaconQueueJournal: initialized at [${tmpBeaconDir}] (compact every ${this._CompactThreshold} writes).`);
	}

	/**
	 * Check whether journaling is active.
	 *
	 * @returns {boolean}
	 */
	isEnabled()
	{
		return this._Enabled;
	}

	// ====================================================================
	// Write
	// ====================================================================

	/**
	 * Append a journal entry.
	 *
	 * Writes are synchronous (appendFileSync) so the caller has a
	 * durability guarantee before continuing.  For the expected write
	 * rates (a few hundred per minute at most) this is acceptable.
	 *
	 * @param {string} pOperation - One of the documented op codes
	 * @param {object} pData - Operation-specific payload
	 */
	appendEntry(pOperation, pData)
	{
		if (!this._Enabled)
		{
			return;
		}

		let tmpEntry = {
			t: new Date().toISOString(),
			op: pOperation,
			d: pData || {}
		};

		try
		{
			libFS.appendFileSync(this._JournalPath, JSON.stringify(tmpEntry) + '\n', 'utf8');
			this._WriteCount++;
		}
		catch (pError)
		{
			this.log.error(`BeaconQueueJournal: write failed: ${pError.message}`);
			return;
		}

		// Auto-compact when threshold is reached
		if (this._WriteCount >= this._CompactThreshold)
		{
			this._requestCompaction();
		}
	}

	// ====================================================================
	// Replay
	// ====================================================================

	/**
	 * Replay the journal to rebuild work queue and affinity bindings.
	 *
	 * Steps:
	 *   1. Load snapshot file (if it exists) as initial state.
	 *   2. Replay each JSONL line on top of that state.
	 *   3. Reset any Running/Assigned items to Pending (beacons are gone).
	 *   4. Clean up expired affinity bindings.
	 *
	 * @returns {{ WorkQueue: object, AffinityBindings: object }}
	 */
	replay()
	{
		if (!this._Initialized)
		{
			return { WorkQueue: {}, AffinityBindings: {} };
		}

		let tmpWorkQueue = {};
		let tmpAffinityBindings = {};

		// --- Step 1: Load snapshot ---
		if (libFS.existsSync(this._SnapshotPath))
		{
			try
			{
				let tmpContent = libFS.readFileSync(this._SnapshotPath, 'utf8');
				let tmpSnapshot = JSON.parse(tmpContent);

				if (tmpSnapshot.WorkQueue && typeof tmpSnapshot.WorkQueue === 'object')
				{
					tmpWorkQueue = tmpSnapshot.WorkQueue;
				}
				if (tmpSnapshot.AffinityBindings && typeof tmpSnapshot.AffinityBindings === 'object')
				{
					tmpAffinityBindings = tmpSnapshot.AffinityBindings;
				}

				this.log.info(`BeaconQueueJournal: loaded snapshot with ${Object.keys(tmpWorkQueue).length} work items, ${Object.keys(tmpAffinityBindings).length} affinity bindings.`);
			}
			catch (pError)
			{
				this.log.error(`BeaconQueueJournal: failed to load snapshot: ${pError.message}`);
				tmpWorkQueue = {};
				tmpAffinityBindings = {};
			}
		}

		// --- Step 2: Replay journal ---
		if (libFS.existsSync(this._JournalPath))
		{
			try
			{
				let tmpContent = libFS.readFileSync(this._JournalPath, 'utf8');
				let tmpLines = tmpContent.split('\n');
				let tmpReplayed = 0;
				let tmpSkipped = 0;

				for (let i = 0; i < tmpLines.length; i++)
				{
					let tmpLine = tmpLines[i].trim();
					if (!tmpLine)
					{
						continue;
					}

					try
					{
						let tmpEntry = JSON.parse(tmpLine);
						this._applyEntry(tmpEntry, tmpWorkQueue, tmpAffinityBindings);
						tmpReplayed++;
					}
					catch (pParseError)
					{
						tmpSkipped++;
					}
				}

				this.log.info(`BeaconQueueJournal: replayed ${tmpReplayed} journal entries (${tmpSkipped} skipped).`);
			}
			catch (pError)
			{
				this.log.error(`BeaconQueueJournal: failed to read journal: ${pError.message}`);
			}
		}

		// --- Step 3: Reset in-flight items to Pending ---
		let tmpWorkItemHashes = Object.keys(tmpWorkQueue);
		let tmpResetCount = 0;
		for (let i = 0; i < tmpWorkItemHashes.length; i++)
		{
			let tmpItem = tmpWorkQueue[tmpWorkItemHashes[i]];

			if (tmpItem.Status === 'Running' || tmpItem.Status === 'Assigned')
			{
				tmpItem.Status = 'Pending';
				tmpItem.AssignedBeaconID = null;
				tmpItem.ClaimedAt = null;
				tmpResetCount++;
			}
		}

		if (tmpResetCount > 0)
		{
			this.log.info(`BeaconQueueJournal: reset ${tmpResetCount} in-flight work items to Pending.`);
		}

		// --- Step 4: Clean up expired affinity bindings ---
		let tmpNow = Date.now();
		let tmpAffinityKeys = Object.keys(tmpAffinityBindings);
		let tmpExpired = 0;
		for (let i = 0; i < tmpAffinityKeys.length; i++)
		{
			let tmpBinding = tmpAffinityBindings[tmpAffinityKeys[i]];
			if (new Date(tmpBinding.ExpiresAt).getTime() < tmpNow)
			{
				delete tmpAffinityBindings[tmpAffinityKeys[i]];
				tmpExpired++;
			}
		}

		if (tmpExpired > 0)
		{
			this.log.info(`BeaconQueueJournal: cleaned up ${tmpExpired} expired affinity bindings.`);
		}

		let tmpFinalWorkCount = Object.keys(tmpWorkQueue).length;
		let tmpFinalAffinityCount = Object.keys(tmpAffinityBindings).length;

		if (tmpFinalWorkCount > 0 || tmpFinalAffinityCount > 0)
		{
			this.log.info(`BeaconQueueJournal: restored ${tmpFinalWorkCount} work items, ${tmpFinalAffinityCount} affinity bindings.`);
		}

		return { WorkQueue: tmpWorkQueue, AffinityBindings: tmpAffinityBindings };
	}

	/**
	 * Apply a single journal entry to the in-memory state.
	 *
	 * @param {object} pEntry - { t, op, d }
	 * @param {object} pWorkQueue - Mutable work queue map
	 * @param {object} pAffinityBindings - Mutable affinity map
	 */
	_applyEntry(pEntry, pWorkQueue, pAffinityBindings)
	{
		let tmpOp = pEntry.op;
		let tmpData = pEntry.d || {};

		switch (tmpOp)
		{
			case 'enqueue':
				if (tmpData.WorkItemHash)
				{
					pWorkQueue[tmpData.WorkItemHash] = tmpData;
				}
				break;

			case 'claim':
				if (tmpData.WorkItemHash && pWorkQueue[tmpData.WorkItemHash])
				{
					let tmpItem = pWorkQueue[tmpData.WorkItemHash];
					tmpItem.Status = 'Running';
					tmpItem.AssignedBeaconID = tmpData.BeaconID || null;
					tmpItem.ClaimedAt = tmpData.ClaimedAt || null;
				}
				break;

			case 'complete':
				if (tmpData.WorkItemHash)
				{
					delete pWorkQueue[tmpData.WorkItemHash];
				}
				break;

			case 'fail':
				if (tmpData.WorkItemHash)
				{
					delete pWorkQueue[tmpData.WorkItemHash];
				}
				break;

			case 'affinity-create':
				if (tmpData.AffinityKey)
				{
					pAffinityBindings[tmpData.AffinityKey] = tmpData;
				}
				break;

			case 'affinity-clear':
				if (tmpData.AffinityKey)
				{
					delete pAffinityBindings[tmpData.AffinityKey];
				}
				break;

			case 'compact':
				// Compact marker — snapshot was already loaded.
				// This just marks the boundary; journal entries after
				// this point override the snapshot.
				break;

			default:
				break;
		}
	}

	// ====================================================================
	// Compaction
	// ====================================================================

	/**
	 * Request compaction from the coordinator.
	 *
	 * The coordinator owns the authoritative state, so compaction is
	 * a pull operation: we ask the coordinator for its current state
	 * and write it as a snapshot.
	 */
	_requestCompaction()
	{
		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');

		if (!tmpCoordinator)
		{
			return;
		}

		this.compact(tmpCoordinator._WorkQueue, tmpCoordinator._AffinityBindings);
	}

	/**
	 * Write a snapshot of the current state and truncate the journal.
	 *
	 * @param {object} pWorkQueue - Current WorkQueue map
	 * @param {object} pAffinityBindings - Current AffinityBindings map
	 */
	compact(pWorkQueue, pAffinityBindings)
	{
		if (!this._Enabled)
		{
			return;
		}

		// Build a clean snapshot — only include Pending/Running/Assigned items
		// (completed and failed items are already removed from the queue)
		let tmpSnapshotQueue = {};
		let tmpHashes = Object.keys(pWorkQueue);
		for (let i = 0; i < tmpHashes.length; i++)
		{
			let tmpItem = pWorkQueue[tmpHashes[i]];
			// Only persist items that haven't been finalized
			if (tmpItem.Status !== 'Complete' && tmpItem.Status !== 'Error' && tmpItem.Status !== 'Timeout')
			{
				// Clone without callbacks, progress, or accumulated log
				tmpSnapshotQueue[tmpHashes[i]] = {
					WorkItemHash: tmpItem.WorkItemHash,
					RunHash: tmpItem.RunHash,
					NodeHash: tmpItem.NodeHash,
					OperationHash: tmpItem.OperationHash,
					Capability: tmpItem.Capability,
					Action: tmpItem.Action,
					Settings: tmpItem.Settings,
					AffinityKey: tmpItem.AffinityKey,
					AssignedBeaconID: tmpItem.AssignedBeaconID,
					Status: tmpItem.Status,
					TimeoutMs: tmpItem.TimeoutMs,
					CreatedAt: tmpItem.CreatedAt,
					ClaimedAt: tmpItem.ClaimedAt,
					CompletedAt: tmpItem.CompletedAt
				};
			}
		}

		let tmpSnapshot = {
			SnapshotAt: new Date().toISOString(),
			WorkQueue: tmpSnapshotQueue,
			AffinityBindings: pAffinityBindings || {}
		};

		try
		{
			// Write snapshot atomically: write to temp, rename
			let tmpTempPath = this._SnapshotPath + '.tmp';
			libFS.writeFileSync(tmpTempPath, JSON.stringify(tmpSnapshot, null, '\t'), 'utf8');
			libFS.renameSync(tmpTempPath, this._SnapshotPath);

			// Truncate the journal
			libFS.writeFileSync(this._JournalPath, '', 'utf8');

			// Write a compact marker so any future journal entries are
			// known to be relative to this snapshot
			libFS.appendFileSync(this._JournalPath,
				JSON.stringify({ t: new Date().toISOString(), op: 'compact', d: {} }) + '\n', 'utf8');

			this._WriteCount = 1; // The compact marker counts as one entry
			let tmpQueueSize = Object.keys(tmpSnapshotQueue).length;
			let tmpAffinitySize = Object.keys(pAffinityBindings || {}).length;
			this.log.info(`BeaconQueueJournal: compacted — snapshot has ${tmpQueueSize} work items, ${tmpAffinitySize} affinity bindings.`);
		}
		catch (pError)
		{
			this.log.error(`BeaconQueueJournal: compaction failed: ${pError.message}`);
		}
	}

	// ====================================================================
	// Internal Helpers
	// ====================================================================

	/**
	 * Get a service by type name.
	 */
	_getService(pTypeName)
	{
		return this.fable.servicesMap[pTypeName]
			? Object.values(this.fable.servicesMap[pTypeName])[0]
			: null;
	}
}

module.exports = UltravisorBeaconQueueJournal;
module.exports.default_configuration = {};
