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

				// --- ReadBinary ---
			test
			(
				'Should read a binary file from the staging folder.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libFS = require('fs');

					// Write a small binary file to staging
					let tmpBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
					libFS.writeFileSync(require('path').join(tmpStagingDir, 'test.bin'), tmpBuf);

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-READBINARY',
							Name: 'Read Binary',
							Type: 'ReadBinary',
							File: 'test.bin'
						},
						{ StagingPath: tmpStagingDir },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);
							Expect(pResult.Output).to.contain('8 bytes read');
							fDone();
						});
				}
			);

			test
			(
				'Should fail ReadBinary on a non-existent file.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-READBINARY-MISSING',
							Name: 'Read Missing Binary',
							Type: 'ReadBinary',
							File: 'does_not_exist.bin'
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
				'Should persist ReadBinary to a state address as base64.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = { StagingPath: tmpStagingDir, GlobalState: {} };

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-READBINARY-PERSIST-ADDR',
							Name: 'Read Binary Persist Address',
							Type: 'ReadBinary',
							File: 'test.bin',
							Persist: 'BinaryData.TestFile'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							// Check the GlobalState was populated
							Expect(tmpContext.GlobalState.BinaryData).to.be.an('object');
							Expect(tmpContext.GlobalState.BinaryData.TestFile).to.be.a('string');
							// Verify it's valid base64 that decodes to our original bytes
							let tmpDecoded = Buffer.from(tmpContext.GlobalState.BinaryData.TestFile, 'base64');
							Expect(tmpDecoded[0]).to.equal(0x89);
							Expect(tmpDecoded[1]).to.equal(0x50);
							Expect(tmpDecoded.length).to.equal(8);
							fDone();
						});
				}
			);

			test
			(
				'Should persist ReadBinary to a file via Persist.File.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libFS = require('fs');

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-READBINARY-PERSIST-FILE',
							Name: 'Read Binary Persist File',
							Type: 'ReadBinary',
							File: 'test.bin',
							Persist: { File: 'copied.bin' }
						},
						{ StagingPath: tmpStagingDir },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							// Verify the file was written
							let tmpCopied = libFS.readFileSync(require('path').join(tmpStagingDir, 'copied.bin'));
							Expect(tmpCopied.length).to.equal(8);
							Expect(tmpCopied[0]).to.equal(0x89);
							fDone();
						});
				}
			);

			// --- Persist with Address object ---
			test
			(
				'Should persist via Persist object with Address.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = { StagingPath: tmpStagingDir, GlobalState: {} };
					let libFS = require('fs');

					let tmpBuf = Buffer.from([0xDE, 0xAD]);
					libFS.writeFileSync(require('path').join(tmpStagingDir, 'persist_addr.bin'), tmpBuf);

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-PERSIST-ADDR-OBJ',
							Name: 'Persist Address Object',
							Type: 'ReadBinary',
							File: 'persist_addr.bin',
							Persist: { Address: 'Results.Binary.DeadBytes' }
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(tmpContext.GlobalState.Results).to.be.an('object');
							Expect(tmpContext.GlobalState.Results.Binary).to.be.an('object');
							Expect(tmpContext.GlobalState.Results.Binary.DeadBytes).to.be.a('string');
							let tmpDecoded = Buffer.from(tmpContext.GlobalState.Results.Binary.DeadBytes, 'base64');
							Expect(tmpDecoded[0]).to.equal(0xDE);
							Expect(tmpDecoded[1]).to.equal(0xAD);
							fDone();
						});
				}
			);

			test
			(
				'Should handle invalid Persist values gracefully.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libFS = require('fs');

					let tmpBuf = Buffer.from([0x01]);
					libFS.writeFileSync(require('path').join(tmpStagingDir, 'persist_invalid.bin'), tmpBuf);

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-PERSIST-INVALID',
							Name: 'Persist Invalid',
							Type: 'ReadBinary',
							File: 'persist_invalid.bin',
							Persist: 12345
						},
						{ StagingPath: tmpStagingDir },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							// Task should still succeed, just log a warning about invalid Persist
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);
							fDone();
						});
				}
			);

			test
			(
				'Should handle Persist object with no valid keys gracefully.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libFS = require('fs');

					let tmpBuf = Buffer.from([0x02]);
					libFS.writeFileSync(require('path').join(tmpStagingDir, 'persist_empty.bin'), tmpBuf);

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-PERSIST-EMPTY-OBJ',
							Name: 'Persist Empty Object',
							Type: 'ReadBinary',
							File: 'persist_empty.bin',
							Persist: { NotAValidKey: true }
						},
						{ StagingPath: tmpStagingDir },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);
							fDone();
						});
				}
			);

			// --- WriteXML / ReadXML ---
			test
			(
				'Should write XML to a file in the staging folder.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-WRITEXML',
							Name: 'Write XML',
							Type: 'WriteXML',
							File: 'test_data.xml',
							Data: '<?xml version="1.0"?><root><greeting>hello</greeting></root>'
						},
						{ StagingPath: tmpStagingDir },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);

							let libFS = require('fs');
							let tmpContent = libFS.readFileSync(require('path').join(tmpStagingDir, 'test_data.xml'), 'utf8');
							Expect(tmpContent).to.contain('<greeting>hello</greeting>');
							fDone();
						});
				}
			);

			test
			(
				'Should read XML from a file in the staging folder.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-READXML',
							Name: 'Read XML',
							Type: 'ReadXML',
							File: 'test_data.xml'
						},
						{ StagingPath: tmpStagingDir },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);
							Expect(pResult.Output).to.contain('<greeting>hello</greeting>');
							fDone();
						});
				}
			);

			test
			(
				'Should fail ReadXML on a non-existent file.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-READXML-MISSING',
							Name: 'Read Missing XML',
							Type: 'ReadXML',
							File: 'does_not_exist.xml'
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
				'Should fail WriteXML when File is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-WRITEXML-NOFILE',
							Name: 'Write XML No File',
							Type: 'WriteXML',
							Data: '<root/>'
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
				'Should fail WriteXML when Data is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-WRITEXML-NODATA',
							Name: 'Write XML No Data',
							Type: 'WriteXML',
							File: 'nodata.xml'
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

			// --- GetText ---
			test
			(
				'Should fail GetText when URL is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-GETTEXT-NOURL',
							Name: 'GetText No URL',
							Type: 'GetText'
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
				'Should fail GetText when URL is invalid.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-GETTEXT-BADURL',
							Name: 'GetText Bad URL',
							Type: 'GetText',
							URL: 'not-a-valid-url'
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

			// --- GetXML ---
			test
			(
				'Should fail GetXML when URL is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-GETXML-NOURL',
							Name: 'GetXML No URL',
							Type: 'GetXML'
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
				'Should fail GetXML when URL is invalid.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-GETXML-BADURL',
							Name: 'GetXML Bad URL',
							Type: 'GetXML',
							URL: 'not-a-valid-url'
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

			// --- RestRequest ---
			test
			(
				'Should fail RestRequest when URL is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-RESTREQUEST-NOURL',
							Name: 'RestRequest No URL',
							Type: 'RestRequest',
							Method: 'GET'
						},
						{ GlobalState: {} },
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
				'Should fail RestRequest when URL is invalid.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-RESTREQUEST-BADURL',
							Name: 'RestRequest Bad URL',
							Type: 'RestRequest',
							URL: 'not-a-valid-url'
						},
						{ GlobalState: {} },
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
				'Should perform a GET request and store the result.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					// Spin up a tiny test server
					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						pRes.writeHead(200, { 'Content-Type': 'application/json' });
						pRes.end(JSON.stringify({ greeting: 'hello', method: pReq.method }));
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						let tmpContext = { GlobalState: {} };

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-GET',
								Name: 'RestRequest GET',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/test`
							},
							tmpContext,
							function (pError, pResult)
							{
								tmpServer.close();
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);

								let tmpOutput = tmpContext.GlobalState.Output;
								Expect(tmpOutput).to.be.an('object');
								Expect(tmpOutput.StatusCode).to.equal(200);
								Expect(tmpOutput.Body).to.be.a('string');
								Expect(tmpOutput.JSON).to.be.an('object');
								Expect(tmpOutput.JSON.greeting).to.equal('hello');
								Expect(tmpOutput.JSON.method).to.equal('GET');
								fDone();
							});
					});
				}
			);

			test
			(
				'Should perform a POST request with a JSON body.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						let tmpBody = '';
						pReq.on('data', function (pChunk) { tmpBody += pChunk; });
						pReq.on('end', function ()
						{
							pRes.writeHead(200, { 'Content-Type': 'application/json' });
							pRes.end(JSON.stringify({
								method: pReq.method,
								contentType: pReq.headers['content-type'],
								received: JSON.parse(tmpBody)
							}));
						});
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						let tmpContext = { GlobalState: {} };

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-POST',
								Name: 'RestRequest POST',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/submit`,
								Method: 'POST',
								Body: { name: 'ultravisor', value: 42 }
							},
							tmpContext,
							function (pError, pResult)
							{
								tmpServer.close();
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');

								let tmpOutput = tmpContext.GlobalState.Output;
								Expect(tmpOutput.JSON.method).to.equal('POST');
								Expect(tmpOutput.JSON.contentType).to.equal('application/json');
								Expect(tmpOutput.JSON.received.name).to.equal('ultravisor');
								Expect(tmpOutput.JSON.received.value).to.equal(42);
								fDone();
							});
					});
				}
			);

			test
			(
				'Should send custom headers.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						pRes.writeHead(200, { 'Content-Type': 'application/json' });
						pRes.end(JSON.stringify({
							authHeader: pReq.headers['authorization'],
							customHeader: pReq.headers['x-custom-header']
						}));
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						let tmpContext = { GlobalState: {} };

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-HEADERS',
								Name: 'RestRequest Headers',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/headers`,
								Headers: {
									'Authorization': 'Bearer test-token-123',
									'X-Custom-Header': 'custom-value'
								}
							},
							tmpContext,
							function (pError, pResult)
							{
								tmpServer.close();
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');

								let tmpOutput = tmpContext.GlobalState.Output;
								Expect(tmpOutput.JSON.authHeader).to.equal('Bearer test-token-123');
								Expect(tmpOutput.JSON.customHeader).to.equal('custom-value');
								fDone();
							});
					});
				}
			);

			test
			(
				'Should send task-level cookies in the request.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						pRes.writeHead(200, { 'Content-Type': 'application/json' });
						pRes.end(JSON.stringify({ cookies: pReq.headers['cookie'] || '' }));
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						let tmpContext = { GlobalState: {} };

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-COOKIES',
								Name: 'RestRequest Cookies',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/cookies`,
								Cookies: { session: 'abc123', lang: 'en' }
							},
							tmpContext,
							function (pError, pResult)
							{
								tmpServer.close();
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');

								let tmpOutput = tmpContext.GlobalState.Output;
								let tmpCookieStr = tmpOutput.JSON.cookies;
								Expect(tmpCookieStr).to.contain('session=abc123');
								Expect(tmpCookieStr).to.contain('lang=en');
								fDone();
							});
					});
				}
			);

			test
			(
				'Should capture Set-Cookie headers into GlobalState.Cookies.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						pRes.writeHead(200, {
							'Content-Type': 'application/json',
							'Set-Cookie': [
								'token=xyz789; Path=/; HttpOnly',
								'theme=dark; Path=/'
							]
						});
						pRes.end(JSON.stringify({ ok: true }));
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						let tmpContext = { GlobalState: {} };

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-SETCOOKIE',
								Name: 'RestRequest SetCookie',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/login`
							},
							tmpContext,
							function (pError, pResult)
							{
								tmpServer.close();
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');

								// Cookies should be captured in GlobalState
								Expect(tmpContext.GlobalState.Cookies).to.be.an('object');
								Expect(tmpContext.GlobalState.Cookies.token).to.equal('xyz789');
								Expect(tmpContext.GlobalState.Cookies.theme).to.equal('dark');
								fDone();
							});
					});
				}
			);

			test
			(
				'Should carry shared cookies across sequential RestRequest tasks.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					let tmpRequestCount = 0;
					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						tmpRequestCount++;
						if (tmpRequestCount === 1)
						{
							// First request: set a cookie
							pRes.writeHead(200, {
								'Content-Type': 'application/json',
								'Set-Cookie': 'sid=session-first; Path=/'
							});
							pRes.end(JSON.stringify({ step: 'login' }));
						}
						else
						{
							// Second request: echo back received cookies
							pRes.writeHead(200, { 'Content-Type': 'application/json' });
							pRes.end(JSON.stringify({
								step: 'data',
								cookies: pReq.headers['cookie'] || ''
							}));
						}
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						// Shared context across both requests
						let tmpContext = { GlobalState: {} };

						// First request -- sets cookie
						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-CHAIN-1',
								Name: 'RestRequest Chain Login',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/login`,
								Destination: 'LoginResult'
							},
							tmpContext,
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(tmpContext.GlobalState.Cookies.sid).to.equal('session-first');

								// Second request -- should automatically include the cookie
								tmpTaskService.executeTask(
									{
										GUIDTask: 'TEST-RESTREQUEST-CHAIN-2',
										Name: 'RestRequest Chain Data',
										Type: 'RestRequest',
										URL: `http://127.0.0.1:${tmpPort}/data`,
										Destination: 'DataResult'
									},
									tmpContext,
									function (pError2, pResult2)
									{
										tmpServer.close();
										Expect(pError2).to.be.null;
										Expect(pResult2.Status).to.equal('Complete');

										let tmpDataResult = tmpContext.GlobalState.DataResult;
										Expect(tmpDataResult.JSON.cookies).to.contain('sid=session-first');
										fDone();
									});
							});
					});
				}
			);

			test
			(
				'Should allow task-level cookies to override shared jar cookies.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						pRes.writeHead(200, { 'Content-Type': 'application/json' });
						pRes.end(JSON.stringify({ cookies: pReq.headers['cookie'] || '' }));
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						let tmpContext = {
							GlobalState: {
								Cookies: { session: 'jar-value', lang: 'en' }
							}
						};

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-OVERRIDE',
								Name: 'RestRequest Cookie Override',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/test`,
								Cookies: { session: 'override-value' }
							},
							tmpContext,
							function (pError, pResult)
							{
								tmpServer.close();
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');

								let tmpCookieStr = tmpContext.GlobalState.Output.JSON.cookies;
								Expect(tmpCookieStr).to.contain('session=override-value');
								Expect(tmpCookieStr).to.contain('lang=en');
								Expect(tmpCookieStr).to.not.contain('jar-value');
								fDone();
							});
					});
				}
			);

			test
			(
				'Should not capture cookies when StoreCookies is false.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						pRes.writeHead(200, {
							'Content-Type': 'application/json',
							'Set-Cookie': 'secret=nope; Path=/'
						});
						pRes.end(JSON.stringify({ ok: true }));
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						let tmpContext = { GlobalState: {} };

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-NOCAPTURE',
								Name: 'RestRequest No Capture',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/nocapture`,
								StoreCookies: false
							},
							tmpContext,
							function (pError, pResult)
							{
								tmpServer.close();
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');

								// Cookies should NOT have been captured
								Expect(tmpContext.GlobalState.Cookies).to.be.undefined;
								fDone();
							});
					});
				}
			);

			test
			(
				'Should store result at a custom Destination.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						pRes.writeHead(200, { 'Content-Type': 'application/json' });
						pRes.end(JSON.stringify({ status: 'ok' }));
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						let tmpContext = { GlobalState: {} };

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-DEST',
								Name: 'RestRequest Destination',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/dest`,
								Destination: 'APIResponse.Status'
							},
							tmpContext,
							function (pError, pResult)
							{
								tmpServer.close();
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');

								Expect(tmpContext.GlobalState.APIResponse).to.be.an('object');
								Expect(tmpContext.GlobalState.APIResponse.Status).to.be.an('object');
								Expect(tmpContext.GlobalState.APIResponse.Status.JSON.status).to.equal('ok');
								fDone();
							});
					});
				}
			);

			test
			(
				'Should support a string Body with custom ContentType.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						let tmpBody = '';
						pReq.on('data', function (pChunk) { tmpBody += pChunk; });
						pReq.on('end', function ()
						{
							pRes.writeHead(200, { 'Content-Type': 'application/json' });
							pRes.end(JSON.stringify({
								contentType: pReq.headers['content-type'],
								body: tmpBody
							}));
						});
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						let tmpContext = { GlobalState: {} };

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-STRBODY',
								Name: 'RestRequest String Body',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/xml`,
								Method: 'POST',
								Body: '<root><message>hello</message></root>',
								ContentType: 'application/xml'
							},
							tmpContext,
							function (pError, pResult)
							{
								tmpServer.close();
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');

								let tmpOutput = tmpContext.GlobalState.Output;
								Expect(tmpOutput.JSON.contentType).to.equal('application/xml');
								Expect(tmpOutput.JSON.body).to.equal('<root><message>hello</message></root>');
								fDone();
							});
					});
				}
			);

			test
			(
				'Should support PUT and DELETE methods.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						pRes.writeHead(200, { 'Content-Type': 'application/json' });
						pRes.end(JSON.stringify({ method: pReq.method }));
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						let tmpContext = { GlobalState: {} };

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-PUT',
								Name: 'RestRequest PUT',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/resource/1`,
								Method: 'PUT',
								Body: { updated: true }
							},
							tmpContext,
							function (pError, pResult)
							{
								tmpServer.close();
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');

								Expect(tmpContext.GlobalState.Output.JSON.method).to.equal('PUT');
								fDone();
							});
					});
				}
			);

			test
			(
				'Should capture a token from JSON body into the cookie jar via CaptureToken string.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						pRes.writeHead(200, { 'Content-Type': 'application/json' });
						pRes.end(JSON.stringify({ Token: 'abc-session-token-123', UserID: 42 }));
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						let tmpContext = { GlobalState: {} };

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-CAPTURETOKEN-STR',
								Name: 'RestRequest CaptureToken String',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/auth`,
								Method: 'POST',
								Body: { user: 'test' },
								CaptureToken: 'Token'
							},
							tmpContext,
							function (pError, pResult)
							{
								tmpServer.close();
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');

								// Token should be captured as cookie named "Token"
								Expect(tmpContext.GlobalState.Cookies).to.be.an('object');
								Expect(tmpContext.GlobalState.Cookies.Token).to.equal('abc-session-token-123');
								fDone();
							});
					});
				}
			);

			test
			(
				'Should capture a token via CaptureToken object with custom Cookie name.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						pRes.writeHead(200, { 'Content-Type': 'application/json' });
						pRes.end(JSON.stringify({ Session: { ID: 'sess-xyz-789' } }));
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						let tmpContext = { GlobalState: {} };

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-CAPTURETOKEN-OBJ',
								Name: 'RestRequest CaptureToken Object',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/auth`,
								Method: 'POST',
								Body: { user: 'test' },
								CaptureToken: { Address: 'Session.ID', Cookie: 'SessionID' }
							},
							tmpContext,
							function (pError, pResult)
							{
								tmpServer.close();
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');

								Expect(tmpContext.GlobalState.Cookies.SessionID).to.equal('sess-xyz-789');
								fDone();
							});
					});
				}
			);

			test
			(
				'Should carry captured token as cookie to subsequent requests.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					let tmpRequestCount = 0;
					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						tmpRequestCount++;
						if (tmpRequestCount === 1)
						{
							// Login: return a token in JSON body
							pRes.writeHead(200, { 'Content-Type': 'application/json' });
							pRes.end(JSON.stringify({ Token: 'my-auth-token' }));
						}
						else
						{
							// Data: echo cookies
							pRes.writeHead(200, { 'Content-Type': 'application/json' });
							pRes.end(JSON.stringify({ cookies: pReq.headers['cookie'] || '' }));
						}
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						let tmpContext = { GlobalState: {} };

						// First request: capture token
						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-TOKEN-CHAIN-1',
								Name: 'Login',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/login`,
								Method: 'POST',
								Body: { user: 'test' },
								CaptureToken: 'Token',
								Destination: 'LoginResult'
							},
							tmpContext,
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(tmpContext.GlobalState.Cookies.Token).to.equal('my-auth-token');

								// Second request: token should be sent automatically
								tmpTaskService.executeTask(
									{
										GUIDTask: 'TEST-RESTREQUEST-TOKEN-CHAIN-2',
										Name: 'Fetch Data',
										Type: 'RestRequest',
										URL: `http://127.0.0.1:${tmpPort}/data`,
										Destination: 'DataResult'
									},
									tmpContext,
									function (pError2, pResult2)
									{
										tmpServer.close();
										Expect(pError2).to.be.null;
										Expect(pResult2.Status).to.equal('Complete');

										let tmpDataResult = tmpContext.GlobalState.DataResult;
										Expect(tmpDataResult.JSON.cookies).to.contain('Token=my-auth-token');
										fDone();
									});
							});
					});
				}
			);

			test
			(
				'Should capture response headers into GlobalState via CaptureHeader.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libHTTP = require('http');

					let tmpServer = libHTTP.createServer(function (pReq, pRes)
					{
						pRes.writeHead(200, {
							'Content-Type': 'application/json',
							'X-Auth-Token': 'header-token-456',
							'X-Request-Id': 'req-id-789'
						});
						pRes.end(JSON.stringify({ ok: true }));
					});

					tmpServer.listen(0, function ()
					{
						let tmpPort = tmpServer.address().port;
						let tmpContext = { GlobalState: {} };

						tmpTaskService.executeTask(
							{
								GUIDTask: 'TEST-RESTREQUEST-CAPTUREHEADER',
								Name: 'RestRequest CaptureHeader',
								Type: 'RestRequest',
								URL: `http://127.0.0.1:${tmpPort}/headers`,
								CaptureHeader: {
									'X-Auth-Token': 'AuthToken',
									'X-Request-Id': 'Diagnostics.RequestId'
								}
							},
							tmpContext,
							function (pError, pResult)
							{
								tmpServer.close();
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');

								Expect(tmpContext.GlobalState.AuthToken).to.equal('header-token-456');
								Expect(tmpContext.GlobalState.Diagnostics.RequestId).to.equal('req-id-789');
								fDone();
							});
					});
				}
			);

			// --- Destination ---
			test
			(
				'Should store ReadJSON output at default Destination ("Output") in GlobalState.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = { StagingPath: tmpStagingDir, GlobalState: {} };

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-DEST-READJSON-DEFAULT',
							Name: 'ReadJSON Default Destination',
							Type: 'ReadJSON',
							File: 'test_data.json'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(tmpContext.GlobalState.Output).to.be.an('object');
							Expect(tmpContext.GlobalState.Output.greeting).to.equal('hello');
							fDone();
						});
				}
			);

			test
			(
				'Should store ReadText output at a custom Destination address.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = { StagingPath: tmpStagingDir, GlobalState: {} };

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-DEST-READTEXT-CUSTOM',
							Name: 'ReadText Custom Destination',
							Type: 'ReadText',
							File: 'test_note.txt',
							Destination: 'Pipeline.TextContent'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(tmpContext.GlobalState.Pipeline).to.be.an('object');
							Expect(tmpContext.GlobalState.Pipeline.TextContent).to.be.a('string');
							Expect(tmpContext.GlobalState.Pipeline.TextContent).to.contain('Hello');
							fDone();
						});
				}
			);

			test
			(
				'Should store ReadXML output at a custom Destination address.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = { StagingPath: tmpStagingDir, GlobalState: {} };

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-DEST-READXML-CUSTOM',
							Name: 'ReadXML Custom Destination',
							Type: 'ReadXML',
							File: 'test_data.xml',
							Destination: 'Data.XMLContent'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(tmpContext.GlobalState.Data).to.be.an('object');
							Expect(tmpContext.GlobalState.Data.XMLContent).to.contain('<greeting>hello</greeting>');
							fDone();
						});
				}
			);

			test
			(
				'Should store ReadBinary output as base64 at default Destination.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = { StagingPath: tmpStagingDir, GlobalState: {} };

					// First write a binary file to read back
					let libFS = require('fs');
					let tmpBinaryPath = require('path').join(tmpStagingDir, 'dest_test.bin');
					libFS.writeFileSync(tmpBinaryPath, Buffer.from([0x48, 0x49]));

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-DEST-READBINARY-DEFAULT',
							Name: 'ReadBinary Default Destination',
							Type: 'ReadBinary',
							File: 'dest_test.bin'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							// "HI" in base64 is "SEk="
							Expect(tmpContext.GlobalState.Output).to.equal('SEk=');
							fDone();
						});
				}
			);

			test
			(
				'Should initialize GlobalState if not present when storing Destination.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = { StagingPath: tmpStagingDir };

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-DEST-NO-GLOBALSTATE',
							Name: 'ReadText No GlobalState',
							Type: 'ReadText',
							File: 'test_note.txt',
							Destination: 'Result'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(tmpContext.GlobalState).to.be.an('object');
							Expect(tmpContext.GlobalState.Result).to.be.a('string');
							fDone();
						});
				}
			);

			// --- Solver ---
			test
			(
				'Should solve a simple arithmetic expression.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = { StagingPath: tmpStagingDir, GlobalState: {} };

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-SOLVER-BASIC',
							Name: 'Basic Solver',
							Type: 'Solver',
							Expression: '5 + 3'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);
							Expect(pResult.Output).to.equal('8');
							// Default Destination stores at GlobalState.Output
							Expect(tmpContext.GlobalState.Output).to.equal('8');
							fDone();
						});
				}
			);

			test
			(
				'Should solve an expression referencing GlobalState values.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: { Width: 10, Height: 5 }
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-SOLVER-STATE',
							Name: 'Solver With State',
							Type: 'Solver',
							Expression: '{Width} * {Height}'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);
							Expect(pResult.Output).to.equal('50');
							fDone();
						});
				}
			);

			test
			(
				'Should solve an expression with assignment and merge into GlobalState.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: { X: 7, Y: 3 }
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-SOLVER-ASSIGN',
							Name: 'Solver With Assignment',
							Type: 'Solver',
							Expression: 'Area = {X} * {Y}',
							Destination: 'Calculations.Result'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);
							// Assignment result merged into GlobalState
							Expect(tmpContext.GlobalState.Area).to.equal('21');
							// Destination stores the raw result
							Expect(tmpContext.GlobalState.Calculations).to.be.an('object');
							Expect(tmpContext.GlobalState.Calculations.Result).to.equal('21');
							fDone();
						});
				}
			);

			test
			(
				'Should make GlobalState accessible via AppData.GlobalState.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: { Price: 100 }
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-SOLVER-APPDATA',
							Name: 'Solver AppData Check',
							Type: 'Solver',
							Expression: '{Price} * 1.1'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							// Verify AppData.GlobalState is wired
							Expect(libUltravisor.fable.AppData).to.be.an('object');
							Expect(libUltravisor.fable.AppData.GlobalState).to.equal(tmpContext.GlobalState);
							fDone();
						});
				}
			);

			test
			(
				'Should fail Solver when Expression is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-SOLVER-NOEXPR',
							Name: 'Solver No Expression',
							Type: 'Solver'
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
				'Should solve an expression using a built-in function.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-SOLVER-FUNC',
							Name: 'Solver Function',
							Type: 'Solver',
							Expression: 'ROUND(3.14159, 2)'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);
							Expect(pResult.Output).to.equal('3.14');
							fDone();
						});
				}
			);

			// --- WriteBinary ---
			test
			(
				'Should write binary data from a Buffer to the staging folder.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libFS = require('fs');

					let tmpBuf = Buffer.from([0xCA, 0xFE, 0xBA, 0xBE]);

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-WRITEBINARY-BUF',
							Name: 'Write Binary Buffer',
							Type: 'WriteBinary',
							File: 'test_binary.bin',
							Data: tmpBuf
						},
						{ StagingPath: tmpStagingDir },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);
							Expect(pResult.Output).to.contain('4 bytes written');

							let tmpWritten = libFS.readFileSync(require('path').join(tmpStagingDir, 'test_binary.bin'));
							Expect(tmpWritten.length).to.equal(4);
							Expect(tmpWritten[0]).to.equal(0xCA);
							Expect(tmpWritten[1]).to.equal(0xFE);
							Expect(tmpWritten[2]).to.equal(0xBA);
							Expect(tmpWritten[3]).to.equal(0xBE);
							fDone();
						});
				}
			);

			test
			(
				'Should write binary data from a base64 string.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libFS = require('fs');

					// 0xDE 0xAD 0xBE 0xEF in base64
					let tmpBase64 = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]).toString('base64');

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-WRITEBINARY-B64',
							Name: 'Write Binary Base64',
							Type: 'WriteBinary',
							File: 'test_b64.bin',
							Data: tmpBase64
						},
						{ StagingPath: tmpStagingDir },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);

							let tmpWritten = libFS.readFileSync(require('path').join(tmpStagingDir, 'test_b64.bin'));
							Expect(tmpWritten.length).to.equal(4);
							Expect(tmpWritten[0]).to.equal(0xDE);
							Expect(tmpWritten[3]).to.equal(0xEF);
							fDone();
						});
				}
			);

			test
			(
				'Should write binary data from an array of byte values.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libFS = require('fs');

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-WRITEBINARY-ARR',
							Name: 'Write Binary Array',
							Type: 'WriteBinary',
							File: 'test_arr.bin',
							Data: [0x01, 0x02, 0x03]
						},
						{ StagingPath: tmpStagingDir },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);

							let tmpWritten = libFS.readFileSync(require('path').join(tmpStagingDir, 'test_arr.bin'));
							Expect(tmpWritten.length).to.equal(3);
							Expect(tmpWritten[0]).to.equal(0x01);
							Expect(tmpWritten[2]).to.equal(0x03);
							fDone();
						});
				}
			);

			test
			(
				'Should fail WriteBinary when File is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-WRITEBINARY-NOFILE',
							Name: 'Write Binary No File',
							Type: 'WriteBinary',
							Data: Buffer.from([0x00])
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
				'Should fail WriteBinary when Data is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-WRITEBINARY-NODATA',
							Name: 'Write Binary No Data',
							Type: 'WriteBinary',
							File: 'nodata.bin'
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
				'Should fail WriteBinary when Data is an unsupported type.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-WRITEBINARY-BADTYPE',
							Name: 'Write Binary Bad Type',
							Type: 'WriteBinary',
							File: 'bad.bin',
							Data: 12345
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

			// --- CopyFile ---
			test
			(
				'Should copy a local file into the staging folder.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libFS = require('fs');
					let libPath = require('path');

					// Create a temporary source file outside the staging folder
					let tmpSourceDir = libPath.resolve(__dirname, '../.test_copy_source');
					if (!libFS.existsSync(tmpSourceDir))
					{
						libFS.mkdirSync(tmpSourceDir, { recursive: true });
					}
					let tmpSourceFile = libPath.join(tmpSourceDir, 'original.txt');
					libFS.writeFileSync(tmpSourceFile, 'This is the original file content.', 'utf8');

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-COPYFILE-BASIC',
							Name: 'Copy File Basic',
							Type: 'CopyFile',
							Source: tmpSourceFile,
							File: 'copied.txt'
						},
						{ StagingPath: tmpStagingDir },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);
							Expect(pResult.Output).to.contain('bytes copied');

							let tmpCopied = libFS.readFileSync(libPath.join(tmpStagingDir, 'copied.txt'), 'utf8');
							Expect(tmpCopied).to.equal('This is the original file content.');

							// Cleanup source dir
							libFS.rmSync(tmpSourceDir, { recursive: true, force: true });
							fDone();
						});
				}
			);

			test
			(
				'Should copy a file into a nested destination path.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libFS = require('fs');
					let libPath = require('path');

					let tmpSourceDir = libPath.resolve(__dirname, '../.test_copy_source');
					if (!libFS.existsSync(tmpSourceDir))
					{
						libFS.mkdirSync(tmpSourceDir, { recursive: true });
					}
					let tmpSourceFile = libPath.join(tmpSourceDir, 'nested_source.dat');
					libFS.writeFileSync(tmpSourceFile, 'nested content', 'utf8');

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-COPYFILE-NESTED',
							Name: 'Copy File Nested',
							Type: 'CopyFile',
							Source: tmpSourceFile,
							File: 'sub/deep/imported.dat'
						},
						{ StagingPath: tmpStagingDir },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);

							let tmpCopied = libFS.readFileSync(libPath.join(tmpStagingDir, 'sub', 'deep', 'imported.dat'), 'utf8');
							Expect(tmpCopied).to.equal('nested content');

							libFS.rmSync(tmpSourceDir, { recursive: true, force: true });
							fDone();
						});
				}
			);

			test
			(
				'Should copy a binary file faithfully.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libFS = require('fs');
					let libPath = require('path');

					let tmpSourceDir = libPath.resolve(__dirname, '../.test_copy_source');
					if (!libFS.existsSync(tmpSourceDir))
					{
						libFS.mkdirSync(tmpSourceDir, { recursive: true });
					}
					let tmpSourceFile = libPath.join(tmpSourceDir, 'binary_source.bin');
					let tmpBuf = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE]);
					libFS.writeFileSync(tmpSourceFile, tmpBuf);

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-COPYFILE-BINARY',
							Name: 'Copy Binary File',
							Type: 'CopyFile',
							Source: tmpSourceFile,
							File: 'imported_binary.bin'
						},
						{ StagingPath: tmpStagingDir },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);

							let tmpCopied = libFS.readFileSync(libPath.join(tmpStagingDir, 'imported_binary.bin'));
							Expect(tmpCopied.length).to.equal(6);
							Expect(tmpCopied[0]).to.equal(0xDE);
							Expect(tmpCopied[3]).to.equal(0xEF);
							Expect(tmpCopied[5]).to.equal(0xFE);

							libFS.rmSync(tmpSourceDir, { recursive: true, force: true });
							fDone();
						});
				}
			);

			test
			(
				'Should resolve Source from a GlobalState Address.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libFS = require('fs');
					let libPath = require('path');

					let tmpSourceDir = libPath.resolve(__dirname, '../.test_copy_source');
					if (!libFS.existsSync(tmpSourceDir))
					{
						libFS.mkdirSync(tmpSourceDir, { recursive: true });
					}
					let tmpSourceFile = libPath.join(tmpSourceDir, 'addr_source.txt');
					libFS.writeFileSync(tmpSourceFile, 'resolved via address', 'utf8');

					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							ImportPath: tmpSourceFile
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-COPYFILE-ADDR',
							Name: 'Copy File Address',
							Type: 'CopyFile',
							Address: 'ImportPath',
							File: 'from_address.txt'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);

							let tmpCopied = libFS.readFileSync(libPath.join(tmpStagingDir, 'from_address.txt'), 'utf8');
							Expect(tmpCopied).to.equal('resolved via address');

							libFS.rmSync(tmpSourceDir, { recursive: true, force: true });
							fDone();
						});
				}
			);

			test
			(
				'Should fail CopyFile when Source file does not exist.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-COPYFILE-NOSOURCE',
							Name: 'Copy File No Source',
							Type: 'CopyFile',
							Source: '/tmp/ultravisor_nonexistent_file_12345.txt',
							File: 'should_not_exist.txt'
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
				'Should fail CopyFile when Source is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-COPYFILE-NOSRCFIELD',
							Name: 'Copy File No Source Field',
							Type: 'CopyFile',
							File: 'target.txt'
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
				'Should fail CopyFile when File is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-COPYFILE-NOFILE',
							Name: 'Copy File No File',
							Type: 'CopyFile',
							Source: '/tmp/anything.txt'
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
				'Should reject path traversal in File destination.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let libFS = require('fs');
					let libPath = require('path');

					let tmpSourceDir = libPath.resolve(__dirname, '../.test_copy_source');
					if (!libFS.existsSync(tmpSourceDir))
					{
						libFS.mkdirSync(tmpSourceDir, { recursive: true });
					}
					let tmpSourceFile = libPath.join(tmpSourceDir, 'traversal.txt');
					libFS.writeFileSync(tmpSourceFile, 'should not be copied', 'utf8');

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-COPYFILE-TRAVERSAL',
							Name: 'Copy File Traversal',
							Type: 'CopyFile',
							Source: tmpSourceFile,
							File: '../../etc/passwd'
						},
						{ StagingPath: tmpStagingDir },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Error');

							libFS.rmSync(tmpSourceDir, { recursive: true, force: true });
							fDone();
						});
				}
			);

			// --- LineMatch ---
			test
			(
				'Should match lines with a regex pattern from inline Data.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-LINEMATCH-BASIC',
							Name: 'LineMatch Basic',
							Type: 'LineMatch',
							Data: 'apple 10\nbanana 20\ncherry 30',
							Pattern: '(\\w+)\\s+(\\d+)'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);

							let tmpMatches = tmpContext.GlobalState.Output;
							Expect(tmpMatches).to.be.an('array');
							Expect(tmpMatches.length).to.equal(3);

							Expect(tmpMatches[0].Index).to.equal(0);
							Expect(tmpMatches[0].Line).to.equal('apple 10');
							Expect(tmpMatches[0].Match).to.equal(true);
							Expect(tmpMatches[0].FullMatch).to.equal('apple 10');
							Expect(tmpMatches[0].Groups).to.deep.equal(['apple', '10']);

							Expect(tmpMatches[1].Groups[0]).to.equal('banana');
							Expect(tmpMatches[1].Groups[1]).to.equal('20');

							Expect(tmpMatches[2].Groups[0]).to.equal('cherry');
							fDone();
						});
				}
			);

			test
			(
				'Should include non-matching lines with Match=false.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-LINEMATCH-PARTIAL',
							Name: 'LineMatch Partial',
							Type: 'LineMatch',
							Data: 'INFO: started\nERROR: failure\nINFO: done',
							Pattern: 'ERROR:\\s+(.*)'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');

							let tmpMatches = tmpContext.GlobalState.Output;
							Expect(tmpMatches.length).to.equal(3);

							// First line does not match
							Expect(tmpMatches[0].Match).to.equal(false);
							Expect(tmpMatches[0].FullMatch).to.be.null;
							Expect(tmpMatches[0].Groups).to.deep.equal([]);

							// Second line matches
							Expect(tmpMatches[1].Match).to.equal(true);
							Expect(tmpMatches[1].FullMatch).to.equal('ERROR: failure');
							Expect(tmpMatches[1].Groups[0]).to.equal('failure');

							// Third line does not match
							Expect(tmpMatches[2].Match).to.equal(false);
							fDone();
						});
				}
			);

			test
			(
				'Should resolve input from a GlobalState Address.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							LogData: 'line1\nline2\nline3'
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-LINEMATCH-ADDR',
							Name: 'LineMatch Address',
							Type: 'LineMatch',
							Address: 'LogData',
							Pattern: 'line(\\d+)'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');

							let tmpMatches = tmpContext.GlobalState.Output;
							Expect(tmpMatches.length).to.equal(3);
							Expect(tmpMatches[0].Groups[0]).to.equal('1');
							Expect(tmpMatches[2].Groups[0]).to.equal('3');
							fDone();
						});
				}
			);

			test
			(
				'Should support a custom Separator.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-LINEMATCH-SEP',
							Name: 'LineMatch Custom Separator',
							Type: 'LineMatch',
							Data: 'red|green|blue',
							Pattern: '(\\w+)',
							Separator: '|'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');

							let tmpMatches = tmpContext.GlobalState.Output;
							Expect(tmpMatches.length).to.equal(3);
							Expect(tmpMatches[0].Groups[0]).to.equal('red');
							Expect(tmpMatches[1].Groups[0]).to.equal('green');
							Expect(tmpMatches[2].Groups[0]).to.equal('blue');
							fDone();
						});
				}
			);

			test
			(
				'Should support case-insensitive Flags.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-LINEMATCH-FLAGS',
							Name: 'LineMatch Flags',
							Type: 'LineMatch',
							Data: 'Hello World\nhello world',
							Pattern: '(hello)',
							Flags: 'i'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');

							let tmpMatches = tmpContext.GlobalState.Output;
							Expect(tmpMatches.length).to.equal(2);
							// Both lines should match with case-insensitive flag
							Expect(tmpMatches[0].Match).to.equal(true);
							Expect(tmpMatches[0].Groups[0]).to.equal('Hello');
							Expect(tmpMatches[1].Match).to.equal(true);
							Expect(tmpMatches[1].Groups[0]).to.equal('hello');
							fDone();
						});
				}
			);

			test
			(
				'Should store results at a custom Destination.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-LINEMATCH-DEST',
							Name: 'LineMatch Custom Dest',
							Type: 'LineMatch',
							Data: 'foo\nbar',
							Pattern: '(\\w+)',
							Destination: 'ParsedLines'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(tmpContext.GlobalState.ParsedLines).to.be.an('array');
							Expect(tmpContext.GlobalState.ParsedLines.length).to.equal(2);
							fDone();
						});
				}
			);

			test
			(
				'Should fail when Pattern is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-LINEMATCH-NOPAT',
							Name: 'LineMatch No Pattern',
							Type: 'LineMatch',
							Data: 'some text'
						},
						{ StagingPath: tmpStagingDir, GlobalState: {} },
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
				'Should fail when neither Address nor Data is provided.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-LINEMATCH-NOINPUT',
							Name: 'LineMatch No Input',
							Type: 'LineMatch',
							Pattern: '(\\w+)'
						},
						{ StagingPath: tmpStagingDir, GlobalState: {} },
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
				'Should fail when Pattern is an invalid regex.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-LINEMATCH-BADREGEX',
							Name: 'LineMatch Bad Regex',
							Type: 'LineMatch',
							Data: 'test',
							Pattern: '([unclosed'
						},
						{ StagingPath: tmpStagingDir, GlobalState: {} },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Error');
							fDone();
						});
				}
			);

			// --- CollectValues ---
			test
			(
				'Should extract a field from a flat array of objects.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							Records: [
								{ IDObservation: 101, Name: 'Alpha' },
								{ IDObservation: 102, Name: 'Beta' },
								{ IDObservation: 103, Name: 'Gamma' }
							]
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CV-BASIC',
							Name: 'CollectValues Basic',
							Type: 'CollectValues',
							Address: 'Records',
							Field: 'IDObservation',
							Destination: 'IDs'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);

							let tmpIDs = tmpContext.GlobalState.IDs;
							Expect(tmpIDs).to.be.an('array');
							Expect(tmpIDs).to.deep.equal([101, 102, 103]);
							fDone();
						});
				}
			);

			test
			(
				'Should collect values from paged arrays (array of arrays).',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							Pages: [
								[
									{ IDObservation: 1, Name: 'A' },
									{ IDObservation: 2, Name: 'B' }
								],
								[
									{ IDObservation: 3, Name: 'C' }
								]
							]
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CV-PAGED',
							Name: 'CollectValues Paged',
							Type: 'CollectValues',
							Address: 'Pages',
							Field: 'IDObservation',
							Destination: 'AllIDs'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);

							let tmpIDs = tmpContext.GlobalState.AllIDs;
							Expect(tmpIDs).to.deep.equal([1, 2, 3]);
							fDone();
						});
				}
			);

			test
			(
				'Should navigate RecordPath to find nested arrays.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							Pages: [
								{ JSON: { records: [{ IDObservation: 10 }, { IDObservation: 20 }] } },
								{ JSON: { records: [{ IDObservation: 30 }] } }
							]
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CV-RECORDPATH',
							Name: 'CollectValues RecordPath',
							Type: 'CollectValues',
							Address: 'Pages',
							RecordPath: 'JSON.records',
							Field: 'IDObservation',
							Destination: 'ObsIDs'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);

							let tmpIDs = tmpContext.GlobalState.ObsIDs;
							Expect(tmpIDs).to.deep.equal([10, 20, 30]);
							fDone();
						});
				}
			);

			test
			(
				'Should deduplicate values when Unique is true.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							Items: [
								{ Category: 'A' },
								{ Category: 'B' },
								{ Category: 'A' },
								{ Category: 'C' },
								{ Category: 'B' }
							]
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CV-UNIQUE',
							Name: 'CollectValues Unique',
							Type: 'CollectValues',
							Address: 'Items',
							Field: 'Category',
							Unique: true,
							Destination: 'UniqueCategories'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');

							let tmpCats = tmpContext.GlobalState.UniqueCategories;
							Expect(tmpCats).to.deep.equal(['A', 'B', 'C']);
							fDone();
						});
				}
			);

			test
			(
				'Should extract nested fields via dot-notation.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							Data: [
								{ Details: { ID: 'x1' } },
								{ Details: { ID: 'x2' } },
								{ Details: { ID: 'x3' } }
							]
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CV-NESTED-FIELD',
							Name: 'CollectValues Nested Field',
							Type: 'CollectValues',
							Address: 'Data',
							Field: 'Details.ID',
							Destination: 'NestedIDs'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');

							let tmpIDs = tmpContext.GlobalState.NestedIDs;
							Expect(tmpIDs).to.deep.equal(['x1', 'x2', 'x3']);
							fDone();
						});
				}
			);

			test
			(
				'Should fail when Address is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CV-NO-ADDR',
							Name: 'CollectValues No Address',
							Type: 'CollectValues',
							Field: 'IDObservation'
						},
						{ StagingPath: tmpStagingDir, GlobalState: {} },
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
				'Should fail when Field is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CV-NO-FIELD',
							Name: 'CollectValues No Field',
							Type: 'CollectValues',
							Address: 'Records'
						},
						{ StagingPath: tmpStagingDir, GlobalState: { Records: [{ ID: 1 }] } },
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
				'Should succeed with empty result when Address resolves to null.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CV-NULL-ADDR',
							Name: 'CollectValues Null Address',
							Type: 'CollectValues',
							Address: 'NonExistent',
							Field: 'ID'
						},
						{ StagingPath: tmpStagingDir, GlobalState: {} },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);
							Expect(pResult.Output).to.equal('[]');
							fDone();
						});
				}
			);

			test
			(
				'Should handle empty source array gracefully.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							EmptyList: []
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CV-EMPTY',
							Name: 'CollectValues Empty',
							Type: 'CollectValues',
							Address: 'EmptyList',
							Field: 'ID',
							Destination: 'Result'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);

							let tmpResult = tmpContext.GlobalState.Result;
							Expect(tmpResult).to.deep.equal([]);
							fDone();
						});
				}
			);

			test
			(
				'Should skip records where the field is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							Mixed: [
								{ IDObservation: 1 },
								{ Name: 'no-id' },
								{ IDObservation: 3 }
							]
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CV-MISSING-FIELD',
							Name: 'CollectValues Missing Field',
							Type: 'CollectValues',
							Address: 'Mixed',
							Field: 'IDObservation',
							Destination: 'PartialIDs'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');

							let tmpIDs = tmpContext.GlobalState.PartialIDs;
							Expect(tmpIDs).to.deep.equal([1, 3]);
							fDone();
						});
				}
			);

			test
			(
				'Should wrap a single object source in an array.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							SingleRecord: { IDObservation: 42, Name: 'Solo' }
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CV-SINGLE-OBJ',
							Name: 'CollectValues Single Object',
							Type: 'CollectValues',
							Address: 'SingleRecord',
							Field: 'IDObservation',
							Destination: 'SingleResult'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');

							let tmpResult = tmpContext.GlobalState.SingleResult;
							Expect(tmpResult).to.deep.equal([42]);
							fDone();
						});
				}
			);

			test
			(
				'Should skip null elements in the source array.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							Sparse: [
								{ ID: 1 },
								null,
								{ ID: 3 },
								undefined,
								{ ID: 5 }
							]
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CV-NULL-ELEMENTS',
							Name: 'CollectValues Null Elements',
							Type: 'CollectValues',
							Address: 'Sparse',
							Field: 'ID',
							Destination: 'SparseResult'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');

							let tmpResult = tmpContext.GlobalState.SparseResult;
							Expect(tmpResult).to.deep.equal([1, 3, 5]);
							fDone();
						});
				}
			);

			// --- CommandEach ---
			test
			(
				'Should execute a command for each value in an array.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							IDs: [10, 20, 30]
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CE-BASIC',
							Name: 'CommandEach Basic',
							Type: 'CommandEach',
							Address: 'IDs',
							Command: 'echo {Value}'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);

							let tmpResults = tmpContext.GlobalState.Output;
							Expect(tmpResults).to.be.an('array');
							Expect(tmpResults.length).to.equal(3);

							Expect(tmpResults[0].Value).to.equal(10);
							Expect(tmpResults[0].Index).to.equal(0);
							Expect(tmpResults[0].Success).to.equal(true);
							Expect(tmpResults[0].StdOut.trim()).to.equal('10');

							Expect(tmpResults[1].StdOut.trim()).to.equal('20');
							Expect(tmpResults[2].StdOut.trim()).to.equal('30');
							fDone();
						});
				}
			);

			test
			(
				'Should interpolate {Value}, {Index}, and {Count} in the command.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							Names: ['alpha', 'beta']
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CE-INTERPOLATE',
							Name: 'CommandEach Interpolate',
							Type: 'CommandEach',
							Address: 'Names',
							Command: 'echo {Index}:{Value}:{Count}'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');

							let tmpResults = tmpContext.GlobalState.Output;
							Expect(tmpResults[0].StdOut.trim()).to.equal('0:alpha:2');
							Expect(tmpResults[1].StdOut.trim()).to.equal('1:beta:2');
							fDone();
						});
				}
			);

			test
			(
				'Should continue on error by default.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							Cmds: ['hello', 'fail_this', 'world']
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CE-CONTINUE',
							Name: 'CommandEach Continue',
							Type: 'CommandEach',
							Address: 'Cmds',
							Command: 'echo {Value} && test {Value} != fail_this'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							// Should complete but with Success=false since one failed
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(false);

							let tmpResults = tmpContext.GlobalState.Output;
							Expect(tmpResults.length).to.equal(3);
							Expect(tmpResults[0].Success).to.equal(true);
							Expect(tmpResults[1].Success).to.equal(false);
							Expect(tmpResults[2].Success).to.equal(true);
							fDone();
						});
				}
			);

			test
			(
				'Should stop at first failure when ContinueOnError is false.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							Vals: ['ok', 'bad', 'never']
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CE-STOP',
							Name: 'CommandEach Stop On Error',
							Type: 'CommandEach',
							Address: 'Vals',
							Command: 'test {Value} = ok',
							ContinueOnError: false
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Error');
							Expect(pResult.Success).to.equal(false);

							let tmpResults = tmpContext.GlobalState.Output;
							// Should have stopped after the second (failed) command
							Expect(tmpResults.length).to.equal(2);
							Expect(tmpResults[0].Success).to.equal(true);
							Expect(tmpResults[1].Success).to.equal(false);
							fDone();
						});
				}
			);

			test
			(
				'Should store results at a custom Destination.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							Nums: [1, 2]
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CE-DEST',
							Name: 'CommandEach Destination',
							Type: 'CommandEach',
							Address: 'Nums',
							Command: 'echo {Value}',
							Destination: 'CmdResults'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');

							Expect(tmpContext.GlobalState.CmdResults).to.be.an('array');
							Expect(tmpContext.GlobalState.CmdResults.length).to.equal(2);
							fDone();
						});
				}
			);

			test
			(
				'Should handle empty source array gracefully.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							EmptyArr: []
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CE-EMPTY',
							Name: 'CommandEach Empty',
							Type: 'CommandEach',
							Address: 'EmptyArr',
							Command: 'echo {Value}'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);

							let tmpResults = tmpContext.GlobalState.Output;
							Expect(tmpResults).to.deep.equal([]);
							fDone();
						});
				}
			);

			test
			(
				'Should fail when Address is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CE-NO-ADDR',
							Name: 'CommandEach No Address',
							Type: 'CommandEach',
							Command: 'echo hello'
						},
						{ StagingPath: tmpStagingDir, GlobalState: {} },
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
				'Should fail when Command is missing.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CE-NO-CMD',
							Name: 'CommandEach No Command',
							Type: 'CommandEach',
							Address: 'IDs'
						},
						{ StagingPath: tmpStagingDir, GlobalState: { IDs: [1] } },
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
				'Should succeed with empty result when Address resolves to null.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CE-NULL-ADDR',
							Name: 'CommandEach Null Address',
							Type: 'CommandEach',
							Address: 'DoesNotExist',
							Command: 'echo {Value}'
						},
						{ StagingPath: tmpStagingDir, GlobalState: {} },
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');
							Expect(pResult.Success).to.equal(true);
							Expect(pResult.Output).to.equal('[]');
							fDone();
						});
				}
			);

			test
			(
				'Should wrap a single non-array value into an array.',
				function(fDone)
				{
					let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];
					let tmpContext = {
						StagingPath: tmpStagingDir,
						GlobalState: {
							SingleVal: 42
						}
					};

					tmpTaskService.executeTask(
						{
							GUIDTask: 'TEST-CE-SINGLE',
							Name: 'CommandEach Single Value',
							Type: 'CommandEach',
							Address: 'SingleVal',
							Command: 'echo {Value}'
						},
						tmpContext,
						function (pError, pResult)
						{
							Expect(pError).to.be.null;
							Expect(pResult.Status).to.equal('Complete');

							let tmpResults = tmpContext.GlobalState.Output;
							Expect(tmpResults.length).to.equal(1);
							Expect(tmpResults[0].StdOut.trim()).to.equal('42');
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

		suite
		(
			'Operation Staging Folder',
			function()
			{
				let tmpStagingRoot = require('path').resolve(__dirname, '../.test_staging_ops');

				setup
				(
					function()
					{
						// Override the staging root for tests
						libUltravisor.fable.ProgramConfiguration = libUltravisor.fable.ProgramConfiguration || {};
						libUltravisor.fable.ProgramConfiguration.UltravisorStagingRoot = tmpStagingRoot;
					}
				);

				test
				(
					'Should auto-create a staging folder for an operation.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];
						let libFS = require('fs');
						let libPath = require('path');

						tmpState.updateTask(
							{
								GUIDTask: 'STAGING-TASK-001',
								Name: 'Staging Echo',
								Type: 'Command',
								Command: 'echo staging_test'
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpOperationService.executeOperation(
									{
										GUIDOperation: 'STAGING-OP-001',
										Name: 'Staging Test Op',
										Tasks: ['STAGING-TASK-001']
									},
									function (pExecError, pManifest)
									{
										Expect(pExecError).to.be.null;
										Expect(pManifest.Status).to.equal('Complete');
										Expect(pManifest.Success).to.equal(true);
										Expect(pManifest.StagingPath).to.be.a('string');

										// The staging folder should exist and start with the operation GUID
										let tmpExpectedPrefix = libPath.resolve(tmpStagingRoot, 'STAGING-OP-001-');
										Expect(pManifest.StagingPath.startsWith(tmpExpectedPrefix)).to.equal(true);
										Expect(libFS.existsSync(pManifest.StagingPath)).to.equal(true);

										// The manifest JSON should have been written
										let tmpManifestFile = libPath.join(pManifest.StagingPath, 'Manifest_STAGING-OP-001.json');
										Expect(libFS.existsSync(tmpManifestFile)).to.equal(true);

										let tmpManifestJSON = JSON.parse(libFS.readFileSync(tmpManifestFile, 'utf8'));
										Expect(tmpManifestJSON.GUIDOperation).to.equal('STAGING-OP-001');
										Expect(tmpManifestJSON.Status).to.equal('Complete');

										fDone();
									});
							});
					}
				);

				test
				(
					'Should write task output files into the operation staging folder.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];
						let libFS = require('fs');
						let libPath = require('path');

						tmpState.updateTask(
							{
								GUIDTask: 'STAGING-WRITE-TASK',
								Name: 'Write to Staging',
								Type: 'WriteJSON',
								File: 'output.json',
								Data: { message: 'written to staging' }
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpOperationService.executeOperation(
									{
										GUIDOperation: 'STAGING-OP-WRITE',
										Name: 'Staging Write Op',
										Tasks: ['STAGING-WRITE-TASK']
									},
									function (pExecError, pManifest)
									{
										Expect(pExecError).to.be.null;
										Expect(pManifest.Status).to.equal('Complete');

										// Verify the file was written to the staging folder
										let tmpExpectedFile = libPath.join(pManifest.StagingPath, 'output.json');
										Expect(libFS.existsSync(tmpExpectedFile)).to.equal(true);

										let tmpContent = JSON.parse(libFS.readFileSync(tmpExpectedFile, 'utf8'));
										Expect(tmpContent.message).to.equal('written to staging');

										fDone();
									});
							});
					}
				);

				test
				(
					'Should use explicit StagingPath when provided.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];
						let libFS = require('fs');
						let libPath = require('path');

						let tmpCustomPath = libPath.resolve(__dirname, '../.test_custom_staging');
						if (!libFS.existsSync(tmpCustomPath))
						{
							libFS.mkdirSync(tmpCustomPath, { recursive: true });
						}

						tmpState.updateTask(
							{
								GUIDTask: 'STAGING-CUSTOM-TASK',
								Name: 'Custom Staging Echo',
								Type: 'Command',
								Command: 'echo custom_staging'
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpOperationService.executeOperation(
									{
										GUIDOperation: 'STAGING-OP-CUSTOM',
										Name: 'Custom Staging Op',
										Tasks: ['STAGING-CUSTOM-TASK'],
										StagingPath: tmpCustomPath
									},
									function (pExecError, pManifest)
									{
										Expect(pExecError).to.be.null;
										Expect(pManifest.Status).to.equal('Complete');
										Expect(pManifest.StagingPath).to.equal(tmpCustomPath);

										// Manifest should be written in the custom path
										let tmpManifestFile = libPath.join(tmpCustomPath, 'Manifest_STAGING-OP-CUSTOM.json');
										Expect(libFS.existsSync(tmpManifestFile)).to.equal(true);

										// Cleanup custom staging
										try
										{
											libFS.rmSync(tmpCustomPath, { recursive: true, force: true });
										}
										catch (pIgnore) {}

										fDone();
									});
							});
					}
				);

				test
				(
					'Should write WriteBinary output into the operation staging folder.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];
						let libFS = require('fs');
						let libPath = require('path');

						tmpState.updateTask(
							{
								GUIDTask: 'STAGING-WRITEBINARY-TASK',
								Name: 'Write Binary to Staging',
								Type: 'WriteBinary',
								File: 'binary_output.bin',
								Data: [0xFF, 0xD8, 0xFF, 0xE0]
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpOperationService.executeOperation(
									{
										GUIDOperation: 'STAGING-OP-BINARY',
										Name: 'Staging Binary Op',
										Tasks: ['STAGING-WRITEBINARY-TASK']
									},
									function (pExecError, pManifest)
									{
										Expect(pExecError).to.be.null;
										Expect(pManifest.Status).to.equal('Complete');

										let tmpExpectedFile = libPath.join(pManifest.StagingPath, 'binary_output.bin');
										Expect(libFS.existsSync(tmpExpectedFile)).to.equal(true);

										let tmpWritten = libFS.readFileSync(tmpExpectedFile);
										Expect(tmpWritten.length).to.equal(4);
										Expect(tmpWritten[0]).to.equal(0xFF);
										Expect(tmpWritten[1]).to.equal(0xD8);

										fDone();
									});
							});
					}
				);

				suiteTeardown
				(
					function()
					{
						let libFS = require('fs');
						// Clean up staging folders
						try
						{
							libFS.rmSync(tmpStagingRoot, { recursive: true, force: true });
						}
						catch (pIgnore) {}
					}
				);
			}
		);

		suite
		(
			'GeneratePagedOperation',
			function()
			{
				let tmpStagingRoot = require('path').resolve(__dirname, '../.test_staging_paged');

				setup
				(
					function()
					{
						libUltravisor.fable.ProgramConfiguration = libUltravisor.fable.ProgramConfiguration || {};
						libUltravisor.fable.ProgramConfiguration.UltravisorStagingRoot = tmpStagingRoot;
					}
				);

				test
				(
					'Should generate the correct number of page tasks.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];

						tmpState.updateTask(
							{
								GUIDTask: 'PAGED-GEN-001',
								Name: 'Generate Pages',
								Type: 'GeneratePagedOperation',
								RecordCount: 7,
								PageSize: 3,
								AutoExecute: false,
								TaskTemplate: {
									Type: 'Command',
									Command: 'echo page {PageIndex}'
								}
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpOperationService.executeOperation(
									{
										GUIDOperation: 'PAGED-OP-001',
										Name: 'Paged Gen Op',
										Tasks: ['PAGED-GEN-001']
									},
									function (pExecError, pManifest)
									{
										Expect(pExecError).to.be.null;
										Expect(pManifest.Status).to.equal('Complete');
										Expect(pManifest.TaskResults).to.have.length(1);
										Expect(pManifest.TaskResults[0].Status).to.equal('Complete');
										Expect(pManifest.TaskResults[0].Success).to.equal(true);

										// Should have generated 3 pages (ceil(7/3) = 3)
										let tmpOutput = pManifest.TaskResults[0].Output;
										// Output is the operation GUID when AutoExecute is false
										Expect(tmpOutput).to.be.a('string');
										Expect(tmpOutput.length).to.be.greaterThan(0);

										// Check that the standalone config file was written
										let libFS = require('fs');
										let libPath = require('path');
										let tmpConfigPath = libPath.join(pManifest.StagingPath, `PagedOperation_${tmpOutput}.json`);
										Expect(libFS.existsSync(tmpConfigPath)).to.equal(true);

										let tmpConfig = JSON.parse(libFS.readFileSync(tmpConfigPath, 'utf8'));
										let tmpTaskKeys = Object.keys(tmpConfig.Tasks);
										Expect(tmpTaskKeys.length).to.equal(3);

										// Verify the operation definition has 3 tasks
										let tmpOpKeys = Object.keys(tmpConfig.Operations);
										Expect(tmpOpKeys.length).to.equal(1);
										let tmpOpDef = tmpConfig.Operations[tmpOpKeys[0]];
										Expect(tmpOpDef.Tasks.length).to.equal(3);

										fDone();
									});
							});
					}
				);

				test
				(
					'Should interpolate template variables in task definitions.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];

						tmpState.updateTask(
							{
								GUIDTask: 'PAGED-INTERP-001',
								Name: 'Interpolation Test',
								Type: 'GeneratePagedOperation',
								RecordCount: 50,
								PageSize: 25,
								AutoExecute: false,
								TaskTemplate: {
									Type: 'Command',
									Command: 'echo offset={PageStart} size={PageSize} index={PageIndex} total={PageCount}',
									URL: 'https://example.com/api/{PageStart}/{PageSize}',
									Body: {
										Offset: '{PageStart}',
										Limit: '{PageSize}'
									}
								}
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpOperationService.executeOperation(
									{
										GUIDOperation: 'PAGED-OP-INTERP',
										Name: 'Interp Op',
										Tasks: ['PAGED-INTERP-001']
									},
									function (pExecError, pManifest)
									{
										Expect(pExecError).to.be.null;
										Expect(pManifest.Status).to.equal('Complete');

										let tmpOutput = pManifest.TaskResults[0].Output;
										let libFS = require('fs');
										let libPath = require('path');
										let tmpConfigPath = libPath.join(pManifest.StagingPath, `PagedOperation_${tmpOutput}.json`);
										let tmpConfig = JSON.parse(libFS.readFileSync(tmpConfigPath, 'utf8'));

										let tmpTaskKeys = Object.keys(tmpConfig.Tasks);
										Expect(tmpTaskKeys.length).to.equal(2);

										// Check first page task
										let tmpPage0 = tmpConfig.Tasks[tmpTaskKeys[0]];
										Expect(tmpPage0.Command).to.equal('echo offset=0 size=25 index=0 total=2');
										Expect(tmpPage0.URL).to.equal('https://example.com/api/0/25');
										Expect(tmpPage0.Body.Offset).to.equal('0');
										Expect(tmpPage0.Body.Limit).to.equal('25');
										Expect(tmpPage0.Name).to.equal('Page 1 of 2');
										Expect(tmpPage0.Destination).to.equal('Pages[0]');

										// Check second page task
										let tmpPage1 = tmpConfig.Tasks[tmpTaskKeys[1]];
										Expect(tmpPage1.Command).to.equal('echo offset=25 size=25 index=1 total=2');
										Expect(tmpPage1.URL).to.equal('https://example.com/api/25/25');
										Expect(tmpPage1.Body.Offset).to.equal('25');
										Expect(tmpPage1.Body.Limit).to.equal('25');
										Expect(tmpPage1.Name).to.equal('Page 2 of 2');
										Expect(tmpPage1.Destination).to.equal('Pages[1]');

										fDone();
									});
							});
					}
				);

				test
				(
					'Should resolve RecordCount from GlobalState address.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];

						tmpState.updateTask(
							{
								GUIDTask: 'PAGED-ADDR-001',
								Name: 'Address Resolve Test',
								Type: 'GeneratePagedOperation',
								RecordCount: 'TotalCount',
								PageSize: 10,
								AutoExecute: false,
								TaskTemplate: {
									Type: 'Command',
									Command: 'echo page {PageIndex}'
								}
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpOperationService.executeOperation(
									{
										GUIDOperation: 'PAGED-OP-ADDR',
										Name: 'Address Op',
										Tasks: ['PAGED-ADDR-001'],
										GlobalState: { TotalCount: 35 }
									},
									function (pExecError, pManifest)
									{
										Expect(pExecError).to.be.null;
										Expect(pManifest.Status).to.equal('Complete');

										let tmpOutput = pManifest.TaskResults[0].Output;
										let libFS = require('fs');
										let libPath = require('path');
										let tmpConfigPath = libPath.join(pManifest.StagingPath, `PagedOperation_${tmpOutput}.json`);
										let tmpConfig = JSON.parse(libFS.readFileSync(tmpConfigPath, 'utf8'));

										// ceil(35/10) = 4 pages
										let tmpTaskKeys = Object.keys(tmpConfig.Tasks);
										Expect(tmpTaskKeys.length).to.equal(4);

										fDone();
									});
							});
					}
				);

				test
				(
					'Should handle zero RecordCount gracefully.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];

						tmpState.updateTask(
							{
								GUIDTask: 'PAGED-ZERO-001',
								Name: 'Zero Records Test',
								Type: 'GeneratePagedOperation',
								RecordCount: 0,
								PageSize: 25,
								AutoExecute: false,
								TaskTemplate: {
									Type: 'Command',
									Command: 'echo page {PageIndex}'
								}
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpOperationService.executeOperation(
									{
										GUIDOperation: 'PAGED-OP-ZERO',
										Name: 'Zero Op',
										Tasks: ['PAGED-ZERO-001']
									},
									function (pExecError, pManifest)
									{
										Expect(pExecError).to.be.null;
										Expect(pManifest.Status).to.equal('Complete');
										Expect(pManifest.TaskResults[0].Status).to.equal('Complete');
										Expect(pManifest.TaskResults[0].Success).to.equal(true);

										// Check log says no pages to generate
										let tmpLog = pManifest.TaskResults[0].Log;
										let tmpFoundZeroMsg = tmpLog.some(function(pMsg) { return pMsg.indexOf('RecordCount is 0') !== -1; });
										Expect(tmpFoundZeroMsg).to.equal(true);

										fDone();
									});
							});
					}
				);

				test
				(
					'Should fail when RecordCount cannot be resolved.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];

						tmpState.updateTask(
							{
								GUIDTask: 'PAGED-NOCOUNT-001',
								Name: 'Missing Count Test',
								Type: 'GeneratePagedOperation',
								RecordCount: 'NonExistent.Address',
								PageSize: 25,
								AutoExecute: false,
								TaskTemplate: {
									Type: 'Command',
									Command: 'echo page {PageIndex}'
								}
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpOperationService.executeOperation(
									{
										GUIDOperation: 'PAGED-OP-NOCOUNT',
										Name: 'No Count Op',
										Tasks: ['PAGED-NOCOUNT-001'],
										GlobalState: {}
									},
									function (pExecError, pManifest)
									{
										Expect(pExecError).to.be.null;
										// Operation status is 'Error' because the task failed
										Expect(pManifest.Status).to.equal('Error');
										Expect(pManifest.TaskResults[0].Status).to.equal('Error');

										fDone();
									});
							});
					}
				);

				test
				(
					'Should fail when TaskTemplate is missing.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];

						tmpState.updateTask(
							{
								GUIDTask: 'PAGED-NOTEMPL-001',
								Name: 'Missing Template Test',
								Type: 'GeneratePagedOperation',
								RecordCount: 10,
								PageSize: 5,
								AutoExecute: false
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpOperationService.executeOperation(
									{
										GUIDOperation: 'PAGED-OP-NOTEMPL',
										Name: 'No Template Op',
										Tasks: ['PAGED-NOTEMPL-001']
									},
									function (pExecError, pManifest)
									{
										Expect(pExecError).to.be.null;
										// Operation status is 'Error' because the task failed
										Expect(pManifest.Status).to.equal('Error');
										Expect(pManifest.TaskResults[0].Status).to.equal('Error');

										let tmpLog = pManifest.TaskResults[0].Log;
										let tmpFoundTemplMsg = tmpLog.some(function(pMsg) { return pMsg.indexOf('TaskTemplate is required') !== -1; });
										Expect(tmpFoundTemplMsg).to.equal(true);

										fDone();
									});
							});
					}
				);

				test
				(
					'Should auto-execute generated operation and pass GlobalState.',
					function(fDone)
					{
						this.timeout(10000);

						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];

						tmpState.updateTask(
							{
								GUIDTask: 'PAGED-AUTOEXEC-001',
								Name: 'Auto Execute Test',
								Type: 'GeneratePagedOperation',
								RecordCount: 4,
								PageSize: 2,
								AutoExecute: true,
								TaskTemplate: {
									Type: 'Command',
									Command: 'echo page {PageIndex} of {PageCount}'
								}
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpOperationService.executeOperation(
									{
										GUIDOperation: 'PAGED-OP-AUTOEXEC',
										Name: 'Auto Exec Op',
										Tasks: ['PAGED-AUTOEXEC-001'],
										GlobalState: { TestMarker: 'passed-through' }
									},
									function (pExecError, pManifest)
									{
										Expect(pExecError).to.be.null;
										Expect(pManifest.Status).to.equal('Complete');
										Expect(pManifest.TaskResults[0].Status).to.equal('Complete');

										// Parse the output JSON
										let tmpOutput = JSON.parse(pManifest.TaskResults[0].Output);
										Expect(tmpOutput.PageCount).to.equal(2);
										Expect(tmpOutput.ChildManifestStatus).to.equal('Complete');
										Expect(tmpOutput.ChildManifestSuccess).to.equal(true);

										// Verify ephemeral tasks were cleaned up from state
										let tmpOpGUID = tmpOutput.OperationGUID;
										Expect(tmpState._Operations[tmpOpGUID]).to.be.undefined;
										Expect(tmpState._Tasks[`${tmpOpGUID}-page-0`]).to.be.undefined;
										Expect(tmpState._Tasks[`${tmpOpGUID}-page-1`]).to.be.undefined;

										fDone();
									});
							});
					}
				);

				test
				(
					'Should set Retries on generated page tasks.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];

						tmpState.updateTask(
							{
								GUIDTask: 'PAGED-RETRY-001',
								Name: 'Retries Test',
								Type: 'GeneratePagedOperation',
								RecordCount: 5,
								PageSize: 5,
								AutoExecute: false,
								Retries: 3,
								TaskTemplate: {
									Type: 'Command',
									Command: 'echo page {PageIndex}'
								}
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpOperationService.executeOperation(
									{
										GUIDOperation: 'PAGED-OP-RETRY',
										Name: 'Retry Op',
										Tasks: ['PAGED-RETRY-001']
									},
									function (pExecError, pManifest)
									{
										Expect(pExecError).to.be.null;
										Expect(pManifest.Status).to.equal('Complete');

										let tmpOutput = pManifest.TaskResults[0].Output;
										let libFS = require('fs');
										let libPath = require('path');
										let tmpConfigPath = libPath.join(pManifest.StagingPath, `PagedOperation_${tmpOutput}.json`);
										let tmpConfig = JSON.parse(libFS.readFileSync(tmpConfigPath, 'utf8'));

										let tmpTaskKeys = Object.keys(tmpConfig.Tasks);
										Expect(tmpTaskKeys.length).to.equal(1);
										Expect(tmpConfig.Tasks[tmpTaskKeys[0]].Retries).to.equal(3);

										fDone();
									});
							});
					}
				);

				test
				(
					'Should cap RecordCount with MaximumRecordCount.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];

						tmpState.updateTask(
							{
								GUIDTask: 'PAGED-MAXCOUNT-001',
								Name: 'MaximumRecordCount Test',
								Type: 'GeneratePagedOperation',
								RecordCount: 200,
								MaximumRecordCount: 50,
								PageSize: 25,
								AutoExecute: false,
								TaskTemplate: {
									Type: 'Command',
									Command: 'echo page {PageIndex}'
								}
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpOperationService.executeOperation(
									{
										GUIDOperation: 'PAGED-OP-MAXCOUNT',
										Name: 'MaxCount Op',
										Tasks: ['PAGED-MAXCOUNT-001']
									},
									function (pExecError, pManifest)
									{
										Expect(pExecError).to.be.null;
										Expect(pManifest.Status).to.equal('Complete');
										Expect(pManifest.TaskResults[0].Status).to.equal('Complete');
										Expect(pManifest.TaskResults[0].Success).to.equal(true);

										let tmpOutput = pManifest.TaskResults[0].Output;
										let libFS = require('fs');
										let libPath = require('path');
										let tmpConfigPath = libPath.join(pManifest.StagingPath, `PagedOperation_${tmpOutput}.json`);
										let tmpConfig = JSON.parse(libFS.readFileSync(tmpConfigPath, 'utf8'));

										// ceil(50/25) = 2 pages, NOT ceil(200/25) = 8 pages
										let tmpTaskKeys = Object.keys(tmpConfig.Tasks);
										Expect(tmpTaskKeys.length).to.equal(2);

										// Verify the log mentions capping
										let tmpLog = pManifest.TaskResults[0].Log;
										let tmpFoundCapMsg = tmpLog.some(function(pMsg) { return pMsg.indexOf('capping RecordCount') !== -1; });
										Expect(tmpFoundCapMsg).to.equal(true);

										fDone();
									});
							});
					}
				);

				test
				(
					'Should not cap when MaximumRecordCount exceeds RecordCount.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpOperationService = libUltravisor.fable['Ultravisor-Operation'];

						tmpState.updateTask(
							{
								GUIDTask: 'PAGED-MAXCOUNT-002',
								Name: 'MaximumRecordCount No-Cap Test',
								Type: 'GeneratePagedOperation',
								RecordCount: 30,
								MaximumRecordCount: 500,
								PageSize: 10,
								AutoExecute: false,
								TaskTemplate: {
									Type: 'Command',
									Command: 'echo page {PageIndex}'
								}
							},
							function (pError)
							{
								Expect(pError).to.be.null;

								tmpOperationService.executeOperation(
									{
										GUIDOperation: 'PAGED-OP-MAXCOUNT-NOCAP',
										Name: 'No Cap Op',
										Tasks: ['PAGED-MAXCOUNT-002']
									},
									function (pExecError, pManifest)
									{
										Expect(pExecError).to.be.null;
										Expect(pManifest.Status).to.equal('Complete');

										let tmpOutput = pManifest.TaskResults[0].Output;
										let libFS = require('fs');
										let libPath = require('path');
										let tmpConfigPath = libPath.join(pManifest.StagingPath, `PagedOperation_${tmpOutput}.json`);
										let tmpConfig = JSON.parse(libFS.readFileSync(tmpConfigPath, 'utf8'));

										// ceil(30/10) = 3 pages (not capped)
										let tmpTaskKeys = Object.keys(tmpConfig.Tasks);
										Expect(tmpTaskKeys.length).to.equal(3);

										// Verify the log does NOT mention capping
										let tmpLog = pManifest.TaskResults[0].Log;
										let tmpFoundCapMsg = tmpLog.some(function(pMsg) { return pMsg.indexOf('capping RecordCount') !== -1; });
										Expect(tmpFoundCapMsg).to.equal(false);

										fDone();
									});
							});
					}
				);

				suiteTeardown
				(
					function()
					{
						let libFS = require('fs');
						try
						{
							libFS.rmSync(tmpStagingRoot, { recursive: true, force: true });
						}
						catch (pIgnore) {}
					}
				);
			}
		);

		suite
		(
			'LaunchOperation and LaunchTask',
			function()
			{
				test
				(
					'Should launch an operation asynchronously.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						// Register a simple target task and operation
						tmpState._Tasks['LAUNCH-TARGET-ECHO'] = {
							GUIDTask: 'LAUNCH-TARGET-ECHO',
							Name: 'Launch Target Echo',
							Type: 'Command',
							Command: 'echo launched'
						};
						tmpState._Operations['LAUNCH-TARGET-OP'] = {
							GUIDOperation: 'LAUNCH-TARGET-OP',
							Name: 'Launch Target Operation',
							Tasks: ['LAUNCH-TARGET-ECHO']
						};

						let tmpLauncherDef = {
							GUIDTask: 'LAUNCHER-OP-001',
							Name: 'Operation Launcher',
							Type: 'LaunchOperation',
							TargetOperation: 'LAUNCH-TARGET-OP'
						};

						let tmpContext = { GlobalState: {}, NodeState: {}, StagingPath: '' };

						tmpTaskService.executeTask(tmpLauncherDef, tmpContext,
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);

								let tmpOutput = JSON.parse(pResult.Output);
								Expect(tmpOutput.TargetOperation).to.equal('LAUNCH-TARGET-OP');
								Expect(tmpOutput.Async).to.equal(true);

								// Give the async child a moment to complete
								setTimeout(function() { fDone(); }, 200);
							});
					}
				);

				test
				(
					'Should launch a task asynchronously.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						tmpState._Tasks['LAUNCH-TARGET-TASK'] = {
							GUIDTask: 'LAUNCH-TARGET-TASK',
							Name: 'Launch Target Task',
							Type: 'Command',
							Command: 'echo task-launched'
						};

						let tmpLauncherDef = {
							GUIDTask: 'LAUNCHER-TASK-001',
							Name: 'Task Launcher',
							Type: 'LaunchTask',
							TargetTask: 'LAUNCH-TARGET-TASK'
						};

						let tmpContext = { GlobalState: {}, NodeState: {}, StagingPath: '' };

						tmpTaskService.executeTask(tmpLauncherDef, tmpContext,
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);

								let tmpOutput = JSON.parse(pResult.Output);
								Expect(tmpOutput.TargetTask).to.equal('LAUNCH-TARGET-TASK');
								Expect(tmpOutput.Async).to.equal(true);

								setTimeout(function() { fDone(); }, 200);
							});
					}
				);

				test
				(
					'Should pass InitialState as literal object to launched operation.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						// Use a solver task that reads from GlobalState to verify state was passed
						tmpState._Tasks['LAUNCH-STATE-SOLVER'] = {
							GUIDTask: 'LAUNCH-STATE-SOLVER',
							Name: 'State Solver',
							Type: 'Solver',
							Expression: 'Result = Greeting'
						};
						tmpState._Operations['LAUNCH-STATE-OP'] = {
							GUIDOperation: 'LAUNCH-STATE-OP',
							Name: 'State Test Operation',
							Tasks: ['LAUNCH-STATE-SOLVER']
						};

						let tmpLauncherDef = {
							GUIDTask: 'LAUNCHER-STATE-001',
							Name: 'State Launcher',
							Type: 'LaunchOperation',
							TargetOperation: 'LAUNCH-STATE-OP',
							InitialState: { Greeting: 'Hello from launcher' }
						};

						let tmpContext = { GlobalState: {}, NodeState: {}, StagingPath: '' };

						tmpTaskService.executeTask(tmpLauncherDef, tmpContext,
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);

								// Verify InitialState was logged
								let tmpLog = pResult.Log.join('\n');
								Expect(tmpLog.indexOf('applied InitialState')).to.not.equal(-1);

								setTimeout(function() { fDone(); }, 200);
							});
					}
				);

				test
				(
					'Should resolve InitialState from a GlobalState address.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						let tmpLauncherDef = {
							GUIDTask: 'LAUNCHER-ADDR-001',
							Name: 'Address Launcher',
							Type: 'LaunchTask',
							TargetTask: 'LAUNCH-TARGET-TASK',
							InitialState: 'Config.ChildState'
						};

						let tmpContext = {
							GlobalState: {
								Config: {
									ChildState: { Mode: 'test', Level: 5 }
								}
							},
							NodeState: {},
							StagingPath: ''
						};

						tmpTaskService.executeTask(tmpLauncherDef, tmpContext,
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);

								let tmpLog = pResult.Log.join('\n');
								Expect(tmpLog.indexOf('resolved InitialState from address')).to.not.equal(-1);

								setTimeout(function() { fDone(); }, 200);
							});
					}
				);

				test
				(
					'Should merge parent GlobalState when MergeParentState is true.',
					function(fDone)
					{
						let tmpState = libUltravisor.fable['Ultravisor-Hypervisor-State'];
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						let tmpLauncherDef = {
							GUIDTask: 'LAUNCHER-MERGE-001',
							Name: 'Merge Launcher',
							Type: 'LaunchTask',
							TargetTask: 'LAUNCH-TARGET-TASK',
							MergeParentState: true,
							InitialState: { Extra: 'data' }
						};

						let tmpContext = {
							GlobalState: { ParentKey: 'parentValue' },
							NodeState: {},
							StagingPath: ''
						};

						tmpTaskService.executeTask(tmpLauncherDef, tmpContext,
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Complete');
								Expect(pResult.Success).to.equal(true);

								let tmpLog = pResult.Log.join('\n');
								Expect(tmpLog.indexOf('merged parent GlobalState')).to.not.equal(-1);
								Expect(tmpLog.indexOf('applied InitialState')).to.not.equal(-1);

								setTimeout(function() { fDone(); }, 200);
							});
					}
				);

				test
				(
					'Should error when TargetOperation is missing.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						let tmpLauncherDef = {
							GUIDTask: 'LAUNCHER-ERR-001',
							Name: 'Missing Target',
							Type: 'LaunchOperation'
						};

						let tmpContext = { GlobalState: {}, NodeState: {}, StagingPath: '' };

						tmpTaskService.executeTask(tmpLauncherDef, tmpContext,
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
					'Should error when TargetTask is missing.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						let tmpLauncherDef = {
							GUIDTask: 'LAUNCHER-ERR-002',
							Name: 'Missing Target Task',
							Type: 'LaunchTask'
						};

						let tmpContext = { GlobalState: {}, NodeState: {}, StagingPath: '' };

						tmpTaskService.executeTask(tmpLauncherDef, tmpContext,
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
					'Should error when target operation does not exist.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						let tmpLauncherDef = {
							GUIDTask: 'LAUNCHER-ERR-003',
							Name: 'Nonexistent Operation',
							Type: 'LaunchOperation',
							TargetOperation: 'DOES-NOT-EXIST-OP'
						};

						let tmpContext = { GlobalState: {}, NodeState: {}, StagingPath: '' };

						tmpTaskService.executeTask(tmpLauncherDef, tmpContext,
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
					'Should error when target task does not exist.',
					function(fDone)
					{
						let tmpTaskService = libUltravisor.fable['Ultravisor-Task'];

						let tmpLauncherDef = {
							GUIDTask: 'LAUNCHER-ERR-004',
							Name: 'Nonexistent Task',
							Type: 'LaunchTask',
							TargetTask: 'DOES-NOT-EXIST-TASK'
						};

						let tmpContext = { GlobalState: {}, NodeState: {}, StagingPath: '' };

						tmpTaskService.executeTask(tmpLauncherDef, tmpContext,
							function (pError, pResult)
							{
								Expect(pError).to.be.null;
								Expect(pResult.Status).to.equal('Error');
								Expect(pResult.Success).to.equal(false);
								fDone();
							});
					}
				);
			}
		);
	}
);
