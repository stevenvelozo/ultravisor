/**
 * Ultravisor -- Operation Library Visual Tests
 *
 * Loads each operation from the operation-library/ folder, imports it,
 * opens it in the Flow Editor, executes it via the API, and takes
 * screenshots at each major point:
 *   1. Flow loaded in editor (shows nodes, ports, and connections)
 *   2. Execution result (shows status, task outputs, logs)
 *   3. Manifest/timing view after execution
 *
 * Operations that require user input (value-input) are tested with
 * the pause/resume flow.  Operations requiring external services
 * (LLM, Beacon, HTTP endpoints, Meadow) are loaded and rendered
 * but skipped for execution.
 *
 * Requires: puppeteer (dev dependency)
 * Requires: webinterface/dist/ to be pre-built (npx quack build)
 */
const libAssert = require('assert');
const libPath = require('path');
const libFs = require('fs');
const libPuppeteer = require('puppeteer');
const libPict = require('pict');

// Services
const libServiceHypervisor = require('../source/services/Ultravisor-Hypervisor.cjs');
const libServiceHypervisorState = require('../source/services/Ultravisor-Hypervisor-State.cjs');
const libServiceHypervisorEventBase = require('../source/services/Ultravisor-Hypervisor-Event-Base.cjs');
const libServiceHypervisorEventCron = require('../source/services/events/Ultravisor-Hypervisor-Event-Cron.cjs');
const libServiceTaskTypeRegistry = require('../source/services/Ultravisor-TaskTypeRegistry.cjs');
const libServiceStateManager = require('../source/services/Ultravisor-StateManager.cjs');
const libServiceExecutionEngine = require('../source/services/Ultravisor-ExecutionEngine.cjs');
const libServiceExecutionManifest = require('../source/services/Ultravisor-ExecutionManifest.cjs');
const libWebServerAPIServer = require('../source/web_server/Ultravisor-API-Server.cjs');

// ── Module-scope state ──────────────────────────────────
let _Browser = null;
let _Page = null;
let _Fable = null;
let _BaseURL = '';
let _ScreenshotDir = '';
let _ScreenshotIndex = 0;
let _ConsoleErrors = [];
let _StagingDir = '';
let _OperationLibraryPath = '';
let _TestResults =
{
	timestamp: new Date().toISOString(),
	totalTests: 0,
	passed: 0,
	failed: 0,
	screenshots: [],
	operations: [],
	duration: ''
};
let _StartTime = Date.now();

// ── Operations that need external services (skip execution) ──
const _SkipExecutionTypes =
[
	'llm-chat-completion', 'llm-embedding', 'llm-tool-use',
	'beacon-dispatch',
	'get-json', 'get-text', 'send-json', 'rest-request',
	'meadow-read', 'meadow-reads', 'meadow-create', 'meadow-update', 'meadow-delete', 'meadow-count'
];

// Operations that use value-input (need pause/resume handling)
const _InteractiveOperations =
[
	'expression-calculator.json',
	'file-search-replace.json',
	'text-sanitizer.json'
];

// Test input values for interactive operations
const _InteractiveInputValues =
{
	'expression-calculator.json': '2+3*4',
	'file-search-replace.json': 'test-input.txt',
	'text-sanitizer.json': 'test-sanitize.txt'
};

// ── Helpers ─────────────────────────────────────────────

function takeScreenshot(pName)
{
	_ScreenshotIndex++;
	let tmpPadded = String(_ScreenshotIndex).padStart(3, '0');
	let tmpFilename = tmpPadded + '-' + pName + '.png';
	_TestResults.screenshots.push(tmpFilename);
	return _Page.screenshot(
	{
		path: libPath.join(_ScreenshotDir, tmpFilename),
		fullPage: false
	});
}

async function settle(pMs)
{
	await _Page.evaluate((pDelay) => new Promise((r) => setTimeout(r, pDelay)), pMs || 500);
}

async function waitForAppReady()
{
	await _Page.waitForSelector('#Ultravisor-Application-Container', { timeout: 15000 });
	try
	{
		await _Page.waitForFunction(
			() =>
			{
				return (typeof(window.Pict) !== 'undefined') || (typeof(window._Pict) !== 'undefined');
			},
			{ timeout: 10000 }
		);
	}
	catch (pErr)
	{
		console.log('  [Warning] Pict global not found after 10s; proceeding without it.');
	}
	await settle(2000);
}

async function navigateToRoute(pRoute)
{
	await _Page.evaluate((pHash) =>
	{
		window.location.hash = pHash;
	}, pRoute);
	await settle(800);
}

async function apiGet(pPath)
{
	return _Page.evaluate(async (pBaseURL, pPath) =>
	{
		let tmpRes = await fetch(pBaseURL + pPath);
		return { status: tmpRes.status, body: await tmpRes.json() };
	}, _BaseURL, pPath);
}

async function apiPost(pPath, pBody)
{
	return _Page.evaluate(async (pBaseURL, pPath, pBody) =>
	{
		let tmpRes = await fetch(pBaseURL + pPath,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(pBody)
		});
		return { status: tmpRes.status, body: await tmpRes.json() };
	}, _BaseURL, pPath, pBody);
}

async function apiCreateOperation(pOperationData)
{
	return _Page.evaluate(async (pBaseURL, pData) =>
	{
		let tmpRes = await fetch(pBaseURL + '/Operation',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(pData)
		});
		return tmpRes.json();
	}, _BaseURL, pOperationData);
}

async function apiExecuteOperation(pHash)
{
	return _Page.evaluate(async (pBaseURL, pHash) =>
	{
		let tmpRes = await fetch(pBaseURL + '/Operation/' + pHash + '/Execute');
		return { status: tmpRes.status, body: await tmpRes.json() };
	}, _BaseURL, pHash);
}

/**
 * Check if an operation's graph uses any task types that require external services.
 */
function operationNeedsExternalServices(pOperationDef)
{
	if (!pOperationDef || !pOperationDef.Graph || !Array.isArray(pOperationDef.Graph.Nodes))
	{
		return false;
	}

	for (let i = 0; i < pOperationDef.Graph.Nodes.length; i++)
	{
		let tmpType = pOperationDef.Graph.Nodes[i].Type;
		if (_SkipExecutionTypes.indexOf(tmpType) >= 0)
		{
			return true;
		}
	}

	return false;
}

/**
 * Check if an operation uses value-input nodes.
 */
function operationHasValueInput(pOperationDef)
{
	if (!pOperationDef || !pOperationDef.Graph || !Array.isArray(pOperationDef.Graph.Nodes))
	{
		return false;
	}

	for (let i = 0; i < pOperationDef.Graph.Nodes.length; i++)
	{
		if (pOperationDef.Graph.Nodes[i].Type === 'value-input')
		{
			return true;
		}
	}

	return false;
}

/**
 * Get the first value-input node hash from an operation.
 */
function getValueInputNodeHash(pOperationDef)
{
	if (!pOperationDef || !pOperationDef.Graph || !Array.isArray(pOperationDef.Graph.Nodes))
	{
		return null;
	}

	for (let i = 0; i < pOperationDef.Graph.Nodes.length; i++)
	{
		if (pOperationDef.Graph.Nodes[i].Type === 'value-input')
		{
			return pOperationDef.Graph.Nodes[i].Hash;
		}
	}

	return null;
}

/**
 * Count event ports, state ports, and connections in an operation graph.
 */
function analyzeGraphPorts(pOperationDef)
{
	let tmpResult =
	{
		NodeCount: 0,
		ConnectionCount: 0,
		EventPorts: 0,
		StatePorts: 0,
		EventConnections: 0,
		StateConnections: 0
	};

	if (!pOperationDef || !pOperationDef.Graph)
	{
		return tmpResult;
	}

	let tmpNodes = pOperationDef.Graph.Nodes || [];
	let tmpConnections = pOperationDef.Graph.Connections || [];

	tmpResult.NodeCount = tmpNodes.length;
	tmpResult.ConnectionCount = tmpConnections.length;

	for (let i = 0; i < tmpNodes.length; i++)
	{
		let tmpPorts = tmpNodes[i].Ports || [];
		for (let j = 0; j < tmpPorts.length; j++)
		{
			let tmpPort = tmpPorts[j];
			let tmpHash = tmpPort.Hash || '';
			let tmpSide = tmpPort.Side || '';

			if (tmpHash.includes('-so-') || tmpHash.includes('-si-') ||
				tmpSide === 'right-top' || tmpSide === 'left-top')
			{
				tmpResult.StatePorts++;
			}
			else
			{
				tmpResult.EventPorts++;
			}
		}
	}

	for (let i = 0; i < tmpConnections.length; i++)
	{
		let tmpConn = tmpConnections[i];
		let tmpSourceHash = tmpConn.SourcePortHash || '';
		let tmpTargetHash = tmpConn.TargetPortHash || '';

		if (tmpConn.ConnectionType === 'State' ||
			tmpSourceHash.includes('-so-') || tmpTargetHash.includes('-si-'))
		{
			tmpResult.StateConnections++;
		}
		else
		{
			tmpResult.EventConnections++;
		}
	}

	return tmpResult;
}


// ── Test Suite ──────────────────────────────────────────

suite
(
	'Operation Library Visual Tests',
	function ()
	{
		this.timeout(600000);

		suiteSetup
		(
			function (fDone)
			{
				this.timeout(60000);

				_ScreenshotDir = libPath.join(__dirname, '..', 'debug', 'dist', 'operation_library_test_output');
				_StagingDir = libPath.resolve(__dirname, '..', '.test_staging_oplib');
				_OperationLibraryPath = libPath.resolve(__dirname, '..', 'operation-library');

				// Clean and create output directory
				if (libFs.existsSync(_ScreenshotDir))
				{
					libFs.rmSync(_ScreenshotDir, { recursive: true, force: true });
				}
				libFs.mkdirSync(_ScreenshotDir, { recursive: true });

				// Ensure staging directory exists
				libFs.mkdirSync(_StagingDir, { recursive: true });

				// Verify webinterface dist exists
				let tmpWebInterfacePath = libPath.resolve(__dirname, '..', 'webinterface', 'dist');
				if (!libFs.existsSync(libPath.join(tmpWebInterfacePath, 'index.html')))
				{
					return fDone(new Error('webinterface/dist/index.html not found. Run "npx quack build" first.'));
				}

				// Create test fixture files for interactive operations
				libFs.writeFileSync(libPath.join(_StagingDir, 'test-input.txt'), 'Hello John, this is a test.\nJohn likes testing.\n', 'utf8');
				libFs.writeFileSync(libPath.join(_StagingDir, 'test-sanitize.txt'), 'Hello\tworld\r\nDouble  spaces  here\n', 'utf8');

				// Create Pict instance with random port
				let tmpPort = 10000 + Math.floor(Math.random() * 50000);
				_Fable = new libPict(
				{
					Product: 'Ultravisor-OpLibTest',
					APIServerPort: tmpPort,
					LogLevel: 5
				});

				_Fable.ProgramConfiguration =
				{
					UltravisorWebInterfacePath: tmpWebInterfacePath,
					UltravisorStagingRoot: _StagingDir,
					UltravisorOperationLibraryPath: _OperationLibraryPath
				};

				if (typeof(_Fable.gatherProgramConfiguration) !== 'function')
				{
					_Fable.gatherProgramConfiguration = function ()
					{
						return {
							GatherPhases:
							[
								{ Phase: 'Default Program Configuration' },
								{ Phase: 'Test Configuration', Path: libPath.join(_StagingDir, '.ultravisor.json') }
							],
							ConfigurationOutcome: {}
						};
					};
				}

				// Register all services
				_Fable.addAndInstantiateServiceTypeIfNotExists('UltravisorHypervisor', libServiceHypervisor);
				_Fable.addAndInstantiateServiceTypeIfNotExists('UltravisorHypervisorState', libServiceHypervisorState);
				_Fable.addAndInstantiateServiceTypeIfNotExists('UltravisorHypervisorEventBase', libServiceHypervisorEventBase);
				_Fable.addAndInstantiateServiceTypeIfNotExists('UltravisorHypervisorEventCron', libServiceHypervisorEventCron);
				_Fable.addAndInstantiateServiceTypeIfNotExists('UltravisorTaskTypeRegistry', libServiceTaskTypeRegistry);
				_Fable.addAndInstantiateServiceTypeIfNotExists('UltravisorStateManager', libServiceStateManager);
				_Fable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionEngine', libServiceExecutionEngine);
				_Fable.addAndInstantiateServiceTypeIfNotExists('UltravisorExecutionManifest', libServiceExecutionManifest);

				let tmpRegistry = Object.values(_Fable.servicesMap['UltravisorTaskTypeRegistry'])[0];
				if (tmpRegistry)
				{
					tmpRegistry.registerBuiltInTaskTypes();
				}

				// Register and start API server
				_Fable.addAndInstantiateServiceTypeIfNotExists('UltravisorAPIServer', libWebServerAPIServer);
				let tmpAPIServer = Object.values(_Fable.servicesMap['UltravisorAPIServer'])[0];

				tmpAPIServer.start(function (pError)
				{
					if (pError)
					{
						return fDone(pError);
					}

					_BaseURL = 'http://localhost:' + tmpPort;

					libPuppeteer.launch(
					{
						headless: true,
						args: ['--no-sandbox', '--disable-setuid-sandbox']
					}).then(function (pBrowser)
					{
						_Browser = pBrowser;
						return _Browser.newPage();
					}).then(function (pPage)
					{
						_Page = pPage;
						return _Page.setViewport({ width: 1440, height: 900 });
					}).then(function ()
					{
						_Page.on('console', function (pMsg)
						{
							if (pMsg.type() === 'error')
							{
								console.log('  [Browser Console Error]', pMsg.text());
							}
						});
						_Page.on('pageerror', function (pError)
						{
							_ConsoleErrors.push(pError.message);
							console.log('  [Browser Error]', pError.message);
						});
						_Page.on('requestfailed', function (pRequest)
						{
							console.log('  [Request Failed]', pRequest.url(), pRequest.failure().errorText);
						});

						return _Page.goto(_BaseURL + '/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
					}).then(function ()
					{
						return waitForAppReady();
					}).then(function ()
					{
						fDone();
					}).catch(function (pErr)
					{
						fDone(pErr);
					});
				});
			}
		);

		suiteTeardown
		(
			function (fDone)
			{
				this.timeout(15000);

				_TestResults.failed = _TestResults.totalTests - _TestResults.passed;
				_TestResults.duration = ((Date.now() - _StartTime) / 1000).toFixed(1) + 's';

				try
				{
					libFs.writeFileSync(
						libPath.join(_ScreenshotDir, 'test-results.json'),
						JSON.stringify(_TestResults, null, '\t'),
						'utf8'
					);
				}
				catch (pErr)
				{
					console.log('  [Warning] Failed to write test-results.json:', pErr.message);
				}

				let tmpClosePromise = Promise.resolve();

				if (_Browser)
				{
					tmpClosePromise = _Browser.close();
				}

				tmpClosePromise.then(function ()
				{
					if (_Fable)
					{
						let tmpAPIServer = Object.values(_Fable.servicesMap['UltravisorAPIServer'] || {})[0];
						if (tmpAPIServer && tmpAPIServer._Orator)
						{
							return tmpAPIServer._Orator.stopService(function ()
							{
								if (libFs.existsSync(_StagingDir))
								{
									libFs.rmSync(_StagingDir, { recursive: true, force: true });
								}
								return fDone();
							});
						}
					}
					return fDone();
				}).catch(function ()
				{
					return fDone();
				});
			}
		);

		setup(function ()
		{
			_TestResults.totalTests++;
		});

		// ════════════════════════════════════════════════
		// Operation Library API
		// ════════════════════════════════════════════════
		suite
		(
			'Operation Library API',
			function ()
			{
				test
				(
					'GET /OperationLibrary lists all operations',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = await apiGet('/OperationLibrary');

						libAssert.strictEqual(tmpResponse.status, 200, 'Should return 200');
						libAssert.ok(Array.isArray(tmpResponse.body), 'Should return an array');
						libAssert.ok(tmpResponse.body.length >= 15, 'Should have at least 15 library operations (got ' + tmpResponse.body.length + ')');

						console.log('  Library operations:', tmpResponse.body.length);
						for (let i = 0; i < tmpResponse.body.length; i++)
						{
							console.log('    -', tmpResponse.body[i].FileName, ':', tmpResponse.body[i].Name);
						}

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Per-Operation Tests
		// ════════════════════════════════════════════════

		// Get the list of operation files
		let tmpOperationFiles = [];
		try
		{
			tmpOperationFiles = libFs.readdirSync(
				libPath.resolve(__dirname, '..', 'operation-library')
			).filter(function (pF) { return pF.endsWith('.json'); }).sort();
		}
		catch (pErr)
		{
			console.log('  [Warning] Could not read operation-library/:', pErr.message);
		}

		for (let tmpFileIndex = 0; tmpFileIndex < tmpOperationFiles.length; tmpFileIndex++)
		{
			// Use an IIFE to capture the filename for each iteration
			(function (pFileName)
			{
				let tmpOperationDef = null;
				let tmpImportedOpHash = '';
				let tmpSlug = pFileName.replace('.json', '');

				suite
				(
					'Operation: ' + tmpSlug,
					function ()
					{
						// ── Step 1: Load the operation from the library ──
						test
						(
							'load ' + tmpSlug + ' from library',
							async function ()
							{
								this.timeout(15000);

								let tmpResponse = await apiGet('/OperationLibrary/' + pFileName);
								libAssert.strictEqual(tmpResponse.status, 200, 'Should load ' + pFileName);

								tmpOperationDef = tmpResponse.body;
								libAssert.ok(tmpOperationDef.Graph, 'Should have a Graph');
								libAssert.ok(Array.isArray(tmpOperationDef.Graph.Nodes), 'Should have Nodes');
								libAssert.ok(Array.isArray(tmpOperationDef.Graph.Connections), 'Should have Connections');

								// Analyze port structure
								let tmpAnalysis = analyzeGraphPorts(tmpOperationDef);

								let tmpOpRecord =
								{
									FileName: pFileName,
									Name: tmpOperationDef.Name || tmpSlug,
									Nodes: tmpAnalysis.NodeCount,
									Connections: tmpAnalysis.ConnectionCount,
									EventPorts: tmpAnalysis.EventPorts,
									StatePorts: tmpAnalysis.StatePorts,
									EventConnections: tmpAnalysis.EventConnections,
									StateConnections: tmpAnalysis.StateConnections,
									NeedsExternalServices: operationNeedsExternalServices(tmpOperationDef),
									HasValueInput: operationHasValueInput(tmpOperationDef),
									ExecutionStatus: 'not-attempted'
								};
								_TestResults.operations.push(tmpOpRecord);

								console.log('  ' + tmpOperationDef.Name +
									': ' + tmpAnalysis.NodeCount + ' nodes, ' +
									tmpAnalysis.EventPorts + ' event ports, ' +
									tmpAnalysis.StatePorts + ' state ports, ' +
									tmpAnalysis.EventConnections + ' event conn, ' +
									tmpAnalysis.StateConnections + ' state conn');

								_TestResults.passed++;
							}
						);

						// ── Step 2: Import as a persisted operation ──
						test
						(
							'import ' + tmpSlug + ' as operation',
							async function ()
							{
								this.timeout(15000);

								libAssert.ok(tmpOperationDef, 'Operation definition should be loaded');

								let tmpResponse = await apiCreateOperation(tmpOperationDef);
								libAssert.ok(tmpResponse.Hash, 'Should get an operation hash');

								tmpImportedOpHash = tmpResponse.Hash;
								console.log('  Imported as:', tmpImportedOpHash);

								_TestResults.passed++;
							}
						);

						// ── Step 3: Open in Flow Editor and screenshot ──
						test
						(
							'render ' + tmpSlug + ' in flow editor',
							async function ()
							{
								this.timeout(20000);

								libAssert.ok(tmpImportedOpHash, 'Operation should be imported');

								// Navigate to Flow Editor with operation hash
								await navigateToRoute('#/FlowEditor/' + tmpImportedOpHash);
								await settle(2000);

								await takeScreenshot('flow-' + tmpSlug);

								_TestResults.passed++;
							}
						);

						// ── Step 4: Execute the operation ──
						test
						(
							'execute ' + tmpSlug,
							async function ()
							{
								this.timeout(30000);

								libAssert.ok(tmpImportedOpHash, 'Operation should be imported');

								let tmpOpRecord = _TestResults.operations.find(
									function (pR) { return pR.FileName === pFileName; });

								// Skip execution for operations needing external services
								if (operationNeedsExternalServices(tmpOperationDef))
								{
									console.log('  SKIPPED: requires external services');
									if (tmpOpRecord) { tmpOpRecord.ExecutionStatus = 'skipped-external'; }
									_TestResults.passed++;
									return;
								}

								// Handle interactive operations (value-input)
								if (operationHasValueInput(tmpOperationDef))
								{
									// Execute — should pause at value-input
									let tmpResult = await apiExecuteOperation(tmpImportedOpHash);

									await takeScreenshot('exec-paused-' + tmpSlug);

									if (tmpResult.body.Status === 'WaitingForInput')
									{
										console.log('  Paused at value-input');

										let tmpNodeHash = getValueInputNodeHash(tmpOperationDef);
										let tmpInputValue = _InteractiveInputValues[pFileName] || 'test-value';

										// Submit input to resume
										let tmpResumeResult = await apiPost(
											'/PendingInput/' + tmpResult.body.Hash,
											{ NodeHash: tmpNodeHash, Value: tmpInputValue }
										);

										console.log('  Resumed with value:', JSON.stringify(tmpInputValue),
											'-> Status:', tmpResumeResult.body.Status);

										if (tmpOpRecord)
										{
											tmpOpRecord.ExecutionStatus = tmpResumeResult.body.Status || 'unknown';
										}

										await takeScreenshot('exec-resumed-' + tmpSlug);
									}
									else
									{
										console.log('  Execution status:', tmpResult.body.Status,
											'(expected WaitingForInput)');
										if (tmpOpRecord) { tmpOpRecord.ExecutionStatus = tmpResult.body.Status; }
									}

									_TestResults.passed++;
									return;
								}

								// Standard execution (non-interactive, no external deps)
								let tmpResult = await apiExecuteOperation(tmpImportedOpHash);

								libAssert.strictEqual(tmpResult.status, 200, 'Should return 200');

								let tmpStatus = tmpResult.body.Status || 'unknown';
								let tmpLogCount = tmpResult.body.Log ? tmpResult.body.Log.length : 0;
								let tmpErrorCount = tmpResult.body.Errors ? tmpResult.body.Errors.length : 0;
								let tmpOutputNodes = tmpResult.body.TaskOutputs
									? Object.keys(tmpResult.body.TaskOutputs) : [];

								console.log('  Status:', tmpStatus,
									'| Log:', tmpLogCount,
									'| Errors:', tmpErrorCount,
									'| Outputs:', tmpOutputNodes.join(', '));

								if (tmpOpRecord) { tmpOpRecord.ExecutionStatus = tmpStatus; }

								// Log task outputs summary
								if (tmpResult.body.TaskOutputs)
								{
									let tmpOutputKeys = Object.keys(tmpResult.body.TaskOutputs);
									for (let k = 0; k < tmpOutputKeys.length; k++)
									{
										let tmpNodeOutputs = tmpResult.body.TaskOutputs[tmpOutputKeys[k]];
										let tmpOutputFields = Object.keys(tmpNodeOutputs || {});
										if (tmpOutputFields.length > 0)
										{
											console.log('    ' + tmpOutputKeys[k] + ':',
												tmpOutputFields.map(function (pF)
												{
													let tmpVal = tmpNodeOutputs[pF];
													if (typeof(tmpVal) === 'string' && tmpVal.length > 60)
													{
														return pF + '=' + JSON.stringify(tmpVal.substring(0, 60) + '...');
													}
													return pF + '=' + JSON.stringify(tmpVal);
												}).join(', '));
										}
									}
								}

								await takeScreenshot('exec-result-' + tmpSlug);

								_TestResults.passed++;
							}
						);

						// ── Step 5: Check manifest entry ──
						test
						(
							'verify manifest for ' + tmpSlug,
							async function ()
							{
								this.timeout(10000);

								let tmpOpRecord = _TestResults.operations.find(
									function (pR) { return pR.FileName === pFileName; });

								// Skip for operations we didn't execute
								if (tmpOpRecord && (tmpOpRecord.ExecutionStatus === 'skipped-external' ||
									tmpOpRecord.ExecutionStatus === 'not-attempted'))
								{
									console.log('  SKIPPED: no execution to verify');
									_TestResults.passed++;
									return;
								}

								let tmpManifests = await apiGet('/Manifest');
								libAssert.strictEqual(tmpManifests.status, 200, 'Should return 200');

								console.log('  Total manifests:', tmpManifests.body.length);

								_TestResults.passed++;
							}
						);
					}
				);
			})(tmpOperationFiles[tmpFileIndex]);
		}

		// ════════════════════════════════════════════════
		// Summary
		// ════════════════════════════════════════════════
		suite
		(
			'Summary',
			function ()
			{
				test
				(
					'all operations summary',
					function ()
					{
						console.log('\n  ═══════════════════════════════════════════');
						console.log('  OPERATION LIBRARY TEST SUMMARY');
						console.log('  ═══════════════════════════════════════════');

						let tmpCompleted = 0;
						let tmpSkipped = 0;
						let tmpFailed = 0;
						let tmpWaiting = 0;

						for (let i = 0; i < _TestResults.operations.length; i++)
						{
							let tmpOp = _TestResults.operations[i];
							let tmpIcon = '?';

							if (tmpOp.ExecutionStatus === 'Complete') { tmpIcon = 'OK'; tmpCompleted++; }
							else if (tmpOp.ExecutionStatus.startsWith('skipped')) { tmpIcon = 'SKIP'; tmpSkipped++; }
							else if (tmpOp.ExecutionStatus === 'WaitingForInput') { tmpIcon = 'WAIT'; tmpWaiting++; }
							else if (tmpOp.ExecutionStatus === 'Error' || tmpOp.ExecutionStatus === 'Failed') { tmpIcon = 'FAIL'; tmpFailed++; }
							else { tmpIcon = tmpOp.ExecutionStatus.substring(0, 4).toUpperCase(); }

							console.log('  [' + tmpIcon + '] ' + tmpOp.Name +
								' | EP:' + tmpOp.EventPorts + ' SP:' + tmpOp.StatePorts +
								' | EC:' + tmpOp.EventConnections + ' SC:' + tmpOp.StateConnections);
						}

						console.log('  ───────────────────────────────────────────');
						console.log('  Complete:', tmpCompleted,
							'| Skipped:', tmpSkipped,
							'| Waiting:', tmpWaiting,
							'| Failed:', tmpFailed,
							'| Total:', _TestResults.operations.length);
						console.log('  Screenshots:', _TestResults.screenshots.length);
						console.log('  ═══════════════════════════════════════════\n');

						_TestResults.passed++;
					}
				);

				test
				(
					'no critical console errors during tests',
					function ()
					{
						let tmpCriticalErrors = _ConsoleErrors.filter(function (pMsg)
						{
							if (pMsg.includes('fetch') || pMsg.includes('Failed to load')
								|| pMsg.includes('NetworkError') || pMsg.includes('net::'))
							{
								return false;
							}
							return true;
						});

						if (tmpCriticalErrors.length > 0)
						{
							console.log('  Critical errors:', tmpCriticalErrors.length);
							for (let i = 0; i < tmpCriticalErrors.length; i++)
							{
								console.log('    -', tmpCriticalErrors[i]);
							}
						}

						libAssert.strictEqual(tmpCriticalErrors.length, 0,
							'Should have no critical console errors (found ' + tmpCriticalErrors.length + ')');

						_TestResults.passed++;
					}
				);
			}
		);
	}
);
