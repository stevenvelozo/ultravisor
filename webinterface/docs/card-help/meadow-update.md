# Meadow Update

Updates an existing record via a Meadow REST API endpoint.

## Settings

- **Entity** — Entity (table) name.
- **Endpoint** — Base URL of the Meadow API server.
- **DataAddress** — State address of the record data to update. Must include the record's ID field.
- **Headers** — JSON string of request headers for authentication.
- **Destination** — State address to store the updated record.

## Outputs

- **Updated** — The updated record object.

## Events

- **Complete** — Fires after the update.
- **Error** — Fires on failure.

## Tips

Use **Meadow Read** first to load the current record, modify the fields you need with **Set Values**, then pass the modified object to Meadow Update. The data object must include the record's primary key field.
