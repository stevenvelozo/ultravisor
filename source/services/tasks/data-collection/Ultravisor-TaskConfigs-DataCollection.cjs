/**
 * Data Collection task configurations for Ultravisor.
 *
 * Task types for observing and measuring execution flow:
 *   event-counter — counts event passthrough, writes to state
 */

module.exports =
[
	// ── Event Counter ──────────────────────────────────────────────
	{
		Definition: require('./definitions/event-counter.json'),

		Execute: function (pTask, pResolvedSettings, pContext, fCallback)
		{
			let tmpNodeHash = pContext.NodeHash;
			let tmpCounterName = pResolvedSettings.CounterName || 'Counter';
			let tmpOutputAddress = pResolvedSettings.OutputAddress || '';

			// Get or initialize the counter from TaskOutputs
			if (!pContext.TaskOutputs[tmpNodeHash])
			{
				pContext.TaskOutputs[tmpNodeHash] = {};
			}

			let tmpCurrentCount = pContext.TaskOutputs[tmpNodeHash].Count || 0;

			// Check which event triggered this
			if (pContext.TriggeringEventName === 'Reset')
			{
				tmpCurrentCount = 0;

				let tmpStateWrites = {};
				if (tmpOutputAddress)
				{
					tmpStateWrites[tmpOutputAddress] = 0;
				}

				return fCallback(null,
				{
					EventToFire: 'ResetComplete',
					Outputs: { Count: 0 },
					StateWrites: tmpStateWrites,
					Log: [`${tmpCounterName}: reset to 0`]
				});
			}

			// Increment
			tmpCurrentCount++;

			let tmpStateWrites = {};
			if (tmpOutputAddress)
			{
				tmpStateWrites[tmpOutputAddress] = tmpCurrentCount;
			}

			return fCallback(null,
			{
				EventToFire: 'Complete',
				Outputs: { Count: tmpCurrentCount },
				StateWrites: tmpStateWrites,
				Log: [`${tmpCounterName}: ${tmpCurrentCount}`]
			});
		}
	}
];
