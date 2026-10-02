// @ts-check

// Sidebar for the shared 'software-tools' plugin instance (see
// docusaurus.config.js and docs/contribute/versioning.mdx) — the whole
// site's Software Tools tree lives here now (scripts/site-nav-tree.mjs's
// SITE_TREE); this file supplies real content only for the handful of
// `versioned` nodes (submodule-backed tools whose content shape can
// differ per Docusaurus version), everything else is a plain doc id
// SITE_TREE already resolves on its own. That content (label, one-page
// link vs. guides/API category) is itself derived from
// scripts/external-jobs.js/scripts/versioned-tools.js, not hand-written
// here — see activeItemFor's own comment.
//
// Doc ids below are relative to this instance's own `path`
// (software-tools/), not the main site's docs/.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateFolderSidebarItems } from './scripts/folder-sidebar.mjs';
import { buildSidebar, toolLabels } from './scripts/site-nav-tree.mjs';
import { VERSIONED_TOOLS } from './scripts/versioned-tools.js';
import JOBS from './scripts/external-jobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, 'software-tools');

function simpleItem(toolId, label) {
  return { type: 'doc', id: `${VERSIONED_TOOLS[toolId].toolPath}/index`, label };
}

// Same lookup sidebars.js's own doxygenApiCategory/loadDoxygenSidebarItems
// used, duplicated here (not imported — that file is ESM-from-CJS-adjacent
// and not set up to export these) since this instance's own doxygen2docusaurus
// job (see external-jobs.js) writes to the same scripts/generated/ location,
// keyed by the same (now instance-relative) apiFolderPath value.
function doxygenSidebarJsonPath(apiFolderPath) {
  const safeName = apiFolderPath.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const hash = crypto.createHash('sha1').update(apiFolderPath).digest('hex').slice(0, 8);
  return path.join(__dirname, 'scripts', 'generated', `doxygen-sidebar-${safeName}-${hash}.json`);
}

function loadDoxygenSidebarItems(apiFolderPath) {
  const jsonPath = doxygenSidebarJsonPath(apiFolderPath);
  if (!fs.existsSync(jsonPath)) return [];
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

function doxygenApiCategory(apiFolderPath, docId, label) {
  if (!fs.existsSync(doxygenSidebarJsonPath(apiFolderPath))) return [];
  return [{
    type: 'category',
    label,
    link: { type: 'doc', id: docId },
    items: loadDoxygenSidebarItems(apiFolderPath),
  }];
}

// Guarded the same way as doxygenApiCategory above, and for the same
// reason: a version this sidebar gets frozen for (a tag can predate the
// guides folder) may have no `docs/` content at all. Without this guard
// the category's own `link` still points at `<toolPath>/docs/index`
// unconditionally, freezing a doc id that doesn't exist into that
// version's sidebar snapshot — caught by Docusaurus's checkSidebarsDocIds
// only at build time, not at cut time.
function guidesCategory(toolPath, label) {
  const fsRoot = path.join(ROOT, ...toolPath.split('/'));
  const indexPath = ['index.mdx', 'index.md'].map((f) => path.join(fsRoot, 'docs', f)).find((p) => fs.existsSync(p));
  if (!indexPath) return [];
  return [{
    type: 'category',
    label,
    link: { type: 'doc', id: `${toolPath}/docs/index` },
    items: generateFolderSidebarItems(`${toolPath}/docs`, ROOT),
  }];
}

// Auto-detects the one remaining per-tool choice this file used to hand-pick
// (a plain one-page link vs. a category with guides/API sub-items) by
// checking which KINDS of jobs external-jobs.js has for this toolId — a
// `to: '<toolPath>/docs'` job means a guides folder might exist, a
// `doxygen2docusaurus` job means a generated API reference might. Still
// only "might": guidesCategory/doxygenApiCategory each check the real
// file exists on disk before including anything, since a tag can predate
// either one even though the job itself (synced from `main`) always has it.
function activeItemFor(toolId, label) {
  const { toolPath } = VERSIONED_TOOLS[toolId];
  const jobs = JOBS.filter((job) => job.toolId === toolId);
  const hasGuides = jobs.some((job) => job.to === `${toolPath}/docs`);
  const hasApi = jobs.some((job) => job.doxygen2docusaurus && job.to === `${toolPath}/API`);

  if (!hasGuides && !hasApi) return simpleItem(toolId, label);

  return {
    type: 'category',
    label,
    link: { type: 'doc', id: `${toolPath}/index` },
    items: [
      ...(hasGuides ? guidesCategory(toolPath, 'Introduction guides') : []),
      ...(hasApi ? doxygenApiCategory(`${toolPath}/API`, `${toolPath}/API/index`, 'API Reference') : []),
    ],
  };
}

// Covers every tool scripts/versioned-tools.js knows about (itself derived
// from external-jobs.js's own `toolId` tags) with no separate per-tool
// line to maintain here — the only thing still hand-written for a new
// versioned tool is its one `versioned(label, toolId)` entry in
// scripts/site-nav-tree.mjs's SITE_TREE (where it sits in the nav, and
// what it's called there), whose label this reads back via toolLabels()
// rather than needing a second hand-typed copy of the same string.
const labels = toolLabels();
const activeItems = Object.fromEntries(
  Object.keys(VERSIONED_TOOLS).map((toolId) => [toolId, activeItemFor(toolId, labels[toolId])])
);

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  softwareToolsSidebar: [
    // Plain links, not SITE_TREE nodes — these two pages deliberately
    // stayed on the default instance (see sidebars.js), so they're not
    // real doc ids this instance owns.
    { type: 'link', label: 'Overview', href: '/docs/intro' },
    ...buildSidebar(activeItems),
  ],
};

export default sidebars;
