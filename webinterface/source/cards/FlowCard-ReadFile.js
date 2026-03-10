const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardReadFile extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Read File',
				Code: 'read-file',
				Description: 'Reads a file from disk into state.',
				Category: 'File I/O',
				TitleBarColor: '#2980b9',
				BodyStyle: { fill: '#eaf2f8', stroke: '#2980b9' },
				Width: 200,
				Height: 100,
				Inputs:
				[
					{ Name: 'BeginRead', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'FilePath', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'ReadComplete', Side: 'right', PortType: 'event-out' },
					{ Name: 'FileContent', Side: 'right-top', PortType: 'value' },
					{ Name: 'Error', Side: 'bottom', PortType: 'error' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 340,
					DefaultHeight: 260,
					Title: 'Read File Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardReadFile',
							Sections:
							[
								{
									Name: 'File',
									Hash: 'ReadFileSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'ReadFileGroup' }
									]
								}
							],
							Descriptors:
							{
								'Record.Data.FilePath':
								{
									Name: 'File Path',
									Hash: 'FilePath',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'ReadFileSection', Group: 'ReadFileGroup', Row: 1, Width: 12 }
								},
								'Record.Data.Encoding':
								{
									Name: 'Encoding',
									Hash: 'Encoding',
									DataType: 'String',
									Default: 'utf8',
									PictForm: { Section: 'ReadFileSection', Group: 'ReadFileGroup', Row: 2, Width: 6 }
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

module.exports = FlowCardReadFile;
