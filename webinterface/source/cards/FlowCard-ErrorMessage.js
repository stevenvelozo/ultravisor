const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardErrorMessage extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Error Message',
				Code: 'error-message',
				Description: 'Logs an error or warning message to the execution log.',
				Category: 'Interaction',
				TitleBarColor: '#c62828',
				BodyStyle: { fill: '#ffebee', stroke: '#c62828' },
				Width: 220,
				Height: 80,
				Inputs:
				[
					{ Name: 'Trigger', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Complete', Side: 'right', PortType: 'event-out' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 360,
					DefaultHeight: 220,
					Title: 'Error Message Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardErrorMessage',
							Sections:
							[
								{
									Name: 'Message',
									Hash: 'ErrorMsgSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'ErrorMsgGroup' }
									]
								}
							],
							Descriptors:
							{
								'Record.Data.MessageTemplate':
								{
									Name: 'Message Template',
									Hash: 'MessageTemplate',
									DataType: 'String',
									Default: 'An error occurred.',
									PictForm: { Section: 'ErrorMsgSection', Group: 'ErrorMsgGroup', Row: 1, Width: 12, InputType: 'TextArea' }
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

module.exports = FlowCardErrorMessage;
