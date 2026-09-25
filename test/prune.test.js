// Unit tests for scripts/lib/prune.js — run against a throwaway temp
// directory (fs.mkdtempSync), no real submodule checkout or build needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {pruneStale, pruneLegacyFolder, cleanupLegacyDestRoot} = require('../scripts/lib/prune');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prune-test-'));
}

function write(root, relPath, content = 'x') {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), {recursive: true});
  fs.writeFileSync(full, content);
  return full;
}

test('pruneStale: deletes synced files not in `written`, keeps the ones that are', () => {
  const root = tempDir();
  const kept = write(root, 'a.md');
  const stale = write(root, 'b.md');
  const removed = pruneStale(root, new Set([kept]));
  assert.deepEqual(removed, [stale]);
  assert.ok(fs.existsSync(kept));
  assert.ok(!fs.existsSync(stale));
});

test('pruneStale: never deletes index.* or README.*, even when not in `written`', () => {
  const root = tempDir();
  const index = write(root, 'index.md');
  const indexMdx = write(root, 'sub/index.mdx');
  const readme = write(root, 'README.md');
  const removed = pruneStale(root, new Set());
  assert.deepEqual(removed, []);
  assert.ok(fs.existsSync(index));
  assert.ok(fs.existsSync(indexMdx));
  assert.ok(fs.existsSync(readme));
});

test('pruneStale: ignores extensions outside COPY_EXTS', () => {
  const root = tempDir();
  const txt = write(root, 'notes.txt');
  const removed = pruneStale(root, new Set());
  assert.deepEqual(removed, []);
  assert.ok(fs.existsSync(txt));
});

test('pruneStale: removes directories it leaves empty', () => {
  const root = tempDir();
  const stale = write(root, 'sub/deep/a.md');
  pruneStale(root, new Set());
  assert.ok(!fs.existsSync(path.join(root, 'sub')));
});

test('pruneStale: a non-existent directory is a no-op', () => {
  const root = tempDir();
  assert.deepEqual(pruneStale(path.join(root, 'missing'), new Set()), []);
});

test('pruneLegacyFolder: removes .md files, keeps .mdx, removes empty subdirs', () => {
  const root = tempDir();
  const md = write(root, 'a.md');
  const indexMd = write(root, 'index.md'); // legacy folders get NO index/README exemption
  const mdx = write(root, 'index.mdx');
  const nested = write(root, 'sub/b.md');
  pruneLegacyFolder(root);
  assert.ok(!fs.existsSync(md));
  assert.ok(!fs.existsSync(indexMd));
  assert.ok(fs.existsSync(mdx));
  assert.ok(!fs.existsSync(path.join(root, 'sub')));
});

test('cleanupLegacyDestRoot: no-op for a job without destRoot', () => {
  const root = tempDir();
  write(root, 'docs/drivers/X/Y/_readme.md');
  const result = cleanupLegacyDestRoot(root, {to: 'X/Y/_readme.md'});
  assert.equal(result, undefined);
  assert.ok(fs.existsSync(path.join(root, 'docs/drivers/X/Y/_readme.md')));
});

test('cleanupLegacyDestRoot: removes a legacy folder job\'s old output, keeps a hand-authored index.mdx and sibling folders', () => {
  const root = tempDir();
  write(root, 'docs/drivers/Adaptive grippers/Libraries/C++/API/a.md');
  write(root, 'docs/drivers/Adaptive grippers/Libraries/C++/API/index.md');
  const siblingIndex = write(root, 'docs/drivers/Adaptive grippers/Libraries/C++/docs/index.mdx');
  const siblingFolder = write(root, 'docs/drivers/Adaptive grippers/Other/GraspGen/index.mdx');

  const result = cleanupLegacyDestRoot(root, {to: 'Adaptive grippers/Libraries/C++/API', destRoot: 'versioned-tools'});

  assert.equal(result, path.join('docs', 'drivers', 'Adaptive grippers/Libraries/C++/API'));
  assert.ok(!fs.existsSync(path.join(root, 'docs/drivers/Adaptive grippers/Libraries/C++/API')));
  assert.ok(fs.existsSync(siblingIndex));
  assert.ok(fs.existsSync(siblingFolder));
});

test('cleanupLegacyDestRoot: removes a legacy file job\'s old output', () => {
  const root = tempDir();
  const legacyReadme = write(root, 'docs/drivers/Tactile Sensor/Libraries/C++/_readme.md');
  const result = cleanupLegacyDestRoot(root, {to: 'Tactile Sensor/Libraries/C++/_readme.md', destRoot: 'versioned-tools'});
  assert.equal(result, path.join('docs', 'drivers', 'Tactile Sensor/Libraries/C++/_readme.md'));
  assert.ok(!fs.existsSync(legacyReadme));
});

test('cleanupLegacyDestRoot: no-op when nothing legacy exists', () => {
  const root = tempDir();
  const result = cleanupLegacyDestRoot(root, {to: 'Tactile Sensor/Libraries/Python/_readme.md', destRoot: 'versioned-tools'});
  assert.equal(result, undefined);
});
