// @ts-check

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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

// A doxygen2docusaurus job's own generated `.../API/index` doc only exists
// once `npm run generate` has actually produced it — sync-external-docs.js
// deliberately warns and continues instead of crashing when the submodule
// or the `doxygen` binary is missing, so the rest of the site can still
// build. Pointing a sidebar category's `link.id` at that doc unconditionally
// defeats that: Docusaurus's own sidebar validation fails hard ("Bad
// sidebars file / doc id not found") the moment the doc doesn't exist,
// which is exactly the crash the warn-and-continue was meant to avoid.
// Build the category only when the generated sidebar JSON — the same
// artifact that doc's own existence is contingent on — is actually there.
// Returns a single-item (or empty) array, meant to be spread straight into
// a sidebar `items` array, so the category is omitted entirely rather than
// present-but-empty when the underlying job hasn't run.
function doxygenApiCategory(apiFolderPath, docId, label) {
  if (!fs.existsSync(doxygenSidebarJsonPath(apiFolderPath))) return [];
  return [{
    type: 'category',
    label,
    link: { type: 'doc', id: docId },
    items: loadDoxygenSidebarItems(apiFolderPath),
  }];
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
      label: 'Adaptive grippers',
      link: { type: 'doc', id: 'drivers/Adaptive grippers/index' },
      items: [
        {
          type: 'category',
          label: 'Libraries',
          items: [
            {
              type: 'category',
              label: 'C++',
              link: { type: 'doc', id: 'drivers/Adaptive grippers/Libraries/C++/index' },
              items: [
                {
                  type: 'category',
                  label: 'Introduction guides',
                  link: { type: 'doc', id: 'drivers/Adaptive grippers/Libraries/C++/docs/index' },
                  // Ordered by each guide's sidebar_position (stamped by
                  // sync-external-docs.js from the source repo's own README
                  // order) — see scripts/folder-sidebar.mjs. No per-guide
                  // entry to maintain here.
                  items: generateFolderSidebarItems('drivers/Adaptive grippers/Libraries/C++/docs'),
                },
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
                // Omitted entirely (not just empty) if that job hasn't
                // produced output yet — see doxygenApiCategory above.
                ...doxygenApiCategory('drivers/Adaptive grippers/Libraries/C++/API', 'drivers/Adaptive grippers/Libraries/C++/API/index', 'API Reference'),
              ],
            },
            'drivers/Adaptive grippers/Libraries/Python/index',
          ],
        },
        {
          type: 'category',
          label: 'ROS',
          link: { type: 'doc', id: 'drivers/Adaptive grippers/ROS/index' },
          items: [
            'drivers/Adaptive grippers/ROS/ROS2-Lyrical/index',
            'drivers/Adaptive grippers/ROS/ROS2-Jazzy/index',
            'drivers/Adaptive grippers/ROS/ROS2-Humble/index',
            'drivers/Adaptive grippers/ROS/ROS1-Melodic/index',
            'drivers/Adaptive grippers/ROS/ROS1-Kinetic/index',
            'drivers/Adaptive grippers/ROS/ROS1-Indigo/index',
          ],
        },
        {
          type: 'category',
          label: 'Simulation',
          items: [
            'drivers/Adaptive grippers/Simulation/Isaac Sim/index',
            'drivers/Adaptive grippers/Simulation/PyBullet/index',
            'drivers/Adaptive grippers/Simulation/MuJoCo/index',
          ],
        },
        {
          type: 'category',
          label: 'Other',
          items: [
            'drivers/Adaptive grippers/Other/GraspGen/index',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Tactile Sensor',
      link: { type: 'doc', id: 'drivers/Tactile Sensor/index' },
      items: [
        {
          type: 'category',
          label: 'Libraries',
          items: [
            'drivers/Tactile Sensor/Libraries/C++/index',
            'drivers/Tactile Sensor/Libraries/Python/index',
          ],
        },
        {
          type: 'category',
          label: 'ROS',
          link: { type: 'doc', id: 'drivers/Tactile Sensor/ROS/index' },
          items: [
            'drivers/Tactile Sensor/ROS/ROS2-Lyrical/index',
            'drivers/Tactile Sensor/ROS/ROS2-Jazzy/index',
            'drivers/Tactile Sensor/ROS/ROS2-Humble/index',
            'drivers/Tactile Sensor/ROS/ROS1-Noetic/index',
          ],
        },
        {
          type: 'category',
          label: 'Simulation',
          items: [
            'drivers/Tactile Sensor/Simulation/Isaac Sim/index',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Force Torque Sensor',
      link: { type: 'doc', id: 'drivers/Force Torque Sensor/index' },
      items: [
        {
          type: 'category',
          label: 'Libraries',
          items: [
            'drivers/Force Torque Sensor/Libraries/C/index',
            'drivers/Force Torque Sensor/Libraries/Python/index',
          ],
        },
        {
          type: 'category',
          label: 'ROS',
          link: { type: 'doc', id: 'drivers/Force Torque Sensor/ROS/index' },
          items: [
            'drivers/Force Torque Sensor/ROS/ROS2-Humble/index',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'EPick',
      link: { type: 'doc', id: 'drivers/EPick/index' },
      items: [
        {
          type: 'category',
          label: 'ROS',
          link: { type: 'doc', id: 'drivers/EPick/ROS/index' },
          items: [
            'drivers/EPick/ROS/ROS2-Humble/index',
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
