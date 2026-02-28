const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardMeadowReads extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Meadow Reads',
				Code: 'MREADS',
				Description: 'Read multiple records with pagination via Meadow REST endpoint.',
				Category: 'Meadow',
				TitleBarColor: '#2e7d32',
				BodyStyle: { fill: '#e8f5e9', stroke: '#2e7d32' },
				Width: 200,
				Height: 80,
				Inputs: [{ Name: 'Trigger', Side: 'left', MinimumInputCount: 0, MaximumInputCount: 1 }],
				Outputs: [{ Name: 'Records', Side: 'right' }, { Name: 'Error', Side: 'bottom' }],
				PropertiesPanel:
				{
					PanelType: 'Form', DefaultWidth: 360, DefaultHeight: 300, Title: 'Meadow Reads Settings',
					Configuration: { Manifest: { Scope: 'FlowCardMeadowReads',
						Sections: [{ Name: 'Entity', Hash: 'MRSSection', Groups: [{ Name: 'Settings', Hash: 'MRSGroup' }] }],
						Descriptors: {
							'Record.Data.Entity': { Name: 'Entity Name', Hash: 'Entity', DataType: 'String', Default: '', PictForm: { Section: 'MRSSection', Group: 'MRSGroup', Row: 1, Width: 12 } },
							'Record.Data.Endpoint': { Name: 'API Endpoint', Hash: 'Endpoint', DataType: 'String', Default: '', PictForm: { Section: 'MRSSection', Group: 'MRSGroup', Row: 2, Width: 12 } },
							'Record.Data.Filter': { Name: 'Filter Expression', Hash: 'Filter', DataType: 'String', Default: '', PictForm: { Section: 'MRSSection', Group: 'MRSGroup', Row: 3, Width: 12 } },
							'Record.Data.Destination': { Name: 'State Destination', Hash: 'Destination', DataType: 'String', Default: '', PictForm: { Section: 'MRSSection', Group: 'MRSGroup', Row: 4, Width: 12 } }
						}
					}}
				}
			}, pOptions), pServiceHash);
	}
}

module.exports = FlowCardMeadowReads;
