/**
 * Ultravisor — Task Event-Name Consistency Suite
 *
 * The execution engine routes fired/resume events to downstream nodes by
 * CASE-SENSITIVE name match against the task definition's EventOutputs. An
 * executor that fires an undeclared (or differently-cased) event name strands
 * everything downstream while the run can still terminate 'Complete'. Three
 * real instances of this bug class shipped ('complete' in beacon-dispatch,
 * 'error' in failWorkItem, 'complete' in value-input's auto-resolve paths).
 *
 * This suite sweeps EVERY config-driven task tier and asserts that each
 * EventToFire / ResumeEventName string literal in the Execute source is a
 * declared EventOutputs name. 'Error' is additionally tolerated everywhere
 * because the engine itself fires it on task failure regardless of
 * declaration.
 */
const Chai = require('chai');
const Expect = Chai.expect;
const libFS = require('fs');
const libPath = require('path');

const TASKS_ROOT = libPath.resolve(__dirname, '..', 'source', 'services', 'tasks');

// Engine-level event names fired regardless of a definition's declarations.
const UNIVERSALLY_ALLOWED = [ 'Error' ];

function collectTierConfigFiles()
{
	let tmpFiles = [];
	let tmpTiers = libFS.readdirSync(TASKS_ROOT, { withFileTypes: true }).filter((pEntry) => pEntry.isDirectory());
	for (let i = 0; i < tmpTiers.length; i++)
	{
		let tmpTierPath = libPath.join(TASKS_ROOT, tmpTiers[i].name);
		let tmpEntries = libFS.readdirSync(tmpTierPath).filter((pName) => /^Ultravisor-TaskConfigs-.*\.cjs$/.test(pName));
		for (let j = 0; j < tmpEntries.length; j++)
		{
			tmpFiles.push(libPath.join(tmpTierPath, tmpEntries[j]));
		}
	}
	return tmpFiles;
}

function extractEventLiterals(pSource)
{
	// Capture every quoted string on the value side of an EventToFire /
	// ResumeEventName expression — including ternaries (cond ? 'A' : 'B').
	let tmpLiterals = [];
	let tmpExpressionRegex = /(?:EventToFire|ResumeEventName)\s*:\s*([^,\n]+)/g;
	let tmpMatch;
	while ((tmpMatch = tmpExpressionRegex.exec(pSource)) !== null)
	{
		let tmpValueExpression = tmpMatch[1];
		let tmpStringRegex = /'([^']+)'|"([^"]+)"/g;
		let tmpStringMatch;
		while ((tmpStringMatch = tmpStringRegex.exec(tmpValueExpression)) !== null)
		{
			tmpLiterals.push(tmpStringMatch[1] || tmpStringMatch[2]);
		}
	}
	return tmpLiterals;
}

suite('Task event-name consistency (EventToFire/ResumeEventName ⊆ EventOutputs)', () =>
{
	let tmpTierFiles = collectTierConfigFiles();

	test('found config-driven task tiers to check', () =>
	{
		Expect(tmpTierFiles.length).to.be.greaterThan(5, 'expected the built-in task tiers under source/services/tasks/*/');
	});

	for (let tmpFile of collectTierConfigFiles())
	{
		test(libPath.relative(TASKS_ROOT, tmpFile), () =>
		{
			let tmpConfigs = require(tmpFile);
			Expect(tmpConfigs).to.be.an('array');
			for (let i = 0; i < tmpConfigs.length; i++)
			{
				let tmpConfig = tmpConfigs[i];
				if (!tmpConfig || !tmpConfig.Definition || typeof tmpConfig.Execute !== 'function')
				{
					continue;
				}
				let tmpDeclared = (tmpConfig.Definition.EventOutputs || []).map((pOutput) => pOutput.Name);
				let tmpAllowed = tmpDeclared.concat(UNIVERSALLY_ALLOWED);
				let tmpFired = extractEventLiterals(tmpConfig.Execute.toString());
				for (let tmpEventName of tmpFired)
				{
					Expect(tmpAllowed).to.include(tmpEventName,
						`Task [${tmpConfig.Definition.Type}] fires event '${tmpEventName}' which is not declared in its EventOutputs [${tmpDeclared.join(', ')}] — ` +
						`the engine's match is case-sensitive and an undeclared event strands downstream nodes.`);
				}
			}
		});
	}
});
