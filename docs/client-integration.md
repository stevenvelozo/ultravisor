# Client integration

If you are building a client (UI, automation, lab harness, retold-labs, IoT-style edge device, anything else) that talks to Ultravisor, this is the page to read first. Ultravisor is designed so the connection-efficient path is the default. A naive HTTP client that ignores everything below will work fine for ~10 ops/min; the moment your traffic shape resembles a real workload, the four pillars below are what keep you on the happy path.

## Required client posture

Phase 4 hardens UV against client misbehavior, but it can't make a misbehaving client *fast*. Adopt all four:

### 1. Use a keep-alive HTTP agent with bounded `maxSockets`

The single biggest cause of mid-burst failures we've seen is a client that opens a fresh TCP connection per request, then exhausts the local ephemeral-port table. macOS gives you ~16K ports total and TIME_WAIT holds each one for 60s after a close — so a sustained ~270 fresh-socket reqs/sec is enough to fill it.

In Node:

```javascript
const libHttp = require('http');
const HTTP_AGENT = new libHttp.Agent({
    keepAlive: true,
    maxSockets: 64,
    keepAliveMsecs: 30000
});

libHttp.request({ hostname, port, path, method, headers, agent: HTTP_AGENT }, ...);
```

Reuse the same agent across the entire process. The pool tops out at `maxSockets` simultaneous connections and Node hands idle sockets back to subsequent requests for 30s.

UV forces `Connection: keep-alive` on every response (see Pillar 4), so any HTTP/1.1 client that respects RFC 9112 §9.3 will get pooled "by accident" — but you should not rely on that. Configure your agent explicitly.

### 2. Use bulk endpoints when N > 1

For every spot in the API where the natural pattern is "do this for each item in a list," there is a bulk endpoint. Use it. Sending N HTTP requests when one would do is the second-biggest source of pain on a busy fleet.

| If you'd otherwise call... | Use instead |
| --- | --- |
| `POST /Operation/:Hash/Execute/Async` × N | `POST /Operation/Execute/Batch` |
| `GET /Manifest/:Hash` × N (small N) | `GET /Manifest?hashes=a,b,c` |
| `GET /Manifest/:Hash` × N (large N) | `POST /Manifest/Batch` `{ Hashes: [...] }` |
| `POST /Beacon/Work/:Hash/Complete` × N | `POST /Beacon/Work/Complete/Batch` |
| `POST /Beacon/Work/:Hash/Progress` × N | `POST /Beacon/Work/Progress/Batch` |

Cap is 256 entries per batch by default. The single-row endpoints stay for the genuine single-row case (UI button, ad-hoc kick).

#### Bulk response shape

Every batch endpoint returns 200 with a body that contains both successes and per-row errors:

```json
{
  "Runs":   [ { "RunHash": "...", "Status": "In Progress" }, ... ],
  "Errors": [ { "Index": 7, "Error": "Operation 'foo' not found" } ]
}
```

A 4xx is reserved for malformed *requests* (no body, body too large, etc.). Per-row failures are reported in `Errors` and do **not** fail the rest of the batch — partial success is the norm, not an exception. **Always check the `Errors` array.** A blind "200 means everything succeeded" implementation will silently lose work.

### 3. Use the event stream — don't poll N manifests in a fan-out loop

Whether you can hold a WebSocket open or not, there is one cursored event stream: `EventGUID` is the cursor, and you can consume it via WS push or HTTP long-poll using the same envelope shape.

#### WebSocket consumers (preferred when you can hold a socket)

Open one WS to `/ws`, send `{Action: "QueueSubscribe", LastEventGUID: <last GUID you saw>}`. UV replays everything since that GUID and then live-streams new envelopes:

```json
{ "Topic": "queue.dispatched", "Payload": {...}, "EventGUID": "...", "Seq": 1234, "EmittedAt": "..." }
```

On reconnect, send the GUID of the last envelope you persisted. UV catches you up. If your GUID has aged out of the ring buffer, you receive `queue.reset { Reason: "history-too-old", LastEventGUID: <yours> }` — fetch `/Observer/Snapshot`, then resubscribe with `LastEventGUID: null`.

#### HTTP long-poll consumers (firewall-restricted, ephemeral, IoT-style)

If you can't hold a WS open, use the HTTP face on the same machinery:

```http
GET /Queue/Events?since=<EventGUID>&limit=500&waitMs=30000
```

UV holds the request open until either a matching event arrives or `waitMs` elapses. Response shape:

```json
{
  "Events": [ <envelope>, <envelope>, ... ],
  "Cursor": "<EventGUID-of-last-returned>",
  "More":   false
}
```

Or `410 Gone` with `{ Reason: "history-too-old", Hint: "fetch /Observer/Snapshot, then resume polling" }` if your `since` is older than the buffer. Same recovery path as the WS `queue.reset` — fetch the snapshot, then resume polling from the latest cursor.

`waitMs=0` is also valid for short-poll: returns immediately with whatever's in the buffer.

`/Observer/Events?since=...&limit=...&waitMs=...` exposes the `observer.*` topic side. Same shape, scoped to observer events.

**Persist the last `Cursor` to local disk.** A process restart should resume from where you left off, not lose events to the ring's GC window.

### 4. Honor `Retry-After` on `429`

Phase 4 admission control: when UV's queue is deep or fleet health is degraded, enqueue routes (`POST /Operation/Execute/Async`, `POST /Operation/Execute/Batch`, `POST /Beacon/Work/Enqueue`) return:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30
Content-Type: application/json

{
  "Error": "Admission denied",
  "Reason": "queued_depth_exceeded",
  "QueuedDepth": 5247,
  "MaxQueuedDepth": 5000,
  "RetryAfterSeconds": 30
}
```

**Wait `Retry-After` seconds, then retry.** A client that ignores 429s and retries immediately will be rate-limited per-IP / per-session by the next layer (200 RPS, burst 500), which is a much harder failure to debug.

Read-only routes (`/Manifest/*`, `/Observer/*`, `/Queue/Events`, `/Beacon/Queue`) never admission-deny — only enqueue routes do.

## Putting it together

A well-behaved Ultravisor client looks like this:

1. One process-wide keep-alive HTTP agent (Pillar 1).
2. Batched enqueue / batched manifest reads (Pillar 2).
3. One subscriber to the event stream (WS or long-poll) — never a manifest fan-out poll loop (Pillar 3).
4. Honors 429 with backoff (Pillar 4).

Following all four, a client can sustain >5K ops/min on a single Mac+Colima deployment without hitting EADDRNOTAVAIL, and gracefully degrades when UV asks it to.
