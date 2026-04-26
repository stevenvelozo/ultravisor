/**
 * PictView-Ultravisor-UserManagement
 *
 * Hosts the user-management surface inside ultravisor's main content
 * panel. Composes three section views:
 *
 *   - PictUM-UserList         (admin: search/list/edit/delete users)
 *   - PictUM-UserEdit         (admin: create/edit user form)
 *   - PictUM-PasswordChange   (any session: self change-password)
 *
 * The section's CurrentUser badge is rendered in the TopBar, not here
 * — the page itself doesn't need its own session indicator.
 *
 * Sub-tabs (Users | Change my password) keep the admin and self
 * surfaces separate. A non-admin landing on /Users sees only the
 * password tab; the admin tab self-hides via the section's 401/403
 * error path.
 */

const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: 'Ultravisor-UserManagement',
	AutoInitialize: true,
	AutoRender: false,

	DefaultRenderable: 'Ultravisor-UserManagement-Content',
	DefaultDestinationAddress: '#Ultravisor-Content-Container',

	Templates:
	[
		{
			Hash: 'Ultravisor-UserManagement-Template',
			Template: /*html*/`
<div class="ultravisor-um-page">
	<div class="ultravisor-um-tabs">
		<button type="button" class="ultravisor-um-tab" id="UV-UM-Tab-Users"
			onclick="{~P~}.views['Ultravisor-UserManagement'].switchTab('users')">Users</button>
		<button type="button" class="ultravisor-um-tab" id="UV-UM-Tab-Pwd"
			onclick="{~P~}.views['Ultravisor-UserManagement'].switchTab('change-password')">Change my password</button>
	</div>
	<div class="ultravisor-um-content">
		<div id="UV-UM-Pane-Users">
			<div id="PictUM-UserList"></div>
			<div id="PictUM-UserEdit" style="margin-top: 16px;"></div>
		</div>
		<div id="UV-UM-Pane-Pwd" style="display:none;">
			<div id="PictUM-PasswordChange"></div>
		</div>
	</div>
</div>`
		}
	],

	Renderables:
	[
		{
			RenderableHash: 'Ultravisor-UserManagement-Content',
			TemplateHash: 'Ultravisor-UserManagement-Template',
			DestinationAddress: '#Ultravisor-Content-Container',
			RenderMethod: 'replace'
		}
	],

	CSS: /*css*/`
		.ultravisor-um-page { padding: 24px; }
		.ultravisor-um-tabs {
			display: flex; gap: 4px; margin-bottom: 16px;
			border-bottom: 1px solid var(--uv-border, #2a2a2a);
		}
		.ultravisor-um-tab {
			background: transparent; border: 0; cursor: pointer;
			padding: 10px 18px; color: var(--uv-text-tertiary, #888);
			font-size: 14px; font-weight: 500;
			border-bottom: 2px solid transparent;
		}
		.ultravisor-um-tab:hover { color: var(--uv-text, #ddd); }
		.ultravisor-um-tab-active {
			color: var(--uv-text, #ddd);
			border-bottom-color: var(--uv-brand, #2563eb);
		}
	`
};

class UltravisorUserManagementView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this._activeTab = 'users';
	}

	switchTab(pTab)
	{
		this._activeTab = pTab;
		this._refreshTabState();
		// Render the section view that's now visible. Other panes stay
		// in the DOM (display:none) so their form state survives toggles.
		let tmpProvider = this._provider();
		if (pTab === 'users' && tmpProvider) { tmpProvider.loadUsers(); }
		this._renderChildren();
	}

	onAfterRender(pRenderable, pAddress, pRecord, pContent)
	{
		this._refreshTabState();
		// Kick a load so the list paints on first arrival; the section's
		// UserList itself doesn't auto-fetch.
		let tmpProvider = this._provider();
		if (this._activeTab === 'users' && tmpProvider)
		{
			tmpProvider.loadUsers(() => this._renderChildren());
		}
		this._renderChildren();
		this.pict.CSSMap.injectCSS();
		return super.onAfterRender
			? super.onAfterRender(pRenderable, pAddress, pRecord, pContent)
			: undefined;
	}

	_refreshTabState()
	{
		let tmpUsersTab = document.getElementById('UV-UM-Tab-Users');
		let tmpPwdTab = document.getElementById('UV-UM-Tab-Pwd');
		let tmpUsersPane = document.getElementById('UV-UM-Pane-Users');
		let tmpPwdPane = document.getElementById('UV-UM-Pane-Pwd');
		if (tmpUsersTab)
		{
			tmpUsersTab.className = 'ultravisor-um-tab' + (this._activeTab === 'users' ? ' ultravisor-um-tab-active' : '');
		}
		if (tmpPwdTab)
		{
			tmpPwdTab.className = 'ultravisor-um-tab' + (this._activeTab === 'change-password' ? ' ultravisor-um-tab-active' : '');
		}
		if (tmpUsersPane) tmpUsersPane.style.display = (this._activeTab === 'users') ? '' : 'none';
		if (tmpPwdPane) tmpPwdPane.style.display = (this._activeTab === 'change-password') ? '' : 'none';
	}

	_renderChildren()
	{
		// Render section views into their mount points. Each view tracks
		// its own destination — calling render() is enough.
		let tmpList = this.pict.views['PictUM-UserList'];
		let tmpEdit = this.pict.views['PictUM-UserEdit'];
		let tmpPwd = this.pict.views['PictUM-PasswordChange'];
		if (tmpList) tmpList.render();
		if (tmpEdit) tmpEdit.render();
		if (tmpPwd) tmpPwd.render();
	}

	_provider()
	{
		return this.pict.providers && this.pict.providers['Pict-UserManagement-Provider'];
	}
}

module.exports = UltravisorUserManagementView;
module.exports.default_configuration = _ViewConfiguration;
