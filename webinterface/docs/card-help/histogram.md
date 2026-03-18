# Histogram

Computes a frequency distribution over a specific field in a dataset array.

## Settings

- **SourceAddress** — State address of the data array to analyze.
- **Field** — Field name to compute frequencies for (default `score`).
- **Bins** — Number of bins for numeric data (default `5`).
- **Destination** — State address to store the statistics object.
- **SortBy** — Sort frequency results by `count` or `key`.

## Outputs

- **Stats** — An object containing the frequency distribution, bin boundaries, and summary statistics.

## Events

- **Complete** — Fires after computation.

## Tips

Use Histogram after parsing or loading a dataset to get a quick statistical overview. Combine with **Template String** to generate a text-based report of the distribution.
