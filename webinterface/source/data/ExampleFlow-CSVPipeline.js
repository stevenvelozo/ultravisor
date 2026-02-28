/**
 * Example Flow: CSV Pipeline
 *
 * Demonstrates a file-based data processing pipeline:
 *   Start → Read CSV File → Parse CSV → Histogram (score distribution) → Write JSON Results → End
 *
 * Uses the meadow-integration test-small.csv demo data:
 *   id, name, city, country, score
 *   1, Alice, Seattle, USA, 95
 *   2, Bob, Portland, USA, 87
 *   3, Carol, Vancouver, CAN, 92
 *   4, Dave, Seattle, USA, 78
 *   5, Eve, Portland, USA, 88
 */
module.exports =
{
	Nodes:
	[
		// ── Entry ────────────────────────────────────────────────
		{
			Hash: 'csv-start',
			Type: 'start',
			X: 50,
			Y: 200,
			Width: 140,
			Height: 80,
			Title: 'Start',
			Ports:
			[
				{ Hash: 'csv-start-out', Direction: 'output', Side: 'right', Label: 'Out' }
			],
			Data: {}
		},
		// ── Read the raw CSV text ────────────────────────────────
		{
			Hash: 'csv-readtext',
			Type: 'RTXT',
			X: 270,
			Y: 180,
			Width: 180,
			Height: 80,
			Title: 'Read CSV File',
			Ports:
			[
				{ Hash: 'csv-rt-in', Direction: 'input', Side: 'left', Label: 'Trigger' },
				{ Hash: 'csv-rt-data', Direction: 'output', Side: 'right', Label: 'Data' },
				{ Hash: 'csv-rt-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { File: 'test-small.csv', Destination: 'RawCSV' }
		},
		// ── Parse CSV into records ───────────────────────────────
		{
			Hash: 'csv-parse',
			Type: 'PARSECSV',
			X: 530,
			Y: 180,
			Width: 180,
			Height: 80,
			Title: 'Parse CSV',
			Ports:
			[
				{ Hash: 'csv-p-in', Direction: 'input', Side: 'left', Label: 'Raw Text' },
				{ Hash: 'csv-p-out', Direction: 'output', Side: 'right', Label: 'Records' }
			],
			Data: { Delimiter: ',', HasHeaders: true, Destination: 'ParsedRecords' }
		},
		// ── Conditional: check we have records ───────────────────
		{
			Hash: 'csv-cond',
			Type: 'COND',
			X: 790,
			Y: 160,
			Width: 200,
			Height: 100,
			Title: 'Has Records?',
			Ports:
			[
				{ Hash: 'csv-cond-in', Direction: 'input', Side: 'left', Label: 'In' },
				{ Hash: 'csv-cond-true', Direction: 'output', Side: 'right', Label: 'True' },
				{ Hash: 'csv-cond-false', Direction: 'output', Side: 'bottom', Label: 'False' }
			],
			Data: { Address: 'ParsedRecords.length', Value: '0', Operator: '>' }
		},
		// ── Histogram: visualize score distribution ──────────────
		{
			Hash: 'csv-histogram',
			Type: 'HIST',
			X: 1070,
			Y: 140,
			Width: 240,
			Height: 140,
			Title: 'Score Distribution',
			Ports:
			[
				{ Hash: 'csv-hist-in', Direction: 'input', Side: 'left', Label: 'Data' },
				{ Hash: 'csv-hist-out', Direction: 'output', Side: 'right', Label: 'Stats' }
			],
			Data: { Field: 'score', Bins: 5, Values: [95, 87, 92, 78, 88], Destination: 'HistogramStats' }
		},
		// ── Write the histogram results as JSON ──────────────────
		{
			Hash: 'csv-writejson',
			Type: 'WJSON',
			X: 1390,
			Y: 180,
			Width: 180,
			Height: 80,
			Title: 'Write Results',
			Ports:
			[
				{ Hash: 'csv-wj-in', Direction: 'input', Side: 'left', Label: 'Data' },
				{ Hash: 'csv-wj-done', Direction: 'output', Side: 'right', Label: 'Done' },
				{ Hash: 'csv-wj-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { File: 'histogram-results.json', Address: 'HistogramStats' }
		},
		// ── Solver: compute the average score ────────────────────
		{
			Hash: 'csv-solver',
			Type: 'SOLV',
			X: 1070,
			Y: 380,
			Width: 180,
			Height: 80,
			Title: 'Compute Average',
			Ports:
			[
				{ Hash: 'csv-solv-in', Direction: 'input', Side: 'left', Label: 'In' },
				{ Hash: 'csv-solv-out', Direction: 'output', Side: 'right', Label: 'Result' }
			],
			Data: { Expression: 'Average = (95 + 87 + 92 + 78 + 88) / 5', Destination: 'AverageScore' }
		},
		// ── Exit ─────────────────────────────────────────────────
		{
			Hash: 'csv-end',
			Type: 'end',
			X: 1650,
			Y: 200,
			Width: 140,
			Height: 80,
			Title: 'End',
			Ports:
			[
				{ Hash: 'csv-end-in', Direction: 'input', Side: 'left', Label: 'In' }
			],
			Data: {}
		}
	],
	Connections:
	[
		// Start → Read CSV File
		{
			Hash: 'csv-c1',
			SourceNodeHash: 'csv-start',
			SourcePortHash: 'csv-start-out',
			TargetNodeHash: 'csv-readtext',
			TargetPortHash: 'csv-rt-in',
			Data: {}
		},
		// Read CSV File → Parse CSV
		{
			Hash: 'csv-c2',
			SourceNodeHash: 'csv-readtext',
			SourcePortHash: 'csv-rt-data',
			TargetNodeHash: 'csv-parse',
			TargetPortHash: 'csv-p-in',
			Data: {}
		},
		// Parse CSV → Has Records?
		{
			Hash: 'csv-c3',
			SourceNodeHash: 'csv-parse',
			SourcePortHash: 'csv-p-out',
			TargetNodeHash: 'csv-cond',
			TargetPortHash: 'csv-cond-in',
			Data: {}
		},
		// Has Records? (True) → Histogram
		{
			Hash: 'csv-c4',
			SourceNodeHash: 'csv-cond',
			SourcePortHash: 'csv-cond-true',
			TargetNodeHash: 'csv-histogram',
			TargetPortHash: 'csv-hist-in',
			Data: {}
		},
		// Histogram → Write Results
		{
			Hash: 'csv-c5',
			SourceNodeHash: 'csv-histogram',
			SourcePortHash: 'csv-hist-out',
			TargetNodeHash: 'csv-writejson',
			TargetPortHash: 'csv-wj-in',
			Data: {}
		},
		// Write Results → End
		{
			Hash: 'csv-c6',
			SourceNodeHash: 'csv-writejson',
			SourcePortHash: 'csv-wj-done',
			TargetNodeHash: 'csv-end',
			TargetPortHash: 'csv-end-in',
			Data: {}
		},
		// Has Records? (False) → Compute Average (alternative branch)
		{
			Hash: 'csv-c7',
			SourceNodeHash: 'csv-cond',
			SourcePortHash: 'csv-cond-false',
			TargetNodeHash: 'csv-solver',
			TargetPortHash: 'csv-solv-in',
			Data: {}
		},
		// Compute Average → End
		{
			Hash: 'csv-c8',
			SourceNodeHash: 'csv-solver',
			SourcePortHash: 'csv-solv-out',
			TargetNodeHash: 'csv-end',
			TargetPortHash: 'csv-end-in',
			Data: {}
		},
		// Read CSV File error → End
		{
			Hash: 'csv-c9',
			SourceNodeHash: 'csv-readtext',
			SourcePortHash: 'csv-rt-err',
			TargetNodeHash: 'csv-end',
			TargetPortHash: 'csv-end-in',
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
