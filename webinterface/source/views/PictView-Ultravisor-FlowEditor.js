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

		// Re-inject CSS after the flow view creates its dynamic styles
		this.pict.CSSMap.injectCSS();

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
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
