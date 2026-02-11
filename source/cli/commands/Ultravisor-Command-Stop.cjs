const libCommandLineCommand = require('pict-service-commandlineutility').ServiceCommandLineCommand;

class UltravisorCommandStopService extends libCommandLineCommand
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.options.CommandKeyword = 'stop';
		this.options.Description = 'Stop the Ultravisor service.';

		this.addCommand();
	}

	onRunAsync(fCallback)
	{
		console.log(`Stopping Ultravisor...`);
		let tmpHypervisor = this.fable['Ultravisor-Hypervisor'];
		tmpHypervisor.stopSchedule();
		console.log(`Ultravisor schedule stopped.`);
		return fCallback();
	}
}

module.exports = UltravisorCommandStopService;