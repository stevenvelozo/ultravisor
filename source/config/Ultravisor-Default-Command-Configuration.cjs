let _ModuleRoot = require('path').resolve(__dirname, '..', '..');

module.exports = (
	{
		"UltravisorAPIServerPort": 54321,
		"UltravisorFileStorePath": `${_ModuleRoot}/dist/ultravisor_datastore`,
		"UltravisorStagingRoot": `${_ModuleRoot}/dist/ultravisor_staging`,
		"UltravisorTickIntervalMilliseconds": 60000,
		"UltravisorCommandTimeoutMilliseconds": 300000,
		"UltravisorCommandMaxBufferBytes": 10485760,
		"UltravisorWebInterfacePath": `${_ModuleRoot}/webinterface/dist`,
		"UltravisorOperationLibraryPath": `${_ModuleRoot}/operation-library`,

		// Beacon worker configuration
		"UltravisorBeaconHeartbeatTimeoutMs": 60000,
		"UltravisorBeaconWorkItemTimeoutMs": 300000,
		"UltravisorBeaconAffinityTTLMs": 3600000,
		"UltravisorBeaconPollIntervalMs": 5000,
		"UltravisorBeaconJournalCompactThreshold": 500,

		// Optional non-promiscuous mode. When true, every BeaconRegister
		// must present a JoinSecret that either (a) matches the bootstrap
		// secret below, for the auth beacon's own admission, or (b) is
		// validated by the auth beacon's AUTH_ValidateBeaconJoin action.
		// Default false → behavior identical to pre-auth-beacon ultravisor.
		"UltravisorNonPromiscuous": false,
		"UltravisorBootstrapAuthSecret": ""
	});
