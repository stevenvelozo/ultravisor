# Meadow Create

Creates a new record via a Meadow REST API endpoint.

## Settings

- **Entity** — Entity (table) name.
- **Endpoint** — Base URL of the Meadow API server.
- **DataAddress** — State address of the object containing the record data to create.
- **Headers** — JSON string of request headers for authentication.
- **Destination** — State address to store the created record (includes server-generated fields like ID).

## Outputs

- **Created** — The newly created record object with its assigned ID.

## Events

- **Complete** — Fires after the record is created.
- **Error** — Fires on failure.

## Tips

Build the record data with **Set Values** or **Template String** before passing it to Meadow Create. The created record output includes the server-assigned ID, which you can use in subsequent steps.
