module.exports = (
	{
		TaskTypeBase: require('./services/tasks/Ultravisor-TaskType-Base.cjs'),
		TaskTypeRegistry: require('./services/Ultravisor-TaskTypeRegistry.cjs'),
		StateManager: require('./services/Ultravisor-StateManager.cjs'),
		ExecutionEngine: require('./services/Ultravisor-ExecutionEngine.cjs'),
		ExecutionManifest: require('./services/Ultravisor-ExecutionManifest.cjs'),
		HypervisorState: require('./services/Ultravisor-Hypervisor-State.cjs'),
		Hypervisor: require('./services/Ultravisor-Hypervisor.cjs'),

		// Task type classes
		TaskTypes:
		{
			ReadFile: require('./services/tasks/file-io/Ultravisor-TaskType-ReadFile.cjs'),
			WriteFile: require('./services/tasks/file-io/Ultravisor-TaskType-WriteFile.cjs'),
			SetValues: require('./services/tasks/data/Ultravisor-TaskType-SetValues.cjs'),
			ReplaceString: require('./services/tasks/data/Ultravisor-TaskType-ReplaceString.cjs'),
			StringAppender: require('./services/tasks/data/Ultravisor-TaskType-StringAppender.cjs'),
			IfConditional: require('./services/tasks/control/Ultravisor-TaskType-IfConditional.cjs'),
			SplitExecute: require('./services/tasks/control/Ultravisor-TaskType-SplitExecute.cjs'),
			ValueInput: require('./services/tasks/interaction/Ultravisor-TaskType-ValueInput.cjs'),
			ErrorMessage: require('./services/tasks/interaction/Ultravisor-TaskType-ErrorMessage.cjs')
		}
	});
