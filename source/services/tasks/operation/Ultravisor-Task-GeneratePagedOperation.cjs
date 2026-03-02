const libUltravisorTaskBase = require('../Ultravisor-Task-Base.cjs');

class UltravisorTaskGeneratePagedOperation extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Generate a paged operation from a template and optionally execute it.
	 *
	 * Task definition fields:
	 *   - RecordCount: GlobalState address (string) or literal number for
	 *       the total record count.
	 *   - PageSize (optional, default 25): records per page.
	 *   - MaximumRecordCount (optional): cap the resolved RecordCount to
	 *       this value.  Useful for fetching only the first N records.
	 *   - TaskTemplate: a task definition object used as the template for
	 *       each page-fetch task.  String values in the template support
	 *       interpolation variables: {PageStart}, {PageSize}, {PageIndex},
	 *       {PageCount}.
	 *   - OperationName (optional): human-readable name for the generated
	 *       operation.
	 *   - AutoExecute (optional, default true): whether to execute the
	 *       generated operation immediately.
	 *   - Retries (optional, default 0): number of retries per page task.
	 *   - Destination (optional): manyfest address in GlobalState to store
	 *       the generated operation GUID.
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskGeneratePagedOperation;
