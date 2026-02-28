const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardComprehensionIntersect extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Comprehension Intersect',
				Code: 'CMPINT',
				Description: 'Merge two comprehension data sets by GUID.',
				Category: 'Meadow',
				TitleBarColor: '#2e7d32',
				BodyStyle: { fill: '#e8f5e9', stroke: '#2e7d32' },
				Width: 220,
				Height: 100,
				Inputs:
				[
					{ Name: 'Set A', Side: 'left', MinimumInputCount: 1, MaximumInputCount: 1 },
					{ Name: 'Set B', Side: 'left', MinimumInputCount: 1, MaximumInputCount: 1 }
				],
				Outputs: [{ Name: 'Result', Side: 'right' }],
				PropertiesPanel:
				{
					PanelType: 'Form', DefaultWidth: 360, DefaultHeight: 260, Title: 'Comprehension Intersect Settings',
					Configuration: { Manifest: { Scope: 'FlowCardComprehensionIntersect',
						Sections: [{ Name: 'Merge', Hash: 'CISection', Groups: [{ Name: 'Settings', Hash: 'CIGroup' }] }],
						Descriptors: {
							'Record.Data.SourceAddressA': { Name: 'Set A State Address', Hash: 'SourceAddressA', DataType: 'String', Default: '', PictForm: { Section: 'CISection', Group: 'CIGroup', Row: 1, Width: 12 } },
							'Record.Data.SourceAddressB': { Name: 'Set B State Address', Hash: 'SourceAddressB', DataType: 'String', Default: '', PictForm: { Section: 'CISection', Group: 'CIGroup', Row: 2, Width: 12 } },
							'Record.Data.Destination': { Name: 'Result Destination', Hash: 'Destination', DataType: 'String', Default: '', PictForm: { Section: 'CISection', Group: 'CIGroup', Row: 3, Width: 12 } }
						}
					}}
				}
			}, pOptions), pServiceHash);
	}
}

module.exports = FlowCardComprehensionIntersect;
