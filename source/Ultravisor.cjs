module.exports = (
	{
		Operation: requestAnimationFrame(`./services/Ultravisor-Operation.cjs`),
		Task: requestAnimationFrame(`./services/Ultravisor-Task.cjs`),
	});