// @ts-check

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSIONED_TOOLS } from './versioned-tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSIONED_TOOLS_ROOT = path.join(__dirname, '..', 'versioned-tools');

// Single source of truth for the full "Software Tools" navigation tree —
// every product/tool/version this site has, in nav order. Used to build
// the shared 'versioned-tools' Docusaurus instance's own sidebar
// (sidebars.versioned-tools.js). Every product lives in that one instance
// now (see docs/contribute/versioning.mdx: two plugin instances can't
// split ownership of one URL prefix, and every product's pages live under
// `/docs/drivers/*`), so this tree needs no more "which instance owns
// this node" branching — every leaf is real content in the same instance.
//
// A `versioned(label, tool)` node is the one exception: its real content
// shape can differ per Docusaurus *version* (a submodule tag can predate a
// guide folder; Previous states aside, Stable and Development (main) can
// genuinely differ) — see docs/contribute/versioning.mdx's
// `guidesCategory`/`doxygenApiCategory` for why. Callers supply that
// content explicitly via `activeItems` (a `{toolId: item}` map); every
// other node is a plain `docId` string, and Docusaurus resolves its real
// label/content from that doc's own frontmatter automatically.

function leaf(docId) {
  return { kind: 'leaf', docId };
}

function versioned(label, tool) {
  return { kind: 'versioned', label, tool };
}

function category(label, items, docId) {
  return { kind: 'category', label, items, docId };
}

// 'intro' (docs/intro.mdx) deliberately isn't a SITE_TREE node — unlike
// everything else here, it stays on the *default* instance (so its URL,
// /docs/intro, doesn't change), not the shared versioned-tools instance —
// see the plain link sidebars.versioned-tools.js prepends for it instead.
export const SITE_TREE = [
  category('Adaptive grippers', [
    category('Libraries', [
      versioned('C++', 'adaptive-grippers-cpp'),
      leaf('Adaptive grippers/Libraries/Python/index'),
    ]),
    category('ROS', [
      leaf('Adaptive grippers/ROS/ROS2-Lyrical/index'),
      leaf('Adaptive grippers/ROS/ROS2-Jazzy/index'),
      leaf('Adaptive grippers/ROS/ROS2-Humble/index'),
      leaf('Adaptive grippers/ROS/ROS1-Melodic/index'),
      leaf('Adaptive grippers/ROS/ROS1-Kinetic/index'),
      leaf('Adaptive grippers/ROS/ROS1-Indigo/index'),
    ], 'Adaptive grippers/ROS/index'),
    category('Simulation', [
      versioned('Isaac Sim', 'isaac-sim'),
      leaf('Adaptive grippers/Simulation/PyBullet/index'),
      leaf('Adaptive grippers/Simulation/MuJoCo/index'),
    ]),
    category('Other', [
      leaf('Adaptive grippers/Other/GraspGen/index'),
    ]),
  ], 'Adaptive grippers/index'),
  category('Tactile Sensor', [
    category('Libraries', [
      versioned('C++', 'tactile-cpp'),
      versioned('Python', 'tactile-python'),
    ]),
    category('ROS', [
      leaf('Tactile Sensor/ROS/ROS2-Lyrical/index'),
      leaf('Tactile Sensor/ROS/ROS2-Jazzy/index'),
      leaf('Tactile Sensor/ROS/ROS2-Humble/index'),
      leaf('Tactile Sensor/ROS/ROS1-Noetic/index'),
    ], 'Tactile Sensor/ROS/index'),
    category('Simulation', [
      leaf('Tactile Sensor/Simulation/Isaac Sim/index'),
    ]),
  ], 'Tactile Sensor/index'),
  category('Force Torque Sensor', [
    category('Libraries', [
      leaf('Force Torque Sensor/Libraries/C/index'),
      leaf('Force Torque Sensor/Libraries/Python/index'),
    ]),
    category('ROS', [
      leaf('Force Torque Sensor/ROS/ROS2-Humble/index'),
    ], 'Force Torque Sensor/ROS/index'),
  ], 'Force Torque Sensor/index'),
  category('EPick', [
    category('ROS', [
      leaf('EPick/ROS/ROS2-Humble/index'),
    ], 'EPick/ROS/index'),
  ], 'EPick/index'),
];

function render(node, activeItems) {
  if (node.kind === 'versioned') return activeItems[node.tool];
  if (node.kind === 'category') {
    const rendered = { type: 'category', label: node.label, items: node.items.map((n) => render(n, activeItems)) };
    if (node.docId) rendered.link = { type: 'doc', id: node.docId };
    return rendered;
  }
  return node.docId;
}

/**
 * Builds the versioned-tools instance's full sidebar: the whole site
 * tree, with every `versioned` node replaced by its own real content
 * (`activeItems`, a `{toolId: item}` map) and everything else a plain
 * `docId` string — Docusaurus resolves the real label/link from that
 * doc's own frontmatter.
 */
export function buildSidebar(activeItems) {
  return SITE_TREE.map((n) => render(n, activeItems));
}

// docs/intro.mdx stays on the default instance (see the comment on
// SITE_TREE above) but still needs the full Software Tools tree visible
// on its own left nav, same reasoning as everywhere else on this site — a
// doc can only ever *display* a sidebar that belongs to its own plugin
// instance (there's no cross-instance `displayed_sidebar`), so that
// sidebar has to be built as plain links into the versioned-tools
// instance, the same way sidebars.versioned-tools.js itself falls back to
// plain links for anything it *doesn't* own. Confirmed the hard way:
// without this, landing on /docs/intro (e.g. by clicking "Overview" from
// the tools sidebar) swapped in the default instance's own tiny sidebar
// instead, and the whole tree disappeared with no way back to it from the
// sidebar itself.
function pathFromDocId(docId) {
  return `/docs/drivers/${docId.replace(/\/index$/, '')}`;
}

function findDocFile(docId) {
  for (const ext of ['.mdx', '.md']) {
    const candidate = path.join(VERSIONED_TOOLS_ROOT, `${docId}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readDocLabel(docId) {
  const filePath = findDocFile(docId);
  if (!filePath) return docId.split('/').filter((s) => s !== 'index').pop();
  const content = fs.readFileSync(filePath, 'utf8');
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const body = frontmatter ? frontmatter[1] : '';
  const labelMatch = body.match(/^sidebar_label:\s*(.+)$/m) || body.match(/^title:\s*(.+)$/m);
  return labelMatch ? labelMatch[1].trim().replace(/\r$/, '').replace(/^["']|["']$/g, '') : docId;
}

function renderOverview(node) {
  if (node.kind === 'versioned') {
    const docId = `${VERSIONED_TOOLS[node.tool].toolPath}/index`;
    return { type: 'link', label: node.label, href: encodeURI(pathFromDocId(docId)) };
  }
  if (node.kind === 'category') {
    // Same reasoning as render()'s own category branch: none of these doc
    // ids belong to the *default* instance this sidebar is attached to, so
    // there's nothing valid for the category header itself to link to —
    // still expandable/collapsible, just not clickable on its own.
    return { type: 'category', label: node.label, items: node.items.map(renderOverview) };
  }
  return { type: 'link', label: readDocLabel(node.docId), href: encodeURI(pathFromDocId(node.docId)) };
}

/**
 * Builds docs/intro.mdx's own sidebar: the whole Software Tools tree,
 * entirely as plain links into the versioned-tools instance (which owns
 * all of it — see SITE_TREE's own header comment) — used by sidebars.js's
 * `overviewSidebar`, prefixed with the real `'intro'` doc id.
 */
export function buildOverviewSidebar() {
  return SITE_TREE.map(renderOverview);
}

// Docusaurus freezes a cut version's sidebar into
// `versioned-tools_versioned_sidebars/version-<name>-sidebars.json` at
// `docs:version:` cut time — it never re-reads sidebars.versioned-tools.js
// for anything but the *current* version. That snapshot is
// `buildSidebar`'s WHOLE output (see docs/contribute/versioning.mdx), so
// it goes stale the same way any other cached copy of SITE_TREE would: a
// renamed label, a moved page, a new product added later, none of that
// reaches an already-cut version until someone notices and hand-edits (or
// re-cuts) it.
//
// `extractActiveItems` + `regenerateInstanceSidebar` below are how
// scripts/regenerate-versioned-sidebars.mjs keeps every cut version's
// snapshot in sync on every `npm run generate`, without needing to know
// per-tool, per-version which real content shape each versioned tool's
// own item should be (see the header comment above). Rather than guess
// that shape, this walks SITE_TREE in lockstep with the version's OWN
// existing snapshot and pulls out whatever's already sitting at each
// versioned tool's own position — correct by construction, since that
// position held the real, frozen content the moment the version was
// actually cut, and nothing about a tool's own frozen content changes
// after the fact (only the surrounding site tree does). Every
// non-`versioned` node is rebuilt fresh from the live SITE_TREE instead
// (deterministic — no per-version content-shape ambiguity for those).
// This assumes the existing snapshot is STRUCTURALLY parallel to the
// current SITE_TREE (same shape at every other position) — true
// immediately after any regeneration, including this one, so it
// self-heals on the very next run; it could only miss if SITE_TREE's own
// shape changed AND a version was never regenerated since (a one-time
// gap, not a standing risk, given this runs on every build).
export function extractActiveItems(existingItems) {
  const found = {};
  extractActiveItemsFrom(SITE_TREE, existingItems, found);
  return found;
}

function extractActiveItemsFrom(nodes, existingItems, found) {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const existing = existingItems[i];
    if (!existing) continue;
    if (node.kind === 'versioned') {
      found[node.tool] = existing;
    } else if (node.kind === 'category' && Array.isArray(existing.items)) {
      extractActiveItemsFrom(node.items, existing.items, found);
    }
  }
}

/**
 * Regenerates the versioned-tools instance's frozen sidebar snapshot:
 * extracts every versioned tool's own real content out of its existing
 * snapshot (`existingItems`, that version's current sidebar array), then
 * rebuilds the surrounding tree fresh from the live SITE_TREE. Returns the
 * new items array, or `undefined` if fewer tools were found in
 * `existingItems` than SITE_TREE currently declares (a genuinely
 * new/reshaped tree — falls back to leaving that snapshot alone rather
 * than guessing).
 *
 * `existingItems` (and the rebuilt result) can carry a fixed-size prefix
 * SITE_TREE doesn't itself describe — sidebars.versioned-tools.js prepends
 * one plain link ('Overview', to a page that deliberately stayed on the
 * default instance) ahead of SITE_TREE's own items. Matched up from the
 * END (SITE_TREE's own length), not the start, so that prefix doesn't
 * throw off the positional alignment `extractActiveItems` relies on; it's
 * then carried over into the result unchanged.
 */
export function regenerateInstanceSidebar(existingItems) {
  const prefix = existingItems.slice(0, existingItems.length - SITE_TREE.length);
  const siteTreeItems = existingItems.slice(prefix.length);
  const activeItems = extractActiveItems(siteTreeItems);
  const expectedTools = SITE_TREE.flatMap(collectVersionedTools);
  if (expectedTools.some((tool) => activeItems[tool] === undefined)) return undefined;
  return [...prefix, ...buildSidebar(activeItems)];
}

function collectVersionedTools(node) {
  if (node.kind === 'versioned') return [node.tool];
  if (node.kind === 'category') return node.items.flatMap(collectVersionedTools);
  return [];
}
