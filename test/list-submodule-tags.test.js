// Unit tests for scripts/list-submodule-tags.js's pure parsing/sorting
// logic — no network access, no real git invocation. See
// docs/contribute/versioning.mdx for how this fits into the versioning
// pipeline (picking Stable's tag, listing Previous versions).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLsRemote, compareSemver } = require('../scripts/list-submodule-tags');

test('parseLsRemote: annotated tag resolves to the peeled commit, plain line first', () => {
  const output = [
    'b551c0b1111111111111111111111111111111 refs/tags/v1.0.0',
    'ce638441111111111111111111111111111111 refs/tags/v1.0.0^{}',
  ].join('\n');
  const tags = parseLsRemote(output);
  assert.deepEqual(tags, [{ name: 'v1.0.0', commit: 'ce638441111111111111111111111111111111' }]);
});

test('parseLsRemote: annotated tag resolves to the peeled commit, peeled line first', () => {
  const output = [
    'ce638441111111111111111111111111111111 refs/tags/v1.0.0^{}',
    'b551c0b1111111111111111111111111111111 refs/tags/v1.0.0',
  ].join('\n');
  const tags = parseLsRemote(output);
  assert.deepEqual(tags, [{ name: 'v1.0.0', commit: 'ce638441111111111111111111111111111111' }]);
});

test('parseLsRemote: lightweight tag (no ^{} line) keeps its own SHA', () => {
  const output = '58dcb371111111111111111111111111111111 refs/tags/v1.0.0';
  const tags = parseLsRemote(output);
  assert.deepEqual(tags, [{ name: 'v1.0.0', commit: '58dcb371111111111111111111111111111111' }]);
});

test('parseLsRemote: non-semver tags and their ^{} lines are dropped', () => {
  const output = [
    'aaaaaaa1111111111111111111111111111111 refs/tags/latest',
    'bbbbbbb1111111111111111111111111111111 refs/tags/latest^{}',
    'ccccccc1111111111111111111111111111111 refs/tags/v1.0.0-rc1',
    'ddddddd1111111111111111111111111111111 refs/tags/foo',
    'eeeeeee1111111111111111111111111111111 refs/tags/v2.0.0',
  ].join('\n');
  const tags = parseLsRemote(output);
  assert.deepEqual(tags, [{ name: 'v2.0.0', commit: 'eeeeeee1111111111111111111111111111111' }]);
});

test('parseLsRemote: sorts newest first, numerically not lexically', () => {
  const names = ['v1', 'v1.2', 'v1.9.0', 'v1.10.0', 'v2.0.0'];
  const output = names
    .map((name, i) => `${String(i).padStart(7, '0')}1111111111111111111111111111111 refs/tags/${name}`)
    .join('\n');
  const tags = parseLsRemote(output);
  assert.deepEqual(
    tags.map((t) => t.name),
    ['v2.0.0', 'v1.10.0', 'v1.9.0', 'v1.2', 'v1']
  );
});

test('parseLsRemote: empty output gives []', () => {
  assert.deepEqual(parseLsRemote(''), []);
});

test('compareSemver: orders descending, missing parts treated as 0', () => {
  assert.ok(compareSemver('v2.0.0', 'v1.10.0') < 0);
  assert.ok(compareSemver('v1.10.0', 'v1.9.0') < 0);
  assert.ok(compareSemver('v1.9.0', 'v1.2') < 0);
  assert.ok(compareSemver('v1.2', 'v1') < 0);
  assert.equal(compareSemver('v1.0.0', 'v1.0.0'), 0);
});
