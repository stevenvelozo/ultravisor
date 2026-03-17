const libUltravisorTaskType = require('../Ultravisor-TaskType-Base.cjs');
const libFS = require('fs');
const libPath = require('path');

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
		return require('./definitions/read-file.json');
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
	{
		let tmpFilePath = pResolvedSettings.FilePath || '';
		let tmpEncoding = pResolvedSettings.Encoding || 'utf8';
		let tmpMaxBytes = parseInt(pResolvedSettings.MaxBytes, 10) || 0;

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
					BytesRead: Buffer.byteLength(tmpContent, tmpEncoding),
					FileName: libPath.basename(tmpFilePath)
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
