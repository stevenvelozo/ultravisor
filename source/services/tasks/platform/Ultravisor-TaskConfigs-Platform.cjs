/**
 * Task configurations for the "Platform" capability.
 *
 * Contains:
 *   - resolve-address   — Resolve a universal address to a concrete URL.
 *   - file-transfer     — Download a file from a URL to operation staging.
 *   - send-result       — Read a staging file and write it to operation Output.
 *   - base64-encode     — Encode a staging file to a base64 string.
 *   - base64-decode     — Decode a base64 string to a staging file.
 */

const libFS = require('fs');
const libPath = require('path');
const libHTTP = require('http');
const libHTTPS = require('https');


/**
 * Get a named service from the Fable services map.
 */
function _getService(pTask, pTypeName)
{
	return pTask.fable.servicesMap[pTypeName]
		? Object.values(pTask.fable.servicesMap[pTypeName])[0]
		: null;
}


module.exports =
[
	// ── resolve-address ────────────────────────────────────────
	{
		Definition: require('./definitions/resolve-address.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpAddress = pResolvedSettings.Address;

			if (!tmpAddress || typeof tmpAddress !== 'string')
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { URL: '', BeaconID: '', BeaconName: '', Context: '', Path: '', Filename: '' },
					Log: ['Resolve Address: no address provided.']
				});
			}

			let tmpCoordinator = _getService(pTask, 'UltravisorBeaconCoordinator');
			if (!tmpCoordinator)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { URL: '', BeaconID: '', BeaconName: '', Context: '', Path: '', Filename: '' },
					Log: ['Resolve Address: BeaconCoordinator service not available.']
				});
			}

			let tmpResolved = tmpCoordinator.resolveUniversalAddress(tmpAddress);

			if (!tmpResolved)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { URL: '', BeaconID: '', BeaconName: '', Context: '', Path: '', Filename: '' },
					Log: [`Resolve Address: could not resolve "${tmpAddress}". Beacon may be offline or context not registered.`]
				});
			}

			let tmpOutputs = {
				URL: tmpResolved.URL,
				BeaconID: tmpResolved.BeaconID,
				BeaconName: tmpResolved.BeaconName,
				Context: tmpResolved.Context,
				Path: tmpResolved.Path,
				Filename: tmpResolved.Filename
			};

			let tmpStateWrites = {};
			if (pResolvedSettings.Destination)
			{
				tmpStateWrites[pResolvedSettings.Destination] = tmpOutputs;
			}

			pTask.log.info(`Resolve Address: ${tmpAddress} → ${tmpResolved.URL} (beacon: ${tmpResolved.BeaconName})`);

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: tmpOutputs,
				StateWrites: tmpStateWrites,
				Log: [
					`Resolved: ${tmpAddress}`,
					`URL: ${tmpResolved.URL}`,
					`Beacon: ${tmpResolved.BeaconName} (${tmpResolved.BeaconID})`,
					`Context: ${tmpResolved.Context}, Path: ${tmpResolved.Path}`
				]
			});
		}
	},


	// ── file-transfer ──────────────────────────────────────────
	{
		Definition: require('./definitions/file-transfer.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpSourceURL = pResolvedSettings.SourceURL;
			let tmpFilename = pResolvedSettings.Filename;

			if (!tmpSourceURL)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { LocalPath: '', BytesTransferred: 0, DurationMs: 0 },
					Log: ['File Transfer: no SourceURL provided.']
				});
			}

			if (!tmpFilename)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { LocalPath: '', BytesTransferred: 0, DurationMs: 0 },
					Log: ['File Transfer: no Filename provided.']
				});
			}

			let tmpOutputPath = libPath.join(pExecutionContext.StagingPath, tmpFilename);
			let tmpStartTime = Date.now();

			// Ensure staging directory exists
			try
			{
				libFS.mkdirSync(pExecutionContext.StagingPath, { recursive: true });
			}
			catch (pMkdirError)
			{
				// Already exists — fine
			}

			pTask.log.info(`File Transfer: downloading ${tmpSourceURL} → ${tmpFilename}`);

			let tmpLib = tmpSourceURL.startsWith('https') ? libHTTPS : libHTTP;
			let tmpRequest = tmpLib.get(tmpSourceURL, function (pResponse)
			{
				if (pResponse.statusCode >= 300 && pResponse.statusCode < 400 && pResponse.headers.location)
				{
					// Follow redirect
					let tmpRedirectLib = pResponse.headers.location.startsWith('https') ? libHTTPS : libHTTP;
					tmpRedirectLib.get(pResponse.headers.location, function (pRedirectResponse)
					{
						_pipeToFile(pRedirectResponse, tmpOutputPath, tmpStartTime, tmpFilename, pTask, fCallback);
					}).on('error', function (pRedirectError)
					{
						return fCallback(null, {
							EventToFire: 'Error',
							Outputs: { LocalPath: '', BytesTransferred: 0, DurationMs: Date.now() - tmpStartTime },
							Log: [`File Transfer: redirect failed: ${pRedirectError.message}`]
						});
					});
					return;
				}

				if (pResponse.statusCode !== 200)
				{
					return fCallback(null, {
						EventToFire: 'Error',
						Outputs: { LocalPath: '', BytesTransferred: 0, DurationMs: Date.now() - tmpStartTime },
						Log: [`File Transfer: HTTP ${pResponse.statusCode} for ${tmpSourceURL}`]
					});
				}

				_pipeToFile(pResponse, tmpOutputPath, tmpStartTime, tmpFilename, pTask, fCallback);
			});

			tmpRequest.on('error', function (pRequestError)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { LocalPath: '', BytesTransferred: 0, DurationMs: Date.now() - tmpStartTime },
					Log: [`File Transfer: request failed: ${pRequestError.message}`]
				});
			});

			// Set a 5-minute timeout on the request
			tmpRequest.setTimeout(300000, function ()
			{
				tmpRequest.destroy(new Error('File Transfer: download timed out after 5 minutes'));
			});
		}
	},


	// ── send-result ────────────────────────────────────────────
	{
		Definition: require('./definitions/send-result.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpFilePath = pTask.resolveFilePath(pResolvedSettings.FilePath, pExecutionContext.StagingPath);
			let tmpOutputKey = pResolvedSettings.OutputKey || 'ResultFile';
			let tmpStartTime = Date.now();

			if (!tmpFilePath || !libFS.existsSync(tmpFilePath))
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { BytesSent: 0, DurationMs: 0 },
					Log: [`Send Result: file not found: ${pResolvedSettings.FilePath}`]
				});
			}

			try
			{
				let tmpBuffer = libFS.readFileSync(tmpFilePath);
				let tmpDuration = Date.now() - tmpStartTime;

				// Write the buffer to the operation's Output object
				pExecutionContext.Output[tmpOutputKey] = tmpBuffer;

				pTask.log.info(`Send Result: ${tmpBuffer.length} bytes from ${pResolvedSettings.FilePath} → Output.${tmpOutputKey} (${tmpDuration}ms)`);

				return fCallback(null, {
					EventToFire: 'Complete',
					Outputs: { BytesSent: tmpBuffer.length, DurationMs: tmpDuration },
					Log: [
						`Read ${tmpBuffer.length} bytes from ${pResolvedSettings.FilePath}`,
						`Written to Output.${tmpOutputKey} (${tmpDuration}ms)`
					]
				});
			}
			catch (pReadError)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { BytesSent: 0, DurationMs: Date.now() - tmpStartTime },
					Log: [`Send Result: read failed: ${pReadError.message}`]
				});
			}
		}
	},


	// ── base64-encode ──────────────────────────────────────────
	{
		Definition: require('./definitions/base64-encode.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpFilePath = pTask.resolveFilePath(pResolvedSettings.FilePath, pExecutionContext.StagingPath);

			if (!tmpFilePath || !libFS.existsSync(tmpFilePath))
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { EncodedData: '', EncodedLength: 0, OriginalBytes: 0 },
					Log: [`Base64 Encode: file not found: ${pResolvedSettings.FilePath}`]
				});
			}

			try
			{
				let tmpBuffer = libFS.readFileSync(tmpFilePath);
				let tmpEncoded = tmpBuffer.toString('base64');

				let tmpOutputs = {
					EncodedData: tmpEncoded,
					EncodedLength: tmpEncoded.length,
					OriginalBytes: tmpBuffer.length
				};

				let tmpStateWrites = {};
				if (pResolvedSettings.Destination)
				{
					tmpStateWrites[pResolvedSettings.Destination] = tmpEncoded;
				}

				pTask.log.info(`Base64 Encode: ${tmpBuffer.length} bytes → ${tmpEncoded.length} chars from ${pResolvedSettings.FilePath}`);

				return fCallback(null, {
					EventToFire: 'Complete',
					Outputs: tmpOutputs,
					StateWrites: tmpStateWrites,
					Log: [`Encoded ${tmpBuffer.length} bytes → ${tmpEncoded.length} base64 chars`]
				});
			}
			catch (pReadError)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { EncodedData: '', EncodedLength: 0, OriginalBytes: 0 },
					Log: [`Base64 Encode: ${pReadError.message}`]
				});
			}
		}
	},


	// ── base64-decode ──────────────────────────────────────────
	{
		Definition: require('./definitions/base64-decode.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpSource = pResolvedSettings.Source;
			let tmpFilePath = pTask.resolveFilePath(pResolvedSettings.FilePath, pExecutionContext.StagingPath);

			if (!tmpSource)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { LocalPath: '', DecodedBytes: 0 },
					Log: ['Base64 Decode: no source data provided.']
				});
			}

			if (!tmpFilePath)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { LocalPath: '', DecodedBytes: 0 },
					Log: ['Base64 Decode: no output file path provided.']
				});
			}

			try
			{
				let tmpBuffer = Buffer.from(tmpSource, 'base64');

				// Ensure directory exists
				let tmpDir = libPath.dirname(tmpFilePath);
				libFS.mkdirSync(tmpDir, { recursive: true });

				libFS.writeFileSync(tmpFilePath, tmpBuffer);

				pTask.log.info(`Base64 Decode: ${tmpBuffer.length} bytes → ${pResolvedSettings.FilePath}`);

				return fCallback(null, {
					EventToFire: 'Complete',
					Outputs: { LocalPath: tmpFilePath, DecodedBytes: tmpBuffer.length },
					Log: [`Decoded ${tmpBuffer.length} bytes → ${pResolvedSettings.FilePath}`]
				});
			}
			catch (pDecodeError)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { LocalPath: '', DecodedBytes: 0 },
					Log: [`Base64 Decode: ${pDecodeError.message}`]
				});
			}
		}
	}
];


// ================================================================
// Internal helpers
// ================================================================

/**
 * Pipe an HTTP response stream to a local file and report results.
 */
function _pipeToFile(pResponse, pOutputPath, pStartTime, pFilename, pTask, fCallback)
{
	let tmpFileStream = libFS.createWriteStream(pOutputPath);
	let tmpBytes = 0;

	pResponse.on('data', function (pChunk)
	{
		tmpBytes += pChunk.length;
	});

	pResponse.pipe(tmpFileStream);

	tmpFileStream.on('finish', function ()
	{
		let tmpDuration = Date.now() - pStartTime;

		pTask.log.info(`File Transfer: ${pFilename} — ${tmpBytes} bytes in ${tmpDuration}ms`);

		return fCallback(null, {
			EventToFire: 'Complete',
			Outputs: { LocalPath: pOutputPath, BytesTransferred: tmpBytes, DurationMs: tmpDuration },
			Log: [
				`Downloaded: ${pFilename}`,
				`Size: ${tmpBytes} bytes`,
				`Duration: ${tmpDuration}ms`,
				`Saved to: ${pOutputPath}`
			]
		});
	});

	tmpFileStream.on('error', function (pWriteError)
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { LocalPath: '', BytesTransferred: 0, DurationMs: Date.now() - pStartTime },
			Log: [`File Transfer: write failed: ${pWriteError.message}`]
		});
	});
}
