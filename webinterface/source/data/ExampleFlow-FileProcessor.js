/**
 * Example Flow: File Processor (Search & Replace)
 *
 * Demonstrates a complete file processing pipeline with user input, looping,
 * and error handling:
 *
 *   Start
 *     -> Value Input (ask user for file path, stores to Operation.InputFilePath)
 *     -> Read File (loads the file at the user-provided path)
 *         -> [Error] -> Error Message -> End
 *     -> Split Execute (split file into lines)
 *         -> [per line] Replace String ("John" -> "Jane")
 *         -> String Appender (accumulate into Operation.OutputFileContents)
 *         -> [loop back: Append Completed -> Split StepComplete]
 *     -> [all lines done] Write File (save to original path + ".ultracopy")
 *     -> End
 *
 * This example showcases:
 *   - Value input pausing execution for user interaction
 *   - State connections (data flow between task settings/outputs)
 *   - The split-execute looping pattern with StepComplete feedback
 *   - Error branching
 *   - Pict template expressions for dynamic file paths
 */
module.exports =
{
	Nodes:
	[
		// ── Start ────────────────────────────────────────────────
		{
			Hash: 'fp-start',
			Type: 'start',
			X: 50,
			Y: 200,
			Width: 140,
			Height: 80,
			Title: 'Start',
			Ports:
			[
				{ Hash: 'fp-start-out', Direction: 'output', Side: 'right', Label: 'Out' }
			],
			Data: {}
		},
		// ── Ask user for file path ───────────────────────────────
		{
			Hash: 'fp-input',
			Type: 'value-input',
			X: 280,
			Y: 180,
			Width: 220,
			Height: 100,
			Title: 'Enter File Path',
			Ports:
			[
				{ Hash: 'fp-input-req', Direction: 'input', Side: 'left-bottom', Label: 'RequestInput' },
				{ Hash: 'fp-input-done', Direction: 'output', Side: 'right', Label: 'ValueInputComplete' },
				{ Hash: 'fp-input-filepath', Direction: 'output', Side: 'right-top', Label: 'InputFilePath' }
			],
			Data: { PromptMessage: 'Enter a file path and name', OutputAddress: 'Operation.InputFilePath' }
		},
		// ── Load the file ────────────────────────────────────────
		{
			Hash: 'fp-read',
			Type: 'read-file',
			X: 590,
			Y: 180,
			Width: 200,
			Height: 100,
			Title: 'Load File',
			Ports:
			[
				{ Hash: 'fp-read-begin', Direction: 'input', Side: 'left-bottom', Label: 'BeginRead' },
				{ Hash: 'fp-read-filepath', Direction: 'input', Side: 'left-top', Label: 'FilePath' },
				{ Hash: 'fp-read-done', Direction: 'output', Side: 'right', Label: 'ReadComplete' },
				{ Hash: 'fp-read-content', Direction: 'output', Side: 'right-top', Label: 'FileContent' },
				{ Hash: 'fp-read-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { FilePath: '{~D:Record.Operation.InputFilePath~}', Encoding: 'utf8' }
		},
		// ── Error handler for file read ──────────────────────────
		{
			Hash: 'fp-error',
			Type: 'error-message',
			X: 590,
			Y: 420,
			Width: 220,
			Height: 80,
			Title: 'Read Error',
			Ports:
			[
				{ Hash: 'fp-error-in', Direction: 'input', Side: 'left-bottom', Label: 'Trigger' },
				{ Hash: 'fp-error-done', Direction: 'output', Side: 'right', Label: 'Complete' }
			],
			Data: { MessageTemplate: 'Failed to read file: {~D:Record.Operation.InputFilePath~}' }
		},
		// ── Split file into lines ────────────────────────────────
		{
			Hash: 'fp-split',
			Type: 'split-execute',
			X: 890,
			Y: 160,
			Width: 240,
			Height: 120,
			Title: 'Split Lines',
			Ports:
			[
				{ Hash: 'fp-split-begin', Direction: 'input', Side: 'left-bottom', Label: 'PerformSplit' },
				{ Hash: 'fp-split-step', Direction: 'input', Side: 'left-bottom', Label: 'StepComplete' },
				{ Hash: 'fp-split-inputstr', Direction: 'input', Side: 'left-top', Label: 'InputString' },
				{ Hash: 'fp-split-token', Direction: 'output', Side: 'right', Label: 'TokenDataSent' },
				{ Hash: 'fp-split-alldone', Direction: 'output', Side: 'right-bottom', Label: 'CompletedAllSubtasks' }
			],
			Data: { InputString: '{~D:Record.TaskOutput.fp-read.FileContent~}', SplitDelimiter: '\n' }
		},
		// ── Replace "John" with "Jane" in each line ──────────────
		{
			Hash: 'fp-replace',
			Type: 'replace-string',
			X: 1230,
			Y: 160,
			Width: 220,
			Height: 100,
			Title: 'Replace John with Jane',
			Ports:
			[
				{ Hash: 'fp-replace-in', Direction: 'input', Side: 'left-bottom', Label: 'Replace' },
				{ Hash: 'fp-replace-done', Direction: 'output', Side: 'right', Label: 'ReplaceComplete' },
				{ Hash: 'fp-replace-result', Direction: 'output', Side: 'right-top', Label: 'ReplacedString' }
			],
			Data: { InputString: '{~D:Record.TaskOutput.fp-split.CurrentToken~}', SearchString: 'John', ReplaceString: 'Jane' }
		},
		// ── Append each processed line to output ─────────────────
		{
			Hash: 'fp-append',
			Type: 'string-appender',
			X: 1540,
			Y: 160,
			Width: 220,
			Height: 100,
			Title: 'Append Line',
			Ports:
			[
				{ Hash: 'fp-append-in', Direction: 'input', Side: 'left-bottom', Label: 'Append' },
				{ Hash: 'fp-append-inputstr', Direction: 'input', Side: 'left-top', Label: 'InputString' },
				{ Hash: 'fp-append-done', Direction: 'output', Side: 'right', Label: 'Completed' }
			],
			Data: { InputString: '{~D:Record.TaskOutput.fp-replace.ReplacedString~}', OutputAddress: 'Operation.OutputFileContents', AppendNewline: true }
		},
		// ── Write the processed file ─────────────────────────────
		{
			Hash: 'fp-write',
			Type: 'write-file',
			X: 1230,
			Y: 420,
			Width: 220,
			Height: 80,
			Title: 'Save File',
			Ports:
			[
				{ Hash: 'fp-write-begin', Direction: 'input', Side: 'left-bottom', Label: 'BeginWrite' },
				{ Hash: 'fp-write-done', Direction: 'output', Side: 'right', Label: 'WriteComplete' },
				{ Hash: 'fp-write-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { FilePath: '{~D:Record.Operation.InputFilePath~}.ultracopy', Content: '{~D:Record.Operation.OutputFileContents~}', Encoding: 'utf8' }
		},
		// ── End ──────────────────────────────────────────────────
		{
			Hash: 'fp-end',
			Type: 'end',
			X: 1540,
			Y: 420,
			Width: 140,
			Height: 80,
			Title: 'End',
			Ports:
			[
				{ Hash: 'fp-end-in', Direction: 'input', Side: 'left-bottom', Label: 'In' }
			],
			Data: {}
		}
	],
	Connections:
	[
		// ── Event connections (execution flow) ───────────────────

		// Start -> Enter File Path (step 22)
		{
			Hash: 'fp-ev1',
			SourceNodeHash: 'fp-start',
			SourcePortHash: 'fp-start-out',
			TargetNodeHash: 'fp-input',
			TargetPortHash: 'fp-input-req',
			Data: {}
		},
		// Enter File Path -> Load File (step 23)
		{
			Hash: 'fp-ev2',
			SourceNodeHash: 'fp-input',
			SourcePortHash: 'fp-input-done',
			TargetNodeHash: 'fp-read',
			TargetPortHash: 'fp-read-begin',
			Data: {}
		},
		// Load File ReadComplete -> Split Lines PerformSplit (step 24)
		{
			Hash: 'fp-ev3',
			SourceNodeHash: 'fp-read',
			SourcePortHash: 'fp-read-done',
			TargetNodeHash: 'fp-split',
			TargetPortHash: 'fp-split-begin',
			Data: {}
		},
		// Load File Error -> Read Error (step 10)
		{
			Hash: 'fp-ev4',
			SourceNodeHash: 'fp-read',
			SourcePortHash: 'fp-read-err',
			TargetNodeHash: 'fp-error',
			TargetPortHash: 'fp-error-in',
			Data: {}
		},
		// Read Error -> End
		{
			Hash: 'fp-ev5',
			SourceNodeHash: 'fp-error',
			SourcePortHash: 'fp-error-done',
			TargetNodeHash: 'fp-end',
			TargetPortHash: 'fp-end-in',
			Data: {}
		},
		// Split Lines TokenDataSent -> Replace (step 25)
		{
			Hash: 'fp-ev6',
			SourceNodeHash: 'fp-split',
			SourcePortHash: 'fp-split-token',
			TargetNodeHash: 'fp-replace',
			TargetPortHash: 'fp-replace-in',
			Data: {}
		},
		// Replace ReplaceComplete -> Append (step 26)
		{
			Hash: 'fp-ev7',
			SourceNodeHash: 'fp-replace',
			SourcePortHash: 'fp-replace-done',
			TargetNodeHash: 'fp-append',
			TargetPortHash: 'fp-append-in',
			Data: {}
		},
		// Append Completed -> Split StepComplete (loop back for next token)
		{
			Hash: 'fp-ev8',
			SourceNodeHash: 'fp-append',
			SourcePortHash: 'fp-append-done',
			TargetNodeHash: 'fp-split',
			TargetPortHash: 'fp-split-step',
			Data: {}
		},
		// Split Lines CompletedAllSubtasks -> Save File
		{
			Hash: 'fp-ev9',
			SourceNodeHash: 'fp-split',
			SourcePortHash: 'fp-split-alldone',
			TargetNodeHash: 'fp-write',
			TargetPortHash: 'fp-write-begin',
			Data: {}
		},
		// Save File WriteComplete -> End (step 21)
		{
			Hash: 'fp-ev10',
			SourceNodeHash: 'fp-write',
			SourcePortHash: 'fp-write-done',
			TargetNodeHash: 'fp-end',
			TargetPortHash: 'fp-end-in',
			Data: {}
		},

		// ── State connections (data flow) ────────────────────────

		// Enter File Path OutputAddress -> Load File FilePath (step 8)
		{
			Hash: 'fp-st1',
			SourceNodeHash: 'fp-input',
			SourcePortHash: 'fp-input-filepath',
			TargetNodeHash: 'fp-read',
			TargetPortHash: 'fp-read-filepath',
			Data: {}
		},
		// Load File FileContent -> Split Lines InputString (step 13)
		{
			Hash: 'fp-st2',
			SourceNodeHash: 'fp-read',
			SourcePortHash: 'fp-read-content',
			TargetNodeHash: 'fp-split',
			TargetPortHash: 'fp-split-inputstr',
			Data: {}
		},
		// Replace ReplacedString -> Append InputString (step 15)
		{
			Hash: 'fp-st3',
			SourceNodeHash: 'fp-replace',
			SourcePortHash: 'fp-replace-result',
			TargetNodeHash: 'fp-append',
			TargetPortHash: 'fp-append-inputstr',
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
