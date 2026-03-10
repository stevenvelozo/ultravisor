const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardSplitExecute extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Split Execute',
				Code: 'split-execute',
				Description: 'Split a string by delimiter and process each token through a sub-graph.',
				Category: 'Core',
				TitleBarColor: '#00695c',
				BodyStyle: { fill: '#e0f2f1', stroke: '#00695c' },
				Width: 240,
				Height: 120,
				Inputs:
				[
					{ Name: 'PerformSplit', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'StepComplete', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'InputString', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'TokenDataSent', Side: 'right', PortType: 'event-out' },
					{ Name: 'CompletedAllSubtasks', Side: 'right-bottom', PortType: 'event-out' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 360,
					DefaultHeight: 260,
					Title: 'Split Execute Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardSplitExecute',
							Sections:
							[
								{
									Name: 'Split',
									Hash: 'SplitSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'SplitGroup' }
									]
								}
							],
							Descriptors:
							{
								'Record.Data.InputString':
								{
									Name: 'Input String',
									Hash: 'InputString',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'SplitSection', Group: 'SplitGroup', Row: 1, Width: 12, InputType: 'TextArea' }
								},
								'Record.Data.SplitDelimiter':
								{
									Name: 'Split Delimiter',
									Hash: 'SplitDelimiter',
									DataType: 'String',
									Default: '\\n',
									PictForm: { Section: 'SplitSection', Group: 'SplitGroup', Row: 2, Width: 12 }
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

module.exports = FlowCardSplitExecute;
