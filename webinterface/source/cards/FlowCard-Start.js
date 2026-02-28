const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardStart extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Start',
				Code: 'start',
				Description: 'Entry point for the workflow.',
				Category: 'Flow Control',
				TitleBarColor: '#455a64',
				BodyStyle: { fill: '#eceff1', stroke: '#455a64' },
				Width: 140,
				Height: 80,
				Inputs: [],
				Outputs:
				[
					{ Name: 'Out', Side: 'right' }
				]
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = FlowCardStart;
