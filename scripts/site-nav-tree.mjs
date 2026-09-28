// @ts-check

// Single source of truth for the full "Software Tools" navigation tree,
// used to build BOTH the main sidebar (sidebars.js) AND the shared
// versioned-tools instance's own sidebar (sidebars.versioned-tools.js).
//
// Why this exists: every submodule-synced tool (Tactile Sensor C++/Python,
// Isaac Sim, Adaptive grippers C++) lives together in ONE shared Docusaurus
// plugin-content-docs instance, `versioned-tools` (see docusaurus.config.js,
// docs/contribute/versioning.mdx), separate from the default instance so it
// can carry its own Development (main)/Stable versions. A plugin instance
// can only build sidebar items out of doc ids it owns — every other page
// has to be a plain link. Describing the tree once, here, lets both
// instances render it two ways:
//   - buildMainSidebar(): real doc ids for everything the main instance
//     owns, plain links only for the versioned-tool leaves — this is what
//     sidebars.js already did.
//   - buildVersionedInstanceSidebar(activeItems): plain links for every
//     node EXCEPT the versioned-tool leaves, which are all replaced by
//     their own real, doc-id-based content (`activeItems`, a
//     `{toolId: item}` map covering every versioned tool at once — used by
//     sidebars.versioned-tools.js). This keeps the full site tree visible,
//     in the same order, on every page; only the versioned tools' own
//     branches expand into real content, all simultaneously (they all
//     belong to this one shared instance).
//
// Cross-instance links are built as plain, `encodeURI()`-escaped absolute
// paths (e.g. '/docs/drivers/Adaptive%20grippers/...'), NOT Docusaurus's
// `pathname://` scheme. `pathname://` looks like the obvious tool for "this
// is an internal path, not a doc id" (it IS Docusaurus's own escape hatch
// for a sidebar/navbar `link` item's href otherwise failing URI
// validation on root-relative paths and on the literal spaces in this
// site's folder names) — but its actual runtime behavior
// (@docusaurus/core's Link component) is to treat ANY `pathname://` href
// as *not internal*: it renders a plain `<a target="_blank">` instead of
// a client-side route change. That was invisible in the original,
// pre-this-file sidebars.js (its `pathname://` items lived inside
// collapsed categories that were never expanded during testing) but
// becomes very visible once the same mechanism is used for dozens of
// links throughout an always-partly-expanded tree — user report: "if I
// click on a software tool it opens a new page". `encodeURI()` on a plain
// path passes the SAME Joi `URISchema` validation (its first alternative
// is `Joi.string().uri({allowRelative: true})`, which accepts a
// percent-encoded relative path — it's the raw, un-encoded space
// characters that failed validation, not root-relativeness itself) while
// keeping the href free of any scheme, so Docusaurus's own
// `isInternalUrl()` correctly treats it as internal: normal client-side
// SPA navigation, no new tab.
//
// Cross-instance link items can't carry Docusaurus's usual
// frontmatter-derived label for free (a `type: 'link'` item needs an
// explicit `label`), so `leaf()` labels are read from each doc's own
// frontmatter here instead of being duplicated/hardcoded — they can never
// drift out of sync with the doc itself.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DOCS_ROOT = path.join(ROOT, 'docs');

function leaf(docId) {
  return { kind: 'leaf', docId };
}

function versioned(label, tool) {
  return { kind: 'versioned', label, tool };
}

function category(label, items, docId) {
  return { kind: 'category', label, items, docId };
}

// tool key (matches docusaurus.config.js plugin `id`) -> absolute site path.
export const VERSIONED_TOOL_PATHS = {
  'tactile-cpp': '/docs/drivers/Tactile Sensor/Libraries/C++',
  'tactile-python': '/docs/drivers/Tactile Sensor/Libraries/Python',
  'isaac-sim': '/docs/drivers/Adaptive grippers/Simulation/Isaac Sim',
  'adaptive-grippers-cpp': '/docs/drivers/Adaptive grippers/Libraries/C++',
};

export const SITE_TREE = [
  leaf('intro'),
  category('Adaptive grippers', [
    category('Libraries', [
      versioned('C++', 'adaptive-grippers-cpp'),
      leaf('drivers/Adaptive grippers/Libraries/Python/index'),
    ]),
    category('ROS', [
      leaf('drivers/Adaptive grippers/ROS/ROS2-Lyrical/index'),
      leaf('drivers/Adaptive grippers/ROS/ROS2-Jazzy/index'),
      leaf('drivers/Adaptive grippers/ROS/ROS2-Humble/index'),
      leaf('drivers/Adaptive grippers/ROS/ROS1-Melodic/index'),
      leaf('drivers/Adaptive grippers/ROS/ROS1-Kinetic/index'),
      leaf('drivers/Adaptive grippers/ROS/ROS1-Indigo/index'),
    ], 'drivers/Adaptive grippers/ROS/index'),
    category('Simulation', [
      versioned('Isaac Sim', 'isaac-sim'),
      leaf('drivers/Adaptive grippers/Simulation/PyBullet/index'),
      leaf('drivers/Adaptive grippers/Simulation/MuJoCo/index'),
    ]),
    category('Other', [
      leaf('drivers/Adaptive grippers/Other/GraspGen/index'),
    ]),
  ], 'drivers/Adaptive grippers/index'),
  category('Tactile Sensor', [
    category('Libraries', [
      versioned('C++', 'tactile-cpp'),
      versioned('Python', 'tactile-python'),
    ]),
    category('ROS', [
      leaf('drivers/Tactile Sensor/ROS/ROS2-Lyrical/index'),
      leaf('drivers/Tactile Sensor/ROS/ROS2-Jazzy/index'),
      leaf('drivers/Tactile Sensor/ROS/ROS2-Humble/index'),
      leaf('drivers/Tactile Sensor/ROS/ROS1-Noetic/index'),
    ], 'drivers/Tactile Sensor/ROS/index'),
    category('Simulation', [
      leaf('drivers/Tactile Sensor/Simulation/Isaac Sim/index'),
    ]),
  ], 'drivers/Tactile Sensor/index'),
  category('Force Torque Sensor', [
    category('Libraries', [
      leaf('drivers/Force Torque Sensor/Libraries/C/index'),
      leaf('drivers/Force Torque Sensor/Libraries/Python/index'),
    ]),
    category('ROS', [
      leaf('drivers/Force Torque Sensor/ROS/ROS2-Humble/index'),
    ], 'drivers/Force Torque Sensor/ROS/index'),
  ], 'drivers/Force Torque Sensor/index'),
  category('EPick', [
    category('ROS', [
      leaf('drivers/EPick/ROS/ROS2-Humble/index'),
    ], 'drivers/EPick/ROS/index'),
  ], 'drivers/EPick/index'),
];

function pathFromDocId(docId) {
  return `/docs/${docId.replace(/\/index$/, '')}`;
}

function findDocFile(docId) {
  for (const ext of ['.mdx', '.md']) {
    const candidate = path.join(DOCS_ROOT, `${docId}${ext}`);
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

function renderMain(node) {
  if (node.kind === 'versioned') {
    return { type: 'link', label: node.label, href: encodeURI(VERSIONED_TOOL_PATHS[node.tool]) };
  }
  if (node.kind === 'category') {
    const rendered = { type: 'category', label: node.label, items: node.items.map(renderMain) };
    if (node.docId) rendered.link = { type: 'doc', id: node.docId };
    return rendered;
  }
  return node.docId;
}

/** Builds the main site instance's full driverSidebar-equivalent tree. */
export function buildMainSidebar() {
  return SITE_TREE.map(renderMain);
}

function renderVersionedInstance(node, activeItems) {
  if (node.kind === 'versioned') {
    // Every versioned tool belongs to this one shared instance now, so
    // there's always real content here — no "is this the active one"
    // branch, unlike the single-active-tool version this replaced.
    return activeItems[node.tool];
  }
  if (node.kind === 'category') {
    // No `link` here: none of these doc ids belong to this plugin
    // instance, so there's nothing for the category header itself to
    // point at — it's still expandable/collapsible, just not clickable
    // (same as Docusaurus's own default for a category without a link).
    return { type: 'category', label: node.label, items: node.items.map((n) => renderVersionedInstance(n, activeItems)) };
  }
  return { type: 'link', label: readDocLabel(node.docId), href: encodeURI(pathFromDocId(node.docId)) };
}

/**
 * Builds the shared versioned-tools instance's own sidebar: the full site
 * tree, with every versioned-tool node replaced by its own real content
 * (`activeItems`, a `{toolId: item}` map) and everything else a plain link
 * back to the default instance.
 */
export function buildVersionedInstanceSidebar(activeItems) {
  return SITE_TREE.map((n) => renderVersionedInstance(n, activeItems));
}

// Docusaurus freezes a cut version's sidebar into
// `<id>_versioned_sidebars/version-<name>-sidebars.json` at `docs:version:`
// time — it never re-reads sidebars.versioned-tools.js for anything but
// the *current* version. That snapshot is `buildVersionedInstanceSidebar`'s
// WHOLE output (see docs/contribute/versioning.mdx), so it goes stale the
// same way any other cached copy of SITE_TREE would: a renamed label, a
// moved page, a new product added later, none of that reaches an
// already-cut version until someone notices and hand-edits (or re-cuts) it.
//
// `extractActiveItems` + `regenerateInstanceSidebar` below are how
// scripts/regenerate-versioned-sidebars.mjs keeps every cut version's
// snapshot in sync on every `npm run generate`, without needing to know
// per-tool, per-version which real content shape each tool's own item
// should be (a tool's non-current versions can have a DIFFERENT shape than
// its current one — e.g. adaptive-grippers-cpp's Stable can be sparser
// than its Development (main), from before its source repo grew a docs/
// folder). Rather than guess that shape, this walks SITE_TREE in lockstep
// with the version's OWN existing snapshot and pulls out whatever's
// already sitting at each versioned tool's own position — correct by
// construction, since that position held the real, frozen content the
// moment the version was actually cut, and nothing about a tool's own
// frozen content changes after the fact (only the surrounding site tree
// does). This assumes the existing snapshot is STRUCTURALLY parallel to
// the current SITE_TREE (same shape at every other position) — true
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
 */
export function regenerateInstanceSidebar(existingItems) {
  const activeItems = extractActiveItems(existingItems);
  const expectedTools = SITE_TREE.flatMap(collectVersionedTools);
  if (expectedTools.some((tool) => activeItems[tool] === undefined)) return undefined;
  return buildVersionedInstanceSidebar(activeItems);
}

function collectVersionedTools(node) {
  if (node.kind === 'versioned') return [node.tool];
  if (node.kind === 'category') return node.items.flatMap(collectVersionedTools);
  return [];
}
