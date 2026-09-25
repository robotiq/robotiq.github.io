// Unit tests for scripts/site-nav-tree.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  buildMainSidebar,
  buildInstanceSidebar,
  regenerateInstanceSidebar,
  VERSIONED_TOOL_PATHS,
} from '../scripts/site-nav-tree.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function collectVersionedLinks(items, found = []) {
  for (const item of items) {
    if (item.type === 'link') found.push(item);
    if (item.type === 'category') {
      assert.equal(item.link, undefined, `category "${item.label}" should not have a link in an instance sidebar`);
      collectVersionedLinks(item.items, found);
    }
  }
  return found;
}

test('buildInstanceSidebar: the active tool node is exactly activeItem', () => {
  const activeItem = {type: 'doc', id: 'index', label: 'C++'};
  const sidebar = buildInstanceSidebar('tactile-cpp', activeItem);
  // Find it by walking: Tactile Sensor > Libraries > (activeItem)
  const tactile = sidebar.find((n) => n.label === 'Tactile Sensor');
  const libraries = tactile.items.find((n) => n.label === 'Libraries');
  assert.deepEqual(libraries.items.find((n) => n.label === 'C++'), activeItem);
});

test('buildInstanceSidebar: every other versioned tool is a link to its encoded path', () => {
  const sidebar = buildInstanceSidebar('tactile-cpp', {type: 'doc', id: 'index', label: 'C++'});
  const links = collectVersionedLinks(sidebar);
  for (const [tool, urlPath] of Object.entries(VERSIONED_TOOL_PATHS)) {
    if (tool === 'tactile-cpp') continue;
    const expectedHref = encodeURI(urlPath);
    const match = links.find((l) => l.href === expectedHref);
    assert.ok(match, `expected a link with href ${expectedHref} for tool ${tool}`);
  }
});

test('buildInstanceSidebar: href encoding — spaces become %20, + is left alone', () => {
  const sidebar = buildInstanceSidebar('tactile-python', {type: 'doc', id: 'index', label: 'Python'});
  const links = collectVersionedLinks(sidebar);
  const cpp = links.find((l) => l.label === 'C++' && l.href.includes('Tactile'));
  assert.equal(cpp.href, '/docs/drivers/Tactile%20Sensor/Libraries/C++');
});

test('buildInstanceSidebar: no category in an instance sidebar has its own link', () => {
  const sidebar = buildInstanceSidebar('isaac-sim', {type: 'doc', id: 'index', label: 'Isaac Sim'});
  collectVersionedLinks(sidebar); // asserts internally on every category
});

test('buildMainSidebar: versioned-tool leaves are links, main-owned leaves are doc ids', () => {
  const sidebar = buildMainSidebar();
  const adaptive = sidebar.find((n) => n.label === 'Adaptive grippers');
  const libraries = adaptive.items.find((n) => n.label === 'Libraries');
  const cpp = libraries.items.find((n) => n.label === 'C++');
  assert.equal(cpp.type, 'link');
  assert.equal(cpp.href, encodeURI(VERSIONED_TOOL_PATHS['adaptive-grippers-cpp']));
  // Python isn't versioned — plain doc id string, not a link object.
  assert.ok(libraries.items.includes('drivers/Adaptive grippers/Libraries/Python/index'));
});

// The main regression test this file exists for: every already-cut
// version's frozen sidebar snapshot must already equal what
// regenerateInstanceSidebar produces from the CURRENT site-nav-tree.mjs.
// If this fails, someone changed site-nav-tree.mjs's SITE_TREE without
// re-running `node scripts/regenerate-versioned-sidebars.mjs` (also run
// automatically by `npm run generate` — see docs/contribute/versioning.mdx)
// — the same drift `ci.yml`'s "Verify generated content is committed"
// step would also catch after a real build, just faster and offline here.
test('drift guard: every committed versioned-sidebar snapshot matches what the live site nav tree would produce', () => {
  const suffix = '_versioned_sidebars';
  const toolDirs = fs.readdirSync(ROOT, {withFileTypes: true}).filter((e) => e.isDirectory() && e.name.endsWith(suffix));
  assert.ok(toolDirs.length > 0, 'expected at least one <tool>_versioned_sidebars directory to exist');

  for (const dirEntry of toolDirs) {
    const tool = dirEntry.name.slice(0, -suffix.length);
    const dir = path.join(ROOT, dirEntry.name);
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('-sidebars.json')) continue;
      const filePath = path.join(dir, file);
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const [sidebarKey, existingItems] = Object.entries(existing)[0];

      const regenerated = regenerateInstanceSidebar(tool, existingItems);
      assert.notEqual(regenerated, undefined, `${path.relative(ROOT, filePath)}: could not locate '${tool}'s own content — site nav tree shape changed structurally`);
      assert.deepEqual(
        regenerated,
        existingItems,
        `${path.relative(ROOT, filePath)} is stale — run: node scripts/regenerate-versioned-sidebars.mjs`
      );
      assert.equal(typeof sidebarKey, 'string');
    }
  }
});
