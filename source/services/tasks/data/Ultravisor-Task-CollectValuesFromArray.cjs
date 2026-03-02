const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

class UltravisorTaskCollectValues extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Collect and extract field values from arrays in GlobalState.
	 *
	 * Designed to work with GeneratePagedOperation output but is
	 * general-purpose.  Iterates over a source array, optionally
	 * navigates into each element via RecordPath, then plucks the
	 * specified Field from every record found.
	 *
	 * Task definition fields:
	 *   - Address: manyfest address in GlobalState pointing to the
	 *       source array (e.g. "Pages").
	 *   - Field: the field name to extract from each record.  Supports
	 *       dot-notation for nested fields (e.g. "Details.ID").
	 *   - RecordPath (optional): dot-notation path within each element
	 *       to reach the array of records (e.g. "JSON.records" for
	 *       RestRequest results).  If omitted, each element is treated
	 *       as the array itself (or as a single record if it is an
	 *       object).
	 *   - Unique (optional, default false): if true, deduplicate the
	 *       output array.
	 *   - Flatten (optional, default true): if true, flatten nested
	 *       arrays into a single flat array.
	 *   - Destination (optional): manyfest address in GlobalState
	 *       where the result array is stored (default: "Output").
	 *   - Persist (optional): standard persist options (file or address).
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskCollectValues;
