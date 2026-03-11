module.exports = (
	{
		TaskTypeBase: require('./services/tasks/Ultravisor-TaskType-Base.cjs'),
		TaskTypeRegistry: require('./services/Ultravisor-TaskTypeRegistry.cjs'),
		StateManager: require('./services/Ultravisor-StateManager.cjs'),
		ExecutionEngine: require('./services/Ultravisor-ExecutionEngine.cjs'),
		ExecutionManifest: require('./services/Ultravisor-ExecutionManifest.cjs'),
		HypervisorState: require('./services/Ultravisor-Hypervisor-State.cjs'),
		Hypervisor: require('./services/Ultravisor-Hypervisor.cjs'),

		// Config-driven task type definitions (preferred for new tasks)
		BuiltInTaskConfigs: require('./services/tasks/Ultravisor-BuiltIn-TaskConfigs.cjs'),

		// Task type classes (kept for backward compatibility)
		TaskTypes:
		{
			ReadFile: require('./services/tasks/file-system/Ultravisor-TaskType-ReadFile.cjs'),
			WriteFile: require('./services/tasks/file-system/Ultravisor-TaskType-WriteFile.cjs'),
			SetValues: require('./services/tasks/data-transform/Ultravisor-TaskType-SetValues.cjs'),
			ReplaceString: require('./services/tasks/data-transform/Ultravisor-TaskType-ReplaceString.cjs'),
			StringAppender: require('./services/tasks/data-transform/Ultravisor-TaskType-StringAppender.cjs'),
			IfConditional: require('./services/tasks/flow-control/Ultravisor-TaskType-IfConditional.cjs'),
			SplitExecute: require('./services/tasks/flow-control/Ultravisor-TaskType-SplitExecute.cjs'),
			LaunchOperation: require('./services/tasks/flow-control/Ultravisor-TaskType-LaunchOperation.cjs'),
			ValueInput: require('./services/tasks/user-interaction/Ultravisor-TaskType-ValueInput.cjs'),
			ErrorMessage: require('./services/tasks/user-interaction/Ultravisor-TaskType-ErrorMessage.cjs')
		}
	});
