# Get JSON

Performs an HTTP GET request and parses the response body as JSON.

## Settings

- **URL** — The URL to request. Supports Pict template expressions for dynamic URLs.
- **Headers** — JSON string of additional request headers (e.g. `{"Authorization": "Bearer ..."}`).
- **Destination** — State address to store the parsed response data.
- **TimeoutMs** — Request timeout in milliseconds (default `30000`).

## Outputs

- **Data** — The parsed JSON response object.
- **StatusCode** — HTTP response status code.

## Events

- **Complete** — Fires on a successful response.
- **Error** — Fires on network failure, timeout, or non-2xx status.

## Tips

For APIs requiring authentication, use **Set Values** to build the Headers JSON from stored credentials before connecting to the Headers setting input. Use the StatusCode output with an **If Conditional** to handle different HTTP response codes.
