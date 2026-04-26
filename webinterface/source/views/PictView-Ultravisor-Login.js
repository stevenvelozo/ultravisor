/**
 * PictView-Ultravisor-Login
 *
 * Thin host wrapper around `pict-section-usermanagement`'s Login
 * view. The section's Login renders into `#PictUM-Login`; this view
 * just provides that mount point inside ultravisor's main content
 * panel and delegates to the section view's render.
 *
 * The section's Login carries its own theme-neutral CSS, so this
 * view doesn't need to restyle the form — but does add a small
 * "Ultravisor — sign in" page heading so the page doesn't feel
 * floating.
 */

const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: 'Ultravisor-Login',
	AutoInitialize: true,
	AutoRender: false,

	DefaultRenderable: 'Ultravisor-Login-Content',
	DefaultDestinationAddress: '#Ultravisor-Content-Container',

	Templates:
	[
		{
			Hash: 'Ultravisor-Login-Template',
			Template: /*html*/`
<div class="ultravisor-login-page">
	<div id="PictUM-Login"></div>
</div>`
		}
	],

	Renderables:
	[
		{
			RenderableHash: 'Ultravisor-Login-Content',
			TemplateHash: 'Ultravisor-Login-Template',
			DestinationAddress: '#Ultravisor-Content-Container',
			RenderMethod: 'replace'
		}
	],

	CSS: /*css*/`
		.ultravisor-login-page {
			min-height: calc(100vh - 56px);
			display: flex; align-items: center; justify-content: center;
			padding: 32px 16px;
		}
	`
};

class UltravisorLoginView extends libPictView
{
	onAfterRender(pRenderable, pAddress, pRecord, pContent)
	{
		// Render the section's Login view into the mount point we just
		// painted. The section view tracks its own destination via
		// DefaultDestinationAddress: '#PictUM-Login', so a plain render()
		// call is enough.
		let tmpInner = this.pict && this.pict.views && this.pict.views['PictUM-Login'];
		if (tmpInner) tmpInner.render();
		this.pict.CSSMap.injectCSS();
		return super.onAfterRender
			? super.onAfterRender(pRenderable, pAddress, pRecord, pContent)
			: undefined;
	}
}

module.exports = UltravisorLoginView;
module.exports.default_configuration = _ViewConfiguration;
