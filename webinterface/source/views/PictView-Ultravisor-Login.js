/**
 * PictView-Ultravisor-Login
 *
 * Thin host wrapper around `pict-section-login`. The section view
 * renders into `#Pict-Login-Container`; this view just paints the
 * mount point inside ultravisor's main content panel and delegates
 * to the section's render.
 *
 * The section view ships its own theme-neutral CSS, so this wrapper
 * only contributes layout chrome (centered card on the page).
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
	<div id="Pict-Login-Container"></div>
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
		// Render the pict-section-login view into the mount point we
		// just painted.  The section tracks its own destination via
		// DefaultDestinationAddress: '#Pict-Login-Container', so a plain
		// render() call is enough.
		let tmpInner = this.pict && this.pict.views && this.pict.views['Pict-Section-Login'];
		if (tmpInner) tmpInner.render();
		this.pict.CSSMap.injectCSS();
		return super.onAfterRender
			? super.onAfterRender(pRenderable, pAddress, pRecord, pContent)
			: undefined;
	}
}

module.exports = UltravisorLoginView;
module.exports.default_configuration = _ViewConfiguration;
