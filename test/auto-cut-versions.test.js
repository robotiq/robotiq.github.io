// Unit tests for scripts/auto-cut-versions.js's pure summary builder. The
// tag-comparison/cutting orchestration itself isn't unit tested here — see
// test/cut-version.test.js's own header comment for why (it's exercised
// end to end by actually re-cutting a real tool).
const test = require('node:test');
const assert = require('node:assert/strict');
const {buildSummary} = require('../scripts/auto-cut-versions');

test('buildSummary: lists each cut tool with its old and new tag', () => {
  const out = buildSummary([
    {toolId: 'tactile-cpp', from: 'v1.0.0', to: 'v2.0.0'},
    {toolId: 'adaptive-grippers-cpp', from: 'v1.0.0', to: 'v1.1.0'},
  ]);
  assert.match(out, /\*\*tactile-cpp\*\*: `v1\.0\.0` → `v2\.0\.0`/);
  assert.match(out, /\*\*adaptive-grippers-cpp\*\*: `v1\.0\.0` → `v1\.1\.0`/);
});

test('buildSummary: empty list still produces the explanatory header', () => {
  const out = buildSummary([]);
  assert.match(out, /scripts\/cut-version\.js/);
});
