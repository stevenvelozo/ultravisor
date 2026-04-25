/**
 * Ultravisor admin — Fleet view.
 *
 * Beacons × Models grid showing installation state per (beacon, model)
 * with operator actions: Install / Uninstall / Enable / Disable. Polls
 * /Fleet every 5s for live progress updates.
 *
 * Backend contract:
 *   GET  /Fleet                                       — full snapshot
 *   POST /Fleet/Install     { BeaconID, ModelKey }
 *   POST /Fleet/Uninstall   { BeaconID, ModelKey }
 *   POST /Fleet/Enable      { BeaconID, ModelKey }
 *   POST /Fleet/Disable     { BeaconID, ModelKey }
 */

const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: 'Ultravisor-Fleet',
	DefaultRenderable: 'Ultravisor-Fleet-Content',
	DefaultDestinationAddress: '#Ultravisor-Content-Container',
	AutoRender: false,

	CSS: /*css*/`
		.uv-fleet { padding: 2em; max-width: 1600px; margin: 0 auto; }
		.uv-fleet-header {
			display: flex; justify-content: space-between; align-items: center;
			margin-bottom: 1.5em; padding-bottom: 1em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.uv-fleet-header h1 {
			margin: 0; font-size: 2em; font-weight: 300; color: var(--uv-text);
		}
		.uv-fleet-summary {
			display: flex; gap: 1em; margin-bottom: 1.5em;
		}
		.uv-fleet-summary-card {
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			border-radius: 8px;
			padding: 0.7em 1.2em;
		}
		.uv-fleet-summary-count {
			font-size: 1.5em; font-weight: 700; color: var(--uv-text);
		}
		.uv-fleet-summary-label {
			font-size: 0.75em; text-transform: uppercase;
			letter-spacing: 0.5px; color: var(--uv-text-secondary);
		}
		.uv-fleet-grid-wrap {
			overflow-x: auto;
			border: 1px solid var(--uv-border-subtle);
			border-radius: 8px;
			background: var(--uv-bg-surface);
		}
		table.uv-fleet-grid {
			border-collapse: collapse; min-width: 100%;
		}
		.uv-fleet-grid th, .uv-fleet-grid td {
			padding: 0.5em 0.7em;
			border-bottom: 1px solid var(--uv-border-subtle);
			border-right: 1px solid var(--uv-border-subtle);
			vertical-align: middle;
			font-size: 0.85em;
			white-space: nowrap;
		}
		.uv-fleet-grid th.uv-fleet-modelhead {
			writing-mode: vertical-lr;
			transform: rotate(180deg);
			min-height: 8em;
			text-align: left;
			background: var(--uv-bg-base);
			color: var(--uv-text-secondary);
			font-weight: 600;
		}
		.uv-fleet-grid th.uv-fleet-beaconhead {
			background: var(--uv-bg-base);
			color: var(--uv-text-secondary);
			text-align: left;
			min-width: 200px;
		}
		.uv-fleet-grid th.uv-fleet-corner { background: var(--uv-bg-base); }

		.uv-fleet-cell {
			text-align: center; min-width: 6em;
		}
		.uv-fleet-cell.installed-enabled  { background: rgba(102, 187, 106, 0.18); }
		.uv-fleet-cell.installed-disabled { background: rgba(255, 213, 79, 0.12); }
		.uv-fleet-cell.installing         { background: rgba(66, 165, 245, 0.18); }
		.uv-fleet-cell.error              { background: rgba(229, 57, 53, 0.18); }
		.uv-fleet-cell.queued             { background: rgba(189, 189, 189, 0.12); }

		.uv-fleet-cell-status {
			display: inline-block; padding: 0.1em 0.5em;
			border-radius: 999px; font-size: 0.7em; font-weight: 600;
			letter-spacing: 0.5px; text-transform: uppercase;
		}
		.uv-fleet-cell-actions {
			display: flex; gap: 0.3em; justify-content: center;
			margin-top: 0.3em;
		}
		.uv-fleet-cell-btn {
			background: transparent; border: 1px solid var(--uv-border-subtle);
			color: var(--uv-text); padding: 0.15em 0.5em;
			border-radius: 4px; font-size: 0.7em; cursor: pointer;
		}
		.uv-fleet-cell-btn:hover { background: var(--uv-bg-base); }
		.uv-fleet-cell-btn.primary {
			background: var(--uv-brand);
			color: var(--uv-text-heading);
			border-color: transparent;
		}
		.uv-fleet-progress {
			width: 80px; height: 4px;
			background: var(--uv-bg-base); border-radius: 2px;
			margin: 0.3em auto; overflow: hidden;
		}
		.uv-fleet-progress-fill {
			height: 100%; background: var(--uv-info);
			transition: width 0.3s;
		}
		.uv-fleet-runtime-row {
			background: var(--uv-bg-surface);
			border-top: 2px solid var(--uv-border-subtle);
			font-style: italic;
		}
		.uv-fleet-empty {
			text-align: center; padding: 3em;
			color: var(--uv-text-tertiary); font-size: 0.95em;
		}
		.uv-fleet-tag {
			display: inline-block;
			background: var(--uv-bg-base);
			border: 1px solid var(--uv-border-subtle);
			padding: 0.05em 0.4em;
			border-radius: 3px;
			font-size: 0.7em;
			color: var(--uv-text-secondary);
			margin-left: 0.4em;
		}
		.uv-fleet-refresh {
			font-size: 0.75em; color: var(--uv-text-tertiary);
			display: flex; align-items: center; gap: 0.4em;
		}
	`,

	Templates:
	[
		{
			Hash: 'Ultravisor-Fleet-Template',
			Template: /*html*/`
<div class="uv-fleet">
	<div class="uv-fleet-header">
		<h1>Fleet</h1>
		<div style="display:flex;align-items:center;gap:1em;">
			<div class="uv-fleet-refresh">
				<span style="width:6px;height:6px;border-radius:50%;background:var(--uv-success);display:inline-block;"></span>
				<span>Auto-refresh 5s</span>
			</div>
			<button class="ultravisor-btn ultravisor-btn-secondary" onclick="{~P~}.views['Ultravisor-Fleet'].refresh()">Refresh</button>
		</div>
	</div>
	<div id="Ultravisor-Fleet-Summary"></div>
	<div id="Ultravisor-Fleet-Body"></div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: 'Ultravisor-Fleet-Content',
			TemplateHash: 'Ultravisor-Fleet-Template',
			DestinationAddress: '#Ultravisor-Content-Container',
			RenderMethod: 'replace'
		}
	]
};

class UltravisorFleetView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this._refreshTimer = null;
		this._snapshot = null;
	}

	onBeforeRender(pRenderable, pDest, pRecord)
	{
		if (this._refreshTimer)
		{
			clearInterval(this._refreshTimer);
			this._refreshTimer = null;
		}
		return super.onBeforeRender(pRenderable, pDest, pRecord);
	}

	onAfterRender(pRenderable, pDest, pRecord, pContent)
	{
		this.refresh();
		this._refreshTimer = setInterval(this._silentRefresh.bind(this), 5000);
		return super.onAfterRender(pRenderable, pDest, pRecord, pContent);
	}

	refresh()
	{
		this.pict.PictApplication.apiCall('GET', '/Fleet', null, (pErr, pData) =>
		{
			if (pErr || !pData)
			{
				this.pict.log.warn('Fleet refresh failed: ' + (pErr ? pErr.message : 'no data'));
				return;
			}
			this._snapshot = pData;
			this._renderSummary();
			this._renderBody();
		});
	}

	_silentRefresh()
	{
		this.pict.PictApplication.apiCall('GET', '/Fleet', null, (pErr, pData) =>
		{
			if (pErr || !pData) return;
			this._snapshot = pData;
			this._renderSummary();
			this._renderBody();
		});
	}

	_renderSummary()
	{
		let tmpEl = document.getElementById('Ultravisor-Fleet-Summary');
		if (!tmpEl) return;
		let tmpSnap = this._snapshot || {};
		let tmpBeacons = tmpSnap.Beacons || [];
		let tmpModels = tmpSnap.AvailableModels || [];
		let tmpInstall = tmpSnap.ModelInstallations || [];
		let tmpInstalled = tmpInstall.filter(i => i.Status === 'installed').length;
		let tmpEnabled  = tmpInstall.filter(i => i.EnabledForDispatch && i.Status === 'installed').length;
		let tmpInstalling = tmpInstall.filter(i => i.Status === 'installing' || i.Status === 'queued').length;
		let tmpErrored = tmpInstall.filter(i => i.Status === 'error').length;
		let tmpOnline = tmpBeacons.filter(b => b.Status === 'Online' || b.Status === 'Busy').length;

		tmpEl.innerHTML = `
			<div class="uv-fleet-summary">
				<div class="uv-fleet-summary-card">
					<div class="uv-fleet-summary-count">${tmpBeacons.length}</div>
					<div class="uv-fleet-summary-label">Beacons (${tmpOnline} online)</div>
				</div>
				<div class="uv-fleet-summary-card">
					<div class="uv-fleet-summary-count">${tmpModels.length}</div>
					<div class="uv-fleet-summary-label">Available Models</div>
				</div>
				<div class="uv-fleet-summary-card">
					<div class="uv-fleet-summary-count" style="color:var(--uv-success);">${tmpEnabled}</div>
					<div class="uv-fleet-summary-label">Enabled Installations</div>
				</div>
				<div class="uv-fleet-summary-card">
					<div class="uv-fleet-summary-count">${tmpInstalled - tmpEnabled}</div>
					<div class="uv-fleet-summary-label">Disabled / Inactive</div>
				</div>
				<div class="uv-fleet-summary-card">
					<div class="uv-fleet-summary-count" style="color:var(--uv-info);">${tmpInstalling}</div>
					<div class="uv-fleet-summary-label">Installing</div>
				</div>
				<div class="uv-fleet-summary-card">
					<div class="uv-fleet-summary-count" style="color:#ef5350;">${tmpErrored}</div>
					<div class="uv-fleet-summary-label">Errors</div>
				</div>
			</div>`;
	}

	_renderBody()
	{
		let tmpEl = document.getElementById('Ultravisor-Fleet-Body');
		if (!tmpEl) return;
		let tmpSnap = this._snapshot || {};
		let tmpBeacons = tmpSnap.Beacons || [];
		let tmpModels = tmpSnap.AvailableModels || [];
		let tmpInst = tmpSnap.ModelInstallations || [];
		let tmpRuntimes = tmpSnap.RuntimeInstallations || [];
		let tmpRegRuntimes = tmpSnap.RegisteredRuntimes || [];

		if (tmpBeacons.length === 0)
		{
			tmpEl.innerHTML = `<div class="uv-fleet-empty">No beacons registered yet.<br/>Start a worker against this hub and reload.</div>`;
			return;
		}
		if (tmpModels.length === 0)
		{
			tmpEl.innerHTML = `<div class="uv-fleet-empty">No model catalog registered.<br/>Make sure the hub's app (e.g. retold-labs) called <code>FleetManager.registerModelCatalog()</code> at startup.</div>`;
			return;
		}

		// Index installations by (BeaconID, ModelKey).
		let tmpByCell = {};
		for (let tmpI of tmpInst)
		{
			tmpByCell[tmpI.BeaconID + '|' + tmpI.ModelKey] = tmpI;
		}
		// Index runtime installs by BeaconID for the runtime row.
		let tmpRuntimeByBeacon = {};
		for (let tmpR of tmpRuntimes)
		{
			tmpRuntimeByBeacon[tmpR.BeaconID] = tmpRuntimeByBeacon[tmpR.BeaconID] || [];
			tmpRuntimeByBeacon[tmpR.BeaconID].push(tmpR);
		}

		// Sort: beacons by name; models by name.
		let tmpSortedBeacons = tmpBeacons.slice().sort((a, b) =>
			(a.Name || '').localeCompare(b.Name || ''));
		let tmpSortedModels = tmpModels.slice().sort((a, b) =>
			(a.DisplayName || a.ModelName || '').localeCompare(b.DisplayName || b.ModelName || ''));

		let tmpHtml = '<div class="uv-fleet-grid-wrap"><table class="uv-fleet-grid"><thead><tr>';
		tmpHtml += '<th class="uv-fleet-corner">Beacon \u00d7 Model</th>';
		for (let tmpM of tmpSortedModels)
		{
			let tmpName = this._escape(tmpM.DisplayName || tmpM.ModelName);
			tmpHtml += `<th class="uv-fleet-modelhead" title="${tmpName}">${tmpName}</th>`;
		}
		tmpHtml += '</tr></thead><tbody>';

		for (let tmpB of tmpSortedBeacons)
		{
			let tmpStatus = (tmpB.Status || 'unknown').toLowerCase();
			let tmpRuntimeBadges = '';
			let tmpBcnRuntimes = tmpRuntimeByBeacon[tmpB.BeaconID] || [];
			for (let tmpR of tmpBcnRuntimes)
			{
				let tmpClass = tmpR.Status === 'installed' ? 'installed-enabled'
					: tmpR.Status === 'pushing' ? 'installing'
					: tmpR.Status === 'error' ? 'error' : 'queued';
				tmpRuntimeBadges += `<span class="uv-fleet-tag" title="runtime: ${tmpR.RuntimeName} status: ${tmpR.Status}">${tmpR.RuntimeName}: ${tmpR.Status}</span>`;
			}
			tmpHtml += '<tr>';
			tmpHtml += `<th class="uv-fleet-beaconhead">
				<div><strong>${this._escape(tmpB.Name || tmpB.BeaconID)}</strong></div>
				<div style="font-size:0.75em;color:var(--uv-text-secondary);">${tmpStatus} \u00b7 ${(tmpB.Capabilities || []).length} caps</div>
				<div>${tmpRuntimeBadges}</div>
			</th>`;
			for (let tmpM of tmpSortedModels)
			{
				let tmpKey = tmpB.BeaconID + '|' + tmpM.ModelKey;
				let tmpInstRow = tmpByCell[tmpKey];
				tmpHtml += this._renderCell(tmpB, tmpM, tmpInstRow);
			}
			tmpHtml += '</tr>';
		}
		tmpHtml += '</tbody></table></div>';

		// Registered runtime metadata footer
		if (tmpRegRuntimes.length > 0)
		{
			tmpHtml += '<div style="margin-top:1em;font-size:0.8em;color:var(--uv-text-secondary);">';
			tmpHtml += 'Registered runtimes: ';
			tmpHtml += tmpRegRuntimes.map(r => `<span class="uv-fleet-tag">${this._escape(r.Name)}</span>`).join('');
			tmpHtml += '</div>';
		}

		tmpEl.innerHTML = tmpHtml;
	}

	_renderCell(pBeacon, pModel, pInst)
	{
		// No installation row → uninstalled state with Install button.
		if (!pInst)
		{
			return `<td class="uv-fleet-cell">
				<button class="uv-fleet-cell-btn primary"
					onclick="{~P~}.views['Ultravisor-Fleet'].install('${pBeacon.BeaconID}', '${this._jsAttr(pModel.ModelKey)}')">Install</button>
			</td>`.replace('{~P~}', 'Pict');
		}
		let tmpClass = 'queued';
		let tmpStatusLabel = pInst.Status;
		if (pInst.Status === 'installed' && pInst.EnabledForDispatch) { tmpClass = 'installed-enabled'; tmpStatusLabel = 'enabled'; }
		else if (pInst.Status === 'installed') { tmpClass = 'installed-disabled'; tmpStatusLabel = 'disabled'; }
		else if (pInst.Status === 'installing' || pInst.Status === 'queued') { tmpClass = 'installing'; }
		else if (pInst.Status === 'error') { tmpClass = 'error'; }

		let tmpProgress = '';
		if (pInst.Status === 'installing' && pInst.PushTotalBytes > 0)
		{
			let tmpPct = Math.min(100, Math.round(100 * (pInst.PushProgressBytes || 0) / pInst.PushTotalBytes));
			tmpProgress = `<div class="uv-fleet-progress"><div class="uv-fleet-progress-fill" style="width:${tmpPct}%"></div></div>
				<div style="font-size:0.7em;color:var(--uv-text-secondary);">${tmpPct}%</div>`;
		}

		let tmpButtons = '';
		let tmpBcn = pBeacon.BeaconID;
		let tmpKey = this._jsAttr(pInst.ModelKey);
		if (pInst.Status === 'installed')
		{
			if (pInst.EnabledForDispatch)
			{
				tmpButtons += `<button class="uv-fleet-cell-btn" onclick="Pict.views['Ultravisor-Fleet'].disable('${tmpBcn}','${tmpKey}')">Disable</button>`;
			}
			else
			{
				tmpButtons += `<button class="uv-fleet-cell-btn primary" onclick="Pict.views['Ultravisor-Fleet'].enable('${tmpBcn}','${tmpKey}')">Enable</button>`;
			}
			tmpButtons += `<button class="uv-fleet-cell-btn" onclick="Pict.views['Ultravisor-Fleet'].uninstall('${tmpBcn}','${tmpKey}')">Uninstall</button>`;
		}
		else if (pInst.Status === 'error')
		{
			tmpButtons += `<button class="uv-fleet-cell-btn primary" onclick="Pict.views['Ultravisor-Fleet'].install('${tmpBcn}','${tmpKey}')">Retry</button>`;
		}

		let tmpSourceTag = (pInst.Source && pInst.Source !== 'operator')
			? `<span class="uv-fleet-tag" title="auto-discovered from worker inventory">${this._escape(pInst.Source)}</span>` : '';

		return `<td class="uv-fleet-cell ${tmpClass}" title="${this._escape(pInst.LastError || '')}">
			<span class="uv-fleet-cell-status">${this._escape(tmpStatusLabel)}</span> ${tmpSourceTag}
			${tmpProgress}
			<div class="uv-fleet-cell-actions">${tmpButtons}</div>
		</td>`;
	}

	// ── Operator actions ────────────────────────────────────────

	install(pBeaconID, pModelKey)
	{
		this.pict.PictApplication.apiCall('POST', '/Fleet/Install',
			{ BeaconID: pBeaconID, ModelKey: pModelKey, EnableAfterInstall: false },
			(pErr, pResp) =>
			{
				if (pErr) { window.alert('Install failed: ' + pErr.message); return; }
				this.refresh();
			});
	}

	uninstall(pBeaconID, pModelKey)
	{
		if (!window.confirm('Uninstall ' + pModelKey + ' from beacon? Files on the worker will be deleted.')) return;
		this.pict.PictApplication.apiCall('POST', '/Fleet/Uninstall',
			{ BeaconID: pBeaconID, ModelKey: pModelKey },
			(pErr, pResp) =>
			{
				if (pErr) { window.alert('Uninstall failed: ' + pErr.message); return; }
				this.refresh();
			});
	}

	enable(pBeaconID, pModelKey)
	{
		this.pict.PictApplication.apiCall('POST', '/Fleet/Enable',
			{ BeaconID: pBeaconID, ModelKey: pModelKey },
			(pErr, pResp) =>
			{
				if (pErr) { window.alert('Enable failed: ' + pErr.message); return; }
				this.refresh();
			});
	}

	disable(pBeaconID, pModelKey)
	{
		this.pict.PictApplication.apiCall('POST', '/Fleet/Disable',
			{ BeaconID: pBeaconID, ModelKey: pModelKey },
			(pErr, pResp) =>
			{
				if (pErr) { window.alert('Disable failed: ' + pErr.message); return; }
				this.refresh();
			});
	}

	// ── Helpers ──────────────────────────────────────────────────

	_escape(pStr)
	{
		if (pStr == null) return '';
		return String(pStr).replace(/[&<>"']/g, (c) => ({
			'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
		})[c]);
	}

	_jsAttr(pStr)
	{
		// Single-quote-safe + slash-escape so it survives interpolation
		// into an onclick="..." attribute.
		return String(pStr || '').replace(/['\\]/g, '\\$&');
	}
}

UltravisorFleetView.default_configuration = _ViewConfiguration;
module.exports = UltravisorFleetView;
