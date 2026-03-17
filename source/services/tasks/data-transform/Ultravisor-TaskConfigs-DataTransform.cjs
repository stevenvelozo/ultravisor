/**
 * Data Transform task configurations for Ultravisor.
 *
 * Contains task types for manipulating and transforming data in state:
 *   set-values, replace-string, string-appender, template-string,
 *   expression-solver, parse-csv, csv-transform, comprehension-intersect,
 *   histogram
 *
 * Each entry defines a task type as a config object with:
 *   Definition  {object}   - Port schema, metadata, default settings
 *   Execute     {function} - Runtime logic: function(pTask, pSettings, pContext, fCb, fFireEvent)
 */


// ── Module-scoped helpers ───────────────────────────────────────────

/**
 * Get a service instance from the fable services map.
 */
function _getService(pTask, pTypeName)
{
	if (pTask.fable.servicesMap[pTypeName])
	{
		return Object.values(pTask.fable.servicesMap[pTypeName])[0];
	}
	return null;
}


/**
 * Split a CSV line respecting quoted fields.
 */
function _splitCSVLine(pLine, pDelimiter, pQuoteChar)
{
	let tmpFields = [];
	let tmpCurrent = '';
	let tmpInQuotes = false;

	for (let i = 0; i < pLine.length; i++)
	{
		let tmpChar = pLine[i];

		if (tmpChar === pQuoteChar)
		{
			if (tmpInQuotes && i + 1 < pLine.length && pLine[i + 1] === pQuoteChar)
			{
				tmpCurrent += pQuoteChar;
				i++;
			}
			else
			{
				tmpInQuotes = !tmpInQuotes;
			}
		}
		else if (tmpChar === pDelimiter && !tmpInQuotes)
		{
			tmpFields.push(tmpCurrent);
			tmpCurrent = '';
		}
		else
		{
			tmpCurrent += tmpChar;
		}
	}

	tmpFields.push(tmpCurrent);
	return tmpFields;
}


// ═══════════════════════════════════════════════════════════════════
//  DATA TRANSFORM TASK CONFIGS
// ═══════════════════════════════════════════════════════════════════

module.exports =
[
	// ── set-values ─────────────────────────────────────────────
	{
		Definition: require('./definitions/set-values.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpMappings = pResolvedSettings.Mappings;

			if (!Array.isArray(tmpMappings))
			{
				if (tmpMappings !== undefined && tmpMappings !== null)
				{
					return fCallback(null, {
						EventToFire: 'Error',
						Outputs: {},
						Log: ['Mappings is not an array.']
					});
				}
				return fCallback(null, {
					EventToFire: 'Complete',
					Outputs: {},
					Log: ['No mappings provided.']
				});
			}

			let tmpStateWrites = {};
			let tmpLog = [];

			for (let i = 0; i < tmpMappings.length; i++)
			{
				let tmpMapping = tmpMappings[i];

				if (!tmpMapping || !tmpMapping.Address)
				{
					tmpLog.push(`Mapping ${i}: skipped (no Address).`);
					continue;
				}

				tmpStateWrites[tmpMapping.Address] = tmpMapping.Value;
				tmpLog.push(`Set [${tmpMapping.Address}] = ${JSON.stringify(tmpMapping.Value)}`);
			}

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: {},
				StateWrites: tmpStateWrites,
				Log: tmpLog
			});
		}
	},

	// ── replace-string ─────────────────────────────────────────
	{
		Definition: require('./definitions/replace-string.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpInputString = pResolvedSettings.InputString;
			let tmpSearchString = pResolvedSettings.SearchString;
			let tmpReplaceString = pResolvedSettings.ReplaceString || '';

			if (typeof(tmpInputString) !== 'string')
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: {},
					Log: ['InputString is not a string.']
				});
			}

			if (!tmpSearchString || typeof(tmpSearchString) !== 'string')
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: {},
					Log: ['SearchString is empty or not a string.']
				});
			}

			let tmpUseRegex = pResolvedSettings.UseRegex;
			let tmpCaseSensitive = pResolvedSettings.CaseSensitive !== false;
			let tmpResult;
			let tmpReplacementCount = 0;

			if (tmpUseRegex)
			{
				let tmpFlags = 'g' + (tmpCaseSensitive ? '' : 'i');
				let tmpRegex = new RegExp(tmpSearchString, tmpFlags);
				tmpReplacementCount = (tmpInputString.match(tmpRegex) || []).length;
				tmpResult = tmpInputString.replace(tmpRegex, tmpReplaceString);
			}
			else if (!tmpCaseSensitive)
			{
				let tmpEscaped = tmpSearchString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				let tmpRegex = new RegExp(tmpEscaped, 'gi');
				tmpReplacementCount = (tmpInputString.match(tmpRegex) || []).length;
				tmpResult = tmpInputString.replace(tmpRegex, tmpReplaceString);
			}
			else
			{
				tmpReplacementCount = tmpInputString.split(tmpSearchString).length - 1;
				tmpResult = tmpInputString.split(tmpSearchString).join(tmpReplaceString);
			}

			return fCallback(null, {
				EventToFire: 'ReplaceComplete',
				Outputs: { ReplacedString: tmpResult, ReplacementCount: tmpReplacementCount },
				Log: [`Replaced "${tmpSearchString}" with "${tmpReplaceString}" (${tmpReplacementCount} occurrences).`]
			});
		}
	},

	// ── string-appender ────────────────────────────────────────
	{
		Definition: require('./definitions/string-appender.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpInputString = pResolvedSettings.InputString;
			let tmpOutputAddress = pResolvedSettings.OutputAddress;

			if (typeof(tmpInputString) !== 'string')
			{
				tmpInputString = String(tmpInputString !== undefined ? tmpInputString : '');
			}

			if (!tmpOutputAddress || typeof(tmpOutputAddress) !== 'string')
			{
				return fCallback(null, {
					EventToFire: 'Completed',
					Outputs: { AppendedString: tmpInputString },
					Log: ['No OutputAddress specified, returning InputString as AppendedString.']
				});
			}

			let tmpStateManager = pExecutionContext.StateManager;
			let tmpExistingValue = '';

			if (tmpStateManager)
			{
				let tmpResolved = tmpStateManager.resolveAddress(tmpOutputAddress, pExecutionContext, pExecutionContext.NodeHash);
				if (tmpResolved !== undefined && tmpResolved !== null)
				{
					tmpExistingValue = String(tmpResolved);
				}
			}

			let tmpAppendedValue;

			if (pResolvedSettings.Separator)
			{
				tmpAppendedValue = tmpExistingValue + (tmpExistingValue.length > 0 ? pResolvedSettings.Separator : '') + tmpInputString;
			}
			else
			{
				if (pResolvedSettings.AppendNewline)
				{
					tmpInputString = tmpInputString + '\n';
				}

				tmpAppendedValue = tmpExistingValue + tmpInputString;
			}

			let tmpStateWrites = {};
			tmpStateWrites[tmpOutputAddress] = tmpAppendedValue;

			return fCallback(null, {
				EventToFire: 'Completed',
				Outputs: { AppendedString: tmpAppendedValue },
				StateWrites: tmpStateWrites,
				Log: [`Appended ${tmpInputString.length} chars to [${tmpOutputAddress}] (total: ${tmpAppendedValue.length}).`]
			});
		}
	},

	// ── template-string ────────────────────────────────────────
	{
		Definition: require('./definitions/template-string.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpTemplate = pResolvedSettings.Template || '';
			let tmpResult = tmpTemplate;

			if (tmpTemplate && pTask.fable.parseTemplate)
			{
				try
				{
					tmpResult = pTask.fable.parseTemplate(tmpTemplate, pExecutionContext);
				}
				catch (pError)
				{
					return fCallback(null, {
						EventToFire: 'Error',
						Outputs: { Result: '' },
						Log: [`TemplateString: error parsing template: ${pError.message}`]
					});
				}
			}

			let tmpStateWrites = {};
			if (pResolvedSettings.Destination)
			{
				tmpStateWrites[pResolvedSettings.Destination] = tmpResult;
			}

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: { Result: tmpResult },
				StateWrites: tmpStateWrites,
				Log: [`TemplateString: rendered ${tmpResult.length} chars`]
			});
		}
	},

	// ── expression-solver ──────────────────────────────────────
	{
		Definition: require('./definitions/expression-solver.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpExpression = pResolvedSettings.Expression || '';
			let tmpResult = '';

			if (tmpExpression && pTask.fable.ExpressionParser)
			{
				try
				{
					tmpResult = pTask.fable.ExpressionParser.resolve(tmpExpression, pExecutionContext);
				}
				catch (pError)
				{
					tmpResult = '';
					return fCallback(null, {
						EventToFire: 'Error',
						Outputs: { Result: '' },
						Log: [`ExpressionSolver: error evaluating "${tmpExpression}": ${pError.message}`]
					});
				}
			}

			let tmpStateWrites = {};
			if (pResolvedSettings.Destination)
			{
				tmpStateWrites[pResolvedSettings.Destination] = tmpResult;
			}

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: { Result: tmpResult },
				StateWrites: tmpStateWrites,
				Log: [`ExpressionSolver: result = ${JSON.stringify(tmpResult)}`]
			});
		}
	},

	// ── parse-csv ──────────────────────────────────────────────
	{
		Definition: require('./definitions/parse-csv.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpRawText = '';
			if (pResolvedSettings.SourceAddress && pExecutionContext.StateManager)
			{
				tmpRawText = pExecutionContext.StateManager.resolveAddress(pResolvedSettings.SourceAddress, pExecutionContext, pExecutionContext.NodeHash);
			}

			if (typeof(tmpRawText) !== 'string' || tmpRawText.length === 0)
			{
				return fCallback(null, { EventToFire: 'Complete', Outputs: { Records: [] }, Log: ['ParseCSV: no input text.'] });
			}

			let tmpDelimiter = pResolvedSettings.Delimiter || ',';
			let tmpHasHeaders = pResolvedSettings.HasHeaders !== false;
			let tmpQuoteChar = pResolvedSettings.QuoteCharacter || '"';
			let tmpTrimFields = pResolvedSettings.TrimFields !== false;
			let tmpSkipEmptyLines = pResolvedSettings.SkipEmptyLines !== false;
			let tmpLines = tmpRawText.split('\n');

			if (tmpSkipEmptyLines)
			{
				tmpLines = tmpLines.filter(function (pLine) { return pLine.trim().length > 0; });
			}

			let tmpRecords = [];
			let tmpHeaders = [];

			if (tmpHasHeaders && tmpLines.length > 0)
			{
				tmpHeaders = _splitCSVLine(tmpLines[0], tmpDelimiter, tmpQuoteChar);
				if (tmpTrimFields)
				{
					tmpHeaders = tmpHeaders.map(function (pH) { return pH.trim(); });
				}
				tmpLines = tmpLines.slice(1);
			}

			let tmpColumnCount = tmpHeaders.length;

			for (let i = 0; i < tmpLines.length; i++)
			{
				let tmpFields = _splitCSVLine(tmpLines[i], tmpDelimiter, tmpQuoteChar);

				if (tmpTrimFields)
				{
					tmpFields = tmpFields.map(function (pF) { return pF.trim(); });
				}

				if (tmpFields.length > tmpColumnCount)
				{
					tmpColumnCount = tmpFields.length;
				}

				if (tmpHeaders.length > 0)
				{
					let tmpRecord = {};
					for (let j = 0; j < tmpHeaders.length; j++)
					{
						tmpRecord[tmpHeaders[j]] = (j < tmpFields.length) ? tmpFields[j] : '';
					}
					tmpRecords.push(tmpRecord);
				}
				else
				{
					tmpRecords.push(tmpFields);
				}
			}

			let tmpStateWrites = {};
			if (pResolvedSettings.Destination)
			{
				tmpStateWrites[pResolvedSettings.Destination] = tmpRecords;
			}

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: { Records: tmpRecords, ColumnCount: tmpColumnCount, Headers: tmpHeaders },
				StateWrites: tmpStateWrites,
				Log: [`ParseCSV: parsed ${tmpRecords.length} records with ${tmpHeaders.length || 'no'} headers`]
			});
		}
	},

	// ── csv-transform ──────────────────────────────────────────
	{
		Definition: require('./definitions/csv-transform.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpRecords = [];
			if (pResolvedSettings.SourceAddress && pExecutionContext.StateManager)
			{
				tmpRecords = pExecutionContext.StateManager.resolveAddress(pResolvedSettings.SourceAddress, pExecutionContext, pExecutionContext.NodeHash);
			}

			if (!Array.isArray(tmpRecords))
			{
				return fCallback(null, { EventToFire: 'Complete', Outputs: { Records: [] }, Log: ['CSVTransform: source is not an array.'] });
			}

			// Pass-through for now — transformation logic is extensible
			let tmpStateWrites = {};
			if (pResolvedSettings.Destination)
			{
				tmpStateWrites[pResolvedSettings.Destination] = tmpRecords;
			}

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: { Records: tmpRecords },
				StateWrites: tmpStateWrites,
				Log: [`CSVTransform: processed ${tmpRecords.length} records`]
			});
		}
	},

	// ── comprehension-intersect ─────────────────────────────────
	{
		Definition: require('./definitions/comprehension-intersect.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpSetA = [];
			let tmpSetB = [];

			if (pResolvedSettings.SourceAddressA && pExecutionContext.StateManager)
			{
				tmpSetA = pExecutionContext.StateManager.resolveAddress(pResolvedSettings.SourceAddressA, pExecutionContext, pExecutionContext.NodeHash);
			}
			if (pResolvedSettings.SourceAddressB && pExecutionContext.StateManager)
			{
				tmpSetB = pExecutionContext.StateManager.resolveAddress(pResolvedSettings.SourceAddressB, pExecutionContext, pExecutionContext.NodeHash);
			}

			if (!Array.isArray(tmpSetA)) { tmpSetA = []; }
			if (!Array.isArray(tmpSetB)) { tmpSetB = []; }

			let tmpMatchField = pResolvedSettings.MatchField || '';
			let tmpResult = [];

			if (tmpMatchField)
			{
				// Build a set of match values from B
				let tmpBValues = {};
				for (let i = 0; i < tmpSetB.length; i++)
				{
					let tmpKey = String(tmpSetB[i][tmpMatchField]);
					tmpBValues[tmpKey] = tmpSetB[i];
				}

				// Find matches in A
				for (let i = 0; i < tmpSetA.length; i++)
				{
					let tmpKey = String(tmpSetA[i][tmpMatchField]);
					if (tmpBValues[tmpKey])
					{
						tmpResult.push(Object.assign({}, tmpSetA[i], tmpBValues[tmpKey]));
					}
				}
			}
			else
			{
				// Simple array intersection (by value equality for primitives)
				let tmpBSet = new Set(tmpSetB.map(function (pV) { return JSON.stringify(pV); }));
				for (let i = 0; i < tmpSetA.length; i++)
				{
					if (tmpBSet.has(JSON.stringify(tmpSetA[i])))
					{
						tmpResult.push(tmpSetA[i]);
					}
				}
			}

			let tmpStateWrites = {};
			if (pResolvedSettings.Destination)
			{
				tmpStateWrites[pResolvedSettings.Destination] = tmpResult;
			}

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: { Result: tmpResult, MatchCount: tmpResult.length },
				StateWrites: tmpStateWrites,
				Log: [`ComprehensionIntersect: ${tmpSetA.length} x ${tmpSetB.length} -> ${tmpResult.length} results`]
			});
		}
	},

	// ── histogram ──────────────────────────────────────────────
	{
		Definition: require('./definitions/histogram.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpData = [];
			if (pResolvedSettings.SourceAddress && pExecutionContext.StateManager)
			{
				tmpData = pExecutionContext.StateManager.resolveAddress(pResolvedSettings.SourceAddress, pExecutionContext, pExecutionContext.NodeHash);
			}

			if (!Array.isArray(tmpData))
			{
				return fCallback(null, { EventToFire: 'Complete', Outputs: { Stats: {} }, Log: ['Histogram: source is not an array.'] });
			}

			let tmpField = pResolvedSettings.Field || '';
			let tmpFrequency = {};

			for (let i = 0; i < tmpData.length; i++)
			{
				let tmpValue = tmpField ? tmpData[i][tmpField] : tmpData[i];
				let tmpKey = String(tmpValue);
				tmpFrequency[tmpKey] = (tmpFrequency[tmpKey] || 0) + 1;
			}

			let tmpSortBy = pResolvedSettings.SortBy || '';

			if (tmpSortBy === 'count')
			{
				let tmpEntries = Object.entries(tmpFrequency).sort(function (pA, pB) { return pB[1] - pA[1]; });
				tmpFrequency = Object.fromEntries(tmpEntries);
			}
			else if (tmpSortBy === 'key')
			{
				let tmpEntries = Object.entries(tmpFrequency).sort(function (pA, pB) { return pA[0].localeCompare(pB[0]); });
				tmpFrequency = Object.fromEntries(tmpEntries);
			}

			let tmpStats = {
				TotalRecords: tmpData.length,
				UniqueValues: Object.keys(tmpFrequency).length,
				Frequency: tmpFrequency
			};

			let tmpStateWrites = {};
			if (pResolvedSettings.Destination)
			{
				tmpStateWrites[pResolvedSettings.Destination] = tmpStats;
			}

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: { Stats: tmpStats },
				StateWrites: tmpStateWrites,
				Log: [`Histogram: analyzed ${tmpData.length} records, ${Object.keys(tmpFrequency).length} unique values`]
			});
		}
	}
];
