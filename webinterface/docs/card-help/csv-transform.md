# CSV Transform

Transforms an array of parsed CSV records by applying field mappings, filters, and output field selection.

## Settings

- **SourceAddress** — State address of the records array to transform.
- **Destination** — State address to store the transformed records.
- **Delimiter** — Delimiter for re-serialization (default `,`).
- **FieldMapping** — JSON array of mapping objects with `From`, `To`, and optional `Template` properties for field renaming and transformation.
- **FilterExpression** — An expression to filter rows. Only rows where the expression evaluates to true are included.
- **OutputFields** — JSON array of field names to include in the output. Omit to include all fields.

## Outputs

- **Records** — The transformed records array.

## Events

- **Complete** — Fires after transformation.

## Tips

Use FieldMapping to rename columns, compute derived fields with templates, or restructure data. Combine with FilterExpression to extract subsets of records in a single step.
