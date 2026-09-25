// @ts-check

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// generateFolderSidebarItems/doxygenApiCategory (and its own
// doxygenSidebarJsonPath/loadDoxygenSidebarItems helpers) used to live here
// for the Adaptive grippers C++ tool's "Introduction guides"/"API
// Reference" nesting — that tool moved to its own versioned plugin instance
// (see docusaurus.config.js, 'adaptive-grippers-cpp', and
// draft/documentation-versioning.md), taking that nesting with it into
// sidebars.adaptive-grippers-cpp.js. Nothing left in this file needs them;
// re-add if a future non-versioned tool grows the same guides+API shape.
//
// driverSidebar's tree (which products/tools/versions exist, in what
// order) is defined once in scripts/site-nav-tree.mjs and shared with each
// versioned tool's own sidebar file, so the full site navigation stays
// visible when browsing a versioned tool's pages too — see that file's own
// header comment for why.

import { buildMainSidebar } from './scripts/site-nav-tree.mjs';

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
  driverSidebar: buildMainSidebar(),

  // Contributor docs — deliberately not shown in the site's main navbar
  // (Docusaurus still uses this sidebar whenever someone lands on a
  // contribute/* page, e.g. via the footer's "Contribute" link), split by
  // topic so no single page grows unbounded — see docs/contribute/.
  contributeSidebar: [
    'contribute/index',
    'contribute/how-it-works',
    'contribute/adding-a-tool',
    'contribute/versioning',
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
