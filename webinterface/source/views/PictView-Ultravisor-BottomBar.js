const libPictView = require('pict-view');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-BottomBar",

	DefaultRenderable: "Ultravisor-BottomBar-Content",
	DefaultDestinationAddress: "#Ultravisor-BottomBar-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-bottombar {
			display: flex;
			align-items: center;
			justify-content: center;
			background-color: var(--uv-bg-elevated);
			color: var(--uv-text-tertiary);
			padding: 0.75em 1.5em;
			font-size: 0.8em;
			border-top: 1px solid var(--uv-topbar-hover);
		}
		.ultravisor-bottombar a {
			color: var(--uv-link);
			text-decoration: none;
		}
		.ultravisor-bottombar a:hover {
			color: var(--uv-link-hover);
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-BottomBar-Template",
			Template: /*html*/`
<div class="ultravisor-bottombar">
	Ultravisor Task Server &middot; Retold
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-BottomBar-Content",
			TemplateHash: "Ultravisor-BottomBar-Template",
			DestinationAddress: "#Ultravisor-BottomBar-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorBottomBarView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}
}

module.exports = UltravisorBottomBarView;

module.exports.default_configuration = _ViewConfiguration;
