# Meadow Read

Reads a single record by its ID from a Meadow REST API endpoint.

## Settings

- **Entity** — Entity (table) name to query.
- **Endpoint** — Base URL of the Meadow API server.
- **RecordID** — The ID of the record to retrieve.
- **Destination** — State address to store the retrieved record.
- **Headers** — JSON string of additional request headers for authentication.

## Outputs

- **Record** — The retrieved record object.

## Events

- **Complete** — Fires after the record is retrieved.
- **Error** — Fires if the record is not found or the request fails.

## Tips

Use **Set Values** or **Template String** to build the RecordID dynamically from other state values. Pair with **Meadow Update** to read-modify-write a record.
