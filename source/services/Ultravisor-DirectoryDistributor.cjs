/**
 * Ultravisor — DirectoryDistributor
 *
 * Generic mesh primitive for "push the contents of a directory to a
 * remote beacon, validate end-to-end with sha256 tree-hashing, and
 * finalize." Originally cribbed from retold-labs/source/RetoldLabs-PythonRuntime.cjs
 * (which was app-specific to pushing pipeline-workers/) and
 * generalized so both runtime push (Layer 1b) and model push (Layer 2)
 * — and any future "ship a directory tree to a worker" use case — can
 * use the same code path.
 *
 * What it does:
 *   1. Scans a source directory (skipping ignored basenames), computes
 *      a sha256 tree-hash + per-file chunk plan.
 *   2. Streams each file as a sequence of chunks via a caller-supplied
 *      `pDispatch(actionName, settingsObject)` async function. The
 *      dispatcher is the only thing this service knows about beacons
 *      (we don't reach into the BeaconCoordinator directly — that's
 *      the FleetManager's job).
 *   3. Calls a finalizer LWM action with the expected tree-hash.
 *
 * What it doesn't do:
 *   - Pick which beacon to push to (FleetManager).
 *   - Persist installation state (FleetManager + DB).
 *   - Run the worker's post-finalize re-scan (worker handles that
 *     locally inside its finalize action handler).
 *
 * Caller contract for `pDispatch`:
 *     pDispatch(actionName: string, settings: object) -> Promise<response>
 *   where `response` is the beacon's `{ Outputs: {...}, Log: [...] }`
 *   envelope (see Ultravisor-Beacon-Client.cjs:588). Outputs.Status
 *   and Outputs.ExitCode drive success/failure detection.
 *
 * @author Steven Velozo <steven@velozo.com>
 */

const libFableServiceProviderBase = require('fable-serviceproviderbase');
const libPath = require('path');
const libFileStream = require('ultravisor-file-stream');

// Always-skip names. Callers may add to this set per push (e.g.
// pushing a model dir excludes 'venvs' too); we keep the universal
// suspects baked in.
const DEFAULT_IGNORE_BASENAMES = new Set([
	'__pycache__',
	'node_modules',
	'.DS_Store',
	'.git'
]);

const DEFAULT_CHUNK_BYTES = libFileStream.DEFAULT_CHUNK_BYTES;

class UltravisorDirectoryDistributor extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'UltravisorDirectoryDistributor';

		this._chunkBytes = this.options.ChunkBytes || DEFAULT_CHUNK_BYTES;
	}

	/**
	 * Hash + manifest a source directory.
	 *
	 * @param {string} pSourceDir
	 * @param {object} [pOptions]
	 *   - IgnoreBasenames  Set<string>  extra skip names (merged with default)
	 * @returns {{Hash, FileCount, TotalBytes, Files}}
	 */
	scan(pSourceDir, pOptions)
	{
		let tmpIgnore = this._mergedIgnore(pOptions && pOptions.IgnoreBasenames);
		let tmpScan = libFileStream.hashDirectoryTree(pSourceDir, tmpIgnore);
		if (this.log)
		{
			this.log.info(
				`UltravisorDirectoryDistributor: scanned ${pSourceDir} — `
				+ `hash=${tmpScan.Hash.slice(0, 16)}... `
				+ `files=${tmpScan.FileCount} bytes=${tmpScan.TotalBytes}`);
		}
		return tmpScan;
	}

	/**
	 * Build the chunk payloads for a single file inside a source dir.
	 *
	 * The wire RelativePath is what the worker stores at — it's the
	 * caller's responsibility to compose that. For a runtime push the
	 * orchestrator passes the in-source relative path verbatim
	 * ('worker_protocol.py'); for a model push the orchestrator
	 * prefixes the model basename ('sd15/weights/model.safetensors')
	 * so the worker's LWM_PushModel handler writes it under
	 * `<library>/sd15/weights/model.safetensors`.
	 */
	buildChunksForFile(pSourceDir, pInSourceRelativePath, pWireRelativePath)
	{
		let tmpLocalRel = pInSourceRelativePath.split('/').join(libPath.sep);
		let tmpFullPath = libPath.join(pSourceDir, tmpLocalRel);
		return libFileStream.buildChunksForFile(tmpFullPath,
			{ ChunkBytes: this._chunkBytes, RelativePath: pWireRelativePath });
	}

	/**
	 * Orchestrate the full push to one beacon target.
	 *
	 * @param {object} pConfig
	 *   - SourceDir         (required) absolute path on hub disk
	 *   - PushAction        (required) LWM action name for chunks
	 *                                  (e.g. 'LWM_PushPythonRuntime',
	 *                                  'LWM_PushModel')
	 *   - FinalizeAction    (required) LWM action name for finalize
	 *   - DestPathPrefix    (optional) prepended to each file's
	 *                                  in-source RelativePath when
	 *                                  building the wire RelativePath.
	 *                                  Empty for runtime pushes;
	 *                                  '<model-name>' for model pushes.
	 *   - ExpectedHashKey   (optional) Settings key the finalize action
	 *                                  reads to validate the tree-hash.
	 *                                  'ExpectedRuntimeHash' (default),
	 *                                  'ExpectedModelHash', etc.
	 *   - FinalizeExtras    (optional) merged into the finalize-action
	 *                                  Settings (worker-side handlers
	 *                                  may need extra context — e.g.
	 *                                  the model name for inventory
	 *                                  re-scan).
	 *   - IgnoreBasenames   (optional) Set of extra skip names.
	 * @param {function} pDispatch  async (actionName, settings) -> response
	 * @param {function} [pProgress] optional ({BytesPushed, TotalBytes,
	 *                              FilesPushed, FileCount, CurrentFile})
	 */
	async pushDirectoryToTarget(pConfig, pDispatch, pProgress)
	{
		let tmpSourceDir = pConfig.SourceDir;
		let tmpPushAction = pConfig.PushAction;
		let tmpFinalizeAction = pConfig.FinalizeAction;
		let tmpDestPrefix = pConfig.DestPathPrefix || '';
		let tmpExpectedHashKey = pConfig.ExpectedHashKey || 'ExpectedRuntimeHash';
		let tmpFinalizeExtras = pConfig.FinalizeExtras || {};

		if (!tmpSourceDir || !tmpPushAction || !tmpFinalizeAction)
		{
			return {
				Status: 'Error',
				Error: 'pushDirectoryToTarget: SourceDir, PushAction, FinalizeAction all required.',
				FilesPushed: 0,
				BytesPushed: 0
			};
		}

		let tmpStart = Date.now();
		let tmpScan = this.scan(tmpSourceDir, { IgnoreBasenames: pConfig.IgnoreBasenames });

		if (tmpScan.FileCount === 0)
		{
			return {
				Status: 'Error',
				Error: `pushDirectoryToTarget: source directory ${tmpSourceDir} is empty.`,
				FilesPushed: 0,
				BytesPushed: 0
			};
		}

		let tmpBytesPushed = 0;
		let tmpFilesPushed = 0;

		for (let tmpFile of tmpScan.Files)
		{
			// Compose wire RelativePath: optionally prefix with the
			// destination subdir so the worker writes the file at
			// '<base>/<DestPathPrefix>/<file-rel>'.
			let tmpWireRel = tmpDestPrefix
				? this._joinForwardSlash(tmpDestPrefix, tmpFile.RelativePath)
				: tmpFile.RelativePath;

			let tmpChunks = this.buildChunksForFile(tmpSourceDir, tmpFile.RelativePath, tmpWireRel);
			for (let tmpChunk of tmpChunks)
			{
				let tmpResp = await pDispatch(tmpPushAction, tmpChunk);
				if (!this._isOkResponse(tmpResp))
				{
					return {
						Status: 'Error',
						Error: `push chunk ${tmpChunk.ChunkIndex}/${tmpChunk.TotalChunks} `
							+ `for ${tmpWireRel} failed: `
							+ `${this._extractError(tmpResp)}`,
						FilesPushed: tmpFilesPushed,
						BytesPushed: tmpBytesPushed,
						FailedResponse: tmpResp
					};
				}
				tmpBytesPushed += Buffer.byteLength(tmpChunk.Content || '', 'base64');
				if (typeof pProgress === 'function')
				{
					try
					{
						pProgress({
							BytesPushed: tmpBytesPushed,
							TotalBytes: tmpScan.TotalBytes,
							FilesPushed: tmpFilesPushed,
							FileCount: tmpScan.FileCount,
							CurrentFile: tmpWireRel
						});
					}
					catch (e) { /* progress callbacks shouldn't fail the push */ }
				}
			}
			tmpFilesPushed++;
		}

		// Finalize.
		let tmpFinalizeSettings = Object.assign({}, tmpFinalizeExtras);
		tmpFinalizeSettings[tmpExpectedHashKey] = tmpScan.Hash;

		let tmpFinalResp = await pDispatch(tmpFinalizeAction, tmpFinalizeSettings);
		let tmpFinalOk = this._isOkResponse(tmpFinalResp);

		return {
			Status: tmpFinalOk ? 'Success' : 'Error',
			Error: tmpFinalOk ? null : this._extractError(tmpFinalResp),
			SourceDir: tmpSourceDir,
			TreeHash: tmpScan.Hash,
			FilesPushed: tmpFilesPushed,
			FileCount: tmpScan.FileCount,
			BytesPushed: tmpBytesPushed,
			TotalBytes: tmpScan.TotalBytes,
			FinalizeResponse: tmpFinalResp,
			DurationMs: Date.now() - tmpStart
		};
	}

	// ── Internals ──────────────────────────────────────────────

	_mergedIgnore(pExtra)
	{
		if (!pExtra || (pExtra.size === 0))
		{
			return DEFAULT_IGNORE_BASENAMES;
		}
		let tmpMerged = new Set(DEFAULT_IGNORE_BASENAMES);
		for (let tmpName of pExtra) tmpMerged.add(tmpName);
		return tmpMerged;
	}

	_joinForwardSlash(pA, pB)
	{
		// Always emit forward-slash-delimited wire paths regardless of
		// host OS. Worker's chunked-write normalizes to local sep.
		let tmpA = String(pA || '').replace(/^\/+|\/+$/g, '');
		let tmpB = String(pB || '').replace(/^\/+/, '');
		if (!tmpA) return tmpB;
		if (!tmpB) return tmpA;
		return tmpA + '/' + tmpB;
	}

	_isOkResponse(pResp)
	{
		if (!pResp) return false;
		if (pResp.Success === false) return false;
		let tmpOutputs = pResp.Outputs || {};
		// Worker contract: Outputs.Status === 'Success' OR ExitCode falsy.
		if (tmpOutputs.Status && tmpOutputs.Status !== 'Success') return false;
		if (tmpOutputs.ExitCode && tmpOutputs.ExitCode !== 0) return false;
		return true;
	}

	_extractError(pResp)
	{
		if (!pResp) return 'no response';
		let tmpOutputs = pResp.Outputs || {};
		return tmpOutputs.Error
			|| tmpOutputs.Status
			|| pResp.Error
			|| 'unknown';
	}
}

module.exports = UltravisorDirectoryDistributor;
module.exports.DEFAULT_IGNORE_BASENAMES = DEFAULT_IGNORE_BASENAMES;
module.exports.DEFAULT_CHUNK_BYTES = DEFAULT_CHUNK_BYTES;
