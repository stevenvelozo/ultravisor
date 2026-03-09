const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardMeadowCreate extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Meadow Create',
				Code: 'MCREATE',
				Description: 'Create a record via Meadow REST endpoint.',
				Category: 'Meadow',
				TitleBarColor: '#2e7d32',
				BodyStyle: { fill: '#e8f5e9', stroke: '#2e7d32' },
				Width: 200,
				Height: 80,
				Inputs:
				[
					{ Name: 'Data', Side: 'left-top', PortType: 'value', MinimumInputCount: 1, MaximumInputCount: 1 },
					{ Name: 'Entity', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Created', Side: 'right-top', PortType: 'value' },
					{ Name: 'Error', Side: 'bottom', PortType: 'error' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form', DefaultWidth: 360, DefaultHeight: 260, Title: 'Meadow Create Settings',
					Configuration: { Manifest: { Scope: 'FlowCardMeadowCreate',
						Sections: [{ Name: 'Entity', Hash: 'MCSection', Groups: [{ Name: 'Settings', Hash: 'MCGroup' }] }],
						Descriptors: {
							'Record.Data.Entity': { Name: 'Entity Name', Hash: 'Entity', DataType: 'String', Default: '', PictForm: { Section: 'MCSection', Group: 'MCGroup', Row: 1, Width: 12 } },
							'Record.Data.Endpoint': { Name: 'API Endpoint', Hash: 'Endpoint', DataType: 'String', Default: '', PictForm: { Section: 'MCSection', Group: 'MCGroup', Row: 2, Width: 12 } },
							'Record.Data.DataAddress': { Name: 'Data State Address', Hash: 'DataAddress', DataType: 'String', Default: '', PictForm: { Section: 'MCSection', Group: 'MCGroup', Row: 3, Width: 12 } }
						}
					}}
				}
			}, pOptions), pServiceHash);
	}
}

module.exports = FlowCardMeadowCreate;
