/**
 * Ultravisor Beacon Client
 *
 * A lightweight worker node that connects to an Ultravisor server,
 * registers its capabilities, polls for work, executes tasks locally,
 * and reports results back to the orchestrator.
 *
 * Communication is HTTP-based (transport-agnostic design means this
 * can be swapped for WebSocket, MQTT, etc. in the future).
 */

const libHTTP = require('http');
const libURL = require('url');

const libBeaconExecutor = require('./Ultravisor-Beacon-Executor.cjs');

class UltravisorBeaconClient
{
	constructor(pConfig)
	{
		this._Config = Object.assign({
			ServerURL: 'http://localhost:54321',
			Name: 'beacon-worker',
			Capabilities: ['Shell'],
			MaxConcurrent: 1,
			PollIntervalMs: 5000,
			HeartbeatIntervalMs: 30000,
			StagingPath: process.cwd(),
			Tags: {}
		}, pConfig || {});

		this._BeaconID = null;
		this._PollInterval = null;
		this._HeartbeatInterval = null;
		this._Running = false;
		this._ActiveWorkItems = 0;

		this._Executor = new libBeaconExecutor({
			StagingPath: this._Config.StagingPath
		});
	}

	// ================================================================
	// Lifecycle
	// ================================================================

	/**
	 * Start the Beacon client: register, then begin polling.
	 */
	start(fCallback)
	{
		console.log(`[Beacon] Starting "${this._Config.Name}"...`);
		console.log(`[Beacon] Server: ${this._Config.ServerURL}`);
		console.log(`[Beacon] Capabilities: ${this._Config.Capabilities.join(', ')}`);

		this._register((pError, pBeacon) =>
		{
			if (pError)
			{
				console.error(`[Beacon] Registration failed: ${pError.message}`);
				return fCallback(pError);
			}

			this._BeaconID = pBeacon.BeaconID;
			this._Running = true;

			console.log(`[Beacon] Registered as ${this._BeaconID}`);

			// Start polling for work
			this._PollInterval = setInterval(() =>
			{
				this._poll();
			}, this._Config.PollIntervalMs);

			// Start heartbeat
			this._HeartbeatInterval = setInterval(() =>
			{
				this._heartbeat();
			}, this._Config.HeartbeatIntervalMs);

			// Do an immediate poll
			this._poll();

			return fCallback(null, pBeacon);
		});
	}

	/**
	 * Stop the Beacon client: deregister and stop polling.
	 */
	stop(fCallback)
	{
		console.log(`[Beacon] Stopping...`);
		this._Running = false;

		if (this._PollInterval)
		{
			clearInterval(this._PollInterval);
			this._PollInterval = null;
		}

		if (this._HeartbeatInterval)
		{
			clearInterval(this._HeartbeatInterval);
			this._HeartbeatInterval = null;
		}

		if (this._BeaconID)
		{
			this._deregister((pError) =>
			{
				if (pError)
				{
					console.warn(`[Beacon] Deregistration warning: ${pError.message}`);
				}
				console.log(`[Beacon] Stopped.`);
				if (fCallback) return fCallback(null);
			});
		}
		else
		{
			console.log(`[Beacon] Stopped.`);
			if (fCallback) return fCallback(null);
		}
	}

	// ================================================================
	// Registration
	// ================================================================

	_register(fCallback)
	{
		let tmpBody = {
			Name: this._Config.Name,
			Capabilities: this._Config.Capabilities,
			MaxConcurrent: this._Config.MaxConcurrent,
			Tags: this._Config.Tags
		};

		this._httpRequest('POST', '/Beacon/Register', tmpBody, fCallback);
	}

	_deregister(fCallback)
	{
		this._httpRequest('DELETE', `/Beacon/${this._BeaconID}`, null, fCallback);
	}

	// ================================================================
	// Polling
	// ================================================================

	_poll()
	{
		if (!this._Running || !this._BeaconID)
		{
			return;
		}

		if (this._ActiveWorkItems >= this._Config.MaxConcurrent)
		{
			return;
		}

		this._httpRequest('POST', '/Beacon/Work/Poll', { BeaconID: this._BeaconID },
			(pError, pResponse) =>
			{
				if (pError)
				{
					// Silent on poll errors — just retry next interval
					return;
				}

				if (!pResponse || !pResponse.WorkItem)
				{
					// No work available
					return;
				}

				// Execute the work item
				this._executeWorkItem(pResponse.WorkItem);
			});
	}

	// ================================================================
	// Work Execution
	// ================================================================

	_executeWorkItem(pWorkItem)
	{
		this._ActiveWorkItems++;
		console.log(`[Beacon] Executing work item [${pWorkItem.WorkItemHash}] (${pWorkItem.Capability}/${pWorkItem.Action})`);

		this._Executor.execute(pWorkItem, (pError, pResult) =>
		{
			this._ActiveWorkItems--;

			if (pError)
			{
				console.error(`[Beacon] Execution error for [${pWorkItem.WorkItemHash}]: ${pError.message}`);
				this._reportError(pWorkItem.WorkItemHash, pError.message, []);
				return;
			}

			// Check if the result indicates an error (non-zero exit code)
			let tmpOutputs = pResult.Outputs || {};
			if (tmpOutputs.ExitCode && tmpOutputs.ExitCode !== 0)
			{
				console.warn(`[Beacon] Work item [${pWorkItem.WorkItemHash}] completed with exit code ${tmpOutputs.ExitCode}`);
			}
			else
			{
				console.log(`[Beacon] Work item [${pWorkItem.WorkItemHash}] completed successfully.`);
			}

			this._reportComplete(pWorkItem.WorkItemHash, tmpOutputs, pResult.Log || []);
		});
	}

	// ================================================================
	// Reporting
	// ================================================================

	_reportComplete(pWorkItemHash, pOutputs, pLog)
	{
		this._httpRequest('POST', `/Beacon/Work/${pWorkItemHash}/Complete`,
			{ Outputs: pOutputs, Log: pLog },
			(pError) =>
			{
				if (pError)
				{
					console.error(`[Beacon] Failed to report completion for [${pWorkItemHash}]: ${pError.message}`);
				}
			});
	}

	_reportError(pWorkItemHash, pErrorMessage, pLog)
	{
		this._httpRequest('POST', `/Beacon/Work/${pWorkItemHash}/Error`,
			{ ErrorMessage: pErrorMessage, Log: pLog },
			(pError) =>
			{
				if (pError)
				{
					console.error(`[Beacon] Failed to report error for [${pWorkItemHash}]: ${pError.message}`);
				}
			});
	}

	// ================================================================
	// Heartbeat
	// ================================================================

	_heartbeat()
	{
		if (!this._Running || !this._BeaconID)
		{
			return;
		}

		this._httpRequest('POST', `/Beacon/${this._BeaconID}/Heartbeat`, {},
			(pError) =>
			{
				if (pError)
				{
					console.warn(`[Beacon] Heartbeat failed: ${pError.message}`);
				}
			});
	}

	// ================================================================
	// HTTP Transport
	// ================================================================

	_httpRequest(pMethod, pPath, pBody, fCallback)
	{
		let tmpParsedURL = new URL(this._Config.ServerURL);
		let tmpOptions = {
			hostname: tmpParsedURL.hostname,
			port: tmpParsedURL.port || 80,
			path: pPath,
			method: pMethod,
			headers: {
				'Content-Type': 'application/json'
			}
		};

		let tmpReq = libHTTP.request(tmpOptions, (pResponse) =>
		{
			let tmpData = '';
			pResponse.on('data', (pChunk) => { tmpData += pChunk; });
			pResponse.on('end', () =>
			{
				try
				{
					let tmpParsed = JSON.parse(tmpData);
					if (pResponse.statusCode >= 400)
					{
						return fCallback(new Error(tmpParsed.Error || `HTTP ${pResponse.statusCode}`));
					}
					return fCallback(null, tmpParsed);
				}
				catch (pParseError)
				{
					return fCallback(new Error(`Invalid JSON response: ${tmpData.substring(0, 200)}`));
				}
			});
		});

		tmpReq.on('error', (pError) =>
		{
			return fCallback(pError);
		});

		if (pBody && (pMethod === 'POST' || pMethod === 'PUT'))
		{
			tmpReq.write(JSON.stringify(pBody));
		}

		tmpReq.end();
	}
}

module.exports = UltravisorBeaconClient;
