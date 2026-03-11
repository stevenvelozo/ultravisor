/**
 * Built-in task type configurations for Ultravisor.
 *
 * Aggregates per-capability config files into a single array.
 * Each capability folder contains its own config file exporting
 * an array of task type definitions.
 */
module.exports = [].concat(
	require('./data-transform/Ultravisor-TaskConfigs-DataTransform.cjs'),
	require('./flow-control/Ultravisor-TaskConfigs-FlowControl.cjs'),
	require('./file-system/Ultravisor-TaskConfigs-FileSystem.cjs'),
	require('./shell/Ultravisor-TaskConfigs-Shell.cjs'),
	require('./http-client/Ultravisor-TaskConfigs-HttpClient.cjs'),
	require('./user-interaction/Ultravisor-TaskConfigs-UserInteraction.cjs'),
	require('./meadow-api/Ultravisor-TaskConfigs-MeadowApi.cjs'),
	require('./extension/Ultravisor-TaskConfigs-Extension.cjs')
);
