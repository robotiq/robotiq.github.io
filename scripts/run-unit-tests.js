#!/usr/bin/env node
// Runs every test/*.test.{js,mjs} file via node:test's programmatic run()
// API, discovering files with a plain fs.readdirSync instead of a CLI
// glob/directory argument.
//
// `node --test test/` (the CLI's own directory-discovery form) is what
// Node's docs recommend, but a bare directory argument reproducibly failed
// on this machine (Windows, Node 24) with a confusing "Cannot find module"
// error — and CI (ubuntu-latest, Node 20, a different OS *and* a different
// Node major) is exactly the kind of environment that difference could
// go either way in, untested. A hand-typed glob string
// ('test/**/*.test.js') isn't safe either: that syntax only works because
// newer Node versions added their own internal glob matching for CLI
// positional args — confirmed by testing, it fails outright on Node 20
// with "Could not find '.../test/**/*.test.js'" (took the string as a
// literal, non-existent path). Explicit file discovery here sidesteps
// both: no directory-argument ambiguity, no glob-support version
// dependency, works identically regardless of OS or Node 20 vs 24.
const path = require('node:path');
const {run} = require('node:test');
const {spec: Spec} = require('node:test/reporters');

const TEST_DIR = path.join(__dirname, '..', 'test');
const fs = require('node:fs');

const files = fs
  .readdirSync(TEST_DIR)
  .filter((f) => /\.test\.(js|mjs)$/.test(f))
  .map((f) => path.join(TEST_DIR, f));

const stream = run({files});
stream.compose(new Spec()).pipe(process.stdout);
stream.on('test:fail', () => {
  process.exitCode = 1;
});
