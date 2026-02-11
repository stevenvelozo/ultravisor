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
		.ultravisor-manifest-success-true {
			color: #66bb6a;
		}
		.ultravisor-manifest-success-false {
			color: #ef5350;
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
		tmpHTML += '<thead><tr><th>Run GUID</th><th>Operation</th><th>Status</th><th>Success</th><th>Started</th><th>Actions</th></tr></thead>';
		tmpHTML += '<tbody>';

		for (let i = 0; i < tmpManifests.length; i++)
		{
			let tmpManifest = tmpManifests[i];
			let tmpGUIDRun = tmpManifest.GUIDRun || '';
			let tmpEscGUID = tmpGUIDRun.replace(/'/g, "\\'");
			let tmpStatus = tmpManifest.Status || 'Unknown';
			let tmpStatusClass = tmpStatus.toLowerCase();
			if (tmpStatusClass !== 'complete' && tmpStatusClass !== 'running' && tmpStatusClass !== 'error')
			{
				tmpStatusClass = '';
			}

			tmpHTML += '<tr>';
			tmpHTML += '<td><code style="font-size:0.8em;">' + tmpGUIDRun + '</code></td>';
			tmpHTML += '<td>' + (tmpManifest.Name || tmpManifest.GUIDOperation || '') + '</td>';
			tmpHTML += '<td><span class="ultravisor-manifest-status ' + tmpStatusClass + '">' + tmpStatus + '</span></td>';
			tmpHTML += '<td><span class="ultravisor-manifest-success-' + (tmpManifest.Success ? 'true' : 'false') + '">' + (tmpManifest.Success ? 'Yes' : 'No') + '</span></td>';
			tmpHTML += '<td>' + (tmpManifest.StartTime || '') + '</td>';
			tmpHTML += '<td><button class="ultravisor-btn-sm ultravisor-btn-edit" onclick="' + tmpViewRef + '.showManifestDetail(\'' + tmpEscGUID + '\')">Details</button></td>';
			tmpHTML += '</tr>';
		}

		tmpHTML += '</tbody></table>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestList-Body', tmpHTML);
	}

	showManifestDetail(pGUIDRun)
	{
		this.pict.PictApplication.loadManifest(pGUIDRun,
			function (pError, pManifest)
			{
				if (pError || !pManifest)
				{
					this.pict.ContentAssignment.assignContent('#Ultravisor-ManifestList-Detail',
						'<div class="ultravisor-manifest-detail visible"><p style="color:#ef5350;">Error loading manifest details.</p></div>');
					return;
				}

				let tmpHTML = '<div class="ultravisor-manifest-detail visible">';
				tmpHTML += '<h3>Run: ' + (pManifest.GUIDRun || '') + '</h3>';
				tmpHTML += '<p><strong>Operation:</strong> ' + (pManifest.Name || pManifest.GUIDOperation || '') + '</p>';
				tmpHTML += '<p><strong>Status:</strong> ' + (pManifest.Status || '') + ' &middot; <strong>Success:</strong> ' + (pManifest.Success ? 'Yes' : 'No') + '</p>';
				tmpHTML += '<p><strong>Start:</strong> ' + (pManifest.StartTime || '') + ' &middot; <strong>Stop:</strong> ' + (pManifest.StopTime || '') + '</p>';

				if (pManifest.Summary)
				{
					tmpHTML += '<p><strong>Summary:</strong> ' + this.escapeHTML(pManifest.Summary) + '</p>';
				}

				// Task results
				let tmpTaskResults = pManifest.TaskResults || [];
				if (tmpTaskResults.length > 0)
				{
					tmpHTML += '<h3>Task Results</h3>';
					for (let i = 0; i < tmpTaskResults.length; i++)
					{
						let tmpResult = tmpTaskResults[i];
						tmpHTML += '<div class="ultravisor-manifest-task-result">';
						tmpHTML += '<div class="ultravisor-manifest-task-result-header">';
						tmpHTML += '<code>' + (tmpResult.GUIDTask || '') + '</code>';
						tmpHTML += '<span class="ultravisor-manifest-status ' + (tmpResult.Status || '').toLowerCase() + '">' + (tmpResult.Status || '') + '</span>';
						tmpHTML += '</div>';
						tmpHTML += '<p style="margin:0.25em 0; font-size:0.85em; color:#78909c;">' + (tmpResult.Name || '') + ' (' + (tmpResult.Type || '') + ')</p>';

						if (tmpResult.Output)
						{
							tmpHTML += '<div class="ultravisor-manifest-output">' + this.escapeHTML(String(tmpResult.Output)) + '</div>';
						}

						if (tmpResult.Log && tmpResult.Log.length > 0)
						{
							tmpHTML += '<div class="ultravisor-manifest-output">' + this.escapeHTML(tmpResult.Log.join('\n')) + '</div>';
						}
						tmpHTML += '</div>';
					}
				}

				// Operation log
				if (pManifest.Log && pManifest.Log.length > 0)
				{
					tmpHTML += '<h3>Operation Log</h3>';
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
