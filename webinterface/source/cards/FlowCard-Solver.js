const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardSolver extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Solver',
				Code: 'SOLV',
				Description: 'Evaluate a mathematical expression and store the result.',
				Category: 'Core',
				TitleBarColor: '#7b1fa2',
				BodyStyle: { fill: '#f3e5f5', stroke: '#7b1fa2' },
				Width: 180,
				Height: 80,
				Inputs:
				[
					{ Name: 'In', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 1, MaximumInputCount: 1 },
					{ Name: 'Expression', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Result', Side: 'right-top', PortType: 'value' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 350,
					DefaultHeight: 220,
					Title: 'Solver Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardSolver',
							Sections:
							[
								{
									Name: 'Expression',
									Hash: 'SolverSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'SolverGroup' }
									]
								}
							],
							Descriptors:
							{
								'Record.Data.Expression':
								{
									Name: 'Expression',
									Hash: 'Expression',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'SolverSection', Group: 'SolverGroup', Row: 1, Width: 12, InputType: 'TextArea' }
								},
								'Record.Data.Destination':
								{
									Name: 'Result Destination',
									Hash: 'Destination',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'SolverSection', Group: 'SolverGroup', Row: 2, Width: 12 }
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

module.exports = FlowCardSolver;
