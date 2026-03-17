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
		return require('./definitions/write-file.json');
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		let tmpFileLocation = pResolvedSettings.FilePath || '';
		let tmpContent = pResolvedSettings.Content;
		let tmpEncoding = pResolvedSettings.Encoding || 'utf8';

		if (!tmpFileLocation)
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

		// Resolve relative paths against the staging folder
		let tmpFilePath = this.resolveFilePath(tmpFileLocation, pExecutionContext.StagingPath);

		try
		{
			// Ensure the directory exists
			let tmpDir = libPath.dirname(tmpFilePath);
			if (!libFS.existsSync(tmpDir))
			{
				libFS.mkdirSync(tmpDir, { recursive: true });
			}

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
				Outputs:
				{
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
			return fCallback(null, {
				EventToFire: 'Error',
				Outputs: {},
				Log: [`WriteFile: failed to write ${tmpFilePath}: ${pError.message}`]
			});
		}
	}
}

module.exports = UltravisorTaskTypeWriteFile;
