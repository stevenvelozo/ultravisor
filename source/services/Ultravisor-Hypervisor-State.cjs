const libPictService = require(`pict-serviceproviderbase`);

const libFS = require('fs');
const libPath = require('path');

class UltravisorHypervisorState extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this._Tasks = {};
		this._Operations = {};

		this._ConfigurationOutcome = this.fable.gatherProgramConfiguration(false);

		// Load tasks and operations from the gathered configuration
		let tmpConfig = this.fable.ProgramConfiguration || {};

		if (tmpConfig.Tasks && typeof(tmpConfig.Tasks) === 'object')
		{
			let tmpTaskKeys = Object.keys(tmpConfig.Tasks);
			for (let i = 0; i < tmpTaskKeys.length; i++)
			{
				this._Tasks[tmpTaskKeys[i]] = tmpConfig.Tasks[tmpTaskKeys[i]];
			}
		}

		if (tmpConfig.Operations && typeof(tmpConfig.Operations) === 'object')
		{
			let tmpOperationKeys = Object.keys(tmpConfig.Operations);
			for (let i = 0; i < tmpOperationKeys.length; i++)
			{
				this._Operations[tmpOperationKeys[i]] = tmpConfig.Operations[tmpOperationKeys[i]];
			}
		}
	}

	persistState()
	{
		// Check the _ConfigurationOutcome to see where we should be persisting state
		let tmpFinalGatherPhasePath = false;
		for (let i = 0; i < this._ConfigurationOutcome.GatherPhases.length; i++)
		{
			let tmpGatherPhase = this._ConfigurationOutcome.GatherPhases[i];
			if ((tmpGatherPhase.Phase != 'Default Program Configuration') && (tmpGatherPhase.Path))
			{
				tmpFinalGatherPhasePath = tmpGatherPhase.Path;
			}
		}

		if (!tmpFinalGatherPhasePath && this.fable.settings.ProgramConfigurationFileName)
		{
			tmpFinalGatherPhasePath = libPath.resolve(process.cwd(), this.fable.settings.ProgramConfigurationFileName);
			this.pict.log.warn(`Ultravisor Hypervisor State: persistState could not determine a valid configuration path to persist state to;.`);
		}
		else if (!tmpFinalGatherPhasePath)
		{
			this.pict.log.error(`Ultravisor Hypervisor State: persistState could not determine a valid configuration path to persist state to; state will not be saved.`);
			return;
		}

		// Now merge all the data
		const tmpStateToPersist = this._ConfigurationOutcome.ConfigurationOutcome;

		// Merge in Tasks
		if (!tmpStateToPersist.hasOwnProperty('Tasks'))
		{
			tmpStateToPersist.Tasks = {};
		}
		const tmpTaskKeys = Object.keys(this._Tasks);
		for (let i=0; i<tmpTaskKeys.length; i++)
		{
			if (tmpStateToPersist.Tasks.hasOwnProperty(tmpTaskKeys[i]))
			{
				tmpStateToPersist.Tasks[tmpTaskKeys[i]] = Object.assign({}, tmpStateToPersist.Tasks[tmpTaskKeys[i]], this._Tasks[tmpTaskKeys[i]]);
			}
			else
			{
				tmpStateToPersist.Tasks[tmpTaskKeys[i]] = this._Tasks[tmpTaskKeys[i]];
			}
		}

		if (!tmpStateToPersist.hasOwnProperty('Operations'))
		{
			tmpStateToPersist.Operations = {};
		}
		const tmpOperationKeys = Object.keys(this._Operations);
		for (let i=0; i<tmpOperationKeys.length; i++)
		{
			if (tmpStateToPersist.Operations.hasOwnProperty(tmpOperationKeys[i]))
			{
				tmpStateToPersist.Operations[tmpOperationKeys[i]] = Object.assign({}, tmpStateToPersist.Operations[tmpOperationKeys[i]], this._Operations[tmpOperationKeys[i]]);
			}
			else
			{
				tmpStateToPersist.Operations[tmpOperationKeys[i]] = this._Operations[tmpOperationKeys[i]];
			}
		}

		this.fable.log.info(`Ultravisor Hypervisor State: persisting hypervisor state to ${tmpFinalGatherPhasePath}.`);

		try
		{
			libFS.writeFileSync(tmpFinalGatherPhasePath, JSON.stringify(tmpStateToPersist, null, 4), 'utf8');
		}
		catch(pError)
		{
			this.fable.log.error(`Ultravisor Hypervisor State: an error occurred while attempting to persist hypervisor state to ${tmpFinalGatherPhasePath}: ${pError.message}`);
			return false;
		}

		return true
	}


	updateOperation(pOperation, fCallback)
	{
		if (typeof(pOperation) !== 'object' || pOperation === null)
		{
			return fCallback(new Error(`Ultravisor Hypervisor State: updateOperation requires a valid operation object.`));
		}
		if (!pOperation.hasOwnProperty('GUIDOperation') || typeof(pOperation.GUIDOperation) !== 'string' || pOperation.GUIDOperation.length === 0)
		{
			return fCallback(new Error(`Ultravisor Hypervisor State: updateOperation requires the operation object to have a GUIDOperation property.`));
		}

		if (this._Operations.hasOwnProperty(pOperation.GUIDOperation))
		{
			// Update the existing operation
			this._Operations[pOperation.GUIDOperation] = Object.assign(this._Operations[pOperation.GUIDOperation], pOperation);
		}
		else
		{
			// Add a new operation
			this._Operations[pOperation.GUIDOperation] = pOperation;
		}

		this.persistState();

		return fCallback(null, this._Operations[pOperation.GUIDOperation]);
	}

	getOperationList(pFilters, fCallback)
	{
		const tmpOperationKeys = Object.keys(this._Operations);
		const tmpOperations = [];
		for (let i=0; i<tmpOperationKeys.length; i++)
		{
			tmpOperations.push(this._Operations[tmpOperationKeys[i]]);
		}
		return fCallback(null, tmpOperations);
	}

	getOperation(pGUIDOperation, fCallback)
	{
		if (!this._Operations.hasOwnProperty(pGUIDOperation))
		{
			return fCallback(new Error(`Ultravisor Hypervisor State: getOperation could not find operation with GUID ${pGUIDOperation}.`));
		}
		return fCallback(null, this._Operations[pGUIDOperation]);
	}


	updateTask(pTask, fCallback)
	{
		if (typeof(pTask) !== 'object' || pTask === null)
		{
			return fCallback(new Error(`Ultravisor Hypervisor State: updateTask requires a valid task object.`));
		}
		if (!pTask.hasOwnProperty('GUIDTask') || typeof(pTask.GUIDTask) !== 'string' || pTask.GUIDTask.length === 0)
		{
			return fCallback(new Error(`Ultravisor Hypervisor State: updateTask requires the task object to have a GUIDTask property.`));
		}

		if (this._Tasks.hasOwnProperty(pTask.GUIDTask))
		{
			// Update the existing task
			this._Tasks[pTask.GUIDTask] = Object.assign(this._Tasks[pTask.GUIDTask], pTask);
		}
		else
		{
			// Add a new task
			this._Tasks[pTask.GUIDTask] = pTask;
		}

		this.persistState();

		return fCallback(null, this._Tasks[pTask.GUIDTask]);
	}

	getTaskList(pFilters, fCallback)
	{
		const tmpTaskKeys = Object.keys(this._Tasks);
		const tmpTasks = [];
		for (let i=0; i<tmpTaskKeys.length; i++)
		{
			tmpTasks.push(this._Tasks[tmpTaskKeys[i]]);
		}
		return fCallback(null, tmpTasks);
	}

	getTask(pGUIDTask, fCallback)
	{
		if (!this._Tasks.hasOwnProperty(pGUIDTask))
		{
			return fCallback(new Error(`Ultravisor Hypervisor State: getTask could not find task with GUID ${pGUIDTask}.`));
		}
		return fCallback(null, this._Tasks[pGUIDTask]);
	}
}

module.exports = UltravisorHypervisorState;