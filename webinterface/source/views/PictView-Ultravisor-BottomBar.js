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
			background-color: #0f3460;
			color: #607d8b;
			padding: 0.75em 1.5em;
			font-size: 0.8em;
			border-top: 1px solid #1a4a7a;
		}
		.ultravisor-bottombar a {
			color: #4fc3f7;
			text-decoration: none;
		}
		.ultravisor-bottombar a:hover {
			color: #81d4fa;
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
