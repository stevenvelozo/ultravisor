const libPictService = require('pict-serviceproviderbase');

/**
 * Ultravisor Operation Auditor
 *
 * Cross-references beacon-dispatch nodes in registered operations against
 * the beacon action catalog (SettingsSchema) to find port-mapping bugs.
 *
 * Why this exists: Ultravisor resolves state-connection values into a
 * worker's Settings dict by extracting the port name from the substring
 * AFTER the last -ei-/-eo-/-si-/-so- in the port hash. That extracted
 * name becomes the settings key the worker receives. If the port hash
 * doesn't end with a key the worker actually reads, the value is silently
 * dropped and the worker falls back to its default — producing
 * confusing-but-non-fatal bugs that only surface as "wrong output".
 *
 * This auditor walks every registered operation and flags:
 *
 *   - TGT_PORT_NOT_IN_SCHEMA — a state connection's target port hash
 *     extracts to a name that is not in the target action's
 *     SettingsSchema. The value will be sent to the worker under a key
 *     the worker ignores.
 *
 *   - UNKNOWN_DATA_KEY — a beacon-dispatch node's static Data object
 *     contains a key that is not in the target action's SettingsSchema.
 *     Same problem: the worker never reads it.
 *
 *   - VALUE_INPUT_SRC_MISMATCH — a state connection whose source is a
 *     value-input node has a source port hash that does not extract to
 *     "InputValue" (which is the fixed output key for value-input).
 *
 *   - SRC_PORT_NOT_IN_SCHEMA (soft) — only reported when the source
 *     action publishes an OutputsSchema. Since the standard beacon
 *     registration only exposes input schemas, this is skipped unless
 *     an OutputsSchema has been added.
 *
 * Source-side mismatches (e.g. reading `output_file` when the worker
 * returns `video_file`) cannot be detected from the action catalog alone
 * because beacons do not publish output schemas. Runtime telemetry or a
 * caller-supplied map is required for full source-side coverage.
 *
 * @author Steven Velozo <steven@velozo.com>
 */
class UltravisorOperationAuditor extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		this.serviceType = 'UltravisorOperationAuditor';
	}

	/**
	 * Get a named Fable service or null if not registered.
	 */
	_getService(pTypeName)
	{
		return this.fable.servicesMap[pTypeName]
			? Object.values(this.fable.servicesMap[pTypeName])[0]
			: null;
	}

	/**
	 * Extract the logical port name from a port hash, mirroring
	 * Ultravisor-ExecutionEngine._extractPortName so the auditor reports
	 * what the real execution engine would actually resolve.
	 *
	 * @param {string} pPortHash - The port hash string.
	 * @param {object} [pPortLabelMap] - Optional hash -> label fallback map.
	 * @returns {string} The extracted port name, or '' if input is invalid.
	 */
	extractPortName(pPortHash, pPortLabelMap)
	{
		if (!pPortHash || typeof(pPortHash) !== 'string')
		{
			return '';
		}

		let tmpPrefixes = ['-ei-', '-eo-', '-si-', '-so-'];

		for (let i = 0; i < tmpPrefixes.length; i++)
		{
			let tmpIndex = pPortHash.lastIndexOf(tmpPrefixes[i]);
			if (tmpIndex > -1)
			{
				return pPortHash.substring(tmpIndex + tmpPrefixes[i].length);
			}
		}

		if (pPortLabelMap && pPortLabelMap[pPortHash])
		{
			return pPortLabelMap[pPortHash];
		}

		return pPortHash;
	}

	/**
	 * Build a fallback hash -> label lookup from a graph.
	 */
	_buildPortLabelMap(pGraph)
	{
		let tmpMap = {};
		let tmpNodes = (pGraph && pGraph.Nodes) || [];

		for (let i = 0; i < tmpNodes.length; i++)
		{
			let tmpPorts = tmpNodes[i].Ports || [];
			for (let j = 0; j < tmpPorts.length; j++)
			{
				tmpMap[tmpPorts[j].Hash] = tmpPorts[j].Label || tmpPorts[j].Hash;
			}
		}

		return tmpMap;
	}

	/**
	 * Index the beacon action catalog by "Capability/Action" for lookup.
	 * Returns a map where each value is the set of SettingsSchema field
	 * names the worker accepts.
	 *
	 * @returns {object} { "Capability/Action": Set<string> }
	 */
	_buildActionSchemaIndex()
	{
		let tmpIndex = {};
		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');

		if (!tmpCoordinator || typeof(tmpCoordinator.getActionCatalog) !== 'function')
		{
			return tmpIndex;
		}

		let tmpCatalog = tmpCoordinator.getActionCatalog();

		for (let i = 0; i < tmpCatalog.length; i++)
		{
			let tmpEntry = tmpCatalog[i];
			let tmpKey = `${tmpEntry.Capability}/${tmpEntry.Action}`;
			let tmpReads = new Set();

			let tmpSchema = tmpEntry.SettingsSchema || [];
			for (let j = 0; j < tmpSchema.length; j++)
			{
				let tmpField = tmpSchema[j];
				if (tmpField && tmpField.Name)
				{
					tmpReads.add(tmpField.Name);
				}
			}

			tmpIndex[tmpKey] = tmpReads;
		}

		return tmpIndex;
	}

	/**
	 * Meta keys that live inside a beacon-dispatch node's Data object but
	 * are NOT forwarded to the worker under their own name. Two categories:
	 *
	 *   1. Ultravisor-level meta consumed by Extension task config itself.
	 *      See Ultravisor-TaskConfigs-Extension.cjs. These identify
	 *      capability/action/timeout/affinity for the beacon dispatch
	 *      machinery before anything hits a worker.
	 *
	 *   2. Beacon-host meta consumed by retold-labs (or a similar beacon
	 *      provider) before the work item is sent to the Python worker.
	 *      The current example is `venv_path`, which retold-labs'
	 *      LibraryScanner injects into library-generated operations so
	 *      BeaconSetup._executeWorker can resolve a library-declared env
	 *      to a Python interpreter. BeaconSetup strips the key before
	 *      sending settings to the worker, so the worker never sees it
	 *      and its SettingsSchema never declares it.
	 *
	 * Auditor treats both categories as meta so they don't flag as
	 * UNKNOWN_DATA_KEY when present on a beacon-dispatch node.
	 */
	_getDispatchMetaKeys()
	{
		return new Set([
			// Ultravisor-level meta (Extension task config)
			'RemoteCapability',
			'RemoteAction',
			'AffinityKey',
			'TimeoutMs',
			'PromptMessage',
			'OutputAddress',
			'InputSchema',

			// Beacon-host meta (consumed by retold-labs before worker dispatch)
			'venv_path'
		]);
	}

	/**
	 * Audit a single operation definition.
	 *
	 * @param {object} pOperation - An operation definition (with .Graph).
	 * @param {object} pActionIndex - From _buildActionSchemaIndex().
	 * @returns {Array<object>} List of issue objects.
	 */
	auditOperation(pOperation, pActionIndex)
	{
		let tmpIssues = [];

		if (!pOperation || !pOperation.Graph)
		{
			return tmpIssues;
		}

		let tmpGraph = pOperation.Graph;
		let tmpNodes = tmpGraph.Nodes || [];
		let tmpConnections = tmpGraph.Connections || [];
		let tmpPortLabelMap = this._buildPortLabelMap(tmpGraph);
		let tmpMetaKeys = this._getDispatchMetaKeys();

		// Index nodes and build a dispatch-node map with action + reads
		let tmpNodesByHash = {};
		let tmpDispatchNodes = {};

		for (let i = 0; i < tmpNodes.length; i++)
		{
			let tmpNode = tmpNodes[i];
			tmpNodesByHash[tmpNode.Hash] = tmpNode;

			if (tmpNode.Type === 'beacon-dispatch')
			{
				let tmpData = tmpNode.Data || {};
				let tmpCap = tmpData.RemoteCapability || '';
				let tmpAction = tmpData.RemoteAction || '';
				let tmpKey = `${tmpCap}/${tmpAction}`;
				let tmpReads = pActionIndex[tmpKey] || null;

				tmpDispatchNodes[tmpNode.Hash] = {
					Node: tmpNode,
					Capability: tmpCap,
					Action: tmpAction,
					CatalogKey: tmpKey,
					Reads: tmpReads,
					HasSchema: !!tmpReads
				};

				// If the action isn't in the catalog, the auditor has no ground
				// truth for this node — emit a skip notice so callers understand
				// why nothing else was flagged here.
				if (!tmpReads)
				{
					tmpIssues.push(
						{
							Kind: 'ACTION_NOT_IN_CATALOG',
							Severity: 'info',
							Node: tmpNode.Hash,
							NodeTitle: tmpNode.Title || '',
							CatalogKey: tmpKey,
							Detail: `Capability/Action [${tmpKey}] is not in the beacon action catalog; no schema is available to audit this node against. Connect the providing beacon to populate the catalog, then re-run.`
						});
				}
				else
				{
					// Check static Data keys against the worker's reads
					let tmpDataKeys = Object.keys(tmpData);
					for (let k = 0; k < tmpDataKeys.length; k++)
					{
						let tmpKeyName = tmpDataKeys[k];
						if (tmpMetaKeys.has(tmpKeyName))
						{
							continue;
						}
						if (!tmpReads.has(tmpKeyName))
						{
							tmpIssues.push(
								{
									Kind: 'UNKNOWN_DATA_KEY',
									Severity: 'warning',
									Node: tmpNode.Hash,
									NodeTitle: tmpNode.Title || '',
									CatalogKey: tmpKey,
									Key: tmpKeyName,
									Detail: `Node Data contains '${tmpKeyName}' which ${tmpKey} does not declare in its SettingsSchema; the worker will ignore it.`
								});
						}
					}
				}
			}
		}

		// Check every state connection
		for (let i = 0; i < tmpConnections.length; i++)
		{
			let tmpConn = tmpConnections[i];
			if (tmpConn.ConnectionType !== 'state')
			{
				continue;
			}

			let tmpSrcNodeHash = tmpConn.SourceNodeHash || '';
			let tmpTgtNodeHash = tmpConn.TargetNodeHash || '';
			let tmpSrcPortHash = tmpConn.SourcePortHash || '';
			let tmpTgtPortHash = tmpConn.TargetPortHash || '';

			let tmpSrcName = this.extractPortName(tmpSrcPortHash, tmpPortLabelMap);
			let tmpTgtName = this.extractPortName(tmpTgtPortHash, tmpPortLabelMap);
			let tmpConnHash = tmpConn.Hash || '(unnamed)';

			// Target side: resolved name must be in the target action's SettingsSchema
			let tmpTgtDispatch = tmpDispatchNodes[tmpTgtNodeHash];
			if (tmpTgtDispatch && tmpTgtDispatch.HasSchema)
			{
				if (!tmpTgtDispatch.Reads.has(tmpTgtName))
				{
					tmpIssues.push(
						{
							Kind: 'TGT_PORT_NOT_IN_SCHEMA',
							Severity: 'error',
							Connection: tmpConnHash,
							TargetNode: tmpTgtNodeHash,
							CatalogKey: tmpTgtDispatch.CatalogKey,
							TargetPort: tmpTgtPortHash,
							ExtractedName: tmpTgtName,
							Detail: `Target port hash extracts to '${tmpTgtName}' but ${tmpTgtDispatch.CatalogKey} does not declare that field in its SettingsSchema; the state value will be delivered under a key the worker ignores.`
						});
				}
			}

			// Source side: value-input nodes always emit under "InputValue"
			let tmpSrcNode = tmpNodesByHash[tmpSrcNodeHash];
			if (tmpSrcNode && tmpSrcNode.Type === 'value-input')
			{
				if (tmpSrcName !== 'InputValue')
				{
					tmpIssues.push(
						{
							Kind: 'VALUE_INPUT_SRC_MISMATCH',
							Severity: 'error',
							Connection: tmpConnHash,
							SourceNode: tmpSrcNodeHash,
							SourcePort: tmpSrcPortHash,
							ExtractedName: tmpSrcName,
							Detail: `Source is a value-input node; source port should extract to 'InputValue' but extracts to '${tmpSrcName}'. The connection will read undefined.`
						});
				}
			}
		}

		return tmpIssues;
	}

	/**
	 * Audit every operation currently registered in HypervisorState.
	 *
	 * @param {function} fCallback - (pError, pReport)
	 *   where pReport = {
	 *     AuditedAt: ISO timestamp,
	 *     OperationCount: number,
	 *     IssueCount: number,
	 *     ActionCatalogSize: number,
	 *     Operations: [ { Hash, Name, IssueCount, Issues } ],
	 *     WorstByKind: { KIND: count }
	 *   }
	 */
	auditAll(fCallback)
	{
		let tmpState = this._getService('UltravisorHypervisorState');
		if (!tmpState)
		{
			return fCallback(new Error('UltravisorHypervisorState service not available.'));
		}

		let tmpActionIndex = this._buildActionSchemaIndex();
		let tmpActionCatalogSize = Object.keys(tmpActionIndex).length;

		tmpState.getOperationList(
			(pError, pOperations) =>
			{
				if (pError)
				{
					return fCallback(pError);
				}

				let tmpOperations = [];
				let tmpTotalIssues = 0;
				let tmpWorstByKind = {};

				for (let i = 0; i < pOperations.length; i++)
				{
					let tmpOp = pOperations[i];
					let tmpIssues = this.auditOperation(tmpOp, tmpActionIndex);
					tmpTotalIssues += tmpIssues.length;

					for (let j = 0; j < tmpIssues.length; j++)
					{
						let tmpKind = tmpIssues[j].Kind;
						tmpWorstByKind[tmpKind] = (tmpWorstByKind[tmpKind] || 0) + 1;
					}

					tmpOperations.push(
						{
							Hash: tmpOp.Hash,
							Name: tmpOp.Name || '',
							IssueCount: tmpIssues.length,
							Issues: tmpIssues
						});
				}

				// Sort: worst first, then by name
				tmpOperations.sort(
					(a, b) =>
					{
						if (b.IssueCount !== a.IssueCount) return b.IssueCount - a.IssueCount;
						return (a.Name || a.Hash).localeCompare(b.Name || b.Hash);
					});

				let tmpReport =
				{
					AuditedAt: new Date().toISOString(),
					OperationCount: pOperations.length,
					IssueCount: tmpTotalIssues,
					ActionCatalogSize: tmpActionCatalogSize,
					WorstByKind: tmpWorstByKind,
					Operations: tmpOperations
				};

				this.log.info(`OperationAuditor: scanned ${pOperations.length} operations, found ${tmpTotalIssues} issue(s).`);

				return fCallback(null, tmpReport);
			});
	}

	/**
	 * Audit a single operation by hash.
	 *
	 * @param {string} pHash - Operation hash.
	 * @param {function} fCallback - (pError, pResult)
	 */
	auditByHash(pHash, fCallback)
	{
		let tmpState = this._getService('UltravisorHypervisorState');
		if (!tmpState)
		{
			return fCallback(new Error('UltravisorHypervisorState service not available.'));
		}

		tmpState.getOperation(pHash,
			(pError, pOperation) =>
			{
				if (pError)
				{
					return fCallback(pError);
				}

				let tmpActionIndex = this._buildActionSchemaIndex();
				let tmpIssues = this.auditOperation(pOperation, tmpActionIndex);

				return fCallback(null,
					{
						AuditedAt: new Date().toISOString(),
						Hash: pOperation.Hash,
						Name: pOperation.Name || '',
						IssueCount: tmpIssues.length,
						ActionCatalogSize: Object.keys(tmpActionIndex).length,
						Issues: tmpIssues
					});
			});
	}
}

module.exports = UltravisorOperationAuditor;
module.exports.serviceType = 'UltravisorOperationAuditor';
module.exports.default_configuration = {};
