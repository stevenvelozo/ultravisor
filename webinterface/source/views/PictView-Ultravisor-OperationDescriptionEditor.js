/**
 * Ultravisor Operation Description Editor
 *
 * A pict-section-markdowneditor subclass for editing the operation
 * description in the Flow Editor's Information tab.
 *
 * Content is stored in AppData.Ultravisor.OperationDescriptionSegments
 * as a single-segment array: [{ Content: '...' }].
 */

const libPictSectionMarkdownEditor = require('pict-section-markdowneditor');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-OperationDescriptionEditor",

	DefaultRenderable: "MarkdownEditor-Wrap",
	TargetElementAddress: "#Ultravisor-FlowEditor-DescriptionEditor",

	ContentDataAddress: "AppData.Ultravisor.OperationDescriptionSegments",

	ReadOnly: false,
	EnableRichPreview: true,
	DefaultPreviewMode: "off",

	AutoRender: false,

	Renderables:
	[
		{
			RenderableHash: "MarkdownEditor-Wrap",
			TemplateHash: "MarkdownEditor-Container",
			DestinationAddress: "#Ultravisor-FlowEditor-DescriptionEditor"
		}
	]
};

class UltravisorOperationDescriptionEditor extends libPictSectionMarkdownEditor
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	customConfigureExtensions(pExtensions, pSegmentIndex)
	{
		// Enable line wrapping for description text
		if (this._codeMirrorModules && this._codeMirrorModules.EditorView)
		{
			pExtensions.push(this._codeMirrorModules.EditorView.lineWrapping);
		}
		return pExtensions;
	}

	onContentChange(pSegmentIndex, pContent)
	{
		// Auto-sync to operation data on every change
		let tmpOp = this.pict.AppData.Ultravisor.CurrentEditOperation;
		if (tmpOp)
		{
			tmpOp.Description = pContent;
		}
	}
}

module.exports = UltravisorOperationDescriptionEditor;

module.exports.default_configuration = _ViewConfiguration;
