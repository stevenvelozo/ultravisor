const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-ManifestList",

	DefaultRenderable: "Ultravisor-ManifestList-Content",
	DefaultDestinationAddress: "#Ultravisor-Content-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-manifestlist {
			padding: 2em;
			max-width: 1200px;
			margin: 0 auto;
		}
		.ultravisor-manifestlist-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1.5em;
			padding-bottom: 1em;
			border-bottom: 1px solid #2a2a4a;
		}
		.ultravisor-manifestlist-header h1 {
			margin: 0;
			font-size: 2em;
			font-weight: 300;
			color: #e0e0e0;
		}
		.ultravisor-manifest-table {
			width: 100%;
			border-collapse: collapse;
		}
		.ultravisor-manifest-table th {
			background-color: #16213e;
		}
		.ultravisor-manifest-table tr:hover td {
			background-color: #1a2744;
		}
		.ultravisor-manifest-status {
			display: inline-block;
			padding: 0.15em 0.5em;
			border-radius: 3px;
			font-size: 0.8em;
			font-weight: 600;
		}
		.ultravisor-manifest-status.complete {
			background-color: #2e7d32;
			color: #c8e6c9;
		}
		.ultravisor-manifest-status.running {
			background-color: #1565c0;
			color: #bbdefb;
		}
		.ultravisor-manifest-status.error {
			background-color: #c62828;
			color: #ffcdd2;
		}
		.ultravisor-manifest-status.waiting {
			background-color: #f57f17;
			color: #fff9c4;
		}
		.ultravisor-manifest-detail {
			background: #16213e;
			border: 1px solid #2a2a4a;
			border-radius: 8px;
			padding: 1.5em;
			margin-top: 1em;
			display: none;
		}
		.ultravisor-manifest-detail.visible {
			display: block;
		}
		.ultravisor-manifest-detail h3 {
			margin: 0 0 1em 0;
			color: #b0bec5;
		}
		.ultravisor-manifest-task-result {
			background: #1a1a2e;
			border-radius: 4px;
			padding: 0.75em;
			margin-bottom: 0.5em;
		}
		.ultravisor-manifest-task-result-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 0.5em;
		}
		.ultravisor-manifest-task-result-header code {
			color: #4fc3f7;
		}
		.ultravisor-manifest-output {
			background: #0d1117;
			color: #c9d1d9;
			border-radius: 4px;
			padding: 0.75em;
			font-family: monospace;
			font-size: 0.85em;
			white-space: pre-wrap;
			word-break: break-all;
			max-height: 200px;
			overflow-y: auto;
			margin-top: 0.5em;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-ManifestList-Template",
			Template: /*html*/`
<div class="ultravisor-manifestlist">
	<div class="ultravisor-manifestlist-header">
		<h1>Execution Manifests</h1>
		<button class="ultravisor-btn ultravisor-btn-secondary" onclick="{~P~}.PictApplication.showView('Ultravisor-ManifestList')">Refresh</button>
	</div>
	<div id="Ultravisor-ManifestList-Body"></div>
	<div id="Ultravisor-ManifestList-Detail"></div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-ManifestList-Content",
			TemplateHash: "Ultravisor-ManifestList-Template",
			DestinationAddress: "#Ultravisor-Content-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorManifestListView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.pict.PictApplication.loadManifests(
			function ()
			{
				this.renderManifestTable();
			}.bind(this));

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	renderManifestTable()
	{
		let tmpManifests = this.pict.AppData.Ultravisor.Manifests;
		let tmpGlobalRef = '_Pict';
		let tmpViewRef = tmpGlobalRef + ".views['Ultravisor-ManifestList']";

		if (!tmpManifests || tmpManifests.length === 0)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestList-Body',
				'<div class="ultravisor-empty-message">No execution manifests recorded yet. Execute a task or operation to see results here.</div>');
			return;
		}

		let tmpHTML = '<table class="ultravisor-manifest-table">';
		tmpHTML += '<thead><tr><th>Run Hash</th><th>Operation</th><th>Status</th><th>Elapsed</th><th>Started</th><th>Actions</th></tr></thead>';
		tmpHTML += '<tbody>';

		for (let i = 0; i < tmpManifests.length; i++)
		{
			let tmpManifest = tmpManifests[i];
			let tmpRunHash = tmpManifest.Hash || '';
			let tmpEscHash = tmpRunHash.replace(/'/g, "\\'");
			let tmpStatus = tmpManifest.Status || 'Unknown';
			let tmpStatusClass = tmpStatus.toLowerCase();
			if (tmpStatusClass !== 'complete' && tmpStatusClass !== 'running' && tmpStatusClass !== 'error' && tmpStatusClass !== 'waiting')
			{
				tmpStatusClass = '';
			}

			tmpHTML += '<tr>';
			tmpHTML += '<td><code style="font-size:0.8em;">' + this.escapeHTML(tmpRunHash) + '</code></td>';
			tmpHTML += '<td>' + this.escapeHTML(tmpManifest.OperationHash || '') + '</td>';
			tmpHTML += '<td><span class="ultravisor-manifest-status ' + tmpStatusClass + '">' + this.escapeHTML(tmpStatus) + '</span></td>';
			tmpHTML += '<td>' + (tmpManifest.ElapsedMs ? this.fable.DataFormat.formatTimeSpan(tmpManifest.ElapsedMs) + ' (' + tmpManifest.ElapsedMs + 'ms)' : '') + '</td>';
			tmpHTML += '<td>' + this.escapeHTML(tmpManifest.StartTime || '') + '</td>';
			tmpHTML += '<td><button class="ultravisor-btn-sm ultravisor-btn-edit" onclick="' + tmpViewRef + '.showManifestDetail(\'' + tmpEscHash + '\')">Details</button></td>';
			tmpHTML += '</tr>';
		}

		tmpHTML += '</tbody></table>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestList-Body', tmpHTML);
	}

	showManifestDetail(pRunHash)
	{
		this.pict.PictApplication.loadManifest(pRunHash,
			function (pError, pManifest)
			{
				if (pError || !pManifest)
				{
					this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestList-Detail',
						'<div class="ultravisor-manifest-detail visible"><p style="color:#ef5350;">Error loading manifest details.</p></div>');
					return;
				}

				let tmpHTML = '<div class="ultravisor-manifest-detail visible">';
				tmpHTML += '<h3>Run: ' + this.escapeHTML(pManifest.Hash || '') + '</h3>';
				tmpHTML += '<p><strong>Operation:</strong> ' + this.escapeHTML(pManifest.OperationHash || '') + '</p>';
				tmpHTML += '<p><strong>Status:</strong> ' + this.escapeHTML(pManifest.Status || '') + '</p>';
				tmpHTML += '<p><strong>Start:</strong> ' + this.escapeHTML(pManifest.StartTime || '') + ' &middot; <strong>Stop:</strong> ' + this.escapeHTML(pManifest.StopTime || '') + '</p>';
				tmpHTML += '<p><strong>Elapsed:</strong> ' + this.fable.DataFormat.formatTimeSpan(pManifest.ElapsedMs || 0) + ' (' + (pManifest.ElapsedMs || 0) + 'ms)</p>';

				// Task Outputs
				if (pManifest.TaskOutputs && Object.keys(pManifest.TaskOutputs).length > 0)
				{
					tmpHTML += '<h3>Task Outputs</h3>';
					tmpHTML += '<div class="ultravisor-manifest-output">' + this.escapeHTML(JSON.stringify(pManifest.TaskOutputs, null, 2)) + '</div>';
				}

				// Task Manifests (object keyed by node hash)
				if (pManifest.TaskManifests && Object.keys(pManifest.TaskManifests).length > 0)
				{
					tmpHTML += '<h3>Task Manifests</h3>';
					let tmpNodeHashes = Object.keys(pManifest.TaskManifests);
					for (let i = 0; i < tmpNodeHashes.length; i++)
					{
						let tmpNodeHash = tmpNodeHashes[i];
						let tmpTaskManifest = pManifest.TaskManifests[tmpNodeHash];
						tmpHTML += '<div class="ultravisor-manifest-task-result">';
						tmpHTML += '<div class="ultravisor-manifest-task-result-header">';
						tmpHTML += '<code>' + this.escapeHTML(tmpNodeHash) + '</code>';
						tmpHTML += '<span class="ultravisor-manifest-status ' + (tmpTaskManifest.Status || '').toLowerCase() + '">' + this.escapeHTML(tmpTaskManifest.Status || '') + '</span>';
						tmpHTML += '</div>';
						if (tmpTaskManifest.Output)
						{
							tmpHTML += '<div class="ultravisor-manifest-output">' + this.escapeHTML(JSON.stringify(tmpTaskManifest.Output, null, 2)) + '</div>';
						}
						tmpHTML += '</div>';
					}
				}

				// Errors
				if (pManifest.Errors && pManifest.Errors.length > 0)
				{
					tmpHTML += '<h3 style="color:#ef5350;">Errors</h3>';
					tmpHTML += '<div class="ultravisor-manifest-output" style="border: 1px solid #ef5350;">' + this.escapeHTML(pManifest.Errors.join('\n')) + '</div>';
				}

				// Log
				if (pManifest.Log && pManifest.Log.length > 0)
				{
					tmpHTML += '<h3>Log</h3>';
					tmpHTML += '<div class="ultravisor-manifest-output">' + this.escapeHTML(pManifest.Log.join('\n')) + '</div>';
				}

				tmpHTML += '</div>';
				this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestList-Detail', tmpHTML);
			}.bind(this));
	}

	escapeHTML(pValue)
	{
		if (!pValue) return '';
		return String(pValue).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
}

module.exports = UltravisorManifestListView;

module.exports.default_configuration = _ViewConfiguration;
