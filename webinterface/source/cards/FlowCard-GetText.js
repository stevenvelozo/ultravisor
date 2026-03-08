const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardGetText extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'GET Text',
				Code: 'GETTXT',
				Description: 'HTTP GET request, return response as text.',
				Category: 'REST',
				TitleBarColor: '#e65100',
				BodyStyle: { fill: '#fff3e0', stroke: '#e65100' },
				Width: 180,
				Height: 80,
				Inputs:
				[
					{ Name: 'Trigger', Side: 'left', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'URL', Side: 'top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Data', Side: 'right', PortType: 'value' },
					{ Name: 'Error', Side: 'bottom', PortType: 'error' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 380,
					DefaultHeight: 240,
					Title: 'GET Text Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardGetText',
							Sections: [{ Name: 'Request', Hash: 'GTSection', Groups: [{ Name: 'Settings', Hash: 'GTGroup' }] }],
							Descriptors:
							{
								'Record.Data.URL': { Name: 'URL', Hash: 'URL', DataType: 'String', Default: '', PictForm: { Section: 'GTSection', Group: 'GTGroup', Row: 1, Width: 12 } },
								'Record.Data.Destination': { Name: 'State Destination', Hash: 'Destination', DataType: 'String', Default: '', PictForm: { Section: 'GTSection', Group: 'GTGroup', Row: 2, Width: 12 } }
							}
						}
					}
				}
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = FlowCardGetText;
