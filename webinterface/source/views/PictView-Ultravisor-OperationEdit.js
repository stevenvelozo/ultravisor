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
		.ultravisor-task-list-editor {
			background: #16213e;
			border: 1px solid #2a2a4a;
			border-radius: 6px;
			padding: 1em;
		}
		.ultravisor-task-list-item {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 0.5em 0.75em;
			background: #1a1a2e;
			border-radius: 4px;
			margin-bottom: 0.5em;
		}
		.ultravisor-task-list-item code {
			color: #4fc3f7;
			font-size: 0.9em;
		}
		.ultravisor-task-list-add {
			display: flex;
			gap: 0.5em;
			margin-top: 0.75em;
		}
		.ultravisor-task-list-add input {
			flex: 1;
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
			tmpOp = { GUIDOperation: '', Name: '', Description: '', Tasks: [] };
			this.pict.AppData.Ultravisor.CurrentEditOperation = tmpOp;
		}

		let tmpIsNew = !tmpOp.GUIDOperation;
		let tmpTitleEl = document.getElementById('Ultravisor-OperationEdit-Title');
		if (tmpTitleEl)
		{
			tmpTitleEl.textContent = tmpIsNew ? 'New Operation' : ('Edit Operation: ' + (tmpOp.Name || tmpOp.GUIDOperation));
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
		let tmpIsNew = !tmpOp.GUIDOperation;
		let tmpGlobalRef = '_Pict';
		let tmpViewRef = tmpGlobalRef + ".views['Ultravisor-OperationEdit']";

		let tmpHTML = '';
		tmpHTML += '<div class="ultravisor-form-group"><label>GUID Operation</label>';
		tmpHTML += '<input type="text" id="Ultravisor-OperationEdit-GUIDOperation" value="' + this.escapeAttr(tmpOp.GUIDOperation) + '" ' + (tmpIsNew ? '' : 'readonly') + '></div>';

		tmpHTML += '<div class="ultravisor-form-group"><label>Name</label>';
		tmpHTML += '<input type="text" id="Ultravisor-OperationEdit-Name" value="' + this.escapeAttr(tmpOp.Name || '') + '"></div>';

		tmpHTML += '<div class="ultravisor-form-group"><label>Description</label>';
		tmpHTML += '<textarea id="Ultravisor-OperationEdit-Description">' + this.escapeHTML(tmpOp.Description || '') + '</textarea></div>';

		tmpHTML += '<div class="ultravisor-form-group"><label>Tasks (executed in order)</label>';
		tmpHTML += '<div class="ultravisor-task-list-editor">';

		let tmpTasks = tmpOp.Tasks || [];
		if (tmpTasks.length === 0)
		{
			tmpHTML += '<div style="color: #607d8b; font-size: 0.9em; padding: 0.5em;">No tasks added yet.</div>';
		}
		else
		{
			for (let i = 0; i < tmpTasks.length; i++)
			{
				let tmpEscTask = tmpTasks[i].replace(/'/g, "\\'");
				tmpHTML += '<div class="ultravisor-task-list-item">';
				tmpHTML += '<code>' + this.escapeHTML(tmpTasks[i]) + '</code>';
				tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-delete" onclick="' + tmpViewRef + '.removeTaskFromOperation(' + i + ')">Remove</button>';
				tmpHTML += '</div>';
			}
		}

		tmpHTML += '<div class="ultravisor-task-list-add">';
		tmpHTML += '<input type="text" id="Ultravisor-OperationEdit-NewTaskGUID" placeholder="Task GUID to add...">';
		tmpHTML += '<button class="ultravisor-btn ultravisor-btn-secondary" onclick="' + tmpViewRef + '.addTaskToOperation()">Add</button>';
		tmpHTML += '</div>';
		tmpHTML += '</div></div>';

		tmpHTML += '<div class="ultravisor-form-actions">';
		tmpHTML += '<button class="ultravisor-btn ultravisor-btn-primary" onclick="' + tmpViewRef + '.saveOperation()">Save Operation</button>';
		tmpHTML += '<button class="ultravisor-btn ultravisor-btn-secondary" onclick="' + tmpGlobalRef + '.PictApplication.navigateTo(\'/Operations\')">Cancel</button>';
		tmpHTML += '</div>';

		this.pict.ContentAssignment.assignContent('#Ultravisor-OperationEdit-Form', tmpHTML);
	}

	addTaskToOperation()
	{
		let tmpInput = document.getElementById('Ultravisor-OperationEdit-NewTaskGUID');
		let tmpGUID = tmpInput ? tmpInput.value.trim() : '';
		if (!tmpGUID) return;

		let tmpOp = this.pict.AppData.Ultravisor.CurrentEditOperation;
		if (!tmpOp.Tasks)
		{
			tmpOp.Tasks = [];
		}
		tmpOp.Tasks.push(tmpGUID);

		// Preserve current form field values before re-render
		tmpOp.GUIDOperation = document.getElementById('Ultravisor-OperationEdit-GUIDOperation').value.trim();
		tmpOp.Name = document.getElementById('Ultravisor-OperationEdit-Name').value.trim();
		tmpOp.Description = document.getElementById('Ultravisor-OperationEdit-Description').value.trim();

		this.renderForm();
	}

	removeTaskFromOperation(pIndex)
	{
		let tmpOp = this.pict.AppData.Ultravisor.CurrentEditOperation;
		if (tmpOp.Tasks && pIndex >= 0 && pIndex < tmpOp.Tasks.length)
		{
			tmpOp.Tasks.splice(pIndex, 1);
		}

		// Preserve current form field values before re-render
		tmpOp.GUIDOperation = document.getElementById('Ultravisor-OperationEdit-GUIDOperation').value.trim();
		tmpOp.Name = document.getElementById('Ultravisor-OperationEdit-Name').value.trim();
		tmpOp.Description = document.getElementById('Ultravisor-OperationEdit-Description').value.trim();

		this.renderForm();
	}

	saveOperation()
	{
		let tmpOpData =
		{
			GUIDOperation: document.getElementById('Ultravisor-OperationEdit-GUIDOperation').value.trim(),
			Name: document.getElementById('Ultravisor-OperationEdit-Name').value.trim(),
			Description: document.getElementById('Ultravisor-OperationEdit-Description').value.trim(),
			Tasks: this.pict.AppData.Ultravisor.CurrentEditOperation.Tasks || []
		};

		if (!tmpOpData.GUIDOperation)
		{
			alert('GUID Operation is required.');
			return;
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
