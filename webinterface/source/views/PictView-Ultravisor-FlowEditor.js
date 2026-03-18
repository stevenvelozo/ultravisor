const libPictView = require('pict-view');
const libPictSectionFlow = require('pict-section-flow');
const libPictFlowCard = require('pict-section-flow').PictFlowCard;

// Card config generator — converts task definitions into PictFlowCard configs
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
			align-items: flex-start;
			margin-bottom: 0.5em;
			padding-bottom: 0.5em;
			border-bottom: 1px solid var(--uv-bg-base);
		}
		.ultravisor-flow-meta-field {
			display: flex;
			align-items: center;
			gap: 0.35em;
		}
		.ultravisor-flow-meta-field-desc {
			display: flex;
			align-items: flex-start;
			gap: 0.35em;
			flex: 2;
		}
		.ultravisor-flow-meta-field-desc label {
			padding-top: 0.4em;
		}
		.ultravisor-flow-meta label {
			font-size: 0.8em;
			font-weight: 600;
			color: var(--uv-text-secondary);
			text-transform: uppercase;
			white-space: nowrap;
		}
		.ultravisor-flow-meta input {
			flex: 1;
			min-width: 120px;
		}
		.ultravisor-flow-meta textarea {
			flex: 1;
			min-width: 200px;
			resize: none;
			overflow-y: hidden;
			font-family: inherit;
			font-size: inherit;
			line-height: 1.4;
		}
		.ultravisor-flow-meta-hash {
			font-size: 0.8em;
			color: var(--uv-text-tertiary);
			font-family: monospace;
			padding-top: 0.4em;
		}
		.ultravisor-btn-execute {
			background-color: #1a3a2a;
			color: #5ab88a;
			border: 1px solid #2a5040;
		}
		.ultravisor-btn-execute:hover {
			background-color: #204530;
			border-color: #3a6050;
		}
		.ultravisor-btn-sm.ultravisor-btn-execute {
			background-color: #1a3a2a;
			color: #5ab88a;
			border: 1px solid #2a5040;
		}
		.ultravisor-btn-sm.ultravisor-btn-execute:hover {
			background-color: #204530;
		}
		#Ultravisor-FlowEditor-Container {
			flex: 1;
			min-height: 0;
		}

		/* Visual Execution Mode — Node States */
		.uv-exec-idle .pict-flow-node-body {
			opacity: 0.5;
		}
		.uv-exec-executing .pict-flow-node-body {
			stroke: #5a9ecb !important;
			stroke-width: 2.5 !important;
		}
		.uv-exec-executing {
			animation: uv-exec-pulse 1.2s ease-in-out infinite;
		}
		@keyframes uv-exec-pulse {
			0%, 100% { filter: drop-shadow(0 0 3px rgba(90, 158, 203, 0.6)); }
			50% { filter: drop-shadow(0 0 12px rgba(90, 158, 203, 0.9)); }
		}
		.uv-exec-complete .pict-flow-node-body {
			stroke: #5ab88a !important;
			stroke-width: 2 !important;
		}
		.uv-exec-complete .pict-flow-node-title-bar,
		.uv-exec-complete .pict-flow-node-title-bar-bottom {
			fill: #2a5040 !important;
		}
		.uv-exec-error .pict-flow-node-body {
			stroke: #c44e4e !important;
			stroke-width: 2.5 !important;
		}
		.uv-exec-error .pict-flow-node-title-bar,
		.uv-exec-error .pict-flow-node-title-bar-bottom {
			fill: #4a2020 !important;
		}
		.uv-exec-waiting .pict-flow-node-body {
			stroke: #d4884a !important;
			stroke-width: 2 !important;
			stroke-dasharray: 4 2;
		}

		/* Execution status bar */
		.ultravisor-floweditor-execution-status {
			flex-shrink: 0;
			display: flex;
			align-items: center;
			gap: 1em;
			padding: 0.5em 0.75em;
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 4px;
			margin-bottom: 0.5em;
			font-size: 0.85em;
			color: var(--uv-text-secondary);
		}
		.uv-exec-status-badge {
			display: inline-block;
			padding: 0.15em 0.5em;
			border-radius: 3px;
			font-size: 0.85em;
			font-weight: 600;
		}
		.uv-exec-status-badge.running {
			background-color: #1a3a5a;
			color: #5a9ecb;
		}
		.uv-exec-status-badge.complete {
			background-color: #1a3a2a;
			color: #5ab88a;
		}
		.uv-exec-status-badge.error {
			background-color: #3a1a1a;
			color: #c44e4e;
		}
		.uv-exec-status-badge.waitingforinput {
			background-color: #3a2a1a;
			color: #d4884a;
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
			<button class="ultravisor-btn ultravisor-btn-execute" id="Ultravisor-FlowEditor-ExecuteBtn" onclick="{~P~}.views['Ultravisor-FlowEditor'].startVisualExecution()">Execute</button>
			<button class="ultravisor-btn ultravisor-btn-delete" id="Ultravisor-FlowEditor-StopBtn" onclick="{~P~}.views['Ultravisor-FlowEditor'].stopVisualExecution()" style="display:none">Stop</button>
		</div>
	</div>
	<div id="Ultravisor-FlowEditor-ExecStatus" class="ultravisor-floweditor-execution-status" style="display:none"></div>
	<div class="ultravisor-flow-meta">
		<span id="Ultravisor-FlowEditor-HashDisplay" class="ultravisor-flow-meta-hash"></span>
		<div class="ultravisor-flow-meta-field">
			<label>Name</label>
			<input type="text" id="Ultravisor-FlowEditor-Name" placeholder="Operation name...">
		</div>
		<div class="ultravisor-flow-meta-field-desc">
			<label>Description</label>
			<textarea id="Ultravisor-FlowEditor-Description" rows="1" placeholder="Description..."></textarea>
		</div>
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

		// Visual execution mode state
		this._ExecutionRunHash = null;
		this._ExecutionWebSocket = null;
		this._ExecutionPollingTimer = null;
		this._ExecutionNodeStates = {};
		this._ExecutionCompletedCount = 0;
		this._ExecutionErrorCount = 0;
		this._IsExecuting = false;
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

		// Generate card configs from API-fetched task type definitions
		let tmpDefinitions = this.pict.AppData.Ultravisor.TaskTypes || [];
		let tmpCardConfigs = libBuiltInCardConfigs.generateCardConfigs(tmpDefinitions);

		for (let i = 0; i < tmpCardConfigs.length; i++)
		{
			let tmpCard = new libPictFlowCard(this.fable, tmpCardConfigs[i], `FlowCard-${i}`);
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

	/**
	 * Reconcile node ports with current node type definitions.
	 *
	 * Saved operations store each node's Ports array at save time.  When a
	 * task definition gains new ports (e.g. setting ports added after the
	 * definitions moved to JSON), existing saved nodes lack those ports.
	 *
	 * This method compares each node's Ports to its node type's DefaultPorts
	 * and appends any missing ports so they appear in the editor.
	 *
	 * @param {Array} pNodes - The Nodes array from the flow data.
	 */
	_reconcileNodePorts(pNodes)
	{
		if (!Array.isArray(pNodes) || !this._FlowView)
		{
			return;
		}

		let tmpNodeTypes = this._FlowView.options.NodeTypes;

		for (let i = 0; i < pNodes.length; i++)
		{
			let tmpNode = pNodes[i];
			let tmpNodeType = tmpNodeTypes[tmpNode.Type];

			if (!tmpNodeType || !Array.isArray(tmpNodeType.DefaultPorts) || !Array.isArray(tmpNode.Ports))
			{
				continue;
			}

			for (let j = 0; j < tmpNodeType.DefaultPorts.length; j++)
			{
				let tmpDefaultPort = tmpNodeType.DefaultPorts[j];

				// Check if the node already has a port with the same label and direction
				let tmpExists = false;
				for (let k = 0; k < tmpNode.Ports.length; k++)
				{
					if (tmpNode.Ports[k].Label === tmpDefaultPort.Label && tmpNode.Ports[k].Direction === tmpDefaultPort.Direction)
					{
						tmpExists = true;
						break;
					}
				}

				if (!tmpExists)
				{
					// Generate a hash for the new port: {nodeHash}-{portLabel}
					let tmpPortHash = `${tmpNode.Hash}-${tmpDefaultPort.Label}`;
					tmpNode.Ports.push(
					{
						Hash: tmpPortHash,
						Direction: tmpDefaultPort.Direction,
						Side: tmpDefaultPort.Side,
						Label: tmpDefaultPort.Label,
						PortType: tmpDefaultPort.PortType,
						MinimumInputCount: tmpDefaultPort.MinimumInputCount || 0,
						MaximumInputCount: tmpDefaultPort.MaximumInputCount || 1
					});
				}
			}

			// Flag orphaned ports — saved ports whose Label+Direction
			// no longer match any DefaultPort in the current server definition.
			for (let k = 0; k < tmpNode.Ports.length; k++)
			{
				let tmpPort = tmpNode.Ports[k];
				let tmpMatchFound = false;
				for (let j = 0; j < tmpNodeType.DefaultPorts.length; j++)
				{
					if (tmpNodeType.DefaultPorts[j].Label === tmpPort.Label && tmpNodeType.DefaultPorts[j].Direction === tmpPort.Direction)
					{
						tmpMatchFound = true;
						break;
					}
				}
				if (!tmpMatchFound)
				{
					tmpPort.Orphaned = true;
				}
			}
		}
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
				// Auto-size the textarea to fit content
				tmpDescEl.style.height = 'auto';
				tmpDescEl.style.height = tmpDescEl.scrollHeight + 'px';
				// Keep it auto-sized as user types
				tmpDescEl.addEventListener('input', function ()
				{
					this.style.height = 'auto';
					this.style.height = this.scrollHeight + 'px';
				});
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

		// Reconcile node ports with current node type definitions.
		// Saved operations may lack ports that were added after the operation
		// was created (e.g. setting ports added when definitions moved to JSON).
		this._reconcileNodePorts(this.pict.AppData.Ultravisor.Flows.Current.Nodes);

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
				'--pf-canvas-bg': '#304040',
				'--pf-grid-stroke': '#384848',

				// Nodes
				'--pf-node-body-fill': '#1e1a16',
				'--pf-node-body-stroke': '#3a3028',
				'--pf-node-body-stroke-width': '1',
				'--pf-node-body-radius': '3px',
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

				// Panels — cooler tone to contrast with warm node bodies
				'--pf-panel-bg': '#1e2228',
				'--pf-panel-border': '#343c44',
				'--pf-panel-radius': '6px',
				'--pf-panel-shadow': '0 4px 12px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.25)',
				'--pf-panel-titlebar-bg': '#262e36',
				'--pf-panel-titlebar-border': '#343c44',
				'--pf-panel-title-color': '#c8d0d8'
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
				/* Info panel styles — cooler blue-gray tone */
				.pict-flow-info-panel {
					color: #b8c4cc;
				}
				.pict-flow-info-panel-header {
					color: #c8d0d8;
				}
				.pict-flow-info-panel-description {
					color: #808c94;
				}
				.pict-flow-info-panel-section-title {
					color: #7088a0;
					border-bottom-color: #343c44;
				}
				.pict-flow-info-panel-badge.category {
					background: #2a3038;
					color: #8090a0;
				}
				.pict-flow-info-panel-badge.code {
					background: #1e2830;
					color: #5a9ecb;
				}
				.pict-flow-info-panel-port {
					color: #b8c4cc;
					background-color: #242c34;
					border-color: #343c44;
				}
				.pict-flow-info-panel-port-constraint {
					color: #708090;
				}
				/* Node properties editor in panels */
				.pict-flow-panel-node-props {
					border-top-color: #343c44;
				}
				.pict-flow-panel-node-props-header {
					background: #262e36;
				}
				.pict-flow-panel-node-props-header:hover {
					background: #2e3640;
				}
				.pict-flow-panel-node-props-title {
					color: #7088a0;
				}
				.pict-flow-panel-node-props-chevron {
					color: #607080;
				}
				.pict-flow-panel-close-btn {
					color: #708090;
				}
				.pict-flow-panel-close-btn:hover {
					color: #c44e4e;
					background-color: rgba(196, 78, 78, 0.12);
				}
				/* Form panel styles — force all text in panels to be readable */
				.pict-flow-panel-body,
				.pict-flow-panel-body * {
					color: #b8c4cc;
				}
				.pict-flow-panel-body h2,
				.pict-flow-panel-body h3 {
					color: #c8d0d8;
				}
				.pict-flow-panel-body label,
				.pict-flow-panel-body .pict-form label {
					color: #90a0b0 !important;
				}
				.pict-flow-panel-body span,
				.pict-flow-panel-body .pict-form span {
					color: #90a0b0;
				}
				.pict-flow-panel-body input,
				.pict-flow-panel-body textarea,
				.pict-flow-panel-body select,
				.pict-flow-panel-body .pict-form input,
				.pict-flow-panel-body .pict-form textarea,
				.pict-flow-panel-body .pict-form select {
					background-color: #181c22 !important;
					border-color: #343c44 !important;
					color: #b8c4cc !important;
				}
				.pict-flow-panel-body input:focus,
				.pict-flow-panel-body textarea:focus,
				.pict-flow-panel-body select:focus,
				.pict-flow-panel-body .pict-form input:focus,
				.pict-flow-panel-body .pict-form textarea:focus,
				.pict-flow-panel-body .pict-form select:focus {
					border-color: #5a9ecb !important;
				}
				/* Port summary in panels */
				.pict-flow-port-summary {
					border-top-color: #343c44;
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

	// ====================================================================
	// Visual Execution Mode
	// ====================================================================

	/**
	 * Start visual execution of the current operation.
	 * Triggers async execution on the server and opens a WebSocket
	 * connection to receive real-time execution events.
	 */
	startVisualExecution()
	{
		let tmpOp = this.pict.AppData.Ultravisor.CurrentEditOperation;

		if (!tmpOp || !tmpOp.Hash)
		{
			alert('Please save the operation before executing.');
			return;
		}

		if (this._IsExecuting)
		{
			return;
		}

		this._IsExecuting = true;
		this._ExecutionNodeStates = {};
		this._ExecutionStartTime = Date.now();
		this._ExecutionCompletedCount = 0;
		this._ExecutionErrorCount = 0;

		// Update button visibility
		let tmpExecBtn = document.getElementById('Ultravisor-FlowEditor-ExecuteBtn');
		let tmpStopBtn = document.getElementById('Ultravisor-FlowEditor-StopBtn');
		if (tmpExecBtn) { tmpExecBtn.style.display = 'none'; }
		if (tmpStopBtn) { tmpStopBtn.style.display = 'inline-block'; }

		// Initialize all nodes to idle visual state
		if (this._FlowView && this._FlowView._NodesLayer)
		{
			let tmpNodes = this.pict.AppData.Ultravisor.Flows.Current.Nodes || [];
			for (let i = 0; i < tmpNodes.length; i++)
			{
				this._applyNodeVisualState(tmpNodes[i].Hash, 'idle');
			}
		}

		// Show execution status bar
		this._updateExecutionStatusBar('Running', 0, 0, 0);

		// Start async execution
		let tmpRunMode = this.pict.AppData.Ultravisor.DebugMode ? 'debug' : 'standard';
		this.pict.PictApplication.executeOperationAsync(tmpOp.Hash, tmpRunMode,
			function (pError, pData)
			{
				if (pError)
				{
					this._finishExecution('Error', 'Failed to start execution: ' + pError.message);
					return;
				}

				this._ExecutionRunHash = pData.RunHash;

				// Connect WebSocket for real-time events
				this._connectExecutionWebSocket(pData.RunHash);
			}.bind(this));
	}

	/**
	 * Open a WebSocket connection and subscribe to execution events
	 * for the given RunHash.
	 *
	 * @param {string} pRunHash - The execution run hash to subscribe to.
	 */
	_connectExecutionWebSocket(pRunHash)
	{
		// Build WebSocket URL from the current page location
		let tmpProtocol = (window.location.protocol === 'https:') ? 'wss:' : 'ws:';
		let tmpHost = window.location.host;
		let tmpBaseURL = this.pict.AppData.Ultravisor.APIBaseURL;

		// If APIBaseURL is set (e.g. "http://localhost:54321"), extract host from it
		if (tmpBaseURL)
		{
			try
			{
				let tmpURL = new URL(tmpBaseURL);
				tmpHost = tmpURL.host;
				tmpProtocol = (tmpURL.protocol === 'https:') ? 'wss:' : 'ws:';
			}
			catch (pError)
			{
				// Fall back to page location
			}
		}

		let tmpWSURL = tmpProtocol + '//' + tmpHost;

		try
		{
			this._ExecutionWebSocket = new WebSocket(tmpWSURL);
		}
		catch (pError)
		{
			this.pict.log.warn('FlowEditor: WebSocket connection failed, falling back to polling.');
			this._fallbackToPolling();
			return;
		}

		this._ExecutionWebSocket.onopen = function ()
		{
			// Subscribe to execution events for this run
			this._ExecutionWebSocket.send(JSON.stringify({
				Action: 'Subscribe',
				RunHash: pRunHash
			}));
		}.bind(this);

		this._ExecutionWebSocket.onmessage = function (pEvent)
		{
			this._handleExecutionEvent(pEvent.data);
		}.bind(this);

		this._ExecutionWebSocket.onerror = function ()
		{
			this.pict.log.warn('FlowEditor: WebSocket error, falling back to polling.');
			this._ExecutionWebSocket = null;
			this._fallbackToPolling();
		}.bind(this);

		this._ExecutionWebSocket.onclose = function ()
		{
			this._ExecutionWebSocket = null;
		}.bind(this);
	}

	/**
	 * Handle an incoming WebSocket execution event message.
	 *
	 * @param {string} pMessageData - The raw message string.
	 */
	_handleExecutionEvent(pMessageData)
	{
		let tmpMessage;
		try
		{
			tmpMessage = JSON.parse(pMessageData);
		}
		catch (pError)
		{
			return;
		}

		let tmpEventType = tmpMessage.EventType;
		let tmpData = tmpMessage.Data || {};

		if (tmpEventType === 'TaskStart')
		{
			this._applyNodeVisualState(tmpData.NodeHash, 'executing');
		}
		else if (tmpEventType === 'TaskComplete')
		{
			this._applyNodeVisualState(tmpData.NodeHash, 'complete');
			this._ExecutionCompletedCount++;
		}
		else if (tmpEventType === 'TaskError')
		{
			this._applyNodeVisualState(tmpData.NodeHash, 'error');
			this._ExecutionErrorCount++;
		}
		else if (tmpEventType === 'ExecutionComplete')
		{
			this._finishExecution(tmpData.Status);
		}

		// Update status bar with current elapsed time
		let tmpElapsedMs = tmpData.ElapsedMs || (Date.now() - this._ExecutionStartTime);
		let tmpStatus = (tmpEventType === 'ExecutionComplete') ? tmpData.Status : 'Running';
		this._updateExecutionStatusBar(tmpStatus, this._ExecutionCompletedCount, this._ExecutionErrorCount, tmpElapsedMs);
	}

	/**
	 * Fall back to polling if WebSocket connection fails.
	 */
	_fallbackToPolling()
	{
		if (!this._ExecutionRunHash || !this._IsExecuting)
		{
			return;
		}

		this._ExecutionPollingTimer = setInterval(
			this._pollExecutionStatus.bind(this), 500);
	}

	/**
	 * Poll the manifest endpoint for execution progress (fallback mode).
	 */
	_pollExecutionStatus()
	{
		if (!this._ExecutionRunHash)
		{
			return;
		}

		this.pict.PictApplication.loadManifest(this._ExecutionRunHash,
			function (pError, pData)
			{
				if (pError)
				{
					this._finishExecution('Error', 'Lost connection to server.');
					return;
				}

				if (!pData)
				{
					return;
				}

				let tmpCompletedCount = 0;
				let tmpErrorCount = 0;
				let tmpTaskManifests = pData.TaskManifests || {};
				let tmpNodeHashes = Object.keys(tmpTaskManifests);

				for (let i = 0; i < tmpNodeHashes.length; i++)
				{
					let tmpNodeHash = tmpNodeHashes[i];
					let tmpManifest = tmpTaskManifests[tmpNodeHash];
					let tmpExecState = 'idle';

					if (tmpManifest.Executions && tmpManifest.Executions.length > 0)
					{
						let tmpLatest = tmpManifest.Executions[tmpManifest.Executions.length - 1];

						if (tmpLatest.Status === 'Running')
						{
							tmpExecState = 'executing';
						}
						else if (tmpLatest.Status === 'Complete')
						{
							tmpExecState = 'complete';
							tmpCompletedCount++;
						}
						else if (tmpLatest.Status === 'Error')
						{
							tmpExecState = 'error';
							tmpErrorCount++;
						}
					}

					if (pData.WaitingTasks && pData.WaitingTasks[tmpNodeHash])
					{
						tmpExecState = 'waiting';
					}

					if (this._ExecutionNodeStates[tmpNodeHash] !== tmpExecState)
					{
						this._applyNodeVisualState(tmpNodeHash, tmpExecState);
					}
				}

				let tmpElapsedMs = pData.ElapsedMs || (Date.now() - this._ExecutionStartTime);
				this._updateExecutionStatusBar(pData.Status, tmpCompletedCount, tmpErrorCount, tmpElapsedMs);

				if (pData.Status === 'Complete' || pData.Status === 'Error' || pData.Status === 'WaitingForInput')
				{
					this._finishExecution(pData.Status);
				}
			}.bind(this));
	}

	/**
	 * Apply a visual execution state to a node's SVG group element.
	 *
	 * @param {string} pNodeHash - The node hash.
	 * @param {string} pState - One of: 'idle', 'executing', 'complete', 'error', 'waiting'.
	 */
	_applyNodeVisualState(pNodeHash, pState)
	{
		this._ExecutionNodeStates[pNodeHash] = pState;

		if (!this._FlowView || !this._FlowView._NodesLayer)
		{
			return;
		}

		let tmpNodeGroup = this._FlowView._NodesLayer.querySelector('[data-node-hash="' + pNodeHash + '"]');

		if (!tmpNodeGroup)
		{
			return;
		}

		// Remove all execution state classes
		tmpNodeGroup.classList.remove('uv-exec-idle', 'uv-exec-executing', 'uv-exec-complete', 'uv-exec-error', 'uv-exec-waiting');

		// Add the new state class
		tmpNodeGroup.classList.add('uv-exec-' + pState);
	}

	/**
	 * Update the execution status bar with current progress.
	 */
	_updateExecutionStatusBar(pStatus, pCompletedCount, pErrorCount, pElapsedMs)
	{
		let tmpStatusEl = document.getElementById('Ultravisor-FlowEditor-ExecStatus');
		if (!tmpStatusEl)
		{
			return;
		}

		tmpStatusEl.style.display = 'flex';

		let tmpStatusClass = (pStatus || 'running').toLowerCase().replace(/\s/g, '');
		let tmpElapsedSec = ((pElapsedMs || 0) / 1000).toFixed(1);
		let tmpHTML = '<span class="uv-exec-status-badge ' + tmpStatusClass + '">' + (pStatus || 'Running') + '</span>';
		tmpHTML += '<span>' + tmpElapsedSec + 's elapsed</span>';

		if (pCompletedCount > 0)
		{
			tmpHTML += '<span>' + pCompletedCount + ' completed</span>';
		}
		if (pErrorCount > 0)
		{
			tmpHTML += '<span style="color:#c44e4e">' + pErrorCount + ' error' + (pErrorCount !== 1 ? 's' : '') + '</span>';
		}

		tmpStatusEl.innerHTML = tmpHTML;
	}

	/**
	 * Finish execution — close WebSocket/polling and update UI.
	 *
	 * @param {string} pFinalStatus - The final status ('Complete', 'Error', 'WaitingForInput').
	 * @param {string} [pMessage] - Optional message to append to status bar.
	 */
	_finishExecution(pFinalStatus, pMessage)
	{
		// Close WebSocket if open
		if (this._ExecutionWebSocket)
		{
			this._ExecutionWebSocket.onclose = null;
			this._ExecutionWebSocket.close();
			this._ExecutionWebSocket = null;
		}

		// Clear polling timer if in fallback mode
		if (this._ExecutionPollingTimer)
		{
			clearInterval(this._ExecutionPollingTimer);
			this._ExecutionPollingTimer = null;
		}

		this._IsExecuting = false;
		this._ExecutionRunHash = null;

		// Restore button visibility
		let tmpExecBtn = document.getElementById('Ultravisor-FlowEditor-ExecuteBtn');
		let tmpStopBtn = document.getElementById('Ultravisor-FlowEditor-StopBtn');
		if (tmpExecBtn) { tmpExecBtn.style.display = 'inline-block'; }
		if (tmpStopBtn) { tmpStopBtn.style.display = 'none'; }

		// Update status bar with final state
		if (pMessage)
		{
			let tmpStatusEl = document.getElementById('Ultravisor-FlowEditor-ExecStatus');
			if (tmpStatusEl)
			{
				tmpStatusEl.innerHTML += '<span style="color:#c44e4e">' + pMessage + '</span>';
			}
		}
	}

	/**
	 * Stop visual execution and clear all execution visuals.
	 */
	stopVisualExecution()
	{
		this._finishExecution('Stopped');
		this._clearExecutionVisuals();
	}

	/**
	 * Clear all execution visual indicators from nodes.
	 */
	_clearExecutionVisuals()
	{
		if (this._FlowView && this._FlowView._NodesLayer)
		{
			let tmpNodeGroups = this._FlowView._NodesLayer.querySelectorAll('[data-node-hash]');
			for (let i = 0; i < tmpNodeGroups.length; i++)
			{
				tmpNodeGroups[i].classList.remove('uv-exec-idle', 'uv-exec-executing', 'uv-exec-complete', 'uv-exec-error', 'uv-exec-waiting');
			}
		}

		this._ExecutionNodeStates = {};

		let tmpStatusEl = document.getElementById('Ultravisor-FlowEditor-ExecStatus');
		if (tmpStatusEl)
		{
			tmpStatusEl.style.display = 'none';
		}
	}
}

module.exports = UltravisorFlowEditorView;

module.exports.default_configuration = _ViewConfiguration;
