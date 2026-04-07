/**
 * Ultravisor Beacon Reachability Service
 *
 * Manages the connectivity matrix between beacon pairs.  When beacons
 * register, they report BindAddresses (IP + port).  This service probes
 * pairs with a lightweight HTTP GET and caches the result so the
 * resolve-address card can choose a transfer strategy (local / direct /
 * proxy).
 *
 * Matrix entries expire after a configurable TTL (default 15 minutes)
 * and are re-probed on the next request or periodic sweep.
 *
 * @module Ultravisor-Beacon-Reachability
 */

const libHTTP = require('http');
const libPictService = require('pict-serviceproviderbase');

class UltravisorBeaconReachability extends libPictService
{
	constructor(pPict, pOptions, pServiceHash)
	{
		super(pPict, pOptions, pServiceHash);

		// --- Reachability Matrix ---
		// Key: "srcBeaconID::tgtBeaconID"  (directional)
		// Value: matrix entry object
		this._Matrix = {};

		// Cache TTL — entries older than this are treated as expired
		this._TTLMs = 15 * 60 * 1000; // 15 minutes

		// Per-probe TCP/HTTP timeout
		this._ProbeTimeoutMs = 5000;
	}

	// ================================================================
	// Internal helpers
	// ================================================================

	/**
	 * Get a named service from the Fable services map.
	 */
	_getService(pTypeName)
	{
		return this.fable.servicesMap[pTypeName]
			? Object.values(this.fable.servicesMap[pTypeName])[0]
			: null;
	}

	/**
	 * Build the matrix key for a directed pair.
	 */
	_key(pSourceID, pTargetID)
	{
		return `${pSourceID}::${pTargetID}`;
	}

	/**
	 * Check whether a matrix entry has expired.
	 */
	_isExpired(pEntry)
	{
		if (!pEntry || !pEntry.LastProbeAt)
		{
			return true;
		}
		let tmpAge = Date.now() - new Date(pEntry.LastProbeAt).getTime();
		return tmpAge > this._TTLMs;
	}

	/**
	 * Build a probe URL from a beacon's first BindAddress.
	 *
	 * @param {object} pBeacon - Beacon record
	 * @returns {string|null} URL to probe, or null if no BindAddress
	 */
	_buildProbeURL(pBeacon)
	{
		let tmpAddresses = pBeacon.BindAddresses;
		if (!Array.isArray(tmpAddresses) || tmpAddresses.length === 0)
		{
			return null;
		}

		let tmpAddr = tmpAddresses[0];
		let tmpProtocol = tmpAddr.Protocol || 'http';
		let tmpIP = tmpAddr.IP;
		let tmpPort = tmpAddr.Port;

		if (!tmpIP || !tmpPort)
		{
			return null;
		}

		return `${tmpProtocol}://${tmpIP}:${tmpPort}/`;
	}

	// ================================================================
	// Public API — Matrix Access
	// ================================================================

	/**
	 * Return the full matrix as an array of entry objects.
	 *
	 * @returns {object[]}
	 */
	getMatrix()
	{
		return Object.values(this._Matrix);
	}

	/**
	 * Return the reachability entry for a directed pair.
	 *
	 * @param {string} pSourceID
	 * @param {string} pTargetID
	 * @returns {object} Matrix entry or a synthetic 'untested' stub
	 */
	getReachability(pSourceID, pTargetID)
	{
		let tmpKey = this._key(pSourceID, pTargetID);
		if (this._Matrix[tmpKey])
		{
			return this._Matrix[tmpKey];
		}

		return {
			SourceBeaconID: pSourceID,
			TargetBeaconID: pTargetID,
			Status: 'untested',
			ProbeLatencyMs: null,
			LastProbeAt: null,
			ProbeURL: ''
		};
	}

	// ================================================================
	// Probing
	// ================================================================

	/**
	 * Probe connectivity from the Ultravisor host to a target beacon's
	 * BindAddress.  Records the result in the matrix.
	 *
	 * The probe is a simple HTTP GET with a short timeout.  Any HTTP
	 * response (even 404) counts as "reachable" — we're testing
	 * network-level connectivity, not service correctness.
	 *
	 * @param {string} pSourceBeaconID - The beacon that would initiate a transfer
	 * @param {string} pTargetBeaconID - The beacon whose address we probe
	 * @param {Function} fCallback - function(pError, pEntry)
	 */
	probeBeaconPair(pSourceBeaconID, pTargetBeaconID, fCallback)
	{
		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
		if (!tmpCoordinator)
		{
			return fCallback(new Error('BeaconCoordinator service not available.'));
		}

		let tmpTargetBeacon = tmpCoordinator.getBeacon(pTargetBeaconID);
		if (!tmpTargetBeacon)
		{
			return fCallback(new Error(`Target beacon [${pTargetBeaconID}] not found.`));
		}

		let tmpProbeURL = this._buildProbeURL(tmpTargetBeacon);
		if (!tmpProbeURL)
		{
			// No bind address — record as unreachable (no address to probe)
			let tmpKey = this._key(pSourceBeaconID, pTargetBeaconID);
			this._Matrix[tmpKey] = {
				SourceBeaconID: pSourceBeaconID,
				TargetBeaconID: pTargetBeaconID,
				Status: 'unreachable',
				ProbeLatencyMs: null,
				LastProbeAt: new Date().toISOString(),
				ProbeURL: ''
			};
			return fCallback(null, this._Matrix[tmpKey]);
		}

		let tmpStartTime = Date.now();
		let tmpKey = this._key(pSourceBeaconID, pTargetBeaconID);

		let tmpRequest = libHTTP.get(tmpProbeURL, (pResponse) =>
		{
			// Any response means the host is reachable
			let tmpLatency = Date.now() - tmpStartTime;

			// Drain the response so the socket is released
			pResponse.resume();

			this._Matrix[tmpKey] = {
				SourceBeaconID: pSourceBeaconID,
				TargetBeaconID: pTargetBeaconID,
				Status: 'reachable',
				ProbeLatencyMs: tmpLatency,
				LastProbeAt: new Date().toISOString(),
				ProbeURL: tmpProbeURL
			};

			this.log.info(`BeaconReachability: ${pSourceBeaconID} → ${pTargetBeaconID} REACHABLE (${tmpLatency}ms) via ${tmpProbeURL}`);
			return fCallback(null, this._Matrix[tmpKey]);
		});

		tmpRequest.on('error', (pError) =>
		{
			let tmpLatency = Date.now() - tmpStartTime;

			this._Matrix[tmpKey] = {
				SourceBeaconID: pSourceBeaconID,
				TargetBeaconID: pTargetBeaconID,
				Status: 'unreachable',
				ProbeLatencyMs: tmpLatency,
				LastProbeAt: new Date().toISOString(),
				ProbeURL: tmpProbeURL
			};

			this.log.info(`BeaconReachability: ${pSourceBeaconID} → ${pTargetBeaconID} UNREACHABLE (${pError.message}) via ${tmpProbeURL}`);
			return fCallback(null, this._Matrix[tmpKey]);
		});

		tmpRequest.setTimeout(this._ProbeTimeoutMs, () =>
		{
			tmpRequest.destroy(new Error('Probe timed out'));
		});
	}

	/**
	 * Probe all online beacon pairs that have expired or untested entries.
	 *
	 * Probes run sequentially to avoid thundering herd.
	 *
	 * @param {Function} fCallback - function(pError, pMatrix)
	 */
	probeAllPairs(fCallback)
	{
		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
		if (!tmpCoordinator)
		{
			return fCallback(new Error('BeaconCoordinator service not available.'));
		}

		let tmpBeacons = tmpCoordinator.listBeacons();
		let tmpOnline = tmpBeacons.filter(function (pB) { return pB.Status === 'Online'; });

		// Build list of pairs that need probing
		let tmpPairs = [];
		for (let i = 0; i < tmpOnline.length; i++)
		{
			for (let j = 0; j < tmpOnline.length; j++)
			{
				if (i === j)
				{
					continue;
				}

				let tmpKey = this._key(tmpOnline[i].BeaconID, tmpOnline[j].BeaconID);
				let tmpEntry = this._Matrix[tmpKey];

				if (!tmpEntry || this._isExpired(tmpEntry))
				{
					tmpPairs.push({
						SourceBeaconID: tmpOnline[i].BeaconID,
						TargetBeaconID: tmpOnline[j].BeaconID
					});
				}
			}
		}

		if (tmpPairs.length === 0)
		{
			return fCallback(null, this.getMatrix());
		}

		this.log.info(`BeaconReachability: probing ${tmpPairs.length} beacon pair(s)...`);

		let tmpIndex = 0;
		let tmpProbeNext = () =>
		{
			if (tmpIndex >= tmpPairs.length)
			{
				return fCallback(null, this.getMatrix());
			}

			let tmpPair = tmpPairs[tmpIndex];
			tmpIndex++;

			this.probeBeaconPair(tmpPair.SourceBeaconID, tmpPair.TargetBeaconID, (pError) =>
			{
				// Errors are recorded in the matrix — keep going
				tmpProbeNext();
			});
		};

		tmpProbeNext();
	}

	/**
	 * Called when a beacon registers or reconnects.  Probes the new
	 * beacon against all other online beacons (both directions).
	 *
	 * Runs asynchronously — fire and forget.
	 *
	 * @param {string} pBeaconID
	 */
	onBeaconRegistered(pBeaconID)
	{
		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
		if (!tmpCoordinator)
		{
			return;
		}

		let tmpBeacons = tmpCoordinator.listBeacons();
		let tmpOnline = tmpBeacons.filter(function (pB)
		{
			return pB.Status === 'Online' && pB.BeaconID !== pBeaconID;
		});

		if (tmpOnline.length === 0)
		{
			return;
		}

		this.log.info(`BeaconReachability: probing new beacon [${pBeaconID}] against ${tmpOnline.length} peer(s)...`);

		let tmpPairs = [];
		for (let i = 0; i < tmpOnline.length; i++)
		{
			tmpPairs.push({ SourceBeaconID: pBeaconID, TargetBeaconID: tmpOnline[i].BeaconID });
			tmpPairs.push({ SourceBeaconID: tmpOnline[i].BeaconID, TargetBeaconID: pBeaconID });
		}

		let tmpIndex = 0;
		let tmpProbeNext = () =>
		{
			if (tmpIndex >= tmpPairs.length)
			{
				return;
			}

			let tmpPair = tmpPairs[tmpIndex];
			tmpIndex++;

			this.probeBeaconPair(tmpPair.SourceBeaconID, tmpPair.TargetBeaconID, () =>
			{
				tmpProbeNext();
			});
		};

		tmpProbeNext();
	}

	// ================================================================
	// Strategy Resolution
	// ================================================================

	/**
	 * Determine the transfer strategy between a source beacon (file
	 * owner) and a requesting beacon (the one that needs the file).
	 *
	 * Strategy ordering (most efficient first):
	 *   local      — same beacon, no transport at all
	 *   shared-fs  — different beacons but on the same host with overlapping
	 *                filesystem mounts, so the requesting beacon can read the
	 *                source's file path directly with no copy
	 *   direct     — HTTP fetch from the source beacon's bind address
	 *   proxy      — HTTP fetch via the coordinator
	 *
	 * @param {string} pSourceBeaconID - Beacon that owns the resource
	 * @param {string} pRequestingBeaconID - Beacon that wants the resource
	 * @returns {object} { Strategy, DirectURL, SharedMountRoot? }
	 */
	resolveStrategy(pSourceBeaconID, pRequestingBeaconID)
	{
		// Same beacon — local transfer
		if (pSourceBeaconID === pRequestingBeaconID)
		{
			return { Strategy: 'local', DirectURL: '' };
		}

		let tmpCoordinator = this._getService('UltravisorBeaconCoordinator');
		if (!tmpCoordinator)
		{
			return { Strategy: 'proxy', DirectURL: '' };
		}

		let tmpSourceBeacon = tmpCoordinator.getBeacon(pSourceBeaconID);
		if (!tmpSourceBeacon)
		{
			return { Strategy: 'proxy', DirectURL: '' };
		}

		// Shared-fs detection — check whether both beacons live on the same host
		// AND advertise at least one shared filesystem mount in common. When they
		// do, the requesting beacon can read the source file directly from the
		// shared mount without an HTTP transfer.
		let tmpRequestingBeacon = tmpCoordinator.getBeacon(pRequestingBeaconID);
		if (tmpRequestingBeacon
			&& tmpSourceBeacon.HostID
			&& tmpRequestingBeacon.HostID
			&& tmpSourceBeacon.HostID === tmpRequestingBeacon.HostID)
		{
			let tmpSharedMount = this._findSharedMount(
				tmpSourceBeacon.SharedMounts, tmpRequestingBeacon.SharedMounts);
			if (tmpSharedMount)
			{
				return {
					Strategy: 'shared-fs',
					DirectURL: '',
					SharedMountRoot: tmpSharedMount.Root
				};
			}
		}

		// Check matrix
		let tmpEntry = this.getReachability(pRequestingBeaconID, pSourceBeaconID);

		if (tmpEntry.Status === 'reachable')
		{
			let tmpDirectURL = this._buildProbeURL(tmpSourceBeacon);
			return { Strategy: 'direct', DirectURL: tmpDirectURL || '' };
		}

		// unreachable or untested — fall back to proxy
		return { Strategy: 'proxy', DirectURL: '' };
	}

	/**
	 * Find the first MountID that appears in both beacons' SharedMounts arrays.
	 *
	 * The MountID is derived from `stat.dev` + the resolved root path on the
	 * beacon side, so two beacons that bind-mount the same host directory get
	 * the same ID, while two unrelated /media directories on different machines
	 * (or in different containers without shared mounts) get different IDs.
	 *
	 * @param {Array} pSourceMounts - SharedMounts reported by the source beacon
	 * @param {Array} pRequestingMounts - SharedMounts reported by the requester
	 * @returns {object|null} The matching mount entry from the source beacon,
	 *                        or null if no overlap exists
	 */
	_findSharedMount(pSourceMounts, pRequestingMounts)
	{
		if (!Array.isArray(pSourceMounts) || pSourceMounts.length === 0)
		{
			return null;
		}
		if (!Array.isArray(pRequestingMounts) || pRequestingMounts.length === 0)
		{
			return null;
		}
		for (let i = 0; i < pSourceMounts.length; i++)
		{
			let tmpSrc = pSourceMounts[i];
			if (!tmpSrc || !tmpSrc.MountID)
			{
				continue;
			}
			for (let j = 0; j < pRequestingMounts.length; j++)
			{
				let tmpReq = pRequestingMounts[j];
				if (!tmpReq || !tmpReq.MountID)
				{
					continue;
				}
				if (tmpSrc.MountID === tmpReq.MountID)
				{
					return tmpSrc;
				}
			}
		}
		return null;
	}
}

module.exports = UltravisorBeaconReachability;
