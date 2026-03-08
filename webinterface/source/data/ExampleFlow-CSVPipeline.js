/**
 * Example Flow: Config File Processor
 *
 * Demonstrates a file-based config processing pipeline using the new engine task types:
 *   Start -> Read File (config template) -> If Conditional (has placeholder?)
 *     -> True:  Replace String (fill in value) -> Write File (output config) -> End
 *     -> False: Error Message (missing placeholder) -> End
 *
 * Shows branching, error handling, and file I/O with the event-driven execution engine.
 */
module.exports =
{
	Nodes:
	[
		// ── Entry ────────────────────────────────────────────────
		{
			Hash: 'cfg-start',
			Type: 'start',
			X: 50,
			Y: 200,
			Width: 140,
			Height: 80,
			Title: 'Start',
			Ports:
			[
				{ Hash: 'cfg-start-out', Direction: 'output', Side: 'right', Label: 'Out' }
			],
			Data: {}
		},
		// ── Read the config template ─────────────────────────────
		{
			Hash: 'cfg-read',
			Type: 'read-file',
			X: 270,
			Y: 180,
			Width: 200,
			Height: 80,
			Title: 'Read Config Template',
			Ports:
			[
				{ Hash: 'cfg-read-in', Direction: 'input', Side: 'left', Label: 'BeginRead' },
				{ Hash: 'cfg-read-done', Direction: 'output', Side: 'right', Label: 'ReadComplete' },
				{ Hash: 'cfg-read-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { FilePath: 'config.template.json', Encoding: 'utf8' }
		},
		// ── Check if placeholder exists in the content ───────────
		{
			Hash: 'cfg-check',
			Type: 'if-conditional',
			X: 550,
			Y: 160,
			Width: 220,
			Height: 100,
			Title: 'Has Placeholder?',
			Ports:
			[
				{ Hash: 'cfg-check-in', Direction: 'input', Side: 'left', Label: 'Evaluate' },
				{ Hash: 'cfg-check-true', Direction: 'output', Side: 'right', Label: 'True' },
				{ Hash: 'cfg-check-false', Direction: 'output', Side: 'bottom', Label: 'False' }
			],
			Data: { DataAddress: 'TaskOutput.cfg-read.FileContent', CompareValue: '{{API_KEY}}', Operator: 'contains' }
		},
		// ── Replace the placeholder with the real value ──────────
		{
			Hash: 'cfg-replace',
			Type: 'replace-string',
			X: 850,
			Y: 140,
			Width: 220,
			Height: 80,
			Title: 'Fill In API Key',
			Ports:
			[
				{ Hash: 'cfg-replace-in', Direction: 'input', Side: 'left', Label: 'Replace' },
				{ Hash: 'cfg-replace-done', Direction: 'output', Side: 'right', Label: 'ReplaceComplete' },
				{ Hash: 'cfg-replace-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { InputString: '{~D:TaskOutput.cfg-read.FileContent~}', SearchString: '{{API_KEY}}', ReplaceString: 'sk-live-abc123def456' }
		},
		// ── Write the processed config ──────────────────────────
		{
			Hash: 'cfg-write',
			Type: 'write-file',
			X: 1150,
			Y: 140,
			Width: 200,
			Height: 80,
			Title: 'Write Config',
			Ports:
			[
				{ Hash: 'cfg-write-in', Direction: 'input', Side: 'left', Label: 'BeginWrite' },
				{ Hash: 'cfg-write-done', Direction: 'output', Side: 'right', Label: 'WriteComplete' },
				{ Hash: 'cfg-write-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { FilePath: 'config.json', Content: '{~D:TaskOutput.cfg-replace.ReplacedString~}', Encoding: 'utf8' }
		},
		// ── Error: placeholder not found ─────────────────────────
		{
			Hash: 'cfg-error',
			Type: 'error-message',
			X: 850,
			Y: 340,
			Width: 220,
			Height: 80,
			Title: 'Missing Placeholder',
			Ports:
			[
				{ Hash: 'cfg-error-in', Direction: 'input', Side: 'left', Label: 'Trigger' },
				{ Hash: 'cfg-error-done', Direction: 'output', Side: 'right', Label: 'Complete' }
			],
			Data: { MessageTemplate: 'Config template does not contain the {{API_KEY}} placeholder' }
		},
		// ── Exit ─────────────────────────────────────────────────
		{
			Hash: 'cfg-end',
			Type: 'end',
			X: 1430,
			Y: 220,
			Width: 140,
			Height: 80,
			Title: 'End',
			Ports:
			[
				{ Hash: 'cfg-end-in', Direction: 'input', Side: 'left', Label: 'In' }
			],
			Data: {}
		}
	],
	Connections:
	[
		// Start -> Read Config Template
		{
			Hash: 'cfg-c1',
			SourceNodeHash: 'cfg-start',
			SourcePortHash: 'cfg-start-out',
			TargetNodeHash: 'cfg-read',
			TargetPortHash: 'cfg-read-in',
			Data: {}
		},
		// Read Config Template -> Has Placeholder?
		{
			Hash: 'cfg-c2',
			SourceNodeHash: 'cfg-read',
			SourcePortHash: 'cfg-read-done',
			TargetNodeHash: 'cfg-check',
			TargetPortHash: 'cfg-check-in',
			Data: {}
		},
		// Has Placeholder? (True) -> Fill In API Key
		{
			Hash: 'cfg-c3',
			SourceNodeHash: 'cfg-check',
			SourcePortHash: 'cfg-check-true',
			TargetNodeHash: 'cfg-replace',
			TargetPortHash: 'cfg-replace-in',
			Data: {}
		},
		// Fill In API Key -> Write Config
		{
			Hash: 'cfg-c4',
			SourceNodeHash: 'cfg-replace',
			SourcePortHash: 'cfg-replace-done',
			TargetNodeHash: 'cfg-write',
			TargetPortHash: 'cfg-write-in',
			Data: {}
		},
		// Write Config -> End
		{
			Hash: 'cfg-c5',
			SourceNodeHash: 'cfg-write',
			SourcePortHash: 'cfg-write-done',
			TargetNodeHash: 'cfg-end',
			TargetPortHash: 'cfg-end-in',
			Data: {}
		},
		// Has Placeholder? (False) -> Missing Placeholder
		{
			Hash: 'cfg-c6',
			SourceNodeHash: 'cfg-check',
			SourcePortHash: 'cfg-check-false',
			TargetNodeHash: 'cfg-error',
			TargetPortHash: 'cfg-error-in',
			Data: {}
		},
		// Missing Placeholder -> End
		{
			Hash: 'cfg-c7',
			SourceNodeHash: 'cfg-error',
			SourcePortHash: 'cfg-error-done',
			TargetNodeHash: 'cfg-end',
			TargetPortHash: 'cfg-end-in',
			Data: {}
		},
		// Read Config Template error -> End
		{
			Hash: 'cfg-c8',
			SourceNodeHash: 'cfg-read',
			SourcePortHash: 'cfg-read-err',
			TargetNodeHash: 'cfg-end',
			TargetPortHash: 'cfg-end-in',
			Data: {}
		},
		// Fill In API Key error -> End
		{
			Hash: 'cfg-c9',
			SourceNodeHash: 'cfg-replace',
			SourcePortHash: 'cfg-replace-err',
			TargetNodeHash: 'cfg-end',
			TargetPortHash: 'cfg-end-in',
			Data: {}
		},
		// Write Config error -> End
		{
			Hash: 'cfg-c10',
			SourceNodeHash: 'cfg-write',
			SourcePortHash: 'cfg-write-err',
			TargetNodeHash: 'cfg-end',
			TargetPortHash: 'cfg-end-in',
			Data: {}
		}
	],
	ViewState:
	{
		PanX: 0,
		PanY: 0,
		Zoom: 1,
		SelectedNodeHash: null,
		SelectedConnectionHash: null
	}
};
