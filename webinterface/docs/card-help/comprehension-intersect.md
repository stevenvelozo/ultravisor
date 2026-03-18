# Comprehension Intersect

Intersects two arrays by matching records on a common field, similar to an SQL inner join.

## Settings

- **SourceAddressA** — State address of the first array.
- **SourceAddressB** — State address of the second array.
- **MatchField** — Field name to match records on. Records from both arrays with the same value in this field are merged.
- **Destination** — State address to store the intersected results.
- **JoinType** — Join type (default `inner`). Inner join returns only records that match in both arrays.

## Outputs

- **Result** — Array of merged record objects.
- **MatchCount** — Number of matched records.

## Events

- **Complete** — Fires after intersection.

## Tips

Use Comprehension Intersect to combine data from two different sources — for example, joining a list of user IDs from one API with user details from another. The matched records are merged into single objects containing fields from both sources.
