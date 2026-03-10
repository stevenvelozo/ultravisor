const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardSetValues extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Set Values',
				Code: 'set-values',
				Description: 'Sets one or more values in state at specified addresses.',
				Category: 'Data',
				TitleBarColor: '#e65100',
				BodyStyle: { fill: '#fff3e0', stroke: '#e65100' },
				Width: 180,
				Height: 80,
				Inputs:
				[
					{ Name: 'Execute', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Complete', Side: 'right', PortType: 'event-out' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 380,
					DefaultHeight: 260,
					Title: 'Set Values Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardSetValues',
							Sections:
							[
								{
									Name: 'Mappings',
									Hash: 'SetValSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'SetValGroup' }
									]
								}
							],
							Descriptors:
							{
								'Record.Data.Mappings':
								{
									Name: 'Mappings (JSON)',
									Hash: 'Mappings',
									DataType: 'String',
									Default: '[]',
									PictForm: { Section: 'SetValSection', Group: 'SetValGroup', Row: 1, Width: 12, InputType: 'TextArea' }
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

module.exports = FlowCardSetValues;
