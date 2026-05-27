/**
 * Regression test for the WS-register session-cookie passthrough.
 *
 * Bug history:
 *   _completeBeaconWSRegister used to call coordinator.registerBeacon(pData)
 *   with NO second argument. The Coordinator's registerBeacon defaults
 *   pSessionID to null, so every WS-registered beacon record had
 *   SessionID: null even when the client had authenticated via
 *   /1.0/Authenticate before the WS upgrade. The HTTP register path
 *   (/Beacon/Register) was correctly threading the session through.
 *
 *   Symptom in production: BeaconCoordinator: "reconnected beacon ... with
 *   session [null]" right after the corresponding "User [...] authenticated,
 *   session [...]" log line. UI's beacon-list view filters by session and
 *   hid the unbound beacon; deauth couldn't reach it; per-session work
 *   routing didn't apply.
 *
 *   Fix: capture pRequest's session at HTTP upgrade time, stash on the
 *   WebSocket as _UpgradeSessionID, and pass it to registerBeacon.
 *
 * This file exercises the Coordinator's registerBeacon directly (no HTTP
 * stack required) to lock in the contract: when registerBeacon is called
 * with a SessionID, the beacon record carries it; reconnects update it.
 */

const Assert = require('node:assert/strict');
const libFable = require('fable');
const libCoordinator = require('../source/services/Ultravisor-Beacon-Coordinator.cjs');

suite('WS beacon session passthrough', function ()
{
	let _Coordinator;

	setup(function ()
	{
		let tmpFable = new libFable({ LogStreams: [{ streamtype: 'null' }] });
		tmpFable.serviceManager.addServiceType('UltravisorBeaconCoordinator', libCoordinator);
		_Coordinator = tmpFable.serviceManager.instantiateServiceProvider('UltravisorBeaconCoordinator');
	});

	test('registerBeacon stores SessionID when supplied', function ()
	{
		let tmpBeacon = _Coordinator.registerBeacon(
			{ Name: 'test-beacon-with-session', Capabilities: ['Shell'] },
			'session-abc-123');

		Assert.equal(tmpBeacon.SessionID, 'session-abc-123');
	});

	test('registerBeacon stores SessionID:null when omitted (pre-fix WS path symptom)', function ()
	{
		let tmpBeacon = _Coordinator.registerBeacon(
			{ Name: 'test-beacon-no-session', Capabilities: ['Shell'] });

		Assert.equal(tmpBeacon.SessionID, null);
	});

	test('reconnect updates SessionID from a fresh auth', function ()
	{
		// First register with no session (simulates legacy WS behavior).
		let tmpFirst = _Coordinator.registerBeacon(
			{ Name: 'reconnecting-beacon', Capabilities: ['Shell'] });
		Assert.equal(tmpFirst.SessionID, null);

		// Second register with same name + fresh session (simulates the
		// fixed WS register path running after a reconnect that re-auth'd).
		let tmpSecond = _Coordinator.registerBeacon(
			{ Name: 'reconnecting-beacon', Capabilities: ['Shell'] },
			'fresh-session-xyz');

		Assert.equal(tmpSecond.BeaconID, tmpFirst.BeaconID, 'same beacon reclaimed by Name');
		Assert.equal(tmpSecond.SessionID, 'fresh-session-xyz', 'SessionID refreshed by reconnect');
	});

	test('reconnect with no session does NOT clobber an existing valid session — wait, it does (current behavior)', function ()
	{
		// First register with a real session.
		let tmpFirst = _Coordinator.registerBeacon(
			{ Name: 'session-then-no-session', Capabilities: ['Shell'] },
			'first-session');
		Assert.equal(tmpFirst.SessionID, 'first-session');

		// Second register with no session — current code unconditionally
		// sets SessionID = pSessionID || null, so the existing session
		// gets clobbered. This codifies the existing (debatable) behavior:
		// callers ALWAYS need to send a session on re-register, otherwise
		// they wipe the session bond. With the WS-upgrade-session-capture
		// fix, the WS path now always sends one; with the HTTP path it was
		// already always sending one. So this edge case shouldn't fire in
		// practice — but locking it in test-side keeps the contract honest.
		let tmpSecond = _Coordinator.registerBeacon(
			{ Name: 'session-then-no-session', Capabilities: ['Shell'] });

		Assert.equal(tmpSecond.SessionID, null);
	});
});
