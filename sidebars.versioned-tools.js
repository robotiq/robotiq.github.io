// @ts-check

// Sidebar for the shared 'versioned-tools' plugin instance (see
// docusaurus.config.js and docs/contribute/versioning.mdx) — every
// submodule-synced tool's own real content, spliced into the same shared
// tree scripts/site-nav-tree.mjs uses for the main sidebar, so the rest of
// the site's navigation stays visible here too instead of disappearing
// behind just these tools' own branches.
//
// Doc ids below are relative to this instance's own `path`
// (versioned-tools/), not the main site's docs/.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateFolderSidebarItems } from './scripts/folder-sidebar.mjs';
import { buildVersionedInstanceSidebar } from './scripts/site-nav-tree.mjs';
import { VERSIONED_TOOLS } from './scripts/versioned-tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, 'versioned-tools');

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

const activeItems = {
  'tactile-cpp': simpleItem('tactile-cpp', 'C++'),
  'tactile-python': simpleItem('tactile-python', 'Python'),
  'isaac-sim': simpleItem('isaac-sim', 'Isaac Sim'),
  'adaptive-grippers-cpp': {
    type: 'category',
    label: 'C++',
    link: { type: 'doc', id: `${VERSIONED_TOOLS['adaptive-grippers-cpp'].toolPath}/index` },
    items: [
      ...guidesCategory(VERSIONED_TOOLS['adaptive-grippers-cpp'].toolPath, 'Introduction guides'),
      ...doxygenApiCategory(
        `${VERSIONED_TOOLS['adaptive-grippers-cpp'].toolPath}/API`,
        `${VERSIONED_TOOLS['adaptive-grippers-cpp'].toolPath}/API/index`,
        'API Reference'
      ),
    ],
  },
};

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  versionedToolsSidebar: buildVersionedInstanceSidebar(activeItems),
};

export default sidebars;
