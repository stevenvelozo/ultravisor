const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardWriteJSON extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Write JSON',
				Code: 'WJSON',
				Description: 'Write a JSON object to the staging folder.',
				Category: 'File I/O',
				TitleBarColor: '#2980b9',
				BodyStyle: { fill: '#eaf2f8', stroke: '#2980b9' },
				Width: 180,
				Height: 80,
				Inputs:
				[
					{ Name: 'Data', Side: 'left-top', PortType: 'value', MinimumInputCount: 1, MaximumInputCount: 1 },
					{ Name: 'File', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Done', Side: 'right', PortType: 'event-out' },
					{ Name: 'Error', Side: 'bottom', PortType: 'error' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 340,
					DefaultHeight: 220,
					Title: 'Write JSON Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardWriteJSON',
							Sections: [{ Name: 'File', Hash: 'WJSection', Groups: [{ Name: 'Settings', Hash: 'WJGroup' }] }],
							Descriptors:
							{
								'Record.Data.File': { Name: 'File Path', Hash: 'File', DataType: 'String', Default: '', PictForm: { Section: 'WJSection', Group: 'WJGroup', Row: 1, Width: 12 } },
								'Record.Data.Address': { Name: 'State Address', Hash: 'Address', DataType: 'String', Default: '', PictForm: { Section: 'WJSection', Group: 'WJGroup', Row: 2, Width: 12 } }
							}
						}
					}
				}
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = FlowCardWriteJSON;
