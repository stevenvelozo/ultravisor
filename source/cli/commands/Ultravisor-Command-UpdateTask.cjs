const libCommandLineCommand = require('pict-service-commandlineutility').ServiceCommandLineCommand;

const libFS = require('fs');
const libPath = require('path');

class UltravisorCommandAddTask extends libCommandLineCommand
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.options.CommandKeyword = 'updatetask';
		this.options.Description = 'Update (or add) a task definition.';

		this.options.CommandOptions.push({ Name:'-f, --file [json_filepath]', Description:'JSON Task definition file path.', Default:false });

		this.options.CommandOptions.push({ Name:'-h, --hash [task_hash]', Description:'The hash for the task definition.', Default:false });
		this.options.CommandOptions.push({ Name:'-n, --name [task_name]', Description:'The name of the task.', Default:false });

		this.options.CommandOptions.push({ Name:'-t, --type [task_type]', Description:'The type of task (e.g. read-file, write-file, set-values).', Default:false });

		this.addCommand();
	}

	_getService(pTypeName)
	{
		return this.fable.servicesMap[pTypeName]
			? Object.values(this.fable.servicesMap[pTypeName])[0]
			: null;
	}

	onRunAsync(fCallback)
	{
		const tmpOperationState = {};

		tmpOperationState.JSONFile = false;

		if (this.CommandOptions.json_filepath)
		{
			tmpOperationState.TaskDefinition_JSONFilePathRaw = this.CommandOptions.json_filepath;
			tmpOperationState.TaskDefinition_JSONFilePath = libPath.resolve(tmpOperationState.TaskDefinition_JSONFilePathRaw);

			if (!libFS.existsSync(tmpOperationState.TaskDefinition_JSONFilePath))
			{
				tmpOperationState.TaskDefinition_JSONFilePath = libPath.resolve(process.cwd(), tmpOperationState.TaskDefinition_JSONFilePathRaw);

				if (!libFS.existsSync(tmpOperationState.TaskDefinition_JSONFilePath))
				{
					return fCallback(new Error(`The specified task definition JSON file could not be found at either path: ${tmpOperationState.TaskDefinition_JSONFilePathRaw} or ${tmpOperationState.TaskDefinition_JSONFilePath}`));
				}
			}
			if (tmpOperationState.TaskDefinition_JSONFilePath && (tmpOperationState.TaskDefinition_JSONFilePath.length > 0))
			{
				try
				{
					const tmpFileContents = libFS.readFileSync(tmpOperationState.TaskDefinition_JSONFilePath, 'utf8');
					tmpOperationState.JSONFile = JSON.parse(tmpFileContents);
				}
				catch(pError)
				{
					return fCallback(new Error(`The specified task definition JSON file could not be read or parsed: ${pError.message}`));
				}
			}
		}
		else
		{
			tmpOperationState.JSONFile = {};
		}

		tmpOperationState.TaskDefinition_Parameterized = {};

		if (this.CommandOptions.hash)
		{
			tmpOperationState.TaskDefinition_Parameterized.Hash = this.CommandOptions.hash;
		}
		if (this.CommandOptions.name)
		{
			tmpOperationState.TaskDefinition_Parameterized.Name = this.CommandOptions.name;
		}
		if (this.CommandOptions.type)
		{
			tmpOperationState.TaskDefinition_Parameterized.Type = this.CommandOptions.type;
		}

		tmpOperationState.TaskDefinition = Object.assign({}, tmpOperationState.TaskDefinition_Parameterized, tmpOperationState.JSONFile);

		let tmpStateService = this._getService('UltravisorHypervisorState');
		tmpStateService.updateTaskDefinition(tmpOperationState.TaskDefinition,
			function (pError, pUpdatedTask)
			{
				if (pError)
				{
					return fCallback(new Error(`Could not update task definition: ${pError.message}`));
				}

				console.log(`Task definition ${pUpdatedTask.Hash} updated successfully.`);

				return fCallback();
			}.bind(this));
	}
}

module.exports = UltravisorCommandAddTask;
