const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardConditional extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Conditional',
				Code: 'COND',
				Description: 'Evaluate a condition and branch to True or False path.',
				Category: 'Core',
				TitleBarColor: '#7b1fa2',
				BodyStyle: { fill: '#f3e5f5', stroke: '#7b1fa2' },
				Width: 200,
				Height: 100,
				Inputs:
				[
					{ Name: 'In', Side: 'left', PortType: 'event-in', MinimumInputCount: 1, MaximumInputCount: 1 },
					{ Name: 'Address', Side: 'top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'Value', Side: 'top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'True', Side: 'right', PortType: 'event-out' },
					{ Name: 'False', Side: 'bottom', PortType: 'event-out' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 350,
					DefaultHeight: 280,
					Title: 'Conditional Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardConditional',
							Sections:
							[
								{
									Name: 'Condition',
									Hash: 'CondSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'CondGroup' }
									]
								}
							],
							Descriptors:
							{
								'Record.Data.Address':
								{
									Name: 'State Address',
									Hash: 'Address',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'CondSection', Group: 'CondGroup', Row: 1, Width: 12 }
								},
								'Record.Data.Value':
								{
									Name: 'Expected Value',
									Hash: 'Value',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'CondSection', Group: 'CondGroup', Row: 2, Width: 12 }
								},
								'Record.Data.Operator':
								{
									Name: 'Operator',
									Hash: 'Operator',
									DataType: 'String',
									Default: '==',
									PictForm: { Section: 'CondSection', Group: 'CondGroup', Row: 3, Width: 6 }
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

module.exports = FlowCardConditional;
