const libFS = require('fs');
const libPath = require('path');

/**
 * Bound the in-memory size of TaskOutputs by lifting large per-port
 * payloads to disk and replacing them in the manifest with a small
 * reference object.
 *
 * The fix the lab needed: typed-op pipelines (Pull -> Intersect ->
 * Comprehension -> Write at 100K rows) were emitting ~30 MB of JSON-
 * stringified `Result` per node. UV held those strings in TaskOutputs
 * and serialized the full manifest twice per snapshot (disk + sync
 * /Trigger response), which saturated the V8 heap inside Builtin_
 * JsonParse on sustained stress.
 *
 * Splitting the two jobs TaskOutputs was secretly doing — short-lived
 * State-edge transport vs. durable manifest record — by lifting only
 * the transport payload, breaks the link between manifest size and
 * payload size while preserving the State-edge contract: handlers
 * still see materialized values, never refs.
 *
 * Lift on write, materialize on read. Pure functions; the caller owns
 * the staging path.
 */

const REF_KEY = '$$ref';
const REF_DIR = 'outputs';
const DEFAULT_THRESHOLD_BYTES = 1024 * 1024;
const STREAM_CHUNK_BYTES = 64 * 1024;

/**
 * Resolve the byte threshold for lifting. Order: env var, program
 * config, default. Env var wins so an operator can hot-tune in a
 * stuck container without rebuilding. Returns the default for any
 * non-positive or unparseable value.
 */
function getThresholdBytes(pFable)
{
	let tmpEnv = process.env.UV_OUTPUT_STORE_THRESHOLD_BYTES;
	if (tmpEnv)
	{
		let tmpParsed = parseInt(tmpEnv, 10);
		if (!isNaN(tmpParsed) && tmpParsed > 0)
		{
			return tmpParsed;
		}
	}
	if (pFable && pFable.ProgramConfiguration
		&& typeof(pFable.ProgramConfiguration.UltravisorOutputStoreThresholdBytes) === 'number'
		&& pFable.ProgramConfiguration.UltravisorOutputStoreThresholdBytes > 0)
	{
		return pFable.ProgramConfiguration.UltravisorOutputStoreThresholdBytes;
	}
	return DEFAULT_THRESHOLD_BYTES;
}

/**
 * True for the {$$ref, Bytes} shape produced by liftValue. Used by
 * read-side materialization and by callers that want to special-case
 * ref-bearing entries (e.g. the optional inline-follow on /Manifest).
 */
function isOutputRef(pValue)
{
	return pValue !== null
		&& typeof(pValue) === 'object'
		&& typeof(pValue[REF_KEY]) === 'string';
}

/**
 * Decide whether a single value is large enough to lift. Strings and
 * Buffers carry the bulk of typed-op payloads — they're the only
 * shapes worth measuring without paying the JSON.stringify cost we're
 * trying to avoid. Objects/Arrays under threshold stay inline; if a
 * future workload produces a multi-megabyte object literal, lift the
 * producer side first (cheaper) before reaching for a structural
 * size walk here.
 */
function _shouldLift(pValue, pThresholdBytes)
{
	if (typeof(pValue) === 'string')
	{
		return Buffer.byteLength(pValue, 'utf8') >= pThresholdBytes;
	}
	if (Buffer.isBuffer(pValue))
	{
		return pValue.length >= pThresholdBytes;
	}
	return false;
}

/**
 * Sanitize a path segment so node hashes / port names map to safe
 * filesystem names. Anything outside [A-Za-z0-9_-] becomes '_'.
 */
function _safeSegment(pValue)
{
	let tmpStr = String(pValue == null ? '' : pValue);
	if (tmpStr === '')
	{
		return '_';
	}
	return tmpStr.replace(/[^A-Za-z0-9_\-]/g, '_');
}

/**
 * Stream a string or Buffer to disk in fixed-size chunks. Avoids the
 * implicit Buffer.from copy that writeFileSync does for large strings
 * (which is half the OOM blast radius — string + buffer alive at the
 * same time). Peak overhead is one chunk regardless of payload size.
 */
function _streamWriteSync(pAbsolutePath, pValue)
{
	let tmpFd = libFS.openSync(pAbsolutePath, 'w');
	try
	{
		if (typeof(pValue) === 'string')
		{
			let tmpOffset = 0;
			let tmpLen = pValue.length;
			while (tmpOffset < tmpLen)
			{
				let tmpEnd = Math.min(tmpOffset + STREAM_CHUNK_BYTES, tmpLen);
				let tmpChunkBuf = Buffer.from(pValue.slice(tmpOffset, tmpEnd), 'utf8');
				libFS.writeSync(tmpFd, tmpChunkBuf, 0, tmpChunkBuf.length);
				tmpOffset = tmpEnd;
			}
		}
		else if (Buffer.isBuffer(pValue))
		{
			let tmpOffset = 0;
			while (tmpOffset < pValue.length)
			{
				let tmpEnd = Math.min(tmpOffset + STREAM_CHUNK_BYTES, pValue.length);
				libFS.writeSync(tmpFd, pValue, tmpOffset, tmpEnd - tmpOffset);
				tmpOffset = tmpEnd;
			}
		}
		else
		{
			throw new Error('OutputStore: _streamWriteSync expects a string or Buffer');
		}
	}
	finally
	{
		libFS.closeSync(tmpFd);
	}
}

/**
 * Lift one value to disk and return the ref object that should
 * replace it in TaskOutputs. The ref's path is relative to the run's
 * staging dir; readers join it back with the same staging dir so a
 * staging folder can be moved without rewriting refs.
 */
function liftValue(pStagingPath, pNodeHash, pPort, pValue)
{
	let tmpRelDir = libPath.join(REF_DIR, _safeSegment(pNodeHash));
	let tmpAbsDir = libPath.resolve(pStagingPath, tmpRelDir);
	libFS.mkdirSync(tmpAbsDir, { recursive: true });

	let tmpFileName = _safeSegment(pPort) + '.json';
	let tmpAbsFile = libPath.resolve(tmpAbsDir, tmpFileName);
	let tmpRelFile = libPath.join(tmpRelDir, tmpFileName);

	_streamWriteSync(tmpAbsFile, pValue);

	let tmpBytes;
	if (typeof(pValue) === 'string')
	{
		tmpBytes = Buffer.byteLength(pValue, 'utf8');
	}
	else
	{
		tmpBytes = pValue.length;
	}

	let tmpRef = {};
	tmpRef[REF_KEY] = tmpRelFile.split(libPath.sep).join('/');
	tmpRef.Bytes = tmpBytes;
	return tmpRef;
}

/**
 * Read a ref's contents back from disk. Returns the original value
 * (utf8 string — the only shape we lift today) or undefined when the
 * staging file is gone (e.g. retention sweep ran, or a reloaded
 * manifest references a folder that was cleaned).
 *
 * Non-ref values pass through unchanged so callers can wrap any read
 * site without branching.
 */
function materializeRefValue(pStagingPath, pValue, pLogger)
{
	if (!isOutputRef(pValue))
	{
		return pValue;
	}
	if (!pStagingPath)
	{
		if (pLogger) pLogger.warn(`OutputStore: cannot materialize ref [${pValue[REF_KEY]}] without a staging path.`);
		return undefined;
	}
	let tmpAbsFile = libPath.resolve(pStagingPath, pValue[REF_KEY]);
	if (!libFS.existsSync(tmpAbsFile))
	{
		if (pLogger) pLogger.warn(`OutputStore: ref payload missing on disk [${tmpAbsFile}].`);
		return undefined;
	}
	try
	{
		return libFS.readFileSync(tmpAbsFile, 'utf8');
	}
	catch (pError)
	{
		if (pLogger) pLogger.warn(`OutputStore: failed to read ref payload [${tmpAbsFile}]: ${pError.message}`);
		return undefined;
	}
}

/**
 * Merge a set of new fields into TaskOutputs[<nodeHash>], lifting any
 * field whose serialized size meets or exceeds the threshold. Falls
 * back to inline storage on any IO failure so a flaky disk doesn't
 * turn into lost outputs.
 *
 * This is the one entry point the engine uses for all three places
 * that write to TaskOutputs (resume, intermediate event, task
 * complete). Centralizing avoids the "I forgot to lift in this code
 * path" bug the original conflated design encouraged.
 */
function mergeAndLift(pContext, pNodeHash, pNewFields, pOptions)
{
	if (!pNewFields || typeof(pNewFields) !== 'object')
	{
		return;
	}
	if (!pContext.TaskOutputs)
	{
		pContext.TaskOutputs = {};
	}
	if (!pContext.TaskOutputs[pNodeHash])
	{
		pContext.TaskOutputs[pNodeHash] = {};
	}

	let tmpTarget = pContext.TaskOutputs[pNodeHash];
	let tmpFable = (pOptions && pOptions.Fable) || null;
	let tmpLogger = (pOptions && pOptions.Logger) || null;
	let tmpThreshold = getThresholdBytes(tmpFable);

	let tmpKeys = Object.keys(pNewFields);
	for (let i = 0; i < tmpKeys.length; i++)
	{
		let tmpKey = tmpKeys[i];
		let tmpVal = pNewFields[tmpKey];

		if (pContext.StagingPath && _shouldLift(tmpVal, tmpThreshold))
		{
			try
			{
				tmpTarget[tmpKey] = liftValue(pContext.StagingPath, pNodeHash, tmpKey, tmpVal);
				continue;
			}
			catch (pError)
			{
				if (tmpLogger) tmpLogger.warn(`OutputStore: lift failed for [${pNodeHash}.${tmpKey}], falling back to inline: ${pError.message}`);
			}
		}
		tmpTarget[tmpKey] = tmpVal;
	}
}

/**
 * Walk a TaskOutputs map and inline every ref into its materialized
 * value. Used by the optional /Manifest?inline=outputs follow path —
 * regular manifest reads return refs as-is.
 */
function inlineAllRefs(pStagingPath, pTaskOutputs, pLogger)
{
	if (!pTaskOutputs || typeof(pTaskOutputs) !== 'object')
	{
		return pTaskOutputs;
	}
	let tmpResult = {};
	let tmpNodeKeys = Object.keys(pTaskOutputs);
	for (let i = 0; i < tmpNodeKeys.length; i++)
	{
		let tmpNodeHash = tmpNodeKeys[i];
		let tmpEntry = pTaskOutputs[tmpNodeHash];
		if (!tmpEntry || typeof(tmpEntry) !== 'object')
		{
			tmpResult[tmpNodeHash] = tmpEntry;
			continue;
		}
		let tmpInlined = {};
		let tmpFieldKeys = Object.keys(tmpEntry);
		for (let j = 0; j < tmpFieldKeys.length; j++)
		{
			let tmpField = tmpFieldKeys[j];
			tmpInlined[tmpField] = materializeRefValue(pStagingPath, tmpEntry[tmpField], pLogger);
		}
		tmpResult[tmpNodeHash] = tmpInlined;
	}
	return tmpResult;
}

module.exports =
{
	REF_KEY: REF_KEY,
	DEFAULT_THRESHOLD_BYTES: DEFAULT_THRESHOLD_BYTES,
	getThresholdBytes: getThresholdBytes,
	isOutputRef: isOutputRef,
	liftValue: liftValue,
	materializeRefValue: materializeRefValue,
	mergeAndLift: mergeAndLift,
	inlineAllRefs: inlineAllRefs
};
