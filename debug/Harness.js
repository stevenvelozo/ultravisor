let libUltravisor = require(`../source/cli/Ultravisor-CLIProgram.cjs`);

//libUltravisor.run(['node', 'Harness.js', 'explain-config']);

//libUltravisor.run(['node', 'Harness.js', 'start']);

libUltravisor.run(['node', 'Harness.js', 'updatetask', '-g', 'EN-001-PerformSearch', '-n', 'Easynews - Perform Search', '-t', 'Manual', '-p', '']);
