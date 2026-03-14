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


// ═══════════════════════════════════════════════════════════════════
//  DATA TRANSFORM TASK CONFIGS
// ═══════════════════════════════════════════════════════════════════

module.exports =
[
	// ── set-values ─────────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'set-values',
			Type: 'set-values',
			Name: 'Set Values',
			Description: 'Sets one or more values in state at specified addresses.',
			Category: 'data',
			Capability: 'Data Transform',
			Action: 'SetValues',
			Tier: 'Engine',
			EventInputs: [{ Name: 'Execute' }],
			EventOutputs: [{ Name: 'Complete' }],
			SettingsInputs: [
				{ Name: 'Mappings', DataType: 'Array', Required: true }
			],
			StateOutputs: [],
			DefaultSettings: { Mappings: [] }
		},
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			let tmpMappings = pResolvedSettings.Mappings;

			if (!Array.isArray(tmpMappings))
			{
				return fCallback(null, {
					EventToFire: 'Complete',
					Outputs: {},
					Log: ['No mappings provided or Mappings is not an array.']
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
		Definition:
		{
			Hash: 'replace-string',
			Type: 'replace-string',
			Name: 'Replace String',
			Description: 'Replaces all occurrences of a search string within the input.',
			Category: 'data',
			Capability: 'Data Transform',
			Action: 'ReplaceString',
			Tier: 'Engine',
			EventInputs: [{ Name: 'Replace' }],
			EventOutputs: [
				{ Name: 'ReplaceComplete' },
				{ Name: 'Error', IsError: true }
			],
			SettingsInputs: [
				{ Name: 'InputString', DataType: 'String', Required: true },
				{ Name: 'SearchString', DataType: 'String', Required: true },
				{ Name: 'ReplaceString', DataType: 'String', Required: false }
			],
			StateOutputs: [
				{ Name: 'ReplacedString', DataType: 'String' }
			],
			DefaultSettings: { InputString: '', SearchString: '', ReplaceString: '' }
		},
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

			let tmpResult = tmpInputString.split(tmpSearchString).join(tmpReplaceString);

			return fCallback(null, {
				EventToFire: 'ReplaceComplete',
				Outputs: { ReplacedString: tmpResult },
				Log: [`Replaced "${tmpSearchString}" with "${tmpReplaceString}" (${tmpInputString.split(tmpSearchString).length - 1} occurrences).`]
			});
		}
	},

	// ── string-appender ────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'string-appender',
			Type: 'string-appender',
			Name: 'String Appender',
			Description: 'Appends a string to a value at a specified state address.',
			Category: 'data',
			Capability: 'Data Transform',
			Action: 'AppendString',
			Tier: 'Engine',
			EventInputs: [{ Name: 'Append' }],
			EventOutputs: [{ Name: 'Completed' }],
			SettingsInputs: [
				{ Name: 'InputString', DataType: 'String', Required: true },
				{ Name: 'OutputAddress', DataType: 'String', Required: true },
				{ Name: 'AppendNewline', DataType: 'Boolean', Required: false, Description: 'When true, append a newline after each InputString.' }
			],
			StateOutputs: [
				{ Name: 'AppendedString', DataType: 'String' }
			],
			DefaultSettings: { InputString: '', OutputAddress: '', AppendNewline: false }
		},
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

			if (pResolvedSettings.AppendNewline)
			{
				tmpInputString = tmpInputString + '\n';
			}

			let tmpAppendedValue = tmpExistingValue + tmpInputString;

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
		Definition:
		{
			Hash: 'template-string',
			Type: 'template-string',
			Name: 'Template String',
			Description: 'Processes a Pict template string against the current state.',
			Category: 'core',
			Capability: 'Data Transform',
			Action: 'Template',
			Tier: 'Engine',
			EventInputs: [{ Name: 'In' }],
			EventOutputs: [{ Name: 'Complete' }],
			SettingsInputs: [
				{ Name: 'Template', DataType: 'String', Required: true, Description: 'Pict template string with {~D:...~} expressions' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store the result' }
			],
			StateOutputs: [
				{ Name: 'Result', DataType: 'String', Description: 'Rendered template output' }
			],
			DefaultSettings: { Template: '', Destination: '' }
		},
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
					tmpResult = tmpTemplate;
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
		Definition:
		{
			Hash: 'expression-solver',
			Type: 'expression-solver',
			Name: 'Expression Solver',
			Description: 'Evaluates an expression using Fable ExpressionParser.',
			Category: 'core',
			Capability: 'Data Transform',
			Action: 'EvaluateExpression',
			Tier: 'Engine',
			EventInputs: [{ Name: 'In' }],
			EventOutputs: [{ Name: 'Complete' }],
			SettingsInputs: [
				{ Name: 'Expression', DataType: 'String', Required: true, Description: 'Expression to evaluate' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store the result' }
			],
			StateOutputs: [
				{ Name: 'Result', DataType: 'String', Description: 'Evaluation result' }
			],
			DefaultSettings: { Expression: '', Destination: '' }
		},
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
						EventToFire: 'Complete',
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
		Definition:
		{
			Hash: 'parse-csv',
			Type: 'parse-csv',
			Name: 'Parse CSV',
			Description: 'Parses CSV text into an array of records.',
			Category: 'pipeline',
			Capability: 'Data Transform',
			Action: 'ParseCSV',
			Tier: 'Engine',
			EventInputs: [{ Name: 'Execute' }],
			EventOutputs: [{ Name: 'Complete' }],
			SettingsInputs: [
				{ Name: 'SourceAddress', DataType: 'String', Required: false, Description: 'State address of the CSV text to parse' },
				{ Name: 'Delimiter', DataType: 'String', Required: false, Description: 'Column delimiter' },
				{ Name: 'HasHeaders', DataType: 'Boolean', Required: false, Description: 'When true, first row is used as field names' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store parsed records' }
			],
			StateOutputs: [
				{ Name: 'Records', DataType: 'Array', Description: 'Parsed rows' }
			],
			DefaultSettings: { SourceAddress: '', Delimiter: ',', HasHeaders: true, Destination: '' }
		},
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
			let tmpLines = tmpRawText.split('\n').filter(function (pLine) { return pLine.trim().length > 0; });
			let tmpRecords = [];
			let tmpHeaders = [];

			if (tmpHasHeaders && tmpLines.length > 0)
			{
				tmpHeaders = tmpLines[0].split(tmpDelimiter).map(function (pH) { return pH.trim(); });
				tmpLines = tmpLines.slice(1);
			}

			for (let i = 0; i < tmpLines.length; i++)
			{
				let tmpFields = tmpLines[i].split(tmpDelimiter);

				if (tmpHeaders.length > 0)
				{
					let tmpRecord = {};
					for (let j = 0; j < tmpHeaders.length; j++)
					{
						tmpRecord[tmpHeaders[j]] = (j < tmpFields.length) ? tmpFields[j].trim() : '';
					}
					tmpRecords.push(tmpRecord);
				}
				else
				{
					tmpRecords.push(tmpFields.map(function (pF) { return pF.trim(); }));
				}
			}

			let tmpStateWrites = {};
			if (pResolvedSettings.Destination)
			{
				tmpStateWrites[pResolvedSettings.Destination] = tmpRecords;
			}

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs: { Records: tmpRecords },
				StateWrites: tmpStateWrites,
				Log: [`ParseCSV: parsed ${tmpRecords.length} records with ${tmpHeaders.length || 'no'} headers`]
			});
		}
	},

	// ── csv-transform ──────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'csv-transform',
			Type: 'csv-transform',
			Name: 'CSV Transform',
			Description: 'Transforms parsed CSV records using a template per row.',
			Category: 'pipeline',
			Capability: 'Data Transform',
			Action: 'TransformCSV',
			Tier: 'Engine',
			EventInputs: [{ Name: 'Execute' }],
			EventOutputs: [{ Name: 'Complete' }],
			SettingsInputs: [
				{ Name: 'SourceAddress', DataType: 'String', Required: false, Description: 'State address of the records array' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store transformed records' },
				{ Name: 'Delimiter', DataType: 'String', Required: false, Description: 'Delimiter for re-serialization' }
			],
			StateOutputs: [
				{ Name: 'Records', DataType: 'Array', Description: 'Transformed records' }
			],
			DefaultSettings: { SourceAddress: '', Destination: '', Delimiter: ',' }
		},
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
		Definition:
		{
			Hash: 'comprehension-intersect',
			Type: 'comprehension-intersect',
			Name: 'Comprehension Intersect',
			Description: 'Intersects two arrays by matching a common field.',
			Category: 'pipeline',
			Capability: 'Data Transform',
			Action: 'Intersect',
			Tier: 'Engine',
			EventInputs: [{ Name: 'Execute' }],
			EventOutputs: [{ Name: 'Complete' }],
			SettingsInputs: [
				{ Name: 'SourceAddressA', DataType: 'String', Required: true, Description: 'State address of the first array' },
				{ Name: 'SourceAddressB', DataType: 'String', Required: true, Description: 'State address of the second array' },
				{ Name: 'MatchField', DataType: 'String', Required: false, Description: 'Field name to match records on' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store the result' }
			],
			StateOutputs: [
				{ Name: 'Result', DataType: 'Array', Description: 'Intersected records' }
			],
			DefaultSettings: { SourceAddressA: '', SourceAddressB: '', MatchField: '', Destination: '' }
		},
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
				Outputs: { Result: tmpResult },
				StateWrites: tmpStateWrites,
				Log: [`ComprehensionIntersect: ${tmpSetA.length} x ${tmpSetB.length} -> ${tmpResult.length} results`]
			});
		}
	},

	// ── histogram ──────────────────────────────────────────────
	{
		Definition:
		{
			Hash: 'histogram',
			Type: 'histogram',
			Name: 'Histogram',
			Description: 'Computes a frequency distribution over a field in a dataset.',
			Category: 'pipeline',
			Capability: 'Data Transform',
			Action: 'Histogram',
			Tier: 'Engine',
			EventInputs: [{ Name: 'Execute' }],
			EventOutputs: [{ Name: 'Complete' }],
			SettingsInputs: [
				{ Name: 'SourceAddress', DataType: 'String', Required: false, Description: 'State address of the data array' },
				{ Name: 'Field', DataType: 'String', Required: false, Description: 'Field name to analyze' },
				{ Name: 'Bins', DataType: 'Number', Required: false, Description: 'Number of bins for numeric data' },
				{ Name: 'Destination', DataType: 'String', Required: false, Description: 'State address to store stats' }
			],
			StateOutputs: [
				{ Name: 'Stats', DataType: 'Object', Description: 'Histogram / frequency distribution' }
			],
			DefaultSettings: { SourceAddress: '', Field: 'score', Bins: 5, Destination: '' }
		},
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
