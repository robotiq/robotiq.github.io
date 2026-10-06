// Unit tests for scripts/cut-version.js's pure/file-scoped helpers.
// The full checkout/sync/docs:version orchestration isn't unit tested
// here — it's exercised end to end by actually re-cutting the shared
// Stable version for real (see docs/website/versioning.mdx).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  rewriteMainLinksToTag,
  pruneDanglingSubpageLinks,
  assertSubmodulesAgree,
} = require('../scripts/cut-version');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cut-version-test-'));
}

test('rewriteMainLinksToTag: rewrites tree/main and blob/main links', () => {
  const root = tempDir();
  const file = path.join(root, 'a.md');
  fs.writeFileSync(
    file,
    'See [x](https://github.com/robotiq/grippers/tree/main/sdk_cpp) and [y](https://github.com/robotiq/grippers/blob/main/README.md).'
  );
  rewriteMainLinksToTag(root, 'https://github.com/robotiq/grippers', 'v1.0.0');
  const result = fs.readFileSync(file, 'utf8');
  assert.match(result, /tree\/v1\.0\.0\/sdk_cpp/);
  assert.match(result, /blob\/v1\.0\.0\/README\.md/);
});

test('rewriteMainLinksToTag: rewrites a bare repo-root href to tree/<tag>', () => {
  const root = tempDir();
  const file = path.join(root, 'index.mdx');
  fs.writeFileSync(root + '/index.mdx', '<a href="https://github.com/robotiq/grippers">GitHub Repository</a>');
  rewriteMainLinksToTag(root, 'https://github.com/robotiq/grippers', 'v1.0.0');
  const result = fs.readFileSync(file, 'utf8');
  assert.equal(result, '<a href="https://github.com/robotiq/grippers/tree/v1.0.0">GitHub Repository</a>');
});

test('rewriteMainLinksToTag: does not touch a link to a different repo', () => {
  const root = tempDir();
  const file = path.join(root, 'a.md');
  const original = 'See [x](https://github.com/robotiq/ros).';
  fs.writeFileSync(file, original);
  rewriteMainLinksToTag(root, 'https://github.com/robotiq/grippers', 'v1.0.0');
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('rewriteMainLinksToTag: recurses into subdirectories, skips non-md/mdx files', () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, 'sub'));
  fs.writeFileSync(path.join(root, 'sub', 'b.md'), 'https://github.com/robotiq/grippers/blob/main/x.hpp');
  fs.writeFileSync(path.join(root, 'c.txt'), 'https://github.com/robotiq/grippers/blob/main/x.hpp');
  rewriteMainLinksToTag(root, 'https://github.com/robotiq/grippers', 'v1.0.0');
  assert.match(fs.readFileSync(path.join(root, 'sub', 'b.md'), 'utf8'), /blob\/v1\.0\.0/);
  assert.match(fs.readFileSync(path.join(root, 'c.txt'), 'utf8'), /blob\/main/);
});

test('pruneDanglingSubpageLinks: lists only subpages that actually exist on disk', () => {
  const root = tempDir();
  const wrapper = path.join(root, 'index.mdx');
  fs.writeFileSync(
    wrapper,
    '---\ntitle: C++\n---\n\n{/* AUTO-GENERATED-SUBPAGES-TABLE:START */}\n<div className="subpage-links">\n  <a className="subpage-link" href="docs">Introduction guides</a>\n  <a className="subpage-link" href="API">API Reference</a>\n</div>\n{/* AUTO-GENERATED-SUBPAGES-TABLE:END */}\n'
  );
  // Only docs/ exists this time — API/ doesn't (this tag predates the Doxyfile).
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs', 'index.mdx'), '---\ntitle: Guides\n---\n');

  pruneDanglingSubpageLinks(root);
  const result = fs.readFileSync(wrapper, 'utf8');
  assert.match(result, /href="docs">Introduction guides/);
  assert.doesNotMatch(result, /API Reference/);
});

test('pruneDanglingSubpageLinks: prunes a nested guides table too, one level deep', () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(
    path.join(root, 'docs', 'index.mdx'),
    '---\ntitle: Guides\n---\n\n{/* AUTO-GENERATED-GUIDES-TABLE:START */}\n<div className="subpage-links">\n  <a className="subpage-link" href="environment-setup">Environment setup</a>\n  <a className="subpage-link" href="quick-start">Quick start</a>\n</div>\n{/* AUTO-GENERATED-GUIDES-TABLE:END */}\n'
  );
  // Only one of the two guide files actually exists.
  fs.writeFileSync(path.join(root, 'docs', 'environment-setup.md'), '# Environment setup\n');

  pruneDanglingSubpageLinks(root);
  const result = fs.readFileSync(path.join(root, 'docs', 'index.mdx'), 'utf8');
  assert.match(result, /Environment setup/);
  assert.doesNotMatch(result, /Quick start/);
});

test('pruneDanglingSubpageLinks: empties the block when nothing survives, unlike generate-tools-table.js', () => {
  const root = tempDir();
  const wrapper = path.join(root, 'index.mdx');
  fs.writeFileSync(
    wrapper,
    '---\ntitle: C++\n---\n\n{/* AUTO-GENERATED-SUBPAGES-TABLE:START */}\n<div className="subpage-links">\n  <a className="subpage-link" href="docs">Introduction guides</a>\n  <a className="subpage-link" href="API">API Reference</a>\n</div>\n{/* AUTO-GENERATED-SUBPAGES-TABLE:END */}\n'
  );
  pruneDanglingSubpageLinks(root);
  const result = fs.readFileSync(wrapper, 'utf8');
  assert.doesNotMatch(result, /subpage-link/);
});

test('pruneDanglingSubpageLinks: no-op on a page with no marker', () => {
  const root = tempDir();
  const wrapper = path.join(root, 'index.mdx');
  const original = '---\ntitle: Python\n---\n\nJust content.\n';
  fs.writeFileSync(wrapper, original);
  pruneDanglingSubpageLinks(root);
  assert.equal(fs.readFileSync(wrapper, 'utf8'), original);
});

test('pruneDanglingSubpageLinks: leaves a PRODUCT-*-TABLE block (plain markdown table, no subpage-link anchors) untouched', () => {
  // Regression test for a real bug: this function's own block regex used
  // to match ANY AUTO-GENERATED-*-TABLE marker, not just SUBPAGES/GUIDES —
  // generate-tools-table.js's product-table writer uses the same marker
  // shape for a plain markdown table with no `subpage-link` anchors at
  // all, so the old regex found zero "survivors" and wiped every such
  // table blank the moment cutStable() started running
  // generate-tools-table.js during a cut, undoing its output immediately
  // after it was written.
  const root = tempDir();
  const wrapper = path.join(root, 'index.mdx');
  const original =
    '---\ntitle: Adaptive grippers\n---\n\n{/* AUTO-GENERATED-PRODUCT-LIBRARIES-TABLE:START */}\n| Product | C++ |\n|---|---|\n| Adaptive grippers | [C++](Libraries/C++) |\n{/* AUTO-GENERATED-PRODUCT-LIBRARIES-TABLE:END */}\n';
  fs.writeFileSync(wrapper, original);
  pruneDanglingSubpageLinks(root);
  assert.equal(fs.readFileSync(wrapper, 'utf8'), original);
});

test('assertSubmodulesAgree: no-op when every tool sharing a submodule agrees', () => {
  // tactile-cpp/tactile-python are real registry entries that both back
  // onto the tactile_sensors submodule.
  assert.doesNotThrow(() => assertSubmodulesAgree({'tactile-cpp': 'v2.0.0', 'tactile-python': 'v2.0.0'}));
});

test('assertSubmodulesAgree: throws when tools sharing a submodule disagree', () => {
  assert.throws(
    () => assertSubmodulesAgree({'tactile-cpp': 'v1.0.0', 'tactile-python': 'v2.0.0'}),
    /tactile-cpp.*tactile-python.*tactile_sensors/s
  );
});

test('assertSubmodulesAgree: tools on different submodules never conflict', () => {
  assert.doesNotThrow(() => assertSubmodulesAgree({'tactile-cpp': 'v2.0.0', 'adaptive-grippers-cpp': 'v1.0.0'}));
});

