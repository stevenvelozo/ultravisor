const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardCopyFile extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Copy File',
				Code: 'CPFILE',
				Description: 'Copy a file within the staging folder.',
				Category: 'File I/O',
				TitleBarColor: '#2980b9',
				BodyStyle: { fill: '#eaf2f8', stroke: '#2980b9' },
				Width: 200,
				Height: 80,
				Inputs:
				[
					{ Name: 'Trigger', Side: 'left', PortType: 'event-in', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'Source', Side: 'top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 },
					{ Name: 'Target', Side: 'top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Done', Side: 'right', PortType: 'event-out' },
					{ Name: 'Error', Side: 'bottom', PortType: 'error' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 340,
					DefaultHeight: 220,
					Title: 'Copy File Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardCopyFile',
							Sections: [{ Name: 'Copy', Hash: 'CPSection', Groups: [{ Name: 'Settings', Hash: 'CPGroup' }] }],
							Descriptors:
							{
								'Record.Data.Source': { Name: 'Source File', Hash: 'Source', DataType: 'String', Default: '', PictForm: { Section: 'CPSection', Group: 'CPGroup', Row: 1, Width: 12 } },
								'Record.Data.TargetFile': { Name: 'Target File', Hash: 'TargetFile', DataType: 'String', Default: '', PictForm: { Section: 'CPSection', Group: 'CPGroup', Row: 2, Width: 12 } }
							}
						}
					}
				}
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = FlowCardCopyFile;
