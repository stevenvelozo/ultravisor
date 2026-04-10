# Meadow API Tasks

Tasks for performing CRUD operations against Meadow REST API endpoints, providing database access through the Meadow data access layer.

---

## Meadow Create

Creates a new record via a Meadow REST API endpoint.

### Settings

- **Entity** -- Entity (table) name.
- **Endpoint** -- Base URL of the Meadow API server.
- **DataAddress** -- State address of the object containing the record data to create.
- **Headers** -- JSON string of request headers for authentication.
- **Destination** -- State address to store the created record (includes server-generated fields like ID).

### Outputs

- **Created** -- The newly created record object with its assigned ID.

### Events

- **Complete** -- Fires after the record is created.
- **Error** -- Fires on failure.

### Tips

Build the record data with **Set Values** or **Template String** before passing it to Meadow Create. The created record output includes the server-assigned ID, which you can use in subsequent steps.

---

## Meadow Read

Reads a single record by its ID from a Meadow REST API endpoint.

### Settings

- **Entity** -- Entity (table) name to query.
- **Endpoint** -- Base URL of the Meadow API server.
- **RecordID** -- The ID of the record to retrieve.
- **Destination** -- State address to store the retrieved record.
- **Headers** -- JSON string of additional request headers for authentication.

### Outputs

- **Record** -- The retrieved record object.

### Events

- **Complete** -- Fires after the record is retrieved.
- **Error** -- Fires if the record is not found or the request fails.

### Tips

Use **Set Values** or **Template String** to build the RecordID dynamically from other state values. Pair with **Meadow Update** to read-modify-write a record.

---

## Meadow Reads

Reads multiple records from a Meadow REST API endpoint, with optional filtering and pagination.

### Settings

- **Entity** -- Entity (table) name to query.
- **Endpoint** -- Base URL of the Meadow API server.
- **Filter** -- Meadow filter expression to narrow the result set (e.g. `FBV~IDUser~EQ~42~0~`).
- **Destination** -- State address to store the records array.
- **Headers** -- JSON string of request headers for authentication.
- **PageSize** -- Number of records per page (default `100`).
- **PageNumber** -- Zero-based page number (default `0`).

### Outputs

- **Records** -- Array of retrieved record objects.
- **RecordCount** -- Number of records returned.

### Events

- **Complete** -- Fires after records are retrieved.
- **Error** -- Fires on request failure.

### Tips

Use the Meadow filter expression to limit results server-side for better performance. Combine with **Split Execute** to process each record individually, or with **Comprehension Intersect** to join data from two entities.

---

## Meadow Update

Updates an existing record via a Meadow REST API endpoint.

### Settings

- **Entity** -- Entity (table) name.
- **Endpoint** -- Base URL of the Meadow API server.
- **DataAddress** -- State address of the record data to update. Must include the record's ID field.
- **Headers** -- JSON string of request headers for authentication.
- **Destination** -- State address to store the updated record.

### Outputs

- **Updated** -- The updated record object.

### Events

- **Complete** -- Fires after the update.
- **Error** -- Fires on failure.

### Tips

Use **Meadow Read** first to load the current record, modify the fields you need with **Set Values**, then pass the modified object to Meadow Update. The data object must include the record's primary key field.

---

## Meadow Delete

Deletes a record by its ID via a Meadow REST API endpoint.

### Settings

- **Entity** -- Entity (table) name.
- **Endpoint** -- Base URL of the Meadow API server.
- **RecordID** -- The ID of the record to delete.
- **Headers** -- JSON string of request headers for authentication.

### Events

- **Done** -- Fires after the record is deleted.
- **Error** -- Fires on failure.

### Tips

Meadow Delete is permanent -- consider adding a **Value Input** confirmation step before deleting records in user-facing workflows. Build the RecordID dynamically with template expressions when deleting records identified by earlier processing steps.

---

## Meadow Count

Counts records for an entity via a Meadow REST API endpoint, with optional filtering.

### Settings

- **Entity** -- Entity (table) name.
- **Endpoint** -- Base URL of the Meadow API server.
- **Destination** -- State address to store the count value.
- **Headers** -- JSON string of request headers for authentication.
- **Filter** -- Meadow filter expression to count only matching records.

### Outputs

- **Count** -- Number of records matching the criteria.

### Events

- **Complete** -- Fires after the count is retrieved.
- **Error** -- Fires on failure.

### Tips

Use Meadow Count before **Meadow Reads** to check the result set size, or to report progress statistics. It is much faster than reading all records when you only need the total.
