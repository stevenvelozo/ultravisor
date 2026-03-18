# String Appender

Appends a string to an existing value at a specified state address. Useful for building up output incrementally across loop iterations or multiple steps.

## Settings

- **InputString** — The text to append. Supports Pict template expressions.
- **OutputAddress** — State address of the string to append to.
- **AppendNewline** — When `true`, appends a newline character after the input string.
- **Separator** — String inserted between the existing content and new content. Overrides AppendNewline when set.

## Outputs

- **AppendedString** — The full accumulated string after appending.

## Events

- **Completed** — Fires after the append.

## Tips

Combine with **Split Execute** to build a report line by line. Use AppendNewline for log-style output or Separator for CSV-style concatenation with a custom delimiter.
