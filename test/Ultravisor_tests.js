/**
* Unit tests for Ultravisor
*/

var libUltravisor = require('../source/cli/Ultravisor-CLIProgram.cjs');

var Chai = require("chai");
var Expect = Chai.expect;

suite
(
	'Ultravisor',
	function()
	{
		setup ( () => {} );

		suite
		(
			'Execution Sanity',
			function()
			{
				test
				(
					'Ultravisor should load up okay.',
					function()
					{
						let testUltravisor = libUltravisor;
						Expect(testUltravisor.settings.Product).to.equal('Ultravisor-CLI');
					}
				);
			}
		);
	}
);