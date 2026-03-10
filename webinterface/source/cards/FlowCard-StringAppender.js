const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardStringAppender extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'String Appender',
				Code: 'string-appender',
				Description: 'Appends a string to a value at a specified state address.',
				Category: 'Data',
				TitleBarColor: '#e65100',
				BodyStyle: { fill: '#fff3e0', stroke: '#e65100' },
				Width: 220,
				Height: 100,
				Inputs:
				[
					{ Name: 'Append', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'InputString', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Completed', Side: 'right', PortType: 'event-out' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 360,
					DefaultHeight: 300,
					Title: 'String Appender Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardStringAppender',
							Sections:
							[
								{
									Name: 'Appender',
									Hash: 'AppendSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'AppendGroup' }
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
									PictForm: { Section: 'AppendSection', Group: 'AppendGroup', Row: 1, Width: 12, InputType: 'TextArea' }
								},
								'Record.Data.OutputAddress':
								{
									Name: 'Output Address',
									Hash: 'OutputAddress',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'AppendSection', Group: 'AppendGroup', Row: 2, Width: 12 }
								},
								'Record.Data.AppendNewline':
								{
									Name: 'Append Newline',
									Hash: 'AppendNewline',
									DataType: 'Boolean',
									Default: false,
									PictForm: { Section: 'AppendSection', Group: 'AppendGroup', Row: 3, Width: 6 }
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

module.exports = FlowCardStringAppender;
