const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardLaunchOperation extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Launch Operation',
				Code: 'LAUNCHOP',
				Description: 'Asynchronously launch another operation.',
				Category: 'Core',
				TitleBarColor: '#7b1fa2',
				BodyStyle: { fill: '#f3e5f5', stroke: '#7b1fa2' },
				Width: 200,
				Height: 80,
				Inputs:
				[
					{ Name: 'Trigger', Side: 'left', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Launched', Side: 'right' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 350,
					DefaultHeight: 200,
					Title: 'Launch Operation Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardLaunchOperation',
							Sections:
							[
								{
									Name: 'Target',
									Hash: 'LaunchSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'LaunchGroup' }
									]
								}
							],
							Descriptors:
							{
								'Record.Data.TargetOperation':
								{
									Name: 'Target Operation GUID',
									Hash: 'TargetOperation',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'LaunchSection', Group: 'LaunchGroup', Row: 1, Width: 12 }
								},
								'Record.Data.MergeParentState':
								{
									Name: 'Merge Parent State',
									Hash: 'MergeParentState',
									DataType: 'Boolean',
									Default: false,
									PictForm: { Section: 'LaunchSection', Group: 'LaunchGroup', Row: 2, Width: 6 }
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

module.exports = FlowCardLaunchOperation;
