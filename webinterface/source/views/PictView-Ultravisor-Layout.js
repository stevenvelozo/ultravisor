const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-Layout",

	DefaultRenderable: "Ultravisor-Layout-Shell",
	DefaultDestinationAddress: "#Ultravisor-Application-Container",

	AutoRender: false,

	CSS: /*css*/`
		#Ultravisor-Application-Container {
			display: flex;
			flex-direction: column;
			min-height: 100vh;
		}
		#Ultravisor-TopBar-Container {
			flex-shrink: 0;
		}
		#Ultravisor-Content-Container {
			flex: 1;
		}
		#Ultravisor-BottomBar-Container {
			flex-shrink: 0;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-Layout-Shell-Template",
			Template: /*html*/`
<div id="Ultravisor-TopBar-Container"></div>
<div id="Ultravisor-Content-Container"></div>
<div id="Ultravisor-BottomBar-Container"></div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-Layout-Shell",
			TemplateHash: "Ultravisor-Layout-Shell-Template",
			DestinationAddress: "#Ultravisor-Application-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorLayoutView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		// After the layout shell is rendered, render the child views into their containers
		this.pict.views['Ultravisor-TopBar'].render();
		this.pict.views['Ultravisor-BottomBar'].render();

		// Render initial content -- the dashboard by default
		this.pict.views['Ultravisor-Dashboard'].render();

		// Inject all view CSS into the PICT-CSS style element
		this.pict.CSSMap.injectCSS();

		// Now resolve the router so it picks up the current hash URL
		if (this.pict.providers.PictRouter)
		{
			this.pict.providers.PictRouter.resolve();
		}

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}
}

module.exports = UltravisorLayoutView;

module.exports.default_configuration = _ViewConfiguration;
