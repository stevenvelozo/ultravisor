const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardWriteFile extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Write File',
				Code: 'write-file',
				Description: 'Writes content to a file on disk.',
				Category: 'File I/O',
				TitleBarColor: '#2980b9',
				BodyStyle: { fill: '#eaf2f8', stroke: '#2980b9' },
				Width: 200,
				Height: 80,
				Inputs:
				[
					{ Name: 'BeginWrite', Side: 'left-bottom', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'WriteComplete', Side: 'right', PortType: 'event-out' },
					{ Name: 'Error', Side: 'bottom', PortType: 'error' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 360,
					DefaultHeight: 300,
					Title: 'Write File Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardWriteFile',
							Sections:
							[
								{
									Name: 'File',
									Hash: 'WriteFileSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'WriteFileGroup' }
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
									PictForm: { Section: 'WriteFileSection', Group: 'WriteFileGroup', Row: 1, Width: 12 }
								},
								'Record.Data.Content':
								{
									Name: 'Content',
									Hash: 'Content',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'WriteFileSection', Group: 'WriteFileGroup', Row: 2, Width: 12, InputType: 'TextArea' }
								},
								'Record.Data.Encoding':
								{
									Name: 'Encoding',
									Hash: 'Encoding',
									DataType: 'String',
									Default: 'utf8',
									PictForm: { Section: 'WriteFileSection', Group: 'WriteFileGroup', Row: 3, Width: 6 }
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

module.exports = FlowCardWriteFile;
