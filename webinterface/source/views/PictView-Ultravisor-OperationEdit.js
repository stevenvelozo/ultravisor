const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-OperationEdit",

	DefaultRenderable: "Ultravisor-OperationEdit-Content",
	DefaultDestinationAddress: "#Ultravisor-Content-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-operationedit {
			padding: 2em;
			max-width: 800px;
			margin: 0 auto;
		}
		.ultravisor-operationedit-header {
			margin-bottom: 1.5em;
			padding-bottom: 1em;
			border-bottom: 1px solid #2a2a4a;
		}
		.ultravisor-operationedit-header h1 {
			margin: 0;
			font-size: 2em;
			font-weight: 300;
			color: #e0e0e0;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-OperationEdit-Template",
			Template: /*html*/`
<div class="ultravisor-operationedit">
	<div class="ultravisor-operationedit-header">
		<h1 id="Ultravisor-OperationEdit-Title">New Operation</h1>
	</div>
	<div id="Ultravisor-OperationEdit-Form"></div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-OperationEdit-Content",
			TemplateHash: "Ultravisor-OperationEdit-Template",
			DestinationAddress: "#Ultravisor-Content-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorOperationEditView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		let tmpOp = this.pict.AppData.Ultravisor.CurrentEditOperation;
		if (!tmpOp)
		{
			tmpOp =
			{
				Hash: '', Name: '', Description: '',
				Graph: { Nodes: [], Connections: [], ViewState: {} }
			};
			this.pict.AppData.Ultravisor.CurrentEditOperation = tmpOp;
		}

		let tmpIsNew = !tmpOp.Hash;
		let tmpTitleEl = document.getElementById('Ultravisor-OperationEdit-Title');
		if (tmpTitleEl)
		{
			tmpTitleEl.textContent = tmpIsNew ? 'New Operation' : ('Edit Operation: ' + (tmpOp.Name || tmpOp.Hash));
		}

		this.renderForm();

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	escapeAttr(pValue)
	{
		if (!pValue) return '';
		return String(pValue).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	escapeHTML(pValue)
	{
		if (!pValue) return '';
		return String(pValue).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	renderForm()
	{
		let tmpOp = this.pict.AppData.Ultravisor.CurrentEditOperation;
		let tmpIsNew = !tmpOp.Hash;
		let tmpGlobalRef = '_Pict';
		let tmpViewRef = tmpGlobalRef + ".views['Ultravisor-OperationEdit']";

		let tmpNodeCount = (tmpOp.Graph && tmpOp.Graph.Nodes) ? tmpOp.Graph.Nodes.length : 0;

		let tmpHTML = '';

		if (!tmpIsNew)
		{
			tmpHTML += '<div class="ultravisor-form-group"><label>Hash</label>';
			tmpHTML += '<input type="text" id="Ultravisor-OperationEdit-Hash" value="' + this.escapeAttr(tmpOp.Hash) + '" readonly></div>';
		}

		tmpHTML += '<div class="ultravisor-form-group"><label>Name</label>';
		tmpHTML += '<input type="text" id="Ultravisor-OperationEdit-Name" value="' + this.escapeAttr(tmpOp.Name || '') + '"></div>';

		tmpHTML += '<div class="ultravisor-form-group"><label>Description</label>';
		tmpHTML += '<textarea id="Ultravisor-OperationEdit-Description">' + this.escapeHTML(tmpOp.Description || '') + '</textarea></div>';

		if (!tmpIsNew)
		{
			tmpHTML += '<div class="ultravisor-form-group"><label>Graph</label>';
			tmpHTML += '<p style="color:#78909c;">' + tmpNodeCount + ' node' + (tmpNodeCount !== 1 ? 's' : '') + ' in graph. Use the Flow Editor to modify the operation graph.</p>';
			tmpHTML += '</div>';
		}

		tmpHTML += '<div class="ultravisor-form-actions">';
		tmpHTML += '<button class="ultravisor-btn ultravisor-btn-primary" onclick="' + tmpViewRef + '.saveOperation()">Save Metadata</button>';
		tmpHTML += '<button class="ultravisor-btn ultravisor-btn-primary" onclick="' + tmpViewRef + '.openFlowEditor()">Open in Flow Editor</button>';
		tmpHTML += '<button class="ultravisor-btn ultravisor-btn-secondary" onclick="' + tmpGlobalRef + '.PictApplication.navigateTo(\'/Operations\')">Cancel</button>';
		tmpHTML += '</div>';

		this.pict.ContentAssignment.assignContent('#Ultravisor-OperationEdit-Form', tmpHTML);
	}

	openFlowEditor()
	{
		// Sync form values back to the model before navigating
		let tmpOp = this.pict.AppData.Ultravisor.CurrentEditOperation;
		tmpOp.Name = document.getElementById('Ultravisor-OperationEdit-Name').value.trim();
		tmpOp.Description = document.getElementById('Ultravisor-OperationEdit-Description').value.trim();

		// Load the graph into FlowEditor data
		if (tmpOp.Graph)
		{
			this.pict.AppData.Ultravisor.Flows.Current = JSON.parse(JSON.stringify(tmpOp.Graph));
		}

		this.pict.PictApplication.navigateTo('/FlowEditor');
	}

	saveOperation()
	{
		let tmpOp = this.pict.AppData.Ultravisor.CurrentEditOperation;

		let tmpOpData =
		{
			Name: document.getElementById('Ultravisor-OperationEdit-Name').value.trim(),
			Description: document.getElementById('Ultravisor-OperationEdit-Description').value.trim(),
			Graph: tmpOp.Graph || { Nodes: [], Connections: [], ViewState: {} }
		};

		let tmpHashEl = document.getElementById('Ultravisor-OperationEdit-Hash');
		if (tmpHashEl)
		{
			tmpOpData.Hash = tmpHashEl.value.trim();
		}

		this.pict.PictApplication.saveOperation(tmpOpData,
			function (pError)
			{
				if (pError)
				{
					alert('Error saving operation: ' + pError.message);
					return;
				}
				this.pict.PictApplication.navigateTo('/Operations');
			}.bind(this));
	}
}

module.exports = UltravisorOperationEditView;

module.exports.default_configuration = _ViewConfiguration;
