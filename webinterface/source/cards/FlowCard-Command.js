const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardCommand extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Command',
				Code: 'CMD',
				Description: 'Execute a shell command on the node.',
				Category: 'Core',
				TitleBarColor: '#7b1fa2',
				BodyStyle: { fill: '#f3e5f5', stroke: '#7b1fa2' },
				Width: 180,
				Height: 80,
				Inputs:
				[
					{ Name: 'Trigger', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'Command', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Complete', Side: 'right', PortType: 'event-out' },
					{ Name: 'Error', Side: 'bottom', PortType: 'error' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 350,
					DefaultHeight: 260,
					Title: 'Command Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardCommand',
							Sections:
							[
								{
									Name: 'Command Configuration',
									Hash: 'CommandSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'CommandGroup' }
									]
								}
							],
							Descriptors:
							{
								'Record.Data.Command':
								{
									Name: 'Command',
									Hash: 'Command',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'CommandSection', Group: 'CommandGroup', Row: 1, Width: 12 }
								},
								'Record.Data.Parameters':
								{
									Name: 'Parameters',
									Hash: 'Parameters',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'CommandSection', Group: 'CommandGroup', Row: 2, Width: 12 }
								},
								'Record.Data.Description':
								{
									Name: 'Description',
									Hash: 'Description',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'CommandSection', Group: 'CommandGroup', Row: 3, Width: 12, InputType: 'TextArea' }
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

module.exports = FlowCardCommand;
