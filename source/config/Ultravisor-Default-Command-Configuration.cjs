module.exports = (
	{
		"UltravisorAPIServerPort": 54321,
		"UltravisorFileStorePath": `${process.cwd()}/dist/ultravisor_datastore`,
		"UltravisorStagingRoot": `${process.cwd()}/dist/ultravisor_staging`,
		"UltravisorTickIntervalMilliseconds": 60000,
		"UltravisorCommandTimeoutMilliseconds": 300000,
		"UltravisorCommandMaxBufferBytes": 10485760,
		"UltravisorWebInterfacePath": false
	});
