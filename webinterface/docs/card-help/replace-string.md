# Replace String

Replaces all occurrences of a search string within the input text.

## Settings

- **InputString** — The source text to search within. Supports Pict template expressions.
- **SearchString** — The text or pattern to find.
- **ReplaceString** — The replacement text (empty string to delete matches).
- **UseRegex** — When `true`, treats SearchString as a regular expression.
- **CaseSensitive** — Case-sensitive matching (default `true`).

## Outputs

- **ReplacedString** — The result after all replacements.
- **ReplacementCount** — Number of replacements made.

## Events

- **ReplaceComplete** — Fires after replacement.
- **Error** — Fires on failure (e.g. invalid regex).

## Tips

Enable UseRegex for advanced pattern matching such as removing HTML tags, normalizing whitespace, or extracting structured tokens. Use ReplacementCount to verify that expected substitutions occurred.
