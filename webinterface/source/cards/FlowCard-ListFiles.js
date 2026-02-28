const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardListFiles extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'List Files',
				Code: 'LSFILE',
				Description: 'List files in a staging folder directory.',
				Category: 'File I/O',
				TitleBarColor: '#2980b9',
				BodyStyle: { fill: '#eaf2f8', stroke: '#2980b9' },
				Width: 180,
				Height: 80,
				Inputs:
				[
					{ Name: 'Trigger', Side: 'left', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Files', Side: 'right' },
					{ Name: 'Error', Side: 'bottom' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 340,
					DefaultHeight: 240,
					Title: 'List Files Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardListFiles',
							Sections: [{ Name: 'Directory', Hash: 'LSSection', Groups: [{ Name: 'Settings', Hash: 'LSGroup' }] }],
							Descriptors:
							{
								'Record.Data.Folder': { Name: 'Folder Path', Hash: 'Folder', DataType: 'String', Default: '', PictForm: { Section: 'LSSection', Group: 'LSGroup', Row: 1, Width: 12 } },
								'Record.Data.Pattern': { Name: 'File Pattern', Hash: 'Pattern', DataType: 'String', Default: '*', PictForm: { Section: 'LSSection', Group: 'LSGroup', Row: 2, Width: 12 } },
								'Record.Data.Destination': { Name: 'State Destination', Hash: 'Destination', DataType: 'String', Default: '', PictForm: { Section: 'LSSection', Group: 'LSGroup', Row: 3, Width: 12 } }
							}
						}
					}
				}
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = FlowCardListFiles;
