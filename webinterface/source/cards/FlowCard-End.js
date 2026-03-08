const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardEnd extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'End',
				Code: 'end',
				Description: 'Termination point for the workflow.',
				Category: 'Flow Control',
				TitleBarColor: '#455a64',
				BodyStyle: { fill: '#eceff1', stroke: '#455a64' },
				Width: 140,
				Height: 80,
				Inputs:
				[
					{ Name: 'In', Side: 'left', PortType: 'event-in', MinimumInputCount: 1, MaximumInputCount: 5 }
				],
				Outputs: []
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = FlowCardEnd;
