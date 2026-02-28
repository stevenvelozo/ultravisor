const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardWriteText extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Write Text',
				Code: 'WTXT',
				Description: 'Write text content to the staging folder.',
				Category: 'File I/O',
				TitleBarColor: '#2980b9',
				BodyStyle: { fill: '#eaf2f8', stroke: '#2980b9' },
				Width: 180,
				Height: 80,
				Inputs:
				[
					{ Name: 'Data', Side: 'left', MinimumInputCount: 1, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Done', Side: 'right' },
					{ Name: 'Error', Side: 'bottom' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 340,
					DefaultHeight: 220,
					Title: 'Write Text Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardWriteText',
							Sections: [{ Name: 'File', Hash: 'WTSection', Groups: [{ Name: 'Settings', Hash: 'WTGroup' }] }],
							Descriptors:
							{
								'Record.Data.File': { Name: 'File Path', Hash: 'File', DataType: 'String', Default: '', PictForm: { Section: 'WTSection', Group: 'WTGroup', Row: 1, Width: 12 } },
								'Record.Data.Address': { Name: 'State Address', Hash: 'Address', DataType: 'String', Default: '', PictForm: { Section: 'WTSection', Group: 'WTGroup', Row: 2, Width: 12 } }
							}
						}
					}
				}
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = FlowCardWriteText;
