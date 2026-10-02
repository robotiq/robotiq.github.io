// @ts-check

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSIONED_TOOLS } from './versioned-tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOFTWARE_TOOLS_ROOT = path.join(__dirname, '..', 'software-tools');

// Single source of truth for the full "Software Tools" navigation tree —
// every product/tool/version this site has, in nav order. Used to build
// the shared 'software-tools' Docusaurus instance's own sidebar
// (sidebars.software-tools.js). Every product lives in that one instance
// now (see docs/contribute/versioning.mdx: two plugin instances can't
// split ownership of one URL prefix, and every product's pages live under
// `/docs/drivers/*`), so this tree needs no more "which instance owns
// this node" branching — every leaf is real content in the same instance.
//
// A `versioned(label, tool)` node is the one exception: its real content
// shape can differ per Docusaurus *version* (a submodule tag can predate a
// guide folder; Previous states aside, Stable and Latest can
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
// /docs/intro, doesn't change), not the shared software-tools instance —
// see the plain link sidebars.software-tools.js prepends for it instead.
export const SITE_TREE = [
  category('Adaptive grippers', [
    category('Libraries', [
      versioned('C++', 'adaptive-grippers-cpp'),
      leaf('Adaptive grippers/Libraries/Python/index'),
    ], 'Adaptive grippers/Libraries/index'),
    versioned('ROS', 'adaptive-grippers-ros'),
    category('Simulation', [
      versioned('Isaac Sim', 'isaac-sim'),
      leaf('Adaptive grippers/Simulation/PyBullet/index'),
      leaf('Adaptive grippers/Simulation/MuJoCo/index'),
    ], 'Adaptive grippers/Simulation/index'),
    category('Other', [
      leaf('Adaptive grippers/Other/GraspGen/index'),
    ], 'Adaptive grippers/Other/index'),
  ], 'Adaptive grippers/index'),
  category('Tactile Sensor', [
    category('Libraries', [
      versioned('C++', 'tactile-cpp'),
      versioned('Python', 'tactile-python'),
    ], 'Tactile Sensor/Libraries/index'),
    versioned('ROS', 'tactile-ros'),
    category('Simulation', [
      leaf('Tactile Sensor/Simulation/Isaac Sim/index'),
    ], 'Tactile Sensor/Simulation/index'),
  ], 'Tactile Sensor/index'),
  category('Force Torque Sensor', [
    category('Libraries', [
      leaf('Force Torque Sensor/Libraries/C/index'),
      leaf('Force Torque Sensor/Libraries/Python/index'),
    ], 'Force Torque Sensor/Libraries/index'),
    leaf('Force Torque Sensor/ROS/index'),
  ], 'Force Torque Sensor/index'),
  category('EPick', [
    leaf('EPick/ROS/index'),
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
 * Builds the software-tools instance's full sidebar: the whole site
 * tree, with every `versioned` node replaced by its own real content
 * (`activeItems`, a `{toolId: item}` map) and everything else a plain
 * `docId` string — Docusaurus resolves the real label/link from that
 * doc's own frontmatter.
 */
export function buildSidebar(activeItems) {
  return SITE_TREE.map((n) => render(n, activeItems));
}

/**
 * @param {any[]} nodes
 * @param {Record<string, string>} acc
 */
function collectToolLabels(nodes, acc) {
  for (const node of nodes) {
    if (node.kind === 'versioned') acc[node.tool] = node.label;
    else if (node.kind === 'category') collectToolLabels(node.items, acc);
  }
  return acc;
}

/**
 * {toolId: label} for every `versioned` node in SITE_TREE — this tool's
 * OWN label as it should read everywhere (the nav itself, and
 * sidebars.software-tools.js's activeItems, which used to need a second
 * hand-typed copy of the exact same string). SITE_TREE is the one place
 * that actually decides a tool's label, since it's also the one place
 * that decides where in the nav it sits — the two aren't separable.
 * @returns {Record<string, string>}
 */
export function toolLabels() {
  return collectToolLabels(SITE_TREE, {});
}

// docs/intro.mdx stays on the default instance (see the comment on
// SITE_TREE above) but still needs the full Software Tools tree visible
// on its own left nav, same reasoning as everywhere else on this site — a
// doc can only ever *display* a sidebar that belongs to its own plugin
// instance (there's no cross-instance `displayed_sidebar`), so that
// sidebar has to be built as plain links into the software-tools
// instance, the same way sidebars.software-tools.js itself falls back to
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
    const candidate = path.join(SOFTWARE_TOOLS_ROOT, `${docId}${ext}`);
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
    // there's nothing valid for the category header's own `link` to point
    // at — Docusaurus's sidebar category `link` only accepts {type: 'doc'}
    // (same instance) or {type: 'generated-index'}, no raw href, and its
    // own schema validation rejects a bare `href` property on a category
    // item outright (confirmed: Joi.assert throws "not allowed" at build
    // time for one). `customProps` is the one arbitrary, unrestricted
    // escape hatch every sidebar item schema allows — stashing the URL
    // there and reading it back in a swizzled
    // src/theme/DocSidebarItem/Category (patching it onto `item.href`
    // before handing off to the stock component) gets the exact same
    // "header is a real link AND still expands on click" behavior a
    // same-instance category gets for free — see that swizzle's own
    // comment for why this graft actually works (the stock component
    // already has this behavior fully built in, gated on `item.href`
    // simply being truthy, regardless of how it got set).
    const rendered = { type: 'category', label: node.label, items: node.items.map(renderOverview) };
    if (node.docId) {
      rendered.customProps = { href: encodeURI(pathFromDocId(node.docId)) };
    }
    return rendered;
  }
  return { type: 'link', label: readDocLabel(node.docId), href: encodeURI(pathFromDocId(node.docId)) };
}

/**
 * Builds docs/intro.mdx's own sidebar: the whole Software Tools tree,
 * entirely as plain links into the software-tools instance (which owns
 * all of it — see SITE_TREE's own header comment) — used by sidebars.js's
 * `overviewSidebar`, prefixed with the real `'intro'` doc id.
 */
export function buildOverviewSidebar() {
  return SITE_TREE.map(renderOverview);
}

// There used to be a whole "keep an already-cut version's frozen sidebar
// snapshot in sync with a SITE_TREE that changed after the fact" mechanism
// here (extractActiveItems/regenerateInstanceSidebar, consumed by
// scripts/regenerate-versioned-sidebars.mjs) — removed along with that
// script once Stable itself stopped being a committed, potentially-stale
// snapshot (see .gitignore and docs/contribute/versioning.mdx): every
// build now re-cuts Stable fresh from source
// (scripts/ensure-stable-version.js), and `docs:version:` itself always
// derives its sidebar from THIS file's current SITE_TREE at that moment —
// there is no longer any stale, previously-frozen snapshot that could
// ever need patching.
