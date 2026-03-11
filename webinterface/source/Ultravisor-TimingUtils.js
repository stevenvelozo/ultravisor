/**
 * Ultravisor Timing Utilities
 *
 * Shared constants and helper functions for timing visualization,
 * used by both TimingView and ManifestList views.
 */

// ── Category color palette for timing bar charts ──────────────────────
const CategoryColors =
{
	'Core': { bar: 'linear-gradient(90deg, #5c6bc0, #7986cb)', text: '#9fa8da' },
	'File I/O': { bar: 'linear-gradient(90deg, #00897b, #26a69a)', text: '#80cbc4' },
	'Control': { bar: 'linear-gradient(90deg, #f9a825, #fdd835)', text: '#fff59d' },
	'REST': { bar: 'linear-gradient(90deg, #e65100, #ff6d00)', text: '#ffab91' },
	'Meadow': { bar: 'linear-gradient(90deg, #6a1b9a, #8e24aa)', text: '#ce93d8' },
	'Pipeline': { bar: 'linear-gradient(90deg, #00838f, #0097a7)', text: '#80deea' },
	'Data': { bar: 'linear-gradient(90deg, #4e342e, #6d4c41)', text: '#bcaaa4' },
	'Interaction': { bar: 'linear-gradient(90deg, #1565c0, #1e88e5)', text: '#90caf9' },
	'Uncategorized': { bar: 'linear-gradient(90deg, #37474f, #546e7a)', text: '#90a4ae' }
};

/**
 * Format milliseconds into a human-readable duration string.
 *
 * @param {number} pMs - Duration in milliseconds
 * @returns {string} Formatted duration (e.g. "42ms", "3s 210ms", "2m 15s")
 */
function formatMs(pMs)
{
	if (typeof pMs !== 'number' || pMs <= 0)
	{
		return '0ms';
	}
	if (pMs < 1000)
	{
		return Math.round(pMs) + 'ms';
	}
	if (pMs < 60000)
	{
		let tmpSeconds = Math.floor(pMs / 1000);
		let tmpMs = Math.round(pMs % 1000);
		return tmpSeconds + 's ' + tmpMs + 'ms';
	}
	let tmpMinutes = Math.floor(pMs / 60000);
	let tmpSeconds = Math.floor((pMs % 60000) / 1000);
	return tmpMinutes + 'm ' + tmpSeconds + 's';
}

/**
 * Compute total ElapsedMs for a TaskManifest entry by summing its Executions.
 *
 * @param {object} pTaskManifest - A task manifest entry with Executions array
 * @returns {number} Total elapsed time in milliseconds
 */
function computeTaskElapsedMs(pTaskManifest)
{
	let tmpTotal = 0;

	if (pTaskManifest.Executions && pTaskManifest.Executions.length > 0)
	{
		for (let i = 0; i < pTaskManifest.Executions.length; i++)
		{
			tmpTotal += (pTaskManifest.Executions[i].ElapsedMs || 0);
		}
	}

	return tmpTotal;
}

/**
 * Determine the overall status for a task from its Executions array.
 *
 * @param {object} pTaskManifest - A task manifest entry with Executions array
 * @returns {string} Status string (e.g. "Complete", "Error", "Running", "Unknown")
 */
function computeTaskStatus(pTaskManifest)
{
	if (!pTaskManifest.Executions || pTaskManifest.Executions.length === 0)
	{
		return 'Unknown';
	}

	let tmpLastExec = pTaskManifest.Executions[pTaskManifest.Executions.length - 1];
	return tmpLastExec.Status || 'Unknown';
}

/**
 * Escape HTML special characters for safe insertion into markup.
 *
 * @param {*} pValue - Value to escape
 * @returns {string} Escaped string
 */
function escapeHTML(pValue)
{
	if (!pValue) return '';
	return String(pValue).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { CategoryColors, formatMs, computeTaskElapsedMs, computeTaskStatus, escapeHTML };
