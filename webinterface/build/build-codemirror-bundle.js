#!/usr/bin/env node
/**
 * Bundle CodeMirror v6 into a single browser-compatible file.
 * Run: node build/build-codemirror-bundle.js
 *
 * Creates dist/codemirror-bundle.js exposing window.CodeMirrorModules.
 */
const { build } = require('esbuild');
const path = require('path');

const tmpProjectRoot = path.join(__dirname, '..');

build(
{
	entryPoints: [path.join(__dirname, 'codemirror-entry.js')],
	bundle: true,
	outfile: path.join(tmpProjectRoot, 'dist', 'codemirror-bundle.js'),
	format: 'iife',
	globalName: 'CodeMirrorModules',
	platform: 'browser',
	target: ['es2018'],
	minify: true
}).then(() =>
{
	console.log('CodeMirror bundle built -> dist/codemirror-bundle.js');
}).catch((pError) =>
{
	console.error('Build failed:', pError);
	process.exit(1);
});
