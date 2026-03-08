const libUltravisorTaskType = require('../Ultravisor-TaskType-Base.cjs');
const libFS = require('fs');
const libPath = require('path');

/**
 * Write File task type.
 *
 * Writes content from state to a file on disk. The file path can be
 * absolute or relative to the operation's staging folder.
 */
class UltravisorTaskTypeWriteFile extends libUltravisorTaskType
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	get definition()
	{
		return {
			Hash: 'write-file',
			Name: 'Write File',
			Description: 'Writes content to a file on disk.',
			Category: 'file-io',

			EventInputs:
			[
				{ Name: 'BeginWrite', Description: 'Triggers the file write' }
			],
			EventOutputs:
			[
				{ Name: 'WriteComplete', Description: 'Fires when file is written successfully' },
				{ Name: 'Error', Description: 'Fires on write failure', IsError: true }
			],
			SettingsInputs:
			[
				{ Name: 'FilePath', DataType: 'String', Required: true, Description: 'Path to the output file' },
				{ Name: 'Content', DataType: 'String', Required: true, Description: 'Content to write' },
				{ Name: 'Encoding', DataType: 'String', Required: false, Default: 'utf8', Description: 'File encoding' }
			],
			StateOutputs:
			[
				{ Name: 'BytesWritten', DataType: 'Number', Description: 'Number of bytes written' }
			],

			DefaultSettings:
			{
				FilePath: '',
				Content: '',
				Encoding: 'utf8'
			}
		};
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		let tmpFilePath = pResolvedSettings.FilePath || '';
		let tmpContent = pResolvedSettings.Content;
		let tmpEncoding = pResolvedSettings.Encoding || 'utf8';

		if (!tmpFilePath)
		{
			return fCallback(null, {
				EventToFire: 'Error',
				Outputs: {},
				Log: ['WriteFile: no FilePath specified.']
			});
		}

		if (tmpContent === undefined || tmpContent === null)
		{
			tmpContent = '';
		}

		// Ensure content is a string
		if (typeof(tmpContent) !== 'string')
		{
			tmpContent = JSON.stringify(tmpContent, null, '\t');
		}

		// Resolve relative paths against the staging folder
		tmpFilePath = this.resolveFilePath(tmpFilePath, pExecutionContext.StagingPath);

		try
		{
			// Ensure the directory exists
			let tmpDir = libPath.dirname(tmpFilePath);
			if (!libFS.existsSync(tmpDir))
			{
				libFS.mkdirSync(tmpDir, { recursive: true });
			}

			libFS.writeFileSync(tmpFilePath, tmpContent, tmpEncoding);

			let tmpBytesWritten = Buffer.byteLength(tmpContent, tmpEncoding);

			return fCallback(null, {
				EventToFire: 'WriteComplete',
				Outputs:
				{
					BytesWritten: tmpBytesWritten
				},
				Log: [`WriteFile: wrote ${tmpBytesWritten} bytes to ${tmpFilePath}`]
			});
		}
		catch (pError)
		{
			return fCallback(null, {
				EventToFire: 'Error',
				Outputs: {},
				Log: [`WriteFile: failed to write ${tmpFilePath}: ${pError.message}`]
			});
		}
	}
}

module.exports = UltravisorTaskTypeWriteFile;
