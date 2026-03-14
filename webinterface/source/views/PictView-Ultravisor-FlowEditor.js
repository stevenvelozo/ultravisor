const libPictView = require('pict-view');
const libPictSectionFlow = require('pict-section-flow');
const libPictFlowCard = require('pict-section-flow').PictFlowCard;

// Built-in card configs (33 cards: 31 task-matched + 2 flow markers)
const libBuiltInCardConfigs = require('../cards/Ultravisor-BuiltIn-CardConfigs.js');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-FlowEditor",

	DefaultRenderable: "Ultravisor-FlowEditor-Content",
	DefaultDestinationAddress: "#Ultravisor-Content-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-floweditor {
			padding: 0.75em;
			display: flex;
			flex-direction: column;
			flex: 1;
			height: calc(100vh - 56px - 39px - 0.75em);
			min-height: 400px;
			box-sizing: border-box;
		}
		.ultravisor-floweditor-header {
			flex-shrink: 0;
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 0.75em;
			padding-bottom: 0.75em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.ultravisor-floweditor-header h1 {
			margin: 0;
			font-size: 1.8em;
			font-weight: 300;
			color: var(--uv-text);
		}
		.ultravisor-flow-actions {
			display: flex;
			gap: 0.5em;
			align-items: center;
			flex-wrap: wrap;
		}
		.ultravisor-flow-meta {
			flex-shrink: 0;
			display: flex;
			gap: 0.75em;
			align-items: center;
			margin-bottom: 0.5em;
			padding-bottom: 0.5em;
			border-bottom: 1px solid var(--uv-bg-base);
		}
		.ultravisor-flow-meta label {
			font-size: 0.8em;
			font-weight: 600;
			color: var(--uv-text-secondary);
			text-transform: uppercase;
			margin-right: 0.25em;
		}
		.ultravisor-flow-meta input {
			flex: 1;
			min-width: 120px;
		}
		.ultravisor-flow-meta-hash {
			font-size: 0.8em;
			color: var(--uv-text-tertiary);
			font-family: monospace;
		}
		#Ultravisor-FlowEditor-Container {
			flex: 1;
			min-height: 0;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-FlowEditor-Template",
			Template: /*html*/`
<div class="ultravisor-floweditor">
	<div class="ultravisor-floweditor-header">
		<h1 id="Ultravisor-FlowEditor-Title">Flow Editor</h1>
		<div class="ultravisor-flow-actions">
			<button class="ultravisor-btn ultravisor-btn-primary" onclick="{~P~}.views['Ultravisor-FlowEditor'].saveOperation()">Save Operation</button>
		</div>
	</div>
	<div class="ultravisor-flow-meta">
		<span id="Ultravisor-FlowEditor-HashDisplay" class="ultravisor-flow-meta-hash"></span>
		<label>Name</label>
		<input type="text" id="Ultravisor-FlowEditor-Name" placeholder="Operation name...">
		<label>Description</label>
		<input type="text" id="Ultravisor-FlowEditor-Description" placeholder="Description...">
	</div>
	<div id="Ultravisor-FlowEditor-Container"></div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-FlowEditor-Content",
			TemplateHash: "Ultravisor-FlowEditor-Template",
			DestinationAddress: "#Ultravisor-Content-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorFlowEditorView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this._FlowView = null;
	}

	/**
	 * Build a map of FlowCard node type configurations keyed by hash.
	 * These are passed as NodeTypes in the FlowView options so they
	 * are available from the moment the NodeTypeProvider is created,
	 * before the toolbar renders.
	 *
	 * @param {Array} [pAdditionalCardConfigs] - Optional extra card configs to register.
	 */
	_buildFlowCardNodeTypes(pAdditionalCardConfigs)
	{
		let tmpNodeTypes = {};

		// Register all built-in cards from the config array
		for (let i = 0; i < libBuiltInCardConfigs.length; i++)
		{
			let tmpCard = new libPictFlowCard(this.fable, libBuiltInCardConfigs[i], `FlowCard-${i}`);
			let tmpConfig = tmpCard.getNodeTypeConfiguration();
			// Ultravisor flow cards render port labels outside the node
			// boundary to avoid overlapping body content
			tmpConfig.PortLabelsOutside = true;
			tmpNodeTypes[tmpConfig.Hash] = tmpConfig;
		}

		// Register any additional cards (e.g. user-defined or plugin cards)
		if (Array.isArray(pAdditionalCardConfigs))
		{
			for (let i = 0; i < pAdditionalCardConfigs.length; i++)
			{
				let tmpCard = new libPictFlowCard(this.fable, pAdditionalCardConfigs[i], `FlowCard-Extra-${i}`);
				let tmpConfig = tmpCard.getNodeTypeConfiguration();
				tmpConfig.PortLabelsOutside = true;
				tmpNodeTypes[tmpConfig.Hash] = tmpConfig;
			}
		}

		return tmpNodeTypes;
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		// Populate the metadata fields from CurrentEditOperation
		let tmpOp = this.pict.AppData.Ultravisor.CurrentEditOperation;
		if (tmpOp)
		{
			let tmpTitleEl = document.getElementById('Ultravisor-FlowEditor-Title');
			if (tmpTitleEl)
			{
				tmpTitleEl.textContent = tmpOp.Hash ? ('Flow Editor: ' + (tmpOp.Name || tmpOp.Hash)) : 'Flow Editor: New Operation';
			}

			let tmpHashEl = document.getElementById('Ultravisor-FlowEditor-HashDisplay');
			if (tmpHashEl && tmpOp.Hash)
			{
				tmpHashEl.textContent = tmpOp.Hash;
			}

			let tmpNameEl = document.getElementById('Ultravisor-FlowEditor-Name');
			if (tmpNameEl)
			{
				tmpNameEl.value = tmpOp.Name || '';
			}

			let tmpDescEl = document.getElementById('Ultravisor-FlowEditor-Description');
			if (tmpDescEl)
			{
				tmpDescEl.value = tmpOp.Description || '';
			}
		}

		// Create and render the flow section view into its container
		if (!this._FlowView)
		{
			this._FlowView = this.pict.addView('Ultravisor-FlowDiagram',
				{
					ViewIdentifier: 'Ultravisor-FlowDiagram',

					DefaultRenderable: 'Flow-Container',
					DefaultDestinationAddress: '#Ultravisor-FlowEditor-Container',

					AutoRender: false,

					FlowDataAddress: 'AppData.Ultravisor.Flows.Current',

					TargetElementAddress: '#Flow-SVG-Container',

					EnableToolbar: true,
					EnablePanning: true,
					EnableZooming: true,
					EnableNodeDragging: true,
					EnableConnectionCreation: true,
					EnableGridSnap: false,
					GridSnapSize: 20,

					MinZoom: 0.1,
					MaxZoom: 5.0,
					ZoomStep: 0.1,

					DefaultNodeType: 'default',
					DefaultNodeWidth: 180,
					DefaultNodeHeight: 80,

					// Pre-register FlowCard node types so they are available
					// when the NodeTypeProvider is created, before toolbar renders
					NodeTypes: this._buildFlowCardNodeTypes(),

					Renderables:
					[
						{
							RenderableHash: 'Flow-Container',
							TemplateHash: 'Flow-Container-Template',
							DestinationAddress: '#Ultravisor-FlowEditor-Container',
							RenderMethod: 'replace'
						}
					]
				},
				libPictSectionFlow
			);
		}

		// Initialize default empty flow if none exists
		if (!this.pict.AppData.Ultravisor.Flows.Current)
		{
			this.pict.AppData.Ultravisor.Flows.Current =
			{
				Nodes: [],
				Connections: [],
				ViewState: { PanX: 0, PanY: 0, Zoom: 1, SelectedNodeHash: null, SelectedConnectionHash: null }
			};
		}

		// Reset the flow view's render state so it re-initializes SVG elements
		// when re-rendered (e.g. after navigating away and back)
		this._FlowView.initialRenderComplete = false;
		this._FlowView.render();

		// Register and apply the desert theme to match Ultravisor's UI.
		// Must happen after render() since the ThemeProvider is created during init.
		this._registerDesertTheme();

		// Re-inject CSS after the flow view creates its dynamic styles
		this.pict.CSSMap.injectCSS();

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	/**
	 * Register a custom "desert" flow theme that harmonizes with
	 * Ultravisor's Desert Dusk color scheme.
	 */
	_registerDesertTheme()
	{
		if (!this._FlowView || !this._FlowView._ThemeProvider)
		{
			return;
		}

		this._FlowView._ThemeProvider.registerTheme('desert',
		{
			Key: 'desert',
			Label: 'Desert Dusk',
			CSSVariables:
			{
				// Canvas — muted turquoise tint, lighter than cards so they stand out
				'--pf-canvas-bg': '#243030',
				'--pf-grid-stroke': '#2c3838',

				// Nodes
				'--pf-node-body-fill': '#1e1a16',
				'--pf-node-body-stroke': '#3a3028',
				'--pf-node-body-stroke-width': '1',
				'--pf-node-body-radius': '6px',
				'--pf-node-shadow': 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.30))',
				'--pf-node-shadow-hover': 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.40))',
				'--pf-node-shadow-selected': 'drop-shadow(0 2px 8px rgba(196, 149, 106, 0.30))',
				'--pf-node-shadow-dragging': 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.50))',
				'--pf-node-title-fill': '#d8c8a8',
				'--pf-node-title-size': '11.5px',
				'--pf-node-title-weight': '600',
				'--pf-node-type-label-fill': '#706050',
				'--pf-node-selected-stroke': '#c4956a',

				// Ports — keep the 5-type semantic colors, adjusted for dark bg
				'--pf-port-input-fill': '#5a9ecb',
				'--pf-port-output-fill': '#5ab88a',
				'--pf-port-stroke': '#252018',
				'--pf-port-event-in-fill': '#5a9ecb',
				'--pf-port-event-out-fill': '#5ab88a',
				'--pf-port-setting-fill': '#d4884a',
				'--pf-port-value-fill': '#d4b040',
				'--pf-port-error-fill': '#c44e4e',

				// Port labels
				'--pf-port-label-bg': 'rgba(30, 26, 22, 0.85)',
				'--pf-port-label-text': '#c8b8a0',

				// Connections
				'--pf-connection-stroke': '#706050',
				'--pf-connection-selected-stroke': '#c4956a',
				'--pf-connection-event-in-stroke': '#5a9ecb',
				'--pf-connection-event-out-stroke': '#5ab88a',
				'--pf-connection-setting-stroke': '#d4884a',
				'--pf-connection-value-stroke': '#d4b040',
				'--pf-connection-error-stroke': '#c44e4e',

				// Panels
				'--pf-panel-bg': '#252018',
				'--pf-panel-border': '#3a3028',
				'--pf-panel-radius': '6px',
				'--pf-panel-shadow': '0 4px 12px rgba(0,0,0,0.30), 0 1px 3px rgba(0,0,0,0.20)',
				'--pf-panel-titlebar-bg': '#302818',
				'--pf-panel-titlebar-border': '#3a3028',
				'--pf-panel-title-color': '#d8c8a8'
			},
			AdditionalCSS: `
				.pict-flow-container {
					border: 1px solid #3a3028;
					border-radius: 6px;
				}
				.pict-flow-toolbar {
					background-color: #252018;
					border-bottom-color: #3a3028;
				}
				.pict-flow-toolbar-btn {
					background-color: #302818;
					border-color: #3a3028;
					color: #c8b8a0;
				}
				.pict-flow-toolbar-btn:hover {
					background-color: #3a3028;
					color: #d8c8a8;
				}
				.pict-flow-toolbar-btn.active {
					background-color: #4a3828;
					border-color: #c4956a;
					color: #d8c8a8;
				}
				.pict-flow-toolbar-separator {
					border-left-color: #3a3028;
				}
				.pict-flow-toolbar-dropdown {
					background-color: #252018;
					border-color: #3a3028;
					color: #c8b8a0;
				}
				.pict-flow-toolbar-dropdown-menu {
					background-color: #252018;
					border-color: #3a3028;
				}
				.pict-flow-toolbar-dropdown-item {
					color: #c8b8a0;
				}
				.pict-flow-toolbar-dropdown-item:hover {
					background-color: #3a3028;
					color: #d8c8a8;
				}
				.pict-flow-node-title-icon {
					filter: brightness(0.8) sepia(0.3) !important;
				}
				/* Info panel styles for dark theme */
				.pict-flow-info-panel {
					color: #c8b8a0;
				}
				.pict-flow-info-panel-section-title {
					color: #907860;
				}
				.pict-flow-info-panel-port {
					color: #c8b8a0;
					background-color: #302818;
					border-color: #3a3028;
				}
				.pict-flow-info-panel-port-constraint {
					color: #907860;
				}
				/* Form panel styles for dark theme */
				.pict-flow-panel-body .pict-form label {
					color: #c8b8a0 !important;
				}
				.pict-flow-panel-body .pict-form input,
				.pict-flow-panel-body .pict-form textarea,
				.pict-flow-panel-body .pict-form select {
					background-color: #1a1714 !important;
					border-color: #3a3028 !important;
					color: #c8b8a0 !important;
				}
				.pict-flow-panel-body .pict-form input:focus,
				.pict-flow-panel-body .pict-form textarea:focus,
				.pict-flow-panel-body .pict-form select:focus {
					border-color: #c4956a !important;
				}
				/* Port summary in panels */
				.pict-flow-port-summary {
					border-top-color: #3a3028;
				}
				/* Override per-card light-mode body fills with dark theme fill.
				   SVG fill="" is a presentation attribute; CSS overrides it. */
				.pict-flow-node-body {
					fill: #1e1a16;
					stroke: #3a3028;
				}
				/* Override built-in start/end/halt/decision body colors (specificity 0,2,0
				   matches the base CSS rules so this later stylesheet wins). */
				.pict-flow-node-start .pict-flow-node-body {
					fill: #182018;
					stroke: #2a4030;
					stroke-width: 1.5;
				}
				.pict-flow-node-end .pict-flow-node-body {
					fill: #161e20;
					stroke: #2a3840;
					stroke-width: 1.5;
				}
				.pict-flow-node-halt .pict-flow-node-body {
					fill: #201414;
					stroke: #4a2020;
					stroke-width: 1.5;
				}
				.pict-flow-node-decision .pict-flow-node-body {
					fill: #1e1a12;
					stroke: #4a3820;
					stroke-width: 1.5;
				}
				/* Desert title bar: warm muted base for all nodes.
				   CSS overrides the SVG fill="" presentation attribute. */
				.pict-flow-node-title-bar,
				.pict-flow-node-title-bar-bottom {
					fill: #3a3028;
				}
				/* Distinct title bars for special node types */
				.pict-flow-node-start .pict-flow-node-title-bar,
				.pict-flow-node-start .pict-flow-node-title-bar-bottom {
					fill: #2a4030;
				}
				.pict-flow-node-end .pict-flow-node-title-bar,
				.pict-flow-node-end .pict-flow-node-title-bar-bottom {
					fill: #2a3840;
				}
				.pict-flow-node-halt .pict-flow-node-title-bar,
				.pict-flow-node-halt .pict-flow-node-title-bar-bottom {
					fill: #4a2020;
				}
				.pict-flow-node-decision .pict-flow-node-title-bar,
				.pict-flow-node-decision .pict-flow-node-title-bar-bottom {
					fill: #4a3820;
				}
			`,
			NodeBodyMode: 'rect',
			BracketConfig: null,
			ConnectionConfig:
			{
				StrokeDashArray: null,
				StrokeWidth: 2,
				ArrowheadStyle: 'triangle'
			},
			NoiseConfig:
			{
				Enabled: false,
				DefaultLevel: 0,
				MaxJitterPx: 0,
				AffectsNodes: false,
				AffectsConnections: false
			},
			ShapeOverrides:
			{
				'arrowhead-connection': { Fill: '#706050' },
				'arrowhead-connection-selected': { Fill: '#c4956a' }
			}
		});

		this._FlowView.setTheme('desert');
	}

	loadExample(pExampleName)
	{
		let tmpFlowData = null;

		if (pExampleName === 'CSVPipeline')
		{
			tmpFlowData = require('../data/ExampleFlow-CSVPipeline.js');
		}
		else if (pExampleName === 'MeadowPipeline')
		{
			tmpFlowData = require('../data/ExampleFlow-MeadowPipeline.js');
		}
		else if (pExampleName === 'FileProcessor')
		{
			tmpFlowData = require('../data/ExampleFlow-FileProcessor.js');
		}

		if (tmpFlowData)
		{
			this.pict.AppData.Ultravisor.Flows.Current = JSON.parse(JSON.stringify(tmpFlowData));
			if (this._FlowView)
			{
				this._FlowView.setFlowData(this.pict.AppData.Ultravisor.Flows.Current);
				// Zoom to fit after a brief delay to allow the DOM to update
				let tmpFlowView = this._FlowView;
				setTimeout(function()
				{
					if (tmpFlowView._ViewportManager)
					{
						tmpFlowView._ViewportManager.zoomToFit();
					}
				}, 100);
			}
		}
	}

	saveOperation()
	{
		if (!this._FlowView)
		{
			return;
		}

		let tmpFlowData = this._FlowView.getFlowData();
		if (!tmpFlowData || !tmpFlowData.Nodes || tmpFlowData.Nodes.length === 0)
		{
			alert('No flow data to save. Add some nodes first.');
			return;
		}

		// Read the metadata from the form fields
		let tmpName = document.getElementById('Ultravisor-FlowEditor-Name').value.trim();
		let tmpDescription = document.getElementById('Ultravisor-FlowEditor-Description').value.trim();

		if (!tmpName)
		{
			alert('Please enter an operation name.');
			return;
		}

		// Build the operation data with the graph
		let tmpOpData =
		{
			Name: tmpName,
			Description: tmpDescription,
			Graph:
			{
				Nodes: tmpFlowData.Nodes,
				Connections: tmpFlowData.Connections,
				ViewState: tmpFlowData.ViewState || {}
			}
		};

		// Include Hash if editing an existing operation
		let tmpOp = this.pict.AppData.Ultravisor.CurrentEditOperation;
		if (tmpOp && tmpOp.Hash)
		{
			tmpOpData.Hash = tmpOp.Hash;
		}

		this.pict.PictApplication.saveOperation(tmpOpData,
			function (pError, pData)
			{
				if (pError)
				{
					alert('Error saving operation: ' + pError.message);
					return;
				}

				// Update the current edit operation with the saved data
				if (pData && pData.Hash)
				{
					if (!this.pict.AppData.Ultravisor.CurrentEditOperation)
					{
						this.pict.AppData.Ultravisor.CurrentEditOperation = {};
					}
					this.pict.AppData.Ultravisor.CurrentEditOperation.Hash = pData.Hash;
					this.pict.AppData.Ultravisor.CurrentEditOperation.Name = tmpName;
					this.pict.AppData.Ultravisor.CurrentEditOperation.Description = tmpDescription;

					let tmpHashEl = document.getElementById('Ultravisor-FlowEditor-HashDisplay');
					if (tmpHashEl)
					{
						tmpHashEl.textContent = pData.Hash;
					}
				}

				alert('Operation saved successfully.');
			}.bind(this));
	}
}

module.exports = UltravisorFlowEditorView;

module.exports.default_configuration = _ViewConfiguration;
