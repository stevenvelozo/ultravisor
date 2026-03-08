const libCLIProgram = require('pict-service-commandlineutility');
const libFS = require('fs');
const libPath = require('path');

const libServiceHypervisor = require('../services/Ultravisor-Hypervisor.cjs');
const libServiceHypervisorState = require('../services/Ultravisor-Hypervisor-State.cjs');

const libServiceHypervisorEventBase = require('../services/Ultravisor-Hypervisor-Event-Base.cjs');
const libServiceHypervisorEventCron = require('../services/events/Ultravisor-Hypervisor-Event-Cron.cjs');

const libServiceTaskTypeRegistry = require('../services/Ultravisor-TaskTypeRegistry.cjs');
const libServiceStateManager = require('../services/Ultravisor-StateManager.cjs');
const libServiceExecutionEngine = require('../services/Ultravisor-ExecutionEngine.cjs');
const libServiceExecutionManifest = require('../services/Ultravisor-ExecutionManifest.cjs');

// TODO: Remove this when Restify is fixed.
process.removeAllListeners('warning')

const libWebServerAPIServer = require('../web_server/Ultravisor-API-Server.cjs');

// Check for an optional --config / -c command line parameter to load a config file
let _ConfigFileOverride = false;
for (let i = 0; i < process.argv.length; i++)
{
	if ((process.argv[i] === '--config' || process.argv[i] === '-c') && process.argv[i + 1])
	{
		let tmpConfigFilePath = libPath.resolve(process.argv[i + 1]);
		try
		{
			let tmpConfigFileContent = libFS.readFileSync(tmpConfigFilePath, 'utf8');
			_ConfigFileOverride = JSON.parse(tmpConfigFileContent);
		}
		catch (pError)
		{
			console.error(`Error loading configuration file [${tmpConfigFilePath}]: ${pError.message}`);
			process.exit(1);
		}
		break;
	}
}

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

		"DefaultProgramConfiguration": require('../config/Ultravisor-Default-Command-Configuration.cjs'),

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
		require('./commands/Ultravisor-Command-UpdateTask.cjs'),

		// Execute a single operation or task immediately, no matter what
		require('./commands/Ultravisor-Command-SingleOperation.cjs'),
		require('./commands/Ultravisor-Command-SingleTask.cjs'),

		// Start and/or stop the hypervisor, API and web server
		require('./commands/Ultravisor-Command-Start.cjs'),
		require('./commands/Ultravisor-Command-Stop.cjs')
	]);

// Register --config / -c as a known global option so Commander doesn't reject it.
_Ultravisor_Pict.CommandLineUtility.command.option('-c, --config <path>', 'Load configuration from a JSON file');

// If a config file override was passed via --config / -c, apply it on top of the gathered config
if (_ConfigFileOverride)
{
	_Ultravisor_Pict.ProgramConfiguration = Object.assign(_Ultravisor_Pict.ProgramConfiguration || {}, _ConfigFileOverride);
}

// Instantiate the file persistence service
_Ultravisor_Pict.instantiateServiceProvider('FilePersistence');
// Instantiate the data generation service
_Ultravisor_Pict.instantiateServiceProvider('DataGeneration');

// --- Core services ---
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorHypervisor', libServiceHypervisor);
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorHypervisorState', libServiceHypervisorState);

_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorHypervisorEventBase', libServiceHypervisorEventBase);
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorHypervisorEventCron', libServiceHypervisorEventCron);

// --- New engine services ---
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorTaskTypeRegistry', libServiceTaskTypeRegistry);
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorStateManager', libServiceStateManager);
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionEngine', libServiceExecutionEngine);
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionManifest', libServiceExecutionManifest);

// Register built-in task types
let tmpRegistry = Object.values(_Ultravisor_Pict.fable.servicesMap['UltravisorTaskTypeRegistry'])[0];
if (tmpRegistry)
{
	tmpRegistry.registerBuiltInTaskTypes();
}

_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorAPIServer', libWebServerAPIServer);

// ── Service name aliases ────────────────────────────────
// Some CLI commands access services by hyphenated names via this.fable['Name'].
// Bridge the camelCase registration to hyphenated access.
let _Fable = _Ultravisor_Pict.fable;

_Fable['Ultravisor-Hypervisor'] = Object.values(_Fable.servicesMap['UltravisorHypervisor'])[0];
_Fable['Ultravisor-API-Server'] = Object.values(_Fable.servicesMap['UltravisorAPIServer'])[0];

module.exports = _Ultravisor_Pict;
