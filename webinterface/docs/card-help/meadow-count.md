# Meadow Count

Counts records for an entity via a Meadow REST API endpoint, with optional filtering.

## Settings

- **Entity** — Entity (table) name.
- **Endpoint** — Base URL of the Meadow API server.
- **Destination** — State address to store the count value.
- **Headers** — JSON string of request headers for authentication.
- **Filter** — Meadow filter expression to count only matching records.

## Outputs

- **Count** — Number of records matching the criteria.

## Events

- **Complete** — Fires after the count is retrieved.
- **Error** — Fires on failure.

## Tips

Use Meadow Count before **Meadow Reads** to check the result set size, or to report progress statistics. It is much faster than reading all records when you only need the total.
