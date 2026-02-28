/**
 * Example Flow: Meadow Data Pipeline
 *
 * Demonstrates a Meadow integration workflow:
 *   Start → Read JSON seed data → Meadow Create records → Meadow Reads (fetch all)
 *     → Meadow Count → CSV Transform → Write CSV export → End
 *
 * Uses the meadow-integration test-small.json demo data:
 *   [
 *     { id: "1", name: "Alice", city: "Seattle", country: "USA", score: "95" },
 *     { id: "2", name: "Bob", city: "Portland", country: "USA", score: "87" },
 *     { id: "3", name: "Carol", city: "Vancouver", country: "CAN", score: "92" },
 *     { id: "4", name: "Dave", city: "Seattle", country: "USA", score: "78" },
 *     { id: "5", name: "Eve", city: "Portland", country: "USA", score: "88" }
 *   ]
 */
module.exports =
{
	Nodes:
	[
		// ── Entry ────────────────────────────────────────────────
		{
			Hash: 'mdw-start',
			Type: 'start',
			X: 50,
			Y: 220,
			Width: 140,
			Height: 80,
			Title: 'Start',
			Ports:
			[
				{ Hash: 'mdw-start-out', Direction: 'output', Side: 'right', Label: 'Out' }
			],
			Data: {}
		},
		// ── Read seed data from JSON file ────────────────────────
		{
			Hash: 'mdw-readjson',
			Type: 'RJSON',
			X: 270,
			Y: 200,
			Width: 180,
			Height: 80,
			Title: 'Read Seed Data',
			Ports:
			[
				{ Hash: 'mdw-rj-in', Direction: 'input', Side: 'left', Label: 'Trigger' },
				{ Hash: 'mdw-rj-data', Direction: 'output', Side: 'right', Label: 'Data' },
				{ Hash: 'mdw-rj-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { File: 'test-small.json', Destination: 'SeedData' }
		},
		// ── Create records via Meadow ────────────────────────────
		{
			Hash: 'mdw-create',
			Type: 'MCREATE',
			X: 530,
			Y: 200,
			Width: 200,
			Height: 80,
			Title: 'Create Persons',
			Ports:
			[
				{ Hash: 'mdw-mc-in', Direction: 'input', Side: 'left', Label: 'Data' },
				{ Hash: 'mdw-mc-out', Direction: 'output', Side: 'right', Label: 'Created' },
				{ Hash: 'mdw-mc-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { Entity: 'Person', Endpoint: '/1.0/Person', DataAddress: 'SeedData' }
		},
		// ── Read all records back ────────────────────────────────
		{
			Hash: 'mdw-reads',
			Type: 'MREADS',
			X: 810,
			Y: 200,
			Width: 200,
			Height: 80,
			Title: 'Read All Persons',
			Ports:
			[
				{ Hash: 'mdw-mr-in', Direction: 'input', Side: 'left', Label: 'Trigger' },
				{ Hash: 'mdw-mr-out', Direction: 'output', Side: 'right', Label: 'Records' },
				{ Hash: 'mdw-mr-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { Entity: 'Person', Endpoint: '/1.0/Persons/0/100', Filter: '', Destination: 'AllPersons' }
		},
		// ── Count records ────────────────────────────────────────
		{
			Hash: 'mdw-count',
			Type: 'MCOUNT',
			X: 810,
			Y: 380,
			Width: 200,
			Height: 80,
			Title: 'Count Persons',
			Ports:
			[
				{ Hash: 'mdw-cnt-in', Direction: 'input', Side: 'left', Label: 'Trigger' },
				{ Hash: 'mdw-cnt-out', Direction: 'output', Side: 'right', Label: 'Count' },
				{ Hash: 'mdw-cnt-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { Entity: 'Person', Endpoint: '/1.0/Persons/Count', Destination: 'PersonCount' }
		},
		// ── Transform to CSV format ──────────────────────────────
		{
			Hash: 'mdw-csvxf',
			Type: 'CSVXF',
			X: 1090,
			Y: 200,
			Width: 200,
			Height: 80,
			Title: 'To CSV Format',
			Ports:
			[
				{ Hash: 'mdw-xf-in', Direction: 'input', Side: 'left', Label: 'CSV Data' },
				{ Hash: 'mdw-xf-out', Direction: 'output', Side: 'right', Label: 'Records' }
			],
			Data: { SourceAddress: 'AllPersons', Destination: 'CSVOutput', Delimiter: ',' }
		},
		// ── Write the CSV export ─────────────────────────────────
		{
			Hash: 'mdw-writetext',
			Type: 'WTXT',
			X: 1370,
			Y: 200,
			Width: 180,
			Height: 80,
			Title: 'Write CSV Export',
			Ports:
			[
				{ Hash: 'mdw-wt-in', Direction: 'input', Side: 'left', Label: 'Data' },
				{ Hash: 'mdw-wt-done', Direction: 'output', Side: 'right', Label: 'Done' },
				{ Hash: 'mdw-wt-err', Direction: 'output', Side: 'bottom', Label: 'Error' }
			],
			Data: { File: 'persons-export.csv', Address: 'CSVOutput' }
		},
		// ── Template: generate summary ───────────────────────────
		{
			Hash: 'mdw-template',
			Type: 'TMPL',
			X: 1090,
			Y: 380,
			Width: 190,
			Height: 80,
			Title: 'Build Summary',
			Ports:
			[
				{ Hash: 'mdw-tmpl-in', Direction: 'input', Side: 'left', Label: 'In' },
				{ Hash: 'mdw-tmpl-out', Direction: 'output', Side: 'right', Label: 'Result' }
			],
			Data: { Template: 'Processed {PersonCount} person records', Destination: 'SummaryText' }
		},
		// ── Exit ─────────────────────────────────────────────────
		{
			Hash: 'mdw-end',
			Type: 'end',
			X: 1630,
			Y: 260,
			Width: 140,
			Height: 80,
			Title: 'End',
			Ports:
			[
				{ Hash: 'mdw-end-in', Direction: 'input', Side: 'left', Label: 'In' }
			],
			Data: {}
		}
	],
	Connections:
	[
		// Start → Read Seed Data
		{
			Hash: 'mdw-c1',
			SourceNodeHash: 'mdw-start',
			SourcePortHash: 'mdw-start-out',
			TargetNodeHash: 'mdw-readjson',
			TargetPortHash: 'mdw-rj-in',
			Data: {}
		},
		// Read Seed Data → Create Persons
		{
			Hash: 'mdw-c2',
			SourceNodeHash: 'mdw-readjson',
			SourcePortHash: 'mdw-rj-data',
			TargetNodeHash: 'mdw-create',
			TargetPortHash: 'mdw-mc-in',
			Data: {}
		},
		// Create Persons → Read All Persons
		{
			Hash: 'mdw-c3',
			SourceNodeHash: 'mdw-create',
			SourcePortHash: 'mdw-mc-out',
			TargetNodeHash: 'mdw-reads',
			TargetPortHash: 'mdw-mr-in',
			Data: {}
		},
		// Read All Persons → To CSV Format
		{
			Hash: 'mdw-c4',
			SourceNodeHash: 'mdw-reads',
			SourcePortHash: 'mdw-mr-out',
			TargetNodeHash: 'mdw-csvxf',
			TargetPortHash: 'mdw-xf-in',
			Data: {}
		},
		// To CSV Format → Write CSV Export
		{
			Hash: 'mdw-c5',
			SourceNodeHash: 'mdw-csvxf',
			SourcePortHash: 'mdw-xf-out',
			TargetNodeHash: 'mdw-writetext',
			TargetPortHash: 'mdw-wt-in',
			Data: {}
		},
		// Write CSV Export → End
		{
			Hash: 'mdw-c6',
			SourceNodeHash: 'mdw-writetext',
			SourcePortHash: 'mdw-wt-done',
			TargetNodeHash: 'mdw-end',
			TargetPortHash: 'mdw-end-in',
			Data: {}
		},
		// Create Persons → Count Persons (parallel branch)
		{
			Hash: 'mdw-c7',
			SourceNodeHash: 'mdw-create',
			SourcePortHash: 'mdw-mc-out',
			TargetNodeHash: 'mdw-count',
			TargetPortHash: 'mdw-cnt-in',
			Data: {}
		},
		// Count Persons → Build Summary
		{
			Hash: 'mdw-c8',
			SourceNodeHash: 'mdw-count',
			SourcePortHash: 'mdw-cnt-out',
			TargetNodeHash: 'mdw-template',
			TargetPortHash: 'mdw-tmpl-in',
			Data: {}
		},
		// Build Summary → End
		{
			Hash: 'mdw-c9',
			SourceNodeHash: 'mdw-template',
			SourcePortHash: 'mdw-tmpl-out',
			TargetNodeHash: 'mdw-end',
			TargetPortHash: 'mdw-end-in',
			Data: {}
		},
		// Read Seed Data error → End
		{
			Hash: 'mdw-c10',
			SourceNodeHash: 'mdw-readjson',
			SourcePortHash: 'mdw-rj-err',
			TargetNodeHash: 'mdw-end',
			TargetPortHash: 'mdw-end-in',
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
