const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardSendJSON extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Send JSON',
				Code: 'SENDJSON',
				Description: 'Send a JSON payload via POST or PUT.',
				Category: 'REST',
				TitleBarColor: '#e65100',
				BodyStyle: { fill: '#fff3e0', stroke: '#e65100' },
				Width: 180,
				Height: 80,
				Inputs:
				[
					{ Name: 'Data', Side: 'left', MinimumInputCount: 1, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Response', Side: 'right' },
					{ Name: 'Error', Side: 'bottom' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 380,
					DefaultHeight: 320,
					Title: 'Send JSON Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardSendJSON',
							Sections: [{ Name: 'Request', Hash: 'SJSection', Groups: [{ Name: 'Settings', Hash: 'SJGroup' }] }],
							Descriptors:
							{
								'Record.Data.URL': { Name: 'URL', Hash: 'URL', DataType: 'String', Default: '', PictForm: { Section: 'SJSection', Group: 'SJGroup', Row: 1, Width: 12 } },
								'Record.Data.Method': { Name: 'HTTP Method', Hash: 'Method', DataType: 'String', Default: 'POST', PictForm: { Section: 'SJSection', Group: 'SJGroup', Row: 2, Width: 6 } },
								'Record.Data.Address': { Name: 'Body State Address', Hash: 'Address', DataType: 'String', Default: '', PictForm: { Section: 'SJSection', Group: 'SJGroup', Row: 2, Width: 6 } },
								'Record.Data.Headers': { Name: 'Headers (JSON)', Hash: 'Headers', DataType: 'String', Default: '', PictForm: { Section: 'SJSection', Group: 'SJGroup', Row: 3, Width: 12, InputType: 'TextArea' } },
								'Record.Data.Destination': { Name: 'Response Destination', Hash: 'Destination', DataType: 'String', Default: '', PictForm: { Section: 'SJSection', Group: 'SJGroup', Row: 4, Width: 12 } }
							}
						}
					}
				}
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = FlowCardSendJSON;
