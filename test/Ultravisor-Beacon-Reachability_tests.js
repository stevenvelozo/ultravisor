/**
 * Unit tests for the UltravisorBeaconReachability service, specifically the
 * shared-fs reachability strategy (findSharedFsPeer + resolveStrategy).
 *
 * These tests exist to catch regressions in the logic that decides whether
 * two beacons can skip the HTTP file-transfer layer because they share a
 * filesystem on the same host. The shared-fs optimization is nearly invisible
 * when it works (you just see faster thumbnails) and almost invisible when it
 * silently stops working (you see slower thumbnails and a lot more bandwidth).
 * The only way to catch regressions early is to assert the branch behavior
 * of `findSharedFsPeer` and `resolveStrategy` directly, with mocked coordinator
 * state standing in for a real running Ultravisor.
 *
 * Test layout:
 *
 *   findSharedFsPeer
 *     - positive match: two beacons, same host, overlapping mount → MATCH
 *     - negative: source beacon missing HostID (legacy) → null
 *     - negative: source beacon has empty SharedMounts → null
 *     - negative: source beacon missing entirely → null
 *     - negative: no coordinator service registered → null
 *     - negative: only the source beacon exists (no peers) → null
 *     - negative: peer on different host → null
 *     - negative: peer on same host but no overlapping MountID → null
 *     - negative: peer is Offline → null
 *     - positive: multiple peers, one matches → MATCH (first match wins)
 *
 *   resolveStrategy
 *     - local (same beacon) → Strategy: local
 *     - shared-fs (same host, overlapping mount) → Strategy: shared-fs + root
 *     - direct (different host, reachable matrix) → Strategy: direct
 *     - proxy fallback (matrix says unreachable/untested) → Strategy: proxy
 *
 *   _findSharedMount
 *     - helper-level tests for the pure mount-overlap logic
 */

const libPict = require('pict');
const libUltravisorBeaconReachability = require('../source/services/Ultravisor-Beacon-Reachability.cjs');

var Chai = require('chai');
var Expect = Chai.expect;

/**
 * Build a Pict instance with a MOCK BeaconCoordinator and the real
 * Reachability service. The coordinator mock exposes the same two methods
 * (getBeacon, listBeacons) that Reachability consumes, so we can construct
 * arbitrary beacon topologies without spinning up the real coordinator.
 *
 * @param {Object<string, object>} pBeacons - Keyed by BeaconID
 * @returns {{ fable, reachability, coordinator }}
 */
function _buildTestHarness(pBeacons)
{
	let tmpFable = new libPict(
		{
			Product: 'Ultravisor-Test-Reachability',
			LogLevel: 5
		});

	// Mock coordinator — just enough surface area for Reachability to work.
	let tmpMockCoordinator =
		{
			serviceType: 'UltravisorBeaconCoordinator',
			Hash: 'MockCoordinator',
			_Beacons: pBeacons || {},
			getBeacon: function (pBeaconID)
			{
				return this._Beacons[pBeaconID] || null;
			},
			listBeacons: function ()
			{
				return Object.values(this._Beacons);
			},
			setBeacons: function (pNewBeacons)
			{
				this._Beacons = pNewBeacons || {};
			}
		};

	// Register the mock under the same name Reachability expects.
	if (!tmpFable.servicesMap['UltravisorBeaconCoordinator'])
	{
		tmpFable.servicesMap['UltravisorBeaconCoordinator'] = {};
	}
	tmpFable.servicesMap['UltravisorBeaconCoordinator'][tmpMockCoordinator.Hash] = tmpMockCoordinator;

	// Instantiate the real Reachability service.
	tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconReachability', libUltravisorBeaconReachability);
	let tmpReachability = Object.values(tmpFable.servicesMap['UltravisorBeaconReachability'])[0];

	return {
		fable: tmpFable,
		reachability: tmpReachability,
		coordinator: tmpMockCoordinator
	};
}

/**
 * Helper: build a fake beacon record. Anything not specified defaults to the
 * "typical online beacon on host-alpha with one shared mount" shape.
 */
function _beacon(pOverrides)
{
	let tmpBase =
		{
			BeaconID: 'bcn-default',
			Name: 'default',
			Status: 'Online',
			HostID: 'host-alpha',
			SharedMounts: [{ MountID: 'mnt-1', Root: '/data' }],
			Contexts: { File: { BasePath: '/data', BaseURL: '/content/' } },
			BindAddresses: [{ IP: '10.0.0.2', Port: 7777, Protocol: 'http' }]
		};
	return Object.assign(tmpBase, pOverrides || {});
}

suite
(
	'Ultravisor Beacon Reachability',
	function ()
	{
		// ================================================================
		// findSharedFsPeer
		// ================================================================
		suite
		(
			'findSharedFsPeer',
			function ()
			{
				test
				(
					'returns null when the coordinator service is not registered',
					function ()
					{
						let tmpFable = new libPict({ Product: 'Ultravisor-Test-Reachability', LogLevel: 5 });
						// Note: NO coordinator registered — simulate a broken test harness
						tmpFable.addAndInstantiateServiceTypeIfNotExists('UltravisorBeaconReachability', libUltravisorBeaconReachability);
						let tmpReachability = Object.values(tmpFable.servicesMap['UltravisorBeaconReachability'])[0];

						Expect(tmpReachability.findSharedFsPeer('bcn-whatever')).to.equal(null);
					}
				);

				test
				(
					'returns null when the source beacon is not in the coordinator registry',
					function ()
					{
						let tmpHarness = _buildTestHarness({});
						Expect(tmpHarness.reachability.findSharedFsPeer('bcn-ghost')).to.equal(null);
					}
				);

				test
				(
					'returns null when the source beacon has no HostID (legacy beacon)',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-legacy': _beacon({ BeaconID: 'bcn-legacy', HostID: null }),
								'bcn-peer': _beacon({ BeaconID: 'bcn-peer', HostID: 'host-alpha' })
							});
						Expect(tmpHarness.reachability.findSharedFsPeer('bcn-legacy')).to.equal(null);
					}
				);

				test
				(
					'returns null when the source beacon has an empty SharedMounts array',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-empty': _beacon({ BeaconID: 'bcn-empty', SharedMounts: [] }),
								'bcn-peer': _beacon({ BeaconID: 'bcn-peer' })
							});
						Expect(tmpHarness.reachability.findSharedFsPeer('bcn-empty')).to.equal(null);
					}
				);

				test
				(
					'returns null when only the source beacon is registered (no peers at all)',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-lonely': _beacon({ BeaconID: 'bcn-lonely' })
							});
						Expect(tmpHarness.reachability.findSharedFsPeer('bcn-lonely')).to.equal(null);
					}
				);

				test
				(
					'returns null when the peer is on a different host',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-source': _beacon({ BeaconID: 'bcn-source', HostID: 'host-alpha' }),
								'bcn-remote': _beacon({ BeaconID: 'bcn-remote', HostID: 'host-beta' })
							});
						Expect(tmpHarness.reachability.findSharedFsPeer('bcn-source')).to.equal(null);
					}
				);

				test
				(
					'returns null when the peer shares a host but has no overlapping MountID',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-source': _beacon(
									{
										BeaconID: 'bcn-source',
										SharedMounts: [{ MountID: 'mnt-alpha', Root: '/data-alpha' }]
									}),
								'bcn-peer': _beacon(
									{
										BeaconID: 'bcn-peer',
										SharedMounts: [{ MountID: 'mnt-beta', Root: '/data-beta' }]
									})
							});
						Expect(tmpHarness.reachability.findSharedFsPeer('bcn-source')).to.equal(null);
					}
				);

				test
				(
					'returns null when the only matching peer is Offline',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-source': _beacon({ BeaconID: 'bcn-source' }),
								'bcn-dead': _beacon({ BeaconID: 'bcn-dead', Status: 'Offline' })
							});
						Expect(tmpHarness.reachability.findSharedFsPeer('bcn-source')).to.equal(null);
					}
				);

				test
				(
					'returns a MATCH when a peer shares host and MountID (happy path)',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-retold-remote': _beacon({ BeaconID: 'bcn-retold-remote' }),
								'bcn-orator-conversion': _beacon({ BeaconID: 'bcn-orator-conversion' })
							});
						let tmpResult = tmpHarness.reachability.findSharedFsPeer('bcn-retold-remote');
						Expect(tmpResult).to.not.equal(null);
						Expect(tmpResult.Peer.BeaconID).to.equal('bcn-orator-conversion');
						Expect(tmpResult.Mount.MountID).to.equal('mnt-1');
						Expect(tmpResult.Mount.Root).to.equal('/data');
					}
				);

				test
				(
					'returns the first MATCH when multiple peers share host+mount',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-source': _beacon({ BeaconID: 'bcn-source' }),
								'bcn-peer-1': _beacon({ BeaconID: 'bcn-peer-1' }),
								'bcn-peer-2': _beacon({ BeaconID: 'bcn-peer-2' })
							});
						let tmpResult = tmpHarness.reachability.findSharedFsPeer('bcn-source');
						Expect(tmpResult).to.not.equal(null);
						// Whichever peer is first in listBeacons iteration order wins — we
						// don't care which; we just care that SOMETHING matched.
						Expect(['bcn-peer-1', 'bcn-peer-2']).to.include(tmpResult.Peer.BeaconID);
					}
				);

				test
				(
					'does not match the source beacon against itself',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-solo': _beacon({ BeaconID: 'bcn-solo' })
							});
						// With only the source beacon in the registry, no match.
						Expect(tmpHarness.reachability.findSharedFsPeer('bcn-solo')).to.equal(null);
					}
				);

				test
				(
					'finds a peer when source has multiple mounts and at least one overlaps',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-source': _beacon(
									{
										BeaconID: 'bcn-source',
										SharedMounts: [
											{ MountID: 'mnt-content', Root: '/media' },
											{ MountID: 'mnt-cache', Root: '/cache' },
											{ MountID: 'mnt-config', Root: '/config' }
										]
									}),
								'bcn-peer': _beacon(
									{
										BeaconID: 'bcn-peer',
										SharedMounts: [
											{ MountID: 'mnt-cache', Root: '/cache' }
										]
									})
							});
						let tmpResult = tmpHarness.reachability.findSharedFsPeer('bcn-source');
						Expect(tmpResult).to.not.equal(null);
						Expect(tmpResult.Mount.MountID).to.equal('mnt-cache');
						Expect(tmpResult.Mount.Root).to.equal('/cache');
					}
				);
			}
		);

		// ================================================================
		// resolveStrategy
		// ================================================================
		suite
		(
			'resolveStrategy',
			function ()
			{
				test
				(
					'returns Strategy=local when source and requesting beacon are the same',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-only': _beacon({ BeaconID: 'bcn-only' })
							});
						let tmpResult = tmpHarness.reachability.resolveStrategy('bcn-only', 'bcn-only');
						Expect(tmpResult.Strategy).to.equal('local');
					}
				);

				test
				(
					'returns Strategy=shared-fs when beacons share host+mount',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-source': _beacon({ BeaconID: 'bcn-source' }),
								'bcn-consumer': _beacon({ BeaconID: 'bcn-consumer' })
							});
						let tmpResult = tmpHarness.reachability.resolveStrategy('bcn-source', 'bcn-consumer');
						Expect(tmpResult.Strategy).to.equal('shared-fs');
						Expect(tmpResult.SharedMountRoot).to.equal('/data');
					}
				);

				test
				(
					'returns Strategy=proxy when beacons are on different hosts and reachability is untested',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-source': _beacon({ BeaconID: 'bcn-source', HostID: 'host-alpha' }),
								'bcn-remote': _beacon({ BeaconID: 'bcn-remote', HostID: 'host-beta' })
							});
						// Untested matrix → falls through to proxy
						let tmpResult = tmpHarness.reachability.resolveStrategy('bcn-source', 'bcn-remote');
						Expect(tmpResult.Strategy).to.equal('proxy');
					}
				);

				test
				(
					'returns Strategy=direct when the matrix says the pair is reachable',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-source': _beacon({ BeaconID: 'bcn-source', HostID: 'host-alpha' }),
								'bcn-remote': _beacon({ BeaconID: 'bcn-remote', HostID: 'host-beta' })
							});
						// Stub the reachability matrix to say these two CAN reach each other
						tmpHarness.reachability.getReachability = function ()
						{
							return { Status: 'reachable' };
						};
						let tmpResult = tmpHarness.reachability.resolveStrategy('bcn-source', 'bcn-remote');
						Expect(tmpResult.Strategy).to.equal('direct');
						Expect(tmpResult.DirectURL).to.be.a('string');
					}
				);

				test
				(
					'returns Strategy=proxy when the source beacon does not exist in the registry',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-requestor': _beacon({ BeaconID: 'bcn-requestor' })
							});
						let tmpResult = tmpHarness.reachability.resolveStrategy('bcn-vanished', 'bcn-requestor');
						Expect(tmpResult.Strategy).to.equal('proxy');
					}
				);

				test
				(
					'prefers shared-fs over direct when both are possible',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-source': _beacon({ BeaconID: 'bcn-source' }),
								'bcn-consumer': _beacon({ BeaconID: 'bcn-consumer' })
							});
						// Even if the matrix says they're reachable via HTTP, shared-fs
						// should still win because it's cheaper.
						tmpHarness.reachability.getReachability = function ()
						{
							return { Status: 'reachable' };
						};
						let tmpResult = tmpHarness.reachability.resolveStrategy('bcn-source', 'bcn-consumer');
						Expect(tmpResult.Strategy).to.equal('shared-fs');
					}
				);

				test
				(
					'falls back to direct/proxy when one of the beacons is a legacy (no HostID) beacon',
					function ()
					{
						let tmpHarness = _buildTestHarness(
							{
								'bcn-legacy': _beacon({ BeaconID: 'bcn-legacy', HostID: null }),
								'bcn-modern': _beacon({ BeaconID: 'bcn-modern' })
							});
						// A legacy beacon can't participate in shared-fs — should fall
						// through to the matrix-based direct/proxy decision.
						let tmpResult = tmpHarness.reachability.resolveStrategy('bcn-legacy', 'bcn-modern');
						Expect(tmpResult.Strategy).to.not.equal('shared-fs');
						Expect(['direct', 'proxy']).to.include(tmpResult.Strategy);
					}
				);
			}
		);

		// ================================================================
		// _findSharedMount (helper)
		// ================================================================
		suite
		(
			'_findSharedMount',
			function ()
			{
				test
				(
					'returns null for empty or missing arrays',
					function ()
					{
						let tmpHarness = _buildTestHarness({});
						let tmpR = tmpHarness.reachability;
						Expect(tmpR._findSharedMount(null, null)).to.equal(null);
						Expect(tmpR._findSharedMount(undefined, undefined)).to.equal(null);
						Expect(tmpR._findSharedMount([], [])).to.equal(null);
						Expect(tmpR._findSharedMount([{ MountID: 'x' }], [])).to.equal(null);
						Expect(tmpR._findSharedMount([], [{ MountID: 'x' }])).to.equal(null);
					}
				);

				test
				(
					'returns the first matching mount from the source side',
					function ()
					{
						let tmpHarness = _buildTestHarness({});
						let tmpMatch = tmpHarness.reachability._findSharedMount(
							[
								{ MountID: 'a', Root: '/root-a' },
								{ MountID: 'b', Root: '/root-b' }
							],
							[
								{ MountID: 'b', Root: '/root-b-as-seen-by-peer' }
							]);
						Expect(tmpMatch).to.not.equal(null);
						Expect(tmpMatch.MountID).to.equal('b');
						// Source-side root wins — which matters because the dispatcher
						// uses this Root to build the LocalPath for the requesting side.
						Expect(tmpMatch.Root).to.equal('/root-b');
					}
				);

				test
				(
					'skips entries that have no MountID',
					function ()
					{
						let tmpHarness = _buildTestHarness({});
						Expect(tmpHarness.reachability._findSharedMount(
							[{ Root: '/a' }, { MountID: 'c', Root: '/c' }],
							[{ MountID: 'c', Root: '/c' }]
						).MountID).to.equal('c');
					}
				);
			}
		);
	}
);
