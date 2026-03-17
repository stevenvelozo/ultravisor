const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-PendingInput",

	DefaultRenderable: "Ultravisor-PendingInput-Content",
	DefaultDestinationAddress: "#Ultravisor-Content-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-pendinginput {
			padding: 2em;
			max-width: 1200px;
			margin: 0 auto;
		}
		.ultravisor-pendinginput-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1.5em;
			padding-bottom: 1em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.ultravisor-pendinginput-header h1 {
			margin: 0;
			font-size: 2em;
			font-weight: 300;
			color: var(--uv-text);
		}
		.ultravisor-pendinginput-card {
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-warning);
			border-radius: 8px;
			padding: 1.5em;
			margin-bottom: 1em;
		}
		.ultravisor-pendinginput-card-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1em;
		}
		.ultravisor-pendinginput-card-header h3 {
			margin: 0;
			color: var(--uv-text);
			font-weight: 500;
		}
		.ultravisor-pendinginput-meta {
			color: var(--uv-text-secondary);
			font-size: 0.85em;
			margin-bottom: 1em;
		}
		.ultravisor-pendinginput-meta code {
			color: var(--uv-brand);
			font-size: 0.9em;
		}
		.ultravisor-pendinginput-task {
			background: var(--uv-bg-base);
			border-radius: 4px;
			padding: 1em;
			margin-bottom: 0.75em;
		}
		.ultravisor-pendinginput-prompt {
			color: #fff9c4;
			font-size: 1.1em;
			margin-bottom: 0.75em;
		}
		.ultravisor-pendinginput-address {
			color: var(--uv-text-secondary);
			font-size: 0.8em;
			margin-bottom: 0.75em;
		}
		.ultravisor-pendinginput-form {
			display: flex;
			gap: 0.75em;
			align-items: center;
		}
		.ultravisor-pendinginput-form input[type="text"] {
			flex: 1;
			padding: 0.5em 0.75em;
			border: 1px solid var(--uv-border-subtle);
			border-radius: 4px;
			background: #0d1117;
			color: var(--uv-text);
			font-size: 1em;
			font-family: monospace;
		}
		.ultravisor-pendinginput-form input[type="text"]:focus {
			outline: none;
			border-color: var(--uv-warning);
		}
		.ultravisor-pendinginput-submit {
			padding: 0.5em 1.25em;
			background-color: var(--uv-warning);
			color: var(--uv-bg-base);
			border: none;
			border-radius: 4px;
			font-weight: 600;
			cursor: pointer;
			font-size: 0.95em;
		}
		.ultravisor-pendinginput-submit:hover {
			background-color: #ff8f00;
		}
		.ultravisor-pendinginput-submit:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		.ultravisor-pendinginput-result {
			margin-top: 0.75em;
			padding: 0.5em 0.75em;
			border-radius: 4px;
			font-size: 0.85em;
		}
		.ultravisor-pendinginput-result.success {
			background: #1b5e20;
			color: #c8e6c9;
		}
		.ultravisor-pendinginput-result.error {
			background: #b71c1c;
			color: #ffcdd2;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-PendingInput-Template",
			Template: /*html*/`
<div class="ultravisor-pendinginput">
	<div class="ultravisor-pendinginput-header">
		<h1>Awaiting</h1>
		<button class="ultravisor-btn ultravisor-btn-secondary" onclick="{~P~}.PictApplication.showView('Ultravisor-PendingInput')">Refresh</button>
	</div>
	<div id="Ultravisor-PendingInput-Body"></div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-PendingInput-Content",
			TemplateHash: "Ultravisor-PendingInput-Template",
			DestinationAddress: "#Ultravisor-Content-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorPendingInputView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.pict.PictApplication.loadPendingInputs(
			function ()
			{
				this.renderPendingInputs();
			}.bind(this));

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	renderPendingInputs()
	{
		let tmpPendingInputs = this.pict.AppData.Ultravisor.PendingInputs;
		let tmpGlobalRef = '_Pict';
		let tmpViewRef = tmpGlobalRef + ".views['Ultravisor-PendingInput']";

		if (!tmpPendingInputs || tmpPendingInputs.length === 0)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-PendingInput-Body',
				'<div class="ultravisor-empty-message">No operations waiting for input.</div>');
			return;
		}

		let tmpHTML = '';

		for (let i = 0; i < tmpPendingInputs.length; i++)
		{
			let tmpPending = tmpPendingInputs[i];
			let tmpRunHash = tmpPending.RunHash || '';
			let tmpEscRunHash = tmpRunHash.replace(/'/g, "\\'");

			tmpHTML += '<div class="ultravisor-pendinginput-card">';
			tmpHTML += '<div class="ultravisor-pendinginput-card-header">';
			tmpHTML += '<h3>' + this.escapeHTML(tmpPending.OperationName || tmpPending.OperationHash || 'Unknown') + '</h3>';
			tmpHTML += '<span class="ultravisor-manifest-status waiting">Waiting for Input</span>';
			tmpHTML += '</div>';
			tmpHTML += '<div class="ultravisor-pendinginput-meta">';
			tmpHTML += 'Operation: <code>' + this.escapeHTML(tmpPending.OperationHash || '') + '</code>';
			tmpHTML += ' &middot; Run: <code>' + this.escapeHTML(tmpRunHash) + '</code>';
			if (tmpPending.StartTime)
			{
				tmpHTML += ' &middot; Started: ' + this.escapeHTML(tmpPending.StartTime);
			}
			tmpHTML += '</div>';

			// Render each waiting task
			let tmpWaitingTasks = tmpPending.WaitingTasks || {};
			let tmpNodeHashes = Object.keys(tmpWaitingTasks);

			for (let j = 0; j < tmpNodeHashes.length; j++)
			{
				let tmpNodeHash = tmpNodeHashes[j];
				let tmpEscNodeHash = tmpNodeHash.replace(/'/g, "\\'");
				let tmpTask = tmpWaitingTasks[tmpNodeHash];
				let tmpInputId = 'pending-input-' + tmpRunHash + '-' + tmpNodeHash;
				let tmpResultId = 'pending-result-' + tmpRunHash + '-' + tmpNodeHash;

				tmpHTML += '<div class="ultravisor-pendinginput-task">';
				tmpHTML += '<div class="ultravisor-pendinginput-prompt">' + this.escapeHTML(tmpTask.PromptMessage || 'Enter a value') + '</div>';
				if (tmpTask.OutputAddress)
				{
					tmpHTML += '<div class="ultravisor-pendinginput-address">Target: <code>' + this.escapeHTML(tmpTask.OutputAddress) + '</code></div>';
				}
				tmpHTML += '<div class="ultravisor-pendinginput-form">';
				tmpHTML += '<input type="text" id="' + tmpInputId + '" placeholder="Enter value..." onkeydown="if(event.key===\'Enter\'){' + tmpViewRef + '.submitInput(\'' + tmpEscRunHash + '\', \'' + tmpEscNodeHash + '\', \'' + tmpInputId + '\', \'' + tmpResultId + '\');}" />';
				tmpHTML += '<button class="ultravisor-pendinginput-submit" onclick="' + tmpViewRef + '.submitInput(\'' + tmpEscRunHash + '\', \'' + tmpEscNodeHash + '\', \'' + tmpInputId + '\', \'' + tmpResultId + '\')">Submit</button>';
				tmpHTML += '</div>';
				tmpHTML += '<div id="' + tmpResultId + '"></div>';
				tmpHTML += '</div>';
			}

			tmpHTML += '</div>';
		}

		this.pict.ContentAssignment.assignContent('#Ultravisor-PendingInput-Body', tmpHTML);
	}

	submitInput(pRunHash, pNodeHash, pInputId, pResultId)
	{
		let tmpInputEl = document.getElementById(pInputId);
		if (!tmpInputEl)
		{
			return;
		}

		let tmpValue = tmpInputEl.value;

		// Disable the input and button while submitting
		tmpInputEl.disabled = true;
		let tmpButton = tmpInputEl.parentElement.querySelector('.ultravisor-pendinginput-submit');
		if (tmpButton)
		{
			tmpButton.disabled = true;
			tmpButton.textContent = 'Submitting...';
		}

		this.pict.PictApplication.submitPendingInput(pRunHash, pNodeHash, tmpValue,
			function (pError, pData)
			{
				if (pError)
				{
					this.pict.ContentAssignment.assignContent('#' + pResultId,
						'<div class="ultravisor-pendinginput-result error">Error: ' + this.escapeHTML(pError.message || 'Request failed') + '</div>');
					// Re-enable
					tmpInputEl.disabled = false;
					if (tmpButton)
					{
						tmpButton.disabled = false;
						tmpButton.textContent = 'Submit';
					}
					return;
				}

				if (pData && pData.Error)
				{
					this.pict.ContentAssignment.assignContent('#' + pResultId,
						'<div class="ultravisor-pendinginput-result error">Error: ' + this.escapeHTML(pData.Error) + '</div>');
					tmpInputEl.disabled = false;
					if (tmpButton)
					{
						tmpButton.disabled = false;
						tmpButton.textContent = 'Submit';
					}
					return;
				}

				let tmpStatus = (pData && pData.Status) || 'Submitted';
				this.pict.ContentAssignment.assignContent('#' + pResultId,
					'<div class="ultravisor-pendinginput-result success">Input submitted — operation status: ' + this.escapeHTML(tmpStatus) + '</div>');

				// Refresh the list after a brief delay so the user sees the success message
				setTimeout(
					function ()
					{
						this.pict.PictApplication.loadPendingInputs(
							function ()
							{
								this.renderPendingInputs();
							}.bind(this));
					}.bind(this), 1500);
			}.bind(this));
	}

	escapeHTML(pValue)
	{
		if (!pValue) return '';
		return String(pValue).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
}

module.exports = UltravisorPendingInputView;

module.exports.default_configuration = _ViewConfiguration;
