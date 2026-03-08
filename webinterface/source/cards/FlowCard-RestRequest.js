const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardRestRequest extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'REST Request',
				Code: 'REST',
				Description: 'Generic REST request with full control over method, headers, and cookies.',
				Category: 'REST',
				TitleBarColor: '#e65100',
				BodyStyle: { fill: '#fff3e0', stroke: '#e65100' },
				Width: 200,
				Height: 80,
				Inputs:
				[
					{ Name: 'In', Side: 'left', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'URL', Side: 'top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Response', Side: 'right', PortType: 'value' },
					{ Name: 'Error', Side: 'bottom', PortType: 'error' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 400,
					DefaultHeight: 400,
					Title: 'REST Request Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardRestRequest',
							Sections: [{ Name: 'Request', Hash: 'RESTSection', Groups: [{ Name: 'Settings', Hash: 'RESTGroup' }] }],
							Descriptors:
							{
								'Record.Data.URL': { Name: 'URL', Hash: 'URL', DataType: 'String', Default: '', PictForm: { Section: 'RESTSection', Group: 'RESTGroup', Row: 1, Width: 12 } },
								'Record.Data.Method': { Name: 'HTTP Method', Hash: 'Method', DataType: 'String', Default: 'GET', PictForm: { Section: 'RESTSection', Group: 'RESTGroup', Row: 2, Width: 4 } },
								'Record.Data.ContentType': { Name: 'Content Type', Hash: 'ContentType', DataType: 'String', Default: 'application/json', PictForm: { Section: 'RESTSection', Group: 'RESTGroup', Row: 2, Width: 8 } },
								'Record.Data.Headers': { Name: 'Headers (JSON)', Hash: 'Headers', DataType: 'String', Default: '', PictForm: { Section: 'RESTSection', Group: 'RESTGroup', Row: 3, Width: 12, InputType: 'TextArea' } },
								'Record.Data.Body': { Name: 'Body State Address', Hash: 'Body', DataType: 'String', Default: '', PictForm: { Section: 'RESTSection', Group: 'RESTGroup', Row: 4, Width: 12 } },
								'Record.Data.Destination': { Name: 'Response Destination', Hash: 'Destination', DataType: 'String', Default: '', PictForm: { Section: 'RESTSection', Group: 'RESTGroup', Row: 5, Width: 12 } },
								'Record.Data.Retries': { Name: 'Max Retries', Hash: 'Retries', DataType: 'Number', Default: 0, PictForm: { Section: 'RESTSection', Group: 'RESTGroup', Row: 6, Width: 6 } }
							}
						}
					}
				}
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = FlowCardRestRequest;
