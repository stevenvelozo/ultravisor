const libPictFlowCard = require('pict-section-flow').PictFlowCard;

class FlowCardHistogram extends libPictFlowCard
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, Object.assign(
			{},
			{
				Title: 'Histogram',
				Code: 'HIST',
				Description: 'Generate a histogram visualization of numeric data.',
				Category: 'Pipeline',
				TitleBarColor: '#c62828',
				BodyStyle: { fill: '#ffebee', stroke: '#c62828' },
				Width: 240,
				Height: 140,
				ShowTypeLabel: false,
				Inputs:
				[
					{ Name: 'Data', Side: 'left-top', PortType: 'value', MinimumInputCount: 1, MaximumInputCount: 1 },
					{ Name: 'Field', Side: 'left-top', PortType: 'setting', MinimumInputCount: 0, MaximumInputCount: 1 }
				],
				Outputs:
				[
					{ Name: 'Stats', Side: 'right-top', PortType: 'value' }
				],
				PropertiesPanel:
				{
					PanelType: 'Form',
					DefaultWidth: 340,
					DefaultHeight: 220,
					Title: 'Histogram Settings',
					Configuration:
					{
						Manifest:
						{
							Scope: 'FlowCardHistogram',
							Sections:
							[
								{
									Name: 'Histogram',
									Hash: 'HistSection',
									Groups:
									[
										{ Name: 'Settings', Hash: 'HistGroup' }
									]
								}
							],
							Descriptors:
							{
								'Record.Data.Field':
								{
									Name: 'Data Field',
									Hash: 'Field',
									DataType: 'String',
									Default: 'score',
									PictForm: { Section: 'HistSection', Group: 'HistGroup', Row: 1, Width: 8 }
								},
								'Record.Data.Bins':
								{
									Name: 'Bin Count',
									Hash: 'Bins',
									DataType: 'Number',
									Default: 5,
									PictForm: { Section: 'HistSection', Group: 'HistGroup', Row: 1, Width: 4 }
								},
								'Record.Data.Destination':
								{
									Name: 'Stats Destination',
									Hash: 'Destination',
									DataType: 'String',
									Default: '',
									PictForm: { Section: 'HistSection', Group: 'HistGroup', Row: 2, Width: 12 }
								}
							}
						}
					}
				},
				BodyContent:
				{
					ContentType: 'canvas',
					RenderCallback: function (pCanvas, pNodeData, pNodeTypeConfig, pBounds)
					{
						let tmpCtx = pCanvas.getContext('2d');
						if (!tmpCtx) return;

						let tmpW = pCanvas.width;
						let tmpH = pCanvas.height;

						// Use node data values if available, otherwise sample data
						let tmpValues = (pNodeData && pNodeData.Data && pNodeData.Data.Values)
							? pNodeData.Data.Values
							: [78, 85, 87, 88, 90, 92, 95];

						// Build histogram bins
						let tmpBinCount = (pNodeData && pNodeData.Data && pNodeData.Data.Bins) ? pNodeData.Data.Bins : 5;
						let tmpMin = Math.min.apply(null, tmpValues);
						let tmpMax = Math.max.apply(null, tmpValues);
						let tmpRange = tmpMax - tmpMin || 1;
						let tmpBinSize = tmpRange / tmpBinCount;

						let tmpBins = [];
						for (let b = 0; b < tmpBinCount; b++)
						{
							tmpBins.push(0);
						}
						for (let v = 0; v < tmpValues.length; v++)
						{
							let tmpIdx = Math.min(Math.floor((tmpValues[v] - tmpMin) / tmpBinSize), tmpBinCount - 1);
							tmpBins[tmpIdx]++;
						}

						let tmpMaxBin = Math.max.apply(null, tmpBins);
						if (tmpMaxBin === 0) tmpMaxBin = 1;

						// Drawing dimensions
						let tmpPadding = 8;
						let tmpLabelH = 14;
						let tmpBarAreaW = tmpW - (tmpPadding * 2);
						let tmpBarAreaH = tmpH - (tmpPadding * 2) - tmpLabelH;
						let tmpGap = 2;
						let tmpBarW = (tmpBarAreaW / tmpBinCount) - tmpGap;

						// Draw bars
						for (let i = 0; i < tmpBins.length; i++)
						{
							let tmpBarH = (tmpBins[i] / tmpMaxBin) * tmpBarAreaH;
							let tmpX = tmpPadding + (i * (tmpBarW + tmpGap));
							let tmpY = tmpPadding + tmpBarAreaH - tmpBarH;

							// Bar fill
							tmpCtx.fillStyle = 'rgba(198, 40, 40, 0.65)';
							tmpCtx.fillRect(tmpX, tmpY, tmpBarW, tmpBarH);

							// Bar border
							tmpCtx.strokeStyle = '#c62828';
							tmpCtx.lineWidth = 0.5;
							tmpCtx.strokeRect(tmpX, tmpY, tmpBarW, tmpBarH);

							// Bin count label
							if (tmpBins[i] > 0)
							{
								tmpCtx.fillStyle = '#c62828';
								tmpCtx.font = '8px sans-serif';
								tmpCtx.textAlign = 'center';
								tmpCtx.fillText(String(tmpBins[i]), tmpX + tmpBarW / 2, tmpY - 2);
							}
						}

						// Axis line
						tmpCtx.beginPath();
						tmpCtx.moveTo(tmpPadding, tmpPadding + tmpBarAreaH);
						tmpCtx.lineTo(tmpW - tmpPadding, tmpPadding + tmpBarAreaH);
						tmpCtx.strokeStyle = '#999';
						tmpCtx.lineWidth = 1;
						tmpCtx.stroke();

						// Range labels
						tmpCtx.fillStyle = '#888';
						tmpCtx.font = '8px sans-serif';
						tmpCtx.textAlign = 'left';
						tmpCtx.fillText(String(Math.round(tmpMin)), tmpPadding, tmpH - tmpPadding + 2);
						tmpCtx.textAlign = 'right';
						tmpCtx.fillText(String(Math.round(tmpMax)), tmpW - tmpPadding, tmpH - tmpPadding + 2);
						tmpCtx.textAlign = 'center';
						tmpCtx.fillText('distribution', tmpW / 2, tmpH - tmpPadding + 2);
					}
				}
			},
			pOptions),
			pServiceHash);
	}
}

module.exports = FlowCardHistogram;
