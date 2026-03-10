const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardIfConditional extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'If Conditional',
				Code: 'if-conditional',
				Description: 'Evaluates a condition and branches execution to True or False.',
				Category: 'Core',
				TitleBarColor: '#7b1fa2',
				BodyStyle: { fill: '#f3e5f5', stroke: '#7b1fa2' },
				Width: 200,
				Height: 100,
				Inputs:
				[
					{ Name: 'Evaluate', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'DataAddress', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'CompareValue', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
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
					DefaultHeight: 320,
					Title: 'If Conditional Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardIfConditional',
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
								'Record.Data.DataAddress':
								{
									Name: 'State Address',
									Hash: 'DataAddress',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'CondSection', Group: 'CondGroup', Row: 1, Width: 12 }
								},
								'Record.Data.CompareValue':
								{
									Name: 'Expected Value',
									Hash: 'CompareValue',
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
								},
								'Record.Data.Expression':
								{
									Name: 'Expression',
									Hash: 'Expression',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'CondSection', Group: 'CondGroup', Row: 4, Width: 12 }
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

module.exports = FlowCardIfConditional;
