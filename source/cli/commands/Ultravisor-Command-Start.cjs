const libCommandLineCommand = require('pict-service-commandlineutility').ServiceCommandLineCommand;

class UltravisorCommandStartService extends libCommandLineCommand
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.options.CommandKeyword = 'start';
		this.options.Description = 'Start the Ultravisor service.';

		this.options.CommandOptions.push({ Name: '-v, --verbose', Description: 'Provide verbose console output.', Default: false });

		this.addCommand();
	}

	onRunAsync(fCallback)
	{
		// TODO: What to do with verbose!
		console.log(`Starting Ultravisor API Server...`);
		return this.fable['Ultravisor-API-Server'].start(fCallback);
	}
}

module.exports = UltravisorCommandStartService;