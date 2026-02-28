const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardMeadowCount extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Meadow Count',
				Code: 'MCOUNT',
				Description: 'Count records via Meadow REST endpoint.',
				Category: 'Meadow',
				TitleBarColor: '#2e7d32',
				BodyStyle: { fill: '#e8f5e9', stroke: '#2e7d32' },
				Width: 200,
				Height: 80,
				Inputs: [{ Name: 'Trigger', Side: 'left', MinimumInputCount: 0, MaximumInputCount: 1 }],
				Outputs: [{ Name: 'Count', Side: 'right' }, { Name: 'Error', Side: 'bottom' }],
				PropertiesPanel:
				{
					PanelType: 'Form', DefaultWidth: 360, DefaultHeight: 260, Title: 'Meadow Count Settings',
					Configuration: { Manifest: { Scope: 'FlowCardMeadowCount',
						Sections: [{ Name: 'Entity', Hash: 'MCNTSection', Groups: [{ Name: 'Settings', Hash: 'MCNTGroup' }] }],
						Descriptors: {
							'Record.Data.Entity': { Name: 'Entity Name', Hash: 'Entity', DataType: 'String', Default: '', PictForm: { Section: 'MCNTSection', Group: 'MCNTGroup', Row: 1, Width: 12 } },
							'Record.Data.Endpoint': { Name: 'API Endpoint', Hash: 'Endpoint', DataType: 'String', Default: '', PictForm: { Section: 'MCNTSection', Group: 'MCNTGroup', Row: 2, Width: 12 } },
							'Record.Data.Destination': { Name: 'State Destination', Hash: 'Destination', DataType: 'String', Default: '', PictForm: { Section: 'MCNTSection', Group: 'MCNTGroup', Row: 3, Width: 12 } }
						}
					}}
				}
			}, pOptions), pServiceHash);
	}
}

module.exports = FlowCardMeadowCount;
