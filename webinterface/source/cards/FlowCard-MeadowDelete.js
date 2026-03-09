const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardMeadowDelete extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Meadow Delete',
				Code: 'MDELETE',
				Description: 'Soft-delete a record via Meadow REST endpoint.',
				Category: 'Meadow',
				TitleBarColor: '#2e7d32',
				BodyStyle: { fill: '#e8f5e9', stroke: '#2e7d32' },
				Width: 200,
				Height: 80,
				Inputs:
				[
					{ Name: 'Trigger', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 1, MaximumInputCount: 1 },
					{ Name: 'Entity', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'IDRecord', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Done', Side: 'right', PortType: 'event-out' },
					{ Name: 'Error', Side: 'bottom', PortType: 'error' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form', DefaultWidth: 360, DefaultHeight: 240, Title: 'Meadow Delete Settings',
					Configuration: { Manifest: { Scope: 'FlowCardMeadowDelete',
						Sections: [{ Name: 'Entity', Hash: 'MDSection', Groups: [{ Name: 'Settings', Hash: 'MDGroup' }] }],
						Descriptors: {
							'Record.Data.Entity': { Name: 'Entity Name', Hash: 'Entity', DataType: 'String', Default: '', PictForm: { Section: 'MDSection', Group: 'MDGroup', Row: 1, Width: 12 } },
							'Record.Data.Endpoint': { Name: 'API Endpoint', Hash: 'Endpoint', DataType: 'String', Default: '', PictForm: { Section: 'MDSection', Group: 'MDGroup', Row: 2, Width: 12 } },
							'Record.Data.RecordID': { Name: 'Record ID', Hash: 'RecordID', DataType: 'String', Default: '', PictForm: { Section: 'MDSection', Group: 'MDGroup', Row: 3, Width: 12 } }
						}
					}}
				}
			}, pOptions), pServiceHash);
	}
}

module.exports = FlowCardMeadowDelete;
