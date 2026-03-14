/**
 * File System task configurations for Ultravisor.
 *
 * Contains task types for reading, writing, listing, and copying files:
 *   read-file, write-file, read-json, write-json, list-files, copy-file
 *
 * Each entry defines a task type as a config object with:
 *   Definition  {object}   - Port schema, metadata, default settings
 *   Execute     {function} - Runtime logic: function(pTask, pSettings, pContext, fCb, fFireEvent)
 */

const libFS = require('fs');
const libPath = require('path');


// ═══════════════════════════════════════════════════════════════════
//  FILE SYSTEM TASK CONFIGS
// ═══════════════════════════════════════════════════════════════════

module.exports =
[
	// ── read-file ──────────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'read-file',
			Type: 'read-file',
			Name: 'Read File',
			Description: 'Reads a file from disk into state.',
			Category: 'file-io',
			Capability: 'File System',
			Action: 'Read',
			Tier: 'Platform',
			EventInputs: [{ Name: 'BeginRead', Description: 'Triggers the file read' }],
			EventOutputs: [
				{ Name: 'ReadComplete', Description: 'Fires when file is read successfully' },
				{ Name: 'Error', Description: 'Fires on read failure', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'FilePath', DataType: 'String', Required: true, Description: 'Path to the file to read' },
				{ Name: 'Encoding', DataType: 'String', Required: false, Default: 'utf8', Description: 'File encoding' }
			],
			StateOutputs: [
				{ Name: 'FileContent', DataType: 'String', Description: 'Contents of the file' },
				{ Name: 'BytesRead', DataType: 'Number', Description: 'Number of bytes read' }
			],
			DefaultSettings: { FilePath: '', Encoding: 'utf8' }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpFilePath = pResolvedSettings.FilePath || '';
			let tmpEncoding = pResolvedSettings.Encoding || 'utf8';

			if (!tmpFilePath)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['ReadFile: no FilePath specified.'] });
			}

			tmpFilePath = pTask.resolveFilePath(tmpFilePath, pExecutionContext.StagingPath);

			try
			{
				let tmpContent = libFS.readFileSync(tmpFilePath, tmpEncoding);
				let tmpStateWrites = {};
				if (pResolvedSettings.OutputAddress)
				{
					tmpStateWrites[pResolvedSettings.OutputAddress] = tmpContent;
				}

				return fCallback(null, {
					EventToFire: 'ReadComplete',
					Outputs: { FileContent: tmpContent, BytesRead: Buffer.byteLength(tmpContent, tmpEncoding) },
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
		Definition:
		{
			Hash: 'write-file',
			Type: 'write-file',
			Name: 'Write File',
			Description: 'Writes content to a file on disk.',
			Category: 'file-io',
			Capability: 'File System',
			Action: 'Write',
			Tier: 'Platform',
			EventInputs: [{ Name: 'BeginWrite', Description: 'Triggers the file write' }],
			EventOutputs: [
				{ Name: 'WriteComplete', Description: 'Fires when file is written successfully' },
				{ Name: 'Error', Description: 'Fires on write failure', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'FilePath', DataType: 'String', Required: true, Description: 'Path to the output file' },
				{ Name: 'Content', DataType: 'String', Required: true, Description: 'Content to write' },
				{ Name: 'Encoding', DataType: 'String', Required: false, Default: 'utf8', Description: 'File encoding' }
			],
			StateOutputs: [
				{ Name: 'FileLocation', DataType: 'String', Description: 'The path the file was referenced at (may be relative)' },
				{ Name: 'FileName', DataType: 'String', Description: 'The name of the file only (no directory)' },
				{ Name: 'FilePath', DataType: 'String', Description: 'The fully resolved absolute path of the file' },
				{ Name: 'BytesWritten', DataType: 'Number', Description: 'Number of bytes written' }
			],
			DefaultSettings: { FilePath: '', Content: '', Encoding: 'utf8' }
		},
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

			let tmpFilePath = pTask.resolveFilePath(tmpFileLocation, pExecutionContext.StagingPath);

			try
			{
				let tmpDir = libPath.dirname(tmpFilePath);
				if (!libFS.existsSync(tmpDir)) { libFS.mkdirSync(tmpDir, { recursive: true }); }
				libFS.writeFileSync(tmpFilePath, tmpContent, tmpEncoding);
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
		Definition:
		{
			Hash: 'read-json',
			Type: 'read-json',
			Name: 'Read JSON',
			Description: 'Reads a JSON file from disk and parses it into state.',
			Category: 'file-io',
			Capability: 'File System',
			Action: 'ReadJSON',
			Tier: 'Platform',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Complete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'File', DataType: 'String', Required: true, Description: 'Path to the JSON file' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store the parsed data' }
			],
			StateOutputs: [
				{ Name: 'Data', DataType: 'Object', Description: 'Parsed JSON data' }
			],
			DefaultSettings: { File: '', Destination: '' }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpFilePath = pResolvedSettings.File || '';

			if (!tmpFilePath)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['ReadJSON: no File specified.'] });
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
		Definition:
		{
			Hash: 'write-json',
			Type: 'write-json',
			Name: 'Write JSON',
			Description: 'Writes a JSON object to a file on disk.',
			Category: 'file-io',
			Capability: 'File System',
			Action: 'WriteJSON',
			Tier: 'Platform',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Done' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'File', DataType: 'String', Required: true, Description: 'Path to the output JSON file' },
				{ Name: 'Address', DataType: 'String', Required: false, Description: 'State address of the data to write' }
			],
			StateOutputs: [
				{ Name: 'FileLocation', DataType: 'String', Description: 'The path the file was referenced at (may be relative)' },
				{ Name: 'FileName', DataType: 'String', Description: 'The name of the file only (no directory)' },
				{ Name: 'FilePath', DataType: 'String', Description: 'The fully resolved absolute path of the file' },
				{ Name: 'BytesWritten', DataType: 'Number', Description: 'Number of bytes written' }
			],
			DefaultSettings: { File: '', Address: '' }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpFileLocation = pResolvedSettings.File || '';

			if (!tmpFileLocation)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['WriteJSON: no File specified.'] });
			}

			let tmpFilePath = pTask.resolveFilePath(tmpFileLocation, pExecutionContext.StagingPath);

			let tmpData = null;
			if (pResolvedSettings.Address && pExecutionContext.StateManager)
			{
				tmpData = pExecutionContext.StateManager.resolveAddress(pResolvedSettings.Address, pExecutionContext, pExecutionContext.NodeHash);
			}

			if (tmpData === undefined || tmpData === null)
			{
				tmpData = {};
			}

			try
			{
				let tmpContent = JSON.stringify(tmpData, null, '\t');
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
		Definition:
		{
			Hash: 'list-files',
			Type: 'list-files',
			Name: 'List Files',
			Description: 'Lists files in a directory with optional glob pattern filtering.',
			Category: 'file-io',
			Capability: 'File System',
			Action: 'List',
			Tier: 'Platform',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Complete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'Folder', DataType: 'String', Required: true, Description: 'Directory path to list' },
				{ Name: 'Pattern', DataType: 'String', Required: false, Description: 'Glob-style pattern filter (e.g. *.txt)' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store file list' }
			],
			StateOutputs: [
				{ Name: 'Files', DataType: 'Array', Description: 'Array of file names' }
			],
			DefaultSettings: { Folder: '', Pattern: '*', Destination: '' }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpFolder = pResolvedSettings.Folder || '';

			if (!tmpFolder)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: ['ListFiles: no Folder specified.'] });
			}

			tmpFolder = pTask.resolveFilePath(tmpFolder, pExecutionContext.StagingPath);

			try
			{
				let tmpFiles = libFS.readdirSync(tmpFolder);
				let tmpPattern = pResolvedSettings.Pattern || '*';

				// Simple glob: convert * to regex
				if (tmpPattern && tmpPattern !== '*')
				{
					let tmpRegex = new RegExp('^' + tmpPattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
					tmpFiles = tmpFiles.filter(function (pFile) { return tmpRegex.test(pFile); });
				}

				let tmpStateWrites = {};
				if (pResolvedSettings.Destination)
				{
					tmpStateWrites[pResolvedSettings.Destination] = tmpFiles;
				}

				return fCallback(null, {
					EventToFire: 'Complete',
					Outputs: { Files: tmpFiles },
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
		Definition:
		{
			Hash: 'copy-file',
			Type: 'copy-file',
			Name: 'Copy File',
			Description: 'Copies a file from source to target path.',
			Category: 'file-io',
			Capability: 'File System',
			Action: 'Copy',
			Tier: 'Platform',
			EventInputs: [{ Name: 'Trigger' }],
			EventOutputs: [
				{ Name: 'Done' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'Source', DataType: 'String', Required: true, Description: 'Source file path' },
				{ Name: 'TargetFile', DataType: 'String', Required: true, Description: 'Target file path' }
			],
			StateOutputs: [
				{ Name: 'FileLocation', DataType: 'String', Description: 'The target path the file was referenced at (may be relative)' },
				{ Name: 'FileName', DataType: 'String', Description: 'The name of the target file only (no directory)' },
				{ Name: 'FilePath', DataType: 'String', Description: 'The fully resolved absolute path of the target file' }
			],
			DefaultSettings: { Source: '', TargetFile: '' }
		},
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
				let tmpDir = libPath.dirname(tmpTarget);
				if (!libFS.existsSync(tmpDir)) { libFS.mkdirSync(tmpDir, { recursive: true }); }
				libFS.copyFileSync(tmpSource, tmpTarget);

				return fCallback(null, {
					EventToFire: 'Done',
					Outputs: {
						FileLocation: tmpTargetLocation,
						FileName: libPath.basename(tmpTarget),
						FilePath: tmpTarget
					},
					Log: [`CopyFile: copied ${tmpSource} -> ${tmpTarget}`]
				});
			}
			catch (pError)
			{
				return fCallback(null, { EventToFire: 'Error', Outputs: {}, Log: [`CopyFile: failed: ${pError.message}`] });
			}
		}
	}
];
