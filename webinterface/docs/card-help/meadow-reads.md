# Meadow Reads

Reads multiple records from a Meadow REST API endpoint, with optional filtering and pagination.

## Settings

- **Entity** — Entity (table) name to query.
- **Endpoint** — Base URL of the Meadow API server.
- **Filter** — Meadow filter expression to narrow the result set (e.g. `FBV~IDUser~EQ~42~0~`).
- **Destination** — State address to store the records array.
- **Headers** — JSON string of request headers for authentication.
- **PageSize** — Number of records per page (default `100`).
- **PageNumber** — Zero-based page number (default `0`).

## Outputs

- **Records** — Array of retrieved record objects.
- **RecordCount** — Number of records returned.

## Events

- **Complete** — Fires after records are retrieved.
- **Error** — Fires on request failure.

## Tips

Use the Meadow filter expression to limit results server-side for better performance. Combine with **Split Execute** to process each record individually, or with **Comprehension Intersect** to join data from two entities.
