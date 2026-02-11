/**
* Unit tests for Ultravisor
*/

var libUltravisor = require('../source/cli/Ultravisor-CLIProgram.cjs');

var Chai = require("chai");
var Expect = Chai.expect;

suite
(
	'Ultravisor',
	function()
	{
		setup ( () => {} );

		suite
		(
			'Execution Sanity',
			function()
			{
				test
				(
					'Ultravisor should load up okay.',
					function()
					{
						let testUltravisor = libUltravisor;
						Expect(testUltravisor.settings.Product).to.equal('Ultravisor-CLI');
					}
				);
			}
		);

		suite
		(
			'Hypervisor State',
			function()
			{
				test
				(
					'Should create and retrieve a task.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						tmpState.updateTask(
							{
								GUIDTask: 'TEST-TASK-001',
								Name: 'Test Task One',
								Type: 'Command',
								Command: 'echo hello'
							},
							function (pError, pTask)
							{
								Expect(pError).to.be.null;
								Expect(pTask.GUIDTask).to.equal('TEST-TASK-001');
								Expect(pTask.Name).to.equal('Test Task One');

								tmpState.getTask('TEST-TASK-001',
									function (pGetError, pRetrievedTask)
									{
										Expect(pGetError).to.be.null;
										Expect(pRetrievedTask.GUIDTask).to.equal('TEST-TASK-001');
										Expect(pRetrievedTask.Command).to.equal('echo hello');
										fDone();
									});
							});
					}
				);

				test
				(
					'Should update an existing task.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						tmpState.updateTask(
							{
								GUIDTask: 'TEST-TASK-001',
								Name: 'Test Task One Updated',
								Command: 'echo updated'
							},
							function (pError, pTask)
							{
								Expect(pError).to.be.null;
								Expect(pTask.Name).to.equal('Test Task One Updated');
								Expect(pTask.Command).to.equal('echo updated');
								fDone();
							});
					}
				);

				test
				(
					'Should list tasks.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						tmpState.getTaskList({},
							function (pError, pTasks)
							{
								Expect(pError).to.be.null;
								Expect(pTasks).to.be.an('array');
								Expect(pTasks.length).to.be.at.least(1);
								fDone();
							});
					}
				);

				test
				(
					'Should fail on invalid task.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						tmpState.updateTask(null,
							function (pError)
							{
								Expect(pError).to.not.be.null;
								fDone();
							});
					}
				);

				test
				(
					'Should fail on task missing GUIDTask.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						tmpState.updateTask({ Name: 'No GUID' },
							function (pError)
							{
								Expect(pError).to.not.be.null;
								fDone();
							});
					}
				);

				test
				(
					'Should create and retrieve an operation.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						tmpState.updateOperation(
							{
								GUIDOperation: 'TEST-OP-001',
								Name: 'Test Operation One',
								Tasks: ['TEST-TASK-001']
							},
							function (pError, pOp)
							{
								Expect(pError).to.be.null;
								Expect(pOp.GUIDOperation).to.equal('TEST-OP-001');

								tmpState.getOperation('TEST-OP-001',
									function (pGetError, pRetrievedOp)
									{
										Expect(pGetError).to.be.null;
										Expect(pRetrievedOp.Tasks).to.include('TEST-TASK-001');
										fDone();
									});
							});
					}
				);

				test
				(
					'Should list operations.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						tmpState.getOperationList({},
							function (pError, pOps)
							{
								Expect(pError).to.be.null;
								Expect(pOps).to.be.an('array');
								Expect(pOps.length).to.be.at.least(1);
								fDone();
							});
					}
				);

				test
				(
					'Should return error for nonexistent task.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						tmpState.getTask('NONEXISTENT',
							function (pError)
							{
								Expect(pError).to.not.be.null;
								fDone();
							});
					}
				);

				test
				(
					'Should return error for nonexistent operation.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						tmpState.getOperation('NONEXISTENT',
							function (pError)
							{
								Expect(pError).to.not.be.null;
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Task Execution',
			function()
			{
				test
				(
					'Should execute a command task.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'EXEC-CMD-001',
								Name: 'Echo Test',
								Type: 'Command',
								Command: 'echo test_output'
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult).to.be.an('object');
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);
								Expect(pResult.Output).to.contain('test_output');
								fDone();
							});
					}
				);

				test
				(
					'Should handle command task failure.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'EXEC-CMD-FAIL',
								Name: 'Fail Test',
								Type: 'Command',
								Command: 'exit 1'
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								Expect(pResult.Success).to.equal(false);
								fDone();
							});
					}
				);

				test
				(
					'Should handle task with no command.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'EXEC-CMD-EMPTY',
								Name: 'Empty Command',
								Type: 'Command'
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								fDone();
							});
					}
				);

				test
				(
					'Should handle unsupported task type.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'EXEC-UNKNOWN',
								Name: 'Unknown Type',
								Type: 'Browser'
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Unsupported');
								fDone();
							});
					}
				);

				test
				(
					'Should fail on null task definition.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(null, {},
							function (pError)
							{
								Expect(pError).to.not.be.null;
								fDone();
							});
					}
				);

				test
				(
					'Should use Parameters as fallback for Command.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'EXEC-PARAMS-001',
								Name: 'Params Test',
								Type: 'Command',
								Parameters: 'echo from_parameters'
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Output).to.contain('from_parameters');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Operation Manifest',
			function()
			{
				test
				(
					'Should create and finalize a manifest.',
					function()
					{
						let tmpManifestService = libUltravisor.fable['Ultravisor-Operation-Manifest'];

						let tmpManifest = tmpManifestService.createManifest(
							{
								GUIDOperation: 'MANIFEST-TEST-001',
								Name: 'Manifest Test Op'
							});

						Expect(tmpManifest).to.be.an('object');
						Expect(tmpManifest.GUIDOperation).to.equal('MANIFEST-TEST-001');
						Expect(tmpManifest.Status).to.equal('Running');

						tmpManifestService.addTaskResult(tmpManifest,
							{
								GUIDTask: 'TASK-A',
								Status: 'Complete',
								Success: true
							});

						tmpManifestService.finalizeManifest(tmpManifest);

						Expect(tmpManifest.Status).to.equal('Complete');
						Expect(tmpManifest.Success).to.equal(true);
						Expect(tmpManifest.TaskResults.length).to.equal(1);
					}
				);

				test
				(
					'Should track failed tasks in manifest.',
					function()
					{
						let tmpManifestService = libUltravisor.fable['Ultravisor-Operation-Manifest'];

						let tmpManifest = tmpManifestService.createManifest(
							{
								GUIDOperation: 'MANIFEST-FAIL-001',
								Name: 'Manifest Fail Test'
							});

						tmpManifestService.addTaskResult(tmpManifest,
							{
								GUIDTask: 'TASK-B',
								Status: 'Complete',
								Success: true
							});

						tmpManifestService.addTaskResult(tmpManifest,
							{
								GUIDTask: 'TASK-C',
								Status: 'Error',
								Success: false
							});

						tmpManifestService.finalizeManifest(tmpManifest);

						Expect(tmpManifest.Status).to.equal('Error');
						Expect(tmpManifest.Success).to.equal(false);
						Expect(tmpManifest.TaskResults.length).to.equal(2);
					}
				);

				test
				(
					'Should list manifests.',
					function()
					{
						let tmpManifestService = libUltravisor.fable['Ultravisor-Operation-Manifest'];
						let tmpList = tmpManifestService.getManifestList();
						Expect(tmpList).to.be.an('array');
						Expect(tmpList.length).to.be.at.least(2);
					}
				);

				test
				(
					'Should get a manifest by run GUID.',
					function()
					{
						let tmpManifestService = libUltravisor.fable['Ultravisor-Operation-Manifest'];
						let tmpList = tmpManifestService.getManifestList();
						let tmpRunGUID = tmpList[0].GUIDRun;
						let tmpManifest = tmpManifestService.getManifest(tmpRunGUID);
						Expect(tmpManifest).to.not.be.null;
						Expect(tmpManifest.GUIDRun).to.equal(tmpRunGUID);
					}
				);

				test
				(
					'Should return null for nonexistent manifest.',
					function()
					{
						let tmpManifestService = libUltravisor.fable['Ultravisor-Operation-Manifest'];
						let tmpManifest = tmpManifestService.getManifest('DOES-NOT-EXIST');
						Expect(tmpManifest).to.be.null;
					}
				);
			}
		);

		suite
		(
			'Operation Execution',
			function()
			{
				test
				(
					'Should execute an operation with tasks.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];

						// Ensure test task exists with a command
						tmpState.updateTask(
							{
								GUIDTask: 'OP-EXEC-TASK-001',
								Name: 'Op Exec Task',
								Type: 'Command',
								Command: 'echo op_task_output'
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpState.updateOperation(
									{
										GUIDOperation: 'OP-EXEC-001',
										Name: 'Execution Test Op',
										Tasks: ['OP-EXEC-TASK-001']
									},
									function (pOpError)
									{
										Expect(pOpError).to.be.null;

										tmpOperationService.executeOperation(
											{
												GUIDOperation: 'OP-EXEC-001',
												Name: 'Execution Test Op',
												Tasks: ['OP-EXEC-TASK-001']
											},
											function (pExecError, pManifest)
											{
												Expect(pExecError).to.be.null;
												Expect(pManifest.Status).to.equal('Complete');
												Expect(pManifest.Success).to.equal(true);
												Expect(pManifest.TaskResults.length).to.equal(1);
												fDone();
											});
									});
							});
					}
				);

				test
				(
					'Should handle operation with no tasks.',
					function(fDone)
					{
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];

						tmpOperationService.executeOperation(
							{
								GUIDOperation: 'OP-EMPTY-001',
								Name: 'Empty Op',
								Tasks: []
							},
							function (pError, pManifest)
							{
								Expect(pError).to.be.null;
								Expect(pManifest.TaskResults.length).to.equal(0);
								fDone();
							});
					}
				);

				test
				(
					'Should handle operation with missing task reference.',
					function(fDone)
					{
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];

						tmpOperationService.executeOperation(
							{
								GUIDOperation: 'OP-MISSING-TASK',
								Name: 'Missing Task Op',
								Tasks: ['NONEXISTENT-TASK-999']
							},
							function (pError, pManifest)
							{
								Expect(pError).to.be.null;
								Expect(pManifest.TaskResults.length).to.equal(0);
								fDone();
							});
					}
				);

				test
				(
					'Should fail on null operation definition.',
					function(fDone)
					{
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];

						tmpOperationService.executeOperation(null,
							function (pError)
							{
								Expect(pError).to.not.be.null;
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Hypervisor Scheduling',
			function()
			{
				test
				(
					'Should schedule a task.',
					function(fDone)
					{
						let tmpHypervisor = libUltravisor.fable['Ultravisor-Hypervisor'];

						tmpHypervisor.scheduleTask('TEST-TASK-001', 'cron', '*/30 * * * *',
							function (pError, pEntry)
							{
								Expect(pError).to.be.null;
								Expect(pEntry).to.be.an('object');
								Expect(pEntry.TargetType).to.equal('Task');
								Expect(pEntry.TargetGUID).to.equal('TEST-TASK-001');
								Expect(pEntry.CronExpression).to.equal('*/30 * * * *');
								fDone();
							});
					}
				);

				test
				(
					'Should schedule an operation.',
					function(fDone)
					{
						let tmpHypervisor = libUltravisor.fable['Ultravisor-Hypervisor'];

						tmpHypervisor.scheduleOperation('TEST-OP-001', 'daily', '0 0 * * *',
							function (pError, pEntry)
							{
								Expect(pError).to.be.null;
								Expect(pEntry.TargetType).to.equal('Operation');
								Expect(pEntry.TargetGUID).to.equal('TEST-OP-001');
								fDone();
							});
					}
				);

				test
				(
					'Should return the schedule.',
					function()
					{
						let tmpHypervisor = libUltravisor.fable['Ultravisor-Hypervisor'];
						let tmpSchedule = tmpHypervisor.getSchedule();
						Expect(tmpSchedule).to.be.an('array');
						Expect(tmpSchedule.length).to.be.at.least(2);
					}
				);

				test
				(
					'Should access schedule via getter.',
					function()
					{
						let tmpHypervisor = libUltravisor.fable['Ultravisor-Hypervisor'];
						let tmpSchedule = tmpHypervisor.schedule;
						Expect(tmpSchedule).to.be.an('array');
						Expect(tmpSchedule.length).to.be.at.least(2);
					}
				);

				test
				(
					'Should remove a schedule entry.',
					function(fDone)
					{
						let tmpHypervisor = libUltravisor.fable['Ultravisor-Hypervisor'];
						let tmpSchedule = tmpHypervisor.getSchedule();
						let tmpInitialLength = tmpSchedule.length;
						let tmpGUID = tmpSchedule[0].GUID;

						tmpHypervisor.removeScheduleEntry(tmpGUID,
							function (pError)
							{
								Expect(pError).to.be.null;
								Expect(tmpHypervisor.getSchedule().length).to.equal(tmpInitialLength - 1);
								fDone();
							});
					}
				);

				test
				(
					'Should fail to remove nonexistent schedule entry.',
					function(fDone)
					{
						let tmpHypervisor = libUltravisor.fable['Ultravisor-Hypervisor'];

						tmpHypervisor.removeScheduleEntry('NONEXISTENT-SCHED',
							function (pError)
							{
								Expect(pError).to.not.be.null;
								fDone();
							});
					}
				);

				test
				(
					'Should resolve hourly schedule type.',
					function(fDone)
					{
						let tmpHypervisor = libUltravisor.fable['Ultravisor-Hypervisor'];

						tmpHypervisor.scheduleTask('TEST-TASK-001', 'hourly', '',
							function (pError, pEntry)
							{
								Expect(pError).to.be.null;
								Expect(pEntry.CronExpression).to.equal('0 * * * *');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Subsequent Tasks',
			function()
			{
				// Register helper tasks used by subsequent sets
				test
				(
					'Should register helper tasks for subsequent tests.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpAnticipate = libUltravisor.fable.newAnticipate();

						let tmpHelperTasks = [
							{ GUIDTask: 'SUB-BEFORE-A', Name: 'Before A', Type: 'Command', Command: 'echo before_a' },
							{ GUIDTask: 'SUB-BEFORE-B', Name: 'Before B', Type: 'Command', Command: 'echo before_b' },
							{ GUIDTask: 'SUB-COMPLETE-A', Name: 'Complete A', Type: 'Command', Command: 'echo complete_a' },
							{ GUIDTask: 'SUB-COMPLETE-B', Name: 'Complete B', Type: 'Command', Command: 'echo complete_b' },
							{ GUIDTask: 'SUB-SUBSEQUENT-A', Name: 'Subsequent A', Type: 'Command', Command: 'echo subsequent_a' },
							{ GUIDTask: 'SUB-FAILURE-A', Name: 'Failure A', Type: 'Command', Command: 'echo failure_a' },
							{ GUIDTask: 'SUB-ERROR-A', Name: 'Error A', Type: 'Command', Command: 'echo error_a' },
							{ GUIDTask: 'SUB-ERROR-B', Name: 'Error B', Type: 'Command', Command: 'echo error_b' }
						];

						for (let i = 0; i < tmpHelperTasks.length; i++)
						{
							tmpAnticipate.anticipate(
								function (fNext)
								{
									tmpState.updateTask(tmpHelperTasks[i], function () { fNext(); });
								});
						}

						tmpAnticipate.wait(function () { fDone(); });
					}
				);

				test
				(
					'Should execute onBefore tasks before the core task.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-WITH-BEFORE',
								Name: 'Task With Before',
								Type: 'Command',
								Command: 'echo core_task',
								onBefore: ['SUB-BEFORE-A', 'SUB-BEFORE-B']
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.SubsequentResults).to.be.an('object');
								Expect(pResult.SubsequentResults.onBefore).to.be.an('array');
								Expect(pResult.SubsequentResults.onBefore.length).to.equal(2);
								Expect(pResult.SubsequentResults.onBefore[0].GUIDTask).to.equal('SUB-BEFORE-A');
								Expect(pResult.SubsequentResults.onBefore[0].Success).to.equal(true);
								Expect(pResult.SubsequentResults.onBefore[1].GUIDTask).to.equal('SUB-BEFORE-B');
								Expect(pResult.SubsequentResults.onBefore[1].Success).to.equal(true);
								fDone();
							});
					}
				);

				test
				(
					'Should execute onCompletion tasks after a successful core task.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-WITH-COMPLETION',
								Name: 'Task With Completion',
								Type: 'Command',
								Command: 'echo success',
								onCompletion: ['SUB-COMPLETE-A', 'SUB-COMPLETE-B']
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.SubsequentResults.onCompletion).to.be.an('array');
								Expect(pResult.SubsequentResults.onCompletion.length).to.equal(2);
								Expect(pResult.SubsequentResults.onCompletion[0].Success).to.equal(true);
								Expect(pResult.SubsequentResults.onCompletion[1].Success).to.equal(true);
								fDone();
							});
					}
				);

				test
				(
					'Should NOT execute onCompletion tasks after a failed core task.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-FAIL-NO-COMPLETION',
								Name: 'Fail No Completion',
								Type: 'Command',
								Command: 'exit 1',
								onCompletion: ['SUB-COMPLETE-A']
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								Expect(pResult.SubsequentResults.onCompletion).to.be.undefined;
								fDone();
							});
					}
				);

				test
				(
					'Should execute onSubsequent tasks regardless of outcome.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-SUBSEQ-SUCCESS',
								Name: 'Subsequent on Success',
								Type: 'Command',
								Command: 'echo ok',
								onSubsequent: ['SUB-SUBSEQUENT-A']
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.SubsequentResults.onSubsequent).to.be.an('array');
								Expect(pResult.SubsequentResults.onSubsequent.length).to.equal(1);
								Expect(pResult.SubsequentResults.onSubsequent[0].Success).to.equal(true);
								fDone();
							});
					}
				);

				test
				(
					'Should execute onSubsequent tasks even after failure.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-SUBSEQ-FAIL',
								Name: 'Subsequent on Failure',
								Type: 'Command',
								Command: 'exit 1',
								onSubsequent: ['SUB-SUBSEQUENT-A']
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								Expect(pResult.SubsequentResults.onSubsequent).to.be.an('array');
								Expect(pResult.SubsequentResults.onSubsequent.length).to.equal(1);
								Expect(pResult.SubsequentResults.onSubsequent[0].Success).to.equal(true);
								fDone();
							});
					}
				);

				test
				(
					'Should execute onFailure tasks when core task fails.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-WITH-FAILURE',
								Name: 'Task With Failure Handler',
								Type: 'Command',
								Command: 'exit 1',
								onFailure: ['SUB-FAILURE-A']
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								Expect(pResult.Success).to.equal(false);
								Expect(pResult.SubsequentResults.onFailure).to.be.an('array');
								Expect(pResult.SubsequentResults.onFailure.length).to.equal(1);
								Expect(pResult.SubsequentResults.onFailure[0].GUIDTask).to.equal('SUB-FAILURE-A');
								Expect(pResult.SubsequentResults.onFailure[0].Success).to.equal(true);
								fDone();
							});
					}
				);

				test
				(
					'Should NOT execute onFailure tasks when core task succeeds.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-SUCCESS-NO-FAILURE',
								Name: 'Success No Failure',
								Type: 'Command',
								Command: 'echo ok',
								onFailure: ['SUB-FAILURE-A']
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.SubsequentResults.onFailure).to.be.undefined;
								fDone();
							});
					}
				);

				test
				(
					'Should execute onError tasks when core task errors.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-WITH-ERROR',
								Name: 'Task With Error Handler',
								Type: 'Command',
								Command: 'exit 1',
								onError: ['SUB-ERROR-A', 'SUB-ERROR-B']
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								Expect(pResult.SubsequentResults.onError).to.be.an('array');
								Expect(pResult.SubsequentResults.onError.length).to.equal(2);
								Expect(pResult.SubsequentResults.onError[0].GUIDTask).to.equal('SUB-ERROR-A');
								Expect(pResult.SubsequentResults.onError[1].GUIDTask).to.equal('SUB-ERROR-B');
								fDone();
							});
					}
				);

				test
				(
					'Should handle all five sets together on a successful task.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-ALL-SETS-SUCCESS',
								Name: 'All Sets Success',
								Type: 'Command',
								Command: 'echo all_sets',
								onBefore: ['SUB-BEFORE-A'],
								onCompletion: ['SUB-COMPLETE-A'],
								onSubsequent: ['SUB-SUBSEQUENT-A'],
								onFailure: ['SUB-FAILURE-A'],
								onError: ['SUB-ERROR-A']
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');

								// onBefore runs
								Expect(pResult.SubsequentResults.onBefore).to.be.an('array');
								Expect(pResult.SubsequentResults.onBefore.length).to.equal(1);
								// onCompletion runs (success)
								Expect(pResult.SubsequentResults.onCompletion).to.be.an('array');
								Expect(pResult.SubsequentResults.onCompletion.length).to.equal(1);
								// onSubsequent always runs
								Expect(pResult.SubsequentResults.onSubsequent).to.be.an('array');
								Expect(pResult.SubsequentResults.onSubsequent.length).to.equal(1);
								// onFailure should NOT have run
								Expect(pResult.SubsequentResults.onFailure).to.be.undefined;
								// onError should NOT have run
								Expect(pResult.SubsequentResults.onError).to.be.undefined;

								fDone();
							});
					}
				);

				test
				(
					'Should handle all five sets together on a failed task.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-ALL-SETS-FAIL',
								Name: 'All Sets Fail',
								Type: 'Command',
								Command: 'exit 1',
								onBefore: ['SUB-BEFORE-A'],
								onCompletion: ['SUB-COMPLETE-A'],
								onSubsequent: ['SUB-SUBSEQUENT-A'],
								onFailure: ['SUB-FAILURE-A'],
								onError: ['SUB-ERROR-A']
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');

								// onBefore runs
								Expect(pResult.SubsequentResults.onBefore).to.be.an('array');
								Expect(pResult.SubsequentResults.onBefore.length).to.equal(1);
								// onCompletion should NOT have run
								Expect(pResult.SubsequentResults.onCompletion).to.be.undefined;
								// onFailure runs (failure)
								Expect(pResult.SubsequentResults.onFailure).to.be.an('array');
								Expect(pResult.SubsequentResults.onFailure.length).to.equal(1);
								// onError runs (error status)
								Expect(pResult.SubsequentResults.onError).to.be.an('array');
								Expect(pResult.SubsequentResults.onError.length).to.equal(1);
								// onSubsequent always runs
								Expect(pResult.SubsequentResults.onSubsequent).to.be.an('array');
								Expect(pResult.SubsequentResults.onSubsequent.length).to.equal(1);

								fDone();
							});
					}
				);

				test
				(
					'Should handle missing subsequent task GUID gracefully.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-MISSING-SUB',
								Name: 'Missing Sub',
								Type: 'Command',
								Command: 'echo ok',
								onCompletion: ['NONEXISTENT-SUB-TASK']
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.SubsequentResults.onCompletion).to.be.an('array');
								Expect(pResult.SubsequentResults.onCompletion.length).to.equal(1);
								Expect(pResult.SubsequentResults.onCompletion[0].Status).to.equal('Error');
								Expect(pResult.SubsequentResults.onCompletion[0].GUIDTask).to.equal('NONEXISTENT-SUB-TASK');
								fDone();
							});
					}
				);

				test
				(
					'Should skip subsequent sets that are empty arrays.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-EMPTY-SETS',
								Name: 'Empty Sets',
								Type: 'Command',
								Command: 'echo ok',
								onBefore: [],
								onCompletion: [],
								onSubsequent: [],
								onFailure: [],
								onError: []
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(Object.keys(pResult.SubsequentResults).length).to.equal(0);
								fDone();
							});
					}
				);

				test
				(
					'Should work with tasks that have no subsequent sets defined.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-NO-SUBS',
								Name: 'No Subs',
								Type: 'Command',
								Command: 'echo plain'
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.SubsequentResults).to.be.an('object');
								Expect(Object.keys(pResult.SubsequentResults).length).to.equal(0);
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Built-in Task Types',
			function()
			{
				// Use a temp staging directory for file task tests
				let tmpStagingDir = require('path').resolve(__dirname, '../.test_staging');

				setup
				(
					function()
					{
						let libFS = require('fs');
						if (!libFS.existsSync(tmpStagingDir))
						{
							libFS.mkdirSync(tmpStagingDir, { recursive: true });
						}
					}
				);

				// --- ListFiles ---
				test
				(
					'Should list files in a staging directory.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
						let libFS = require('fs');

						// Create a couple of test files
						libFS.writeFileSync(require('path').join(tmpStagingDir, 'list_test_a.txt'), 'aaa', 'utf8');
						libFS.writeFileSync(require('path').join(tmpStagingDir, 'list_test_b.txt'), 'bbb', 'utf8');

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-LISTFILES',
								Name: 'List Staging',
								Type: 'ListFiles'
							},
							{ StagingPath: tmpStagingDir },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);
								let tmpFiles = JSON.parse(pResult.Output);
								Expect(tmpFiles).to.be.an('array');
								Expect(tmpFiles.length).to.be.at.least(2);
								// Check that our test files appear
								let tmpNames = tmpFiles.map(function(f) { return f.Name; });
								Expect(tmpNames).to.include('list_test_a.txt');
								Expect(tmpNames).to.include('list_test_b.txt');
								fDone();
							});
					}
				);

				test
				(
					'Should list files in a sub-path via the Path field.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
						let libFS = require('fs');
						let libPath = require('path');

						let tmpSubDir = libPath.join(tmpStagingDir, 'subdir');
						if (!libFS.existsSync(tmpSubDir))
						{
							libFS.mkdirSync(tmpSubDir, { recursive: true });
						}
						libFS.writeFileSync(libPath.join(tmpSubDir, 'nested.txt'), 'nested', 'utf8');

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-LISTFILES-SUBPATH',
								Name: 'List Subdir',
								Type: 'ListFiles',
								Path: 'subdir'
							},
							{ StagingPath: tmpStagingDir },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								let tmpFiles = JSON.parse(pResult.Output);
								let tmpNames = tmpFiles.map(function(f) { return f.Name; });
								Expect(tmpNames).to.include('nested.txt');
								fDone();
							});
					}
				);

				test
				(
					'Should fail when listing a non-existent path.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-LISTFILES-MISSING',
								Name: 'List Missing',
								Type: 'ListFiles'
							},
							{ StagingPath: '/tmp/ultravisor_nonexistent_path_xyz' },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								fDone();
							});
					}
				);

				// --- WriteJSON / ReadJSON ---
				test
				(
					'Should write JSON to a file in the staging folder.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-WRITEJSON',
								Name: 'Write JSON',
								Type: 'WriteJSON',
								File: 'test_data.json',
								Data: { greeting: 'hello', count: 42 }
							},
							{ StagingPath: tmpStagingDir },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);

								// Verify the file exists and contains the right data
								let libFS = require('fs');
								let tmpContent = JSON.parse(libFS.readFileSync(require('path').join(tmpStagingDir, 'test_data.json'), 'utf8'));
								Expect(tmpContent.greeting).to.equal('hello');
								Expect(tmpContent.count).to.equal(42);
								fDone();
							});
					}
				);

				test
				(
					'Should read JSON from a file in the staging folder.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-READJSON',
								Name: 'Read JSON',
								Type: 'ReadJSON',
								File: 'test_data.json'
							},
							{ StagingPath: tmpStagingDir },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);
								let tmpParsed = JSON.parse(pResult.Output);
								Expect(tmpParsed.greeting).to.equal('hello');
								Expect(tmpParsed.count).to.equal(42);
								fDone();
							});
					}
				);

				test
				(
					'Should fail ReadJSON on a non-existent file.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-READJSON-MISSING',
								Name: 'Read Missing JSON',
								Type: 'ReadJSON',
								File: 'does_not_exist.json'
							},
							{ StagingPath: tmpStagingDir },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								fDone();
							});
					}
				);

				test
				(
					'Should fail WriteJSON when File is missing.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-WRITEJSON-NOFILE',
								Name: 'Write JSON No File',
								Type: 'WriteJSON',
								Data: { x: 1 }
							},
							{ StagingPath: tmpStagingDir },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								fDone();
							});
					}
				);

				test
				(
					'Should fail WriteJSON when Data is missing.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-WRITEJSON-NODATA',
								Name: 'Write JSON No Data',
								Type: 'WriteJSON',
								File: 'nodata.json'
							},
							{ StagingPath: tmpStagingDir },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								fDone();
							});
					}
				);

				// --- WriteText / ReadText ---
				test
				(
					'Should write text to a file in the staging folder.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-WRITETEXT',
								Name: 'Write Text',
								Type: 'WriteText',
								File: 'test_note.txt',
								Data: 'Hello from Ultravisor!'
							},
							{ StagingPath: tmpStagingDir },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);

								let libFS = require('fs');
								let tmpContent = libFS.readFileSync(require('path').join(tmpStagingDir, 'test_note.txt'), 'utf8');
								Expect(tmpContent).to.equal('Hello from Ultravisor!');
								fDone();
							});
					}
				);

				test
				(
					'Should read text from a file in the staging folder.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-READTEXT',
								Name: 'Read Text',
								Type: 'ReadText',
								File: 'test_note.txt'
							},
							{ StagingPath: tmpStagingDir },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);
								Expect(pResult.Output).to.equal('Hello from Ultravisor!');
								fDone();
							});
					}
				);

				test
				(
					'Should fail ReadText on a non-existent file.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-READTEXT-MISSING',
								Name: 'Read Missing Text',
								Type: 'ReadText',
								File: 'not_here.txt'
							},
							{ StagingPath: tmpStagingDir },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								fDone();
							});
					}
				);

				// --- WriteJSON creates subdirectories ---
				test
				(
					'Should create nested directories when writing files.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-WRITEJSON-NESTED',
								Name: 'Write Nested',
								Type: 'WriteJSON',
								File: 'deep/nested/dir/data.json',
								Data: { nested: true }
							},
							{ StagingPath: tmpStagingDir },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);

								let libFS = require('fs');
								let tmpContent = JSON.parse(libFS.readFileSync(require('path').join(tmpStagingDir, 'deep/nested/dir/data.json'), 'utf8'));
								Expect(tmpContent.nested).to.equal(true);
								fDone();
							});
					}
				);

				// --- Path traversal prevention ---
				test
				(
					'Should reject path traversal attempts.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-TRAVERSAL',
								Name: 'Traversal Attempt',
								Type: 'ReadText',
								File: '../../etc/passwd'
							},
							{ StagingPath: tmpStagingDir },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								fDone();
							});
					}
				);

				// --- Conditional ---
				test
				(
					'Should register tasks for conditional branching.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpAnticipate = libUltravisor.fable.newAnticipate();

						let tmpTasks = [
							{ GUIDTask: 'COND-TRUE-TASK', Name: 'True Branch', Type: 'Command', Command: 'echo true_branch' },
							{ GUIDTask: 'COND-FALSE-TASK', Name: 'False Branch', Type: 'Command', Command: 'echo false_branch' }
						];

						for (let i = 0; i < tmpTasks.length; i++)
						{
							tmpAnticipate.anticipate(
								function (fNext)
								{
									tmpState.updateTask(tmpTasks[i], function () { fNext(); });
								});
						}

						tmpAnticipate.wait(function () { fDone(); });
					}
				);

				test
				(
					'Should execute TrueTask when Address resolves to a truthy value.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-COND-TRUE',
								Name: 'Conditional True',
								Type: 'Conditional',
								Address: 'Flags.Enabled',
								TrueTask: 'COND-TRUE-TASK',
								FalseTask: 'COND-FALSE-TASK'
							},
							{ GlobalState: { Flags: { Enabled: true } } },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);
								let tmpOutput = JSON.parse(pResult.Output);
								Expect(tmpOutput.Branch).to.equal('true');
								Expect(tmpOutput.Task).to.equal('COND-TRUE-TASK');
								fDone();
							});
					}
				);

				test
				(
					'Should execute FalseTask when Address resolves to a falsy value.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-COND-FALSE',
								Name: 'Conditional False',
								Type: 'Conditional',
								Address: 'Flags.Enabled',
								TrueTask: 'COND-TRUE-TASK',
								FalseTask: 'COND-FALSE-TASK'
							},
							{ GlobalState: { Flags: { Enabled: false } } },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);
								let tmpOutput = JSON.parse(pResult.Output);
								Expect(tmpOutput.Branch).to.equal('false');
								Expect(tmpOutput.Task).to.equal('COND-FALSE-TASK');
								fDone();
							});
					}
				);

				test
				(
					'Should evaluate with the Value field instead of Address.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-COND-VALUE',
								Name: 'Conditional Value',
								Type: 'Conditional',
								Value: 'non-empty string',
								TrueTask: 'COND-TRUE-TASK',
								FalseTask: 'COND-FALSE-TASK'
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								let tmpOutput = JSON.parse(pResult.Output);
								Expect(tmpOutput.Branch).to.equal('true');
								fDone();
							});
					}
				);

				test
				(
					'Should be a no-op when no task is defined for the selected branch.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-COND-NOOP',
								Name: 'Conditional No-Op',
								Type: 'Conditional',
								Value: false,
								TrueTask: 'COND-TRUE-TASK'
								// FalseTask deliberately omitted
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);
								let tmpOutput = JSON.parse(pResult.Output);
								Expect(tmpOutput.Branch).to.equal('false');
								Expect(tmpOutput.Task).to.be.null;
								fDone();
							});
					}
				);

				test
				(
					'Should fail Conditional when Address resolves to a missing task GUID.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-COND-MISSING',
								Name: 'Conditional Missing',
								Type: 'Conditional',
								Value: true,
								TrueTask: 'NONEXISTENT-COND-TASK'
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								fDone();
							});
					}
				);

				test
				(
					'Should fail Conditional when neither Address nor Value is provided.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-COND-NOADDR',
								Name: 'Conditional No Address',
								Type: 'Conditional',
								TrueTask: 'COND-TRUE-TASK'
							},
							{},
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								fDone();
							});
					}
				);

				test
				(
					'Should resolve deep Address paths.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-COND-DEEP',
								Name: 'Conditional Deep',
								Type: 'Conditional',
								Address: 'Config.Database.Enabled',
								TrueTask: 'COND-TRUE-TASK',
								FalseTask: 'COND-FALSE-TASK'
							},
							{ GlobalState: { Config: { Database: { Enabled: 'yes' } } } },
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								let tmpOutput = JSON.parse(pResult.Output);
								Expect(tmpOutput.Branch).to.equal('true');
								fDone();
							});
					}
				);

				// Cleanup after all built-in type tests
				suiteTeardown
				(
					function()
					{
						let libFS = require('fs');
						// Remove staging directory recursively
						try
						{
							libFS.rmSync(tmpStagingDir, { recursive: true, force: true });
						}
						catch (pCleanupError)
						{
							// Ignore cleanup errors
						}
					}
				);
			}
		);

		suite
		(
			'Cron Event Service',
			function()
			{
				test
				(
					'Should start and stop cron jobs.',
					function(fDone)
					{
						let tmpCronService = libUltravisor.fable['Ultravisor-Hypervisor-Event-Cron'];
						let tmpTickCount = 0;

						tmpCronService.start(
							{
								GUID: 'test-cron-job',
								CronExpression: '* * * * * *'
							},
							function ()
							{
								tmpTickCount++;
							});

						Expect(tmpCronService.active).to.equal(true);
						Expect(tmpCronService.jobCount).to.be.at.least(1);

						// Wait a moment for a tick, then stop
						setTimeout(function ()
						{
							tmpCronService.stopJob('test-cron-job');
							Expect(tmpCronService.jobCount).to.equal(0);
							fDone();
						}, 1500);
					}
				);

				test
				(
					'Should stop all cron jobs.',
					function()
					{
						let tmpCronService = libUltravisor.fable['Ultravisor-Hypervisor-Event-Cron'];

						tmpCronService.start(
							{
								GUID: 'test-stop-all-1',
								CronExpression: '0 * * * *'
							},
							function () {});

						tmpCronService.start(
							{
								GUID: 'test-stop-all-2',
								CronExpression: '0 * * * *'
							},
							function () {});

						Expect(tmpCronService.jobCount).to.be.at.least(2);

						tmpCronService.stop();
						Expect(tmpCronService.jobCount).to.equal(0);
						Expect(tmpCronService.active).to.equal(false);
					}
				);
			}
		);
	}
);
