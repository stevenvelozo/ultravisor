const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-Schedule",

	DefaultRenderable: "Ultravisor-Schedule-Content",
	DefaultDestinationAddress: "#Ultravisor-Content-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-schedule {
			padding: 2em;
			max-width: 1200px;
			margin: 0 auto;
		}
		.ultravisor-schedule-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1.5em;
			padding-bottom: 1em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.ultravisor-schedule-header h1 {
			margin: 0;
			font-size: 2em;
			font-weight: 300;
			color: var(--uv-text);
		}
		.ultravisor-schedule-controls {
			display: flex;
			gap: 0.5em;
		}
		.ultravisor-schedule-table {
			width: 100%;
			border-collapse: collapse;
			margin-bottom: 2em;
		}
		.ultravisor-schedule-table th {
			background-color: var(--uv-bg-surface);
		}
		.ultravisor-schedule-table tr:hover td {
			background-color: var(--uv-table-row-hover);
		}
		.ultravisor-schedule-active {
			display: inline-block;
			padding: 0.1em 0.5em;
			border-radius: 3px;
			font-size: 0.8em;
			font-weight: 600;
		}
		.ultravisor-schedule-active.yes {
			background-color: var(--uv-success);
			color: var(--uv-btn-primary-text);
		}
		.ultravisor-schedule-active.no {
			background-color: var(--uv-bg-elevated);
			color: var(--uv-text-tertiary);
		}
		.ultravisor-schedule-add-section {
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 8px;
			padding: 1.5em;
			margin-top: 1em;
		}
		.ultravisor-schedule-add-section h3 {
			margin: 0 0 1em 0;
			font-size: 1.1em;
			font-weight: 600;
			color: var(--uv-text-secondary);
		}
		.ultravisor-schedule-add-form {
			display: flex;
			flex-wrap: wrap;
			gap: 0.75em;
			align-items: flex-end;
		}
		.ultravisor-schedule-add-form .ultravisor-form-group {
			margin-bottom: 0;
		}
		.ultravisor-schedule-add-form .ultravisor-form-group label {
			display: block;
			margin-bottom: 0.35em;
			font-size: 0.8em;
			font-weight: 600;
			color: var(--uv-text-secondary);
			text-transform: uppercase;
			letter-spacing: 0.03em;
		}

		/* Crontab builder */
		.ultravisor-cron-builder {
			margin-top: 0.75em;
			padding: 1em;
			background: var(--uv-bg-base);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 6px;
		}
		.ultravisor-cron-presets {
			display: flex;
			gap: 0.4em;
			flex-wrap: wrap;
			margin-bottom: 0.75em;
		}
		.ultravisor-cron-preset-btn {
			background: var(--uv-btn-secondary-bg);
			color: var(--uv-btn-secondary-text);
			border: 1px solid var(--uv-border);
			border-radius: 4px;
			padding: 0.3em 0.7em;
			font-size: 0.78em;
			cursor: pointer;
			transition: background-color 0.15s, border-color 0.15s;
		}
		.ultravisor-cron-preset-btn:hover {
			border-color: var(--uv-brand);
			color: var(--uv-text-heading);
		}
		.ultravisor-cron-preset-btn.active {
			background: var(--uv-brand);
			color: var(--uv-btn-primary-text);
			border-color: var(--uv-brand);
		}
		.ultravisor-cron-fields {
			display: flex;
			gap: 0.5em;
			align-items: flex-end;
			margin-bottom: 0.5em;
		}
		.ultravisor-cron-field {
			display: flex;
			flex-direction: column;
			align-items: center;
			width: 5em;
		}
		.ultravisor-cron-field label {
			font-size: 0.7em;
			font-weight: 600;
			color: var(--uv-text-tertiary);
			text-transform: uppercase;
			letter-spacing: 0.05em;
			margin-bottom: 0.3em;
		}
		.ultravisor-cron-field input {
			width: 100%;
			text-align: center;
			font-family: monospace;
			font-size: 0.95em;
			padding: 0.35em 0.25em;
			background: var(--uv-bg-input);
			color: var(--uv-text);
			border: 1px solid var(--uv-border);
			border-radius: 4px;
		}
		.ultravisor-cron-field input:focus {
			outline: none;
			border-color: var(--uv-border-focus);
		}
		.ultravisor-cron-field input:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		.ultravisor-cron-preview {
			display: flex;
			align-items: center;
			gap: 0.75em;
			margin-top: 0.5em;
			font-size: 0.85em;
			flex-wrap: wrap;
		}
		.ultravisor-cron-preview code {
			color: var(--uv-brand);
			font-size: 1.05em;
			background: var(--uv-bg-code);
			padding: 0.15em 0.5em;
			border-radius: 3px;
		}
		.ultravisor-cron-description {
			color: var(--uv-text-secondary);
			font-style: italic;
		}
		.ultravisor-cron-raw-toggle {
			background: none;
			border: none;
			color: var(--uv-link);
			font-size: 0.8em;
			cursor: pointer;
			padding: 0;
			text-decoration: underline;
		}
		.ultravisor-cron-raw-toggle:hover {
			color: var(--uv-link-hover);
		}
		.ultravisor-cron-raw-input {
			margin-top: 0.5em;
		}
		.ultravisor-cron-raw-input input {
			font-family: monospace;
			font-size: 0.95em;
			padding: 0.35em 0.5em;
			background: var(--uv-bg-input);
			color: var(--uv-text);
			border: 1px solid var(--uv-border);
			border-radius: 4px;
			width: 14em;
		}
		.ultravisor-cron-raw-input input:focus {
			outline: none;
			border-color: var(--uv-border-focus);
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-Schedule-Template",
			Template: /*html*/`
<div class="ultravisor-schedule">
	<div class="ultravisor-schedule-header">
		<h1>Schedule</h1>
		<div class="ultravisor-schedule-controls">
			<button class="ultravisor-btn ultravisor-btn-primary" onclick="{~P~}.PictApplication.startSchedule(function(){ {~P~}.PictApplication.showView('Ultravisor-Schedule'); })">Start All</button>
			<button class="ultravisor-btn ultravisor-btn-danger" onclick="{~P~}.PictApplication.stopSchedule(function(){ {~P~}.PictApplication.showView('Ultravisor-Schedule'); })">Stop All</button>
			<button class="ultravisor-btn ultravisor-btn-secondary" onclick="{~P~}.PictApplication.showView('Ultravisor-Schedule')">Refresh</button>
		</div>
	</div>
	<div id="Ultravisor-Schedule-Body"></div>
	<div id="Ultravisor-Schedule-AddForms"></div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-Schedule-Content",
			TemplateHash: "Ultravisor-Schedule-Template",
			DestinationAddress: "#Ultravisor-Content-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorScheduleView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this._rawMode = false;
		this._activePreset = '';
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		// Load operations first (for the dropdown), then the schedule
		this.pict.PictApplication.loadOperations(
			function ()
			{
				this.pict.PictApplication.loadSchedule(
					function ()
					{
						this.renderScheduleTable();
						this.renderAddForms();
					}.bind(this));
			}.bind(this));

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	renderScheduleTable()
	{
		let tmpSchedule = this.pict.AppData.Ultravisor.Schedule;
		let tmpGlobalRef = '_Pict';
		let tmpOperations = this.pict.AppData.Ultravisor.Operations || {};

		if (!tmpSchedule || tmpSchedule.length === 0)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-Schedule-Body',
				'<div class="ultravisor-empty-message">No schedule entries. Use the form below to add operations to the schedule.</div>');
			return;
		}

		let tmpHTML = '<table class="ultravisor-schedule-table">';
		tmpHTML += '<thead><tr><th>GUID</th><th>Type</th><th>Target</th><th>Cron</th><th>Active</th><th>Actions</th></tr></thead>';
		tmpHTML += '<tbody>';

		for (let i = 0; i < tmpSchedule.length; i++)
		{
			let tmpEntry = tmpSchedule[i];
			let tmpGUID = tmpEntry.GUID || '';
			let tmpEscGUID = tmpGUID.replace(/'/g, "\\'");
			let tmpActive = tmpEntry.Active ? 'yes' : 'no';

			// Show operation name if available
			let tmpTargetLabel = this.escapeHTML(tmpEntry.TargetHash || '');
			let tmpOp = tmpOperations[tmpEntry.TargetHash];
			if (tmpOp && tmpOp.Name)
			{
				tmpTargetLabel = this.escapeHTML(tmpOp.Name) + ' <code style="font-size:0.8em;">' + this.escapeHTML(tmpEntry.TargetHash) + '</code>';
			}

			tmpHTML += '<tr>';
			tmpHTML += '<td><code style="font-size:0.8em;">' + this.escapeHTML(tmpGUID) + '</code></td>';
			tmpHTML += '<td>' + this.escapeHTML(tmpEntry.TargetType || '') + '</td>';
			tmpHTML += '<td>' + tmpTargetLabel + '</td>';
			tmpHTML += '<td><code>' + this.escapeHTML(tmpEntry.CronExpression || tmpEntry.Parameters || '') + '</code></td>';
			tmpHTML += '<td><span class="ultravisor-schedule-active ' + tmpActive + '">' + (tmpEntry.Active ? 'Active' : 'Inactive') + '</span></td>';
			tmpHTML += '<td style="white-space:nowrap;">';
			if (tmpEntry.Active)
			{
				tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-secondary" onclick="' + tmpGlobalRef + '.PictApplication.stopScheduleEntry(\'' + tmpEscGUID + '\', function(){ ' + tmpGlobalRef + '.PictApplication.showView(\'Ultravisor-Schedule\'); })">Stop</button> ';
			}
			else
			{
				tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-primary" onclick="' + tmpGlobalRef + '.PictApplication.startScheduleEntry(\'' + tmpEscGUID + '\', function(){ ' + tmpGlobalRef + '.PictApplication.showView(\'Ultravisor-Schedule\'); })">Start</button> ';
			}
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-delete" onclick="if(confirm(\'Remove schedule entry?\')){ ' + tmpGlobalRef + '.PictApplication.removeScheduleEntry(\'' + tmpEscGUID + '\', function(){ ' + tmpGlobalRef + '.PictApplication.showView(\'Ultravisor-Schedule\'); }); }">Remove</button>';
			tmpHTML += '</td>';
			tmpHTML += '</tr>';
		}

		tmpHTML += '</tbody></table>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-Schedule-Body', tmpHTML);
	}

	renderAddForms()
	{
		let tmpViewRef = "_Pict.views['Ultravisor-Schedule']";
		let tmpOperations = this.pict.AppData.Ultravisor.OperationList || [];

		let tmpHTML = '';

		// Schedule an operation
		tmpHTML += '<div class="ultravisor-schedule-add-section">';
		tmpHTML += '<h3>Schedule an Operation</h3>';
		tmpHTML += '<div class="ultravisor-schedule-add-form">';

		// Operation dropdown
		tmpHTML += '<div class="ultravisor-form-group"><label>Operation</label>';
		tmpHTML += '<select id="Ultravisor-Schedule-OperationHash">';
		tmpHTML += '<option value="">Select an operation...</option>';
		for (let i = 0; i < tmpOperations.length; i++)
		{
			let tmpOp = tmpOperations[i];
			let tmpName = this.escapeHTML(tmpOp.Name || tmpOp.Hash);
			let tmpHash = this.escapeHTML(tmpOp.Hash);
			tmpHTML += '<option value="' + tmpHash + '">' + tmpName + ' (' + tmpHash + ')</option>';
		}
		tmpHTML += '</select></div>';

		// Schedule type
		tmpHTML += '<div class="ultravisor-form-group"><label>Schedule Type</label>';
		tmpHTML += '<select id="Ultravisor-Schedule-OperationScheduleType" onchange="' + tmpViewRef + '.onScheduleTypeChange()">';
		tmpHTML += '<option value="cron">Cron</option>';
		tmpHTML += '<option value="daily">Daily</option>';
		tmpHTML += '<option value="hourly">Hourly</option>';
		tmpHTML += '</select></div>';

		// Add button
		tmpHTML += '<button class="ultravisor-btn ultravisor-btn-primary" onclick="' + tmpViewRef + '.addOperationSchedule()">Add</button>';

		tmpHTML += '</div>';

		// Cron builder
		tmpHTML += this._renderCronBuilder(tmpViewRef);

		tmpHTML += '</div>';

		this.pict.ContentAssignment.assignContent('#Ultravisor-Schedule-AddForms', tmpHTML);

		// Initialize the preview
		this._updateCronExpression();
	}

	_renderCronBuilder(pViewRef)
	{
		let tmpHTML = '';

		tmpHTML += '<div class="ultravisor-cron-builder" id="Ultravisor-Cron-Builder">';

		// Preset buttons
		tmpHTML += '<div class="ultravisor-cron-presets">';
		tmpHTML += '<button class="ultravisor-cron-preset-btn" onclick="' + pViewRef + '.applyCronPreset(\'every-minute\')">Every Minute</button>';
		tmpHTML += '<button class="ultravisor-cron-preset-btn" onclick="' + pViewRef + '.applyCronPreset(\'hourly\')">Hourly</button>';
		tmpHTML += '<button class="ultravisor-cron-preset-btn" onclick="' + pViewRef + '.applyCronPreset(\'daily\')">Daily</button>';
		tmpHTML += '<button class="ultravisor-cron-preset-btn" onclick="' + pViewRef + '.applyCronPreset(\'weekly\')">Weekly</button>';
		tmpHTML += '<button class="ultravisor-cron-preset-btn" onclick="' + pViewRef + '.applyCronPreset(\'monthly\')">Monthly</button>';
		tmpHTML += '<button class="ultravisor-cron-preset-btn" onclick="' + pViewRef + '.applyCronPreset(\'every-6h\')">Every 6 Hours</button>';
		tmpHTML += '<button class="ultravisor-cron-preset-btn" onclick="' + pViewRef + '.applyCronPreset(\'every-15m\')">Every 15 Min</button>';
		tmpHTML += '</div>';

		// 5 cron fields
		tmpHTML += '<div class="ultravisor-cron-fields">';

		let tmpFields = [
			{ id: 'Minute', label: 'Minute', placeholder: '0-59' },
			{ id: 'Hour', label: 'Hour', placeholder: '0-23' },
			{ id: 'DayOfMonth', label: 'Day', placeholder: '1-31' },
			{ id: 'Month', label: 'Month', placeholder: '1-12' },
			{ id: 'Weekday', label: 'Wkday', placeholder: '0-6' }
		];

		for (let i = 0; i < tmpFields.length; i++)
		{
			let tmpField = tmpFields[i];
			tmpHTML += '<div class="ultravisor-cron-field">';
			tmpHTML += '<label>' + tmpField.label + '</label>';
			tmpHTML += '<input type="text" id="Ultravisor-Cron-' + tmpField.id + '" value="*" placeholder="' + tmpField.placeholder + '" oninput="' + pViewRef + '._updateCronExpression()">';
			tmpHTML += '</div>';
		}

		tmpHTML += '</div>';

		// Preview
		tmpHTML += '<div class="ultravisor-cron-preview">';
		tmpHTML += '<code id="Ultravisor-Cron-Expression">* * * * *</code>';
		tmpHTML += '<span class="ultravisor-cron-description" id="Ultravisor-Cron-Description">Every minute</span>';
		tmpHTML += '<button class="ultravisor-cron-raw-toggle" onclick="' + pViewRef + '.toggleRawMode()">edit raw</button>';
		tmpHTML += '</div>';

		// Hidden raw input
		tmpHTML += '<div class="ultravisor-cron-raw-input" id="Ultravisor-Cron-RawWrap" style="display:none;">';
		tmpHTML += '<input type="text" id="Ultravisor-Cron-RawInput" value="* * * * *" placeholder="min hour day month weekday" oninput="' + pViewRef + '._onRawInput()">';
		tmpHTML += '</div>';

		// Hidden field for the final expression value
		tmpHTML += '<input type="hidden" id="Ultravisor-Schedule-OperationParameters" value="* * * * *">';

		tmpHTML += '</div>';

		return tmpHTML;
	}

	applyCronPreset(pPreset)
	{
		let tmpPresets = {
			'every-minute': { m: '*', h: '*', d: '*', mo: '*', w: '*' },
			'hourly':       { m: '0', h: '*', d: '*', mo: '*', w: '*' },
			'daily':        { m: '0', h: '0', d: '*', mo: '*', w: '*' },
			'weekly':       { m: '0', h: '0', d: '*', mo: '*', w: '0' },
			'monthly':      { m: '0', h: '0', d: '1', mo: '*', w: '*' },
			'every-6h':     { m: '0', h: '*/6', d: '*', mo: '*', w: '*' },
			'every-15m':    { m: '*/15', h: '*', d: '*', mo: '*', w: '*' }
		};

		let tmpPreset = tmpPresets[pPreset];
		if (!tmpPreset)
		{
			return;
		}

		this._activePreset = pPreset;

		document.getElementById('Ultravisor-Cron-Minute').value = tmpPreset.m;
		document.getElementById('Ultravisor-Cron-Hour').value = tmpPreset.h;
		document.getElementById('Ultravisor-Cron-DayOfMonth').value = tmpPreset.d;
		document.getElementById('Ultravisor-Cron-Month').value = tmpPreset.mo;
		document.getElementById('Ultravisor-Cron-Weekday').value = tmpPreset.w;

		this._updateCronExpression();

		// Highlight active preset button
		let tmpButtons = document.querySelectorAll('.ultravisor-cron-preset-btn');
		for (let i = 0; i < tmpButtons.length; i++)
		{
			tmpButtons[i].classList.remove('active');
		}
		// Find the button that matches this preset by text content
		let tmpPresetLabels = {
			'every-minute': 'Every Minute',
			'hourly': 'Hourly',
			'daily': 'Daily',
			'weekly': 'Weekly',
			'monthly': 'Monthly',
			'every-6h': 'Every 6 Hours',
			'every-15m': 'Every 15 Min'
		};
		let tmpLabel = tmpPresetLabels[pPreset];
		for (let i = 0; i < tmpButtons.length; i++)
		{
			if (tmpButtons[i].textContent === tmpLabel)
			{
				tmpButtons[i].classList.add('active');
				break;
			}
		}
	}

	onScheduleTypeChange()
	{
		let tmpType = document.getElementById('Ultravisor-Schedule-OperationScheduleType').value;
		let tmpBuilder = document.getElementById('Ultravisor-Cron-Builder');

		if (!tmpBuilder)
		{
			return;
		}

		let tmpFields = tmpBuilder.querySelectorAll('.ultravisor-cron-field input');

		if (tmpType === 'daily')
		{
			this.applyCronPreset('daily');
			for (let i = 0; i < tmpFields.length; i++)
			{
				tmpFields[i].disabled = true;
			}
		}
		else if (tmpType === 'hourly')
		{
			this.applyCronPreset('hourly');
			for (let i = 0; i < tmpFields.length; i++)
			{
				tmpFields[i].disabled = true;
			}
		}
		else
		{
			for (let i = 0; i < tmpFields.length; i++)
			{
				tmpFields[i].disabled = false;
			}
		}
	}

	_updateCronExpression()
	{
		let tmpMinute = (document.getElementById('Ultravisor-Cron-Minute') || {}).value || '*';
		let tmpHour = (document.getElementById('Ultravisor-Cron-Hour') || {}).value || '*';
		let tmpDay = (document.getElementById('Ultravisor-Cron-DayOfMonth') || {}).value || '*';
		let tmpMonth = (document.getElementById('Ultravisor-Cron-Month') || {}).value || '*';
		let tmpWeekday = (document.getElementById('Ultravisor-Cron-Weekday') || {}).value || '*';

		let tmpExpression = tmpMinute + ' ' + tmpHour + ' ' + tmpDay + ' ' + tmpMonth + ' ' + tmpWeekday;

		// Update preview elements
		let tmpExprElem = document.getElementById('Ultravisor-Cron-Expression');
		if (tmpExprElem)
		{
			tmpExprElem.textContent = tmpExpression;
		}

		let tmpDescElem = document.getElementById('Ultravisor-Cron-Description');
		if (tmpDescElem)
		{
			tmpDescElem.textContent = this._describeCron(tmpExpression);
		}

		// Update hidden parameter field
		let tmpParamElem = document.getElementById('Ultravisor-Schedule-OperationParameters');
		if (tmpParamElem)
		{
			tmpParamElem.value = tmpExpression;
		}

		// Update raw input if visible
		let tmpRawInput = document.getElementById('Ultravisor-Cron-RawInput');
		if (tmpRawInput && !tmpRawInput.matches(':focus'))
		{
			tmpRawInput.value = tmpExpression;
		}

		// Clear active preset highlight when user edits manually
		this._activePreset = '';
		let tmpButtons = document.querySelectorAll('.ultravisor-cron-preset-btn');
		for (let i = 0; i < tmpButtons.length; i++)
		{
			tmpButtons[i].classList.remove('active');
		}
	}

	_onRawInput()
	{
		let tmpRawInput = document.getElementById('Ultravisor-Cron-RawInput');
		if (!tmpRawInput)
		{
			return;
		}

		let tmpParts = tmpRawInput.value.trim().split(/\s+/);
		if (tmpParts.length >= 5)
		{
			document.getElementById('Ultravisor-Cron-Minute').value = tmpParts[0];
			document.getElementById('Ultravisor-Cron-Hour').value = tmpParts[1];
			document.getElementById('Ultravisor-Cron-DayOfMonth').value = tmpParts[2];
			document.getElementById('Ultravisor-Cron-Month').value = tmpParts[3];
			document.getElementById('Ultravisor-Cron-Weekday').value = tmpParts[4];
		}

		let tmpExpression = tmpRawInput.value.trim();

		let tmpExprElem = document.getElementById('Ultravisor-Cron-Expression');
		if (tmpExprElem)
		{
			tmpExprElem.textContent = tmpExpression;
		}

		let tmpDescElem = document.getElementById('Ultravisor-Cron-Description');
		if (tmpDescElem)
		{
			tmpDescElem.textContent = this._describeCron(tmpExpression);
		}

		let tmpParamElem = document.getElementById('Ultravisor-Schedule-OperationParameters');
		if (tmpParamElem)
		{
			tmpParamElem.value = tmpExpression;
		}
	}

	toggleRawMode()
	{
		this._rawMode = !this._rawMode;

		let tmpRawWrap = document.getElementById('Ultravisor-Cron-RawWrap');
		let tmpToggle = document.querySelector('.ultravisor-cron-raw-toggle');

		if (tmpRawWrap)
		{
			tmpRawWrap.style.display = this._rawMode ? 'block' : 'none';
		}
		if (tmpToggle)
		{
			tmpToggle.textContent = this._rawMode ? 'use builder' : 'edit raw';
		}
	}

	_describeCron(pExpression)
	{
		let tmpParts = pExpression.trim().split(/\s+/);
		if (tmpParts.length < 5)
		{
			return pExpression;
		}

		let tmpMin = tmpParts[0];
		let tmpHour = tmpParts[1];
		let tmpDay = tmpParts[2];
		let tmpMonth = tmpParts[3];
		let tmpWeekday = tmpParts[4];

		let tmpDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

		// Every minute
		if (tmpMin === '*' && tmpHour === '*' && tmpDay === '*' && tmpMonth === '*' && tmpWeekday === '*')
		{
			return 'Every minute';
		}

		// Every N minutes
		let tmpMinStep = tmpMin.match(/^\*\/(\d+)$/);
		if (tmpMinStep && tmpHour === '*' && tmpDay === '*' && tmpMonth === '*' && tmpWeekday === '*')
		{
			return 'Every ' + tmpMinStep[1] + ' minutes';
		}

		// Every hour at :MM
		if (tmpMin !== '*' && tmpHour === '*' && tmpDay === '*' && tmpMonth === '*' && tmpWeekday === '*')
		{
			return 'Every hour at :' + tmpMin.padStart(2, '0');
		}

		// Every N hours
		let tmpHourStep = tmpHour.match(/^\*\/(\d+)$/);
		if (tmpMin !== '*' && tmpHourStep && tmpDay === '*' && tmpMonth === '*' && tmpWeekday === '*')
		{
			return 'Every ' + tmpHourStep[1] + ' hours';
		}

		// Daily at specific time
		if (tmpMin !== '*' && tmpHour !== '*' && tmpDay === '*' && tmpMonth === '*' && tmpWeekday === '*')
		{
			return 'Daily at ' + tmpHour.padStart(2, '0') + ':' + tmpMin.padStart(2, '0');
		}

		// Weekly on specific day
		if (tmpMin !== '*' && tmpHour !== '*' && tmpDay === '*' && tmpMonth === '*' && tmpWeekday !== '*')
		{
			let tmpDayName = tmpDayNames[parseInt(tmpWeekday)] || 'day ' + tmpWeekday;
			return 'Weekly on ' + tmpDayName + ' at ' + tmpHour.padStart(2, '0') + ':' + tmpMin.padStart(2, '0');
		}

		// Monthly on specific day
		if (tmpMin !== '*' && tmpHour !== '*' && tmpDay !== '*' && tmpMonth === '*' && tmpWeekday === '*')
		{
			let tmpSuffix = 'th';
			let tmpDayNum = parseInt(tmpDay);
			if (tmpDayNum === 1 || tmpDayNum === 21 || tmpDayNum === 31) tmpSuffix = 'st';
			else if (tmpDayNum === 2 || tmpDayNum === 22) tmpSuffix = 'nd';
			else if (tmpDayNum === 3 || tmpDayNum === 23) tmpSuffix = 'rd';
			return 'Monthly on the ' + tmpDay + tmpSuffix + ' at ' + tmpHour.padStart(2, '0') + ':' + tmpMin.padStart(2, '0');
		}

		// Fallback
		return pExpression;
	}

	addOperationSchedule()
	{
		let tmpHash = document.getElementById('Ultravisor-Schedule-OperationHash').value.trim();
		let tmpType = document.getElementById('Ultravisor-Schedule-OperationScheduleType').value;
		let tmpParams = document.getElementById('Ultravisor-Schedule-OperationParameters').value.trim();

		if (!tmpHash)
		{
			alert('Please select an operation.');
			return;
		}

		this.pict.PictApplication.scheduleOperation(tmpHash, tmpType, tmpParams,
			function (pError)
			{
				if (pError)
				{
					alert('Error scheduling operation: ' + pError.message);
					return;
				}
				this.pict.PictApplication.showView('Ultravisor-Schedule');
			}.bind(this));
	}

	escapeHTML(pValue)
	{
		if (!pValue) return '';
		return String(pValue).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}
}

module.exports = UltravisorScheduleView;

module.exports.default_configuration = _ViewConfiguration;
