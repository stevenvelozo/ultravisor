/**
 * Task configurations for the "ContentSystem" capability.
 *
 * Provides dedicated cards for remote-controlling a retold-content-system
 * beacon.  Each task dispatches to a beacon advertising the ContentSystem
 * capability, using the shared beacon dispatch helper.
 *
 * Cards:
 *   - content-read-file    — Read a markdown/content file
 *   - content-save-file    — Save content to a file
 *   - content-list-files   — List files in a content directory
 *   - content-create-folder — Create a folder in the content directory
 */

const beaconDispatch = require('../Ultravisor-TaskHelper-BeaconDispatch.cjs');


module.exports =
[
	// ── content-read-file ─────────────────────────────────────────
	{
		Definition: require('./definitions/content-read-file.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			beaconDispatch(pTask, {
				Capability: 'ContentSystem',
				Action: 'ReadFile',
				Settings: {
					FilePath: pResolvedSettings.FilePath || ''
				},
				AffinityKey: pResolvedSettings.AffinityKey,
				TimeoutMs: pResolvedSettings.TimeoutMs
			}, pExecutionContext, fCallback);
		}
	},

	// ── content-save-file ─────────────────────────────────────────
	{
		Definition: require('./definitions/content-save-file.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			beaconDispatch(pTask, {
				Capability: 'ContentSystem',
				Action: 'SaveFile',
				Settings: {
					FilePath: pResolvedSettings.FilePath || '',
					Content: pResolvedSettings.Content || ''
				},
				AffinityKey: pResolvedSettings.AffinityKey,
				TimeoutMs: pResolvedSettings.TimeoutMs
			}, pExecutionContext, fCallback);
		}
	},

	// ── content-list-files ────────────────────────────────────────
	{
		Definition: require('./definitions/content-list-files.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			beaconDispatch(pTask, {
				Capability: 'ContentSystem',
				Action: 'ListFiles',
				Settings: {
					Path: pResolvedSettings.Path || '',
					Pattern: pResolvedSettings.Pattern || '',
					Recursive: pResolvedSettings.Recursive || false
				},
				AffinityKey: pResolvedSettings.AffinityKey,
				TimeoutMs: pResolvedSettings.TimeoutMs
			}, pExecutionContext, fCallback);
		}
	},

	// ── content-create-folder ─────────────────────────────────────
	{
		Definition: require('./definitions/content-create-folder.json'),
		Execute: function (pTask, pResolvedSettings, pExecutionContext, fCallback)
		{
			beaconDispatch(pTask, {
				Capability: 'ContentSystem',
				Action: 'CreateFolder',
				Settings: {
					Path: pResolvedSettings.Path || ''
				},
				AffinityKey: pResolvedSettings.AffinityKey,
				TimeoutMs: pResolvedSettings.TimeoutMs
			}, pExecutionContext, fCallback);
		}
	}
];
