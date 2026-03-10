const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardReplaceString extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Replace String',
				Code: 'replace-string',
				Description: 'Replaces all occurrences of a search string within the input.',
				Category: 'Data',
				TitleBarColor: '#e65100',
				BodyStyle: { fill: '#fff3e0', stroke: '#e65100' },
				Width: 220,
				Height: 100,
				Inputs:
				[
					{ Name: 'Replace', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'InputString', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'ReplaceComplete', Side: 'right', PortType: 'event-out' },
					{ Name: 'ReplacedString', Side: 'right-top', PortType: 'value' },
					{ Name: 'Error', Side: 'bottom', PortType: 'error' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 360,
					DefaultHeight: 300,
					Title: 'Replace String Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardReplaceString',
							Sections:
							[
								{
									Name: 'Replace',
									Hash: 'ReplaceSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'ReplaceGroup' }
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
									PictForm: { Section: 'ReplaceSection', Group: 'ReplaceGroup', Row: 1, Width: 12, InputType: 'TextArea' }
								},
								'Record.Data.SearchString':
								{
									Name: 'Search String',
									Hash: 'SearchString',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'ReplaceSection', Group: 'ReplaceGroup', Row: 2, Width: 12 }
								},
								'Record.Data.ReplaceString':
								{
									Name: 'Replace With',
									Hash: 'ReplaceString',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'ReplaceSection', Group: 'ReplaceGroup', Row: 3, Width: 12 }
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

module.exports = FlowCardReplaceString;
