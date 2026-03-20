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
			max-width: 1400px;
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
		.ultravisor-dropzone {
			border: 2px dashed var(--uv-border-subtle);
			border-radius: 6px;
			padding: 1.5em 2em;
			text-align: center;
			color: var(--uv-text-secondary);
			cursor: pointer;
			transition: border-color 0.2s, background-color 0.2s;
			margin-bottom: 1.5em;
		}
		.ultravisor-dropzone:hover {
			border-color: var(--uv-brand);
		}
		.ultravisor-dropzone-active {
			border-color: var(--uv-brand);
			background-color: rgba(99, 102, 241, 0.08);
			color: var(--uv-text);
		}
		.ultravisor-dropzone-label {
			font-size: 0.95em;
		}
		.ultravisor-dropzone-options {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 0.5em;
			margin-top: 0.75em;
			font-size: 0.85em;
		}
		.ultravisor-dropzone-options label {
			cursor: pointer;
			color: var(--uv-text-secondary);
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
	<div id="Ultravisor-OperationList-Dropzone" class="ultravisor-dropzone">
		<div class="ultravisor-dropzone-label">Drop workflow JSON here or click to browse</div>
		<input type="file" id="Ultravisor-OperationList-FileInput" accept=".json" style="display:none" />
		<div class="ultravisor-dropzone-options">
			<input type="checkbox" id="Ultravisor-ImportRunImmediately" />
			<label for="Ultravisor-ImportRunImmediately">Run immediately after import</label>
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

		this.wireDropZone();

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	wireDropZone()
	{
		let tmpDropZone = document.getElementById('Ultravisor-OperationList-Dropzone');
		let tmpFileInput = document.getElementById('Ultravisor-OperationList-FileInput');

		if (!tmpDropZone || !tmpFileInput)
		{
			return;
		}

		tmpDropZone.addEventListener('dragover', function (pEvent)
		{
			pEvent.preventDefault();
			pEvent.stopPropagation();
			tmpDropZone.classList.add('ultravisor-dropzone-active');
		});

		tmpDropZone.addEventListener('dragleave', function (pEvent)
		{
			pEvent.preventDefault();
			pEvent.stopPropagation();
			tmpDropZone.classList.remove('ultravisor-dropzone-active');
		});

		tmpDropZone.addEventListener('drop', function (pEvent)
		{
			pEvent.preventDefault();
			pEvent.stopPropagation();
			tmpDropZone.classList.remove('ultravisor-dropzone-active');

			if (pEvent.dataTransfer && pEvent.dataTransfer.files && pEvent.dataTransfer.files.length > 0)
			{
				this.handleImportFile(pEvent.dataTransfer.files[0]);
			}
		}.bind(this));

		tmpDropZone.addEventListener('click', function (pEvent)
		{
			if (pEvent.target.tagName !== 'INPUT')
			{
				tmpFileInput.click();
			}
		});

		tmpFileInput.addEventListener('change', function (pEvent)
		{
			if (pEvent.target.files && pEvent.target.files.length > 0)
			{
				this.handleImportFile(pEvent.target.files[0]);
				pEvent.target.value = '';
			}
		}.bind(this));
	}

	handleImportFile(pFile)
	{
		if (!pFile || !pFile.name.endsWith('.json'))
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Result',
				'<div class="ultravisor-task-result-panel"><p style="color:var(--uv-error);">Please drop a .json file.</p></div>');
			return;
		}

		let tmpReader = new FileReader();
		let tmpSelf = this;

		tmpReader.onload = function (pEvent)
		{
			let tmpParsed;
			try
			{
				tmpParsed = JSON.parse(pEvent.target.result);
			}
			catch (pParseError)
			{
				tmpSelf.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Result',
					'<div class="ultravisor-task-result-panel"><p style="color:var(--uv-error);">Invalid JSON: ' + tmpSelf.escapeHTML(pParseError.message) + '</p></div>');
				return;
			}

			if (!tmpParsed.Graph && !tmpParsed.Nodes)
			{
				tmpSelf.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Result',
					'<div class="ultravisor-task-result-panel"><p style="color:var(--uv-error);">JSON does not appear to be a valid operation (no Graph or Nodes found).</p></div>');
				return;
			}

			// If the JSON has Nodes/Connections at the top level (like example flows), wrap in Graph
			if (!tmpParsed.Graph && tmpParsed.Nodes)
			{
				tmpParsed = {
					Name: tmpParsed.Name || pFile.name.replace(/\.json$/, ''),
					Description: tmpParsed.Description || '',
					Graph: {
						Nodes: tmpParsed.Nodes,
						Connections: tmpParsed.Connections || [],
						ViewState: tmpParsed.ViewState || {}
					}
				};
			}

			tmpSelf.processImportedOperation(tmpParsed, pFile.name);
		};

		tmpReader.readAsText(pFile);
	}

	processImportedOperation(pOperationJSON, pFileName)
	{
		this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Result',
			'<div class="ultravisor-import-success">Importing ' + this.escapeHTML(pFileName) + '...</div>');

		this.pict.PictApplication.importOperationFromJSON(pOperationJSON,
			function (pError, pData)
			{
				if (pError)
				{
					this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Result',
						'<div class="ultravisor-task-result-panel"><p style="color:var(--uv-error);">Import error: ' + this.escapeHTML(pError.message) + '</p></div>');
					return;
				}

				let tmpHash = pData.Hash || '';
				let tmpRunCheckbox = document.getElementById('Ultravisor-ImportRunImmediately');
				let tmpRunImmediately = tmpRunCheckbox && tmpRunCheckbox.checked;

				// Reload the table
				this.pict.PictApplication.loadOperations(
					function ()
					{
						this.renderOperationTable();

						if (tmpRunImmediately)
						{
							this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Result',
								'<div class="ultravisor-import-success">Imported as ' + this.escapeHTML(tmpHash) + ' — running...</div>');
							this.runOperation(tmpHash);
						}
						else
						{
							this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Result',
								'<div class="ultravisor-import-success">Imported as ' + this.escapeHTML(tmpHash) + '</div>');
						}
					}.bind(this));
			}.bind(this));
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
			tmpHTML += '<button class="ultravisor-btn-sm" style="background-color:#00695c;color:#e0f2f1;" onclick="' + tmpGlobalRef + '.views[\'Ultravisor-OperationList\'].runOperation(\'' + tmpEscHash + '\', \'debug\')">Debug</button>';
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-edit" onclick="' + tmpGlobalRef + '.PictApplication.editOperation(\'' + tmpEscHash + '\')">Edit</button>';
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-delete" onclick="' + tmpGlobalRef + '.views[\'Ultravisor-OperationList\'].confirmDeleteOperation(\'' + tmpEscHash + '\')">Delete</button>';
			tmpHTML += '<button class="ultravisor-btn-sm" style="background-color:var(--uv-info);color:#bbdefb;" onclick="' + tmpGlobalRef + '.views[\'Ultravisor-OperationList\'].exportOperation(\'' + tmpEscHash + '\')">Export</button>';
			tmpHTML += '</div></td>';
			tmpHTML += '</tr>';
		}

		tmpHTML += '</tbody></table>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Body', tmpHTML);
	}

	runOperation(pHash, pRunMode)
	{
		let tmpModeLabel = pRunMode === 'debug' ? ' (debug)' : '';
		this.pict.ContentAssignment.assignContent('#Ultravisor-OperationList-Result',
			'<div class="ultravisor-task-result-panel"><h3>Running operation ' + this.escapeHTML(pHash) + tmpModeLabel + '...</h3></div>');

		this.pict.PictApplication.executeOperation(pHash, pRunMode || null,
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
				tmpHTML += '<p><strong>Status:</strong> <span class="ultravisor-manifest-status ' + (pData.Status || '').toLowerCase() + '">' + this.escapeHTML(pData.Status || '') + '</span>';
				if (pData.RunMode)
				{
					tmpHTML += ' &middot; <strong>Mode:</strong> ' + this.escapeHTML(pData.RunMode);
				}
				tmpHTML += '</p>';
				tmpHTML += '<p><strong>Start:</strong> ' + this.escapeHTML(pData.StartTime || '') + ' &middot; <strong>Stop:</strong> ' + this.escapeHTML(pData.StopTime || '') + '</p>';
				tmpHTML += '<p><strong>Elapsed:</strong> ' + (pData.ElapsedMs || 0) + 'ms</p>';

				if (pData.Output && Object.keys(pData.Output).length > 0)
				{
					tmpHTML += '<h4 style="color:var(--uv-text-secondary); margin:0.75em 0 0.25em 0;">Output</h4>';
					tmpHTML += '<div class="ultravisor-task-result-output">' + this.escapeHTML(JSON.stringify(pData.Output, null, 2)) + '</div>';
				}

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

	confirmDeleteOperation(pHash)
	{
		this.pict.views.Modal.confirm('Delete operation ' + pHash + '?', { confirmLabel: 'Delete', dangerous: true }).then(
			function (pConfirmed)
			{
				if (pConfirmed)
				{
					this.pict.PictApplication.deleteOperation(pHash,
						function ()
						{
							this.pict.PictApplication.showView('Ultravisor-OperationList');
						}.bind(this));
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
