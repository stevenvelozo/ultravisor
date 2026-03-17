/**
 * File System task configurations for Ultravisor.
 *
 * Contains task types for reading, writing, listing, and copying files:
 *   read-file, write-file, read-json, write-json, list-files, copy-file, read-file-buffered
 *
 * Each entry defines a task type as a config object with:
 *   Definition  {object}   - Port schema, metadata, default settings
 *   Execute     {function} - Runtime logic: function(pTask, pSettings, pContext, fCb, fFireEvent)
 */

const libFS = require('fs');
const libPath = require('path');

/**
 * Recursively sort all object keys alphabetically (deep).
 */
function _sortObjectKeys(pObj)
{
	if (Array.isArray(pObj)) { return pObj.map(_sortObjectKeys); }
	if (pObj !== null && typeof(pObj) === 'object')
	{
		let tmpSorted = {};
		Object.keys(pObj).sort().forEach(function(pKey) { tmpSorted[pKey] = _sortObjectKeys(pObj[pKey]); });
		return tmpSorted;
	}
	return pObj;
}


// ═══════════════════════════════════════════════════════════════════
//  FILE SYSTEM TASK CONFIGS
// ═══════════════════════════════════════════════════════════════════

module.exports =
[
	// ── read-file ──────────────────────────────────────────────
	{
		Definition: require('./definitions/read-file.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpFilePath = pResolvedSettings.FilePath || '';
			let tmpEncoding = pResolvedSettings.Encoding || 'utf8';
			let tmpMaxBytes = parseInt(pResolvedSettings.MaxBytes, 10) || 0;

			if (!tmpFilePath)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['ReadFile: no FilePath specified.'] });
			}

			tmpFilePath = pTask.resolveFilePath(tmpFilePath, pExecutionContext.StagingPath);

			try
			{
				let tmpContent;

				if (tmpMaxBytes > 0)
				{
					let tmpStat = libFS.statSync(tmpFilePath);
					if (tmpStat.size > tmpMaxBytes)
					{
						let tmpFd = libFS.openSync(tmpFilePath, 'r');
						let tmpBuffer = Buffer.alloc(tmpMaxBytes);
						libFS.readSync(tmpFd, tmpBuffer, 0, tmpMaxBytes, 0);
						libFS.closeSync(tmpFd);
						tmpContent = tmpBuffer.toString(tmpEncoding);
					}
					else
					{
						tmpContent = libFS.readFileSync(tmpFilePath, tmpEncoding);
					}
				}
				else
				{
					tmpContent = libFS.readFileSync(tmpFilePath, tmpEncoding);
				}

				let tmpStateWrites = {};
				if (pResolvedSettings.OutputAddress)
				{
					tmpStateWrites[pResolvedSettings.OutputAddress] = tmpContent;
				}

				return fCallback(null, {
					EventToFire: 'ReadComplete',
					Outputs: { FileContent: tmpContent, BytesRead: Buffer.byteLength(tmpContent, tmpEncoding), FileName: libPath.basename(tmpFilePath) },
					StateWrites: tmpStateWrites,
					Log: [`ReadFile: read ${Buffer.byteLength(tmpContent, tmpEncoding)} bytes from ${tmpFilePath}`]
				});
			}
			catch (pError)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`ReadFile: failed to read ${tmpFilePath}: ${pError.message}`] });
			}
		}
	},

	// ── write-file ─────────────────────────────────────────────
	{
		Definition: require('./definitions/write-file.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpFileLocation = pResolvedSettings.FilePath || '';
			let tmpContent = pResolvedSettings.Content;
			let tmpEncoding = pResolvedSettings.Encoding || 'utf8';

			if (!tmpFileLocation)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['WriteFile: no FilePath specified.'] });
			}

			if (tmpContent === undefined || tmpContent === null) { tmpContent = ''; }
			if (typeof(tmpContent) !== 'string') { tmpContent = JSON.stringify(tmpContent, null, '\t'); }

			// Apply line ending conversion
			let tmpLineEnding = pResolvedSettings.LineEnding || '';
			if (tmpLineEnding === 'crlf')
			{
				tmpContent = tmpContent.replace(/(?<!\r)\n/g, '\r\n');
			}
			else if (tmpLineEnding === 'lf')
			{
				tmpContent = tmpContent.replace(/\r\n/g, '\n');
			}

			let tmpFilePath = pTask.resolveFilePath(tmpFileLocation, pExecutionContext.StagingPath);

			try
			{
				let tmpDir = libPath.dirname(tmpFilePath);
				if (!libFS.existsSync(tmpDir)) { libFS.mkdirSync(tmpDir, { recursive: true }); }

				if (pResolvedSettings.Append)
				{
					libFS.appendFileSync(tmpFilePath, tmpContent, tmpEncoding);
				}
				else
				{
					libFS.writeFileSync(tmpFilePath, tmpContent, tmpEncoding);
				}

				let tmpBytesWritten = Buffer.byteLength(tmpContent, tmpEncoding);

				return fCallback(null, {
					EventToFire: 'WriteComplete',
					Outputs: {
						FileLocation: tmpFileLocation,
						FileName: libPath.basename(tmpFilePath),
						FilePath: tmpFilePath,
						BytesWritten: tmpBytesWritten
					},
					Log: [`WriteFile: wrote ${tmpBytesWritten} bytes to ${tmpFilePath}`]
				});
			}
			catch (pError)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`WriteFile: failed to write ${tmpFilePath}: ${pError.message}`] });
			}
		}
	},

	// ── read-json ──────────────────────────────────────────────
	{
		Definition: require('./definitions/read-json.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpFilePath = pResolvedSettings.FilePath || '';

			if (!tmpFilePath)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['ReadJSON: no FilePath specified.'] });
			}

			tmpFilePath = pTask.resolveFilePath(tmpFilePath, pExecutionContext.StagingPath);

			try
			{
				let tmpRawContent = libFS.readFileSync(tmpFilePath, 'utf8');
				let tmpData = JSON.parse(tmpRawContent);
				let tmpStateWrites = {};

				if (pResolvedSettings.Destination)
				{
					tmpStateWrites[pResolvedSettings.Destination] = tmpData;
				}

				return fCallback(null, {
					EventToFire: 'Complete',
					Outputs: { Data: tmpData },
					StateWrites: tmpStateWrites,
					Log: [`ReadJSON: parsed ${tmpRawContent.length} bytes from ${tmpFilePath}`]
				});
			}
			catch (pError)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`ReadJSON: failed: ${pError.message}`] });
			}
		}
	},

	// ── write-json ─────────────────────────────────────────────
	{
		Definition: require('./definitions/write-json.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpFileLocation = pResolvedSettings.FilePath || '';

			if (!tmpFileLocation)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['WriteJSON: no FilePath specified.'] });
			}

			let tmpFilePath = pTask.resolveFilePath(tmpFileLocation, pExecutionContext.StagingPath);

			let tmpDataAddress = pResolvedSettings.DataAddress || '';
			let tmpData = null;
			if (tmpDataAddress && pExecutionContext.StateManager)
			{
				tmpData = pExecutionContext.StateManager.resolveAddress(tmpDataAddress, pExecutionContext, pExecutionContext.NodeHash);
			}

			if (tmpData === undefined || tmpData === null)
			{
				tmpData = {};
			}

			try
			{
				if (pResolvedSettings.SortKeys)
				{
					tmpData = _sortObjectKeys(tmpData);
				}

				let tmpContent;
				if (pResolvedSettings.PrettyFormat === false)
				{
					tmpContent = JSON.stringify(tmpData);
				}
				else
				{
					let tmpIndent;
					if (pResolvedSettings.IndentType === 'space')
					{
						tmpIndent = ' '.repeat(pResolvedSettings.IndentCount || 2);
					}
					else
					{
						tmpIndent = '\t'.repeat(pResolvedSettings.IndentCount || 1);
					}
					tmpContent = JSON.stringify(tmpData, null, tmpIndent);
				}

				let tmpDir = libPath.dirname(tmpFilePath);
				if (!libFS.existsSync(tmpDir)) { libFS.mkdirSync(tmpDir, { recursive: true }); }
				libFS.writeFileSync(tmpFilePath, tmpContent, 'utf8');

				return fCallback(null, {
					EventToFire: 'Done',
					Outputs: {
						FileLocation: tmpFileLocation,
						FileName: libPath.basename(tmpFilePath),
						FilePath: tmpFilePath,
						BytesWritten: Buffer.byteLength(tmpContent)
					},
					Log: [`WriteJSON: wrote ${Buffer.byteLength(tmpContent)} bytes to ${tmpFilePath}`]
				});
			}
			catch (pError)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`WriteJSON: failed: ${pError.message}`] });
			}
		}
	},

	// ── list-files ─────────────────────────────────────────────
	{
		Definition: require('./definitions/list-files.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpFolder = pResolvedSettings.Folder || '';

			if (!tmpFolder)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['ListFiles: no Folder specified.'] });
			}

			tmpFolder = pTask.resolveFilePath(tmpFolder, pExecutionContext.StagingPath);

			function _listFilesRecursive(pDir, pPattern)
			{
				let tmpResults = [];
				let tmpEntries = libFS.readdirSync(pDir);

				for (let i = 0; i < tmpEntries.length; i++)
				{
					let tmpFullPath = libPath.join(pDir, tmpEntries[i]);
					let tmpStat = libFS.statSync(tmpFullPath);

					if (tmpStat.isDirectory())
					{
						let tmpSubFiles = _listFilesRecursive(tmpFullPath, pPattern);
						tmpResults = tmpResults.concat(tmpSubFiles);
						// Include the directory entry itself as a relative path
						let tmpRelative = libPath.relative(tmpFolder, tmpFullPath);
						tmpResults.push(tmpRelative);
					}
					else
					{
						let tmpRelative = libPath.relative(tmpFolder, tmpFullPath);
						tmpResults.push(tmpRelative);
					}
				}

				return tmpResults;
			}

			try
			{
				let tmpFiles;

				if (pResolvedSettings.Recursive)
				{
					tmpFiles = _listFilesRecursive(tmpFolder);
				}
				else
				{
					tmpFiles = libFS.readdirSync(tmpFolder);
				}

				let tmpPattern = pResolvedSettings.Pattern || '*';

				// Simple glob: convert * to regex
				if (tmpPattern && tmpPattern !== '*')
				{
					let tmpRegex = new RegExp('^' + tmpPattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
					tmpFiles = tmpFiles.filter(function (pFile)
					{
						// For recursive results, match against the basename
						let tmpBaseName = libPath.basename(pFile);
						return tmpRegex.test(tmpBaseName);
					});
				}

				if (!pResolvedSettings.IncludeDirectories)
				{
					tmpFiles = tmpFiles.filter(function (pFile)
					{
						let tmpFullPath = libPath.join(tmpFolder, pFile);
						try
						{
							return libFS.statSync(tmpFullPath).isFile();
						}
						catch (pErr)
						{
							return false;
						}
					});
				}

				let tmpStateWrites = {};
				if (pResolvedSettings.Destination)
				{
					tmpStateWrites[pResolvedSettings.Destination] = tmpFiles;
				}

				return fCallback(null, {
					EventToFire: 'Complete',
					Outputs: { Files: tmpFiles, FileCount: tmpFiles.length },
					StateWrites: tmpStateWrites,
					Log: [`ListFiles: found ${tmpFiles.length} files in ${tmpFolder}`]
				});
			}
			catch (pError)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`ListFiles: failed: ${pError.message}`] });
			}
		}
	},

	// ── copy-file ──────────────────────────────────────────────
	{
		Definition: require('./definitions/copy-file.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpSource = pResolvedSettings.Source || '';
			let tmpTargetLocation = pResolvedSettings.TargetFile || '';

			if (!tmpSource || !tmpTargetLocation)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['CopyFile: Source and TargetFile are required.'] });
			}

			tmpSource = pTask.resolveFilePath(tmpSource, pExecutionContext.StagingPath);
			let tmpTarget = pTask.resolveFilePath(tmpTargetLocation, pExecutionContext.StagingPath);

			try
			{
				if (pResolvedSettings.Overwrite === false && libFS.existsSync(tmpTarget))
				{
					return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`CopyFile: target file already exists and Overwrite is false: ${tmpTarget}`] });
				}

				let tmpDir = libPath.dirname(tmpTarget);
				if (!libFS.existsSync(tmpDir)) { libFS.mkdirSync(tmpDir, { recursive: true }); }
				libFS.copyFileSync(tmpSource, tmpTarget);

				let tmpStat = libFS.statSync(tmpTarget);

				return fCallback(null, {
					EventToFire: 'Done',
					Outputs: {
						FileLocation: tmpTargetLocation,
						FileName: libPath.basename(tmpTarget),
						FilePath: tmpTarget,
						BytesCopied: tmpStat.size
					},
					Log: [`CopyFile: copied ${tmpSource} -> ${tmpTarget}`]
				});
			}
			catch (pError)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`CopyFile: failed: ${pError.message}`] });
			}
		}
	},

	// ── read-file-buffered ────────────────────────────────────
	{
		Definition: require('./definitions/read-file-buffered.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpFilePath = pResolvedSettings.FilePath || '';
			let tmpEncoding = pResolvedSettings.Encoding || 'utf8';
			let tmpMaxBufferSize = parseInt(pResolvedSettings.MaxBufferSize, 10) || 65536;
			let tmpSplitChar = pResolvedSettings.SplitCharacter;
			let tmpByteOffset = parseInt(pResolvedSettings.ByteOffset, 10) || 0;

			if (tmpSplitChar === undefined || tmpSplitChar === null)
			{
				tmpSplitChar = '\n';
			}

			if (!tmpFilePath)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['ReadFileBuffered: no FilePath specified.'] });
			}

			tmpFilePath = pTask.resolveFilePath(tmpFilePath, pExecutionContext.StagingPath);

			try
			{
				let tmpStat = libFS.statSync(tmpFilePath);
				let tmpTotalSize = tmpStat.size;
				let tmpRemainingBytes = tmpTotalSize - tmpByteOffset;

				if (tmpRemainingBytes <= 0)
				{
					return fCallback(null, {
						EventToFire: 'ReadComplete',
						Outputs: { FileContent: '', BytesRead: 0, ByteOffset: tmpByteOffset, IsComplete: true, FileName: libPath.basename(tmpFilePath), TotalFileSize: tmpTotalSize },
						Log: ['ReadFileBuffered: already at end of file.']
					});
				}

				let tmpReadSize = Math.min(tmpMaxBufferSize, tmpRemainingBytes);
				let tmpBuffer = Buffer.alloc(tmpReadSize);
				let tmpFd = libFS.openSync(tmpFilePath, 'r');
				let tmpActualBytesRead = libFS.readSync(tmpFd, tmpBuffer, 0, tmpReadSize, tmpByteOffset);
				libFS.closeSync(tmpFd);

				let tmpContent = tmpBuffer.slice(0, tmpActualBytesRead).toString(tmpEncoding);
				let tmpIsComplete = (tmpByteOffset + tmpActualBytesRead) >= tmpTotalSize;
				let tmpNewOffset = tmpByteOffset + tmpActualBytesRead;

				// If not at EOF and we have a split character, find the last occurrence
				if (!tmpIsComplete && tmpSplitChar && tmpSplitChar.length > 0)
				{
					let tmpLastSplitIndex = tmpContent.lastIndexOf(tmpSplitChar);

					if (tmpLastSplitIndex > 0)
					{
						// Keep content up to and including the split character
						tmpContent = tmpContent.substring(0, tmpLastSplitIndex + tmpSplitChar.length);
						tmpNewOffset = tmpByteOffset + Buffer.byteLength(tmpContent, tmpEncoding);
					}
				}

				let tmpBytesRead = Buffer.byteLength(tmpContent, tmpEncoding);

				return fCallback(null, {
					EventToFire: 'ReadComplete',
					Outputs: {
						FileContent: tmpContent,
						BytesRead: tmpBytesRead,
						ByteOffset: tmpNewOffset,
						IsComplete: tmpIsComplete,
						FileName: libPath.basename(tmpFilePath),
						TotalFileSize: tmpTotalSize
					},
					Log: [`ReadFileBuffered: read ${tmpBytesRead} bytes from offset ${tmpByteOffset} (${tmpIsComplete ? 'complete' : 'more data available'})`]
				});
			}
			catch (pError)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`ReadFileBuffered: failed: ${pError.message}`] });
			}
		}
	}
];
