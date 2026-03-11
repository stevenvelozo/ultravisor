const libUltravisorTaskType = require('../Ultravisor-TaskType-Base.cjs');
const libFS = require('fs');

/**
 * Read File task type.
 *
 * Reads a file from disk into state. The file path can be absolute or
 * relative to the operation's staging folder.
 */
class UltravisorTaskTypeReadFile extends libUltravisorTaskType
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	get definition()
	{
		return {
			Hash: 'read-file',
			Name: 'Read File',
			Description: 'Reads a file from disk into state.',
			Category: 'file-io',
			Capability: 'File System',
			Action: 'Read',
			Tier: 'Platform',

			EventInputs:
			[
				{ Name: 'BeginRead', Description: 'Triggers the file read' }
			],
			EventOutputs:
			[
				{ Name: 'ReadComplete', Description: 'Fires when file is read successfully' },
				{ Name: 'Error', Description: 'Fires on read failure', IsError: true }
			],
			SettingsInputs:
			[
				{ Name: 'FilePath', DataType: 'String', Required: true, Description: 'Path to the file to read' },
				{ Name: 'Encoding', DataType: 'String', Required: false, Default: 'utf8', Description: 'File encoding' }
			],
			StateOutputs:
			[
				{ Name: 'FileContent', DataType: 'String', Description: 'Contents of the file' },
				{ Name: 'BytesRead', DataType: 'Number', Description: 'Number of bytes read' }
			],

			DefaultSettings:
			{
				FilePath: '',
				Encoding: 'utf8'
			}
		};
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		let tmpFilePath = pResolvedSettings.FilePath || '';
		let tmpEncoding = pResolvedSettings.Encoding || 'utf8';

		if (!tmpFilePath)
		{
			return fCallback(null, {
				EventToFire: 'Error',
				Outputs: {},
				Log: ['ReadFile: no FilePath specified.']
			});
		}

		// Resolve relative paths against the staging folder
		tmpFilePath = this.resolveFilePath(tmpFilePath, pExecutionContext.StagingPath);

		try
		{
			let tmpContent = libFS.readFileSync(tmpFilePath, tmpEncoding);

			// Write output to the configured address if specified
			let tmpStateWrites = {};
			if (pResolvedSettings.OutputAddress)
			{
				tmpStateWrites[pResolvedSettings.OutputAddress] = tmpContent;
			}

			return fCallback(null, {
				EventToFire: 'ReadComplete',
				Outputs:
				{
					FileContent: tmpContent,
					BytesRead: Buffer.byteLength(tmpContent, tmpEncoding)
				},
				StateWrites: tmpStateWrites,
				Log: [`ReadFile: read ${Buffer.byteLength(tmpContent, tmpEncoding)} bytes from ${tmpFilePath}`]
			});
		}
		catch (pError)
		{
			return fCallback(null, {
				EventToFire: 'Error',
				Outputs: {},
				Log: [`ReadFile: failed to read ${tmpFilePath}: ${pError.message}`]
			});
		}
	}
}

module.exports = UltravisorTaskTypeReadFile;
