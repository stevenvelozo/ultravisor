# Parse CSV

Parses CSV text into an array of records (objects with field names as keys).

## Settings

- **SourceAddress** — State address containing the CSV text to parse.
- **Delimiter** — Column delimiter character (default `,`).
- **HasHeaders** — When `true`, the first row provides field names. When `false`, fields are indexed numerically.
- **Destination** — State address to store the parsed records array.
- **QuoteCharacter** — Character used to quote fields that contain the delimiter (default `"`).
- **TrimFields** — Trim leading/trailing whitespace from field values.
- **SkipEmptyLines** — Skip blank lines in the input.

## Outputs

- **Records** — Array of parsed row objects.
- **ColumnCount** — Number of columns detected.
- **Headers** — Array of header names from the first row.

## Events

- **Complete** — Fires after parsing.

## Tips

Chain **Read File** → **Parse CSV** → **CSV Transform** for a complete data import pipeline. Use TrimFields and SkipEmptyLines to handle messy real-world CSV exports cleanly.
