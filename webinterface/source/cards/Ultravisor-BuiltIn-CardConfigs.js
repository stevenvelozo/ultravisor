/**
 * Built-in card configurations for Ultravisor.
 *
 * Each entry is a PictFlowCard constructor options object, ready to pass
 * to `new PictFlowCard(fable, config)`.  Task-matched cards are generated
 * from their task type Definition via the CardConfigGenerator.  Flow markers
 * (start / end) are direct config objects since they have no backend task.
 *
 * Total: 33 cards (31 task-matched + 2 flow markers)
 */

const generateCardConfig = require('./Ultravisor-CardConfigGenerator.js');

// ═══════════════════════════════════════════════════════════════════════
//  TASK DEFINITIONS (client-side only — no Execute functions)
//  Inlined here because the server-side task config file depends on
//  Node.js modules (fs, child_process) that aren't available in the browser.
// ═══════════════════════════════════════════════════════════════════════

const _TaskDefinitions =
[
	// ── Interaction ────────────────────────────────────────────────
	{
		Hash: 'error-message',
		Name: 'Error Message',
		Description: 'Logs an error or warning message to the execution log.',
		Category: 'interaction',
		Capability: 'User Interaction',
		Action: 'ShowError',
		Tier: 'Platform',
		EventInputs: [{ Name: 'Trigger' }],
		EventOutputs: [{ Name: 'Complete' }],
		SettingsInputs: [
			{ Name: 'MessageTemplate', DataType: 'String', Required: true }
		],
		StateOutputs: [],
		DefaultSettings: { MessageTemplate: 'An error occurred.' }
	},
	{
		Hash: 'value-input',
		Name: 'Value Input',
		Description: 'Pauses execution and waits for user-provided input.',
		Category: 'interaction',
		Capability: 'User Interaction',
		Action: 'RequestInput',
		Tier: 'Platform',
		EventInputs: [{ Name: 'RequestInput' }],
		EventOutputs: [{ Name: 'ValueInputComplete' }],
		SettingsInputs: [
			{ Name: 'PromptMessage', DataType: 'String', Required: false },
			{ Name: 'OutputAddress', DataType: 'String', Required: true }
		],
		StateOutputs: [
			{ Name: 'InputValue', DataType: 'String' }
		],
		DefaultSettings: { PromptMessage: 'Please provide a value:', OutputAddress: '' }
	},

	// ── Data ───────────────────────────────────────────────────────
	{
		Hash: 'set-values',
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
	{
		Hash: 'replace-string',
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
	{
		Hash: 'string-appender',
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
			{ Name: 'AppendNewline', DataType: 'Boolean', Required: false }
		],
		StateOutputs: [
			{ Name: 'AppendedString', DataType: 'String' }
		],
		DefaultSettings: { InputString: '', OutputAddress: '', AppendNewline: false }
	},

	// ── File I/O ───────────────────────────────────────────────────
	{
		Hash: 'read-file',
		Name: 'Read File',
		Description: 'Reads a file from disk into state.',
		Category: 'file-io',
		Capability: 'File System',
		Action: 'Read',
		Tier: 'Platform',
		EventInputs: [{ Name: 'BeginRead' }],
		EventOutputs: [
			{ Name: 'ReadComplete' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'FilePath', DataType: 'String', Required: true },
			{ Name: 'Encoding', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'FileContent', DataType: 'String' },
			{ Name: 'BytesRead', DataType: 'Number' }
		],
		DefaultSettings: { FilePath: '', Encoding: 'utf8' }
	},
	{
		Hash: 'write-file',
		Name: 'Write File',
		Description: 'Writes content to a file on disk.',
		Category: 'file-io',
		Capability: 'File System',
		Action: 'Write',
		Tier: 'Platform',
		EventInputs: [{ Name: 'BeginWrite' }],
		EventOutputs: [
			{ Name: 'WriteComplete' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'FilePath', DataType: 'String', Required: true },
			{ Name: 'Content', DataType: 'String', Required: true },
			{ Name: 'Encoding', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'BytesWritten', DataType: 'Number' }
		],
		DefaultSettings: { FilePath: '', Content: '', Encoding: 'utf8' }
	},
	{
		Hash: 'read-json',
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
			{ Name: 'File', DataType: 'String', Required: true },
			{ Name: 'Destination', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Data', DataType: 'Object' }
		],
		DefaultSettings: { File: '', Destination: '' }
	},
	{
		Hash: 'write-json',
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
			{ Name: 'File', DataType: 'String', Required: true },
			{ Name: 'Address', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'BytesWritten', DataType: 'Number' }
		],
		DefaultSettings: { File: '', Address: '' }
	},
	{
		Hash: 'list-files',
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
			{ Name: 'Folder', DataType: 'String', Required: true },
			{ Name: 'Pattern', DataType: 'String', Required: false },
			{ Name: 'Destination', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Files', DataType: 'Array' }
		],
		DefaultSettings: { Folder: '', Pattern: '*', Destination: '' }
	},
	{
		Hash: 'copy-file',
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
			{ Name: 'Source', DataType: 'String', Required: true },
			{ Name: 'TargetFile', DataType: 'String', Required: true }
		],
		StateOutputs: [],
		DefaultSettings: { Source: '', TargetFile: '' }
	},

	// ── Control ────────────────────────────────────────────────────
	{
		Hash: 'if-conditional',
		Name: 'If Conditional',
		Description: 'Evaluates a condition and branches execution to True or False.',
		Category: 'control',
		Capability: 'Flow Control',
		Action: 'Branch',
		Tier: 'Engine',
		EventInputs: [{ Name: 'Evaluate' }],
		EventOutputs: [
			{ Name: 'True' },
			{ Name: 'False' }
		],
		SettingsInputs: [
			{ Name: 'DataAddress', DataType: 'String', Required: false },
			{ Name: 'CompareValue', DataType: 'String', Required: false },
			{ Name: 'Operator', DataType: 'String', Required: false },
			{ Name: 'Expression', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Result', DataType: 'Boolean' }
		],
		DefaultSettings: { DataAddress: '', CompareValue: '', Operator: '==', Expression: '' }
	},
	{
		Hash: 'split-execute',
		Name: 'Split Execute',
		Description: 'Splits a string by delimiter and processes each token through a sub-graph.',
		Category: 'control',
		Capability: 'Flow Control',
		Action: 'Iterate',
		Tier: 'Engine',
		EventInputs: [
			{ Name: 'PerformSplit' },
			{ Name: 'StepComplete' }
		],
		EventOutputs: [
			{ Name: 'TokenDataSent' },
			{ Name: 'CompletedAllSubtasks' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'InputString', DataType: 'String', Required: true },
			{ Name: 'SplitDelimiter', DataType: 'String', Required: true }
		],
		StateOutputs: [
			{ Name: 'CurrentToken', DataType: 'String' },
			{ Name: 'TokenIndex', DataType: 'Number' },
			{ Name: 'TokenCount', DataType: 'Number' },
			{ Name: 'CompletedCount', DataType: 'Number' }
		],
		DefaultSettings: { InputString: '', SplitDelimiter: '\n' }
	},
	{
		Hash: 'launch-operation',
		Name: 'Launch Operation',
		Description: 'Executes a child operation by hash, with isolated operation state.',
		Category: 'control',
		Capability: 'Flow Control',
		Action: 'LaunchOperation',
		Tier: 'Engine',
		EventInputs: [{ Name: 'Launch' }],
		EventOutputs: [
			{ Name: 'Completed' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'OperationHash', DataType: 'String', Required: true },
			{ Name: 'InputData', DataType: 'String' }
		],
		StateOutputs: [
			{ Name: 'Result', DataType: 'String' },
			{ Name: 'Status', DataType: 'String' },
			{ Name: 'ElapsedMs', DataType: 'Number' }
		],
		DefaultSettings: { OperationHash: '', InputData: '' }
	},
	{
		Hash: 'command',
		Name: 'Command',
		Description: 'Executes a shell command on the server.',
		Category: 'control',
		Capability: 'Shell',
		Action: 'Execute',
		Tier: 'Platform',
		EventInputs: [{ Name: 'Trigger' }],
		EventOutputs: [
			{ Name: 'Complete' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'Command', DataType: 'String', Required: true },
			{ Name: 'Parameters', DataType: 'String', Required: false },
			{ Name: 'Description', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'StdOut', DataType: 'String' },
			{ Name: 'ExitCode', DataType: 'Number' }
		],
		DefaultSettings: { Command: '', Parameters: '', Description: '' }
	},

	// ── Core ───────────────────────────────────────────────────────
	{
		Hash: 'template-string',
		Name: 'Template String',
		Description: 'Processes a Pict template string against the current state.',
		Category: 'core',
		Capability: 'Data Transform',
		Action: 'Template',
		Tier: 'Engine',
		EventInputs: [{ Name: 'In' }],
		EventOutputs: [{ Name: 'Complete' }],
		SettingsInputs: [
			{ Name: 'Template', DataType: 'String', Required: true },
			{ Name: 'Destination', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Result', DataType: 'String' }
		],
		DefaultSettings: { Template: '', Destination: '' }
	},
	{
		Hash: 'expression-solver',
		Name: 'Expression Solver',
		Description: 'Evaluates an expression using Fable ExpressionParser.',
		Category: 'core',
		Capability: 'Data Transform',
		Action: 'EvaluateExpression',
		Tier: 'Engine',
		EventInputs: [{ Name: 'In' }],
		EventOutputs: [{ Name: 'Complete' }],
		SettingsInputs: [
			{ Name: 'Expression', DataType: 'String', Required: true },
			{ Name: 'Destination', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Result', DataType: 'String' }
		],
		DefaultSettings: { Expression: '', Destination: '' }
	},

	// ── REST / HTTP ────────────────────────────────────────────────
	{
		Hash: 'get-json',
		Name: 'Get JSON',
		Description: 'Performs an HTTP GET request and parses the response as JSON.',
		Category: 'rest',
		Capability: 'HTTP Client',
		Action: 'GetJSON',
		Tier: 'Platform',
		EventInputs: [{ Name: 'Trigger' }],
		EventOutputs: [
			{ Name: 'Complete' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'URL', DataType: 'String', Required: true },
			{ Name: 'Headers', DataType: 'String', Required: false },
			{ Name: 'Destination', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Data', DataType: 'Object' }
		],
		DefaultSettings: { URL: '', Headers: '', Destination: '' }
	},
	{
		Hash: 'get-text',
		Name: 'Get Text',
		Description: 'Performs an HTTP GET request and returns the response as text.',
		Category: 'rest',
		Capability: 'HTTP Client',
		Action: 'GetText',
		Tier: 'Platform',
		EventInputs: [{ Name: 'Trigger' }],
		EventOutputs: [
			{ Name: 'Complete' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'URL', DataType: 'String', Required: true },
			{ Name: 'Destination', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Data', DataType: 'String' }
		],
		DefaultSettings: { URL: '', Destination: '' }
	},
	{
		Hash: 'send-json',
		Name: 'Send JSON',
		Description: 'Sends JSON data via HTTP POST or PUT.',
		Category: 'rest',
		Capability: 'HTTP Client',
		Action: 'SendJSON',
		Tier: 'Platform',
		EventInputs: [{ Name: 'Trigger' }],
		EventOutputs: [
			{ Name: 'Complete' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'URL', DataType: 'String', Required: true },
			{ Name: 'Method', DataType: 'String', Required: false },
			{ Name: 'Address', DataType: 'String', Required: false },
			{ Name: 'Headers', DataType: 'String', Required: false },
			{ Name: 'Destination', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Response', DataType: 'Object' }
		],
		DefaultSettings: { URL: '', Method: 'POST', Address: '', Headers: '', Destination: '' }
	},
	{
		Hash: 'rest-request',
		Name: 'REST Request',
		Description: 'Performs a fully configurable HTTP REST request.',
		Category: 'rest',
		Capability: 'HTTP Client',
		Action: 'Request',
		Tier: 'Platform',
		EventInputs: [{ Name: 'In' }],
		EventOutputs: [
			{ Name: 'Complete' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'URL', DataType: 'String', Required: true },
			{ Name: 'Method', DataType: 'String', Required: false },
			{ Name: 'ContentType', DataType: 'String', Required: false },
			{ Name: 'Headers', DataType: 'String', Required: false },
			{ Name: 'Body', DataType: 'String', Required: false },
			{ Name: 'Destination', DataType: 'String', Required: false },
			{ Name: 'Retries', DataType: 'Number', Required: false }
		],
		StateOutputs: [
			{ Name: 'Response', DataType: 'Object' }
		],
		DefaultSettings: { URL: '', Method: 'GET', ContentType: 'application/json', Headers: '', Body: '', Destination: '', Retries: 0 }
	},

	// ── Meadow ─────────────────────────────────────────────────────
	{
		Hash: 'meadow-read',
		Name: 'Meadow Read',
		Description: 'Reads a single record by ID from a Meadow REST endpoint.',
		Category: 'meadow',
		Capability: 'Meadow API',
		Action: 'Read',
		Tier: 'Service',
		EventInputs: [{ Name: 'Trigger' }],
		EventOutputs: [
			{ Name: 'Complete' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'Entity', DataType: 'String', Required: true },
			{ Name: 'Endpoint', DataType: 'String', Required: true },
			{ Name: 'RecordID', DataType: 'String', Required: true },
			{ Name: 'Destination', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Record', DataType: 'Object' }
		],
		DefaultSettings: { Entity: '', Endpoint: '', RecordID: '', Destination: '' }
	},
	{
		Hash: 'meadow-reads',
		Name: 'Meadow Reads',
		Description: 'Reads multiple records from a Meadow REST endpoint with optional filter.',
		Category: 'meadow',
		Capability: 'Meadow API',
		Action: 'ReadMany',
		Tier: 'Service',
		EventInputs: [{ Name: 'Trigger' }],
		EventOutputs: [
			{ Name: 'Complete' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'Entity', DataType: 'String', Required: true },
			{ Name: 'Endpoint', DataType: 'String', Required: true },
			{ Name: 'Filter', DataType: 'String', Required: false },
			{ Name: 'Destination', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Records', DataType: 'Array' }
		],
		DefaultSettings: { Entity: '', Endpoint: '', Filter: '', Destination: '' }
	},
	{
		Hash: 'meadow-create',
		Name: 'Meadow Create',
		Description: 'Creates a new record via a Meadow REST endpoint.',
		Category: 'meadow',
		Capability: 'Meadow API',
		Action: 'Create',
		Tier: 'Service',
		EventInputs: [{ Name: 'Trigger' }],
		EventOutputs: [
			{ Name: 'Complete' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'Entity', DataType: 'String', Required: true },
			{ Name: 'Endpoint', DataType: 'String', Required: true },
			{ Name: 'DataAddress', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Created', DataType: 'Object' }
		],
		DefaultSettings: { Entity: '', Endpoint: '', DataAddress: '' }
	},
	{
		Hash: 'meadow-update',
		Name: 'Meadow Update',
		Description: 'Updates a record via a Meadow REST endpoint.',
		Category: 'meadow',
		Capability: 'Meadow API',
		Action: 'Update',
		Tier: 'Service',
		EventInputs: [{ Name: 'Trigger' }],
		EventOutputs: [
			{ Name: 'Complete' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'Entity', DataType: 'String', Required: true },
			{ Name: 'Endpoint', DataType: 'String', Required: true },
			{ Name: 'DataAddress', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Updated', DataType: 'Object' }
		],
		DefaultSettings: { Entity: '', Endpoint: '', DataAddress: '' }
	},
	{
		Hash: 'meadow-delete',
		Name: 'Meadow Delete',
		Description: 'Deletes a record by ID via a Meadow REST endpoint.',
		Category: 'meadow',
		Capability: 'Meadow API',
		Action: 'Delete',
		Tier: 'Service',
		EventInputs: [{ Name: 'Trigger' }],
		EventOutputs: [
			{ Name: 'Done' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'Entity', DataType: 'String', Required: true },
			{ Name: 'Endpoint', DataType: 'String', Required: true },
			{ Name: 'RecordID', DataType: 'String', Required: true }
		],
		StateOutputs: [],
		DefaultSettings: { Entity: '', Endpoint: '', RecordID: '' }
	},
	{
		Hash: 'meadow-count',
		Name: 'Meadow Count',
		Description: 'Counts records for an entity via a Meadow REST endpoint.',
		Category: 'meadow',
		Capability: 'Meadow API',
		Action: 'Count',
		Tier: 'Service',
		EventInputs: [{ Name: 'Trigger' }],
		EventOutputs: [
			{ Name: 'Complete' },
			{ Name: 'Error', IsError: true }
		],
		SettingsInputs: [
			{ Name: 'Entity', DataType: 'String', Required: true },
			{ Name: 'Endpoint', DataType: 'String', Required: true },
			{ Name: 'Destination', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Count', DataType: 'Number' }
		],
		DefaultSettings: { Entity: '', Endpoint: '', Destination: '' }
	},

	// ── Data / Pipeline ────────────────────────────────────────────
	{
		Hash: 'parse-csv',
		Name: 'Parse CSV',
		Description: 'Parses CSV text into an array of records.',
		Category: 'pipeline',
		Capability: 'Data Transform',
		Action: 'ParseCSV',
		Tier: 'Engine',
		EventInputs: [{ Name: 'Execute' }],
		EventOutputs: [{ Name: 'Complete' }],
		SettingsInputs: [
			{ Name: 'SourceAddress', DataType: 'String', Required: false },
			{ Name: 'Delimiter', DataType: 'String', Required: false },
			{ Name: 'HasHeaders', DataType: 'Boolean', Required: false },
			{ Name: 'Destination', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Records', DataType: 'Array' }
		],
		DefaultSettings: { SourceAddress: '', Delimiter: ',', HasHeaders: true, Destination: '' }
	},
	{
		Hash: 'csv-transform',
		Name: 'CSV Transform',
		Description: 'Transforms parsed CSV records using a template per row.',
		Category: 'pipeline',
		Capability: 'Data Transform',
		Action: 'TransformCSV',
		Tier: 'Engine',
		EventInputs: [{ Name: 'Execute' }],
		EventOutputs: [{ Name: 'Complete' }],
		SettingsInputs: [
			{ Name: 'SourceAddress', DataType: 'String', Required: false },
			{ Name: 'Destination', DataType: 'String', Required: false },
			{ Name: 'Delimiter', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Records', DataType: 'Array' }
		],
		DefaultSettings: { SourceAddress: '', Destination: '', Delimiter: ',' }
	},
	{
		Hash: 'comprehension-intersect',
		Name: 'Comprehension Intersect',
		Description: 'Intersects two arrays by matching a common field.',
		Category: 'pipeline',
		Capability: 'Data Transform',
		Action: 'Intersect',
		Tier: 'Engine',
		EventInputs: [{ Name: 'Execute' }],
		EventOutputs: [{ Name: 'Complete' }],
		SettingsInputs: [
			{ Name: 'SourceAddressA', DataType: 'String', Required: true },
			{ Name: 'SourceAddressB', DataType: 'String', Required: true },
			{ Name: 'MatchField', DataType: 'String', Required: false },
			{ Name: 'Destination', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Result', DataType: 'Array' }
		],
		DefaultSettings: { SourceAddressA: '', SourceAddressB: '', MatchField: '', Destination: '' }
	},
	{
		Hash: 'histogram',
		Name: 'Histogram',
		Description: 'Computes a frequency distribution over a field in a dataset.',
		Category: 'pipeline',
		Capability: 'Data Transform',
		Action: 'Histogram',
		Tier: 'Engine',
		EventInputs: [{ Name: 'Execute' }],
		EventOutputs: [{ Name: 'Complete' }],
		SettingsInputs: [
			{ Name: 'SourceAddress', DataType: 'String', Required: false },
			{ Name: 'Field', DataType: 'String', Required: false },
			{ Name: 'Bins', DataType: 'Number', Required: false },
			{ Name: 'Destination', DataType: 'String', Required: false }
		],
		StateOutputs: [
			{ Name: 'Stats', DataType: 'Object' }
		],
		DefaultSettings: { SourceAddress: '', Field: 'score', Bins: 5, Destination: '' }
	}
];


// ═══════════════════════════════════════════════════════════════════════
//  VISUAL OVERRIDES per card hash
//  These preserve the hand-crafted styling from the original card files.
// ═══════════════════════════════════════════════════════════════════════

const _CardOverrides =
{
	// ── Interaction ─────────────────────────────────────────────
	'error-message':
	{
		Width: 220
	},
	'value-input':
	{
		// Amber palette instead of default Interaction red
		TitleBarColor: '#f57f17',
		BodyStyle: { fill: '#fffde7', stroke: '#f57f17' },
		Width: 220
	},

	// ── Control ────────────────────────────────────────────────
	'if-conditional':
	{
		// False branch goes to bottom for visual branching
		Outputs:
		[
			{ Name: 'True', Side: 'right-bottom', PortType: 'event-out' },
			{ Name: 'False', Side: 'bottom', PortType: 'event-out' },
			{ Name: 'Result', Side: 'right-top', PortType: 'value' }
		]
	},
	'split-execute':
	{
		// Teal palette to distinguish from other Control cards
		TitleBarColor: '#00695c',
		BodyStyle: { fill: '#e0f2f1', stroke: '#00695c' },
		// Custom output positions for the two event paths
		Outputs:
		[
			{ Name: 'TokenDataSent', Side: 'right-bottom', PortType: 'event-out' },
			{ Name: 'CompletedAllSubtasks', Side: 'right-bottom', PortType: 'event-out' },
			{ Name: 'Error', Side: 'bottom', PortType: 'error' },
			{ Name: 'CurrentToken', Side: 'right-top', PortType: 'value' },
			{ Name: 'TokenIndex', Side: 'right-top', PortType: 'value' },
			{ Name: 'TokenCount', Side: 'right-top', PortType: 'value' },
			{ Name: 'CompletedCount', Side: 'right-top', PortType: 'value' }
		]
	}
};


// ═══════════════════════════════════════════════════════════════════════
//  FLOW MARKER CONFIGS (no backend task type)
// ═══════════════════════════════════════════════════════════════════════

const _FlowMarkerConfigs =
[
	// ── Start ──────────────────────────────────────────────────
	{
		Title: 'Start',
		Code: 'start',
		Description: 'Entry point for the workflow.',
		Category: 'Flow Control',
		Capability: 'Flow Control',
		Action: 'Begin',
		Tier: 'Engine',
		TitleBarColor: '#455a64',
		BodyStyle: { fill: '#eceff1', stroke: '#455a64' },
		Width: 140,
		Height: 80,
		Inputs: [],
		Outputs:
		[
			{ Name: 'Out', Side: 'right-bottom', PortType: 'event-out' }
		]
	},
	// ── End ────────────────────────────────────────────────────
	{
		Title: 'End',
		Code: 'end',
		Description: 'Termination point for the workflow.',
		Category: 'Flow Control',
		Capability: 'Flow Control',
		Action: 'End',
		Tier: 'Engine',
		TitleBarColor: '#455a64',
		BodyStyle: { fill: '#eceff1', stroke: '#455a64' },
		Width: 140,
		Height: 80,
		Inputs:
		[
			{ Name: 'In', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 1, MaximumInputCount: 5 }
		],
		Outputs: []
	}
];


// ═══════════════════════════════════════════════════════════════════════
//  BUILD FINAL CONFIG ARRAY
// ═══════════════════════════════════════════════════════════════════════

let _BuiltInCardConfigs = [];

// Generate configs for all 31 task-matched cards
for (let i = 0; i < _TaskDefinitions.length; i++)
{
	let tmpDef = _TaskDefinitions[i];
	let tmpOverrides = _CardOverrides[tmpDef.Hash] || null;
	let tmpCardConfig = generateCardConfig(tmpDef, tmpOverrides);

	if (tmpCardConfig)
	{
		_BuiltInCardConfigs.push(tmpCardConfig);
	}
}

// Append the 2 flow marker cards
for (let i = 0; i < _FlowMarkerConfigs.length; i++)
{
	_BuiltInCardConfigs.push(_FlowMarkerConfigs[i]);
}

module.exports = _BuiltInCardConfigs;
module.exports.TaskDefinitions = _TaskDefinitions;
module.exports.FlowMarkerConfigs = _FlowMarkerConfigs;
