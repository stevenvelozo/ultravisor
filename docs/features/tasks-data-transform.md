# Data Transform Tasks

Tasks for manipulating values, strings, templates, expressions, and tabular data within operation state.

---

## Set Values

Sets one or more values in operation state at specified addresses. This is the primary card for initializing variables, copying data between state locations, and injecting literal values.

### Settings

- **Mappings** — An array of mapping objects. Each mapping has a `To` address (where to write) and either a `Value` (literal) or `From` address (copy from state).

### Events

- **Complete** — Fires after all mappings are applied.
- **Error** — Fires if a mapping fails.

### Tips

Use Set Values at the start of a flow to initialize default values before branching logic. Mappings are applied in order, so later entries can reference values set by earlier ones within the same card.

---

## Replace String

Replaces all occurrences of a search string within the input text.

### Settings

- **InputString** — The source text to search within. Supports Pict template expressions.
- **SearchString** — The text or pattern to find.
- **ReplaceString** — The replacement text (empty string to delete matches).
- **UseRegex** — When `true`, treats SearchString as a regular expression.
- **CaseSensitive** — Case-sensitive matching (default `true`).

### Outputs

- **ReplacedString** — The result after all replacements.
- **ReplacementCount** — Number of replacements made.

### Events

- **ReplaceComplete** — Fires after replacement.
- **Error** — Fires on failure (e.g. invalid regex).

### Tips

Enable UseRegex for advanced pattern matching such as removing HTML tags, normalizing whitespace, or extracting structured tokens. Use ReplacementCount to verify that expected substitutions occurred.

---

## String Appender

Appends a string to an existing value at a specified state address. Useful for building up output incrementally across loop iterations or multiple steps.

### Settings

- **InputString** — The text to append. Supports Pict template expressions.
- **OutputAddress** — State address of the string to append to.
- **AppendNewline** — When `true`, appends a newline character after the input string.
- **Separator** — String inserted between the existing content and new content. Overrides AppendNewline when set.

### Outputs

- **AppendedString** — The full accumulated string after appending.

### Events

- **Completed** — Fires after the append.

### Tips

Combine with **Split Execute** to build a report line by line. Use AppendNewline for log-style output or Separator for CSV-style concatenation with a custom delimiter.

---

## Template String

Processes a Pict template string against the current operation state, resolving expressions like `{~D:Record.Name~}` into their runtime values.

### Settings

- **Template** — A Pict template string containing `{~D:...~}` expressions that reference state addresses.
- **Destination** — State address to store the rendered result. If empty, the result is available at the default output.

### Outputs

- **Result** — The fully rendered template output.

### Events

- **Complete** — Fires after rendering.
- **Error** — Fires if template parsing fails.

### Tips

Template String is the workhorse for building dynamic URLs, file paths, messages, and prompts. Any Pict template expression is supported, including conditionals and joins. Chain multiple Template String cards to build complex content from intermediate values.

---

## Expression Solver

Evaluates a mathematical or logical expression using the Fable ExpressionParser and stores the result in state.

### Settings

- **Expression** — The expression to evaluate. Can reference state values by address.
- **Destination** — State address to store the evaluation result.

### Outputs

- **Result** — The computed result as a string.

### Events

- **Complete** — Fires after evaluation.
- **Error** — Fires on parse or evaluation failure.

### Tips

Use Expression Solver for arithmetic calculations, string length checks, or combining multiple state values into a computed result. The expression language supports standard math operators, comparisons, and common functions.

---

## Parse CSV

Parses CSV text into an array of records (objects with field names as keys).

### Settings

- **SourceAddress** — State address containing the CSV text to parse.
- **Delimiter** — Column delimiter character (default `,`).
- **HasHeaders** — When `true`, the first row provides field names. When `false`, fields are indexed numerically.
- **Destination** — State address to store the parsed records array.
- **QuoteCharacter** — Character used to quote fields that contain the delimiter (default `"`).
- **TrimFields** — Trim leading/trailing whitespace from field values.
- **SkipEmptyLines** — Skip blank lines in the input.

### Outputs

- **Records** — Array of parsed row objects.
- **ColumnCount** — Number of columns detected.
- **Headers** — Array of header names from the first row.

### Events

- **Complete** — Fires after parsing.

### Tips

Chain **Read File** → **Parse CSV** → **CSV Transform** for a complete data import pipeline. Use TrimFields and SkipEmptyLines to handle messy real-world CSV exports cleanly.

---

## CSV Transform

Transforms an array of parsed CSV records by applying field mappings, filters, and output field selection.

### Settings

- **SourceAddress** — State address of the records array to transform.
- **Destination** — State address to store the transformed records.
- **Delimiter** — Delimiter for re-serialization (default `,`).
- **FieldMapping** — JSON array of mapping objects with `From`, `To`, and optional `Template` properties for field renaming and transformation.
- **FilterExpression** — An expression to filter rows. Only rows where the expression evaluates to true are included.
- **OutputFields** — JSON array of field names to include in the output. Omit to include all fields.

### Outputs

- **Records** — The transformed records array.

### Events

- **Complete** — Fires after transformation.

### Tips

Use FieldMapping to rename columns, compute derived fields with templates, or restructure data. Combine with FilterExpression to extract subsets of records in a single step.

---

## Histogram

Computes a frequency distribution over a specific field in a dataset array.

### Settings

- **SourceAddress** — State address of the data array to analyze.
- **Field** — Field name to compute frequencies for (default `score`).
- **Bins** — Number of bins for numeric data (default `5`).
- **Destination** — State address to store the statistics object.
- **SortBy** — Sort frequency results by `count` or `key`.

### Outputs

- **Stats** — An object containing the frequency distribution, bin boundaries, and summary statistics.

### Events

- **Complete** — Fires after computation.

### Tips

Use Histogram after parsing or loading a dataset to get a quick statistical overview. Combine with **Template String** to generate a text-based report of the distribution.

---

## Comprehension Intersect

Intersects two arrays by matching records on a common field, similar to an SQL inner join.

### Settings

- **SourceAddressA** — State address of the first array.
- **SourceAddressB** — State address of the second array.
- **MatchField** — Field name to match records on. Records from both arrays with the same value in this field are merged.
- **Destination** — State address to store the intersected results.
- **JoinType** — Join type (default `inner`). Inner join returns only records that match in both arrays.

### Outputs

- **Result** — Array of merged record objects.
- **MatchCount** — Number of matched records.

### Events

- **Complete** — Fires after intersection.

### Tips

Use Comprehension Intersect to combine data from two different sources — for example, joining a list of user IDs from one API with user details from another. The matched records are merged into single objects containing fields from both sources.
