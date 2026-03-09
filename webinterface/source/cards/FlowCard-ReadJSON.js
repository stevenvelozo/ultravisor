const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardReadJSON extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Read JSON',
				Code: 'RJSON',
				Description: 'Read and parse a JSON file from the staging folder.',
				Category: 'File I/O',
				TitleBarColor: '#2980b9',
				BodyStyle: { fill: '#eaf2f8', stroke: '#2980b9' },
				Width: 180,
				Height: 80,
				Inputs:
				[
					{ Name: 'Trigger', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'File', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Data', Side: 'right-top', PortType: 'value' },
					{ Name: 'Error', Side: 'bottom', PortType: 'error' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 340,
					DefaultHeight: 220,
					Title: 'Read JSON Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardReadJSON',
							Sections: [{ Name: 'File', Hash: 'RJSection', Groups: [{ Name: 'Settings', Hash: 'RJGroup' }] }],
							Descriptors:
							{
								'Record.Data.File': { Name: 'File Path', Hash: 'File', DataType: 'String', Default: '', PictForm: { Section: 'RJSection', Group: 'RJGroup', Row: 1, Width: 12 } },
								'Record.Data.Destination': { Name: 'State Destination', Hash: 'Destination', DataType: 'String', Default: '', PictForm: { Section: 'RJSection', Group: 'RJGroup', Row: 2, Width: 12 } }
							}
						}
					}
				}
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = FlowCardReadJSON;
