/**
 * Built-in card configurations for Ultravisor.
 *
 * Task-matched cards are generated at runtime from definitions fetched via the
 * `/TaskType` API endpoint.  The `generateCardConfigs()` function converts an
 * array of Definition objects into PictFlowCard constructor options using the
 * CardConfigGenerator, applies per-card visual overrides, and appends the two
 * flow-marker cards (Start / End) which have no backend task type.
 *
 * Visual overrides and flow-marker configs are the only data defined here;
 * task definitions live in standalone JSON files consumed by both server and
 * client.
 */

const generateCardConfig = require('./Ultravisor-CardConfigGenerator.js');

// Card help content generated from docs/card-help/ markdown files.
// Falls back to an empty map if the module has not been generated yet.
let _CardHelpContent = {};
try
{
	_CardHelpContent = require('../card-help-content.js');
}
catch (pError)
{
	// No card help content available — Help tabs will not appear.
}


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
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Convert an array of task type Definition objects (from the `/TaskType` API)
 * into PictFlowCard constructor configs, applying visual overrides and
 * appending the Start / End flow markers.
 *
 * @param {Array} pDefinitions - Task type definitions fetched from the server.
 * @returns {Array} Ready-to-use PictFlowCard config objects.
 */
function generateCardConfigs(pDefinitions)
{
	let tmpConfigs = [];

	for (let i = 0; i < pDefinitions.length; i++)
	{
		let tmpOverrides = _CardOverrides[pDefinitions[i].Hash] || null;
		let tmpCardConfig = generateCardConfig(pDefinitions[i], tmpOverrides);

		if (tmpCardConfig)
		{
			// Inject help content if available for this card code
			if (_CardHelpContent[tmpCardConfig.Code])
			{
				tmpCardConfig.Help = _CardHelpContent[tmpCardConfig.Code];
			}
			tmpConfigs.push(tmpCardConfig);
		}
	}

	// Append the 2 flow marker cards with help content
	for (let i = 0; i < _FlowMarkerConfigs.length; i++)
	{
		let tmpMarkerConfig = Object.assign({}, _FlowMarkerConfigs[i]);
		if (_CardHelpContent[tmpMarkerConfig.Code])
		{
			tmpMarkerConfig.Help = _CardHelpContent[tmpMarkerConfig.Code];
		}
		tmpConfigs.push(tmpMarkerConfig);
	}

	return tmpConfigs;
}

module.exports = { generateCardConfigs, CardOverrides: _CardOverrides, FlowMarkerConfigs: _FlowMarkerConfigs };
