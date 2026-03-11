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
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.ultravisor-operationlist-header h1 {
			margin: 0;
			font-size: 2em;
			font-weight: 300;
			color: var(--uv-text);
		}
		.ultravisor-operation-table {
			width: 100%;
			border-collapse: collapse;
		}
		.ultravisor-operation-table th {
			background-color: var(--uv-bg-surface);
		}
		.ultravisor-operation-table tr:hover td {
			background-color: #1a2744;
		}
		.ultravisor-operation-node-count {
			display: inline-block;
			padding: 0.15em 0.5em;
			border-radius: 3px;
			font-size: 0.8em;
			font-weight: 600;
			background-color: #2e7d32;
			color: #c8e6c9;
		}
		.ultravisor-library-dropdown {
			background-color: var(--uv-bg-base);
			color: var(--uv-text);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 4px;
			padding: 0.4em 0.6em;
			font-size: 0.9em;
			margin-right: 0.5em;
			cursor: pointer;
		}
		.ultravisor-library-dropdown:hover {
			border-color: #4a4a7a;
		}
		.ultravisor-library-dropdown option {
			background-color: var(--uv-bg-base);
			color: var(--uv-text);
		}
		.ultravisor-operationlist-header-actions {
			display: flex;
			align-items: center;
			gap: 0.5em;
		}
		.ultravisor-import-success {
			color: var(--uv-success);
			font-size: 0.9em;
			padding: 0.5em 0;
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
		<div class="ultravisor-operationlist-header-actions">
			<select id="Ultravisor-LibraryDropdown" class="ultravisor-library-dropdown" onchange="{~P~}.views['Ultravisor-OperationList'].onLibraryDropdownChange()">
				<option value="">From Library...</option>
			</select>
			<button id="Ultravisor-LibraryAddBtn" class="ultravisor-btn ultravisor-btn-primary" onclick="{~P~}.views['Ultravisor-OperationList'].importSelectedLibraryOp()" style="display:none">Add</button>
			<button class="ultravisor-btn ultravisor-btn-primary" onclick="{~P~}.PictApplication.editOperation()">New Operation</button>
		</div>
	</div>
	<div id="Ultravisor-OperationList-Body"></div>
	<div id="Ultravisor-OperationList-Result"></div>
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

		this.pict.PictApplication.loadOperationLibrary(
			function ()
			{
				this.populateLibraryDropdown();
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
		tmpHTML += '<thead><tr><th>Hash</th><th>Name</th><th>Nodes</th><th>Actions</th></tr></thead>';
		tmpHTML += '<tbody>';

		for (let i = 0; i < tmpOpList.length; i++)
		{
			let tmpOp = tmpOpList[i];
			let tmpHash = tmpOp.Hash || '';
			let tmpName = tmpOp.Name || tmpHash;
			let tmpNodeCount = (tmpOp.Graph && tmpOp.Graph.Nodes) ? tmpOp.Graph.Nodes.length : 0;
			let tmpEscHash = tmpHash.replace(/'/g, "\\'");

			tmpHTML += '<tr>';
			tmpHTML += '<td><code>' + this.escapeHTML(tmpHash) + '</code></td>';
			tmpHTML += '<td>' + this.escapeHTML(tmpName) + '</td>';
			tmpHTML += '<td><span class="ultravisor-operation-node-count">' + tmpNodeCount + ' node' + (tmpNodeCount !== 1 ? 's' : '') + '</span></td>';
			tmpHTML += '<td><div class="ultravisor-task-actions">';
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-execute" onclick="' + tmpGlobalRef + '.views[\'Ultravisor-OperationList\'].runOperation(\'' + tmpEscHash + '\')">Run</button>';
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-edit" onclick="' + tmpGlobalRef + '.PictApplication.editOperation(\'' + tmpEscHash + '\')">Edit</button>';
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-delete" onclick="if(confirm(\'Delete operation ' + tmpEscHash + '?\')){ ' + tmpGlobalRef + '.PictApplication.deleteOperation(\'' + tmpEscHash + '\', function(){ ' + tmpGlobalRef + '.PictApplication.showView(\'Ultravisor-OperationList\'); }); }">Delete</button>';
			tmpHTML += '<button class="ultravisor-btn-sm" style="background-color:var(--uv-info);color:#bbdefb;" onclick="' + tmpGlobalRef + '.views[\'Ultravisor-OperationList\'].exportOperation(\'' + tmpEscHash + '\')">Export</button>';
			tmpHTML += '</div></td>';
			tmpHTML += '</tr>';
		}

		tmpHTML += '</tbody></table>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Body', tmpHTML);
	}

	runOperation(pHash)
	{
		this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Result',
			'<div class="ultravisor-task-result-panel"><h3>Running operation ' + this.escapeHTML(pHash) + '...</h3></div>');

		this.pict.PictApplication.executeOperation(pHash,
			function (pError, pData)
			{
				if (pError)
				{
					this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Result',
						'<div class="ultravisor-task-result-panel"><h3>Error</h3><p style="color:var(--uv-error);">' + this.escapeHTML(pError.message) + '</p></div>');
					return;
				}

				let tmpHTML = '<div class="ultravisor-task-result-panel">';
				tmpHTML += '<h3>Operation Result: ' + this.escapeHTML(pHash) + '</h3>';
				tmpHTML += '<p><strong>Status:</strong> <span class="ultravisor-manifest-status ' + (pData.Status || '').toLowerCase() + '">' + this.escapeHTML(pData.Status || '') + '</span></p>';
				tmpHTML += '<p><strong>Start:</strong> ' + this.escapeHTML(pData.StartTime || '') + ' &middot; <strong>Stop:</strong> ' + this.escapeHTML(pData.StopTime || '') + '</p>';
				tmpHTML += '<p><strong>Elapsed:</strong> ' + (pData.ElapsedMs || 0) + 'ms</p>';

				if (pData.TaskOutputs)
				{
					tmpHTML += '<h4 style="color:var(--uv-text-secondary); margin:0.75em 0 0.25em 0;">Task Outputs</h4>';
					tmpHTML += '<div class="ultravisor-task-result-output">' + this.escapeHTML(JSON.stringify(pData.TaskOutputs, null, 2)) + '</div>';
				}

				if (pData.Log && pData.Log.length > 0)
				{
					tmpHTML += '<h4 style="color:var(--uv-text-secondary); margin:0.75em 0 0.25em 0;">Log</h4>';
					tmpHTML += '<div class="ultravisor-task-result-output">' + this.escapeHTML(pData.Log.join('\n')) + '</div>';
				}

				tmpHTML += '</div>';
				this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Result', tmpHTML);
			}.bind(this));
	}

	populateLibraryDropdown()
	{
		let tmpDropdown = document.getElementById('Ultravisor-LibraryDropdown');
		if (!tmpDropdown)
		{
			return;
		}

		let tmpLibrary = this.pict.AppData.Ultravisor.OperationLibrary;
		let tmpHTML = '<option value="">From Library...</option>';

		for (let i = 0; i < tmpLibrary.length; i++)
		{
			let tmpItem = tmpLibrary[i];
			let tmpLabel = this.escapeHTML(tmpItem.Name || tmpItem.FileName);
			tmpLabel += ' (' + (tmpItem.NodeCount || 0) + ' nodes)';
			tmpHTML += '<option value="' + this.escapeHTML(tmpItem.FileName) + '">' + tmpLabel + '</option>';
		}

		tmpDropdown.innerHTML = tmpHTML;
	}

	onLibraryDropdownChange()
	{
		let tmpDropdown = document.getElementById('Ultravisor-LibraryDropdown');
		let tmpAddBtn = document.getElementById('Ultravisor-LibraryAddBtn');

		if (tmpDropdown && tmpAddBtn)
		{
			tmpAddBtn.style.display = tmpDropdown.value ? 'inline-block' : 'none';
		}
	}

	importSelectedLibraryOp()
	{
		let tmpDropdown = document.getElementById('Ultravisor-LibraryDropdown');
		if (!tmpDropdown || !tmpDropdown.value)
		{
			return;
		}

		let tmpFileName = tmpDropdown.value;

		this.pict.PictApplication.importLibraryOperation(tmpFileName,
			function (pError, pData)
			{
				if (pError)
				{
					this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Result',
						'<div class="ultravisor-task-result-panel"><p style="color:var(--uv-error);">Error importing: ' + this.escapeHTML(pError.message) + '</p></div>');
					return;
				}

				this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Result',
					'<div class="ultravisor-import-success">Operation imported as ' + this.escapeHTML(pData.Hash) + '</div>');

				// Reset dropdown
				let tmpDd = document.getElementById('Ultravisor-LibraryDropdown');
				if (tmpDd) { tmpDd.value = ''; }
				let tmpBtn = document.getElementById('Ultravisor-LibraryAddBtn');
				if (tmpBtn) { tmpBtn.style.display = 'none'; }

				// Reload the table
				this.pict.PictApplication.loadOperations(
					function ()
					{
						this.renderOperationTable();
					}.bind(this));
			}.bind(this));
	}

	exportOperation(pHash)
	{
		this.pict.PictApplication.exportOperation(pHash,
			function (pError)
			{
				if (pError)
				{
					this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Result',
						'<div class="ultravisor-task-result-panel"><p style="color:var(--uv-error);">Export error: ' + this.escapeHTML(pError.message) + '</p></div>');
				}
			}.bind(this));
	}

	escapeHTML(pValue)
	{
		if (!pValue) return '';
		return String(pValue).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
}

module.exports = UltravisorOperationListView;

module.exports.default_configuration = _ViewConfiguration;
