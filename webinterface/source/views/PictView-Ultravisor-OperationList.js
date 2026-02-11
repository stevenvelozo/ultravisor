const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-OperationList",

	DefaultRenderable: "Ultravisor-OperationList-Content",
	DefaultDestinationAddress: "#Ultravisor-Content-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-operationlist {
			padding: 2em;
			max-width: 1200px;
			margin: 0 auto;
		}
		.ultravisor-operationlist-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1.5em;
			padding-bottom: 1em;
			border-bottom: 1px solid #2a2a4a;
		}
		.ultravisor-operationlist-header h1 {
			margin: 0;
			font-size: 2em;
			font-weight: 300;
			color: #e0e0e0;
		}
		.ultravisor-operation-table {
			width: 100%;
			border-collapse: collapse;
		}
		.ultravisor-operation-table th {
			background-color: #16213e;
		}
		.ultravisor-operation-table tr:hover td {
			background-color: #1a2744;
		}
		.ultravisor-operation-task-count {
			display: inline-block;
			padding: 0.15em 0.5em;
			border-radius: 3px;
			font-size: 0.8em;
			font-weight: 600;
			background-color: #2e7d32;
			color: #c8e6c9;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-OperationList-Template",
			Template: /*html*/`
<div class="ultravisor-operationlist">
	<div class="ultravisor-operationlist-header">
		<h1>Operations</h1>
		<button class="ultravisor-btn ultravisor-btn-primary" onclick="{~P~}.PictApplication.editOperation()">New Operation</button>
	</div>
	<div id="Ultravisor-OperationList-Body"></div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-OperationList-Content",
			TemplateHash: "Ultravisor-OperationList-Template",
			DestinationAddress: "#Ultravisor-Content-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorOperationListView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.pict.PictApplication.loadOperations(
			function ()
			{
				this.renderOperationTable();
			}.bind(this));

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	renderOperationTable()
	{
		let tmpOpList = this.pict.AppData.Ultravisor.OperationList;
		let tmpGlobalRef = '_Pict';

		if (!tmpOpList || tmpOpList.length === 0)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Body',
				'<div class="ultravisor-empty-message">No operations defined. Click "New Operation" to create one.</div>');
			return;
		}

		let tmpHTML = '<table class="ultravisor-operation-table">';
		tmpHTML += '<thead><tr><th>GUID</th><th>Name</th><th>Tasks</th><th>Actions</th></tr></thead>';
		tmpHTML += '<tbody>';

		for (let i = 0; i < tmpOpList.length; i++)
		{
			let tmpOp = tmpOpList[i];
			let tmpGUID = tmpOp.GUIDOperation || '';
			let tmpName = tmpOp.Name || tmpGUID;
			let tmpTaskCount = (tmpOp.Tasks && Array.isArray(tmpOp.Tasks)) ? tmpOp.Tasks.length : 0;
			let tmpEscGUID = tmpGUID.replace(/'/g, "\\'");

			tmpHTML += '<tr>';
			tmpHTML += '<td><code>' + tmpGUID + '</code></td>';
			tmpHTML += '<td>' + tmpName + '</td>';
			tmpHTML += '<td><span class="ultravisor-operation-task-count">' + tmpTaskCount + ' task' + (tmpTaskCount !== 1 ? 's' : '') + '</span></td>';
			tmpHTML += '<td><div class="ultravisor-task-actions">';
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-execute" onclick="' + tmpGlobalRef + '.PictApplication.executeOperation(\'' + tmpEscGUID + '\', function(pErr, pData){ alert(pErr ? \'Error: \'+pErr.message : \'Operation executed. Status: \'+(pData&&pData.Status||\'Done\')); })">Run</button>';
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-edit" onclick="' + tmpGlobalRef + '.PictApplication.editOperation(\'' + tmpEscGUID + '\')">Edit</button>';
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-delete" onclick="if(confirm(\'Delete operation ' + tmpEscGUID + '?\')){ ' + tmpGlobalRef + '.PictApplication.deleteOperation(\'' + tmpEscGUID + '\', function(){ ' + tmpGlobalRef + '.PictApplication.showView(\'Ultravisor-OperationList\'); }); }">Delete</button>';
			tmpHTML += '</div></td>';
			tmpHTML += '</tr>';
		}

		tmpHTML += '</tbody></table>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Body', tmpHTML);
	}
}

module.exports = UltravisorOperationListView;

module.exports.default_configuration = _ViewConfiguration;
