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
		//
		// These opt-ins are deliberately NOT set here, so that state
		// persistence never writes them into operators' .ultravisor.json
		// (see docs/features/beacon-authentication.md):
		//   UltravisorAuthBeaconRejoinViaBootstrap: true lets an auth beacon
		//     whose WebSocket dropped reclaim its own record by presenting
		//     the bootstrap secret again.
		//   UltravisorEphemeralAuthDispatches: true keeps the Settings and
		//     Result of standalone Authentication work items off disk.
		//   UltravisorBeaconWSFrameIdentity: "socket" makes WebSocket
		//     heartbeat and deregister frames act on the socket's own beacon
		//     instead of the BeaconID they name; "warn" only logs mismatches.
		//   UltravisorHTTPBeaconAdmission: "enforce" makes HTTP POST
		//     /Beacon/Register pass the same join admission as the WebSocket
		//     path; "audit" only logs what enforce would refuse.
		//   UltravisorAuthDispatchPinned: true sends the hub's calls to the
		//     auth beacon by that beacon's own Name, not the affinity key
		//     'auth' that any beacon named 'auth' would receive.
		//   UltravisorRefuseAuthenticationDispatch: true refuses Capability
		//     Authentication on the HTTP dispatch routes.
		//   UltravisorBeaconWSWorkFrameIdentity: "socket" makes the hub act on
		//     a work-result frame only when it comes from the item's assigned
		//     beacon's socket; "warn" only logs mismatches. This closes a
		//     forged-completion path, so set it before any public exposure.
		//   UltravisorRedactAuthDispatchSettings: true blanks the Settings and
		//     Result of Authentication work items on GET /Beacon/Work and
		//     GET /Beacon/Queue.
		"UltravisorNonPromiscuous": false,
		"UltravisorBootstrapAuthSecret": ""
	});
