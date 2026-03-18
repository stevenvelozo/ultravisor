# REST Request

Performs a fully configurable HTTP request with support for any method, custom content types, request bodies, retries, and timeout control.

## Settings

- **URL** — The URL to request.
- **Method** — HTTP method: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, etc. (default `GET`).
- **ContentType** — Content-Type header value (default `application/json`).
- **Headers** — JSON string of additional request headers.
- **Body** — Request body as a JSON string or raw text.
- **Destination** — State address to store the response.
- **Retries** — Number of retries on failure (default `0`).
- **TimeoutMs** — Request timeout in milliseconds (default `30000`).
- **RetryDelayMs** — Delay between retry attempts in milliseconds (default `1000`).

## Outputs

- **Response** — The response data.
- **StatusCode** — HTTP response status code.
- **ResponseHeaders** — JSON string of response headers.

## Events

- **Complete** — Fires on success.
- **Error** — Fires on failure after all retries are exhausted.

## Tips

REST Request is the most flexible HTTP card. Use it for DELETE operations, form-encoded POST bodies, XML APIs, or any case where Get JSON / Send JSON are too restrictive. The Retries setting with RetryDelayMs provides built-in resilience for flaky endpoints.
