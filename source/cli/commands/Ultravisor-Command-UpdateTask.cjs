const libCommandLineCommand = require('pict-service-commandlineutility').ServiceCommandLineCommand;

const libFS = require('fs');
const libPath = require('path');

class UltravisorCommandAddTask extends libCommandLineCommand
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.options.CommandKeyword = 'updatetask';
		this.options.Description = 'Update (or add) a task to the available tasks.';

		this.options.CommandOptions.push({ Name:'-f, --file [json_filepath]', Description:'JSON Task definition file path.', Default:false });

		this.options.CommandOptions.push({ Name:'-g, --guid [task_guid]', Description:'The guid for the task.', Default:false });
		this.options.CommandOptions.push({ Name:'-c, --code [task_code]', Description:'The code for the task.', Default:false });
		this.options.CommandOptions.push({ Name:'-n, --name [task_name]', Description:'The name of the task.', Default:false });

		this.options.CommandOptions.push({ Name:'-t, --type [task_type]', Description:'The type of task.', Default:'CRON' });
		this.options.CommandOptions.push({ Name:'-p, --parameters [task_parameters]', Description:'The parameters of the task.', Default:'0 0 * * * *' });

		this.addCommand();
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

		tmpOperationState.TaskDefinition_Parameterized.GUIDTask = this.CommandOptions.guid;
		tmpOperationState.TaskDefinition_Parameterized.Code = this.CommandOptions.code;
		tmpOperationState.TaskDefinition_Parameterized.Name = this.CommandOptions.name;

		tmpOperationState.TaskDefinition_Parameterized.Type = this.CommandOptions.type;
		tmpOperationState.TaskDefinition_Parameterized.Parameters = this.CommandOptions.parameters;

		tmpOperationState.TaskDefinition = Object.assign({}, tmpOperationState.TaskDefinition_Parameterized, tmpOperationState.JSONFile);

		this.fable['Ultravisor-Hypervisor-State'].updateTask(tmpOperationState.TaskDefinition,
			function (pError, pUpdatedTask)
			{
				if (pError)
				{
					return fCallback(new Error(`Could not update task: ${pError.message}`));
				}

				console.log(`Task with GUID ${pUpdatedTask.GUIDTask} updated successfully.`);

				return fCallback();
			}.bind(this));
	}
}

module.exports = UltravisorCommandAddTask;