/**
 * Ultravisor Card Config Generator
 *
 * Converts a task type Definition object into a PictFlowCard config object.
 * This allows any task type — built-in or user-defined — to automatically
 * produce a matching flow card without writing a class file.
 *
 * Usage:
 *   const generateCardConfig = require('./Ultravisor-CardConfigGenerator.js');
 *   let cardConfig = generateCardConfig(taskDefinition, { Width: 220 });
 *   // cardConfig can be passed directly to `new PictFlowCard(fable, cardConfig)`
 */

// ── Category color palette ────────────────────────────────────────────
// Maps lowercase category names to title bar / body style colors.
// Matches the palette established by the existing hand-crafted card files.
const _CategoryColors =
{
	'flow control': { TitleBarColor: '#78909c', BodyStyle: { fill: '#eceff1', stroke: '#78909c' } },
	'core':         { TitleBarColor: '#ab47bc', BodyStyle: { fill: '#f3e5f5', stroke: '#ab47bc' } },
	'control':      { TitleBarColor: '#ab47bc', BodyStyle: { fill: '#f3e5f5', stroke: '#ab47bc' } },
	'interaction':  { TitleBarColor: '#ef5350', BodyStyle: { fill: '#ffebee', stroke: '#ef5350' } },
	'data':         { TitleBarColor: '#ff9800', BodyStyle: { fill: '#fff3e0', stroke: '#ff9800' } },
	'file i/o':     { TitleBarColor: '#42a5f5', BodyStyle: { fill: '#eaf2f8', stroke: '#42a5f5' } },
	'file-io':      { TitleBarColor: '#42a5f5', BodyStyle: { fill: '#eaf2f8', stroke: '#42a5f5' } },
	'rest':         { TitleBarColor: '#29b6f6', BodyStyle: { fill: '#e1f5fe', stroke: '#29b6f6' } },
	'meadow':       { TitleBarColor: '#66bb6a', BodyStyle: { fill: '#e8f5e9', stroke: '#66bb6a' } },
	'pipeline':     { TitleBarColor: '#ec407a', BodyStyle: { fill: '#fce4ec', stroke: '#ec407a' } },
	'llm':          { TitleBarColor: '#26a69a', BodyStyle: { fill: '#e0f7fa', stroke: '#26a69a' } },
	'extension':    { TitleBarColor: '#9c6afe', BodyStyle: { fill: '#ede9fe', stroke: '#9c6afe' } },
	'content-system': { TitleBarColor: '#42a5f5', BodyStyle: { fill: '#e3f2fd', stroke: '#42a5f5' } }
};

// ── Capability color palette ─────────────────────────────────────────
// Maps lowercase Capability names to colors.  Used as a fallback when
// Category does not have a specific color (e.g. for future task types).
const _CapabilityColors =
{
	'flow control':      { TitleBarColor: '#78909c', BodyStyle: { fill: '#eceff1', stroke: '#78909c' } },
	'data transform':    { TitleBarColor: '#ff9800', BodyStyle: { fill: '#fff3e0', stroke: '#ff9800' } },
	'file system':       { TitleBarColor: '#42a5f5', BodyStyle: { fill: '#eaf2f8', stroke: '#42a5f5' } },
	'shell':             { TitleBarColor: '#ab47bc', BodyStyle: { fill: '#f3e5f5', stroke: '#ab47bc' } },
	'http client':       { TitleBarColor: '#29b6f6', BodyStyle: { fill: '#e1f5fe', stroke: '#29b6f6' } },
	'meadow api':        { TitleBarColor: '#66bb6a', BodyStyle: { fill: '#e8f5e9', stroke: '#66bb6a' } },
	'user interaction':  { TitleBarColor: '#ef5350', BodyStyle: { fill: '#ffebee', stroke: '#ef5350' } },
	'llm':               { TitleBarColor: '#26a69a', BodyStyle: { fill: '#e0f7fa', stroke: '#26a69a' } },
	'extension':         { TitleBarColor: '#9c6afe', BodyStyle: { fill: '#ede9fe', stroke: '#9c6afe' } },
	'contentsystem':     { TitleBarColor: '#42a5f5', BodyStyle: { fill: '#e3f2fd', stroke: '#42a5f5' } }
};

// Default colors for unknown categories
const _DefaultColors =
{
	TitleBarColor: '#37474f',
	BodyStyle: { fill: '#eceff1', stroke: '#37474f' }
};

// ── DataType → PictForm InputType mapping ─────────────────────────────
const _DataTypeInputMap =
{
	'String': 'Text',
	'Number': 'Text',
	'Boolean': 'Option',
	'Array': 'TextArea',
	'Object': 'TextArea'
};


// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Capitalize the first letter of each word in a category string.
 */
function _titleCase(pString)
{
	if (!pString || typeof(pString) !== 'string')
	{
		return 'General';
	}
	return pString.replace(/\b\w/g, function (pChar) { return pChar.toUpperCase(); });
}

/**
 * Get colors for a category (case-insensitive lookup).
 */
function _getColorsForCategory(pCategory)
{
	if (!pCategory || typeof(pCategory) !== 'string')
	{
		return _DefaultColors;
	}

	let tmpKey = pCategory.toLowerCase().trim();

	if (_CategoryColors[tmpKey])
	{
		return _CategoryColors[tmpKey];
	}

	return _DefaultColors;
}

// ── Zone geometry lookup tables (mirrors PictProvider-Flow-Geometry) ──
const _SideToEdge =
{
	'left-top': 'left', 'left': 'left', 'left-bottom': 'left',
	'right-top': 'right', 'right': 'right', 'right-bottom': 'right',
	'top-left': 'top', 'top': 'top', 'top-right': 'top',
	'bottom-left': 'bottom', 'bottom': 'bottom', 'bottom-right': 'bottom'
};

/**
 * Calculate card dimensions from port arrays.
 *
 * Uses the same adaptive zone sizing as PictProvider-Flow-Geometry:
 * sums the space needed by all occupied zones on each left/right edge.
 * This produces compact cards whose height scales linearly with total
 * port count rather than being inflated by fixed 1/3 zone fractions.
 *
 * @param {Array} pInputs - Input port objects with Side, Direction
 * @param {Array} pOutputs - Output port objects with Side, Direction
 * @returns {{Width: number, Height: number}}
 */
function _calculateDimensions(pInputs, pOutputs)
{
	let tmpTitleBarHeight = 22;
	let tmpMinSpacing = 16;
	let tmpBottomPad = 16;
	let tmpWidth = 180;
	let tmpHeight = 80;

	let tmpAllPorts = (pInputs || []).concat(pOutputs || []);

	// Count ports per zone
	let tmpCountBySide = {};
	for (let i = 0; i < tmpAllPorts.length; i++)
	{
		let tmpSide = tmpAllPorts[i].Side || (tmpAllPorts[i].Direction === 'input' ? 'left' : 'right');
		if (!tmpCountBySide[tmpSide])
		{
			tmpCountBySide[tmpSide] = 0;
		}
		tmpCountBySide[tmpSide]++;
	}

	// Sum space needed per edge across all zones.
	// Each zone needs minSpacing * (count + 1) pixels.
	let tmpSpacePerEdge = {};
	for (let tmpSide in tmpCountBySide)
	{
		let tmpCount = tmpCountBySide[tmpSide];
		let tmpEdge = _SideToEdge[tmpSide] || 'right';

		if (tmpEdge !== 'left' && tmpEdge !== 'right')
		{
			continue;
		}

		let tmpZoneSpace = tmpMinSpacing * (tmpCount + 1);

		if (!tmpSpacePerEdge[tmpEdge])
		{
			tmpSpacePerEdge[tmpEdge] = 0;
		}
		tmpSpacePerEdge[tmpEdge] += tmpZoneSpace;
	}

	// Height = titleBar + bottomPad + max edge space
	for (let tmpEdge in tmpSpacePerEdge)
	{
		let tmpRequired = tmpTitleBarHeight + tmpBottomPad + tmpSpacePerEdge[tmpEdge];
		tmpHeight = Math.max(tmpHeight, Math.ceil(tmpRequired));
	}

	// Adjust width for many ports
	let tmpMaxPorts = Math.max((pInputs || []).length, (pOutputs || []).length);
	if (tmpMaxPorts >= 4)
	{
		tmpWidth = Math.max(tmpWidth, 220);
	}
	else if (tmpMaxPorts >= 3)
	{
		tmpWidth = Math.max(tmpWidth, 200);
	}

	return { Width: tmpWidth, Height: tmpHeight };
}

/**
 * Build a PropertiesPanel configuration from SettingsInputs.
 *
 * Uses the UltravisorSettings panel type which provides per-field
 * mode toggles (Constant / Address / Default) and type-appropriate
 * editors driven by the task definition schema.
 */
function _buildPropertiesPanel(pDefinition)
{
	let tmpSettings = pDefinition.SettingsInputs;

	if (!Array.isArray(tmpSettings) || tmpSettings.length === 0)
	{
		return null;
	}

	let tmpDefaults = pDefinition.DefaultSettings || {};

	// Account for mode-toggle fields (slightly taller per row) plus port summary sections below
	let tmpPortSummaryHeight = 0;
	if (Array.isArray(pDefinition.EventInputs) && pDefinition.EventInputs.length > 0)
	{
		tmpPortSummaryHeight += 30 + (pDefinition.EventInputs.length * 20);
	}
	if (Array.isArray(pDefinition.EventOutputs) && pDefinition.EventOutputs.length > 0)
	{
		tmpPortSummaryHeight += 30 + (pDefinition.EventOutputs.length * 20);
	}
	if (Array.isArray(pDefinition.StateOutputs) && pDefinition.StateOutputs.length > 0)
	{
		tmpPortSummaryHeight += 30 + (pDefinition.StateOutputs.length * 20);
	}
	let tmpPanelHeight = 160 + (tmpSettings.length * 65) + tmpPortSummaryHeight;

	return {
		PanelType: 'UltravisorSettings',
		DefaultWidth: 380,
		DefaultHeight: Math.min(tmpPanelHeight, 550),
		Title: (pDefinition.Name || pDefinition.Hash) + ' Settings',
		Configuration:
		{
			Schema: tmpSettings,
			Defaults: tmpDefaults
		}
	};
}


// ═══════════════════════════════════════════════════════════════════════
//  MAIN GENERATOR FUNCTION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a PictFlowCard config object from a task type Definition.
 *
 * The returned object can be passed directly to `new PictFlowCard(fable, config)`
 * to create a card instance ready for the flow editor palette.
 *
 * @param {object} pTaskDefinition - Task type definition with Hash, Name,
 *        Description, Category, EventInputs, EventOutputs, SettingsInputs,
 *        StateOutputs, DefaultSettings.
 * @param {object} [pOverrides] - Optional overrides merged on top of the
 *        generated config. Use for custom colors, sizes, port adjustments, etc.
 * @returns {object|null} PictFlowCard constructor options, or null on failure.
 */
function generateCardConfigFromTaskDefinition(pTaskDefinition, pOverrides)
{
	if (!pTaskDefinition || !pTaskDefinition.Hash)
	{
		return null;
	}

	let tmpDef = pTaskDefinition;
	let tmpCategory = tmpDef.Category || 'general';
	let tmpColors = _getColorsForCategory(tmpCategory);

	// Fallback to Capability-based colors when Category has no specific color
	if (tmpColors === _DefaultColors && tmpDef.Capability)
	{
		let tmpCapKey = tmpDef.Capability.toLowerCase().trim();
		if (_CapabilityColors[tmpCapKey])
		{
			tmpColors = _CapabilityColors[tmpCapKey];
		}
	}

	// ── Build input ports ──────────────────────────────────────────
	let tmpInputs = [];

	// Event inputs → left-bottom, event-in
	if (Array.isArray(tmpDef.EventInputs))
	{
		for (let i = 0; i < tmpDef.EventInputs.length; i++)
		{
			tmpInputs.push(
			{
				Name: tmpDef.EventInputs[i].Name,
				Side: 'left-bottom',
				PortType: 'event-in',
				MinimumInputCount: 0,
				MaximumInputCount: 1
			});
		}
	}

	// Settings inputs → left-top, setting
	if (Array.isArray(tmpDef.SettingsInputs))
	{
		for (let i = 0; i < tmpDef.SettingsInputs.length; i++)
		{
			tmpInputs.push(
			{
				Name: tmpDef.SettingsInputs[i].Name,
				Side: 'left-top',
				PortType: 'setting',
				MinimumInputCount: 0,
				MaximumInputCount: 1
			});
		}
	}

	// ── Build output ports ─────────────────────────────────────────
	let tmpOutputs = [];

	// Event outputs → right-bottom for normal, bottom for errors
	if (Array.isArray(tmpDef.EventOutputs))
	{
		for (let i = 0; i < tmpDef.EventOutputs.length; i++)
		{
			let tmpEvt = tmpDef.EventOutputs[i];

			if (tmpEvt.IsError)
			{
				tmpOutputs.push(
				{
					Name: tmpEvt.Name,
					Side: 'bottom',
					PortType: 'error'
				});
			}
			else
			{
				tmpOutputs.push(
				{
					Name: tmpEvt.Name,
					Side: 'right-bottom',
					PortType: 'event-out'
				});
			}
		}
	}

	// State outputs → right-top, value
	if (Array.isArray(tmpDef.StateOutputs))
	{
		for (let i = 0; i < tmpDef.StateOutputs.length; i++)
		{
			let tmpStateOut =
			{
				Name: tmpDef.StateOutputs[i].Name,
				Side: 'right-top',
				PortType: 'value'
			};
			if (tmpDef.StateOutputs[i].DataType)
			{
				tmpStateOut.DataType = tmpDef.StateOutputs[i].DataType;
			}
			tmpOutputs.push(tmpStateOut);
		}
	}

	// ── Calculate dimensions ───────────────────────────────────────
	let tmpDimensions = _calculateDimensions(tmpInputs, tmpOutputs);

	// ── Build PropertiesPanel ──────────────────────────────────────
	let tmpPropertiesPanel = _buildPropertiesPanel(tmpDef);

	// ── Assemble the card config ───────────────────────────────────
	let tmpConfig =
	{
		Title: tmpDef.Name || tmpDef.Hash,
		Code: tmpDef.Hash,
		Description: tmpDef.Description || '',
		Category: _titleCase(tmpCategory),
		TitleBarColor: tmpColors.TitleBarColor,
		BodyStyle: { fill: tmpColors.BodyStyle.fill, stroke: tmpColors.BodyStyle.stroke },
		Width: tmpDimensions.Width,
		Height: tmpDimensions.Height,
		Inputs: tmpInputs,
		Outputs: tmpOutputs
	};

	if (tmpPropertiesPanel)
	{
		tmpConfig.PropertiesPanel = tmpPropertiesPanel;
	}

	// ── Apply overrides ────────────────────────────────────────────
	if (pOverrides && typeof(pOverrides) === 'object')
	{
		let tmpKeys = Object.keys(pOverrides);

		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpKey = tmpKeys[i];

			// Deep merge for known objects; shallow replace for everything else
			if (tmpKey === 'BodyStyle' && typeof(pOverrides.BodyStyle) === 'object')
			{
				tmpConfig.BodyStyle = Object.assign({}, tmpConfig.BodyStyle, pOverrides.BodyStyle);
			}
			else if (tmpKey === 'PropertiesPanel' && typeof(pOverrides.PropertiesPanel) === 'object')
			{
				if (tmpConfig.PropertiesPanel)
				{
					tmpConfig.PropertiesPanel = Object.assign({}, tmpConfig.PropertiesPanel, pOverrides.PropertiesPanel);
				}
				else
				{
					tmpConfig.PropertiesPanel = pOverrides.PropertiesPanel;
				}
			}
			else
			{
				tmpConfig[tmpKey] = pOverrides[tmpKey];
			}
		}
	}

	// ── Ensure dimensions accommodate final port layout ───────────
	// Overrides may have replaced Inputs/Outputs, so recompute the
	// minimum dimensions and grow if needed (never shrink).
	let tmpFinalDimensions = _calculateDimensions(tmpConfig.Inputs, tmpConfig.Outputs);
	tmpConfig.Width = Math.max(tmpConfig.Width || 180, tmpFinalDimensions.Width);
	tmpConfig.Height = Math.max(tmpConfig.Height || 80, tmpFinalDimensions.Height);

	return tmpConfig;
}

module.exports = generateCardConfigFromTaskDefinition;
module.exports.CategoryColors = _CategoryColors;
module.exports.CapabilityColors = _CapabilityColors;
module.exports.DefaultColors = _DefaultColors;
