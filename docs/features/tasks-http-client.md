# HTTP Client Tasks

Tasks for making HTTP requests to external APIs and web services, from simple GET operations to fully configurable REST calls.

---

## Get JSON

Performs an HTTP GET request and parses the response body as JSON.

### Settings

- **URL** — The URL to request. Supports Pict template expressions for dynamic URLs.
- **Headers** — JSON string of additional request headers (e.g. `{"Authorization": "Bearer ..."}`).
- **Destination** — State address to store the parsed response data.
- **TimeoutMs** — Request timeout in milliseconds (default `30000`).

### Outputs

- **Data** — The parsed JSON response object.
- **StatusCode** — HTTP response status code.

### Events

- **Complete** — Fires on a successful response.
- **Error** — Fires on network failure, timeout, or non-2xx status.

### Tips

For APIs requiring authentication, use **Set Values** to build the Headers JSON from stored credentials before connecting to the Headers setting input. Use the StatusCode output with an **If Conditional** to handle different HTTP response codes.

---

## Get Text

Performs an HTTP GET request and returns the response body as plain text.

### Settings

- **URL** — The URL to request.
- **Destination** — State address to store the response text.
- **Headers** — JSON string of additional request headers.
- **TimeoutMs** — Request timeout in milliseconds (default `30000`).

### Outputs

- **Data** — The response body as a string.
- **StatusCode** — HTTP response status code.

### Events

- **Complete** — Fires on a successful response.
- **Error** — Fires on network failure or timeout.

### Tips

Use Get Text for non-JSON responses: HTML pages, CSV downloads, plain text APIs, or XML feeds. Pipe the output into **Parse CSV** for CSV data or **Replace String** for text processing.

---

## Send JSON

Sends JSON data to a URL via HTTP POST or PUT.

### Settings

- **URL** — The URL to send data to.
- **Method** — HTTP method: `POST` or `PUT` (default `POST`).
- **DataAddress** — State address of the object to send as the request body.
- **Headers** — JSON string of additional request headers.
- **Destination** — State address to store the response data.
- **TimeoutMs** — Request timeout in milliseconds (default `30000`).

### Outputs

- **Response** — The parsed response data.
- **StatusCode** — HTTP response status code.

### Events

- **Complete** — Fires on success.
- **Error** — Fires on failure.

### Tips

Use Send JSON for creating or updating resources via REST APIs. For more control over the request (custom Content-Type, DELETE method, retries), use **REST Request** instead.

---

## REST Request

Performs a fully configurable HTTP request with support for any method, custom content types, request bodies, retries, and timeout control.

### Settings

- **URL** — The URL to request.
- **Method** — HTTP method: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, etc. (default `GET`).
- **ContentType** — Content-Type header value (default `application/json`).
- **Headers** — JSON string of additional request headers.
- **Body** — Request body as a JSON string or raw text.
- **Destination** — State address to store the response.
- **Retries** — Number of retries on failure (default `0`).
- **TimeoutMs** — Request timeout in milliseconds (default `30000`).
- **RetryDelayMs** — Delay between retry attempts in milliseconds (default `1000`).

### Outputs

- **Response** — The response data.
- **StatusCode** — HTTP response status code.
- **ResponseHeaders** — JSON string of response headers.

### Events

- **Complete** — Fires on success.
- **Error** — Fires on failure after all retries are exhausted.

### Tips

REST Request is the most flexible HTTP card. Use it for DELETE operations, form-encoded POST bodies, XML APIs, or any case where Get JSON / Send JSON are too restrictive. The Retries setting with RetryDelayMs provides built-in resilience for flaky endpoints.
