# Meadow Delete

Deletes a record by its ID via a Meadow REST API endpoint.

## Settings

- **Entity** — Entity (table) name.
- **Endpoint** — Base URL of the Meadow API server.
- **RecordID** — The ID of the record to delete.
- **Headers** — JSON string of request headers for authentication.

## Events

- **Done** — Fires after the record is deleted.
- **Error** — Fires on failure.

## Tips

Meadow Delete is permanent — consider adding a **Value Input** confirmation step before deleting records in user-facing workflows. Build the RecordID dynamically with template expressions when deleting records identified by earlier processing steps.
