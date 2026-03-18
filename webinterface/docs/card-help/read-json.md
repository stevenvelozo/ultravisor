# Read JSON

Reads a JSON file from disk, parses it, and stores the resulting object in operation state.

## Settings

- **FilePath** — Path to the JSON file.
- **Destination** — State address to store the parsed data. If empty, data is stored at the default output address.

## Outputs

- **Data** — The parsed JSON object or array.

## Events

- **Complete** — Fires after successful read and parse.
- **Error** — Fires if the file is missing or contains invalid JSON.

## Tips

Pair with **Write JSON** to round-trip configuration or intermediate data. Use the Destination setting to place the parsed data at a specific location in your operation state for downstream tasks.
