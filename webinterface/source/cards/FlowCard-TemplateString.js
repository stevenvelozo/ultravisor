const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardTemplateString extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Template String',
				Code: 'TMPL',
				Description: 'Interpolate a template string with state values.',
				Category: 'Core',
				TitleBarColor: '#7b1fa2',
				BodyStyle: { fill: '#f3e5f5', stroke: '#7b1fa2' },
				Width: 190,
				Height: 80,
				Inputs:
				[
					{ Name: 'In', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 1, MaximumInputCount: 1 },
					{ Name: 'Template', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Result', Side: 'right-top', PortType: 'value' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 380,
					DefaultHeight: 240,
					Title: 'Template Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardTemplateString',
							Sections:
							[
								{
									Name: 'Template',
									Hash: 'TmplSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'TmplGroup' }
									]
								}
							],
							Descriptors:
							{
								'Record.Data.Template':
								{
									Name: 'Template',
									Hash: 'Template',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'TmplSection', Group: 'TmplGroup', Row: 1, Width: 12, InputType: 'TextArea' }
								},
								'Record.Data.Destination':
								{
									Name: 'Result Destination',
									Hash: 'Destination',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'TmplSection', Group: 'TmplGroup', Row: 2, Width: 12 }
								}
							}
						}
					}
				}
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = FlowCardTemplateString;
