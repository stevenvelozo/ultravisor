/**
 * FleetStore smoke: provision tables, exercise upsert/get/list/enable/
 * disable/delete/isModelEnabledOn, then close. Run from anywhere; DB
 * is created in /tmp.
 */
const libFs = require('fs');
const libPath = require('path');
const libOs = require('os');
const libFable = require('fable');

const libFleetStore = require('../source/services/persistence/Ultravisor-Beacon-FleetStore.cjs');

let tmpRoot = libFs.mkdtempSync(libPath.join(libOs.tmpdir(), 'uv-fleet-smoke-'));
console.log('store root:', tmpRoot);

let tmpFable = new libFable({ Product: 'fleetstore-smoke' });
tmpFable.addServiceTypeIfNotExists('UltravisorBeaconFleetStore', libFleetStore);
let tmpStore = tmpFable.instantiateServiceProviderWithoutRegistration(
	'UltravisorBeaconFleetStore', {});

if (!tmpStore.initialize(tmpRoot))
{
	console.error('FleetStore failed to initialize');
	process.exit(1);
}

let tmpFailures = [];
function expect(pCondition, pLabel)
{
	if (!pCondition) tmpFailures.push(pLabel);
	else console.log('  ✓', pLabel);
}

// 1. Insert a model installation
let tmpInst = tmpStore.upsertModelInstallation({
	BeaconID: 'bcn-rtx3060-1',
	BeaconName: 'rtx3060-linux',
	ModelKey: 'sd15',
	ModelName: 'Stable Diffusion 1.5',
	ModelSourceDir: '/Users/steven/Code/models/ml-image-generation/stable-diffusion-1.5',
	Status: 'queued'
});
expect(tmpInst != null,                                  'upsert returns row');
expect(tmpInst.BeaconID === 'bcn-rtx3060-1',             'BeaconID round-trip');
expect(tmpInst.ModelKey === 'sd15',                      'ModelKey round-trip');
expect(tmpInst.Status === 'queued',                      'initial status queued');
expect(tmpInst.EnabledForDispatch === false,             'default not enabled');

// 2. Update status → installing → installed
tmpStore.updateModelInstallationStatus('bcn-rtx3060-1', 'sd15', 'installing',
	{ PushTotalBytes: 4_300_000_000 });
let tmpProgress = tmpStore.getModelInstallation('bcn-rtx3060-1', 'sd15');
expect(tmpProgress.Status === 'installing',              'transition to installing');
expect(tmpProgress.PushTotalBytes === 4_300_000_000,     'PushTotalBytes set');

tmpStore.updateModelInstallationStatus('bcn-rtx3060-1', 'sd15', 'installed',
	{ InstalledTreeHash: 'abc123', InstalledBytes: 4_300_000_000, InstalledAt: new Date().toISOString() });
let tmpInstalled = tmpStore.getModelInstallation('bcn-rtx3060-1', 'sd15');
expect(tmpInstalled.Status === 'installed',              'transition to installed');
expect(tmpInstalled.InstalledTreeHash === 'abc123',      'InstalledTreeHash set');

// 3. Enable / disable
tmpStore.setModelEnabled('bcn-rtx3060-1', 'sd15', true);
let tmpEnabled = tmpStore.getModelInstallation('bcn-rtx3060-1', 'sd15');
expect(tmpEnabled.EnabledForDispatch === true,          'enabled flag flips on');
expect(tmpStore.isModelEnabledOn('bcn-rtx3060-1', 'sd15'), 'isModelEnabledOn true after enable');

tmpStore.setModelEnabled('bcn-rtx3060-1', 'sd15', false);
expect(!tmpStore.isModelEnabledOn('bcn-rtx3060-1', 'sd15'), 'isModelEnabledOn false after disable');

// 4. Filter list — second beacon for variety
tmpStore.upsertModelInstallation({
	BeaconID: 'bcn-mac-studio',
	BeaconName: 'mac-studio-m4',
	ModelKey: 'sd15',
	ModelName: 'Stable Diffusion 1.5',
	Status: 'installed',
	EnabledForDispatch: true
});
let tmpAll = tmpStore.listModelInstallations();
expect(tmpAll.length === 2,                              'list returns 2 rows');

let tmpByBeacon = tmpStore.listModelInstallations({ BeaconID: 'bcn-rtx3060-1' });
expect(tmpByBeacon.length === 1,                         'filter by BeaconID');
let tmpByModel = tmpStore.listModelInstallations({ ModelKey: 'sd15' });
expect(tmpByModel.length === 2,                          'filter by ModelKey');
let tmpEnabledList = tmpStore.listModelInstallations({ EnabledForDispatch: true });
expect(tmpEnabledList.length === 1,                      'filter by EnabledForDispatch');
expect(tmpEnabledList[0].BeaconID === 'bcn-mac-studio',  'enabled list resolves correctly');

// 5. Soft-delete
let tmpDeleted = tmpStore.deleteModelInstallation('bcn-rtx3060-1', 'sd15');
expect(tmpDeleted === true,                              'deleteModelInstallation returns true');
expect(tmpStore.getModelInstallation('bcn-rtx3060-1', 'sd15') == null,
	'getModelInstallation returns null after delete');
let tmpAfterDelete = tmpStore.listModelInstallations();
expect(tmpAfterDelete.length === 1,                      'list excludes soft-deleted');

// 6. Re-install after delete creates fresh row
let tmpReinstall = tmpStore.upsertModelInstallation({
	BeaconID: 'bcn-rtx3060-1',
	BeaconName: 'rtx3060-linux',
	ModelKey: 'sd15',
	ModelName: 'Stable Diffusion 1.5',
	Status: 'queued'
});
expect(tmpReinstall != null,                             'can re-install after soft-delete');
expect(tmpReinstall.IDBeaconModelInstallation !== tmpInst.IDBeaconModelInstallation,
	'reinstall is a new row (not the deleted one)');

// 7. Runtime installation API
let tmpRuntime = tmpStore.upsertRuntimeInstallation({
	BeaconID: 'bcn-rtx3060-1',
	BeaconName: 'rtx3060-linux',
	RuntimeName: 'pipeline-workers',
	ExpectedRuntimeHash: '13bff60e...',
	Status: 'installed',
	InstalledRuntimeHash: '13bff60e...',
	InstalledAt: new Date().toISOString()
});
expect(tmpRuntime.RuntimeName === 'pipeline-workers',    'runtime installation upsert');
expect(tmpRuntime.Status === 'installed',                'runtime status installed');
let tmpRtList = tmpStore.listRuntimeInstallations();
expect(tmpRtList.length === 1,                           'runtime list has 1');

tmpStore.close();

// Re-open to verify persistence across instances
let tmpFable2 = new libFable({ Product: 'fleetstore-smoke-2' });
tmpFable2.addServiceTypeIfNotExists('UltravisorBeaconFleetStore', libFleetStore);
let tmpStore2 = tmpFable2.instantiateServiceProviderWithoutRegistration(
	'UltravisorBeaconFleetStore', {});
tmpStore2.initialize(tmpRoot);
let tmpReopened = tmpStore2.listModelInstallations();
expect(tmpReopened.length === 2,                         'persistence: reopened sees 2 rows');
let tmpRtReopened = tmpStore2.listRuntimeInstallations();
expect(tmpRtReopened.length === 1,                       'persistence: reopened sees 1 runtime');
tmpStore2.close();

libFs.rmSync(tmpRoot, { recursive: true, force: true });

console.log('');
if (tmpFailures.length === 0)
{
	console.log('✅ FleetStore smoke PASS');
}
else
{
	console.log('❌ FleetStore smoke FAIL');
	for (let f of tmpFailures) console.log('   -', f);
	process.exit(1);
}
