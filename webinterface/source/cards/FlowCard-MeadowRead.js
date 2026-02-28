const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardMeadowRead extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Meadow Read',
				Code: 'MREAD',
				Description: 'Read a single record via Meadow REST endpoint.',
				Category: 'Meadow',
				TitleBarColor: '#2e7d32',
				BodyStyle: { fill: '#e8f5e9', stroke: '#2e7d32' },
				Width: 200,
				Height: 80,
				Inputs: [{ Name: 'Trigger', Side: 'left', MinimumInputCount: 0, MaximumInputCount: 1 }],
				Outputs: [{ Name: 'Record', Side: 'right' }, { Name: 'Error', Side: 'bottom' }],
				PropertiesPanel:
				{
					PanelType: 'Form', DefaultWidth: 360, DefaultHeight: 280, Title: 'Meadow Read Settings',
					Configuration: { Manifest: { Scope: 'FlowCardMeadowRead',
						Sections: [{ Name: 'Entity', Hash: 'MRSection', Groups: [{ Name: 'Settings', Hash: 'MRGroup' }] }],
						Descriptors: {
							'Record.Data.Entity': { Name: 'Entity Name', Hash: 'Entity', DataType: 'String', Default: '', PictForm: { Section: 'MRSection', Group: 'MRGroup', Row: 1, Width: 12 } },
							'Record.Data.Endpoint': { Name: 'API Endpoint', Hash: 'Endpoint', DataType: 'String', Default: '', PictForm: { Section: 'MRSection', Group: 'MRGroup', Row: 2, Width: 12 } },
							'Record.Data.RecordID': { Name: 'Record ID', Hash: 'RecordID', DataType: 'String', Default: '', PictForm: { Section: 'MRSection', Group: 'MRGroup', Row: 3, Width: 6 } },
							'Record.Data.Destination': { Name: 'State Destination', Hash: 'Destination', DataType: 'String', Default: '', PictForm: { Section: 'MRSection', Group: 'MRGroup', Row: 3, Width: 6 } }
						}
					}}
				}
			}, pOptions), pServiceHash);
	}
}

module.exports = FlowCardMeadowRead;
