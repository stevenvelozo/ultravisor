const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-TaskEdit",

	DefaultRenderable: "Ultravisor-TaskEdit-Content",
	DefaultDestinationAddress: "#Ultravisor-Content-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-taskedit {
			padding: 2em;
			max-width: 800px;
			margin: 0 auto;
		}
		.ultravisor-taskedit-header {
			margin-bottom: 1.5em;
			padding-bottom: 1em;
			border-bottom: 1px solid #2a2a4a;
		}
		.ultravisor-taskedit-header h1 {
			margin: 0;
			font-size: 2em;
			font-weight: 300;
			color: #e0e0e0;
		}
		.ultravisor-form-group {
			margin-bottom: 1.25em;
		}
		.ultravisor-form-group label {
			display: block;
			margin-bottom: 0.35em;
			font-size: 0.85em;
			font-weight: 600;
			color: #b0bec5;
			text-transform: uppercase;
			letter-spacing: 0.03em;
		}
		.ultravisor-form-group input,
		.ultravisor-form-group select,
		.ultravisor-form-group textarea {
			width: 100%;
		}
		.ultravisor-form-group textarea {
			min-height: 80px;
		}
		.ultravisor-form-row {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 1em;
		}
		.ultravisor-form-actions {
			display: flex;
			gap: 0.75em;
			margin-top: 2em;
			padding-top: 1.5em;
			border-top: 1px solid #2a2a4a;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-TaskEdit-Template",
			Template: /*html*/`
<div class="ultravisor-taskedit">
	<div class="ultravisor-taskedit-header">
		<h1 id="Ultravisor-TaskEdit-Title">New Task</h1>
	</div>
	<div id="Ultravisor-TaskEdit-Form"></div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-TaskEdit-Content",
			TemplateHash: "Ultravisor-TaskEdit-Template",
			DestinationAddress: "#Ultravisor-Content-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorTaskEditView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		let tmpTask = this.pict.AppData.Ultravisor.CurrentEditTask;
		if (!tmpTask)
		{
			tmpTask =
			{
				GUIDTask: '', Code: '', Name: '', Type: 'Command',
				Command: '', URL: '', Method: 'GET', Parameters: '', Description: ''
			};
			this.pict.AppData.Ultravisor.CurrentEditTask = tmpTask;
		}

		let tmpIsNew = !tmpTask.GUIDTask;
		let tmpTitleEl = document.getElementById('Ultravisor-TaskEdit-Title');
		if (tmpTitleEl)
		{
			tmpTitleEl.textContent = tmpIsNew ? 'New Task' : ('Edit Task: ' + (tmpTask.Name || tmpTask.GUIDTask));
		}

		let tmpGlobalRef = '_Pict';
		let tmpTaskTypes = ['Command', 'Request', 'ListFiles', 'WriteJSON', 'ReadJSON', 'GetJSON', 'WriteText', 'ReadText', 'Manual'];

		let tmpHTML = '';
		tmpHTML += '<div class="ultravisor-form-row">';
		tmpHTML += '<div class="ultravisor-form-group"><label>GUID Task</label>';
		tmpHTML += '<input type="text" id="Ultravisor-TaskEdit-GUIDTask" value="' + this.escapeAttr(tmpTask.GUIDTask) + '" ' + (tmpIsNew ? '' : 'readonly') + '></div>';
		tmpHTML += '<div class="ultravisor-form-group"><label>Code</label>';
		tmpHTML += '<input type="text" id="Ultravisor-TaskEdit-Code" value="' + this.escapeAttr(tmpTask.Code || '') + '"></div>';
		tmpHTML += '</div>';

		tmpHTML += '<div class="ultravisor-form-group"><label>Name</label>';
		tmpHTML += '<input type="text" id="Ultravisor-TaskEdit-Name" value="' + this.escapeAttr(tmpTask.Name || '') + '"></div>';

		tmpHTML += '<div class="ultravisor-form-row">';
		tmpHTML += '<div class="ultravisor-form-group"><label>Type</label>';
		tmpHTML += '<select id="Ultravisor-TaskEdit-Type">';
		for (let i = 0; i < tmpTaskTypes.length; i++)
		{
			let tmpSel = (tmpTask.Type === tmpTaskTypes[i]) ? ' selected' : '';
			tmpHTML += '<option value="' + tmpTaskTypes[i] + '"' + tmpSel + '>' + tmpTaskTypes[i] + '</option>';
		}
		tmpHTML += '</select></div>';
		tmpHTML += '<div class="ultravisor-form-group"><label>Method (for Request)</label>';
		tmpHTML += '<select id="Ultravisor-TaskEdit-Method">';
		let tmpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
		for (let i = 0; i < tmpMethods.length; i++)
		{
			let tmpSel = (tmpTask.Method === tmpMethods[i]) ? ' selected' : '';
			tmpHTML += '<option value="' + tmpMethods[i] + '"' + tmpSel + '>' + tmpMethods[i] + '</option>';
		}
		tmpHTML += '</select></div>';
		tmpHTML += '</div>';

		tmpHTML += '<div class="ultravisor-form-group"><label>Command</label>';
		tmpHTML += '<input type="text" id="Ultravisor-TaskEdit-Command" value="' + this.escapeAttr(tmpTask.Command || '') + '"></div>';

		tmpHTML += '<div class="ultravisor-form-group"><label>URL (for Request)</label>';
		tmpHTML += '<input type="text" id="Ultravisor-TaskEdit-URL" value="' + this.escapeAttr(tmpTask.URL || '') + '"></div>';

		tmpHTML += '<div class="ultravisor-form-group"><label>Parameters</label>';
		tmpHTML += '<input type="text" id="Ultravisor-TaskEdit-Parameters" value="' + this.escapeAttr(tmpTask.Parameters || '') + '"></div>';

		tmpHTML += '<div class="ultravisor-form-group"><label>Description</label>';
		tmpHTML += '<textarea id="Ultravisor-TaskEdit-Description">' + this.escapeHTML(tmpTask.Description || '') + '</textarea></div>';

		tmpHTML += '<div class="ultravisor-form-actions">';
		tmpHTML += '<button class="ultravisor-btn ultravisor-btn-primary" onclick="' + tmpGlobalRef + '.views[\'Ultravisor-TaskEdit\'].saveTask()">Save Task</button>';
		tmpHTML += '<button class="ultravisor-btn ultravisor-btn-secondary" onclick="' + tmpGlobalRef + '.PictApplication.navigateTo(\'/Tasks\')">Cancel</button>';
		tmpHTML += '</div>';

		this.pict.ContentAssignment.assignContent('#Ultravisor-TaskEdit-Form', tmpHTML);

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

	saveTask()
	{
		let tmpTaskData =
		{
			GUIDTask: document.getElementById('Ultravisor-TaskEdit-GUIDTask').value.trim(),
			Code: document.getElementById('Ultravisor-TaskEdit-Code').value.trim(),
			Name: document.getElementById('Ultravisor-TaskEdit-Name').value.trim(),
			Type: document.getElementById('Ultravisor-TaskEdit-Type').value,
			Command: document.getElementById('Ultravisor-TaskEdit-Command').value.trim(),
			URL: document.getElementById('Ultravisor-TaskEdit-URL').value.trim(),
			Method: document.getElementById('Ultravisor-TaskEdit-Method').value,
			Parameters: document.getElementById('Ultravisor-TaskEdit-Parameters').value.trim(),
			Description: document.getElementById('Ultravisor-TaskEdit-Description').value.trim()
		};

		if (!tmpTaskData.GUIDTask)
		{
			alert('GUID Task is required.');
			return;
		}

		this.pict.PictApplication.saveTask(tmpTaskData,
			function (pError)
			{
				if (pError)
				{
					alert('Error saving task: ' + pError.message);
					return;
				}
				this.pict.PictApplication.navigateTo('/Tasks');
			}.bind(this));
	}
}

module.exports = UltravisorTaskEditView;

module.exports.default_configuration = _ViewConfiguration;
