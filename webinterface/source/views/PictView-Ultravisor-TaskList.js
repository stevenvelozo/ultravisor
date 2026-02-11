const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-TaskList",

	DefaultRenderable: "Ultravisor-TaskList-Content",
	DefaultDestinationAddress: "#Ultravisor-Content-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-tasklist {
			padding: 2em;
			max-width: 1200px;
			margin: 0 auto;
		}
		.ultravisor-tasklist-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1.5em;
			padding-bottom: 1em;
			border-bottom: 1px solid #2a2a4a;
		}
		.ultravisor-tasklist-header h1 {
			margin: 0;
			font-size: 2em;
			font-weight: 300;
			color: #e0e0e0;
		}
		.ultravisor-task-table {
			width: 100%;
			border-collapse: collapse;
		}
		.ultravisor-task-table th {
			background-color: #16213e;
		}
		.ultravisor-task-table tr:hover td {
			background-color: #1a2744;
		}
		.ultravisor-task-type-badge {
			display: inline-block;
			padding: 0.15em 0.5em;
			border-radius: 3px;
			font-size: 0.8em;
			font-weight: 600;
			background-color: #1a4a7a;
			color: #4fc3f7;
		}
		.ultravisor-task-actions {
			display: flex;
			gap: 0.4em;
		}
		.ultravisor-btn-sm {
			padding: 0.3em 0.6em;
			border-radius: 3px;
			font-size: 0.8em;
			cursor: pointer;
			border: none;
		}
		.ultravisor-btn-execute {
			background-color: #66bb6a;
			color: #1a1a2e;
			font-weight: 600;
		}
		.ultravisor-btn-execute:hover {
			background-color: #81c784;
		}
		.ultravisor-btn-edit {
			background-color: #42a5f5;
			color: #fff;
		}
		.ultravisor-btn-edit:hover {
			background-color: #64b5f6;
		}
		.ultravisor-btn-delete {
			background-color: #ef5350;
			color: #fff;
		}
		.ultravisor-btn-delete:hover {
			background-color: #e53935;
		}
		.ultravisor-empty-message {
			text-align: center;
			padding: 3em;
			color: #607d8b;
			font-size: 1.1em;
		}
		.ultravisor-task-result-panel {
			background: #16213e;
			border: 1px solid #2a2a4a;
			border-radius: 8px;
			padding: 1.5em;
			margin-top: 1em;
		}
		.ultravisor-task-result-panel h3 {
			margin: 0 0 0.75em 0;
			color: #b0bec5;
		}
		.ultravisor-task-result-output {
			background: #0d1117;
			color: #c9d1d9;
			border-radius: 4px;
			padding: 0.75em;
			font-family: monospace;
			font-size: 0.85em;
			white-space: pre-wrap;
			word-break: break-all;
			max-height: 300px;
			overflow-y: auto;
			margin-top: 0.5em;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-TaskList-Template",
			Template: /*html*/`
<div class="ultravisor-tasklist">
	<div class="ultravisor-tasklist-header">
		<h1>Tasks</h1>
		<button class="ultravisor-btn ultravisor-btn-primary" onclick="{~P~}.PictApplication.editTask()">New Task</button>
	</div>
	<div id="Ultravisor-TaskList-Body"></div>
	<div id="Ultravisor-TaskList-Result"></div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-TaskList-Content",
			TemplateHash: "Ultravisor-TaskList-Template",
			DestinationAddress: "#Ultravisor-Content-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorTaskListView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.pict.PictApplication.loadTasks(
			function ()
			{
				this.renderTaskTable();
			}.bind(this));

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	renderTaskTable()
	{
		let tmpTaskList = this.pict.AppData.Ultravisor.TaskList;

		if (!tmpTaskList || tmpTaskList.length === 0)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-TaskList-Body',
				'<div class="ultravisor-empty-message">No tasks defined. Click "New Task" to create one.</div>');
			return;
		}

		let tmpHTML = '<table class="ultravisor-task-table">';
		tmpHTML += '<thead><tr><th>GUID</th><th>Name</th><th>Type</th><th>Actions</th></tr></thead>';
		tmpHTML += '<tbody>';

		for (let i = 0; i < tmpTaskList.length; i++)
		{
			let tmpTask = tmpTaskList[i];
			let tmpGUID = tmpTask.GUIDTask || '';
			let tmpName = tmpTask.Name || tmpGUID;
			let tmpType = tmpTask.Type || 'Unknown';
			let tmpEscGUID = tmpGUID.replace(/'/g, "\\'");

			tmpHTML += '<tr>';
			tmpHTML += '<td><code>' + tmpGUID + '</code></td>';
			tmpHTML += '<td>' + tmpName + '</td>';
			tmpHTML += '<td><span class="ultravisor-task-type-badge">' + tmpType + '</span></td>';
			tmpHTML += '<td><div class="ultravisor-task-actions">';
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-execute" onclick="' + '_Pict' + '.views[\'Ultravisor-TaskList\'].runTask(\'' + tmpEscGUID + '\')">Run</button>';
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-edit" onclick="' + '_Pict' + '.PictApplication.editTask(\'' + tmpEscGUID + '\')">Edit</button>';
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-delete" onclick="if(confirm(\'Delete task ' + tmpEscGUID + '?\')){ ' + '_Pict' + '.PictApplication.deleteTask(\'' + tmpEscGUID + '\', function(){ ' + '_Pict' + '.PictApplication.showView(\'Ultravisor-TaskList\'); }); }">Delete</button>';
			tmpHTML += '</div></td>';
			tmpHTML += '</tr>';
		}

		tmpHTML += '</tbody></table>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-TaskList-Body', tmpHTML);
	}

	runTask(pGUIDTask)
	{
		this.pict.ContentAssignment.assignContent('#Ultravisor-TaskList-Result',
			'<div class="ultravisor-task-result-panel"><h3>Running task ' + pGUIDTask + '...</h3></div>');

		this.pict.PictApplication.executeTask(pGUIDTask,
			function (pError, pData)
			{
				if (pError)
				{
					this.pict.ContentAssignment.assignContent('#Ultravisor-TaskList-Result',
						'<div class="ultravisor-task-result-panel"><h3>Error</h3><p style="color:#ef5350;">' + this.escapeHTML(pError.message) + '</p></div>');
					return;
				}

				let tmpHTML = '<div class="ultravisor-task-result-panel">';
				tmpHTML += '<h3>Task Result: ' + this.escapeHTML(pData.Name || pData.GUIDTask || '') + '</h3>';
				tmpHTML += '<p><strong>Status:</strong> <span class="ultravisor-manifest-status ' + (pData.Status || '').toLowerCase() + '">' + this.escapeHTML(pData.Status || '') + '</span>';
				tmpHTML += ' &middot; <strong>Success:</strong> ' + (pData.Success ? '<span style="color:#66bb6a;">Yes</span>' : '<span style="color:#ef5350;">No</span>') + '</p>';
				tmpHTML += '<p><strong>Start:</strong> ' + this.escapeHTML(pData.StartTime || '') + ' &middot; <strong>Stop:</strong> ' + this.escapeHTML(pData.StopTime || '') + '</p>';

				if (pData.Output)
				{
					tmpHTML += '<h4 style="color:#b0bec5; margin:0.75em 0 0.25em 0;">Output</h4>';
					tmpHTML += '<div class="ultravisor-task-result-output">' + this.escapeHTML(String(pData.Output)) + '</div>';
				}

				if (pData.Log && pData.Log.length > 0)
				{
					tmpHTML += '<h4 style="color:#b0bec5; margin:0.75em 0 0.25em 0;">Log</h4>';
					tmpHTML += '<div class="ultravisor-task-result-output">' + this.escapeHTML(pData.Log.join('\n')) + '</div>';
				}

				tmpHTML += '</div>';
				this.pict.ContentAssignment.assignContent('#Ultravisor-TaskList-Result', tmpHTML);
			}.bind(this));
	}

	escapeHTML(pValue)
	{
		if (!pValue) return '';
		return String(pValue).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
}

module.exports = UltravisorTaskListView;

module.exports.default_configuration = _ViewConfiguration;
