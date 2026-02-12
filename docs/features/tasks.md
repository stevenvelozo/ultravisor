# Tasks

Tasks are the fundamental unit of work in Ultravisor. Each task represents a
single executable action: a shell command, an HTTP request, or another
supported task type.

## Task Model

Every task requires at minimum a `GUIDTask`. All other fields are optional
but recommended.

```json
{
    "GUIDTask": "my-task-001",
    "Code": "MY_TASK",
    "Name": "My First Task",
    "Type": "Command",
    "Command": "echo hello world",
    "Parameters": "",
    "Description": "A simple echo task for testing.",
    "onBefore": [],
    "onCompletion": [],
    "onSubsequent": [],
    "onFailure": [],
    "onError": []
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `GUIDTask` | Yes | Unique identifier for the task |
| `Code` | No | Short code identifier |
| `Name` | No | Human-readable name |
| `Type` | No | Execution type (defaults to `Command`) |
| `Command` | No | Shell command to run (for Command type) |
| `Parameters` | No | Fallback for Command, or type-specific parameters |
| `Description` | No | Markdown description of the task |
| `URL` | No | Target URL (for Request type) |
| `Method` | No | HTTP method (for Request type, defaults to `GET`) |
| `onBefore` | No | Array of task GUIDs to execute before the core task |
| `onCompletion` | No | Array of task GUIDs to execute after a successful core task |
| `onFailure` | No | Array of task GUIDs to execute after a failed core task |
| `onError` | No | Array of task GUIDs to execute after a core task error |
| `onSubsequent` | No | Array of task GUIDs to always execute after the core task |
| `Destination` | No | Manyfest address in GlobalState for task output (see [Destination](#destination)) |
| `Persist` | No | Store task output to state or file (see [Persist](#persist)) |
| `Pattern` | No | Regular expression string (for LineMatch type) |
| `Flags` | No | Regex flags (for LineMatch type) |
| `Separator` | No | Split delimiter (for LineMatch type, defaults to newline) |

## Task Types

### Command

Executes a shell command via `child_process.exec`. The command string is
taken from the `Command` field, falling back to `Parameters` if `Command`
is not set.

```json
{
    "GUIDTask": "list-files",
    "Name": "List Files in Home",
    "Type": "Command",
    "Command": "ls -la ~/"
}
```

Default execution limits (configurable in `.ultravisor.json`):
- Timeout: 5 minutes (300,000 ms) — `UltravisorCommandTimeoutMilliseconds`
- Max output buffer: 10 MB — `UltravisorCommandMaxBufferBytes`

### Request

Executes an HTTP request. The URL is taken from `URL`, falling back to
`Parameters`. Method defaults to `GET`.

| Field | Required | Description |
|-------|----------|-------------|
| `URL` | Yes | Endpoint to request (falls back to `Parameters`) |
| `Method` | No | HTTP method (defaults to `GET`) |
| `Persist` | No | Where to store the response (see [Persist](#persist)) |

```json
{
    "GUIDTask": "fetch-weather",
    "Name": "Fetch Weather Data",
    "Type": "Request",
    "URL": "https://api.weather.example/current",
    "Method": "GET"
}
```

Request tasks use `curl` under the hood, so curl must be available on the
system.

### ListFiles

Lists files and directories in the staging folder (or a sub-path within it).
Returns an array of file entries with name, size, type and modification time.

| Field | Required | Description |
|-------|----------|-------------|
| `Path` | No | Sub-directory within the staging folder to list |

```json
{
    "GUIDTask": "list-output",
    "Name": "List Output Files",
    "Type": "ListFiles",
    "Path": "reports"
}
```

Output is a JSON array of entries:

```json
[
    { "Name": "report-2026-02.csv", "Size": 14320, "IsDirectory": false, "Modified": "2026-02-10T08:30:00.000Z" },
    { "Name": "archive", "Size": 4096, "IsDirectory": true, "Modified": "2026-02-09T12:00:00.000Z" }
]
```

### WriteJSON

Serialises an object as pretty-printed JSON and writes it to a file in the
staging folder. Creates intermediate directories automatically.

| Field | Required | Description |
|-------|----------|-------------|
| `File` | Yes | Relative path inside the staging folder |
| `Data` | * | Object or value to serialise as JSON |
| `Address` | * | Dot-notation path into GlobalState to resolve the data to write |

\* Either `Data` or `Address` must be provided. When `Address` is set,
the data is resolved from `pContext.GlobalState` (useful when a previous
task stored its output in the shared state via `Destination`).

```json
{
    "GUIDTask": "save-config",
    "Name": "Save Processed Config",
    "Type": "WriteJSON",
    "File": "output/processed-config.json",
    "Data": {
        "version": 3,
        "features": ["scheduling", "manifests"],
        "enabled": true
    }
}
```

Using `Address` to write data from a previous task's output:

```json
{
    "GUIDTask": "save-api-response",
    "Name": "Save API Response",
    "Type": "WriteJSON",
    "File": "snapshots/api-response.json",
    "Address": "APIData.Users"
}
```

### WriteText

Writes a plain text string to a file in the staging folder.
Creates intermediate directories automatically.

| Field | Required | Description |
|-------|----------|-------------|
| `File` | Yes | Relative path inside the staging folder |
| `Data` | * | String content to write |
| `Address` | * | Dot-notation path into GlobalState to resolve the text to write |

\* Either `Data` or `Address` must be provided. When `Address` is set,
the text is resolved from `pContext.GlobalState`.

```json
{
    "GUIDTask": "write-log",
    "Name": "Write Status Log",
    "Type": "WriteText",
    "File": "logs/pipeline-status.log",
    "Data": "Pipeline completed at 2026-02-10T12:00:00Z\nAll tasks succeeded."
}
```

### ReadJSON

Reads a JSON file from the staging folder, parses it and returns the
parsed object in `Output`.

| Field | Required | Description |
|-------|----------|-------------|
| `File` | Yes | Relative path inside the staging folder |
| `Destination` | No | Manyfest address in GlobalState (defaults to `"Output"`) |

```json
{
    "GUIDTask": "load-config",
    "Name": "Load Config",
    "Type": "ReadJSON",
    "File": "config/pipeline.json"
}
```

The parsed JSON is available in `pManifestEntry.Output` as a serialised
JSON string.

### ReadText

Reads a text file from the staging folder and returns its content in
`Output`.

| Field | Required | Description |
|-------|----------|-------------|
| `File` | Yes | Relative path inside the staging folder |
| `Destination` | No | Manyfest address in GlobalState (defaults to `"Output"`) |

```json
{
    "GUIDTask": "read-template",
    "Name": "Read Email Template",
    "Type": "ReadText",
    "File": "templates/notification.txt"
}
```

### WriteXML

Writes an XML string to a file in the staging folder.
Creates intermediate directories automatically. No XML validation is
performed — the caller is responsible for providing well-formed XML.

| Field | Required | Description |
|-------|----------|-------------|
| `File` | Yes | Relative path inside the staging folder |
| `Data` | * | XML string content to write |
| `Address` | * | Dot-notation path into GlobalState to resolve the XML to write |

\* Either `Data` or `Address` must be provided. When `Address` is set,
the XML content is resolved from `pContext.GlobalState`.

```json
{
    "GUIDTask": "write-config-xml",
    "Name": "Write Config XML",
    "Type": "WriteXML",
    "File": "config/settings.xml",
    "Data": "<?xml version=\"1.0\"?>\n<settings>\n  <timeout>30</timeout>\n  <retries>3</retries>\n</settings>"
}
```

### ReadXML

Reads an XML file from the staging folder and returns its content as a
raw string in `Output`. No XML parsing is performed — the caller is
responsible for interpreting the XML structure.

| Field | Required | Description |
|-------|----------|-------------|
| `File` | Yes | Relative path inside the staging folder |
| `Destination` | No | Manyfest address in GlobalState (defaults to `"Output"`) |

```json
{
    "GUIDTask": "load-config-xml",
    "Name": "Load Config XML",
    "Type": "ReadXML",
    "File": "config/settings.xml"
}
```

### ReadBinary

Reads a binary file from the staging folder and returns it as a Buffer.
The byte count is reported in `Output`.

| Field | Required | Description |
|-------|----------|-------------|
| `File` | Yes | Relative path inside the staging folder |
| `Destination` | No | Manyfest address in GlobalState, stored as base64 (defaults to `"Output"`) |
| `Persist` | No | Where to store the result (see [Persist](#persist)) |

```json
{
    "GUIDTask": "read-image",
    "Name": "Read Image File",
    "Type": "ReadBinary",
    "File": "assets/logo.png"
}
```

When persisting to a state address, the binary data is stored as a
base64-encoded string. When persisting to a file, the raw bytes are
written directly.

### WriteBinary

Writes binary data to a file in the staging folder. Creates intermediate
directories automatically.

| Field | Required | Description |
|-------|----------|-------------|
| `File` | Yes | Relative path inside the staging folder |
| `Data` | Yes | Data to write -- Buffer, base64 string, or array of byte values |

```json
{
    "GUIDTask": "write-thumbnail",
    "Name": "Write Thumbnail",
    "Type": "WriteBinary",
    "File": "thumbnails/frame-001.png",
    "Data": "iVBORw0KGgo..."
}
```

`Data` accepts three formats:

- **Buffer** -- written directly as binary
- **String** -- treated as base64-encoded and decoded before writing
- **Array** -- treated as an array of byte values (e.g. `[0xFF, 0xD8, 0xFF, 0xE0]`)

### CopyFile

Copies a file from the local filesystem into the staging folder. This is
useful for importing external files (logs, configuration, data exports)
into an operation's staging area for further processing by subsequent tasks.
Creates intermediate directories in the destination path automatically.

| Field | Required | Description |
|-------|----------|-------------|
| `Source` | * | Absolute path to the local file to copy |
| `Address` | * | Dot-notation path into GlobalState containing the source path |
| `File` | Yes | Relative destination path inside the staging folder |

\* Either `Source` or `Address` must be provided. When `Address` is set,
the source path is resolved from `pContext.GlobalState` (or `NodeState`).

```json
{
    "GUIDTask": "import-config",
    "Name": "Import External Config",
    "Type": "CopyFile",
    "Source": "/etc/myapp/config.json",
    "File": "imported/config.json"
}
```

Use `Address` to copy a file whose path was determined by a previous task:

```json
{
    "GUIDTask": "import-dynamic",
    "Name": "Import Dynamic File",
    "Type": "CopyFile",
    "Address": "DiscoveredFilePath",
    "File": "imports/data.csv"
}
```

The source must be an existing regular file (not a directory). Path
traversal is blocked in the destination — file paths containing `..`
are rejected.

### GetJSON

Performs a native HTTP/HTTPS GET request and parses the response body as
JSON. Uses Node.js built-in `http`/`https` modules (no curl dependency).

| Field | Required | Description |
|-------|----------|-------------|
| `URL` | Yes | Endpoint to request |
| `Headers` | No | Object of additional request headers |
| `Destination` | No | Manyfest address in GlobalState (defaults to `"Output"`) |
| `Persist` | No | Where to store the parsed response (see [Persist](#persist)) |

```json
{
    "GUIDTask": "fetch-api-data",
    "Name": "Fetch API Data",
    "Type": "GetJSON",
    "URL": "https://api.example.com/v1/status",
    "Headers": {
        "Authorization": "Bearer abc123"
    }
}
```

The parsed JSON response is available in `pManifestEntry.Output`. If the
response body is not valid JSON the task will error.

### GetBinary

Performs a native HTTP/HTTPS GET request and collects the response as a
binary Buffer. Uses Node.js built-in `http`/`https` modules (no curl
dependency). The byte count is reported in `Output`.

| Field | Required | Description |
|-------|----------|-------------|
| `URL` | Yes | Endpoint to request |
| `Headers` | No | Object of additional request headers |
| `Destination` | No | Manyfest address in GlobalState, stored as base64 (defaults to `"Output"`) |
| `Persist` | No | Where to store the result (see [Persist](#persist)) |

```json
{
    "GUIDTask": "download-image",
    "Name": "Download Product Image",
    "Type": "GetBinary",
    "URL": "https://cdn.example.com/images/product-001.png",
    "Persist": { "File": "downloads/product-001.png" }
}
```

When persisting to a state address, the binary data is stored as a
base64-encoded string. When persisting to a file, the raw bytes are
written directly.

### GetText

Performs a native HTTP/HTTPS GET request and returns the response body as
plain text. Uses Node.js built-in `http`/`https` modules (no curl dependency).

| Field | Required | Description |
|-------|----------|-------------|
| `URL` | Yes | Endpoint to request |
| `Headers` | No | Object of additional request headers |
| `Destination` | No | Manyfest address in GlobalState (defaults to `"Output"`) |
| `Persist` | No | Where to store the response text (see [Persist](#persist)) |

```json
{
    "GUIDTask": "fetch-readme",
    "Name": "Fetch README",
    "Type": "GetText",
    "URL": "https://raw.githubusercontent.com/example/repo/main/README.md",
    "Persist": "Files.ReadmeContent"
}
```

The raw response text is available in `pManifestEntry.Output`. The
`Accept` header defaults to `text/plain` but can be overridden via the
`Headers` field.

### GetXML

Performs a native HTTP/HTTPS GET request and returns the response body as
raw XML text. Uses Node.js built-in `http`/`https` modules (no curl
dependency). No XML parsing is performed — the caller is responsible
for interpreting the XML structure.

| Field | Required | Description |
|-------|----------|-------------|
| `URL` | Yes | Endpoint to request |
| `Headers` | No | Object of additional request headers |
| `Destination` | No | Manyfest address in GlobalState (defaults to `"Output"`) |
| `Persist` | No | Where to store the response XML (see [Persist](#persist)) |

```json
{
    "GUIDTask": "fetch-feed",
    "Name": "Fetch RSS Feed",
    "Type": "GetXML",
    "URL": "https://blog.example.com/feed.xml",
    "Persist": { "File": "feeds/blog-feed.xml" }
}
```

The raw XML string is available in `pManifestEntry.Output`. The `Accept`
header defaults to `application/xml, text/xml` but can be overridden via
the `Headers` field.

### SendJSON

Sends JSON data to a REST URL using any HTTP method. Defaults to POST.
Uses Node.js built-in `http`/`https` modules (no curl dependency).

| Field | Required | Description |
|-------|----------|-------------|
| `URL` | Yes | Endpoint to request |
| `Method` | No | HTTP method (defaults to `POST`) |
| `Data` | No | Object to serialise and send as the request body |
| `Headers` | No | Object of additional request headers |
| `Persist` | No | Where to store the response (see [Persist](#persist)) |

```json
{
    "GUIDTask": "push-metrics",
    "Name": "Push Metrics to Dashboard",
    "Type": "SendJSON",
    "URL": "https://dashboard.example.com/api/metrics",
    "Method": "POST",
    "Data": {
        "source": "ultravisor",
        "cpu": 42.5,
        "memory": 1024
    },
    "Headers": {
        "X-API-Key": "secret-key"
    }
}
```

PUT, PATCH and DELETE are also supported:

```json
{
    "GUIDTask": "update-record",
    "Name": "Update Record",
    "Type": "SendJSON",
    "URL": "https://api.example.com/records/12345",
    "Method": "PUT",
    "Data": { "status": "archived" }
}
```

### RestRequest

A generic, fully configurable REST client task. Supports any HTTP method,
custom headers, request body, cookies and a shared cookie jar that
persists across tasks in an operation. This is the go-to task type when
the specialised Get/Send types are too restrictive.

| Field | Required | Description |
|-------|----------|-------------|
| `URL` | Yes | Endpoint to request |
| `Method` | No | HTTP method (defaults to `GET`) |
| `Body` | No | Request body -- object (serialised as JSON) or string |
| `ContentType` | No | `Content-Type` header value (auto-set to `application/json` when `Body` is an object) |
| `Headers` | No | Object of additional request headers |
| `Cookies` | No | Object of cookie name/value pairs to send |
| `StoreCookies` | No | Whether to capture `Set-Cookie` response headers (default: `true`) |
| `CaptureToken` | No | Extract a value from the JSON response body into the cookie jar (see [CaptureToken](#capturetoken)) |
| `CaptureHeader` | No | Extract response header values into GlobalState (see [CaptureHeader](#captureheader)) |
| `Destination` | No | Manyfest address in GlobalState (defaults to `"Output"`) |
| `Persist` | No | Where to store the response (see [Persist](#persist)) |
| `Retries` | No | Number of retry attempts on failure (default: `0`; see [Retries](#retries)) |

The result stored at `Destination` (and in `pManifestEntry.Output`) is a
structured object:

```json
{
    "StatusCode": 200,
    "Headers": { "content-type": "application/json", "..." : "..." },
    "Body": "raw response text",
    "JSON": { "parsed": "object if valid JSON" }
}
```

The `JSON` field is only present when the response body is valid JSON.

#### Shared Cookie Jar

When a response includes `Set-Cookie` headers, the name/value pairs are
automatically parsed and stored at `pContext.GlobalState.Cookies`. Every
subsequent `RestRequest` task running in the same operation will
automatically include those cookies in its request — no extra
configuration needed.

Task-level `Cookies` merge on top of the shared jar, so explicit values
override jar values for that specific request without modifying the jar
itself.

Set `StoreCookies` to `false` to prevent a task from capturing response
cookies (the shared jar is still sent).

```json
{
    "GUIDTask": "api-login",
    "Name": "API Login",
    "Type": "RestRequest",
    "URL": "https://api.example.com/auth/login",
    "Method": "POST",
    "Body": {
        "username": "admin",
        "password": "secret"
    },
    "Destination": "LoginResponse"
}
```

After this task, `GlobalState.Cookies` will contain any session cookies
set by the server. A follow-up task automatically includes them:

```json
{
    "GUIDTask": "api-data",
    "Name": "Fetch Protected Data",
    "Type": "RestRequest",
    "URL": "https://api.example.com/data",
    "Destination": "ProtectedData"
}
```

#### Sending non-JSON bodies

Use `Body` as a string with a custom `ContentType` to send XML, form
data, or any other format:

```json
{
    "GUIDTask": "post-xml",
    "Name": "Post XML Payload",
    "Type": "RestRequest",
    "URL": "https://api.example.com/ingest",
    "Method": "POST",
    "Body": "<?xml version=\"1.0\"?><data><value>42</value></data>",
    "ContentType": "application/xml"
}
```

#### Overriding jar cookies

```json
{
    "GUIDTask": "impersonate",
    "Name": "Impersonate User",
    "Type": "RestRequest",
    "URL": "https://api.example.com/profile",
    "Cookies": { "session": "override-token" }
}
```

The `session` cookie in the jar is overridden for this request only.

#### CaptureToken

Many APIs return session tokens in the JSON response body rather than
via `Set-Cookie` headers. `CaptureToken` extracts a value from the
parsed JSON response and stores it in `GlobalState.Cookies` so that
subsequent `RestRequest` tasks automatically send it as a cookie.

`CaptureToken` accepts two forms:

**String** -- a dot-notation path into the JSON response body. The
resolved value is stored as a cookie named `"Token"`:

```json
{
    "GUIDTask": "login",
    "Type": "RestRequest",
    "URL": "https://api.example.com/auth",
    "Method": "POST",
    "Body": { "user": "admin", "pass": "secret" },
    "CaptureToken": "SessionToken"
}
```

If the response body is `{"SessionToken": "abc123"}`, then
`GlobalState.Cookies.Token` is set to `"abc123"` and all subsequent
`RestRequest` tasks will send `Cookie: Token=abc123`.

**Object** -- with `Address` (dot-notation path) and `Cookie` (cookie
name to store the value under):

```json
{
    "GUIDTask": "login",
    "Type": "RestRequest",
    "URL": "https://api.example.com/auth",
    "Method": "POST",
    "Body": { "user": "admin", "pass": "secret" },
    "CaptureToken": {
        "Address": "Session.ID",
        "Cookie": "SessionID"
    }
}
```

If the response body is `{"Session": {"ID": "xyz789"}}`, then
`GlobalState.Cookies.SessionID` is set to `"xyz789"`.

Nested paths are supported — the address walks the JSON structure
using dot-separated keys.

#### CaptureHeader

`CaptureHeader` extracts response header values and stores them at
manyfest addresses in `GlobalState`. This is useful for APIs that
return tokens, pagination cursors, or rate-limit information in
response headers.

`CaptureHeader` is an object mapping response header names to
GlobalState dot-notation addresses. Header names are matched
case-insensitively (Node.js lowercases all response headers).

```json
{
    "GUIDTask": "fetch-data",
    "Type": "RestRequest",
    "URL": "https://api.example.com/data",
    "CaptureHeader": {
        "X-Auth-Token": "AuthToken",
        "X-Rate-Limit-Remaining": "RateLimits.Remaining",
        "X-Total-Count": "Pagination.TotalCount"
    }
}
```

After this task executes, the captured header values are available at
their respective GlobalState addresses (e.g. `GlobalState.AuthToken`,
`GlobalState.RateLimits.Remaining`).

#### Retries

When `Retries` is set to a number greater than zero, a failed request
is automatically retried up to that many times before being marked as
an error. Retries apply to three failure modes:

- **Network errors** (connection refused, DNS resolution failure, etc.)
- **Timeouts** (request exceeds the configured timeout)
- **Non-2xx status codes** (HTTP 300+ responses)

Each retry waits 1 second before re-attempting. All retry attempts are
logged in the manifest entry's `Log` array so you can see exactly what
happened on each attempt.

```json
{
    "GUIDTask": "fetch-data",
    "Name": "Fetch Data with Retries",
    "Type": "RestRequest",
    "URL": "https://api.example.com/data",
    "Method": "GET",
    "Retries": 3
}
```

If all retries are exhausted without a successful response, the task is
marked with `Status: "Error"` and the log indicates how many attempts
were made. When `Retries` is `0` (the default), the existing behaviour
is unchanged -- a single failed request immediately marks the task as
an error.

### GeneratePagedOperation

Generates and optionally auto-executes a paged operation from a template.
This task type enables two-phase data fetching: a planning phase that
determines the page count, followed by a fetching phase where each page
is a discrete, visible task. This design gives you progress bars (each
page task appears in the manifest) and per-page error visibility.

| Field | Required | Description |
|-------|----------|-------------|
| `RecordCount` | Yes | Total record count -- literal number or GlobalState address (string) |
| `MaximumRecordCount` | No | Cap the resolved `RecordCount` to this value (useful for fetching only the first N records) |
| `PageSize` | No | Records per page (default: `25`) |
| `TaskTemplate` | Yes | Template task definition. String values support `{PageStart}`, `{PageSize}`, `{PageIndex}`, `{PageCount}` interpolation |
| `OperationName` | No | Human-readable name for the generated operation |
| `AutoExecute` | No | Execute the generated operation immediately (default: `true`) |
| `Retries` | No | Number of retries per generated page task (default: `0`) |
| `Destination` | No | GlobalState address to store the generated operation GUID |

#### Template Interpolation

All string values in `TaskTemplate` are scanned for these variables:

| Variable | Description | Example values |
|----------|-------------|----------------|
| `{PageStart}` | Record offset (zero-based) | `0`, `25`, `50`, ... |
| `{PageSize}` | Records per page | `25` |
| `{PageIndex}` | Zero-based page number | `0`, `1`, `2`, ... |
| `{PageCount}` | Total number of pages | `4` |

Interpolation is recursive -- variables in nested objects, arrays and
URL strings are all replaced.

Each generated task automatically receives:
- `Destination: "Pages[{PageIndex}]"` -- results stored in an array
- `Retries` from the parent task definition (if set)
- `Name: "Page {N} of {Total}"` for clear manifest entries

#### How It Works

1. Resolves `RecordCount` from GlobalState or literal value
2. Calculates page count: `Math.ceil(RecordCount / PageSize)`
3. Clones `TaskTemplate` for each page, replacing interpolation variables
4. Writes a standalone config file to the staging folder for inspection
5. Registers tasks and operation in memory (no config file pollution)
6. If `AutoExecute` is true, executes the child operation with the
   current `GlobalState` (cookies and auth tokens flow through)
7. Cleans up ephemeral tasks from memory after execution

#### Example: Paged API Fetch

```json
{
    "Tasks": {
        "authenticate": {
            "GUIDTask": "authenticate",
            "Type": "RestRequest",
            "URL": "https://api.example.com/1.0/Authenticate",
            "Method": "POST",
            "Body": { "UserName": "user@example.com", "Password": "secret" },
            "Destination": "AuthResponse"
        },
        "get-count": {
            "GUIDTask": "get-count",
            "Type": "RestRequest",
            "URL": "https://api.example.com/1.0/DataFilter/Count",
            "Method": "POST",
            "Body": { "IDProject": 8605 },
            "Destination": "CountResponse"
        },
        "extract-count": {
            "GUIDTask": "extract-count",
            "Type": "Solver",
            "Expression": "TotalCount = {CountResponse.JSON.Count}"
        },
        "generate-and-fetch": {
            "GUIDTask": "generate-and-fetch",
            "Type": "GeneratePagedOperation",
            "RecordCount": "TotalCount",
            "PageSize": 25,
            "TaskTemplate": {
                "Type": "RestRequest",
                "URL": "https://api.example.com/1.0/DataFilter/{PageStart}/{PageSize}",
                "Method": "POST",
                "Body": { "IDProject": 8605 }
            },
            "OperationName": "Fetch All Data",
            "AutoExecute": true,
            "Retries": 2
        }
    },
    "Operations": {
        "fetch-all-data": {
            "GUIDOperation": "fetch-all-data",
            "Tasks": ["authenticate", "get-count", "extract-count", "generate-and-fetch"]
        }
    }
}
```

**Execution flow:**

1. **authenticate** -- logs in, cookies captured in the shared jar
2. **get-count** -- asks the API how many records match the filter
3. **extract-count** -- Solver pulls the count into `GlobalState.TotalCount`
4. **generate-and-fetch** -- calculates pages, generates N page-fetch
   tasks, writes a standalone config to staging, then auto-executes the
   child operation. Cookies from step 1 flow through to every page fetch.

The generated child operation has N tasks visible in its manifest,
enabling progress tracking. If page 7 times out after 2 retries, the
manifest shows exactly which page failed, the retry attempts and error
messages. Remaining pages still execute.

#### Output

When `AutoExecute` is `false`, the task output is the generated
operation GUID (a string). You can inspect the standalone config file
at `{StagingPath}/PagedOperation_{GUID}.json`.

When `AutoExecute` is `true`, the task output is a JSON object:

```json
{
    "OperationGUID": "generate-and-fetch-paged-1770836906553",
    "PageCount": 12,
    "ChildManifestSummary": "Operation ... Complete: 12 task(s) executed.",
    "ChildManifestStatus": "Complete",
    "ChildManifestSuccess": true
}
```

#### Zero Records

When `RecordCount` is `0`, the task completes successfully with no
pages generated and a log message indicating there was nothing to fetch.

### Solver

Evaluates a mathematical or logical expression using the fable
ExpressionParser. The operation's `GlobalState` is passed as the
Record (data source object), so expressions can reference any value
stored in the shared state using `{VariableName}` syntax.

| Field | Required | Description |
|-------|----------|-------------|
| `Expression` | Yes | Expression string to evaluate |
| `Destination` | No | Manyfest address in GlobalState (defaults to `"Output"`) |

```json
{
    "GUIDTask": "calc-area",
    "Name": "Calculate Area",
    "Type": "Solver",
    "Expression": "Area = {Width} * {Height}",
    "Destination": "Calculations.Area"
}
```

If the expression contains an assignment (e.g. `Area = {Width} * {Height}`),
the assigned variable is merged back into `GlobalState` so subsequent
tasks can reference it. The raw result is also stored at the `Destination`
address.

`GlobalState` is exposed at `AppData.GlobalState` so that expressions
using `getvalue("AppData.GlobalState.SomePath")` can also access it.

The solver supports the full fable ExpressionParser feature set:
arithmetic, comparison, logical operators, 100+ built-in functions
(SUM, MEAN, ROUND, SQRT, etc.), and directives like SERIES and MAP.

```json
{
    "GUIDTask": "round-total",
    "Name": "Round Total",
    "Type": "Solver",
    "Expression": "ROUND({RawTotal}, 2)",
    "Destination": "FinalTotal"
}
```

### Conditional

Evaluates an address from the execution context and branches to one of
two tasks based on whether the value is truthy or falsy.

| Field | Required | Description |
|-------|----------|-------------|
| `Address` | * | Dot-notation path into GlobalState or NodeState |
| `Value` | * | Literal value to test (alternative to Address) |
| `TrueTask` | No | GUID of the task to execute when truthy |
| `FalseTask` | No | GUID of the task to execute when falsy |

\* Either `Address` or `Value` must be provided.

The `Address` field resolves against `pContext.GlobalState` first, then
falls back to `pContext.NodeState`. Use dot-notation for nested paths
(e.g. `Config.Database.Enabled`).

```json
{
    "Tasks": {
        "check-flag": {
            "GUIDTask": "check-flag",
            "Name": "Check Feature Flag",
            "Type": "Conditional",
            "Address": "Flags.UseNewPipeline",
            "TrueTask": "run-new-pipeline",
            "FalseTask": "run-legacy-pipeline"
        },
        "run-new-pipeline": {
            "GUIDTask": "run-new-pipeline",
            "Name": "New Pipeline",
            "Type": "Command",
            "Command": "bash /scripts/new_pipeline.sh"
        },
        "run-legacy-pipeline": {
            "GUIDTask": "run-legacy-pipeline",
            "Name": "Legacy Pipeline",
            "Type": "Command",
            "Command": "bash /scripts/legacy_pipeline.sh"
        }
    }
}
```

When executed as part of an operation with GlobalState:

```json
{
    "GUIDOperation": "pipeline-op",
    "Name": "Pipeline",
    "Tasks": ["check-flag"],
    "GlobalState": {
        "Flags": { "UseNewPipeline": true }
    }
}
```

If neither `TrueTask` nor `FalseTask` matches the branch, the task
completes as a no-op.

Output includes the branch taken and the result of the selected task:

```json
{
    "Branch": "true",
    "Task": "run-new-pipeline",
    "Result": { "GUIDTask": "run-new-pipeline", "Status": "Complete", "Success": true, "..." : "..." }
}
```

### LineMatch

Splits a string on a separator (default: newline) and applies a regular
expression to each line, producing a JSON array of match result objects.
This is useful for parsing structured text output from commands, log files,
or any multi-line string into a structured array that subsequent tasks can
process.

| Field | Required | Description |
|-------|----------|-------------|
| `Address` | * | Dot-notation path into GlobalState for the input string |
| `Data` | * | Inline string to process (used when Address is not set) |
| `Pattern` | Yes | Regular expression string to apply to each line |
| `Flags` | No | Regex flags (e.g. `"i"` for case-insensitive, default: `""`) |
| `Separator` | No | String to split on (default: `"\n"`) |
| `Destination` | No | Manyfest address in GlobalState (defaults to `"Output"`) |

\* Either `Address` or `Data` must be provided.

```json
{
    "GUIDTask": "parse-csv-lines",
    "Name": "Parse CSV Lines",
    "Type": "LineMatch",
    "Data": "Alice,30,Engineering\nBob,25,Marketing\nCharlie,35,Sales",
    "Pattern": "(\\w+),(\\d+),(\\w+)",
    "Destination": "ParsedRecords"
}
```

Each element in the output array is an object with the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `Index` | number | Zero-based line number |
| `Line` | string | The full original line text |
| `Match` | boolean | Whether the pattern matched this line |
| `FullMatch` | string\|null | The entire matched substring, or null if no match |
| `Groups` | array | Array of captured group values (numbered groups) |
| `NamedGroups` | object | Object of named capture groups (only present if pattern uses `(?<name>...)`) |

Example output:

```json
[
    {
        "Index": 0,
        "Line": "Alice,30,Engineering",
        "Match": true,
        "FullMatch": "Alice,30,Engineering",
        "Groups": ["Alice", "30", "Engineering"]
    },
    {
        "Index": 1,
        "Line": "Bob,25,Marketing",
        "Match": true,
        "FullMatch": "Bob,25,Marketing",
        "Groups": ["Bob", "25", "Marketing"]
    }
]
```

Lines that do not match the pattern are still included in the array with
`Match: false`, `FullMatch: null`, and an empty `Groups` array. This
preserves line indices and allows subsequent tasks to identify which lines
did not conform to the expected pattern.

Use with `Address` to process output from a previous task stored in
GlobalState:

```json
{
    "GUIDTask": "parse-log",
    "Name": "Parse Log Output",
    "Type": "LineMatch",
    "Address": "CommandOutput",
    "Pattern": "^(\\d{4}-\\d{2}-\\d{2})\\s+(\\w+):\\s+(.*)",
    "Destination": "ParsedLog"
}
```

Use a custom `Separator` to split on characters other than newline:

```json
{
    "GUIDTask": "parse-delimited",
    "Name": "Parse Pipe-Delimited",
    "Type": "LineMatch",
    "Data": "red|green|blue",
    "Pattern": "(\\w+)",
    "Separator": "|"
}
```

### Destination

The `Destination` parameter is available on all Read, Get, Solver,
LineMatch and RestRequest task types (`ReadJSON`, `ReadText`, `ReadXML`,
`ReadBinary`, `GetJSON`, `GetText`, `GetXML`, `GetBinary`, `Solver`,
`LineMatch`, `RestRequest`).
It declares where the task output is stored in
`pContext.GlobalState` using a manyfest dot-notation address.

If `Destination` is not set, the default address is `"Output"`, which
means the data is stored at `pContext.GlobalState.Output`. This allows
subsequent tasks in the same operation to access the result directly
from the shared state.

```json
{
    "GUIDTask": "fetch-users",
    "Type": "GetJSON",
    "URL": "https://api.example.com/users",
    "Destination": "APIData.Users"
}
```

After execution, `pContext.GlobalState.APIData.Users` contains the
parsed JSON response. A `Conditional` task or any subsequent task can
then reference `APIData.Users` to branch on or process the data.

For binary task types (`ReadBinary`, `GetBinary`), the data is stored
as a base64-encoded string at the destination address.

### Persist

The `Persist` parameter is available on all RESTful and binary-reading
task types (`Request`, `GetJSON`, `GetText`, `GetXML`, `GetBinary`,
`SendJSON`, `RestRequest`, `ReadBinary`).
It controls where the task output is stored after execution.

`Persist` accepts three forms:

**String** -- a manyfest dot-notation address. The result is stored into
`pContext.GlobalState` at the given path:

```json
{
    "GUIDTask": "fetch-status",
    "Type": "GetJSON",
    "URL": "https://api.example.com/status",
    "Persist": "APIResults.Status"
}
```

After execution, `pContext.GlobalState.APIResults.Status` contains the
parsed JSON response. Subsequent tasks in the same operation can read
this value via `Conditional` or any other context-aware mechanism.

**Object with `Address`** -- identical to the string form but wrapped in
an object:

```json
{
    "Persist": { "Address": "APIResults.Status" }
}
```

**Object with `File`** -- writes the result to a file relative to the
staging folder:

```json
{
    "Persist": { "File": "snapshots/api-status.json" }
}
```

For binary data (`ReadBinary`, `GetBinary`), persisting to an address
stores the data as a base64-encoded string. Persisting to a file writes
the raw bytes.

### Staging Folder

All file-based task types (`ListFiles`, `WriteJSON`, `WriteText`,
`WriteXML`, `WriteBinary`, `CopyFile`, `ReadJSON`, `ReadText`, `ReadXML`,
`ReadBinary`) operate relative to the **staging folder**.

When tasks run inside an operation, each operation automatically gets its
own staging folder at `{UltravisorStagingRoot}/{GUIDOperation}/`. This
keeps each operation's files isolated. The staging folder is resolved in
this order:

1. `pContext.StagingPath` (set automatically per-operation, or overridden
   via `StagingPath` on the operation definition)
2. `UltravisorFileStorePath` from configuration
3. `${cwd}/dist/ultravisor_datastore` (fallback)

When a task runs standalone (not inside an operation), it falls back to
options 2 and 3 above.

The operation also writes a `Manifest_{GUIDOperation}.json` file into
the staging folder when the operation completes. This provides a
persistent on-disk record of the operation's results alongside any files
the tasks produced.

Path traversal is blocked -- file paths containing `..` are rejected.

### Future Types

The following types are defined in the README but not yet implemented.
Tasks with these types will return a manifest entry with
`Status: "Unsupported"`:

- **Browser** -- headless browser navigation and interaction
- **Browser Read** -- headless browser data reading
- **Browser Action** -- click, navigate, fill actions
- **Database Table** -- create tables in the output data store
- **Integration** -- Meadow integration tasks

## Task Execution Result

Every task execution produces a manifest entry:

```json
{
    "GUIDTask": "list-files",
    "Name": "List Files in Home",
    "Type": "Command",
    "StartTime": "2026-02-10T12:00:00.000Z",
    "StopTime": "2026-02-10T12:00:00.045Z",
    "Status": "Complete",
    "Success": true,
    "Output": "total 48\ndrwxr-x---  12 user ...",
    "Log": [
        "Task list-files started at 2026-02-10T12:00:00.000Z",
        "Executing command: ls -la ~/",
        "stdout: total 48...",
        "Command completed successfully."
    ],
    "SubsequentResults": {}
}
```

### Status Values

| Status | Meaning |
|--------|---------|
| `Running` | Task is currently executing |
| `Complete` | Task finished successfully |
| `Error` | Task encountered an error or non-zero exit |
| `Unsupported` | Task type is not yet implemented |

## Subsequent Tasks

Subsequent tasks allow you to chain additional tasks around a core task's
execution. Each subsequent task set is an array of task GUIDs that execute
in sequence. Five built-in sets provide hooks into different points of the
task lifecycle:

| Set | When It Runs | Condition |
|-----|-------------|-----------|
| `onBefore` | Before the core task | Always |
| `onCompletion` | After the core task | Only if core task succeeded |
| `onFailure` | After the core task | Only if core task failed |
| `onError` | After the core task | Only if core task errored |
| `onSubsequent` | After all conditional sets | Always (success or failure) |

All five sets are optional. Any set can contain zero or more task GUIDs.
Tasks within a set execute sequentially in array order.

### Execution Order

```
1. onBefore[0], onBefore[1], ...     (always runs)
2. Core task execution
3. If success  → onCompletion[0], onCompletion[1], ...
   If failure  → onFailure[0], onFailure[1], ...
   If error    → onError[0], onError[1], ...
4. onSubsequent[0], onSubsequent[1], ... (always runs)
```

### Basic Example

A task that runs a notification before and cleanup after:

```json
{
    "Tasks": {
        "notify-start": {
            "GUIDTask": "notify-start",
            "Name": "Notify Start",
            "Type": "Command",
            "Command": "echo 'Backup starting...' >> /var/log/ultravisor.log"
        },
        "backup-db": {
            "GUIDTask": "backup-db",
            "Name": "Backup Database",
            "Type": "Command",
            "Command": "pg_dump mydb > /backups/mydb.sql",
            "onBefore": ["notify-start"],
            "onCompletion": ["verify-backup", "notify-success"],
            "onFailure": ["notify-failure"],
            "onSubsequent": ["cleanup-temp"]
        },
        "verify-backup": {
            "GUIDTask": "verify-backup",
            "Name": "Verify Backup",
            "Type": "Command",
            "Command": "test -s /backups/mydb.sql && echo 'OK'"
        },
        "notify-success": {
            "GUIDTask": "notify-success",
            "Name": "Notify Success",
            "Type": "Command",
            "Command": "echo 'Backup completed successfully' >> /var/log/ultravisor.log"
        },
        "notify-failure": {
            "GUIDTask": "notify-failure",
            "Name": "Notify Failure",
            "Type": "Command",
            "Command": "echo 'Backup FAILED' >> /var/log/ultravisor.log"
        },
        "cleanup-temp": {
            "GUIDTask": "cleanup-temp",
            "Name": "Cleanup Temp Files",
            "Type": "Command",
            "Command": "rm -f /tmp/ultravisor-backup-*"
        }
    }
}
```

When `backup-db` executes:
1. `notify-start` runs first (onBefore)
2. `pg_dump mydb > /backups/mydb.sql` runs (core task)
3. If the backup succeeds: `verify-backup` then `notify-success` run (onCompletion)
4. If the backup fails: `notify-failure` runs (onFailure)
5. `cleanup-temp` always runs last (onSubsequent)

### Error Handling Example

Use `onError` for tasks that should run when the core task encounters
an execution error (non-zero exit code, timeout, etc.):

```json
{
    "Tasks": {
        "deploy-app": {
            "GUIDTask": "deploy-app",
            "Name": "Deploy Application",
            "Type": "Command",
            "Command": "kubectl apply -f /deploy/manifest.yaml",
            "onBefore": ["run-tests", "build-image"],
            "onCompletion": ["smoke-test"],
            "onError": ["rollback-deploy", "alert-oncall"],
            "onSubsequent": ["log-deploy-result"]
        },
        "run-tests": {
            "GUIDTask": "run-tests",
            "Name": "Run Test Suite",
            "Type": "Command",
            "Command": "npm test"
        },
        "build-image": {
            "GUIDTask": "build-image",
            "Name": "Build Docker Image",
            "Type": "Command",
            "Command": "docker build -t myapp:latest ."
        },
        "smoke-test": {
            "GUIDTask": "smoke-test",
            "Name": "Run Smoke Tests",
            "Type": "Request",
            "URL": "https://myapp.example.com/health",
            "Method": "GET"
        },
        "rollback-deploy": {
            "GUIDTask": "rollback-deploy",
            "Name": "Rollback Deployment",
            "Type": "Command",
            "Command": "kubectl rollout undo deployment/myapp"
        },
        "alert-oncall": {
            "GUIDTask": "alert-oncall",
            "Name": "Alert On-Call",
            "Type": "Request",
            "URL": "https://hooks.slack.example.com/alert",
            "Method": "POST"
        },
        "log-deploy-result": {
            "GUIDTask": "log-deploy-result",
            "Name": "Log Deploy Result",
            "Type": "Command",
            "Command": "echo \"Deploy finished at $(date)\" >> /var/log/deploys.log"
        }
    }
}
```

### Manifest Entry with Subsequent Results

When a task with subsequent sets executes, the manifest entry includes a
`SubsequentResults` object keyed by set name. Each set contains an array
of manifest entries for the subsequent tasks that ran:

```json
{
    "GUIDTask": "backup-db",
    "Name": "Backup Database",
    "Type": "Command",
    "StartTime": "2026-02-10T12:00:00.000Z",
    "StopTime": "2026-02-10T12:00:02.150Z",
    "Status": "Complete",
    "Success": true,
    "Output": "pg_dump: ...",
    "Log": ["..."],
    "SubsequentResults": {
        "onBefore": [
            {
                "GUIDTask": "notify-start",
                "Status": "Complete",
                "Success": true,
                "Output": "..."
            }
        ],
        "onCompletion": [
            {
                "GUIDTask": "verify-backup",
                "Status": "Complete",
                "Success": true,
                "Output": "OK"
            },
            {
                "GUIDTask": "notify-success",
                "Status": "Complete",
                "Success": true,
                "Output": "..."
            }
        ],
        "onSubsequent": [
            {
                "GUIDTask": "cleanup-temp",
                "Status": "Complete",
                "Success": true,
                "Output": ""
            }
        ]
    }
}
```

Sets that were not executed (e.g., `onFailure` when the task succeeded)
will not appear in `SubsequentResults`.

### Important Notes

- **No recursive chaining.** Subsequent tasks execute their core logic
  only. If a subsequent task itself has subsequent sets defined, those
  nested sets are not executed. This prevents infinite recursion.
- **Missing GUIDs are skipped.** If a subsequent set references a task
  GUID that does not exist in state, it is logged and skipped gracefully.
- **Empty arrays are no-ops.** Setting a subsequent set to `[]` is the
  same as not defining it at all.
- **Order is preserved.** Tasks within a set execute sequentially in the
  order they appear in the array.

## Managing Tasks

### Via CLI

```bash
# Add or update a task
ultravisor updatetask -g my-task -n "My Task" -t Command -p "echo hello"

# Add from a JSON file
ultravisor updatetask -f ./task-definition.json

# Combine file + overrides (CLI params take precedence)
ultravisor updatetask -f ./task-definition.json -g override-guid

# Run immediately
ultravisor singletask my-task

# Dry run
ultravisor singletask my-task --dry_run
```

### Via API

```bash
# Create
curl -X POST http://localhost:54321/Task \
  -H "Content-Type: application/json" \
  -d '{
    "GUIDTask": "my-task",
    "Name": "My Task",
    "Type": "Command",
    "Command": "echo hello"
  }'

# Read one
curl http://localhost:54321/Task/my-task

# List all
curl http://localhost:54321/Task

# Update
curl -X PUT http://localhost:54321/Task/my-task \
  -H "Content-Type: application/json" \
  -d '{"Name": "My Updated Task", "Command": "echo updated"}'

# Delete
curl -X DELETE http://localhost:54321/Task/my-task

# Execute
curl http://localhost:54321/Task/my-task/Execute
```

### Via Configuration File

Tasks defined directly in `.ultravisor.json` are loaded at startup:

```json
{
    "Tasks": {
        "backup-db": {
            "GUIDTask": "backup-db",
            "Name": "Backup Database",
            "Type": "Command",
            "Command": "pg_dump mydb > /backups/mydb.sql"
        },
        "fetch-api-data": {
            "GUIDTask": "fetch-api-data",
            "Name": "Fetch API Data",
            "Type": "Request",
            "URL": "https://api.example.com/data",
            "Method": "GET"
        }
    }
}
```

## Examples

### Fetch public JSON and save locally

This operation pulls user data from the JSONPlaceholder API, saves the
raw response to the staging folder, then lists the folder contents to
confirm the file landed.

```json
{
    "UltravisorFileStorePath": "/var/data/ultravisor",
    "Tasks": {
        "fetch-users": {
            "GUIDTask": "fetch-users",
            "Name": "Fetch Users from JSONPlaceholder",
            "Type": "GetJSON",
            "URL": "https://jsonplaceholder.typicode.com/users"
        },
        "save-users": {
            "GUIDTask": "save-users",
            "Name": "Save Users to Staging",
            "Type": "WriteJSON",
            "File": "api-snapshots/users.json",
            "Data": "<<populated at runtime by the operation>>"
        },
        "verify-snapshot": {
            "GUIDTask": "verify-snapshot",
            "Name": "List Snapshot Directory",
            "Type": "ListFiles",
            "Path": "api-snapshots"
        }
    },
    "Operations": {
        "snapshot-users": {
            "GUIDOperation": "snapshot-users",
            "Name": "Snapshot Users API",
            "Tasks": ["fetch-users", "save-users", "verify-snapshot"]
        }
    }
}
```

Running `ultravisor singleoperation snapshot-users` will:
1. GET `https://jsonplaceholder.typicode.com/users` and parse the JSON
2. Write the result to `/var/data/ultravisor/api-snapshots/users.json`
3. List the `api-snapshots/` directory and confirm the file exists

Each task's output is captured in the operation manifest, so the raw
JSON from step 1 is available in the manifest even if step 2 fails.

### Config-driven conditional pipeline

This configuration uses a `Conditional` task to check a feature flag
before deciding which data pipeline to run. A `WriteJSON` task seeds
a local config file that other tasks can read.

```json
{
    "UltravisorFileStorePath": "/data/pipeline",
    "Tasks": {
        "write-pipeline-config": {
            "GUIDTask": "write-pipeline-config",
            "Name": "Write Pipeline Config",
            "Type": "WriteJSON",
            "File": "config/pipeline.json",
            "Data": {
                "version": 2,
                "useNewParser": true,
                "outputFormat": "parquet"
            }
        },
        "read-pipeline-config": {
            "GUIDTask": "read-pipeline-config",
            "Name": "Read Pipeline Config",
            "Type": "ReadJSON",
            "File": "config/pipeline.json"
        },
        "check-parser-flag": {
            "GUIDTask": "check-parser-flag",
            "Name": "Check Parser Flag",
            "Type": "Conditional",
            "Address": "Flags.useNewParser",
            "TrueTask": "run-new-parser",
            "FalseTask": "run-legacy-parser"
        },
        "run-new-parser": {
            "GUIDTask": "run-new-parser",
            "Name": "Run New Parser",
            "Type": "Command",
            "Command": "python3 /scripts/new_parser.py --format parquet"
        },
        "run-legacy-parser": {
            "GUIDTask": "run-legacy-parser",
            "Name": "Run Legacy Parser",
            "Type": "Command",
            "Command": "python3 /scripts/legacy_parser.py --format csv"
        },
        "log-result": {
            "GUIDTask": "log-result",
            "Name": "Log Pipeline Result",
            "Type": "WriteText",
            "File": "logs/pipeline-run.log",
            "Data": "Pipeline completed successfully."
        }
    },
    "Operations": {
        "data-pipeline": {
            "GUIDOperation": "data-pipeline",
            "Name": "Conditional Data Pipeline",
            "Tasks": [
                "write-pipeline-config",
                "read-pipeline-config",
                "check-parser-flag",
                "log-result"
            ],
            "GlobalState": {
                "Flags": { "useNewParser": true }
            }
        }
    }
}
```

### Webhook relay with error notification

This example uses `SendJSON` to push metrics to a dashboard, with
`onError` and `onCompletion` subsequent tasks for alerting. If the
POST fails, an error report is written to the staging folder.

```json
{
    "UltravisorFileStorePath": "/var/data/ultravisor",
    "Tasks": {
        "push-metrics": {
            "GUIDTask": "push-metrics",
            "Name": "Push Metrics to Dashboard",
            "Type": "SendJSON",
            "URL": "https://dashboard.example.com/api/v1/ingest",
            "Method": "POST",
            "Data": {
                "source": "ultravisor",
                "timestamp": "2026-02-10T12:00:00Z",
                "cpu_percent": 34.2,
                "memory_mb": 2048,
                "disk_free_gb": 120
            },
            "Headers": {
                "X-API-Key": "your-dashboard-api-key"
            },
            "onCompletion": ["log-push-success"],
            "onError": ["write-error-report", "alert-slack"]
        },
        "log-push-success": {
            "GUIDTask": "log-push-success",
            "Name": "Log Success",
            "Type": "WriteText",
            "File": "logs/metrics-push.log",
            "Data": "Metrics pushed successfully."
        },
        "write-error-report": {
            "GUIDTask": "write-error-report",
            "Name": "Write Error Report",
            "Type": "WriteJSON",
            "File": "errors/last-push-failure.json",
            "Data": {
                "event": "metrics-push-failed",
                "action": "investigate dashboard endpoint"
            }
        },
        "alert-slack": {
            "GUIDTask": "alert-slack",
            "Name": "Alert Slack Channel",
            "Type": "SendJSON",
            "URL": "https://hooks.slack.com/services/T00/B00/xxxxx",
            "Method": "POST",
            "Data": {
                "text": "Ultravisor: metrics push to dashboard failed."
            }
        }
    }
}
```

### Multi-format report generator

Combines `GetJSON`, `WriteJSON`, `WriteText` and `ListFiles` into a
reporting pipeline. Fetches data from a public API, stores the raw
JSON, generates a human-readable summary, then lists all output files.

```json
{
    "UltravisorFileStorePath": "/data/reports",
    "Tasks": {
        "fetch-posts": {
            "GUIDTask": "fetch-posts",
            "Name": "Fetch Recent Posts",
            "Type": "GetJSON",
            "URL": "https://jsonplaceholder.typicode.com/posts?_limit=5"
        },
        "save-raw-json": {
            "GUIDTask": "save-raw-json",
            "Name": "Save Raw JSON",
            "Type": "WriteJSON",
            "File": "daily/posts-raw.json",
            "Data": { "note": "Replaced at runtime with fetch output" }
        },
        "write-summary": {
            "GUIDTask": "write-summary",
            "Name": "Write Human Summary",
            "Type": "WriteText",
            "File": "daily/summary.txt",
            "Data": "Daily Report\n============\nGenerated by Ultravisor.\n\nFetched 5 recent posts from JSONPlaceholder API.\nRaw data saved to posts-raw.json."
        },
        "list-output": {
            "GUIDTask": "list-output",
            "Name": "List Daily Output",
            "Type": "ListFiles",
            "Path": "daily"
        }
    },
    "Operations": {
        "daily-report": {
            "GUIDOperation": "daily-report",
            "Name": "Daily Report Pipeline",
            "Tasks": [
                "fetch-posts",
                "save-raw-json",
                "write-summary",
                "list-output"
            ]
        }
    }
}
```

Running `ultravisor singleoperation daily-report` produces:
- `daily/posts-raw.json` -- the raw API response
- `daily/summary.txt` -- a text summary
- The final manifest includes a file listing of the `daily/` directory

### Authenticated REST session with shared cookies

This example uses `RestRequest` to log in to an API and then fetch
protected data using the session established during authentication.
Two mechanisms ensure the auth token flows to subsequent requests:

- **Set-Cookie headers** are automatically captured into
  `GlobalState.Cookies` (for APIs that use HTTP cookies).
- **CaptureToken** extracts a token from the JSON response body
  and stores it in the cookie jar (for APIs that return tokens in
  the response body rather than via `Set-Cookie`).

The `save-observations` task uses the `Address` field to write
data from `GlobalState` rather than a static `Data` value.

A working version of this example lives in
`example_operations/headlight-observations/.ultravisor.json`.

```json
{
    "Tasks": {
        "authenticate": {
            "GUIDTask": "authenticate",
            "Name": "Authenticate to API",
            "Type": "RestRequest",
            "URL": "https://api.example.com/1.0/Authenticate",
            "Method": "POST",
            "Body": {
                "UserName": "user@example.com",
                "Password": "secret"
            },
            "CaptureToken": {
                "Address": "Token",
                "Cookie": "Token"
            },
            "Destination": "AuthResponse"
        },
        "fetch-observations": {
            "GUIDTask": "fetch-observations",
            "Name": "Fetch Observations Page One",
            "Type": "RestRequest",
            "URL": "https://api.example.com/1.0/ObservationsFilter/0/25",
            "Method": "POST",
            "Body": {
                "IDProject": 8605,
                "MatchAllTags": false,
                "IDAuthor": [15124],
                "ObservationType": ["Narrative", "Image", "File"]
            },
            "Destination": "ObservationsPageOne"
        },
        "save-observations": {
            "GUIDTask": "save-observations",
            "Name": "Save Observations to Staging",
            "Type": "WriteJSON",
            "File": "ObservationsPageOne.json",
            "Address": "ObservationsPageOne"
        }
    },
    "Operations": {
        "fetch-observations": {
            "GUIDOperation": "fetch-observations",
            "Name": "Authenticate and Fetch Observations",
            "Tasks": [
                "authenticate",
                "fetch-observations",
                "save-observations"
            ]
        }
    }
}
```

When `fetch-observations` executes:

1. **authenticate** -- POSTs credentials to the login endpoint. Any
   `Set-Cookie` response headers are automatically captured into
   `GlobalState.Cookies`. Additionally, `CaptureToken` extracts
   the `Token` field from the JSON response body and stores it as
   `GlobalState.Cookies.Token`. The full JSON response is stored at
   `GlobalState.AuthResponse`.

2. **fetch-observations** -- POSTs the filter criteria. The shared
   cookie jar already contains the session token from step 1, so it
   is automatically included in this request's `Cookie` header.
   The response is stored at `GlobalState.ObservationsPageOne`.

3. **save-observations** -- Uses `Address` to resolve
   `GlobalState.ObservationsPageOne` and writes it as JSON to
   `ObservationsPageOne.json` in the operation's staging folder.

No explicit cookie configuration is needed between steps -- the
`RestRequest` shared cookie jar handles it automatically. The
combination of `Set-Cookie` capture and `CaptureToken` covers both
cookie-based and token-based authentication flows.
