const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardGetJSON extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'GET JSON',
				Code: 'GETJSON',
				Description: 'HTTP GET request, parse response as JSON.',
				Category: 'REST',
				TitleBarColor: '#e65100',
				BodyStyle: { fill: '#fff3e0', stroke: '#e65100' },
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
					DefaultWidth: 380,
					DefaultHeight: 280,
					Title: 'GET JSON Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardGetJSON',
							Sections: [{ Name: 'Request', Hash: 'GJSection', Groups: [{ Name: 'Settings', Hash: 'GJGroup' }] }],
							Descriptors:
							{
								'Record.Data.URL': { Name: 'URL', Hash: 'URL', DataType: 'String', Default: '', PictForm: { Section: 'GJSection', Group: 'GJGroup', Row: 1, Width: 12 } },
								'Record.Data.Headers': { Name: 'Headers (JSON)', Hash: 'Headers', DataType: 'String', Default: '', PictForm: { Section: 'GJSection', Group: 'GJGroup', Row: 2, Width: 12, InputType: 'TextArea' } },
								'Record.Data.Destination': { Name: 'State Destination', Hash: 'Destination', DataType: 'String', Default: '', PictForm: { Section: 'GJSection', Group: 'GJGroup', Row: 3, Width: 12 } }
							}
						}
					}
				}
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = FlowCardGetJSON;
