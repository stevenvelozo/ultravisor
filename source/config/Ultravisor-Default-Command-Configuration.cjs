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
		"UltravisorBeaconPollIntervalMs": 5000
	});
