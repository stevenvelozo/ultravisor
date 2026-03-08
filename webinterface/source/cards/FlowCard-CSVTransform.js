const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardCSVTransform extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'CSV Transform',
				Code: 'CSVXF',
				Description: 'Transform CSV data into structured records.',
				Category: 'Meadow',
				TitleBarColor: '#2e7d32',
				BodyStyle: { fill: '#e8f5e9', stroke: '#2e7d32' },
				Width: 200,
				Height: 80,
				Inputs:
				[
					{ Name: 'CSV Data', Side: 'left', PortType: 'value', MinimumInputCount: 1, MaximumInputCount: 1 },
					{ Name: 'Delimiter', Side: 'top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Records', Side: 'right', PortType: 'value' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form', DefaultWidth: 360, DefaultHeight: 260, Title: 'CSV Transform Settings',
					Configuration: { Manifest: { Scope: 'FlowCardCSVTransform',
						Sections: [{ Name: 'Transform', Hash: 'CSVSection', Groups: [{ Name: 'Settings', Hash: 'CSVGroup' }] }],
						Descriptors: {
							'Record.Data.SourceAddress': { Name: 'Source State Address', Hash: 'SourceAddress', DataType: 'String', Default: '', PictForm: { Section: 'CSVSection', Group: 'CSVGroup', Row: 1, Width: 12 } },
							'Record.Data.Destination': { Name: 'Result Destination', Hash: 'Destination', DataType: 'String', Default: '', PictForm: { Section: 'CSVSection', Group: 'CSVGroup', Row: 2, Width: 12 } },
							'Record.Data.Delimiter': { Name: 'Delimiter', Hash: 'Delimiter', DataType: 'String', Default: ',', PictForm: { Section: 'CSVSection', Group: 'CSVGroup', Row: 3, Width: 6 } }
						}
					}}
				}
			}, pOptions), pServiceHash);
	}
}

module.exports = FlowCardCSVTransform;
