const libCLIProgram = require('pict-service-commandlineutility');

const libServiceHypervisor = require(`../services/Ultravisor-Hypervisor.cjs`);

const libServiceHypervisorEventBase = require(`../services/Ultravisor-Hypervisor-Event-Base.cjs`);
const libServiceHypervisorEventCron = require(`../services/events/Ultravisor-Hypervisor-Event-Cron.cjs`);
const libServiceHypervisorEventSolver = require(`../services/events/Ultravisor-Hypervisor-Event-Solver.cjs`);

const libServiceOperation = require(`../services/Ultravisor-Operation.cjs`);
const libServiceOperationManifest = require(`../services/Ultravisor-Operation-Manifest.cjs`);

const libServiceTask = require(`../services/Ultravisor-Task.cjs`);

// TODO: Remove this when Restify is fixed.
process.removeAllListeners('warning')

const libWebServerAPIServer = require(`../web_server/Ultravisor-API-Server.cjs`);

let _Ultravisor_Pict = new libCLIProgram(
	{
		"Product": "Ultravisor-CLI",
		"Version": require('../../package.json').version,
		"Description": require('../../package.json').description,

		"Package": require('../../package.json'),

		"LogStreams":
			[
				{
					"level": "trace",
					"streamtype": "process.stdout"
				}
			],

		"Command": "ultravisor",

		"DefaultProgramConfiguration": require(`../config/Ultravisor-Default-Command-Configuration.cjs`),

		"ProgramConfigurationFileName": ".ultravisor.json",

		"AutoGatherProgramConfiguration": true,
		"AutoAddConfigurationExplanationCommand": true
	},
	[
		// Display the current ultravisor schedule
		require('./commands/Ultravisor-Command-ScheduleView.cjs'),

		// Add a task or operation to the current ultravisor schedule
		require('./commands/Ultravisor-Command-ScheduleOperation.cjs'),
		require('./commands/Ultravisor-Command-ScheduleTask.cjs'),

		// Execute a single operation or task immediately, no matter what
		require('./commands/Ultravisor-Command-SingleOperation.cjs'),
		require('./commands/Ultravisor-Command-SingleTask.cjs'),

		// Start and/or stop the hypervisor, API and web server
		require('./commands/Ultravisor-Command-Start.cjs'),
		require('./commands/Ultravisor-Command-Stop.cjs')
	]);

// Instantiate the file persistence service
_Ultravisor_Pict.instantiateServiceProvider('FilePersistence');
// Instantiate the data generation service
_Ultravisor_Pict.instantiateServiceProvider('DataGeneration');

_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('Ultravisor-Hypervisor', libServiceHypervisor);

_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('Ultravisor-Hypervisor-Event-Base', libServiceHypervisorEventBase);
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('Ultravisor-Hypervisor-Event-Cron', libServiceHypervisorEventCron);
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('Ultravisor-Hypervisor-Event-Solver', libServiceHypervisorEventSolver);

_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('Ultravisor-Operation', libServiceOperation);
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('Ultravisor-Operation-Manifest', libServiceOperationManifest);

_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('Ultravisor-Task', libServiceTask);

_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('Ultravisor-API-Server', libWebServerAPIServer);

module.exports = _Ultravisor_Pict;
