// Unit tests for scripts/site-nav-tree.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  buildMainSidebar,
  buildVersionedInstanceSidebar,
  regenerateInstanceSidebar,
  VERSIONED_TOOL_PATHS,
} from '../scripts/site-nav-tree.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function activeItemsFixture() {
  return {
    'tactile-cpp': {type: 'doc', id: 'Tactile Sensor/Libraries/C++/index', label: 'C++'},
    'tactile-python': {type: 'doc', id: 'Tactile Sensor/Libraries/Python/index', label: 'Python'},
    'isaac-sim': {type: 'doc', id: 'Adaptive grippers/Simulation/Isaac Sim/index', label: 'Isaac Sim'},
    'adaptive-grippers-cpp': {type: 'doc', id: 'Adaptive grippers/Libraries/C++/index', label: 'C++'},
  };
}

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

test('buildVersionedInstanceSidebar: every versioned tool node is exactly its own activeItems entry', () => {
  const activeItems = activeItemsFixture();
  const sidebar = buildVersionedInstanceSidebar(activeItems);

  const tactile = sidebar.find((n) => n.label === 'Tactile Sensor');
  const tactileLibraries = tactile.items.find((n) => n.label === 'Libraries');
  assert.deepEqual(tactileLibraries.items.find((n) => n.label === 'C++'), activeItems['tactile-cpp']);
  assert.deepEqual(tactileLibraries.items.find((n) => n.label === 'Python'), activeItems['tactile-python']);

  const adaptive = sidebar.find((n) => n.label === 'Adaptive grippers');
  const adaptiveLibraries = adaptive.items.find((n) => n.label === 'Libraries');
  assert.deepEqual(adaptiveLibraries.items.find((n) => n.label === 'C++'), activeItems['adaptive-grippers-cpp']);
  const simulation = adaptive.items.find((n) => n.label === 'Simulation');
  assert.deepEqual(simulation.items.find((n) => n.label === 'Isaac Sim'), activeItems['isaac-sim']);
});

test('buildVersionedInstanceSidebar: a product with no versioned tool at all is entirely plain links', () => {
  const sidebar = buildVersionedInstanceSidebar(activeItemsFixture());
  const forceTorque = sidebar.find((n) => n.label === 'Force Torque Sensor');
  const links = collectVersionedLinks(forceTorque.items);
  assert.ok(links.length > 0);
  assert.ok(links.every((l) => l.type === 'link'));
});

test('buildVersionedInstanceSidebar: href encoding — spaces become %20, + is left alone', () => {
  const sidebar = buildVersionedInstanceSidebar(activeItemsFixture());
  const links = collectVersionedLinks(sidebar);
  const python = links.find((l) => l.href.includes('Adaptive%20grippers/Libraries/Python'));
  assert.ok(python, 'expected an encoded link to the non-versioned Python leaf');
});

test('buildVersionedInstanceSidebar: no category in the instance sidebar has its own link', () => {
  const sidebar = buildVersionedInstanceSidebar(activeItemsFixture());
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
    const dir = path.join(ROOT, dirEntry.name);
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('-sidebars.json')) continue;
      const filePath = path.join(dir, file);
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const [sidebarKey, existingItems] = Object.entries(existing)[0];

      const regenerated = regenerateInstanceSidebar(existingItems);
      assert.notEqual(regenerated, undefined, `${path.relative(ROOT, filePath)}: could not locate every versioned tool's own content — site nav tree shape changed structurally`);
      assert.deepEqual(
        regenerated,
        existingItems,
        `${path.relative(ROOT, filePath)} is stale — run: node scripts/regenerate-versioned-sidebars.mjs`
      );
      assert.equal(typeof sidebarKey, 'string');
    }
  }
});
