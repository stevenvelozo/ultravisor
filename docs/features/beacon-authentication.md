# Beacon Authentication

## Overview

Ultravisor uses Orator Authentication to manage beacon identity and connectivity. Beacons authenticate with the server before registering, receive a session cookie, and use it on all subsequent requests. If a session expires or the server restarts, beacons automatically re-authenticate and re-register — eliminating "unknown beacon" errors and providing graceful reconnection.

## Architecture

### Session-Based Identity

Rather than a custom identity scheme, beacons use Orator's cookie-based session system:

```
Beacon Client                          Ultravisor Server
    │                                        │
    │  POST /1.0/Authenticate                │
    │  { UserName: "gpu-worker-1" }          │
    │───────────────────────────────────────▸ │
    │                                        │  Create session
    │  ◂─── 200 { LoggedIn: true }           │  Set-Cookie: SessionID=<uuid>
    │                                        │
    │  POST /Beacon/Register                 │
    │  Cookie: SessionID=<uuid>              │
    │  { Capabilities, MaxConcurrent, Tags } │
    │───────────────────────────────────────▸ │
    │                                        │  Create/reclaim beacon record
    │  ◂─── 200 { BeaconID: "bcn-..." }      │  Associate with session
    │                                        │
    │  POST /Beacon/Work/Poll                │
    │  Cookie: SessionID=<uuid>              │  (every 5s)
    │───────────────────────────────────────▸ │
    │                                        │  Validate session → OK
    │  ◂─── 200 { WorkItem } or null         │
    │                                        │
```

### Separation of Concerns

- **Orator Authentication** handles identity: sessions, cookies, credential verification
- **Beacon Coordinator** handles capabilities: registration, work dispatch, affinity, timeouts
- A beacon record stores both its `BeaconID` (coordinator identity) and `SessionID` (auth identity)

## Reconnection Protocol

When a session becomes invalid (server restart, session expiry, network interruption), the beacon detects a 401 response and automatically reconnects:

```
1. Any HTTP request returns 401
2. Client sets _Authenticating flag (prevents concurrent reconnects)
3. Clear poll and heartbeat intervals
4. Clear stale session cookie
5. POST /1.0/Authenticate (get fresh session)
6. POST /Beacon/Register (coordinator reclaims offline beacon or creates new)
7. Restart poll and heartbeat intervals
8. On failure: retry in 10 seconds
```

### Beacon Reclamation

When a beacon re-registers with the same `Name` after reconnection, the coordinator checks for an existing beacon record with `Status: 'Offline'`. If found, it **reclaims** the existing record:

- Same `BeaconID` is preserved
- Affinity bindings remain intact
- SessionID is updated to the new session
- Status is set back to `Online`

This avoids duplicate beacon entries and preserves work routing continuity.

## Configuration

### Server-Side

In Ultravisor settings:

```json
{
  "UltravisorBeaconSessionTTLMs": 86400000
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `UltravisorBeaconSessionTTLMs` | `86400000` (24h) | Session time-to-live in milliseconds |

The default authenticator accepts any username with any (or empty) password. This allows beacons to connect without credential management. To require credentials, set a custom authenticator on the OratorAuthentication service.

### Client-Side

In `.ultravisor-beacon.json`:

```json
{
  "Name": "gpu-worker-1",
  "Password": "",
  "ServerURL": "http://localhost:54321",
  "Capabilities": ["Shell", "FileSystem"],
  "MaxConcurrent": 4,
  "PollIntervalMs": 5000,
  "HeartbeatIntervalMs": 30000
}
```

CLI options:

```
node Ultravisor-Beacon-CLI.cjs --password <password>
```

| Option | Config Key | Default | Description |
|--------|-----------|---------|-------------|
| `--password` | `Password` | `""` | Password for authentication |
| `--name` | `Name` | `"beacon-worker"` | Beacon name (used as username) |
| `--server` | `ServerURL` | `"http://localhost:54321"` | Server URL |

## Security Model

### Graduated Security

The system is designed for incremental security hardening:

**Level 0 — Open (default):**
No credentials required. Any beacon name is accepted. Suitable for development and trusted networks.

**Level 1 — Shared secret:**
Set a custom authenticator that checks passwords against a configured secret or API key list:

```javascript
tmpAuth.setAuthenticator((pUsername, pPassword, fCallback) =>
{
    if (pPassword === process.env.BEACON_SECRET)
    {
        return fCallback(null, { LoginID: pUsername, IDUser: 0 });
    }
    return fCallback(null, null);
});
```

**Level 2 — Per-beacon credentials:**
Validate each beacon's name and password against a database or config:

```javascript
tmpAuth.setAuthenticator((pUsername, pPassword, fCallback) =>
{
    let tmpBeaconCreds = loadBeaconCredentials();
    let tmpRecord = tmpBeaconCreds[pUsername];
    if (tmpRecord && tmpRecord.Password === pPassword)
    {
        return fCallback(null, { LoginID: pUsername, IDUser: tmpRecord.ID });
    }
    return fCallback(null, null);
});
```

**Level 3 — OAuth/OIDC:**
For beacons on remote networks, use Orator Authentication's built-in OIDC provider to authenticate against an identity provider (Azure AD, Okta, etc.).

## HTTP Endpoints

### Authentication (provided by Orator Authentication)

| Method | Path | Auth Required | Description |
|--------|------|--------------|-------------|
| POST | `/1.0/Authenticate` | No | Authenticate with username/password, receive session cookie |
| GET | `/1.0/CheckSession` | Cookie | Validate current session |
| GET | `/1.0/Deauthenticate` | Cookie | End session |

### Beacon (all require valid session cookie)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/Beacon/Register` | Register beacon, associate with session |
| GET | `/Beacon` | List all beacons |
| GET | `/Beacon/:BeaconID` | Get specific beacon |
| DELETE | `/Beacon/:BeaconID` | Deregister beacon |
| POST | `/Beacon/:BeaconID/Heartbeat` | Send heartbeat |
| POST | `/Beacon/Work/Poll` | Poll for work items |
| POST | `/Beacon/Work/:WorkItemHash/Complete` | Report work completion |
| POST | `/Beacon/Work/:WorkItemHash/Error` | Report work failure |
| POST | `/Beacon/Work/:WorkItemHash/Progress` | Report progress |
| POST | `/Beacon/Work/Dispatch` | Direct synchronous dispatch |
| GET | `/Beacon/Work` | List all work items |
| GET | `/Beacon/Affinity` | List affinity bindings |
| GET | `/Beacon/Capabilities` | List available capabilities |

## Implementation Details

### Files

| File | Role |
|------|------|
| `source/web_server/Ultravisor-API-Server.cjs` | Initializes OratorAuthentication, guards beacon endpoints with session validation |
| `source/services/Ultravisor-Beacon-Coordinator.cjs` | Stores SessionID on beacon records, supports reconnection via name-based lookup |
| `source/beacon/Ultravisor-Beacon-Client.cjs` | Authenticates before registering, sends cookies, detects 401, reconnects automatically |
| `source/beacon/Ultravisor-Beacon-CLI.cjs` | Accepts `--password` CLI option |

### Session Lifecycle

1. **Creation:** Beacon POSTs to `/1.0/Authenticate` → session created in-memory Map → `Set-Cookie` header returned
2. **Validation:** Every beacon request → `getSessionForRequest()` parses cookie, looks up session, checks TTL, updates `LastAccess`
3. **Expiry:** Session TTL exceeded (default 24h) → next request returns 401 → beacon reconnects
4. **Server restart:** All sessions lost (in-memory) → all beacons get 401 → all reconnect automatically

### Timeout Interactions

- **Poll interval (5s):** Each poll validates the session, keeping `LastAccess` current. Sessions stay alive as long as the beacon is polling.
- **Heartbeat interval (30s):** Also validates session. Redundant with poll but provides a safety net.
- **Beacon heartbeat timeout (60s):** Coordinator marks beacon `Offline` if no poll or heartbeat received. Happens independently of session expiry.
- **Session TTL (24h):** Much longer than heartbeat timeout. A beacon goes `Offline` long before its session expires.
- **Work item timeout (5m default):** If a beacon disconnects mid-work, the coordinator times out the work item independently.
