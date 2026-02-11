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
			border-bottom: 1px solid #2a2a4a;
		}
		.ultravisor-schedule-header h1 {
			margin: 0;
			font-size: 2em;
			font-weight: 300;
			color: #e0e0e0;
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
			background-color: #16213e;
		}
		.ultravisor-schedule-table tr:hover td {
			background-color: #1a2744;
		}
		.ultravisor-schedule-active {
			display: inline-block;
			padding: 0.1em 0.5em;
			border-radius: 3px;
			font-size: 0.8em;
			font-weight: 600;
		}
		.ultravisor-schedule-active.yes {
			background-color: #2e7d32;
			color: #c8e6c9;
		}
		.ultravisor-schedule-active.no {
			background-color: #424242;
			color: #9e9e9e;
		}
		.ultravisor-schedule-add-section {
			background: #16213e;
			border: 1px solid #2a2a4a;
			border-radius: 8px;
			padding: 1.5em;
			margin-top: 1em;
		}
		.ultravisor-schedule-add-section h3 {
			margin: 0 0 1em 0;
			font-size: 1.1em;
			font-weight: 600;
			color: #b0bec5;
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
			color: #78909c;
			text-transform: uppercase;
			letter-spacing: 0.03em;
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
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this.pict.PictApplication.loadSchedule(
			function ()
			{
				this.renderScheduleTable();
				this.renderAddForms();
			}.bind(this));

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	renderScheduleTable()
	{
		let tmpSchedule = this.pict.AppData.Ultravisor.Schedule;
		let tmpGlobalRef = '_Pict';

		if (!tmpSchedule || tmpSchedule.length === 0)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-Schedule-Body',
				'<div class="ultravisor-empty-message">No schedule entries. Use the forms below to add tasks or operations to the schedule.</div>');
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

			tmpHTML += '<tr>';
			tmpHTML += '<td><code style="font-size:0.8em;">' + tmpGUID + '</code></td>';
			tmpHTML += '<td>' + (tmpEntry.TargetType || '') + '</td>';
			tmpHTML += '<td><code>' + (tmpEntry.TargetGUID || '') + '</code></td>';
			tmpHTML += '<td><code>' + (tmpEntry.CronExpression || tmpEntry.Parameters || '') + '</code></td>';
			tmpHTML += '<td><span class="ultravisor-schedule-active ' + tmpActive + '">' + (tmpEntry.Active ? 'Active' : 'Inactive') + '</span></td>';
			tmpHTML += '<td>';
			tmpHTML += '<button class="ultravisor-btn-sm ultravisor-btn-delete" onclick="if(confirm(\'Remove schedule entry?\')){ ' + tmpGlobalRef + '.PictApplication.removeScheduleEntry(\'' + tmpEscGUID + '\', function(){ ' + tmpGlobalRef + '.PictApplication.showView(\'Ultravisor-Schedule\'); }); }">Remove</button>';
			tmpHTML += '</td>';
			tmpHTML += '</tr>';
		}

		tmpHTML += '</tbody></table>';
		this.pict.ContentAssignment.assignContent('#Ultravisor-Schedule-Body', tmpHTML);
	}

	renderAddForms()
	{
		let tmpGlobalRef = '_Pict';
		let tmpViewRef = tmpGlobalRef + ".views['Ultravisor-Schedule']";

		let tmpHTML = '';

		// Schedule a task
		tmpHTML += '<div class="ultravisor-schedule-add-section">';
		tmpHTML += '<h3>Schedule a Task</h3>';
		tmpHTML += '<div class="ultravisor-schedule-add-form">';
		tmpHTML += '<div class="ultravisor-form-group"><label>Task GUID</label>';
		tmpHTML += '<input type="text" id="Ultravisor-Schedule-TaskGUID" placeholder="e.g. MY-TASK-001"></div>';
		tmpHTML += '<div class="ultravisor-form-group"><label>Schedule Type</label>';
		tmpHTML += '<select id="Ultravisor-Schedule-TaskScheduleType">';
		tmpHTML += '<option value="cron">Cron</option>';
		tmpHTML += '<option value="daily">Daily</option>';
		tmpHTML += '<option value="hourly">Hourly</option>';
		tmpHTML += '</select></div>';
		tmpHTML += '<div class="ultravisor-form-group"><label>Parameters (cron expression)</label>';
		tmpHTML += '<input type="text" id="Ultravisor-Schedule-TaskParameters" placeholder="e.g. 0 * * * *"></div>';
		tmpHTML += '<button class="ultravisor-btn ultravisor-btn-primary" onclick="' + tmpViewRef + '.addTaskSchedule()">Add</button>';
		tmpHTML += '</div></div>';

		// Schedule an operation
		tmpHTML += '<div class="ultravisor-schedule-add-section" style="margin-top:1em;">';
		tmpHTML += '<h3>Schedule an Operation</h3>';
		tmpHTML += '<div class="ultravisor-schedule-add-form">';
		tmpHTML += '<div class="ultravisor-form-group"><label>Operation GUID</label>';
		tmpHTML += '<input type="text" id="Ultravisor-Schedule-OperationGUID" placeholder="e.g. MY-OP-001"></div>';
		tmpHTML += '<div class="ultravisor-form-group"><label>Schedule Type</label>';
		tmpHTML += '<select id="Ultravisor-Schedule-OperationScheduleType">';
		tmpHTML += '<option value="cron">Cron</option>';
		tmpHTML += '<option value="daily">Daily</option>';
		tmpHTML += '<option value="hourly">Hourly</option>';
		tmpHTML += '</select></div>';
		tmpHTML += '<div class="ultravisor-form-group"><label>Parameters (cron expression)</label>';
		tmpHTML += '<input type="text" id="Ultravisor-Schedule-OperationParameters" placeholder="e.g. 0 */6 * * *"></div>';
		tmpHTML += '<button class="ultravisor-btn ultravisor-btn-primary" onclick="' + tmpViewRef + '.addOperationSchedule()">Add</button>';
		tmpHTML += '</div></div>';

		this.pict.ContentAssignment.assignContent('#Ultravisor-Schedule-AddForms', tmpHTML);
	}

	addTaskSchedule()
	{
		let tmpGUID = document.getElementById('Ultravisor-Schedule-TaskGUID').value.trim();
		let tmpType = document.getElementById('Ultravisor-Schedule-TaskScheduleType').value;
		let tmpParams = document.getElementById('Ultravisor-Schedule-TaskParameters').value.trim();

		if (!tmpGUID)
		{
			alert('Task GUID is required.');
			return;
		}

		this.pict.PictApplication.scheduleTask(tmpGUID, tmpType, tmpParams,
			function (pError)
			{
				if (pError)
				{
					alert('Error scheduling task: ' + pError.message);
					return;
				}
				this.pict.PictApplication.showView('Ultravisor-Schedule');
			}.bind(this));
	}

	addOperationSchedule()
	{
		let tmpGUID = document.getElementById('Ultravisor-Schedule-OperationGUID').value.trim();
		let tmpType = document.getElementById('Ultravisor-Schedule-OperationScheduleType').value;
		let tmpParams = document.getElementById('Ultravisor-Schedule-OperationParameters').value.trim();

		if (!tmpGUID)
		{
			alert('Operation GUID is required.');
			return;
		}

		this.pict.PictApplication.scheduleOperation(tmpGUID, tmpType, tmpParams,
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
}

module.exports = UltravisorScheduleView;

module.exports.default_configuration = _ViewConfiguration;
