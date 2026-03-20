const libPictFlowCardPropertiesPanel = require('pict-section-flow/source/PictFlowCardPropertiesPanel.js');
const libPictSectionObjectEditor = require('pict-section-objecteditor');

/**
 * Ultravisor Card Settings Panel
 *
 * A custom properties panel for Ultravisor flow cards that provides
 * per-field mode toggles: Constant, Address, or Default.
 *
 * - Constant: a literal value edited with a type-appropriate input
 * - Address:  a Manyfest address expression resolved at execution time
 * - Default:  use the task type's default value (field omitted from Data)
 *
 * Each field has a single toggle button to the left of the input that
 * cycles through modes on click.  Values are remembered per-mode so
 * switching away and back restores what was there before.
 *
 * The panel reads the task definition schema (SettingsInputs + DefaultSettings)
 * from the panel Configuration, and stores mode metadata in the node's
 * Data._FieldModes object alongside the actual field values.
 *
 * Panel type identifier: 'UltravisorSettings'
 * Service type: 'PictFlowCardPropertiesPanel-UltravisorSettings'
 */

// Mode cycle order
const _ModeCycle = ['constant', 'address', 'default'];

// Mode display labels (shown in italic on the toggle button)
const _ModeLabels =
{
	'constant': 'C',
	'address': 'A',
	'default': 'D'
};

// Mode tooltip text
const _ModeTitles =
{
	'constant': 'Constant',
	'address': 'Address',
	'default': 'Default'
};


class UltravisorCardSettingsPanel extends libPictFlowCardPropertiesPanel
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'PictFlowCardPropertiesPanel-UltravisorSettings';

		// Schema from the task definition
		this._Schema = (this._Configuration && Array.isArray(this._Configuration.Schema))
			? this._Configuration.Schema
			: [];
		this._Defaults = (this._Configuration && typeof(this._Configuration.Defaults) === 'object')
			? this._Configuration.Defaults
			: {};

		// Per-field state: { fieldName: { mode, constantValue, addressValue, dataType, defaultValue } }
		this._FieldStates = {};

		// Active ObjectEditor view instances keyed by field name
		this._ObjectEditors = {};

		// Track whether CSS has been injected
		this._CSSInjected = false;
	}

	// ====================================================================
	// Render
	// ====================================================================

	/**
	 * Render the settings panel into the provided container.
	 *
	 * @param {HTMLElement} pContainer - The DOM element to render into
	 * @param {Object} pNodeData - The node data object (has .Data property)
	 */
	render(pContainer, pNodeData)
	{
		super.render(pContainer, pNodeData);

		this._injectCSS();
		this._initializeFieldStates(pNodeData);

		let tmpHTML = '<div class="uv-settings-panel">';

		for (let i = 0; i < this._Schema.length; i++)
		{
			let tmpSetting = this._Schema[i];
			let tmpFieldName = tmpSetting.Name;
			let tmpState = this._FieldStates[tmpFieldName];

			if (!tmpState)
			{
				continue;
			}

			tmpHTML += this._renderField(tmpSetting, tmpState);
		}

		tmpHTML += '</div>';
		pContainer.innerHTML = tmpHTML;

		this._wireEventListeners(pContainer);
	}

	// ====================================================================
	// Field State Initialization
	// ====================================================================

	/**
	 * Initialize _FieldStates from the node's Data and _FieldModes.
	 *
	 * Each field stores separate constantValue and addressValue so that
	 * switching modes preserves what was entered in each.
	 *
	 * Backward compatibility: when _FieldModes is absent, infer modes:
	 *   - string value containing '{~' → address
	 *   - value present → constant
	 *   - value absent → default
	 *
	 * @param {Object} pNodeData
	 */
	_initializeFieldStates(pNodeData)
	{
		this._FieldStates = {};

		let tmpData = (pNodeData && pNodeData.Data && typeof(pNodeData.Data) === 'object')
			? pNodeData.Data
			: {};
		let tmpFieldModes = (tmpData._FieldModes && typeof(tmpData._FieldModes) === 'object')
			? tmpData._FieldModes
			: null;

		for (let i = 0; i < this._Schema.length; i++)
		{
			let tmpSetting = this._Schema[i];
			let tmpFieldName = tmpSetting.Name;
			let tmpDataType = tmpSetting.DataType || 'String';
			let tmpDefault = (this._Defaults.hasOwnProperty(tmpFieldName))
				? this._Defaults[tmpFieldName]
				: '';

			let tmpMode = 'default';
			let tmpConstantValue = tmpDefault;
			let tmpAddressValue = '';

			if (tmpFieldModes && tmpFieldModes.hasOwnProperty(tmpFieldName))
			{
				// Explicit mode from _FieldModes
				tmpMode = tmpFieldModes[tmpFieldName];

				if (tmpMode === 'address')
				{
					tmpAddressValue = this._extractAddressFromTemplate(tmpData[tmpFieldName]);
				}
				else if (tmpMode === 'constant')
				{
					tmpConstantValue = tmpData.hasOwnProperty(tmpFieldName) ? tmpData[tmpFieldName] : tmpDefault;
				}
				// mode === 'default' → constantValue stays at schema default
			}
			else
			{
				// Infer mode from existing data (backward compatibility)
				if (tmpData.hasOwnProperty(tmpFieldName))
				{
					let tmpExistingValue = tmpData[tmpFieldName];

					if (typeof(tmpExistingValue) === 'string' && tmpExistingValue.indexOf('{~') >= 0)
					{
						tmpMode = 'address';
						tmpAddressValue = this._extractAddressFromTemplate(tmpExistingValue);
					}
					else
					{
						tmpMode = 'constant';
						tmpConstantValue = tmpExistingValue;
					}
				}
				// else: absent → default
			}

			this._FieldStates[tmpFieldName] =
			{
				mode: tmpMode,
				constantValue: tmpConstantValue,
				addressValue: tmpAddressValue,
				dataType: tmpDataType,
				defaultValue: tmpDefault
			};
		}
	}

	// ====================================================================
	// HTML Generation
	// ====================================================================

	/**
	 * Render a single field row: label + [toggle | editor] + description.
	 *
	 * Layout:
	 *   FieldName*
	 *   [C] [ input______________________ ]
	 *   description text
	 *
	 * @param {Object} pSetting - The SettingsInput definition
	 * @param {Object} pState - The field's current state from _FieldStates
	 * @returns {string} HTML string
	 */
	_renderField(pSetting, pState)
	{
		let tmpFieldName = pSetting.Name;
		let tmpRequired = pSetting.Required ? '<span class="uv-settings-field-required">*</span>' : '';
		let tmpDescription = pSetting.Description
			? '<div class="uv-settings-field-description">' + this._escapeHTML(pSetting.Description) + '</div>'
			: '';
		let tmpAttrName = this._escapeAttr(tmpFieldName);

		let tmpEditorHTML = this._renderFieldEditor(tmpFieldName, pState);

		let tmpModeClass = 'uv-mode-' + pState.mode;
		let tmpLabel = _ModeLabels[pState.mode] || 'C';
		let tmpTitle = _ModeTitles[pState.mode] || '';

		return '<div class="uv-settings-field" data-field-name="' + tmpAttrName + '">'
			+ '<div class="uv-settings-field-label">' + this._escapeHTML(tmpFieldName) + tmpRequired + '</div>'
			+ '<div class="uv-settings-field-row">'
			+ '<button class="uv-mode-toggle ' + tmpModeClass + '" data-field="' + tmpAttrName + '" title="' + this._escapeAttr(tmpTitle) + '">' + tmpLabel + '</button>'
			+ '<div class="uv-settings-field-editor" data-field="' + tmpAttrName + '">'
			+ tmpEditorHTML
			+ '</div>'
			+ '</div>'
			+ tmpDescription
			+ '</div>';
	}

	/**
	 * Render the editor widget for a field based on its current mode.
	 *
	 * @param {string} pFieldName
	 * @param {Object} pState
	 * @returns {string} HTML string
	 */
	_renderFieldEditor(pFieldName, pState)
	{
		let tmpAttrName = this._escapeAttr(pFieldName);

		switch (pState.mode)
		{
			case 'constant':
				return this._renderConstantEditor(tmpAttrName, pState);

			case 'address':
				return this._renderAddressEditor(tmpAttrName, pState);

			case 'default':
				return this._renderDefaultDisplay(pState);

			default:
				return '';
		}
	}

	/**
	 * Render a type-appropriate constant value editor.
	 */
	_renderConstantEditor(pAttrName, pState)
	{
		let tmpValue = pState.constantValue;

		switch (pState.dataType)
		{
			case 'Boolean':
			{
				let tmpChecked = (tmpValue === true || tmpValue === 'true') ? ' checked' : '';
				return '<label class="uv-settings-checkbox">'
					+ '<input type="checkbox" class="uv-settings-input-bool" data-field="' + pAttrName + '"' + tmpChecked + '>'
					+ '<span>Enabled</span>'
					+ '</label>';
			}

			case 'Number':
			{
				let tmpNumVal = (tmpValue !== undefined && tmpValue !== null && tmpValue !== '') ? tmpValue : '';
				return '<input type="number" class="uv-settings-input" data-field="' + pAttrName + '" value="' + this._escapeAttr(String(tmpNumVal)) + '">';
			}

			case 'Array':
			case 'Object':
			{
				let tmpEditorId = 'uv-objecteditor-' + pAttrName;
				return '<div class="uv-objecteditor-container" id="' + tmpEditorId + '" data-field="' + pAttrName + '"></div>';
			}

			default: // String
			{
				let tmpStrVal = (tmpValue !== undefined && tmpValue !== null) ? String(tmpValue) : '';
				return '<input type="text" class="uv-settings-input" data-field="' + pAttrName + '" value="' + this._escapeAttr(tmpStrVal) + '">';
			}
		}
	}

	/**
	 * Render the address mode editor: text input with placeholder.
	 */
	_renderAddressEditor(pAttrName, pState)
	{
		let tmpAddress = (typeof(pState.addressValue) === 'string') ? pState.addressValue : '';

		return '<input type="text" class="uv-settings-input uv-settings-address-input" data-field="' + pAttrName + '" value="' + this._escapeAttr(tmpAddress) + '" placeholder="e.g. Operation.InputFilePath">';
	}

	/**
	 * Render the default mode display: read-only showing the schema default.
	 */
	_renderDefaultDisplay(pState)
	{
		let tmpDefaultStr = '';

		if (pState.defaultValue === undefined || pState.defaultValue === null || pState.defaultValue === '')
		{
			tmpDefaultStr = 'default: empty';
		}
		else if (typeof(pState.defaultValue) === 'object')
		{
			tmpDefaultStr = 'default: ' + JSON.stringify(pState.defaultValue);
		}
		else
		{
			tmpDefaultStr = 'default: ' + String(pState.defaultValue);
		}

		return '<div class="uv-settings-default-display">' + this._escapeHTML(tmpDefaultStr) + '</div>';
	}

	// ====================================================================
	// Event Handling
	// ====================================================================

	/**
	 * Wire up event listeners on the rendered panel DOM.
	 *
	 * @param {HTMLElement} pContainer
	 */
	_wireEventListeners(pContainer)
	{
		let tmpSelf = this;

		// Mode toggle buttons — use pointerup instead of click to avoid
		// SVG foreignObject event routing issues in Safari
		let tmpToggles = pContainer.querySelectorAll('.uv-mode-toggle');
		for (let i = 0; i < tmpToggles.length; i++)
		{
			tmpToggles[i].addEventListener('pointerdown', function (pEvent)
			{
				pEvent.stopPropagation();
				pEvent.preventDefault();
			});
			tmpToggles[i].addEventListener('pointerup', function (pEvent)
			{
				pEvent.stopPropagation();
				pEvent.preventDefault();

				let tmpFieldName = this.getAttribute('data-field');
				tmpSelf._cycleFieldMode(pContainer, tmpFieldName);
			});
		}

		// Instantiate ObjectEditors for Array/Object fields
		this._initObjectEditors(pContainer);

		// Wire input listeners for all existing editors
		this._wireInputListeners(pContainer);

		// Prevent pointer events from propagating to the SVG layer
		this._wirePointerIsolation(pContainer);
	}

	/**
	 * Stop pointer events on interactive elements from reaching the SVG canvas.
	 *
	 * @param {HTMLElement} pContainer
	 */
	_wirePointerIsolation(pContainer)
	{
		let tmpElements = pContainer.querySelectorAll('input, textarea, button, select');
		for (let i = 0; i < tmpElements.length; i++)
		{
			tmpElements[i].addEventListener('pointerdown', function (pEvent)
			{
				pEvent.stopPropagation();
			});
		}
	}

	/**
	 * Initialize ObjectEditor views for Array/Object fields.
	 * Stores the field value into AppData and points the ObjectEditor at it.
	 *
	 * @param {HTMLElement} pContainer
	 */
	_initObjectEditors(pContainer)
	{
		// Clean up any previously instantiated editors
		this._destroyObjectEditors();

		let tmpContainers = pContainer.querySelectorAll('.uv-objecteditor-container');

		for (let i = 0; i < tmpContainers.length; i++)
		{
			let tmpDiv = tmpContainers[i];
			let tmpFieldName = tmpDiv.getAttribute('data-field');
			let tmpState = this._FieldStates[tmpFieldName];

			if (!tmpState)
			{
				continue;
			}

			// Ensure the AppData staging area exists
			if (!this.fable.AppData._UVSettingsEditors)
			{
				this.fable.AppData._UVSettingsEditors = {};
			}

			// Parse string values into objects for the editor
			let tmpValue = tmpState.constantValue;
			if (typeof(tmpValue) === 'string' && tmpValue.trim().length > 0)
			{
				try
				{
					tmpValue = JSON.parse(tmpValue);
				}
				catch (pError)
				{
					// Keep as-is; editor will show null
					tmpValue = (tmpState.dataType === 'Array') ? [] : {};
				}
			}
			if (tmpValue === undefined || tmpValue === null || tmpValue === '')
			{
				tmpValue = (tmpState.dataType === 'Array') ? [] : {};
			}

			let tmpAppDataKey = 'OE_' + tmpFieldName;
			this.fable.AppData._UVSettingsEditors[tmpAppDataKey] = tmpValue;

			let tmpViewHash = 'UVObjEditor-' + tmpFieldName + '-' + Date.now();

			let tmpEditorView = this.fable.addView(
				tmpViewHash,
				{
					ViewIdentifier: tmpViewHash,
					AutoRender: false,
					ObjectDataAddress: 'AppData._UVSettingsEditors.' + tmpAppDataKey,
					Editable: true,
					InitialExpandDepth: 2
				},
				libPictSectionObjectEditor
			);

			// addView does not call initialize(), so node type renderers are
			// not set up yet.  Calling initialize() triggers onBeforeInitialize()
			// which registers node type service providers and creates the
			// _NodeRenderers map that renderTree() depends on.
			tmpEditorView.initialize();

			// SVG foreignObject workaround: document.querySelectorAll can't find
			// elements inside foreignObject, so we bypass the normal render() path
			// and inject the tree container directly via DOM, then override
			// _getTreeElement to return a direct DOM reference.
			let tmpTreeId = 'ObjectEditor-Tree-' + tmpViewHash;
			tmpDiv.innerHTML = '<div class="pict-objecteditor" id="' + tmpTreeId + '"></div>';

			let tmpTreeElement = tmpDiv.querySelector('.pict-objecteditor');
			tmpEditorView._getTreeElement = function () { return tmpTreeElement; };

			this._ObjectEditors[tmpFieldName] = tmpViewHash;

			// Inject the ObjectEditor's CSS into the DOM
			this.fable.CSSMap.injectCSS();

			// Trigger initial expand and tree render
			tmpEditorView.onAfterInitialRender();
			tmpEditorView.renderTree();
		}
	}

	/**
	 * Destroy all active ObjectEditor instances and clean up AppData.
	 */
	_destroyObjectEditors()
	{
		let tmpFieldNames = Object.keys(this._ObjectEditors);

		for (let i = 0; i < tmpFieldNames.length; i++)
		{
			let tmpViewHash = this._ObjectEditors[tmpFieldNames[i]];

			if (this.fable.views[tmpViewHash])
			{
				// PictView does not have a destroy() method; just remove
				// the view from the service map so it can be garbage collected.
				delete this.fable.views[tmpViewHash];
			}
		}

		this._ObjectEditors = {};

		// Clean up AppData staging area
		if (this.fable.AppData._UVSettingsEditors)
		{
			delete this.fable.AppData._UVSettingsEditors;
		}
	}

	/**
	 * Attach change/input listeners to editor elements so field state
	 * is kept up to date as the user types.
	 *
	 * @param {HTMLElement} pContainer
	 */
	_wireInputListeners(pContainer)
	{
		let tmpSelf = this;

		// Text and number inputs
		let tmpTextInputs = pContainer.querySelectorAll('.uv-settings-input');
		for (let i = 0; i < tmpTextInputs.length; i++)
		{
			tmpTextInputs[i].addEventListener('input', function ()
			{
				let tmpFieldName = this.getAttribute('data-field');
				let tmpState = tmpSelf._FieldStates[tmpFieldName];

				if (!tmpState)
				{
					return;
				}

				if (tmpState.mode === 'address')
				{
					tmpState.addressValue = this.value;
				}
				else if (tmpState.dataType === 'Number')
				{
					tmpState.constantValue = this.value === '' ? '' : Number(this.value);
				}
				else
				{
					tmpState.constantValue = this.value;
				}
			});
		}

		// Checkbox inputs
		let tmpCheckboxes = pContainer.querySelectorAll('.uv-settings-input-bool');
		for (let i = 0; i < tmpCheckboxes.length; i++)
		{
			tmpCheckboxes[i].addEventListener('change', function ()
			{
				let tmpFieldName = this.getAttribute('data-field');
				let tmpState = tmpSelf._FieldStates[tmpFieldName];

				if (tmpState)
				{
					tmpState.constantValue = this.checked;
				}
			});
		}

		// (Array/Object fields use modal editor — no inline listeners needed)
	}

	/**
	 * Cycle a field to the next mode (constant → address → default → constant)
	 * and re-render just that field's editor + toggle button.
	 *
	 * @param {HTMLElement} pContainer
	 * @param {string} pFieldName
	 */
	_cycleFieldMode(pContainer, pFieldName)
	{
		let tmpState = this._FieldStates[pFieldName];

		if (!tmpState)
		{
			return;
		}

		// Find next mode in cycle
		let tmpCurrentIndex = _ModeCycle.indexOf(tmpState.mode);
		let tmpNextIndex = (tmpCurrentIndex + 1) % _ModeCycle.length;
		let tmpNewMode = _ModeCycle[tmpNextIndex];

		tmpState.mode = tmpNewMode;

		// Update the toggle button
		let tmpFieldContainer = pContainer.querySelector('.uv-settings-field[data-field-name="' + pFieldName + '"]');

		if (!tmpFieldContainer)
		{
			return;
		}

		let tmpToggle = tmpFieldContainer.querySelector('.uv-mode-toggle');
		if (tmpToggle)
		{
			// Update CSS class
			tmpToggle.className = 'uv-mode-toggle uv-mode-' + tmpNewMode;
			// Update label
			tmpToggle.textContent = _ModeLabels[tmpNewMode] || 'C';
			// Update tooltip
			tmpToggle.title = _ModeTitles[tmpNewMode] || '';
		}

		// If leaving constant mode for an Array/Object field, save the editor value back
		if (tmpState.mode !== 'constant' && (tmpState.dataType === 'Array' || tmpState.dataType === 'Object'))
		{
			let tmpAppDataKey = 'OE_' + pFieldName;
			if (this.fable.AppData._UVSettingsEditors && this.fable.AppData._UVSettingsEditors.hasOwnProperty(tmpAppDataKey))
			{
				tmpState.constantValue = this.fable.AppData._UVSettingsEditors[tmpAppDataKey];
			}
			// Remove the editor for this field
			if (this._ObjectEditors[pFieldName])
			{
				let tmpViewHash = this._ObjectEditors[pFieldName];
				if (this.fable.views[tmpViewHash])
				{
					delete this.fable.views[tmpViewHash];
				}
				delete this._ObjectEditors[pFieldName];
			}
		}

		// Re-render the editor area
		let tmpEditorContainer = tmpFieldContainer.querySelector('.uv-settings-field-editor');
		if (tmpEditorContainer)
		{
			tmpEditorContainer.innerHTML = this._renderFieldEditor(pFieldName, tmpState);

			// Re-wire listeners on new elements
			this._wireInputListeners(tmpEditorContainer);
			this._wirePointerIsolation(tmpEditorContainer);

			// If entering constant mode for Array/Object, init the ObjectEditor
			if (tmpState.mode === 'constant' && (tmpState.dataType === 'Array' || tmpState.dataType === 'Object'))
			{
				this._initObjectEditors(pContainer);
			}
		}
	}

	// ====================================================================
	// Marshal
	// ====================================================================

	/**
	 * Marshal data from the panel UI back into the node's Data object.
	 *
	 * @param {Object} pNodeData
	 */
	marshalFromPanel(pNodeData)
	{
		if (!pNodeData || !this._FieldStates)
		{
			return;
		}

		if (!pNodeData.Data)
		{
			pNodeData.Data = {};
		}

		let tmpFieldModes = {};
		let tmpHasNonDefault = false;

		let tmpFieldNames = Object.keys(this._FieldStates);

		for (let i = 0; i < tmpFieldNames.length; i++)
		{
			let tmpFieldName = tmpFieldNames[i];
			let tmpState = this._FieldStates[tmpFieldName];

			switch (tmpState.mode)
			{
				case 'constant':
				{
					let tmpValue = tmpState.constantValue;

					// For Array/Object fields, read live data from the ObjectEditor's AppData address
					if (tmpState.dataType === 'Array' || tmpState.dataType === 'Object')
					{
						let tmpAppDataKey = 'OE_' + tmpFieldName;
						if (this.fable.AppData._UVSettingsEditors && this.fable.AppData._UVSettingsEditors.hasOwnProperty(tmpAppDataKey))
						{
							tmpValue = this.fable.AppData._UVSettingsEditors[tmpAppDataKey];
						}
						else if (typeof(tmpValue) === 'string')
						{
							// Fallback: parse JSON string
							let tmpTrimmed = tmpValue.trim();
							if (tmpTrimmed.length > 0)
							{
								try
								{
									tmpValue = JSON.parse(tmpTrimmed);
								}
								catch (pParseError)
								{
									// Keep as raw string
								}
							}
						}
					}

					pNodeData.Data[tmpFieldName] = tmpValue;
					tmpFieldModes[tmpFieldName] = 'constant';
					tmpHasNonDefault = true;
					break;
				}

				case 'address':
				{
					let tmpAddress = (typeof(tmpState.addressValue) === 'string') ? tmpState.addressValue.trim() : '';
					pNodeData.Data[tmpFieldName] = this._buildTemplateFromAddress(tmpAddress);
					tmpFieldModes[tmpFieldName] = 'address';
					tmpHasNonDefault = true;
					break;
				}

				case 'default':
				{
					// Remove the field so the task falls back to its built-in default
					delete pNodeData.Data[tmpFieldName];
					// Not added to _FieldModes — absent means 'default'
					break;
				}
			}
		}

		// Store _FieldModes metadata if any field is non-default
		if (tmpHasNonDefault)
		{
			pNodeData.Data._FieldModes = tmpFieldModes;
		}
		else
		{
			delete pNodeData.Data._FieldModes;
		}
	}

	// ====================================================================
	// Destroy
	// ====================================================================

	destroy()
	{
		this._destroyObjectEditors();
		this._Schema = null;
		this._Defaults = null;
		this._FieldStates = null;
		super.destroy();
	}

	// ====================================================================
	// Address Utilities
	// ====================================================================

	/**
	 * Extract a bare Manyfest address from a Pict template expression.
	 *
	 * '{~D:Record.Operation.InputFilePath~}' → 'Operation.InputFilePath'
	 *
	 * @param {*} pTemplateString
	 * @returns {string}
	 */
	_extractAddressFromTemplate(pTemplateString)
	{
		if (typeof(pTemplateString) !== 'string')
		{
			return '';
		}

		let tmpMatch = pTemplateString.match(/\{~D:Record\.(.+?)~\}/);
		return tmpMatch ? tmpMatch[1] : '';
	}

	/**
	 * Build a Pict template expression from a bare Manyfest address.
	 *
	 * 'Operation.InputFilePath' → '{~D:Record.Operation.InputFilePath~}'
	 *
	 * @param {string} pAddress
	 * @returns {string}
	 */
	_buildTemplateFromAddress(pAddress)
	{
		if (!pAddress || typeof(pAddress) !== 'string')
		{
			return '';
		}

		return '{~D:Record.' + pAddress + '~}';
	}

	// ====================================================================
	// Escape Utilities
	// ====================================================================

	_escapeHTML(pString)
	{
		if (typeof(pString) !== 'string')
		{
			return '';
		}

		return pString
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	_escapeAttr(pString)
	{
		if (typeof(pString) !== 'string')
		{
			return '';
		}

		return pString
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	// ====================================================================
	// CSS Injection
	// ====================================================================

	_injectCSS()
	{
		if (this._CSSInjected)
		{
			return;
		}

		// Use the CSSMap service (same pattern as PictProvider-Flow-CSS)
		if (this.fable && this.fable.CSSMap)
		{
			this.fable.CSSMap.addCSS('UltravisorCardSettingsPanel', UltravisorCardSettingsPanel.CSS, 600, 'UltravisorCardSettingsPanel');
			this.fable.CSSMap.injectCSS();
			this._CSSInjected = true;
		}
		else
		{
			this.log.warn('UltravisorCardSettingsPanel: CSSMap not available; CSS not registered.');
		}
	}
}

// ========================================================================
// Static CSS
// ========================================================================

UltravisorCardSettingsPanel.CSS = [
'/* ── Ultravisor Card Settings Panel ───────────────────────────────── */',

'.uv-settings-panel {',
'	padding: 8px 10px;',
'}',

'/* Field container */',
'.uv-settings-field {',
'	margin-bottom: 10px;',
'	padding-bottom: 8px;',
'	border-bottom: 1px solid var(--pf-panel-titlebar-border, #343c44);',
'}',
'.uv-settings-field:last-child {',
'	border-bottom: none;',
'	margin-bottom: 0;',
'}',

'/* Field label */',
'.uv-settings-field-label {',
'	font-weight: 600;',
'	font-size: 0.82em;',
'	color: var(--pf-panel-text, #c8d0d8);',
'	margin-bottom: 4px;',
'}',
'.uv-settings-field-required {',
'	color: #c44e4e;',
'	margin-left: 1px;',
'	font-weight: 700;',
'}',

'/* Input row: toggle button + editor side by side */',
'.uv-settings-field-row {',
'	display: flex;',
'	align-items: flex-start;',
'	gap: 5px;',
'}',

'/* ── Mode toggle: single cycling button ─────────────────────────── */',
'.uv-mode-toggle {',
'	flex-shrink: 0;',
'	width: 22px;',
'	height: 24px;',
'	border: 1px solid var(--pf-panel-titlebar-border, #3a4450);',
'	background: var(--pf-panel-bg, #1e2228);',
'	color: #607080;',
'	font-size: 0.72em;',
'	font-style: italic;',
'	font-weight: 700;',
'	cursor: pointer;',
'	border-radius: 3px;',
'	padding: 0;',
'	line-height: 24px;',
'	text-align: center;',
'	margin-top: 1px;',
'}',
'/* Mode-specific toggle colors (no :hover — causes compositor desync in SVG foreignObject) */',
'.uv-mode-toggle.uv-mode-constant {',
'	border-color: #5ab88a60;',
'	color: #5ab88a;',
'	background: #1a2820;',
'}',
'.uv-mode-toggle.uv-mode-address {',
'	border-color: #d4884a60;',
'	color: #d4884a;',
'	background: #2a1e14;',
'}',
'.uv-mode-toggle.uv-mode-default {',
'	border-color: var(--pf-panel-titlebar-border, #3a4450);',
'	color: #607080;',
'	background: var(--pf-panel-bg, #1e2228);',
'}',

'/* ── Editor area ────────────────────────────────────────────────── */',
'.uv-settings-field-editor {',
'	flex: 1;',
'	min-width: 0;',
'}',
'.uv-settings-input {',
'	width: 100%;',
'	box-sizing: border-box;',
'	padding: 4px 8px;',
'	height: 26px;',
'	border: 1px solid var(--pf-panel-titlebar-border, #343c44);',
'	background: var(--pf-panel-input-bg, #181c22);',
'	color: var(--pf-panel-text, #b8c4cc);',
'	border-radius: 3px;',
'	font-size: 0.82em;',
'	font-family: inherit;',
'}',
'.uv-settings-input:focus {',
'	border-color: #5a9ecb;',
'	outline: none;',
'}',
'/* ── ObjectEditor container (dark theme overrides) ──────────────── */',
'.uv-objecteditor-container {',
'	overflow: visible;',
'}',
'.uv-objecteditor-container .pict-objecteditor {',
'	background: var(--pf-panel-input-bg, #181c22);',
'	border-color: var(--pf-panel-titlebar-border, #343c44);',
'	color: var(--pf-panel-text, #b8c4cc);',
'	font-size: 12px;',
'	overflow: visible;',
'}',
'.uv-objecteditor-container .pict-oe-row:hover {',
'	background: #252a32;',
'}',
'.uv-objecteditor-container .pict-oe-key { color: #d4884a; }',
'.uv-objecteditor-container .pict-oe-value-string { color: #5ab88a; }',
'.uv-objecteditor-container .pict-oe-value-string::before,',
'.uv-objecteditor-container .pict-oe-value-string::after { color: #3a7a5a; }',
'.uv-objecteditor-container .pict-oe-value-number { color: #5a9ecb; }',
'.uv-objecteditor-container .pict-oe-value-boolean { color: #d4884a; }',
'.uv-objecteditor-container .pict-oe-value-null { color: #506070; }',
'.uv-objecteditor-container .pict-oe-summary { color: #506070; }',
'.uv-objecteditor-container .pict-oe-separator { color: #506070; }',
'.uv-objecteditor-container .pict-oe-toggle { color: #607080; }',
'.uv-objecteditor-container .pict-oe-toggle:hover { background: #2a3040; color: #b8c4cc; }',
'.uv-objecteditor-container .pict-oe-type-badge { background: #252a32; color: #607080; }',
'.uv-objecteditor-container .pict-oe-action-btn { background: #252a32; border-color: #343c44; color: #607080; }',
'.uv-objecteditor-container .pict-oe-action-btn:hover { background: #2a3040; border-color: #4a5460; color: #b8c4cc; }',
'.uv-objecteditor-container .pict-oe-action-remove { background: #2a1a1a; border-color: #4a2020; color: #c44e4e; }',
'.uv-objecteditor-container .pict-oe-action-remove:hover { background: #3a2020; }',
'.uv-objecteditor-container .pict-oe-action-add { background: #1a2a1a; border-color: #204a20; color: #5ab88a; }',
'.uv-objecteditor-container .pict-oe-action-add:hover { background: #203a20; }',
'.uv-objecteditor-container .pict-oe-value-input { background: #181c22; border-color: #5a9ecb; color: #b8c4cc; }',
'.uv-objecteditor-container .pict-oe-key-input { background: #181c22; border-color: #d4884a; color: #d4884a; }',
'.uv-objecteditor-container .pict-oe-empty { color: #506070; }',
'.uv-settings-checkbox {',
'	display: flex;',
'	align-items: center;',
'	gap: 6px;',
'	height: 24px;',
'	color: var(--pf-panel-text, #b8c4cc);',
'	font-size: 0.82em;',
'	cursor: pointer;',
'}',
'.uv-settings-checkbox input[type="checkbox"] {',
'	accent-color: #5ab88a;',
'}',

'/* Address mode styling */',
'.uv-settings-address-input {',
'	border-color: #d4884a40;',
'	font-style: italic;',
'}',
'.uv-settings-address-input:focus {',
'	border-color: #d4884a;',
'}',

'/* Default mode */',
'.uv-settings-default-display {',
'	padding: 4px 8px;',
'	height: 24px;',
'	line-height: 16px;',
'	background: transparent;',
'	border: 1px dashed var(--pf-panel-titlebar-border, #343c44);',
'	border-radius: 3px;',
'	color: var(--pf-text-tertiary, #506878);',
'	font-size: 0.78em;',
'	font-style: italic;',
'}',

'/* Description */',
'.uv-settings-field-description {',
'	font-size: 0.68em;',
'	color: var(--pf-text-tertiary, #506070);',
'	margin-top: 3px;',
'	padding-left: 27px;',
'	line-height: 1.3;',
'}'
].join('\n');

module.exports = UltravisorCardSettingsPanel;

module.exports.default_configuration = Object.assign(
	{},
	libPictFlowCardPropertiesPanel.default_configuration,
	{
		PanelType: 'UltravisorSettings',
		Configuration:
		{
			Schema: [],
			Defaults: {}
		}
	}
);
