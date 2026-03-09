const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardParseCSV extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Parse CSV',
				Code: 'PARSECSV',
				Description: 'Parse raw CSV text into an array of record objects.',
				Category: 'Pipeline',
				TitleBarColor: '#c62828',
				BodyStyle: { fill: '#ffebee', stroke: '#c62828' },
				Width: 180,
				Height: 80,
				Inputs:
				[
					{ Name: 'Raw Text', Side: 'left-top', PortType: 'value', MinimumInputCount: 1, MaximumInputCount: 1 },
					{ Name: 'Delimiter', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Records', Side: 'right-top', PortType: 'value' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 340,
					DefaultHeight: 240,
					Title: 'Parse CSV Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardParseCSV',
							Sections:
							[
								{
									Name: 'Parser',
									Hash: 'ParseSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'ParseGroup' }
									]
								}
							],
							Descriptors:
							{
								'Record.Data.Delimiter':
								{
									Name: 'Delimiter',
									Hash: 'Delimiter',
									DataType: 'String',
									Default: ',',
									PictForm: { Section: 'ParseSection', Group: 'ParseGroup', Row: 1, Width: 4 }
								},
								'Record.Data.HasHeaders':
								{
									Name: 'Has Headers',
									Hash: 'HasHeaders',
									DataType: 'Boolean',
									Default: true,
									PictForm: { Section: 'ParseSection', Group: 'ParseGroup', Row: 1, Width: 4 }
								},
								'Record.Data.Destination':
								{
									Name: 'State Destination',
									Hash: 'Destination',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'ParseSection', Group: 'ParseGroup', Row: 2, Width: 12 }
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

module.exports = FlowCardParseCSV;
