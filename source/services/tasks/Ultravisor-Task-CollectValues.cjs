const libUltravisorTaskBase = require('./Ultravisor-Task-Base.cjs');

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
		// --- Validate required fields ---
		if (!pTaskDefinition.Address || typeof(pTaskDefinition.Address) !== 'string' || pTaskDefinition.Address.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`CollectValues: missing or empty Address field.`);
			return fCallback(null, pManifestEntry);
		}

		if (!pTaskDefinition.Field || typeof(pTaskDefinition.Field) !== 'string' || pTaskDefinition.Field.length === 0)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Error';
			pManifestEntry.Log.push(`CollectValues: missing or empty Field field.`);
			return fCallback(null, pManifestEntry);
		}

		// --- Resolve source data ---
		let tmpSource = this.resolveAddress(pTaskDefinition.Address, pContext);

		if (tmpSource === undefined || tmpSource === null)
		{
			pManifestEntry.StopTime = new Date().toISOString();
			pManifestEntry.Status = 'Complete';
			pManifestEntry.Success = true;
			pManifestEntry.Output = '[]';
			pManifestEntry.Log.push(`CollectValues: Address "${pTaskDefinition.Address}" resolved to null or undefined; treating as empty set.`);
			this.storeDestination(pTaskDefinition, pContext, pManifestEntry, []);
			return fCallback(null, pManifestEntry);
		}

		// If the source is not an array, wrap it so we can iterate uniformly
		if (!Array.isArray(tmpSource))
		{
			if (typeof(tmpSource) === 'object')
			{
				tmpSource = [tmpSource];
				pManifestEntry.Log.push(`CollectValues: source is a single object; wrapped in array.`);
			}
			else
			{
				pManifestEntry.StopTime = new Date().toISOString();
				pManifestEntry.Status = 'Error';
				pManifestEntry.Log.push(`CollectValues: Address "${pTaskDefinition.Address}" did not resolve to an array or object.`);
				return fCallback(null, pManifestEntry);
			}
		}

		pManifestEntry.Log.push(`CollectValues: source has ${tmpSource.length} element(s).`);

		let tmpFieldParts = pTaskDefinition.Field.split('.');
		let tmpRecordPathParts = (pTaskDefinition.RecordPath && typeof(pTaskDefinition.RecordPath) === 'string' && pTaskDefinition.RecordPath.length > 0)
			? pTaskDefinition.RecordPath.split('.')
			: null;

		let tmpFlatten = (pTaskDefinition.Flatten !== false);
		let tmpUnique = (pTaskDefinition.Unique === true);

		// --- Iterate over each element in the source ---
		let tmpCollected = [];

		for (let i = 0; i < tmpSource.length; i++)
		{
			let tmpElement = tmpSource[i];

			if (tmpElement === null || tmpElement === undefined)
			{
				pManifestEntry.Log.push(`CollectValues: skipping null/undefined element at index ${i}.`);
				continue;
			}

			// If RecordPath is set, navigate into the element to find the records
			let tmpRecords = tmpElement;

			if (tmpRecordPathParts)
			{
				tmpRecords = this.walkObject(tmpElement, tmpRecordPathParts);

				if (tmpRecords === undefined || tmpRecords === null)
				{
					pManifestEntry.Log.push(`CollectValues: RecordPath "${pTaskDefinition.RecordPath}" resolved to null at index ${i}, skipping.`);
					continue;
				}
			}

			// Normalize to an array of records
			if (!Array.isArray(tmpRecords))
			{
				if (typeof(tmpRecords) === 'object')
				{
					tmpRecords = [tmpRecords];
				}
				else
				{
					pManifestEntry.Log.push(`CollectValues: element at index ${i} is not an array or object after RecordPath, skipping.`);
					continue;
				}
			}

			// Pluck the field from each record
			for (let j = 0; j < tmpRecords.length; j++)
			{
				let tmpRecord = tmpRecords[j];

				if (tmpRecord === null || tmpRecord === undefined || typeof(tmpRecord) !== 'object')
				{
					continue;
				}

				let tmpValue = this.walkObject(tmpRecord, tmpFieldParts);

				if (tmpValue !== undefined)
				{
					tmpCollected.push(tmpValue);
				}
			}
		}

		pManifestEntry.Log.push(`CollectValues: collected ${tmpCollected.length} value(s) from field "${pTaskDefinition.Field}".`);

		// --- Flatten ---
		if (tmpFlatten)
		{
			tmpCollected = tmpCollected.flat(Infinity);
		}

		// --- Deduplicate ---
		if (tmpUnique)
		{
			let tmpBefore = tmpCollected.length;
			tmpCollected = [...new Set(tmpCollected)];
			if (tmpCollected.length < tmpBefore)
			{
				pManifestEntry.Log.push(`CollectValues: deduplicated from ${tmpBefore} to ${tmpCollected.length} value(s).`);
			}
		}

		// --- Store results ---
		pManifestEntry.StopTime = new Date().toISOString();
		pManifestEntry.Status = 'Complete';
		pManifestEntry.Success = true;
		pManifestEntry.Output = JSON.stringify(tmpCollected);

		this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpCollected);
		this.storeResult(pTaskDefinition, pContext, pManifestEntry, tmpCollected);

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskCollectValues;
