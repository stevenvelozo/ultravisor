const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardReadText extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Read Text',
				Code: 'RTXT',
				Description: 'Read a text file from the staging folder.',
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
					{ Name: 'Data', Side: 'right' },
					{ Name: 'Error', Side: 'bottom' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 340,
					DefaultHeight: 220,
					Title: 'Read Text Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardReadText',
							Sections: [{ Name: 'File', Hash: 'RTSection', Groups: [{ Name: 'Settings', Hash: 'RTGroup' }] }],
							Descriptors:
							{
								'Record.Data.File': { Name: 'File Path', Hash: 'File', DataType: 'String', Default: '', PictForm: { Section: 'RTSection', Group: 'RTGroup', Row: 1, Width: 12 } },
								'Record.Data.Destination': { Name: 'State Destination', Hash: 'Destination', DataType: 'String', Default: '', PictForm: { Section: 'RTSection', Group: 'RTGroup', Row: 2, Width: 12 } }
							}
						}
					}
				}
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = FlowCardReadText;
