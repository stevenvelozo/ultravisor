const libUltravisorTaskType = require('../Ultravisor-TaskType-Base.cjs');
const libFS = require('fs');
const libPath = require('path');

/**
 * Read File Buffered task type.
 *
 * Reads a file in chunks up to a maximum buffer size, splitting on the
 * last occurrence of a preferred split character within the buffer.
 * Supports continuation via ByteOffset for processing large files
 * incrementally.
 */
class UltravisorTaskTypeReadFileBuffered extends libUltravisorTaskType
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	get definition()
	{
		return require('./definitions/read-file-buffered.json');
	}

	execute(pResolvedSettings, pExecutionContext, fCallback, fFireIntermediateEvent)
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
			return fCallback(null, {
				EventToFire: 'Error',
				Outputs: {},
				Log: ['ReadFileBuffered: no FilePath specified.']
			});
		}

		// Resolve relative paths against the staging folder
		tmpFilePath = this.resolveFilePath(tmpFilePath, pExecutionContext.StagingPath);

		try
		{
			let tmpStat = libFS.statSync(tmpFilePath);
			let tmpTotalSize = tmpStat.size;
			let tmpRemainingBytes = tmpTotalSize - tmpByteOffset;

			if (tmpRemainingBytes <= 0)
			{
				return fCallback(null, {
					EventToFire: 'ReadComplete',
					Outputs:
					{
						FileContent: '',
						BytesRead: 0,
						ByteOffset: tmpByteOffset,
						IsComplete: true,
						FileName: libPath.basename(tmpFilePath),
						TotalFileSize: tmpTotalSize
					},
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
				Outputs:
				{
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
			return fCallback(null, {
				EventToFire: 'Error',
				Outputs: {},
				Log: [`ReadFileBuffered: failed: ${pError.message}`]
			});
		}
	}
}

module.exports = UltravisorTaskTypeReadFileBuffered;
