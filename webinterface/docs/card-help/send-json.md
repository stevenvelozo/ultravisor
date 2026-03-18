# Send JSON

Sends JSON data to a URL via HTTP POST or PUT.

## Settings

- **URL** — The URL to send data to.
- **Method** — HTTP method: `POST` or `PUT` (default `POST`).
- **DataAddress** — State address of the object to send as the request body.
- **Headers** — JSON string of additional request headers.
- **Destination** — State address to store the response data.
- **TimeoutMs** — Request timeout in milliseconds (default `30000`).

## Outputs

- **Response** — The parsed response data.
- **StatusCode** — HTTP response status code.

## Events

- **Complete** — Fires on success.
- **Error** — Fires on failure.

## Tips

Use Send JSON for creating or updating resources via REST APIs. For more control over the request (custom Content-Type, DELETE method, retries), use **REST Request** instead.
