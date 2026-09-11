// @ts-check

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFolderSidebarItems } from './scripts/folder-sidebar.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Reads the (already pruned) sidebar subtree that
// scripts/sync-external-docs.js's doxygen2docusaurus handling writes for a
// given API folder's doc-id prefix — see external-jobs.js's `doxygen2docusaurus`
// job and sync-external-docs.js's `doxygenSidebarOutputPath` (same name
// algorithm, duplicated here since one is CommonJS and this file is ESM).
// Returns [] before the first `npm run generate` / `npm start` — same
// graceful-empty behavior generateFolderSidebarItems has for its own folder.
function loadDoxygenSidebarItems(apiFolderPath) {
  const safeName = apiFolderPath.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const jsonPath = path.join(__dirname, 'scripts', 'generated', `doxygen-sidebar-${safeName}.json`);
  if (!fs.existsSync(jsonPath)) return [];
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.

 @type {import('@docusaurus/plugin-content-docs').SidebarsConfig}
 */
const sidebars = {
  driverSidebar: [
    'intro',
    {
      type: 'category',
      label: '2F / Hand-E',
      link: { type: 'doc', id: 'drivers/2F hande/index' },
      items: [
        {
          type: 'category',
          label: 'SDK',
          items: [
            {
              type: 'category',
              label: 'C++',
              link: { type: 'doc', id: 'drivers/2F hande/SDK/C++/index' },
              items: [
                {
                  type: 'category',
                  label: 'Documentation',
                  link: { type: 'doc', id: 'drivers/2F hande/SDK/C++/docs/index' },
                  // Ordered by each guide's sidebar_position (stamped by
                  // sync-external-docs.js from the source repo's own README
                  // order) — see scripts/folder-sidebar.mjs. No per-guide
                  // entry to maintain here.
                  items: generateFolderSidebarItems('drivers/2F hande/SDK/C++/docs'),
                },
                {
                  type: 'category',
                  label: 'API Reference',
                  link: { type: 'doc', id: 'drivers/2F hande/SDK/C++/API/index' },
                  // "Topics" (the Doxygen \defgroup/\ingroup hierarchy: Core
                  // API > Commands & Status / Connection & Configuration /
                  // Register Map & Masks / Runtime & Extension Points /
                  // Utilities, plus Testing & CI Utilities) and "Classes" (a
                  // full hierarchy plus alphabetical/kind indices), both
                  // generated straight from the Doxygen XML by
                  // doxygen2docusaurus and pruned to this site's scope by
                  // scripts/sync-external-docs.js — see external-jobs.js's
                  // `doxygen2docusaurus` job. No manual upkeep needed as
                  // groups/classes are added, renamed, or removed upstream.
                  items: loadDoxygenSidebarItems('drivers/2F hande/SDK/C++/API'),
                },
                
              ],
            },
            'drivers/2F hande/SDK/Python/index',
          ],
        },
        {
          type: 'category',
          label: 'ROS',
          link: { type: 'doc', id: 'drivers/2F hande/ROS/index' },
          items: [
            'drivers/2F hande/ROS/ROS2-Rolling/index',
            'drivers/2F hande/ROS/ROS2-Iron/index',
            'drivers/2F hande/ROS/ROS2-Humble/index',
            'drivers/2F hande/ROS/ROS1-Melodic/index',
            'drivers/2F hande/ROS/ROS1-Kinetic/index',
            'drivers/2F hande/ROS/ROS1-Jade/index',
            'drivers/2F hande/ROS/ROS1-Indigo/index',
          ],
        },
        {
          type: 'category',
          label: 'Physics Engine',
          items: [
            'drivers/2F hande/Physics Engine/Isaac Sim/index',
            'drivers/2F hande/Physics Engine/PyBullet/index',
          ],
        },
        {
          type: 'category',
          label: 'Other',
          items: [
            'drivers/2F hande/Other/GraspGen/index',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'TSF-85',
      link: { type: 'doc', id: 'drivers/TSF-85/index' },
      items: [
        {
          type: 'category',
          label: 'SDK',
          items: [
            'drivers/TSF-85/SDK/C++/index',
            'drivers/TSF-85/SDK/Python/index',
          ],
        },
        {
          type: 'category',
          label: 'ROS',
          link: { type: 'doc', id: 'drivers/TSF-85/ROS/index' },
          items: [
            'drivers/TSF-85/ROS/ROS2-Jazzy/index',
          ],
        },
        {
          type: 'category',
          label: 'Physics Engine',
          items: [
            'drivers/TSF-85/Physics Engine/Isaac Sim/index',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'FT300-S',
      link: { type: 'doc', id: 'drivers/FT300/index' },
      items: [
        {
          type: 'category',
          label: 'SDK',
          items: [
            'drivers/FT300/SDK/C/index',
            'drivers/FT300/SDK/Python/index',
          ],
        },
        {
          type: 'category',
          label: 'ROS',
          link: { type: 'doc', id: 'drivers/FT300/ROS/index' },
          items: [
            'drivers/FT300/ROS/ROS2-Humble/index',
          ],
        },
      ],
    },
  ],

  // Contributor docs — deliberately not shown in the site's main navbar
  // (Docusaurus still uses this sidebar whenever someone lands on a
  // contribute/* page, e.g. via the footer's "Contribute" link), split by
  // topic so no single page grows unbounded — see docs/contribute/.
  contributeSidebar: [
    'contribute/index',
    'contribute/how-it-works',
    'contribute/adding-a-tool',
    'contribute/tools-tables',
    {
      type: 'category',
      label: 'Auto-generated API reference',
      items: [
        'contribute/api-reference-python',
        'contribute/api-reference-cpp',
      ],
    },
    'contribute/quick-reference',
  ],
};

export default sidebars;
