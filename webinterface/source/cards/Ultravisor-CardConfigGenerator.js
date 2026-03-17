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
	'flow control': { TitleBarColor: '#455a64', BodyStyle: { fill: '#eceff1', stroke: '#455a64' } },
	'core':         { TitleBarColor: '#7b1fa2', BodyStyle: { fill: '#f3e5f5', stroke: '#7b1fa2' } },
	'control':      { TitleBarColor: '#7b1fa2', BodyStyle: { fill: '#f3e5f5', stroke: '#7b1fa2' } },
	'interaction':  { TitleBarColor: '#c62828', BodyStyle: { fill: '#ffebee', stroke: '#c62828' } },
	'data':         { TitleBarColor: '#e65100', BodyStyle: { fill: '#fff3e0', stroke: '#e65100' } },
	'file i/o':     { TitleBarColor: '#2980b9', BodyStyle: { fill: '#eaf2f8', stroke: '#2980b9' } },
	'file-io':      { TitleBarColor: '#2980b9', BodyStyle: { fill: '#eaf2f8', stroke: '#2980b9' } },
	'rest':         { TitleBarColor: '#0277bd', BodyStyle: { fill: '#e1f5fe', stroke: '#0277bd' } },
	'meadow':       { TitleBarColor: '#2e7d32', BodyStyle: { fill: '#e8f5e9', stroke: '#2e7d32' } },
	'pipeline':     { TitleBarColor: '#ad1457', BodyStyle: { fill: '#fce4ec', stroke: '#ad1457' } },
	'llm':          { TitleBarColor: '#00838f', BodyStyle: { fill: '#e0f7fa', stroke: '#00838f' } },
	'extension':    { TitleBarColor: '#7c3aed', BodyStyle: { fill: '#ede9fe', stroke: '#7c3aed' } },
	'content-system': { TitleBarColor: '#1565c0', BodyStyle: { fill: '#e3f2fd', stroke: '#1565c0' } }
};

// ── Capability color palette ─────────────────────────────────────────
// Maps lowercase Capability names to colors.  Used as a fallback when
// Category does not have a specific color (e.g. for future task types).
const _CapabilityColors =
{
	'flow control':      { TitleBarColor: '#455a64', BodyStyle: { fill: '#eceff1', stroke: '#455a64' } },
	'data transform':    { TitleBarColor: '#e65100', BodyStyle: { fill: '#fff3e0', stroke: '#e65100' } },
	'file system':       { TitleBarColor: '#2980b9', BodyStyle: { fill: '#eaf2f8', stroke: '#2980b9' } },
	'shell':             { TitleBarColor: '#7b1fa2', BodyStyle: { fill: '#f3e5f5', stroke: '#7b1fa2' } },
	'http client':       { TitleBarColor: '#0277bd', BodyStyle: { fill: '#e1f5fe', stroke: '#0277bd' } },
	'meadow api':        { TitleBarColor: '#2e7d32', BodyStyle: { fill: '#e8f5e9', stroke: '#2e7d32' } },
	'user interaction':  { TitleBarColor: '#c62828', BodyStyle: { fill: '#ffebee', stroke: '#c62828' } },
	'llm':               { TitleBarColor: '#00838f', BodyStyle: { fill: '#e0f7fa', stroke: '#00838f' } },
	'extension':         { TitleBarColor: '#7c3aed', BodyStyle: { fill: '#ede9fe', stroke: '#7c3aed' } },
	'contentsystem':     { TitleBarColor: '#1565c0', BodyStyle: { fill: '#e3f2fd', stroke: '#1565c0' } }
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
 * Build a Manyfest PropertiesPanel configuration from SettingsInputs.
 *
 * Generates a single-section form with one descriptor per setting.
 * Each setting becomes a form field at `Record.Data.{Name}`.
 */
function _buildPropertiesPanel(pDefinition)
{
	let tmpSettings = pDefinition.SettingsInputs;

	if (!Array.isArray(tmpSettings) || tmpSettings.length === 0)
	{
		return null;
	}

	let tmpDefaults = pDefinition.DefaultSettings || {};
	let tmpSectionHash = pDefinition.Hash.replace(/[^a-zA-Z0-9]/g, '') + 'Section';
	let tmpGroupHash = pDefinition.Hash.replace(/[^a-zA-Z0-9]/g, '') + 'Group';

	let tmpDescriptors = {};
	let tmpRowIndex = 1;

	for (let i = 0; i < tmpSettings.length; i++)
	{
		let tmpSetting = tmpSettings[i];
		let tmpDataType = tmpSetting.DataType || 'String';
		let tmpAddress = 'Record.Data.' + tmpSetting.Name;

		let tmpDescriptor =
		{
			Name: tmpSetting.Name,
			Hash: tmpSetting.Name,
			DataType: tmpDataType,
			Default: (tmpDefaults[tmpSetting.Name] !== undefined) ? tmpDefaults[tmpSetting.Name] : '',
			PictForm:
			{
				Section: tmpSectionHash,
				Group: tmpGroupHash,
				Row: tmpRowIndex,
				Width: 12
			}
		};

		// Use TextArea for long-form inputs
		if (tmpDataType === 'Array' || tmpDataType === 'Object')
		{
			tmpDescriptor.PictForm.InputType = 'TextArea';
		}

		tmpDescriptors[tmpAddress] = tmpDescriptor;
		tmpRowIndex++;
	}

	// Account for settings form fields plus port summary sections below
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
	let tmpPanelHeight = 160 + (tmpSettings.length * 50) + tmpPortSummaryHeight;

	return {
		PanelType: 'Form',
		DefaultWidth: 360,
		DefaultHeight: Math.min(tmpPanelHeight, 500),
		Title: (pDefinition.Name || pDefinition.Hash) + ' Settings',
		Configuration:
		{
			Manifest:
			{
				Scope: 'FlowCard-' + pDefinition.Hash,
				Sections:
				[
					{
						Name: pDefinition.Name || pDefinition.Hash,
						Hash: tmpSectionHash,
						Groups:
						[
							{ Name: 'Settings', Hash: tmpGroupHash }
						]
					}
				],
				Descriptors: tmpDescriptors
			}
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
