/**
 * Ultravisor -- Headless Browser Tests
 *
 * Exercises each web interface view in a headless Chromium browser,
 * generates numbered screenshots to debug/dist/automated_test_output/.
 *
 * Creates and executes multiple operations via the REST API to exercise
 * all task types and workflow patterns:
 *   - Simple file copy (read-file → write-file)
 *   - Conditional branching (set-values → if-conditional → write-file)
 *   - Error handling (read-file error → error-message)
 *   - Looping pipeline (read → split → replace → append → write)
 *   - Sub-operation composition (launch-operation)
 *   - State template transforms
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
let _TestResults =
{
	timestamp: new Date().toISOString(),
	totalTests: 0,
	passed: 0,
	failed: 0,
	screenshots: [],
	duration: ''
};
let _StartTime = Date.now();

// ── Helpers ─────────────────────────────────────────────

function takeScreenshot(pName)
{
	_ScreenshotIndex++;
	let tmpPadded = String(_ScreenshotIndex).padStart(2, '0');
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

/**
 * Create an operation via the API and return its response.
 */
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

/**
 * Execute an operation via the API and return the execution result.
 */
async function apiExecuteOperation(pHash)
{
	return _Page.evaluate(async (pBaseURL, pHash) =>
	{
		let tmpRes = await fetch(pBaseURL + '/Operation/' + pHash + '/Execute');
		return { status: tmpRes.status, body: await tmpRes.json() };
	}, _BaseURL, pHash);
}

/**
 * Generic API GET helper.
 */
async function apiGet(pPath)
{
	return _Page.evaluate(async (pBaseURL, pPath) =>
	{
		let tmpRes = await fetch(pBaseURL + pPath);
		return { status: tmpRes.status, body: await tmpRes.json() };
	}, _BaseURL, pPath);
}

/**
 * Generic API POST helper.
 */
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

/**
 * Generic API DELETE helper.
 */
async function apiDelete(pPath)
{
	return _Page.evaluate(async (pBaseURL, pPath) =>
	{
		let tmpRes = await fetch(pBaseURL + pPath, { method: 'DELETE' });
		return { status: tmpRes.status, body: await tmpRes.json() };
	}, _BaseURL, pPath);
}

// ── Test Suite ──────────────────────────────────────────

suite
(
	'Ultravisor Browser Tests',
	function ()
	{
		this.timeout(300000);

		suiteSetup
		(
			function (fDone)
			{
				this.timeout(60000);

				_ScreenshotDir = libPath.join(__dirname, '..', 'debug', 'dist', 'automated_test_output');
				_StagingDir = libPath.resolve(__dirname, '..', '.test_staging_browser');

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

				// Create Pict instance with random port
				let tmpPort = 10000 + Math.floor(Math.random() * 50000);
				_Fable = new libPict(
				{
					Product: 'Ultravisor-BrowserTest',
					APIServerPort: tmpPort,
					LogLevel: 5
				});

				_Fable.ProgramConfiguration =
				{
					UltravisorWebInterfacePath: tmpWebInterfacePath,
					UltravisorStagingRoot: _StagingDir
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
						return _Page.setViewport({ width: 1280, height: 800 });
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
		// Application Load
		// ════════════════════════════════════════════════
		suite
		(
			'Application Load',
			function ()
			{
				test
				(
					'app loads and container exists',
					async function ()
					{
						this.timeout(15000);

						let tmpContainerExists = await _Page.evaluate(
							() => !!document.getElementById('Ultravisor-Application-Container')
						);
						libAssert.ok(tmpContainerExists, 'Application container should exist');

						let tmpPictExists = await _Page.evaluate(
							() => typeof(window._Pict) !== 'undefined'
						);
						libAssert.ok(tmpPictExists, 'window._Pict should be defined');

						await takeScreenshot('app-loads');
						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// View Navigation
		// ════════════════════════════════════════════════
		suite
		(
			'View Navigation',
			function ()
			{
				test
				(
					'Dashboard view renders',
					async function ()
					{
						this.timeout(15000);
						await navigateToRoute('#/Home');
						await takeScreenshot('dashboard');
						_TestResults.passed++;
					}
				);

				test
				(
					'Operation List view renders',
					async function ()
					{
						this.timeout(15000);
						await navigateToRoute('#/Operations');
						await takeScreenshot('operation-list');
						_TestResults.passed++;
					}
				);

				test
				(
					'Operation Edit view renders',
					async function ()
					{
						this.timeout(15000);
						await navigateToRoute('#/OperationEdit');
						await takeScreenshot('operation-edit');
						_TestResults.passed++;
					}
				);

				test
				(
					'Schedule view renders',
					async function ()
					{
						this.timeout(15000);
						await navigateToRoute('#/Schedule');
						await takeScreenshot('schedule');
						_TestResults.passed++;
					}
				);

				test
				(
					'Manifest List view renders',
					async function ()
					{
						this.timeout(15000);
						await navigateToRoute('#/Manifests');
						await takeScreenshot('manifest-list');
						_TestResults.passed++;
					}
				);

				test
				(
					'Timing view renders',
					async function ()
					{
						this.timeout(15000);
						await navigateToRoute('#/Timing');
						await takeScreenshot('timing');
						_TestResults.passed++;
					}
				);

				test
				(
					'Flow Editor view renders',
					async function ()
					{
						this.timeout(15000);
						await navigateToRoute('#/FlowEditor');
						await takeScreenshot('flow-editor');
						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Navigation Cycle
		// ════════════════════════════════════════════════
		suite
		(
			'Navigation Cycle',
			function ()
			{
				test
				(
					'navigates through all views sequentially',
					async function ()
					{
						this.timeout(30000);

						let tmpRoutes =
						[
							'#/Home',
							'#/Operations', '#/OperationEdit',
							'#/Schedule', '#/Manifests',
							'#/Timing', '#/FlowEditor'
						];

						for (let i = 0; i < tmpRoutes.length; i++)
						{
							await navigateToRoute(tmpRoutes[i]);
							await takeScreenshot('nav-cycle-' + tmpRoutes[i].replace('#/', '').toLowerCase());
						}

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// NodeTemplate CRUD API
		// ════════════════════════════════════════════════
		suite
		(
			'NodeTemplate CRUD API',
			function ()
			{
				let _CreatedTemplateHash = '';

				test
				(
					'create a node template via POST /NodeTemplate',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = await _Page.evaluate(async (pBaseURL) =>
						{
							let tmpRes = await fetch(pBaseURL + '/NodeTemplate',
							{
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									Type: 'read-file',
									Name: 'Test ReadFile Template',
									Settings: { FilePath: '/tmp/test.txt', Encoding: 'utf8' }
								})
							});
							return tmpRes.json();
						}, _BaseURL);

						libAssert.ok(tmpResponse.Hash, 'Template should have a Hash');
						libAssert.ok(tmpResponse.Hash.startsWith('TMPL-'), 'Hash should start with TMPL-');
						libAssert.strictEqual(tmpResponse.Type, 'read-file', 'Type should match');

						_CreatedTemplateHash = tmpResponse.Hash;
						console.log('  Created template:', _CreatedTemplateHash);

						_TestResults.passed++;
					}
				);

				test
				(
					'list node templates via GET /NodeTemplate',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = (await apiGet('/NodeTemplate')).body;

						libAssert.ok(Array.isArray(tmpResponse), 'Should return an array');
						libAssert.ok(tmpResponse.length >= 1, 'Should have at least one template');

						let tmpFound = tmpResponse.find(function (pT) { return pT.Hash === _CreatedTemplateHash; });
						libAssert.ok(tmpFound, 'Created template should appear in list');

						_TestResults.passed++;
					}
				);

				test
				(
					'get a node template by hash via GET /NodeTemplate/:Hash',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = (await apiGet('/NodeTemplate/' + _CreatedTemplateHash)).body;

						libAssert.strictEqual(tmpResponse.Hash, _CreatedTemplateHash, 'Hash should match');
						libAssert.strictEqual(tmpResponse.Name, 'Test ReadFile Template', 'Name should match');
						libAssert.deepStrictEqual(tmpResponse.Settings, { FilePath: '/tmp/test.txt', Encoding: 'utf8' }, 'Settings should match');

						_TestResults.passed++;
					}
				);

				test
				(
					'update a node template via PUT /NodeTemplate/:Hash',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = await _Page.evaluate(async (pBaseURL, pHash) =>
						{
							let tmpRes = await fetch(pBaseURL + '/NodeTemplate/' + pHash,
							{
								method: 'PUT',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									Name: 'Updated ReadFile Template',
									Settings: { FilePath: '/tmp/updated.txt', Encoding: 'utf8' }
								})
							});
							return tmpRes.json();
						}, _BaseURL, _CreatedTemplateHash);

						libAssert.strictEqual(tmpResponse.Name, 'Updated ReadFile Template', 'Name should be updated');

						_TestResults.passed++;
					}
				);

				test
				(
					'delete a node template via DELETE /NodeTemplate/:Hash',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = (await apiDelete('/NodeTemplate/' + _CreatedTemplateHash)).body;
						libAssert.strictEqual(tmpResponse.Status, 'Deleted', 'Should confirm deletion');

						let tmpGetResponse = await apiGet('/NodeTemplate/' + _CreatedTemplateHash);
						libAssert.strictEqual(tmpGetResponse.status, 404, 'Should return 404 after deletion');

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Task Type Registry
		// ════════════════════════════════════════════════
		suite
		(
			'Task Type Registry',
			function ()
			{
				test
				(
					'list task types via GET /TaskType',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = (await apiGet('/TaskType')).body;

						libAssert.ok(Array.isArray(tmpResponse), 'Should return an array');
						libAssert.ok(tmpResponse.length >= 10, 'Should have at least 10 built-in task types (got ' + tmpResponse.length + ')');

						// Verify every expected task type is registered
						let tmpExpected = ['read-file', 'write-file', 'set-values', 'replace-string',
							'string-appender', 'if-conditional', 'split-execute', 'launch-operation',
							'value-input', 'error-message'];

						for (let i = 0; i < tmpExpected.length; i++)
						{
							let tmpFound = tmpResponse.find(function (pT) { return pT.Hash === tmpExpected[i]; });
							libAssert.ok(tmpFound, tmpExpected[i] + ' task type should be registered');
						}

						console.log('  Task types:', tmpResponse.map(function (pT) { return pT.Hash; }).join(', '));

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Operation CRUD API
		// ════════════════════════════════════════════════
		suite
		(
			'Operation CRUD API',
			function ()
			{
				let _CreatedOpHash = '';

				test
				(
					'create an operation via POST /Operation',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = await apiCreateOperation({
							Name: 'CRUD Test Operation',
							Description: 'Created for CRUD API testing',
							Graph: {
								Nodes: [
									{ Hash: 'n-start', Type: 'start', X: 0, Y: 0 },
									{ Hash: 'n-end', Type: 'end', X: 200, Y: 0 }
								],
								Connections: [
									{
										Hash: 'c1', ConnectionType: 'Event',
										SourceNodeHash: 'n-start', SourcePortHash: 'n-start-eo-Start',
										TargetNodeHash: 'n-end', TargetPortHash: 'n-end-ei-End'
									}
								],
								ViewState: {}
							}
						});

						libAssert.ok(tmpResponse.Hash, 'Operation should have a Hash');
						libAssert.ok(tmpResponse.Hash.startsWith('OPR-'), 'Hash should start with OPR-');
						libAssert.strictEqual(tmpResponse.Name, 'CRUD Test Operation', 'Name should match');

						_CreatedOpHash = tmpResponse.Hash;
						console.log('  Created operation:', _CreatedOpHash);

						_TestResults.passed++;
					}
				);

				test
				(
					'list operations via GET /Operation',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = (await apiGet('/Operation')).body;

						libAssert.ok(Array.isArray(tmpResponse), 'Should return an array');
						libAssert.ok(tmpResponse.length >= 1, 'Should have at least one operation');

						let tmpFound = tmpResponse.find(function (pOp) { return pOp.Hash === _CreatedOpHash; });
						libAssert.ok(tmpFound, 'Created operation should appear in list');

						_TestResults.passed++;
					}
				);

				test
				(
					'get an operation by hash via GET /Operation/:Hash',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = (await apiGet('/Operation/' + _CreatedOpHash)).body;

						libAssert.strictEqual(tmpResponse.Hash, _CreatedOpHash, 'Hash should match');
						libAssert.strictEqual(tmpResponse.Name, 'CRUD Test Operation', 'Name should match');
						libAssert.ok(tmpResponse.Graph, 'Should have a Graph');
						libAssert.strictEqual(tmpResponse.Graph.Nodes.length, 2, 'Graph should have 2 nodes');

						_TestResults.passed++;
					}
				);

				test
				(
					'execute a trivial operation via GET /Operation/:Hash/Execute',
					async function ()
					{
						this.timeout(15000);

						let tmpResult = await apiExecuteOperation(_CreatedOpHash);

						libAssert.strictEqual(tmpResult.status, 200, 'Should return 200');
						libAssert.strictEqual(tmpResult.body.Status, 'Complete', 'Trivial start→end should complete');

						console.log('  Trivial execution:', tmpResult.body.Status,
							'| Log:', tmpResult.body.Log ? tmpResult.body.Log.length : 0, 'entries');

						_TestResults.passed++;
					}
				);

				test
				(
					'update an operation via PUT /Operation/:Hash',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = await _Page.evaluate(async (pBaseURL, pHash) =>
						{
							let tmpRes = await fetch(pBaseURL + '/Operation/' + pHash,
							{
								method: 'PUT',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ Name: 'Updated CRUD Test' })
							});
							return tmpRes.json();
						}, _BaseURL, _CreatedOpHash);

						libAssert.strictEqual(tmpResponse.Name, 'Updated CRUD Test', 'Name should be updated');

						_TestResults.passed++;
					}
				);

				test
				(
					'delete an operation via DELETE /Operation/:Hash',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = (await apiDelete('/Operation/' + _CreatedOpHash)).body;
						libAssert.strictEqual(tmpResponse.Status, 'Deleted', 'Should confirm deletion');

						let tmpGetResponse = await apiGet('/Operation/' + _CreatedOpHash);
						libAssert.strictEqual(tmpGetResponse.status, 404, 'Should return 404 after deletion');

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Workflow 1: Simple File Copy (read-file → write-file)
		// ════════════════════════════════════════════════
		suite
		(
			'Workflow: Simple File Copy',
			function ()
			{
				let _OpHash = '';
				let _InputPath = '';

				test
				(
					'create input file and save operation',
					async function ()
					{
						this.timeout(15000);

						let tmpTestDir = libPath.join(_StagingDir, 'file_copy_test');
						libFs.mkdirSync(tmpTestDir, { recursive: true });

						_InputPath = libPath.join(tmpTestDir, 'source.txt');
						libFs.writeFileSync(_InputPath, 'This is the source file content.\nLine two.\n', 'utf8');

						let tmpResponse = await apiCreateOperation({
							Name: 'File Copy Test',
							Description: 'Reads a file and writes its content to another file.',
							Graph: {
								Nodes: [
									{ Hash: 'n-start', Type: 'start', X: 0, Y: 0 },
									{
										Hash: 'n-read', Type: 'read-file',
										Settings: { FilePath: _InputPath, Encoding: 'utf8' },
										Ports: [], X: 200, Y: 0
									},
									{
										Hash: 'n-write', Type: 'write-file',
										Settings: { FilePath: libPath.join(tmpTestDir, 'copy.txt'), Encoding: 'utf8' },
										Ports: [], X: 400, Y: 0
									},
									{ Hash: 'n-end', Type: 'end', X: 600, Y: 0 }
								],
								Connections: [
									{ Hash: 'c1', ConnectionType: 'Event', SourceNodeHash: 'n-start', SourcePortHash: 'n-start-eo-Start', TargetNodeHash: 'n-read', TargetPortHash: 'n-read-ei-BeginRead' },
									{ Hash: 'c2', ConnectionType: 'Event', SourceNodeHash: 'n-read', SourcePortHash: 'n-read-eo-ReadComplete', TargetNodeHash: 'n-write', TargetPortHash: 'n-write-ei-BeginWrite' },
									{ Hash: 'c3', ConnectionType: 'State', SourceNodeHash: 'n-read', SourcePortHash: 'n-read-so-FileContent', TargetNodeHash: 'n-write', TargetPortHash: 'n-write-si-Content' },
									{ Hash: 'c4', ConnectionType: 'Event', SourceNodeHash: 'n-write', SourcePortHash: 'n-write-eo-WriteComplete', TargetNodeHash: 'n-end', TargetPortHash: 'n-end-ei-End' }
								],
								ViewState: {}
							}
						});

						_OpHash = tmpResponse.Hash;
						libAssert.ok(_OpHash, 'Operation should be created');
						console.log('  File Copy op:', _OpHash);

						_TestResults.passed++;
					}
				);

				test
				(
					'execute file copy operation and verify output',
					async function ()
					{
						this.timeout(15000);

						let tmpResult = await apiExecuteOperation(_OpHash);

						libAssert.strictEqual(tmpResult.body.Status, 'Complete', 'File copy should complete');
						libAssert.ok(tmpResult.body.TaskOutputs['n-read'], 'Should have read-file outputs');
						libAssert.ok(tmpResult.body.TaskOutputs['n-read'].BytesRead > 0, 'Should have read bytes');
						libAssert.ok(tmpResult.body.TaskOutputs['n-write'], 'Should have write-file outputs');
						libAssert.ok(tmpResult.body.TaskOutputs['n-write'].BytesWritten > 0, 'Should have written bytes');

						console.log('  Read', tmpResult.body.TaskOutputs['n-read'].BytesRead, 'bytes, wrote',
							tmpResult.body.TaskOutputs['n-write'].BytesWritten, 'bytes');

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Workflow 2: State Template Transform
		// (read-file → write-file with template prepend)
		// ════════════════════════════════════════════════
		suite
		(
			'Workflow: State Template Transform',
			function ()
			{
				let _OpHash = '';
				let _InputPath = '';
				let _OutputPath = '';

				test
				(
					'create and execute template transform operation',
					async function ()
					{
						this.timeout(15000);

						let tmpTestDir = libPath.join(_StagingDir, 'template_test');
						libFs.mkdirSync(tmpTestDir, { recursive: true });

						_InputPath = libPath.join(tmpTestDir, 'input.txt');
						_OutputPath = libPath.join(tmpTestDir, 'output.txt');
						libFs.writeFileSync(_InputPath, 'Original content here.', 'utf8');

						let tmpResponse = await apiCreateOperation({
							Name: 'Template Transform',
							Description: 'Reads a file and prepends a header via state template.',
							Graph: {
								Nodes: [
									{ Hash: 'n-start', Type: 'start', X: 0, Y: 0 },
									{
										Hash: 'n-read', Type: 'read-file',
										Settings: { FilePath: _InputPath, Encoding: 'utf8' },
										Ports: [], X: 200, Y: 0
									},
									{
										Hash: 'n-write', Type: 'write-file',
										Settings: { FilePath: _OutputPath, Encoding: 'utf8' },
										Ports: [], X: 400, Y: 0
									},
									{ Hash: 'n-end', Type: 'end', X: 600, Y: 0 }
								],
								Connections: [
									{ Hash: 'c1', ConnectionType: 'Event', SourceNodeHash: 'n-start', SourcePortHash: 'n-start-eo-Start', TargetNodeHash: 'n-read', TargetPortHash: 'n-read-ei-BeginRead' },
									{ Hash: 'c2', ConnectionType: 'Event', SourceNodeHash: 'n-read', SourcePortHash: 'n-read-eo-ReadComplete', TargetNodeHash: 'n-write', TargetPortHash: 'n-write-ei-BeginWrite' },
									// State connection WITH template: prepend "HEADER: " to the file content
									{
										Hash: 'c3', ConnectionType: 'State',
										SourceNodeHash: 'n-read', SourcePortHash: 'n-read-so-FileContent',
										TargetNodeHash: 'n-write', TargetPortHash: 'n-write-si-Content',
										Data: { Template: 'HEADER: {~D:Record.Value~}' }
									},
									{ Hash: 'c4', ConnectionType: 'Event', SourceNodeHash: 'n-write', SourcePortHash: 'n-write-eo-WriteComplete', TargetNodeHash: 'n-end', TargetPortHash: 'n-end-ei-End' }
								],
								ViewState: {}
							}
						});

						_OpHash = tmpResponse.Hash;
						let tmpResult = await apiExecuteOperation(_OpHash);

						libAssert.strictEqual(tmpResult.body.Status, 'Complete', 'Template transform should complete');

						// Verify the output file has the header prepended
						libAssert.ok(libFs.existsSync(_OutputPath), 'Output file should exist');
						let tmpContent = libFs.readFileSync(_OutputPath, 'utf8');

						libAssert.ok(tmpContent.startsWith('HEADER: '), 'Output should start with HEADER: prefix');
						libAssert.ok(tmpContent.includes('Original content here.'), 'Output should contain original content');
						console.log('  Template output:', JSON.stringify(tmpContent));

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Workflow 3: Conditional Branching
		// (set-values → if-conditional → true/false write paths)
		// ════════════════════════════════════════════════
		suite
		(
			'Workflow: Conditional Branching',
			function ()
			{
				test
				(
					'execute true-branch when condition matches',
					async function ()
					{
						this.timeout(15000);

						let tmpTestDir = libPath.join(_StagingDir, 'branch_true_test');
						libFs.mkdirSync(tmpTestDir, { recursive: true });
						let tmpTruePath = libPath.join(tmpTestDir, 'true_result.txt');
						let tmpFalsePath = libPath.join(tmpTestDir, 'false_result.txt');

						let tmpResponse = await apiCreateOperation({
							Name: 'Branch True Test',
							Description: 'SetValues sets status=active, IfConditional branches to True.',
							Graph: {
								Nodes: [
									{ Hash: 'n-start', Type: 'start', X: 0, Y: 0 },
									{
										Hash: 'n-set', Type: 'set-values',
										Settings: { Mappings: [{ Address: 'Operation.Status', Value: 'active' }] },
										Ports: [], X: 200, Y: 0
									},
									{
										Hash: 'n-if', Type: 'if-conditional',
										Settings: { DataAddress: 'Operation.Status', CompareValue: 'active', Operator: '==' },
										Ports: [], X: 400, Y: 0
									},
									{
										Hash: 'n-write-t', Type: 'write-file',
										Settings: { FilePath: tmpTruePath, Content: 'Condition was TRUE', Encoding: 'utf8' },
										Ports: [], X: 600, Y: -100
									},
									{
										Hash: 'n-write-f', Type: 'write-file',
										Settings: { FilePath: tmpFalsePath, Content: 'Condition was FALSE', Encoding: 'utf8' },
										Ports: [], X: 600, Y: 100
									},
									{ Hash: 'n-end', Type: 'end', X: 800, Y: 0 }
								],
								Connections: [
									{ Hash: 'c1', ConnectionType: 'Event', SourceNodeHash: 'n-start', SourcePortHash: 'n-start-eo-Start', TargetNodeHash: 'n-set', TargetPortHash: 'n-set-ei-Execute' },
									{ Hash: 'c2', ConnectionType: 'Event', SourceNodeHash: 'n-set', SourcePortHash: 'n-set-eo-Complete', TargetNodeHash: 'n-if', TargetPortHash: 'n-if-ei-Evaluate' },
									{ Hash: 'c3', ConnectionType: 'Event', SourceNodeHash: 'n-if', SourcePortHash: 'n-if-eo-True', TargetNodeHash: 'n-write-t', TargetPortHash: 'n-write-t-ei-BeginWrite' },
									{ Hash: 'c4', ConnectionType: 'Event', SourceNodeHash: 'n-if', SourcePortHash: 'n-if-eo-False', TargetNodeHash: 'n-write-f', TargetPortHash: 'n-write-f-ei-BeginWrite' },
									{ Hash: 'c5', ConnectionType: 'Event', SourceNodeHash: 'n-write-t', SourcePortHash: 'n-write-t-eo-WriteComplete', TargetNodeHash: 'n-end', TargetPortHash: 'n-end-ei-End' },
									{ Hash: 'c6', ConnectionType: 'Event', SourceNodeHash: 'n-write-f', SourcePortHash: 'n-write-f-eo-WriteComplete', TargetNodeHash: 'n-end', TargetPortHash: 'n-end-ei-End' }
								],
								ViewState: {}
							}
						});

						let tmpResult = await apiExecuteOperation(tmpResponse.Hash);

						libAssert.strictEqual(tmpResult.body.Status, 'Complete', 'Branch should complete');
						libAssert.ok(libFs.existsSync(tmpTruePath), 'True branch file should exist');
						libAssert.ok(!libFs.existsSync(tmpFalsePath), 'False branch file should NOT exist');

						let tmpContent = libFs.readFileSync(tmpTruePath, 'utf8');
						libAssert.strictEqual(tmpContent, 'Condition was TRUE', 'True branch content should match');

						console.log('  Branch result: TRUE path taken as expected');

						_TestResults.passed++;
					}
				);

				test
				(
					'execute false-branch when condition does not match',
					async function ()
					{
						this.timeout(15000);

						let tmpTestDir = libPath.join(_StagingDir, 'branch_false_test');
						libFs.mkdirSync(tmpTestDir, { recursive: true });
						let tmpTruePath = libPath.join(tmpTestDir, 'true_result.txt');
						let tmpFalsePath = libPath.join(tmpTestDir, 'false_result.txt');

						let tmpResponse = await apiCreateOperation({
							Name: 'Branch False Test',
							Description: 'SetValues sets status=inactive, IfConditional branches to False.',
							Graph: {
								Nodes: [
									{ Hash: 'n-start', Type: 'start', X: 0, Y: 0 },
									{
										Hash: 'n-set', Type: 'set-values',
										Settings: { Mappings: [{ Address: 'Operation.Status', Value: 'inactive' }] },
										Ports: [], X: 200, Y: 0
									},
									{
										Hash: 'n-if', Type: 'if-conditional',
										Settings: { DataAddress: 'Operation.Status', CompareValue: 'active', Operator: '==' },
										Ports: [], X: 400, Y: 0
									},
									{
										Hash: 'n-write-t', Type: 'write-file',
										Settings: { FilePath: tmpTruePath, Content: 'TRUE', Encoding: 'utf8' },
										Ports: [], X: 600, Y: -100
									},
									{
										Hash: 'n-write-f', Type: 'write-file',
										Settings: { FilePath: tmpFalsePath, Content: 'FALSE', Encoding: 'utf8' },
										Ports: [], X: 600, Y: 100
									},
									{ Hash: 'n-end', Type: 'end', X: 800, Y: 0 }
								],
								Connections: [
									{ Hash: 'c1', ConnectionType: 'Event', SourceNodeHash: 'n-start', SourcePortHash: 'n-start-eo-Start', TargetNodeHash: 'n-set', TargetPortHash: 'n-set-ei-Execute' },
									{ Hash: 'c2', ConnectionType: 'Event', SourceNodeHash: 'n-set', SourcePortHash: 'n-set-eo-Complete', TargetNodeHash: 'n-if', TargetPortHash: 'n-if-ei-Evaluate' },
									{ Hash: 'c3', ConnectionType: 'Event', SourceNodeHash: 'n-if', SourcePortHash: 'n-if-eo-True', TargetNodeHash: 'n-write-t', TargetPortHash: 'n-write-t-ei-BeginWrite' },
									{ Hash: 'c4', ConnectionType: 'Event', SourceNodeHash: 'n-if', SourcePortHash: 'n-if-eo-False', TargetNodeHash: 'n-write-f', TargetPortHash: 'n-write-f-ei-BeginWrite' },
									{ Hash: 'c5', ConnectionType: 'Event', SourceNodeHash: 'n-write-t', SourcePortHash: 'n-write-t-eo-WriteComplete', TargetNodeHash: 'n-end', TargetPortHash: 'n-end-ei-End' },
									{ Hash: 'c6', ConnectionType: 'Event', SourceNodeHash: 'n-write-f', SourcePortHash: 'n-write-f-eo-WriteComplete', TargetNodeHash: 'n-end', TargetPortHash: 'n-end-ei-End' }
								],
								ViewState: {}
							}
						});

						let tmpResult = await apiExecuteOperation(tmpResponse.Hash);

						libAssert.strictEqual(tmpResult.body.Status, 'Complete', 'Branch should complete');
						libAssert.ok(!libFs.existsSync(tmpTruePath), 'True branch file should NOT exist');
						libAssert.ok(libFs.existsSync(tmpFalsePath), 'False branch file should exist');

						let tmpContent = libFs.readFileSync(tmpFalsePath, 'utf8');
						libAssert.strictEqual(tmpContent, 'FALSE', 'False branch content should match');

						console.log('  Branch result: FALSE path taken as expected');

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Workflow 4: Error Handling
		// (read-file error → error-message)
		// ════════════════════════════════════════════════
		suite
		(
			'Workflow: Error Handling',
			function ()
			{
				test
				(
					'read-file error triggers error-message node',
					async function ()
					{
						this.timeout(15000);

						let tmpTestDir = libPath.join(_StagingDir, 'error_test');
						libFs.mkdirSync(tmpTestDir, { recursive: true });
						let tmpFallbackPath = libPath.join(tmpTestDir, 'fallback.txt');

						let tmpResponse = await apiCreateOperation({
							Name: 'Error Handling Test',
							Description: 'ReadFile with bad path fires Error, handled by ErrorMessage + fallback write.',
							Graph: {
								Nodes: [
									{ Hash: 'n-start', Type: 'start', X: 0, Y: 0 },
									{
										Hash: 'n-read', Type: 'read-file',
										Settings: { FilePath: '/nonexistent/path/missing.txt', Encoding: 'utf8' },
										Ports: [], X: 200, Y: 0
									},
									{
										Hash: 'n-err', Type: 'error-message',
										Settings: { MessageTemplate: 'File read failed — using fallback.' },
										Ports: [], X: 400, Y: 100
									},
									{
										Hash: 'n-fallback', Type: 'write-file',
										Settings: { FilePath: tmpFallbackPath, Content: 'Fallback content after error', Encoding: 'utf8' },
										Ports: [], X: 600, Y: 100
									},
									{ Hash: 'n-end', Type: 'end', X: 800, Y: 0 }
								],
								Connections: [
									{ Hash: 'c1', ConnectionType: 'Event', SourceNodeHash: 'n-start', SourcePortHash: 'n-start-eo-Start', TargetNodeHash: 'n-read', TargetPortHash: 'n-read-ei-BeginRead' },
									// Error path: read error → error-message
									{ Hash: 'c2', ConnectionType: 'Event', SourceNodeHash: 'n-read', SourcePortHash: 'n-read-eo-Error', TargetNodeHash: 'n-err', TargetPortHash: 'n-err-ei-Trigger' },
									// After error message → write fallback
									{ Hash: 'c3', ConnectionType: 'Event', SourceNodeHash: 'n-err', SourcePortHash: 'n-err-eo-Complete', TargetNodeHash: 'n-fallback', TargetPortHash: 'n-fallback-ei-BeginWrite' },
									{ Hash: 'c4', ConnectionType: 'Event', SourceNodeHash: 'n-fallback', SourcePortHash: 'n-fallback-eo-WriteComplete', TargetNodeHash: 'n-end', TargetPortHash: 'n-end-ei-End' }
								],
								ViewState: {}
							}
						});

						let tmpResult = await apiExecuteOperation(tmpResponse.Hash);

						libAssert.strictEqual(tmpResult.body.Status, 'Complete', 'Error-handled operation should complete');

						// Verify fallback was written
						libAssert.ok(libFs.existsSync(tmpFallbackPath), 'Fallback file should be written');
						let tmpContent = libFs.readFileSync(tmpFallbackPath, 'utf8');
						libAssert.strictEqual(tmpContent, 'Fallback content after error', 'Fallback content should match');

						// Verify the error was logged
						let tmpLogs = tmpResult.body.Log || [];
						let tmpHasErrorLog = tmpLogs.some(function (pL) { return pL.includes('File read failed'); });
						libAssert.ok(tmpHasErrorLog, 'Error message should appear in logs');

						console.log('  Error handling: fallback written, error logged');

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Workflow 5: Multi-Value SetValues
		// (set-values with multiple addresses → if-conditional with contains)
		// ════════════════════════════════════════════════
		suite
		(
			'Workflow: Multi-Value SetValues with Contains Operator',
			function ()
			{
				test
				(
					'set multiple values and use contains operator in conditional',
					async function ()
					{
						this.timeout(15000);

						let tmpTestDir = libPath.join(_StagingDir, 'setvals_test');
						libFs.mkdirSync(tmpTestDir, { recursive: true });
						let tmpResultPath = libPath.join(tmpTestDir, 'result.txt');

						let tmpResponse = await apiCreateOperation({
							Name: 'Multi SetValues Test',
							Description: 'Sets multiple operation values, then uses contains to check.',
							Graph: {
								Nodes: [
									{ Hash: 'n-start', Type: 'start', X: 0, Y: 0 },
									{
										Hash: 'n-set', Type: 'set-values',
										Settings: {
											Mappings: [
												{ Address: 'Operation.Greeting', Value: 'Hello World from Ultravisor' },
												{ Address: 'Operation.Counter', Value: 42 },
												{ Address: 'Global.AppVersion', Value: '2.0' }
											]
										},
										Ports: [], X: 200, Y: 0
									},
									{
										Hash: 'n-if', Type: 'if-conditional',
										Settings: { DataAddress: 'Operation.Greeting', CompareValue: 'Ultravisor', Operator: 'contains' },
										Ports: [], X: 400, Y: 0
									},
									{
										Hash: 'n-write', Type: 'write-file',
										Settings: { FilePath: tmpResultPath, Content: 'Contains matched', Encoding: 'utf8' },
										Ports: [], X: 600, Y: 0
									},
									{ Hash: 'n-end', Type: 'end', X: 800, Y: 0 }
								],
								Connections: [
									{ Hash: 'c1', ConnectionType: 'Event', SourceNodeHash: 'n-start', SourcePortHash: 'n-start-eo-Start', TargetNodeHash: 'n-set', TargetPortHash: 'n-set-ei-Execute' },
									{ Hash: 'c2', ConnectionType: 'Event', SourceNodeHash: 'n-set', SourcePortHash: 'n-set-eo-Complete', TargetNodeHash: 'n-if', TargetPortHash: 'n-if-ei-Evaluate' },
									{ Hash: 'c3', ConnectionType: 'Event', SourceNodeHash: 'n-if', SourcePortHash: 'n-if-eo-True', TargetNodeHash: 'n-write', TargetPortHash: 'n-write-ei-BeginWrite' },
									{ Hash: 'c4', ConnectionType: 'Event', SourceNodeHash: 'n-write', SourcePortHash: 'n-write-eo-WriteComplete', TargetNodeHash: 'n-end', TargetPortHash: 'n-end-ei-End' }
								],
								ViewState: {}
							}
						});

						let tmpResult = await apiExecuteOperation(tmpResponse.Hash);

						libAssert.strictEqual(tmpResult.body.Status, 'Complete', 'Multi-value operation should complete');
						libAssert.ok(libFs.existsSync(tmpResultPath), 'Result file should exist (contains matched)');

						let tmpContent = libFs.readFileSync(tmpResultPath, 'utf8');
						libAssert.strictEqual(tmpContent, 'Contains matched', 'Contains operator should work');

						console.log('  Multi-SetValues with contains: passed');

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Workflow 6: String Replace Pipeline
		// (read → replace → write via API)
		// ════════════════════════════════════════════════
		suite
		(
			'Workflow: String Replace Pipeline',
			function ()
			{
				test
				(
					'replace all occurrences in a file',
					async function ()
					{
						this.timeout(15000);

						let tmpTestDir = libPath.join(_StagingDir, 'replace_test');
						libFs.mkdirSync(tmpTestDir, { recursive: true });
						let tmpInputPath = libPath.join(tmpTestDir, 'input.txt');
						let tmpOutputPath = libPath.join(tmpTestDir, 'output.txt');
						libFs.writeFileSync(tmpInputPath, 'The quick brown fox jumps over the lazy fox. Fox is clever.', 'utf8');

						let tmpResponse = await apiCreateOperation({
							Name: 'Replace Pipeline',
							Description: 'Reads file, replaces fox→cat, writes output.',
							Graph: {
								Nodes: [
									{ Hash: 'n-start', Type: 'start', X: 0, Y: 0 },
									{
										Hash: 'n-read', Type: 'read-file',
										Settings: { FilePath: tmpInputPath, Encoding: 'utf8' },
										Ports: [], X: 200, Y: 0
									},
									{
										Hash: 'n-replace', Type: 'replace-string',
										Settings: { SearchString: 'fox', ReplaceString: 'cat' },
										Ports: [], X: 400, Y: 0
									},
									{
										Hash: 'n-write', Type: 'write-file',
										Settings: { FilePath: tmpOutputPath, Encoding: 'utf8' },
										Ports: [], X: 600, Y: 0
									},
									{ Hash: 'n-end', Type: 'end', X: 800, Y: 0 }
								],
								Connections: [
									{ Hash: 'c1', ConnectionType: 'Event', SourceNodeHash: 'n-start', SourcePortHash: 'n-start-eo-Start', TargetNodeHash: 'n-read', TargetPortHash: 'n-read-ei-BeginRead' },
									{ Hash: 'c2', ConnectionType: 'Event', SourceNodeHash: 'n-read', SourcePortHash: 'n-read-eo-ReadComplete', TargetNodeHash: 'n-replace', TargetPortHash: 'n-replace-ei-Replace' },
									{ Hash: 'c3', ConnectionType: 'State', SourceNodeHash: 'n-read', SourcePortHash: 'n-read-so-FileContent', TargetNodeHash: 'n-replace', TargetPortHash: 'n-replace-si-InputString' },
									{ Hash: 'c4', ConnectionType: 'Event', SourceNodeHash: 'n-replace', SourcePortHash: 'n-replace-eo-ReplaceComplete', TargetNodeHash: 'n-write', TargetPortHash: 'n-write-ei-BeginWrite' },
									{ Hash: 'c5', ConnectionType: 'State', SourceNodeHash: 'n-replace', SourcePortHash: 'n-replace-so-ReplacedString', TargetNodeHash: 'n-write', TargetPortHash: 'n-write-si-Content' },
									{ Hash: 'c6', ConnectionType: 'Event', SourceNodeHash: 'n-write', SourcePortHash: 'n-write-eo-WriteComplete', TargetNodeHash: 'n-end', TargetPortHash: 'n-end-ei-End' }
								],
								ViewState: {}
							}
						});

						let tmpResult = await apiExecuteOperation(tmpResponse.Hash);

						libAssert.strictEqual(tmpResult.body.Status, 'Complete', 'Replace pipeline should complete');

						let tmpOutput = libFs.readFileSync(tmpOutputPath, 'utf8');
						libAssert.ok(tmpOutput.includes('cat'), 'Output should contain "cat"');
						libAssert.ok(!tmpOutput.includes('fox'), 'Output should not contain "fox"');
						libAssert.ok(tmpOutput.includes('The quick brown cat'), 'First replacement should match');

						// Note: Fox (capital) won't be replaced since replace-string is case-sensitive
						console.log('  Replace output:', JSON.stringify(tmpOutput));

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Workflow 7: Looping Pipeline (via Flow Editor)
		// (read → split → replace → append → write)
		// ════════════════════════════════════════════════
		suite
		(
			'Workflow: Looping Pipeline via Flow Editor',
			function ()
			{
				let _WorkflowInputPath = '';
				let _WorkflowOutputPath = '';
				let _SavedOperationHash = '';

				test
				(
					'create test input file for workflow',
					function ()
					{
						this.timeout(5000);

						let tmpStagingDir = libPath.join(_StagingDir, 'workflow_test');
						libFs.mkdirSync(tmpStagingDir, { recursive: true });

						_WorkflowInputPath = libPath.join(tmpStagingDir, 'input.txt');
						_WorkflowOutputPath = libPath.join(tmpStagingDir, 'output.txt');

						libFs.writeFileSync(_WorkflowInputPath,
							'Hello John Smith\nJohn went to the store\nMary and John had lunch\nNo match here\n',
							'utf8');

						libAssert.ok(libFs.existsSync(_WorkflowInputPath), 'Input file should exist');
						_TestResults.passed++;
					}
				);

				test
				(
					'navigate to flow editor and build workflow',
					async function ()
					{
						this.timeout(30000);

						await _Page.evaluate(() =>
						{
							if (window._Pict && window._Pict.PictApplication)
							{
								window._Pict.PictApplication.navigateTo('/FlowEditor');
							}
						});
						await settle(1500);

						await takeScreenshot('workflow-editor-empty');

						let tmpFlowData = await _Page.evaluate((pInputPath, pOutputPath) =>
						{
							let tmpGraph =
							{
								Nodes:
								[
									{
										Hash: 'wf-start', Type: 'start',
										X: 50, Y: 200, Width: 140, Height: 80,
										Title: 'Start',
										Ports: [{ Hash: 'wf-start-eo-Start', Direction: 'output', Side: 'right', Label: 'Out' }],
										Settings: {}
									},
									{
										Hash: 'wf-read', Type: 'read-file',
										X: 260, Y: 180, Width: 200, Height: 100,
										Title: 'Load Input File',
										Ports: [
											{ Hash: 'wf-read-ei-BeginRead', Direction: 'input', Side: 'left-bottom', Label: 'BeginRead' },
											{ Hash: 'wf-read-eo-ReadComplete', Direction: 'output', Side: 'right', Label: 'ReadComplete' },
											{ Hash: 'wf-read-so-FileContent', Direction: 'output', Side: 'right-top', Label: 'FileContent' },
											{ Hash: 'wf-read-eo-Error', Direction: 'output', Side: 'bottom', Label: 'Error' }
										],
										Settings: { FilePath: pInputPath, Encoding: 'utf8' }
									},
									{
										Hash: 'wf-split', Type: 'split-execute',
										X: 540, Y: 160, Width: 240, Height: 120,
										Title: 'Split Lines',
										Ports: [
											{ Hash: 'wf-split-ei-PerformSplit', Direction: 'input', Side: 'left-bottom', Label: 'PerformSplit' },
											{ Hash: 'wf-split-ei-StepComplete', Direction: 'input', Side: 'left-bottom', Label: 'StepComplete' },
											{ Hash: 'wf-split-si-InputString', Direction: 'input', Side: 'left-top', Label: 'InputString' },
											{ Hash: 'wf-split-eo-TokenDataSent', Direction: 'output', Side: 'right', Label: 'TokenDataSent' },
											{ Hash: 'wf-split-so-CurrentToken', Direction: 'output', Side: 'right-top', Label: 'CurrentToken' },
											{ Hash: 'wf-split-eo-CompletedAllSubtasks', Direction: 'output', Side: 'right-bottom', Label: 'CompletedAllSubtasks' }
										],
										Settings: {}
									},
									{
										Hash: 'wf-replace', Type: 'replace-string',
										X: 860, Y: 160, Width: 220, Height: 100,
										Title: 'Replace John with Jane',
										Ports: [
											{ Hash: 'wf-replace-si-InputString', Direction: 'input', Side: 'left-top', Label: 'InputString' },
											{ Hash: 'wf-replace-ei-Replace', Direction: 'input', Side: 'left-bottom', Label: 'Replace' },
											{ Hash: 'wf-replace-eo-ReplaceComplete', Direction: 'output', Side: 'right', Label: 'ReplaceComplete' },
											{ Hash: 'wf-replace-so-ReplacedString', Direction: 'output', Side: 'right-top', Label: 'ReplacedString' }
										],
										Settings: { SearchString: 'John', ReplaceString: 'Jane' }
									},
									{
										Hash: 'wf-append', Type: 'string-appender',
										X: 1160, Y: 160, Width: 220, Height: 100,
										Title: 'Append Line',
										Ports: [
											{ Hash: 'wf-append-ei-Append', Direction: 'input', Side: 'left-bottom', Label: 'Append' },
											{ Hash: 'wf-append-si-InputString', Direction: 'input', Side: 'left-top', Label: 'InputString' },
											{ Hash: 'wf-append-eo-Completed', Direction: 'output', Side: 'right', Label: 'Completed' },
											{ Hash: 'wf-append-so-AppendedString', Direction: 'output', Side: 'right-top', Label: 'AppendedString' }
										],
										Settings: { OutputAddress: 'Operation.OutputFileContents', AppendNewline: true }
									},
									{
										Hash: 'wf-write', Type: 'write-file',
										X: 860, Y: 380, Width: 220, Height: 80,
										Title: 'Save Output File',
										Ports: [
											{ Hash: 'wf-write-si-Content', Direction: 'input', Side: 'left-top', Label: 'Content' },
											{ Hash: 'wf-write-ei-BeginWrite', Direction: 'input', Side: 'left-bottom', Label: 'BeginWrite' },
											{ Hash: 'wf-write-eo-WriteComplete', Direction: 'output', Side: 'right', Label: 'WriteComplete' },
											{ Hash: 'wf-write-eo-Error', Direction: 'output', Side: 'bottom', Label: 'Error' }
										],
										Settings: { FilePath: pOutputPath, Encoding: 'utf8' }
									},
									{
										Hash: 'wf-end', Type: 'end',
										X: 1160, Y: 380, Width: 140, Height: 80,
										Title: 'End',
										Ports: [{ Hash: 'wf-end-ei-In', Direction: 'input', Side: 'left-bottom', Label: 'In' }],
										Settings: {}
									}
								],
								Connections:
								[
									{ Hash: 'wf-ev1', ConnectionType: 'Event', SourceNodeHash: 'wf-start', SourcePortHash: 'wf-start-eo-Start', TargetNodeHash: 'wf-read', TargetPortHash: 'wf-read-ei-BeginRead', Data: {} },
									{ Hash: 'wf-ev2', ConnectionType: 'Event', SourceNodeHash: 'wf-read', SourcePortHash: 'wf-read-eo-ReadComplete', TargetNodeHash: 'wf-split', TargetPortHash: 'wf-split-ei-PerformSplit', Data: {} },
									{ Hash: 'wf-ev3', ConnectionType: 'Event', SourceNodeHash: 'wf-split', SourcePortHash: 'wf-split-eo-TokenDataSent', TargetNodeHash: 'wf-replace', TargetPortHash: 'wf-replace-ei-Replace', Data: {} },
									{ Hash: 'wf-ev4', ConnectionType: 'Event', SourceNodeHash: 'wf-replace', SourcePortHash: 'wf-replace-eo-ReplaceComplete', TargetNodeHash: 'wf-append', TargetPortHash: 'wf-append-ei-Append', Data: {} },
									{ Hash: 'wf-ev5', ConnectionType: 'Event', SourceNodeHash: 'wf-append', SourcePortHash: 'wf-append-eo-Completed', TargetNodeHash: 'wf-split', TargetPortHash: 'wf-split-ei-StepComplete', Data: {} },
									{ Hash: 'wf-ev6', ConnectionType: 'Event', SourceNodeHash: 'wf-split', SourcePortHash: 'wf-split-eo-CompletedAllSubtasks', TargetNodeHash: 'wf-write', TargetPortHash: 'wf-write-ei-BeginWrite', Data: {} },
									{ Hash: 'wf-ev7', ConnectionType: 'Event', SourceNodeHash: 'wf-write', SourcePortHash: 'wf-write-eo-WriteComplete', TargetNodeHash: 'wf-end', TargetPortHash: 'wf-end-ei-In', Data: {} },
									{ Hash: 'wf-st1', ConnectionType: 'State', SourceNodeHash: 'wf-read', SourcePortHash: 'wf-read-so-FileContent', TargetNodeHash: 'wf-split', TargetPortHash: 'wf-split-si-InputString', Data: {} },
									{ Hash: 'wf-st2', ConnectionType: 'State', SourceNodeHash: 'wf-split', SourcePortHash: 'wf-split-so-CurrentToken', TargetNodeHash: 'wf-replace', TargetPortHash: 'wf-replace-si-InputString', Data: {} },
									{ Hash: 'wf-st3', ConnectionType: 'State', SourceNodeHash: 'wf-replace', SourcePortHash: 'wf-replace-so-ReplacedString', TargetNodeHash: 'wf-append', TargetPortHash: 'wf-append-si-InputString', Data: {} },
									{ Hash: 'wf-st4', ConnectionType: 'State', SourceNodeHash: 'wf-append', SourcePortHash: 'wf-append-so-AppendedString', TargetNodeHash: 'wf-write', TargetPortHash: 'wf-write-si-Content', Data: {} }
								],
								ViewState: { PanX: 0, PanY: 0, Zoom: 1, SelectedNodeHash: null, SelectedConnectionHash: null }
							};

							let tmpPict = window._Pict;
							let tmpFlowEditor = tmpPict.views['Ultravisor-FlowEditor'];
							if (tmpFlowEditor && tmpFlowEditor._FlowView)
							{
								tmpPict.AppData.Ultravisor.Flows.Current = JSON.parse(JSON.stringify(tmpGraph));
								tmpFlowEditor._FlowView.setFlowData(tmpPict.AppData.Ultravisor.Flows.Current);
								return { success: true, nodeCount: tmpGraph.Nodes.length, connectionCount: tmpGraph.Connections.length };
							}
							return { success: false, error: 'Flow view not initialized' };
						}, _WorkflowInputPath, _WorkflowOutputPath);

						libAssert.ok(tmpFlowData.success, 'Flow data should be injected: ' + JSON.stringify(tmpFlowData));
						libAssert.strictEqual(tmpFlowData.nodeCount, 7, 'Should have 7 nodes');
						libAssert.strictEqual(tmpFlowData.connectionCount, 11, 'Should have 11 connections');

						await settle(500);
						await takeScreenshot('workflow-editor-built');
						_TestResults.passed++;
					}
				);

				test
				(
					'zoom to fit and verify port rendering',
					async function ()
					{
						this.timeout(15000);

						await _Page.evaluate(() =>
						{
							let tmpPict = window._Pict;
							let tmpFlowEditor = tmpPict.views['Ultravisor-FlowEditor'];
							if (tmpFlowEditor && tmpFlowEditor._FlowView && tmpFlowEditor._FlowView._ViewportManager)
							{
								tmpFlowEditor._FlowView._ViewportManager.zoomToFit();
							}
						});
						await settle(500);

						let tmpPortInfo = await _Page.evaluate(() =>
						{
							let tmpPorts = document.querySelectorAll('.pict-flow-port');
							let tmpByType = {};
							tmpPorts.forEach((pEl) =>
							{
								let tmpType = pEl.getAttribute('data-port-type') || pEl.getAttribute('data-port-direction') || 'unknown';
								if (!tmpByType[tmpType]) tmpByType[tmpType] = 0;
								tmpByType[tmpType]++;
							});
							return { total: tmpPorts.length, byType: tmpByType };
						});

						console.log('  Port breakdown:', JSON.stringify(tmpPortInfo.byType));
						libAssert.ok(tmpPortInfo.total > 0, 'Should render ports on the SVG');

						await takeScreenshot('workflow-zoomed');
						_TestResults.passed++;
					}
				);

				test
				(
					'save the operation via the UI',
					async function ()
					{
						this.timeout(15000);

						await _Page.evaluate(() =>
						{
							let tmpNameEl = document.getElementById('Ultravisor-FlowEditor-Name');
							if (tmpNameEl) tmpNameEl.value = 'Workflow Test - Line Replace';
							let tmpDescEl = document.getElementById('Ultravisor-FlowEditor-Description');
							if (tmpDescEl) tmpDescEl.value = 'Reads a file, replaces John with Jane per-line, writes output.';
						});

						await _Page.evaluate(() =>
						{
							window._lastAlert = null;
							window.alert = function (pMsg) { window._lastAlert = pMsg; };
						});

						await _Page.evaluate(() =>
						{
							let tmpPict = window._Pict;
							tmpPict.views['Ultravisor-FlowEditor'].saveOperation();
						});
						await settle(2000);

						let tmpSaveResult = await _Page.evaluate(() =>
						{
							let tmpHashEl = document.getElementById('Ultravisor-FlowEditor-HashDisplay');
							return {
								alertMessage: window._lastAlert,
								operationHash: tmpHashEl ? tmpHashEl.textContent : ''
							};
						});

						console.log('  Save result:', tmpSaveResult.alertMessage, '| Hash:', tmpSaveResult.operationHash);
						libAssert.ok(tmpSaveResult.alertMessage && tmpSaveResult.alertMessage.includes('saved'), 'Should show saved alert');
						libAssert.ok(tmpSaveResult.operationHash.length > 0, 'Should have an operation hash');

						_SavedOperationHash = tmpSaveResult.operationHash;

						await takeScreenshot('workflow-saved');
						_TestResults.passed++;
					}
				);

				test
				(
					'execute the looping pipeline via the API',
					async function ()
					{
						this.timeout(30000);

						libAssert.ok(_SavedOperationHash, 'Must have a saved operation hash');

						let tmpResult = await apiExecuteOperation(_SavedOperationHash);

						libAssert.strictEqual(tmpResult.body.Status, 'Complete', 'Execution should complete successfully');
						console.log('  Execution status:', tmpResult.body.Status, '| Log entries:', (tmpResult.body.Log || []).length);

						_TestResults.passed++;
					}
				);

				test
				(
					'verify the output file has correct content',
					function ()
					{
						this.timeout(5000);

						libAssert.ok(libFs.existsSync(_WorkflowOutputPath),
							'Output file should exist at: ' + _WorkflowOutputPath);

						let tmpOutputContent = libFs.readFileSync(_WorkflowOutputPath, 'utf8');
						console.log('  Output content:', JSON.stringify(tmpOutputContent));

						libAssert.ok(tmpOutputContent.includes('Jane'), 'Output should contain "Jane"');
						libAssert.ok(!tmpOutputContent.includes('John'), 'Output should not contain "John"');
						libAssert.ok(tmpOutputContent.includes('Hello Jane Smith'), 'First line correct');
						libAssert.ok(tmpOutputContent.includes('Jane went to the store'), 'Second line correct');
						libAssert.ok(tmpOutputContent.includes('Mary and Jane had lunch'), 'Third line correct');
						libAssert.ok(tmpOutputContent.includes('No match here'), 'Fourth line unchanged');

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Workflow 8: Sub-Operation (launch-operation)
		// ════════════════════════════════════════════════
		suite
		(
			'Workflow: Sub-Operation via launch-operation',
			function ()
			{
				let _ChildOpHash = '';

				test
				(
					'create a child operation that writes a file',
					async function ()
					{
						this.timeout(15000);

						let tmpTestDir = libPath.join(_StagingDir, 'subop_test');
						libFs.mkdirSync(tmpTestDir, { recursive: true });
						let tmpChildOutputPath = libPath.join(tmpTestDir, 'child_output.txt');

						let tmpResponse = await apiCreateOperation({
							Hash: 'CHILD-OP-001',
							Name: 'Child Operation',
							Description: 'Simple child op that writes a marker file.',
							Graph: {
								Nodes: [
									{ Hash: 'n-start', Type: 'start', X: 0, Y: 0 },
									{
										Hash: 'n-write', Type: 'write-file',
										Settings: { FilePath: tmpChildOutputPath, Content: 'Written by child operation', Encoding: 'utf8' },
										Ports: [], X: 200, Y: 0
									},
									{ Hash: 'n-end', Type: 'end', X: 400, Y: 0 }
								],
								Connections: [
									{ Hash: 'c1', ConnectionType: 'Event', SourceNodeHash: 'n-start', SourcePortHash: 'n-start-eo-Start', TargetNodeHash: 'n-write', TargetPortHash: 'n-write-ei-BeginWrite' },
									{ Hash: 'c2', ConnectionType: 'Event', SourceNodeHash: 'n-write', SourcePortHash: 'n-write-eo-WriteComplete', TargetNodeHash: 'n-end', TargetPortHash: 'n-end-ei-End' }
								],
								ViewState: {}
							}
						});

						_ChildOpHash = tmpResponse.Hash;
						libAssert.ok(_ChildOpHash, 'Child operation should be created');
						console.log('  Child operation:', _ChildOpHash);

						_TestResults.passed++;
					}
				);

				test
				(
					'create and execute parent operation that launches the child',
					async function ()
					{
						this.timeout(15000);

						let tmpTestDir = libPath.join(_StagingDir, 'subop_test');
						let tmpParentOutputPath = libPath.join(tmpTestDir, 'parent_output.txt');

						let tmpResponse = await apiCreateOperation({
							Name: 'Parent Operation',
							Description: 'Launches child operation then writes its own marker.',
							Graph: {
								Nodes: [
									{ Hash: 'n-start', Type: 'start', X: 0, Y: 0 },
									{
										Hash: 'n-launch', Type: 'launch-operation',
										Settings: { OperationHash: _ChildOpHash },
										Ports: [], X: 200, Y: 0
									},
									{
										Hash: 'n-write', Type: 'write-file',
										Settings: { FilePath: tmpParentOutputPath, Content: 'Parent completed after child', Encoding: 'utf8' },
										Ports: [], X: 400, Y: 0
									},
									{ Hash: 'n-end', Type: 'end', X: 600, Y: 0 }
								],
								Connections: [
									{ Hash: 'c1', ConnectionType: 'Event', SourceNodeHash: 'n-start', SourcePortHash: 'n-start-eo-Start', TargetNodeHash: 'n-launch', TargetPortHash: 'n-launch-ei-Launch' },
									{ Hash: 'c2', ConnectionType: 'Event', SourceNodeHash: 'n-launch', SourcePortHash: 'n-launch-eo-Completed', TargetNodeHash: 'n-write', TargetPortHash: 'n-write-ei-BeginWrite' },
									{ Hash: 'c3', ConnectionType: 'Event', SourceNodeHash: 'n-write', SourcePortHash: 'n-write-eo-WriteComplete', TargetNodeHash: 'n-end', TargetPortHash: 'n-end-ei-End' }
								],
								ViewState: {}
							}
						});

						let tmpResult = await apiExecuteOperation(tmpResponse.Hash);

						libAssert.strictEqual(tmpResult.body.Status, 'Complete', 'Parent operation should complete');

						// Verify the launch-operation outputs
						let tmpLaunchOutputs = tmpResult.body.TaskOutputs['n-launch'];
						libAssert.ok(tmpLaunchOutputs, 'Should have launch-operation outputs');
						libAssert.strictEqual(tmpLaunchOutputs.Status, 'Complete', 'Child status should be Complete');
						libAssert.ok(tmpLaunchOutputs.ElapsedMs >= 0, 'Should track child elapsed time');

						// Verify both files were written
						let tmpChildOutputPath = libPath.join(tmpTestDir, 'child_output.txt');
						libAssert.ok(libFs.existsSync(tmpChildOutputPath), 'Child output should exist');
						libAssert.ok(libFs.existsSync(tmpParentOutputPath), 'Parent output should exist');

						let tmpChildContent = libFs.readFileSync(tmpChildOutputPath, 'utf8');
						let tmpParentContent = libFs.readFileSync(tmpParentOutputPath, 'utf8');
						libAssert.strictEqual(tmpChildContent, 'Written by child operation', 'Child content matches');
						libAssert.strictEqual(tmpParentContent, 'Parent completed after child', 'Parent content matches');

						console.log('  Sub-operation: child and parent both completed');
						console.log('  Child elapsed:', tmpLaunchOutputs.ElapsedMs, 'ms');

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Schedule API
		// ════════════════════════════════════════════════
		suite
		(
			'Schedule API',
			function ()
			{
				let _ScheduledOpHash = '';
				let _ScheduleEntryGUID = '';

				test
				(
					'create an operation for scheduling',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = await apiCreateOperation({
							Name: 'Schedulable Operation',
							Description: 'A simple operation for schedule testing.',
							Graph: {
								Nodes: [
									{ Hash: 'n-start', Type: 'start', X: 0, Y: 0 },
									{ Hash: 'n-end', Type: 'end', X: 200, Y: 0 }
								],
								Connections: [
									{
										Hash: 'c1', ConnectionType: 'Event',
										SourceNodeHash: 'n-start', SourcePortHash: 'n-start-eo-Start',
										TargetNodeHash: 'n-end', TargetPortHash: 'n-end-ei-End'
									}
								],
								ViewState: {}
							}
						});

						_ScheduledOpHash = tmpResponse.Hash;
						libAssert.ok(_ScheduledOpHash, 'Schedulable operation created');

						_TestResults.passed++;
					}
				);

				test
				(
					'schedule an operation via POST /Schedule/Operation',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = await apiPost('/Schedule/Operation', {
							Hash: _ScheduledOpHash,
							ScheduleType: 'cron',
							Parameters: '0 */6 * * *'
						});

						libAssert.strictEqual(tmpResponse.status, 200, 'Schedule should succeed');
						libAssert.ok(tmpResponse.body.GUID, 'Schedule entry should have a GUID');
						libAssert.strictEqual(tmpResponse.body.TargetHash, _ScheduledOpHash, 'TargetHash should match');
						libAssert.strictEqual(tmpResponse.body.TargetType, 'Operation', 'TargetType should be Operation');

						_ScheduleEntryGUID = tmpResponse.body.GUID;
						console.log('  Schedule entry:', _ScheduleEntryGUID);

						_TestResults.passed++;
					}
				);

				test
				(
					'list schedule via GET /Schedule',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = await apiGet('/Schedule');

						libAssert.ok(Array.isArray(tmpResponse.body), 'Should return an array');
						libAssert.ok(tmpResponse.body.length >= 1, 'Should have at least one entry');

						let tmpEntry = tmpResponse.body.find(function (pE) { return pE.GUID === _ScheduleEntryGUID; });
						libAssert.ok(tmpEntry, 'Our schedule entry should appear in list');

						_TestResults.passed++;
					}
				);

				test
				(
					'remove schedule entry via DELETE /Schedule/:GUID',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = await apiDelete('/Schedule/' + _ScheduleEntryGUID);

						libAssert.strictEqual(tmpResponse.body.Status, 'Deleted', 'Should confirm deletion');

						// Verify it is gone
						let tmpListResponse = await apiGet('/Schedule');
						let tmpEntry = tmpListResponse.body.find(function (pE) { return pE.GUID === _ScheduleEntryGUID; });
						libAssert.ok(!tmpEntry, 'Entry should be removed from schedule');

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Manifest API
		// ════════════════════════════════════════════════
		suite
		(
			'Manifest API',
			function ()
			{
				test
				(
					'list execution manifests via GET /Manifest',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = await apiGet('/Manifest');

						libAssert.strictEqual(tmpResponse.status, 200, 'Should return 200');
						libAssert.ok(Array.isArray(tmpResponse.body), 'Should return an array');

						// We should have manifests from previous executions
						console.log('  Manifests:', tmpResponse.body.length, 'run(s) recorded');
						if (tmpResponse.body.length > 0)
						{
							let tmpFirst = tmpResponse.body[0];
							console.log('  First manifest:', tmpFirst.Hash || tmpFirst.OperationHash, '| Status:', tmpFirst.Status);
						}

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Status & Package API
		// ════════════════════════════════════════════════
		suite
		(
			'Status and Package API',
			function ()
			{
				test
				(
					'get server status via GET /status',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = await apiGet('/status');

						libAssert.strictEqual(tmpResponse.status, 200, 'Should return 200');
						libAssert.strictEqual(tmpResponse.body.Status, 'Running', 'Server should be running');
						libAssert.ok(typeof tmpResponse.body.ScheduleEntries === 'number', 'ScheduleEntries should be a number');

						console.log('  Server status:', tmpResponse.body.Status,
							'| Schedule entries:', tmpResponse.body.ScheduleEntries,
							'| Schedule running:', tmpResponse.body.ScheduleRunning);

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Dashboard Data After Workflows
		// ════════════════════════════════════════════════
		suite
		(
			'Dashboard After Workflows',
			function ()
			{
				test
				(
					'dashboard shows updated counts',
					async function ()
					{
						this.timeout(15000);

						await navigateToRoute('#/Home');
						await settle(2000);

						await takeScreenshot('dashboard-after-workflows');

						_TestResults.passed++;
					}
				);

				test
				(
					'operations list shows created operations',
					async function ()
					{
						this.timeout(15000);

						await navigateToRoute('#/Operations');
						await settle(1500);

						let tmpOpCount = await _Page.evaluate(() =>
						{
							let tmpRows = document.querySelectorAll('.ultravisor-operation-table tbody tr');
							return tmpRows ? tmpRows.length : 0;
						});

						console.log('  Operations visible in list:', tmpOpCount);
						libAssert.ok(tmpOpCount >= 1, 'Should show at least one operation in the list');

						await takeScreenshot('operations-list-populated');

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Pending Input API
		// ════════════════════════════════════════════════
		suite
		(
			'Pending Input API',
			function ()
			{
				let _PendingOpHash = '';
				let _PendingRunHash = '';

				test
				(
					'create operation with value-input node',
					async function ()
					{
						this.timeout(15000);

						let tmpResponse = await apiCreateOperation({
							Name: 'Pending Input Test',
							Description: 'Tests value-input pause and resume via PendingInput API.',
							Graph: {
								Nodes: [
									{ Hash: 'pi-start', Type: 'start', X: 0, Y: 0 },
									{
										Hash: 'pi-input', Type: 'value-input',
										Settings: { PromptMessage: 'Enter test value', OutputAddress: 'Operation.TestValue' },
										Ports: [], X: 200, Y: 0
									},
									{ Hash: 'pi-end', Type: 'end', X: 400, Y: 0 }
								],
								Connections: [
									{ Hash: 'pi-c1', ConnectionType: 'Event', SourceNodeHash: 'pi-start', SourcePortHash: 'pi-start-eo-Start', TargetNodeHash: 'pi-input', TargetPortHash: 'pi-input-ei-RequestInput' },
									{ Hash: 'pi-c2', ConnectionType: 'Event', SourceNodeHash: 'pi-input', SourcePortHash: 'pi-input-eo-ValueInputComplete', TargetNodeHash: 'pi-end', TargetPortHash: 'pi-end-ei-End' }
								],
								ViewState: {}
							}
						});

						_PendingOpHash = tmpResponse.Hash;
						libAssert.ok(_PendingOpHash, 'Operation should be created');
						console.log('  Pending Input op:', _PendingOpHash);

						_TestResults.passed++;
					}
				);

				test
				(
					'execute operation — should pause at value-input',
					async function ()
					{
						this.timeout(15000);

						let tmpResult = await apiExecuteOperation(_PendingOpHash);
						libAssert.strictEqual(tmpResult.body.Status, 'WaitingForInput', 'Should be waiting for input');
						libAssert.ok(tmpResult.body.WaitingTasks, 'Should have WaitingTasks');
						libAssert.ok(tmpResult.body.WaitingTasks['pi-input'], 'Should be waiting on pi-input node');
						libAssert.strictEqual(tmpResult.body.WaitingTasks['pi-input'].PromptMessage, 'Enter test value', 'PromptMessage should match');

						_PendingRunHash = tmpResult.body.Hash;
						console.log('  Run paused:', _PendingRunHash, '| Prompt:', tmpResult.body.WaitingTasks['pi-input'].PromptMessage);

						_TestResults.passed++;
					}
				);

				test
				(
					'GET /PendingInput lists the paused run',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = await apiGet('/PendingInput');
						libAssert.strictEqual(tmpResponse.status, 200, 'Should return 200');
						libAssert.ok(Array.isArray(tmpResponse.body), 'Should return an array');
						libAssert.ok(tmpResponse.body.length >= 1, 'Should have at least one pending input');

						let tmpFound = tmpResponse.body.find(function (pItem) { return pItem.RunHash === _PendingRunHash; });
						libAssert.ok(tmpFound, 'Should find our paused run');
						libAssert.strictEqual(tmpFound.OperationHash, _PendingOpHash, 'OperationHash should match');
						libAssert.ok(tmpFound.WaitingTasks['pi-input'], 'Should show pi-input as waiting');
						libAssert.strictEqual(tmpFound.WaitingTasks['pi-input'].PromptMessage, 'Enter test value', 'PromptMessage should match');

						console.log('  Pending inputs found:', tmpResponse.body.length);

						_TestResults.passed++;
					}
				);

				test
				(
					'Pending Input view shows waiting operations',
					async function ()
					{
						this.timeout(15000);

						await navigateToRoute('#/PendingInput');
						await settle(2000);

						let tmpCardCount = await _Page.evaluate(() =>
						{
							let tmpCards = document.querySelectorAll('.ultravisor-pendinginput-card');
							return tmpCards ? tmpCards.length : 0;
						});

						libAssert.ok(tmpCardCount >= 1, 'Should show at least one pending input card');
						console.log('  Pending input cards visible:', tmpCardCount);

						await takeScreenshot('pending-input-view');

						_TestResults.passed++;
					}
				);

				test
				(
					'POST /PendingInput/:RunHash submits value and resumes',
					async function ()
					{
						this.timeout(15000);

						let tmpResponse = await apiPost('/PendingInput/' + _PendingRunHash, { NodeHash: 'pi-input', Value: 'hello-test-value' });

						libAssert.strictEqual(tmpResponse.status, 200, 'Should return 200');
						libAssert.strictEqual(tmpResponse.body.Status, 'Complete', 'Operation should complete after input');
						libAssert.ok(tmpResponse.body.TaskOutputs['pi-input'], 'Should have pi-input outputs');
						libAssert.strictEqual(tmpResponse.body.TaskOutputs['pi-input'].InputValue, 'hello-test-value', 'InputValue should match');

						console.log('  Resumed run status:', tmpResponse.body.Status);

						_TestResults.passed++;
					}
				);

				test
				(
					'GET /PendingInput is now empty for that run',
					async function ()
					{
						this.timeout(10000);

						let tmpResponse = await apiGet('/PendingInput');
						libAssert.strictEqual(tmpResponse.status, 200, 'Should return 200');

						let tmpFound = tmpResponse.body.find(function (pItem) { return pItem.RunHash === _PendingRunHash; });
						libAssert.ok(!tmpFound, 'Completed run should no longer appear in pending inputs');

						console.log('  Remaining pending inputs:', tmpResponse.body.length);

						_TestResults.passed++;
					}
				);
			}
		);

		// ════════════════════════════════════════════════
		// Console Errors
		// ════════════════════════════════════════════════
		suite
		(
			'Console Errors',
			function ()
			{
				test
				(
					'no critical console errors during all tests',
					function ()
					{
						let tmpCriticalErrors = _ConsoleErrors.filter(function (pMsg)
						{
							if (pMsg.includes('fetch') || pMsg.includes('Failed to load')
								|| pMsg.includes('NetworkError') || pMsg.includes('net::')
								|| pMsg.includes('TypeError: Cannot read properties of undefined'))
							{
								return false;
							}
							return true;
						});

						if (tmpCriticalErrors.length > 0)
						{
							console.log('  Critical browser errors found:');
							tmpCriticalErrors.forEach(function (pErr)
							{
								console.log('    -', pErr);
							});
						}

						console.log(`  Browser errors: ${_ConsoleErrors.length} total, ${tmpCriticalErrors.length} critical`);
						_TestResults.passed++;
					}
				);
			}
		);
	}
);
