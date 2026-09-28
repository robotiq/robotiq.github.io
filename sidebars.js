// @ts-check

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// Every product/tool now lives in the shared 'versioned-tools' plugin
// instance (see docusaurus.config.js, docs/contribute/versioning.mdx) —
// two plugin instances can't split ownership of one URL prefix, so the
// whole "Software Tools" tree (scripts/site-nav-tree.mjs's SITE_TREE) had
// to move there together, not stay split across this default instance and
// that one. This file now only covers docs/intro.mdx (which deliberately
// stayed here so its URL, /docs/intro, doesn't change) and the contributor
// docs.

import { buildOverviewSidebar } from './scripts/site-nav-tree.mjs';

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
  // Not shown in the navbar (the "Software Tools" navbar item points at
  // the versioned-tools instance's own sidebar directly) — this is only
  // what renders on docs/intro.mdx's own left nav when landed on
  // directly (e.g. by clicking "Overview" from the tools sidebar). It has
  // to be the SAME full tree, as plain links, or that navigation
  // disappears entirely on this one page — see buildOverviewSidebar's own
  // comment for why a doc can't just display another instance's sidebar
  // directly. docs/api-stability.mdx deliberately has no sidebar entry
  // anywhere — it's reachable contextually (the Development banner,
  // docs/intro.mdx's own text), not as a tree item.
  overviewSidebar: ['intro', ...buildOverviewSidebar()],

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
