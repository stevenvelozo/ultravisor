const libUltravisorTaskBase = require('./Ultravisor-Task-Base.cjs');

class UltravisorTaskDateWindow extends libUltravisorTaskBase
{
	constructor(pFable)
	{
		super(pFable);
	}

	/**
	 * Compute the last completed time-aligned window.
	 *
	 * Calculates the most recent completed N-minute window aligned to
	 * clock boundaries (e.g. :00, :10, :20 for 10-minute windows).
	 *
	 * Examples for a 10-minute interval:
	 *   Current time 10:13 → window is 10:00 – 10:09:59.999
	 *   Current time 10:07 → window is 09:50 – 09:59:59.999
	 *   Current time 10:30 → window is 10:20 – 10:29:59.999
	 *
	 * Task definition fields:
	 *   - IntervalMinutes (optional, default 10): window size in minutes
	 *   - Destination (optional): manyfest address in GlobalState for
	 *       the result object (defaults to "Output")
	 *
	 * Result object:
	 *   {
	 *     WindowStart: "<ISO 8601>",  // e.g. "2026-02-12T04:20:00.000Z"
	 *     WindowEnd:   "<ISO 8601>"   // e.g. "2026-02-12T04:29:59.999Z"
	 *   }
	 */
	execute(pTaskDefinition, pContext, pManifestEntry, fCallback)
	{
		let tmpInterval = (typeof(pTaskDefinition.IntervalMinutes) === 'number' && pTaskDefinition.IntervalMinutes > 0)
			? pTaskDefinition.IntervalMinutes
			: 10;

		let tmpNow = new Date();

		// Floor to the nearest interval-aligned minute mark
		let tmpEndMinutes = Math.floor(tmpNow.getMinutes() / tmpInterval) * tmpInterval;

		let tmpEnd = new Date(tmpNow);
		tmpEnd.setMinutes(tmpEndMinutes, 0, 0);

		// The window start is one interval before the end
		let tmpStart = new Date(tmpEnd.getTime() - (tmpInterval * 60 * 1000));

		// The window end is 1ms before the aligned mark (exclusive upper bound)
		let tmpEndExclusive = new Date(tmpEnd.getTime() - 1);

		let tmpResult = {
			WindowStart: tmpStart.toISOString(),
			WindowEnd: tmpEndExclusive.toISOString()
		};

		pManifestEntry.StopTime = new Date().toISOString();
		pManifestEntry.Status = 'Complete';
		pManifestEntry.Success = true;
		pManifestEntry.Output = JSON.stringify(tmpResult);

		pManifestEntry.Log.push(`DateWindow: interval=${tmpInterval}min, now=${tmpNow.toISOString()}`);
		pManifestEntry.Log.push(`DateWindow: WindowStart=${tmpResult.WindowStart}`);
		pManifestEntry.Log.push(`DateWindow: WindowEnd=${tmpResult.WindowEnd}`);

		this.storeDestination(pTaskDefinition, pContext, pManifestEntry, tmpResult);

		return fCallback(null, pManifestEntry);
	}
}

module.exports = UltravisorTaskDateWindow;
