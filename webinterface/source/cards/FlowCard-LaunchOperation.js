const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardLaunchOperation extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Launch Operation',
				Code: 'launch-operation',
				Description: 'Executes a child operation by hash, with isolated operation state.',
				Category: 'Control',
				TitleBarColor: '#7b1fa2',
				BodyStyle: { fill: '#f3e5f5', stroke: '#7b1fa2' },
				Width: 200,
				Height: 100,
				Inputs:
				[
					{ Name: 'Launch', Side: 'left', PortType: 'event-in' },
					{ Name: 'OperationHash', Side: 'top', PortType: 'setting' },
					{ Name: 'InputData', Side: 'top', PortType: 'setting' }
				],
				Outputs:
				[
					{ Name: 'Completed', Side: 'right', PortType: 'event-out' },
					{ Name: 'Result', Side: 'right', PortType: 'value' },
					{ Name: 'Status', Side: 'right', PortType: 'value' },
					{ Name: 'ElapsedMs', Side: 'right', PortType: 'value' },
					{ Name: 'Error', Side: 'bottom', PortType: 'error' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 350,
					DefaultHeight: 220,
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
								'Record.Data.OperationHash':
								{
									Name: 'Operation Hash',
									Hash: 'OperationHash',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'LaunchSection', Group: 'LaunchGroup', Row: 1, Width: 12 }
								},
								'Record.Data.InputData':
								{
									Name: 'Input Data (JSON)',
									Hash: 'InputData',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'LaunchSection', Group: 'LaunchGroup', Row: 2, Width: 12 }
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
