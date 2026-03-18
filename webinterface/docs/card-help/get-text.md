# Get Text

Performs an HTTP GET request and returns the response body as plain text.

## Settings

- **URL** — The URL to request.
- **Destination** — State address to store the response text.
- **Headers** — JSON string of additional request headers.
- **TimeoutMs** — Request timeout in milliseconds (default `30000`).

## Outputs

- **Data** — The response body as a string.
- **StatusCode** — HTTP response status code.

## Events

- **Complete** — Fires on a successful response.
- **Error** — Fires on network failure or timeout.

## Tips

Use Get Text for non-JSON responses: HTML pages, CSV downloads, plain text APIs, or XML feeds. Pipe the output into **Parse CSV** for CSV data or **Replace String** for text processing.
