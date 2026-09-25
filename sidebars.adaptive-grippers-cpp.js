// @ts-check

// Sidebar for the 'adaptive-grippers-cpp' plugin instance only (see
// docusaurus.config.js's `plugins` array and
// draft/documentation-versioning.md) — mirrors the "Introduction guides" +
// "API Reference" nesting the main sidebars.js used to carry for this tool
// directly, before it moved to its own versioned instance. Doc ids here are
// relative to this instance's own `path`
// (versioned-tools/Adaptive grippers/Libraries/C++), not the main site's.
//
// That nesting is wrapped in a 'C++' category (below) and spliced into the
// same shared tree the main sidebar uses (scripts/site-nav-tree.mjs), so
// the rest of the site's navigation stays visible here too instead of
// disappearing behind just this tool's own two categories.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateFolderSidebarItems } from './scripts/folder-sidebar.mjs';
import { buildInstanceSidebar } from './scripts/site-nav-tree.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FS_ROOT = path.join(__dirname, 'versioned-tools', 'Adaptive grippers', 'Libraries', 'C++');

// Same lookup sidebars.js's own doxygenApiCategory/loadDoxygenSidebarItems
// use, duplicated here (not imported — that file is ESM-from-CJS-adjacent
// and not set up to export these) since this instance's own doxygen2docusaurus
// job (see external-jobs.js) writes to the same scripts/generated/ location,
// keyed by the same (now instance-relative) apiFolderPath value ('API').
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

const cppItem = {
  type: 'category',
  label: 'C++',
  link: { type: 'doc', id: 'index' },
  items: [
    {
      type: 'category',
      label: 'Introduction guides',
      link: { type: 'doc', id: 'docs/index' },
      items: generateFolderSidebarItems('docs', FS_ROOT),
    },
    ...doxygenApiCategory('API', 'API/index', 'API Reference'),
  ],
};

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  adaptiveGrippersCppSidebar: buildInstanceSidebar('adaptive-grippers-cpp', cppItem),
};

export default sidebars;
