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

/**
 * Get the LogNoisiness level (0-5) from the Fable instance attached to a task.
 * Used to gate verbose diagnostic logging in the platform tasks. The user
 * controls this via the RETOLD_LOG_NOISINESS environment variable, which the
 * stack launcher applies to both the retold-remote Fable and the Ultravisor
 * Pict instance at startup.
 */
function _getNoisiness(pTask)
{
	return (pTask && pTask.fable && pTask.fable.LogNoisiness) || 0;
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
					Outputs: { URL: '', BeaconID: '', BeaconName: '', Context: '', Path: '', Filename: '', LocalPath: '' },
					Log: [`Resolve Address: could not resolve "${tmpAddress}". Beacon may be offline or context not registered.`]
				});
			}

			let tmpOutputs = {
				URL: tmpResolved.URL,
				BeaconID: tmpResolved.BeaconID,
				BeaconName: tmpResolved.BeaconName,
				Context: tmpResolved.Context,
				Path: tmpResolved.Path,
				Filename: tmpResolved.Filename,
				Strategy: 'direct',
				DirectURL: '',
				ProxyURL: '',
				LocalPath: ''
			};

			// Helper: build a full URL from a beacon's bind address + context path + resource path
			let _buildDirectURL = function (pDirectBaseURL)
			{
				let tmpContextDef = tmpCoordinator.getBeacon(tmpResolved.BeaconID);
				let tmpCtx = tmpContextDef && tmpContextDef.Contexts ? tmpContextDef.Contexts[tmpResolved.Context] : null;
				let tmpContextPath = tmpCtx && tmpCtx.BaseURL ? tmpCtx.BaseURL : '/';
				if (!tmpContextPath.endsWith('/'))
				{
					tmpContextPath = tmpContextPath + '/';
				}
				// Strip protocol+host from BaseURL if it's absolute, keep just the path
				try
				{
					let tmpParsed = new URL(tmpContextPath);
					tmpContextPath = tmpParsed.pathname;
					if (!tmpContextPath.endsWith('/'))
					{
						tmpContextPath = tmpContextPath + '/';
					}
				}
				catch (pParseError)
				{
					// Already a relative path — use as-is
				}
				let tmpEncodedPath = tmpResolved.Path.split('/').map(encodeURIComponent).join('/');
				return pDirectBaseURL.replace(/\/$/, '') + tmpContextPath + tmpEncodedPath;
			};

			// Helper: compute the absolute path on the source beacon's filesystem
			// for the resolved resource. Returns null if the source beacon does
			// not have a BasePath registered for this context.
			let _computeSharedFsLocalPath = function ()
			{
				let tmpSourceBeacon = tmpCoordinator.getBeacon(tmpResolved.BeaconID);
				let tmpCtx = tmpSourceBeacon && tmpSourceBeacon.Contexts
					? tmpSourceBeacon.Contexts[tmpResolved.Context]
					: null;
				if (tmpCtx && tmpCtx.BasePath)
				{
					return libPath.join(tmpCtx.BasePath, tmpResolved.Path);
				}
				return null;
			};

			let tmpReachability = _getService(pTask, 'UltravisorBeaconReachability');
			let tmpNoisy = _getNoisiness(pTask);

			if (tmpNoisy >= 2)
			{
				pTask.log.info(`[ResolveAddress] entry: address=${tmpAddress} sourceBeacon=${tmpResolved.BeaconID} requestingBeacon=${pResolvedSettings.RequestingBeaconID || '(none)'} reachability=${tmpReachability ? 'present' : 'missing'}`);
			}

			// Resolve transfer strategy when a requesting beacon is specified
			let tmpRequestingBeaconID = pResolvedSettings.RequestingBeaconID;
			if (tmpRequestingBeaconID && tmpReachability)
			{
				if (tmpNoisy >= 2)
				{
					pTask.log.info(`[ResolveAddress] explicit RequestingBeaconID=${tmpRequestingBeaconID} provided — calling resolveStrategy directly.`);
				}
				let tmpStrategyResult = tmpReachability.resolveStrategy(tmpResolved.BeaconID, tmpRequestingBeaconID);
				tmpOutputs.Strategy = tmpStrategyResult.Strategy;

				if (tmpStrategyResult.Strategy === 'shared-fs')
				{
					// Both beacons see the same filesystem mount.  Look up the
					// source beacon's context BasePath and join it with the inner
					// resource path to get an absolute path that's also valid on
					// the requesting beacon (because they share the mount).
					let tmpAbsPath = _computeSharedFsLocalPath();
					if (tmpAbsPath)
					{
						tmpOutputs.LocalPath = tmpAbsPath;
						// URL is intentionally left as the original (relative) URL
						// — file-transfer will see LocalPath and short-circuit, so
						// the URL is never actually fetched.
					}
					else
					{
						// No BasePath available — fall back to direct so the
						// transfer still works via HTTP.
						pTask.log.warn(`Resolve Address: shared-fs strategy chosen but no BasePath available for context [${tmpResolved.Context}] on beacon [${tmpResolved.BeaconID}], falling back to direct.`);
						tmpOutputs.Strategy = 'direct';
					}
				}
				else if (tmpStrategyResult.Strategy === 'direct' && tmpStrategyResult.DirectURL)
				{
					tmpOutputs.DirectURL = _buildDirectURL(tmpStrategyResult.DirectURL);
					tmpOutputs.URL = tmpOutputs.DirectURL;
				}
				else if (tmpStrategyResult.Strategy === 'proxy')
				{
					// Proxy URL: Ultravisor's own endpoint serves the file
					tmpOutputs.ProxyURL = tmpResolved.URL;
					tmpOutputs.URL = tmpResolved.URL;
				}
				// 'local' strategy: URL stays as the context BaseURL (same host)
			}
			else if (tmpReachability)
			{
				// Auto-detect a shared-fs peer when no RequestingBeaconID was passed.
				// This is the common case for retold-remote: it dispatches a media
				// operation, the file lives on the retold-remote beacon, and an
				// orator-conversion beacon on the same host shares the mount. The
				// auto-detection finds the orator-conversion peer and lets us
				// short-circuit the file-transfer entirely.
				if (tmpNoisy >= 2)
				{
					pTask.log.info(`[ResolveAddress] no RequestingBeaconID — entering auto-detect path for source ${tmpResolved.BeaconID}`);
				}
				let tmpPeerInfo = tmpReachability.findSharedFsPeer(tmpResolved.BeaconID);
				if (tmpPeerInfo)
				{
					let tmpAbsPath = _computeSharedFsLocalPath();
					if (tmpAbsPath)
					{
						tmpOutputs.Strategy = 'shared-fs';
						tmpOutputs.LocalPath = tmpAbsPath;
						pTask.log.info(`Resolve Address: auto-detected shared-fs peer [${tmpPeerInfo.Peer.BeaconID}] for source [${tmpResolved.BeaconID}] via mount [${tmpPeerInfo.Mount.MountID}].`);
						if (tmpNoisy >= 2)
						{
							pTask.log.info(`[ResolveAddress] auto-detect SUCCESS: LocalPath=${tmpAbsPath} (peer=${tmpPeerInfo.Peer.BeaconID}, mount=${tmpPeerInfo.Mount.MountID})`);
						}
					}
					else if (tmpNoisy >= 2)
					{
						pTask.log.info(`[ResolveAddress] auto-detect found peer [${tmpPeerInfo.Peer.BeaconID}] but source beacon has no BasePath for context [${tmpResolved.Context}] — cannot use shared-fs.`);
					}
				}
				else if (tmpNoisy >= 2)
				{
					pTask.log.info(`[ResolveAddress] auto-detect found NO shared-fs peer for source ${tmpResolved.BeaconID} — falling through to default direct/proxy strategy.`);
				}
			}
			else if (tmpNoisy >= 2)
			{
				pTask.log.info(`[ResolveAddress] reachability service not available — skipping auto-detect, default strategy will be used.`);
			}

			// If the URL is still relative (no protocol), use the beacon's first
			// bind address to make it absolute so file-transfer can fetch it.
			if (tmpOutputs.URL && !tmpOutputs.URL.startsWith('http'))
			{
				let tmpBeaconDef = tmpCoordinator.getBeacon(tmpResolved.BeaconID);
				pTask.log.info(`Resolve Address: URL is relative, looking up BindAddresses for beacon ${tmpResolved.BeaconID}. getBeacon returned: ${tmpBeaconDef ? 'found' : 'null'}, BindAddresses: ${JSON.stringify(tmpBeaconDef && tmpBeaconDef.BindAddresses)}`);
				let tmpBindAddresses = tmpBeaconDef && tmpBeaconDef.BindAddresses ? tmpBeaconDef.BindAddresses : [];
				// Prefer non-loopback addresses
				let tmpBind = tmpBindAddresses.find(function (pB) { return pB.IP !== '127.0.0.1' && pB.IP !== '::1'; }) || tmpBindAddresses[0];
				if (tmpBind)
				{
					let tmpBaseURL = (tmpBind.Protocol || 'http') + '://' + tmpBind.IP + ':' + tmpBind.Port;
					pTask.log.info(`Resolve Address: using bind address ${tmpBaseURL}`);
					tmpOutputs.DirectURL = _buildDirectURL(tmpBaseURL);
					tmpOutputs.URL = tmpOutputs.DirectURL;
				}
				else
				{
					pTask.log.warn(`Resolve Address: no BindAddresses available for beacon ${tmpResolved.BeaconID} — URL will remain relative`);
				}
			}

			let tmpStateWrites = {};
			if (pResolvedSettings.Destination)
			{
				tmpStateWrites[pResolvedSettings.Destination] = tmpOutputs;
			}

			let tmpResolvedDest = tmpOutputs.LocalPath || tmpOutputs.URL;
			pTask.log.info(`Resolve Address: ${tmpAddress} → ${tmpResolvedDest} [${tmpOutputs.Strategy}] (beacon: ${tmpResolved.BeaconName})`);

			let tmpLogLines = [
				`Resolved: ${tmpAddress}`,
				`URL: ${tmpOutputs.URL}`,
				`Strategy: ${tmpOutputs.Strategy}`,
				`Beacon: ${tmpResolved.BeaconName} (${tmpResolved.BeaconID})`,
				`Context: ${tmpResolved.Context}, Path: ${tmpResolved.Path}`
			];
			if (tmpOutputs.LocalPath)
			{
				tmpLogLines.push(`LocalPath: ${tmpOutputs.LocalPath} (shared filesystem — no transfer needed)`);
			}

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: tmpOutputs,
				StateWrites: tmpStateWrites,
				Log: tmpLogLines
			});
		}
	},


	// ── file-transfer ──────────────────────────────────────────
	{
		Definition: require('./definitions/file-transfer.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpSourceURL = pResolvedSettings.SourceURL;
			let tmpSourceLocalPath = pResolvedSettings.SourceLocalPath;
			let tmpFilename = pResolvedSettings.Filename;
			let tmpNoisy = _getNoisiness(pTask);

			if (tmpNoisy >= 2)
			{
				pTask.log.info(`[FileTransfer] entry: SourceURL=${tmpSourceURL ? tmpSourceURL.substring(0, 80) : '(none)'} SourceLocalPath=${tmpSourceLocalPath || '(none)'} Filename=${tmpFilename || '(none)'}`);
			}

			// Shared-filesystem fast path: if the source beacon and the requesting
			// beacon both report the same MountID, resolve-address will populate
			// SourceLocalPath with the absolute on-disk path.  Both beacons see the
			// same file at the same path because they share the mount, so we hand
			// it back as the LocalPath without copying anything.  This is the
			// difference between "instant" and "374 MB download to staging" on a
			// stack-mode deployment where retold-remote and orator-conversion live
			// in the same container.
			if (tmpSourceLocalPath)
			{
				if (libFS.existsSync(tmpSourceLocalPath))
				{
					let tmpStat;
					try
					{
						tmpStat = libFS.statSync(tmpSourceLocalPath);
					}
					catch (pStatError)
					{
						tmpStat = null;
					}
					pTask.log.info(`File Transfer: shared-fs hit, using ${tmpSourceLocalPath} directly (${tmpStat ? tmpStat.size : '?'} bytes, no copy).`);
					return fCallback(null, {
						EventToFire: 'Complete',
						Outputs: {
							LocalPath: tmpSourceLocalPath,
							BytesTransferred: 0,
							DurationMs: 0,
							Strategy: 'shared-fs'
						},
						Log: [
							`Shared filesystem detected — no transfer needed.`,
							`Source path: ${tmpSourceLocalPath}`,
							`Bytes transferred: 0 (zero-copy)`
						]
					});
				}
				// Path was provided but doesn't exist on this beacon — log and fall
				// through to the HTTP path so we still satisfy the request.
				pTask.log.warn(`File Transfer: SourceLocalPath [${tmpSourceLocalPath}] does not exist on this beacon, falling back to HTTP transfer.`);
				if (tmpNoisy >= 2)
				{
					pTask.log.info(`[FileTransfer] SourceLocalPath was set but file is missing on this beacon — the requesting beacon doesn't actually share this filesystem at the expected path.`);
				}
			}
			else if (tmpNoisy >= 2)
			{
				pTask.log.info(`[FileTransfer] no SourceLocalPath in settings — running standard HTTP download path. (Either resolve-address chose 'direct'/'proxy', or the operation graph isn't wiring resolve.LocalPath → transfer.SourceLocalPath.)`);
			}

			if (!tmpSourceURL)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { LocalPath: '', BytesTransferred: 0, DurationMs: 0, Strategy: '' },
					Log: ['File Transfer: no SourceURL provided.']
				});
			}

			if (!tmpFilename)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { LocalPath: '', BytesTransferred: 0, DurationMs: 0, Strategy: '' },
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

			let tmpTimeoutMs = parseInt(pResolvedSettings.TimeoutMs, 10) || 300000;

			pTask.log.info(`File Transfer: downloading ${tmpSourceURL} → ${tmpFilename} (timeout ${Math.round(tmpTimeoutMs / 1000)}s)`);

			// Validate URL before attempting request
			if (!tmpSourceURL.startsWith('http://') && !tmpSourceURL.startsWith('https://'))
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { LocalPath: '', BytesTransferred: 0, DurationMs: 0 },
					Log: [`File Transfer: invalid URL (no protocol): ${tmpSourceURL}`]
				});
			}

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

			// Set timeout on the request (configurable via TimeoutMs setting, default 5 min)
			tmpRequest.setTimeout(tmpTimeoutMs, function ()
			{
				tmpRequest.destroy(new Error(`File Transfer: download timed out after ${Math.round(tmpTimeoutMs / 1000)} seconds`));
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
				let tmpStat = libFS.statSync(tmpFilePath);
				let tmpDuration = Date.now() - tmpStartTime;

				pTask.log.info(`Send Result: ${tmpStat.size} bytes ready at ${tmpFilePath} (${tmpDuration}ms)`);

				// Record the staging file path so the trigger endpoint
				// can stream it as binary.  No encoding — the file stays
				// on disk until the HTTP response streams it out.
				return fCallback(null, {
					EventToFire: 'Complete',
					Outputs: { StagingFilePath: tmpFilePath, BytesSent: tmpStat.size, DurationMs: tmpDuration },
					Log: [
						`Result file: ${pResolvedSettings.FilePath} (${tmpStat.size} bytes)`,
						`Staging path: ${tmpFilePath}`
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
			Outputs: { LocalPath: pOutputPath, BytesTransferred: tmpBytes, DurationMs: tmpDuration, Strategy: 'http' },
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
