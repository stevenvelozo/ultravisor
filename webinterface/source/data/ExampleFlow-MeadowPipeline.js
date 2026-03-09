/**
 * Example Flow: Template Processor
 *
 * Demonstrates a multi-step text processing pipeline using the new engine task types:
 *   Start -> Set Values (initialize project metadata)
 *         -> Read File (template)
 *         -> Replace String (project name)
 *         -> Replace String (version)
 *         -> If Conditional (check for remaining placeholders)
 *           -> True:  Error Message (warn about unresolved placeholders) -> End
 *           -> False: String Appender (add header comment) -> Write File (output) -> End
 *
 * Shows chained string operations, state management, and conditional validation.
 */
module.exports =
{
	Nodes:
	[
		// ── Entry ────────────────────────────────────────────────
		{
			Hash: 'tpl-start',
			Type: 'start',
			X: 50,
			Y: 220,
			Width: 140,
			Height: 80,
			Title: 'Start',
			Ports:
			[
				{ Hash: 'tpl-start-out', Direction: 'output', Side: 'right', Label: 'Out' }
			],
			Data: {}
		},
		// ── Initialize project metadata ─────────────────────────
		{
			Hash: 'tpl-setvals',
			Type: 'set-values',
			X: 270,
			Y: 200,
			Width: 200,
			Height: 80,
			Title: 'Set Project Info',
			Ports:
			[
				{ Hash: 'tpl-sv-in', Direction: 'input', Side: 'left', Label: 'Execute' },
				{ Hash: 'tpl-sv-out', Direction: 'output', Side: 'right', Label: 'Complete' }
			],
			Data:
			{
				Mappings:
				[
					{ Address: 'Operation.ProjectName', Value: 'Retold' },
					{ Address: 'Operation.Version', Value: '3.0.0' },
					{ Address: 'Operation.Author', Value: 'Steven Velozo' }
				]
			}
		},
		// ── Read the template file ──────────────────────────────
		{
			Hash: 'tpl-read',
			Type: 'read-file',
			X: 550,
			Y: 200,
			Width: 200,
			Height: 80,
			Title: 'Read Template',
			Ports:
			[
				{ Hash: 'tpl-read-in', Direction: 'input', Side: 'left', Label: 'BeginRead' },
				{ Hash: 'tpl-read-done', Direction: 'output', Side: 'right', Label: 'ReadComplete' },
				{ Hash: 'tpl-read-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { FilePath: 'readme.template.md', Encoding: 'utf8' }
		},
		// ── Replace project name placeholder ────────────────────
		{
			Hash: 'tpl-replace-name',
			Type: 'replace-string',
			X: 830,
			Y: 180,
			Width: 220,
			Height: 80,
			Title: 'Set Project Name',
			Ports:
			[
				{ Hash: 'tpl-rn-in', Direction: 'input', Side: 'left', Label: 'Replace' },
				{ Hash: 'tpl-rn-done', Direction: 'output', Side: 'right', Label: 'ReplaceComplete' },
				{ Hash: 'tpl-rn-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { InputString: '{~D:Record.TaskOutput.tpl-read.FileContent~}', SearchString: '${PROJECT_NAME}', ReplaceString: '{~D:Record.Operation.ProjectName~}' }
		},
		// ── Replace version placeholder ─────────────────────────
		{
			Hash: 'tpl-replace-ver',
			Type: 'replace-string',
			X: 1130,
			Y: 180,
			Width: 220,
			Height: 80,
			Title: 'Set Version',
			Ports:
			[
				{ Hash: 'tpl-rv-in', Direction: 'input', Side: 'left', Label: 'Replace' },
				{ Hash: 'tpl-rv-done', Direction: 'output', Side: 'right', Label: 'ReplaceComplete' },
				{ Hash: 'tpl-rv-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { InputString: '{~D:Record.TaskOutput.tpl-replace-name.ReplacedString~}', SearchString: '${VERSION}', ReplaceString: '{~D:Record.Operation.Version~}' }
		},
		// ── Check for remaining unresolved placeholders ─────────
		{
			Hash: 'tpl-validate',
			Type: 'if-conditional',
			X: 1430,
			Y: 160,
			Width: 240,
			Height: 100,
			Title: 'Unresolved Placeholders?',
			Ports:
			[
				{ Hash: 'tpl-val-in', Direction: 'input', Side: 'left', Label: 'Evaluate' },
				{ Hash: 'tpl-val-true', Direction: 'output', Side: 'bottom', Label: 'True' },
				{ Hash: 'tpl-val-false', Direction: 'output', Side: 'right', Label: 'False' }
			],
			Data: { DataAddress: 'TaskOutput.tpl-replace-ver.ReplacedString', CompareValue: '${', Operator: 'contains' }
		},
		// ── Error: unresolved placeholders remain ────────────────
		{
			Hash: 'tpl-warn',
			Type: 'error-message',
			X: 1430,
			Y: 380,
			Width: 240,
			Height: 80,
			Title: 'Warn: Unresolved',
			Ports:
			[
				{ Hash: 'tpl-warn-in', Direction: 'input', Side: 'left', Label: 'Trigger' },
				{ Hash: 'tpl-warn-done', Direction: 'output', Side: 'right', Label: 'Complete' }
			],
			Data: { MessageTemplate: 'Warning: Template still contains unresolved ${...} placeholders after processing' }
		},
		// ── Prepend a generated-by header comment ───────────────
		{
			Hash: 'tpl-header',
			Type: 'string-appender',
			X: 1750,
			Y: 160,
			Width: 220,
			Height: 80,
			Title: 'Add Header',
			Ports:
			[
				{ Hash: 'tpl-hdr-in', Direction: 'input', Side: 'left', Label: 'Append' },
				{ Hash: 'tpl-hdr-done', Direction: 'output', Side: 'right', Label: 'Completed' }
			],
			Data: { InputString: '{~D:Record.TaskOutput.tpl-replace-ver.ReplacedString~}', OutputAddress: 'Operation.FinalContent' }
		},
		// ── Write the processed output ──────────────────────────
		{
			Hash: 'tpl-write',
			Type: 'write-file',
			X: 2050,
			Y: 160,
			Width: 200,
			Height: 80,
			Title: 'Write Output',
			Ports:
			[
				{ Hash: 'tpl-write-in', Direction: 'input', Side: 'left', Label: 'BeginWrite' },
				{ Hash: 'tpl-write-done', Direction: 'output', Side: 'right', Label: 'WriteComplete' },
				{ Hash: 'tpl-write-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { FilePath: 'README.md', Content: '{~D:Record.Operation.FinalContent~}', Encoding: 'utf8' }
		},
		// ── Exit ─────────────────────────────────────────────────
		{
			Hash: 'tpl-end',
			Type: 'end',
			X: 2330,
			Y: 260,
			Width: 140,
			Height: 80,
			Title: 'End',
			Ports:
			[
				{ Hash: 'tpl-end-in', Direction: 'input', Side: 'left', Label: 'In' }
			],
			Data: {}
		}
	],
	Connections:
	[
		// Start -> Set Project Info
		{
			Hash: 'tpl-c1',
			SourceNodeHash: 'tpl-start',
			SourcePortHash: 'tpl-start-out',
			TargetNodeHash: 'tpl-setvals',
			TargetPortHash: 'tpl-sv-in',
			Data: {}
		},
		// Set Project Info -> Read Template
		{
			Hash: 'tpl-c2',
			SourceNodeHash: 'tpl-setvals',
			SourcePortHash: 'tpl-sv-out',
			TargetNodeHash: 'tpl-read',
			TargetPortHash: 'tpl-read-in',
			Data: {}
		},
		// Read Template -> Set Project Name
		{
			Hash: 'tpl-c3',
			SourceNodeHash: 'tpl-read',
			SourcePortHash: 'tpl-read-done',
			TargetNodeHash: 'tpl-replace-name',
			TargetPortHash: 'tpl-rn-in',
			Data: {}
		},
		// Set Project Name -> Set Version
		{
			Hash: 'tpl-c4',
			SourceNodeHash: 'tpl-replace-name',
			SourcePortHash: 'tpl-rn-done',
			TargetNodeHash: 'tpl-replace-ver',
			TargetPortHash: 'tpl-rv-in',
			Data: {}
		},
		// Set Version -> Unresolved Placeholders?
		{
			Hash: 'tpl-c5',
			SourceNodeHash: 'tpl-replace-ver',
			SourcePortHash: 'tpl-rv-done',
			TargetNodeHash: 'tpl-validate',
			TargetPortHash: 'tpl-val-in',
			Data: {}
		},
		// Unresolved Placeholders? (True) -> Warn
		{
			Hash: 'tpl-c6',
			SourceNodeHash: 'tpl-validate',
			SourcePortHash: 'tpl-val-true',
			TargetNodeHash: 'tpl-warn',
			TargetPortHash: 'tpl-warn-in',
			Data: {}
		},
		// Warn -> End
		{
			Hash: 'tpl-c7',
			SourceNodeHash: 'tpl-warn',
			SourcePortHash: 'tpl-warn-done',
			TargetNodeHash: 'tpl-end',
			TargetPortHash: 'tpl-end-in',
			Data: {}
		},
		// Unresolved Placeholders? (False) -> Add Header
		{
			Hash: 'tpl-c8',
			SourceNodeHash: 'tpl-validate',
			SourcePortHash: 'tpl-val-false',
			TargetNodeHash: 'tpl-header',
			TargetPortHash: 'tpl-hdr-in',
			Data: {}
		},
		// Add Header -> Write Output
		{
			Hash: 'tpl-c9',
			SourceNodeHash: 'tpl-header',
			SourcePortHash: 'tpl-hdr-done',
			TargetNodeHash: 'tpl-write',
			TargetPortHash: 'tpl-write-in',
			Data: {}
		},
		// Write Output -> End
		{
			Hash: 'tpl-c10',
			SourceNodeHash: 'tpl-write',
			SourcePortHash: 'tpl-write-done',
			TargetNodeHash: 'tpl-end',
			TargetPortHash: 'tpl-end-in',
			Data: {}
		},
		// Read Template error -> End
		{
			Hash: 'tpl-c11',
			SourceNodeHash: 'tpl-read',
			SourcePortHash: 'tpl-read-err',
			TargetNodeHash: 'tpl-end',
			TargetPortHash: 'tpl-end-in',
			Data: {}
		},
		// Set Project Name error -> End
		{
			Hash: 'tpl-c12',
			SourceNodeHash: 'tpl-replace-name',
			SourcePortHash: 'tpl-rn-err',
			TargetNodeHash: 'tpl-end',
			TargetPortHash: 'tpl-end-in',
			Data: {}
		},
		// Set Version error -> End
		{
			Hash: 'tpl-c13',
			SourceNodeHash: 'tpl-replace-ver',
			SourcePortHash: 'tpl-rv-err',
			TargetNodeHash: 'tpl-end',
			TargetPortHash: 'tpl-end-in',
			Data: {}
		},
		// Write Output error -> End
		{
			Hash: 'tpl-c14',
			SourceNodeHash: 'tpl-write',
			SourcePortHash: 'tpl-write-err',
			TargetNodeHash: 'tpl-end',
			TargetPortHash: 'tpl-end-in',
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
