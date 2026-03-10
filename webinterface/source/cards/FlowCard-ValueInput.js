const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardValueInput extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Value Input',
				Code: 'value-input',
				Description: 'Pauses execution and waits for user-provided input.',
				Category: 'Interaction',
				TitleBarColor: '#f57f17',
				BodyStyle: { fill: '#fffde7', stroke: '#f57f17' },
				Width: 220,
				Height: 100,
				Inputs:
				[
					{ Name: 'RequestInput', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'ValueInputComplete', Side: 'right', PortType: 'event-out' },
					{ Name: 'InputValue', Side: 'right-top', PortType: 'value' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 360,
					DefaultHeight: 260,
					Title: 'Value Input Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardValueInput',
							Sections:
							[
								{
									Name: 'Input',
									Hash: 'ValueInputSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'ValueInputGroup' }
									]
								}
							],
							Descriptors:
							{
								'Record.Data.PromptMessage':
								{
									Name: 'Prompt Message',
									Hash: 'PromptMessage',
									DataType: 'String',
									Default: 'Please provide a value:',
									PictForm: { Section: 'ValueInputSection', Group: 'ValueInputGroup', Row: 1, Width: 12 }
								},
								'Record.Data.OutputAddress':
								{
									Name: 'Output Address',
									Hash: 'OutputAddress',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'ValueInputSection', Group: 'ValueInputGroup', Row: 2, Width: 12 }
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

module.exports = FlowCardValueInput;
