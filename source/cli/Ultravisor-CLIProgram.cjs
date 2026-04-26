const libCLIProgram = require('pict-service-commandlineutility');
const libFS = require('fs');
const libPath = require('path');

const libServiceHypervisor = require('../services/Ultravisor-Hypervisor.cjs');
const libServiceHypervisorState = require('../services/Ultravisor-Hypervisor-State.cjs');

const libServiceHypervisorEventBase = require('../services/Ultravisor-Hypervisor-Event-Base.cjs');
const libServiceHypervisorEventCron = require('../services/events/Ultravisor-Hypervisor-Event-Cron.cjs');

const libServiceSchedulePersistenceBase = require('../services/Ultravisor-Schedule-Persistence-Base.cjs');
const libServiceSchedulePersistenceJSONFile = require('../services/persistence/Ultravisor-Schedule-Persistence-JSONFile.cjs');

const libServiceTaskTypeRegistry = require('../services/Ultravisor-TaskTypeRegistry.cjs');
const libServiceStateManager = require('../services/Ultravisor-StateManager.cjs');
const libServiceExecutionEngine = require('../services/Ultravisor-ExecutionEngine.cjs');
const libServiceExecutionManifest = require('../services/Ultravisor-ExecutionManifest.cjs');
const libServiceBeaconCoordinator = require('../services/Ultravisor-Beacon-Coordinator.cjs');
const libServiceBeaconReachability = require('../services/Ultravisor-Beacon-Reachability.cjs');
const libServiceBeaconQueueJournal = require('../services/persistence/Ultravisor-Beacon-QueueJournal.cjs');
const libServiceBeaconQueueStore = require('../services/persistence/Ultravisor-Beacon-QueueStore.cjs');
const libServiceBeaconScheduler = require('../services/Ultravisor-Beacon-Scheduler.cjs');
const libServiceBeaconFleetStore = require('../services/persistence/Ultravisor-Beacon-FleetStore.cjs');
const libServiceAuthBeaconBridge = require('../services/Ultravisor-AuthBeaconBridge.cjs');
const libServiceQueuePersistenceBridge = require('../services/Ultravisor-QueuePersistenceBridge.cjs');
const libServiceManifestStoreBridge = require('../services/Ultravisor-ManifestStoreBridge.cjs');
const libServiceDirectoryDistributor = require('../services/Ultravisor-DirectoryDistributor.cjs');
const libServiceFleetManager = require('../services/Ultravisor-FleetManager.cjs');

// TODO: Remove this when Restify is fixed.
process.removeAllListeners('warning')

const libWebServerAPIServer = require('../web_server/Ultravisor-API-Server.cjs');

// Check for an optional --config / -c command line parameter to load a config file
let _ConfigFileOverride = false;
// Check for an optional --logfile / -l command line parameter
let _LogFilePath = false;
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
	}
	if (process.argv[i] === '--logfile' || process.argv[i] === '-l')
	{
		if (process.argv[i + 1] && !process.argv[i + 1].startsWith('-'))
		{
			_LogFilePath = libPath.resolve(process.argv[++i]);
		}
		else
		{
			// Generate a timestamped logfile name
			_LogFilePath = libPath.resolve(`ultravisor-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
		}
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
			].concat(_LogFilePath ? [{
				"loggertype": "simpleflatfile",
				"level": "info",
				"path": _LogFilePath,
				"outputloglinestoconsole": false,
				"outputobjectstoconsole": false
			}] : []),

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

// Register --config / -c and --logfile / -l as known global options so Commander doesn't reject them.
_Ultravisor_Pict.CommandLineUtility.command.option('-c, --config <path>', 'Load configuration from a JSON file');
_Ultravisor_Pict.CommandLineUtility.command.option('-l, --logfile [path]', 'Write logs to a file (auto-generates timestamped name if path omitted)');

if (_LogFilePath)
{
	console.log(`[Ultravisor] Logging to file: ${_LogFilePath}`);
}

// Apply LogNoisiness from RETOLD_LOG_NOISINESS env var. Pict-style log
// noisiness is a 0-5 scale where 0 is silent (production default) and 5 shows
// everything. Diagnostic log statements throughout Ultravisor (especially the
// shared-fs reachability auto-detect path and the platform tasks) are gated
// with `if (this.fable.LogNoisiness >= N)` so they're free at level 0 and
// explosively detailed at level 4-5.
//
// Useful values:
//   1 — high-level decisions (auto-detected shared-fs peer X)
//   2 — entry points and decisions in shared-fs / dispatch paths
//   3 — per-candidate iteration in reachability
//   4 — per-mount comparison details
//   5 — everything
//
// In stack-mode the launcher inherits process.env into the child Ultravisor
// process automatically, so setting RETOLD_LOG_NOISINESS once on the host
// (or in the docker-compose `environment:` block) lights up both processes.
let _LogNoisiness = parseInt(process.env.RETOLD_LOG_NOISINESS, 10);
if (!isNaN(_LogNoisiness) && _LogNoisiness > 0)
{
	_Ultravisor_Pict.LogNoisiness = _LogNoisiness;
	if (_Ultravisor_Pict.fable && _Ultravisor_Pict.fable !== _Ultravisor_Pict)
	{
		_Ultravisor_Pict.fable.LogNoisiness = _LogNoisiness;
	}
	console.log(`[Ultravisor] LogNoisiness=${_LogNoisiness} (verbose diagnostics enabled).`);
}

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

_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorSchedulePersistenceBase', libServiceSchedulePersistenceBase);
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorSchedulePersistence', libServiceSchedulePersistenceJSONFile);

// --- New engine services ---
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorTaskTypeRegistry', libServiceTaskTypeRegistry);
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorStateManager', libServiceStateManager);
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionEngine', libServiceExecutionEngine);
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionManifest', libServiceExecutionManifest);

// Load recent manifests from disk so history persists across restarts
let tmpManifestService = Object.values(_Ultravisor_Pict.fable.servicesMap['UltravisorExecutionManifest'])[0];
if (tmpManifestService)
{
	tmpManifestService.loadRecentManifests(100);
}

// Resume any WaitingForInput operations from previous sessions
// (also marks stale Running operations as Error)
let tmpEngine = Object.values(_Ultravisor_Pict.fable.servicesMap['UltravisorExecutionEngine'])[0];
if (tmpEngine)
{
	tmpEngine.resumeWaitingRuns();
}

// Register built-in task types
let tmpRegistry = Object.values(_Ultravisor_Pict.fable.servicesMap['UltravisorTaskTypeRegistry'])[0];
if (tmpRegistry)
{
	tmpRegistry.registerBuiltInTaskTypes();
}

// --- Beacon coordinator ---
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconCoordinator', libServiceBeaconCoordinator);

// --- Beacon reachability ---
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconReachability', libServiceBeaconReachability);

// --- Beacon queue journal (persistence) ---
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconQueueJournal', libServiceBeaconQueueJournal);
let tmpQueueJournal = Object.values(_Ultravisor_Pict.fable.servicesMap['UltravisorBeaconQueueJournal'])[0];
if (tmpQueueJournal)
{
	tmpQueueJournal.initialize(_Ultravisor_Pict.fable.settings.UltravisorFileStorePath);
}

// --- Beacon queue store (SQLite-backed history + per-item events) ---
// Distinct from the journal above: the journal is a write-ahead log for
// crash recovery of the in-flight queue; the store is a long-lived
// SQLite database that backs the /queue UI's history list and the
// /Beacon/Work/:hash/Events endpoint. Both can coexist — they were
// added in separate generations of the queue work.
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconQueueStore', libServiceBeaconQueueStore);
let tmpQueueStore = Object.values(_Ultravisor_Pict.fable.servicesMap['UltravisorBeaconQueueStore'])[0];
if (tmpQueueStore)
{
	tmpQueueStore.initialize(_Ultravisor_Pict.fable.settings.UltravisorFileStorePath);
}

// Restore persisted work queue from journal (if any)
let tmpCoordinator = Object.values(_Ultravisor_Pict.fable.servicesMap['UltravisorBeaconCoordinator'])[0];
if (tmpCoordinator)
{
	tmpCoordinator.restoreFromJournal();
	tmpCoordinator.loadActionCatalog();
}

// --- Fleet management (per-(beacon, model) install/enable state) ---
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists(
	'UltravisorBeaconFleetStore', libServiceBeaconFleetStore);
let tmpFleetStore = Object.values(_Ultravisor_Pict.fable.servicesMap['UltravisorBeaconFleetStore'])[0];
if (tmpFleetStore)
{
	tmpFleetStore.initialize(_Ultravisor_Pict.fable.settings.UltravisorFileStorePath);
}

_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists(
	'UltravisorDirectoryDistributor', libServiceDirectoryDistributor);

_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists(
	'UltravisorFleetManager', libServiceFleetManager);

// --- Beacon scheduler (queue.* topic broadcasts + dispatch tick) ---
// The scheduler must exist before the APIServer wires its broadcast
// handler — see Ultravisor-API-Server._initializeWebSocket where it
// calls scheduler.setBroadcastHandler(...). After APIServer is up,
// we kick off the dispatch/health/summary timers via .start().
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists(
	'UltravisorBeaconScheduler', libServiceBeaconScheduler);

// --- Auth beacon bridge (consults the optional Authentication-capable
// beacon for session validation + non-promiscuous mode admission). The
// bridge is always installed; it just resolves to "not available" when
// no auth beacon is connected, so the rest of the hub keeps working
// without it. See source/services/Ultravisor-AuthBeaconBridge.cjs and
// the matching ultravisor-auth-beacon module under modules/apps/.
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists(
	'UltravisorAuthBeaconBridge', libServiceAuthBeaconBridge);

// --- Queue persistence bridge (consults the optional QueuePersistence
// beacon for durable queue + event log storage). Like the auth bridge,
// it's always installed and falls back to the in-process
// UltravisorBeaconQueueStore when no beacon is connected. The
// coordinator + scheduler call into the bridge for every persistence
// op; switching to a beacon-backed backend is a runtime decision.
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists(
	'UltravisorQueuePersistenceBridge', libServiceQueuePersistenceBridge);

// --- Manifest store bridge (consults the optional ManifestStore
// beacon for durable execution-manifest storage). Same shape as the
// queue bridge: always installed, falls back to the in-process
// UltravisorExecutionManifest service when no beacon is connected.
// Persistence calls (finalizeExecution, abandonRun) go through this
// bridge instead of directly writing JSON files.
_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists(
	'UltravisorManifestStoreBridge', libServiceManifestStoreBridge);

_Ultravisor_Pict.fable.addAndInstantiateServiceTypeIfNotExists('UltravisorAPIServer', libWebServerAPIServer);

// Kick the scheduler timers AFTER the API server has wired
// setBroadcastHandler — otherwise the first summary tick has nowhere
// to fan out to and is silently dropped.
let tmpScheduler = Object.values(_Ultravisor_Pict.fable.servicesMap['UltravisorBeaconScheduler'])[0];
if (tmpScheduler && typeof tmpScheduler.start === 'function')
{
	tmpScheduler.start();
}

// ── Service name aliases ────────────────────────────────
// Some CLI commands access services by hyphenated names via this.fable['Name'].
// Bridge the camelCase registration to hyphenated access.
let _Fable = _Ultravisor_Pict.fable;

_Fable['Ultravisor-Hypervisor'] = Object.values(_Fable.servicesMap['UltravisorHypervisor'])[0];
_Fable['Ultravisor-API-Server'] = Object.values(_Fable.servicesMap['UltravisorAPIServer'])[0];

module.exports = _Ultravisor_Pict;
