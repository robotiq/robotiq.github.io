// @ts-check

// Single source of truth for the full "Software Tools" navigation tree,
// used to build BOTH the main sidebar (sidebars.js) AND each versioned
// tool's own sidebar (sidebars.<tool>.js).
//
// Why this exists: each versioned tool (Tactile Sensor C++/Python, Isaac
// Sim, Adaptive grippers C++) lives in its own Docusaurus
// plugin-content-docs instance for independent version cuts (see
// docusaurus.config.js, draft/documentation-versioning.md). A plugin
// instance can only build sidebar items out of doc ids it owns — every
// other page has to be a plain link. Previously each per-tool sidebar file
// listed ONLY that tool's own page(s), so clicking a versioned tool from
// the main sidebar replaced the entire left nav with that tool's tiny
// sidebar: the rest of the site (other products, ROS versions, etc.)
// disappeared, making the page feel like a disconnected, separate site
// (explicit user feedback — the whole-site navigation must stay visible
// everywhere). Fixed by describing the tree once, here, and rendering it
// two ways:
//   - buildMainSidebar(): real doc ids for everything the main instance
//     owns, plain links only for the versioned-tool leaves — this is what
//     sidebars.js already did.
//   - buildInstanceSidebar(activeTool, activeItem): plain links for EVERY
//     node except the one matching `activeTool`, which is replaced by
//     `activeItem` (that instance's own real, doc-id-based sidebar
//     item/category) — used by each sidebars.<tool>.js. This keeps the
//     full tree visible, in the same order, on every page; only the
//     currently-open tool's branch expands into real content.
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

function renderInstance(node, activeTool, activeItem) {
  if (node.kind === 'versioned') {
    if (node.tool === activeTool) return activeItem;
    return { type: 'link', label: node.label, href: encodeURI(VERSIONED_TOOL_PATHS[node.tool]) };
  }
  if (node.kind === 'category') {
    // No `link` here: none of these doc ids belong to this plugin
    // instance, so there's nothing for the category header itself to
    // point at — it's still expandable/collapsible, just not clickable
    // (same as Docusaurus's own default for a category without a link).
    return { type: 'category', label: node.label, items: node.items.map((n) => renderInstance(n, activeTool, activeItem)) };
  }
  return { type: 'link', label: readDocLabel(node.docId), href: encodeURI(pathFromDocId(node.docId)) };
}

/**
 * Builds one versioned tool's own sidebar: the full site tree, with every
 * node a plain link except `activeTool`, which is replaced by `activeItem`
 * (a real sidebar item/category built from this instance's own doc ids).
 */
export function buildInstanceSidebar(activeTool, activeItem) {
  return SITE_TREE.map((n) => renderInstance(n, activeTool, activeItem));
}

// Docusaurus freezes a cut version's sidebar into
// `<id>_versioned_sidebars/version-<name>-sidebars.json` at `docs:version:`
// time — it never re-reads sidebars.<tool>.js for anything but the
// *current* version. That snapshot is `buildInstanceSidebar`'s WHOLE
// output (see docs/contribute/versioning.mdx), so it goes stale the same
// way any other cached copy of SITE_TREE would: a renamed label, a moved
// page, a new product added later, none of that reaches an already-cut
// version until someone notices and hand-edits (or re-cuts) it.
//
// `extractActiveItem` + `regenerateInstanceSidebar` below are how
// scripts/regenerate-versioned-sidebars.mjs keeps every cut version's
// snapshot in sync on every `npm run generate`, without needing to know
// per-tool, per-version which real content shape `activeItem` should be
// (a versioned tool's non-current versions can have a DIFFERENT shape
// than its current one — e.g. adaptive-grippers-cpp's Stable is a single
// page today, sparse content from before its source repo grew a docs/
// folder, while its Latest has nested guides/API). Rather than guess that
// shape, this walks SITE_TREE in lockstep with the version's OWN existing
// snapshot and pulls out whatever's already sitting at `activeTool`'s
// position — correct by construction, since that position held the real,
// frozen content the moment the version was actually cut, and nothing
// about a tool's own frozen content changes after the fact (only the
// surrounding site tree does). This assumes the existing snapshot is
// STRUCTURALLY parallel to the current SITE_TREE (same shape at every
// other position) — true immediately after any regeneration, including
// this one, so it self-heals on the very next run; it could only miss if
// SITE_TREE's own shape changed AND a version was never regenerated since
// (a one-time gap, not a standing risk, given this runs on every build).
export function extractActiveItem(activeTool, existingItems) {
  for (let i = 0; i < SITE_TREE.length; i += 1) {
    const node = SITE_TREE[i];
    const existing = existingItems[i];
    if (!existing) continue;
    if (node.kind === 'versioned' && node.tool === activeTool) return existing;
    if (node.kind === 'category' && Array.isArray(existing.items)) {
      const found = extractActiveItemFrom(node.items, existing.items, activeTool);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function extractActiveItemFrom(nodes, existingItems, activeTool) {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const existing = existingItems[i];
    if (!existing) continue;
    if (node.kind === 'versioned' && node.tool === activeTool) return existing;
    if (node.kind === 'category' && Array.isArray(existing.items)) {
      const found = extractActiveItemFrom(node.items, existing.items, activeTool);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * Regenerates one cut version's frozen sidebar snapshot: extracts
 * `activeTool`'s real content out of its own existing snapshot
 * (`existingItems`, that version's current sidebar array), then rebuilds
 * the surrounding tree fresh from the live SITE_TREE. Returns the new
 * items array, or `undefined` if `activeTool`'s content couldn't be found
 * in `existingItems` (a genuinely new/reshaped tree — falls back to
 * leaving that snapshot alone rather than guessing).
 */
export function regenerateInstanceSidebar(activeTool, existingItems) {
  const activeItem = extractActiveItem(activeTool, existingItems);
  if (activeItem === undefined) return undefined;
  return buildInstanceSidebar(activeTool, activeItem);
}
