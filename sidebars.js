// @ts-check

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// Every product/tool now lives in the shared 'software-tools' plugin
// instance (see docusaurus.config.js, docs/website/versioning.mdx) —
// two plugin instances can't split ownership of one URL prefix, so the
// whole "Software Tools" tree (scripts/site-nav-tree.mjs's SITE_TREE) had
// to move there together, not stay split across this default instance and
// that one. This file now only covers docs/intro.mdx (which deliberately
// stayed here so its URL, /docs/intro, doesn't change) and the Website
// section's own docs.

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
  // the software-tools instance's own sidebar directly) — this is what
  // renders on docs/intro.mdx's and docs/api-stability.mdx's own left nav
  // when landed on directly (e.g. by clicking "Overview" from the tools
  // sidebar, or "compatibility commitment" from a Latest page's own
  // banner). The software stability policy nests under Overview as a
  // category child —
  // the same "product > sub-page" shape every product below it uses
  // (Adaptive grippers > Libraries > C++, ...) — rather than either being
  // an orphaned page with no sidebar of its own, or living inside the
  // internal contributor docs a customer checking it has no reason to
  // see. Everything after this category has to be the SAME full Software
  // Tools tree docs/intro.mdx itself uses, as plain links, or that
  // navigation disappears entirely on these two pages — see
  // buildOverviewSidebar's own comment for why a doc can't just display
  // another instance's sidebar directly.
  overviewSidebar: [
    {
      type: 'category',
      label: 'Overview',
      link: {type: 'doc', id: 'intro'},
      items: ['api-stability'],
    },
    ...buildOverviewSidebar(),
  ],

  // "Website" — everything about the site itself rather than any one
  // product/tool: contributor docs (deliberately not shown in the site's
  // main navbar; Docusaurus still uses this sidebar whenever someone lands
  // on a website/* page, e.g. via the footer's "Contribute" link), split
  // by topic so no single page grows unbounded (see docs/website/), plus
  // the site's own license and third-party notices — grouped with
  // contributor docs, not under Overview's per-tool tree, since the footer
  // lists them together under this same "Website" label.
  websiteSidebar: [
    {
      type: 'category',
      label: 'Website',
      items: [
        'website/index',
        'website/how-it-works',
        'website/adding-a-tool',
        'website/versioning',
        'website/tools-tables',
        {
          type: 'category',
          label: 'Auto-generated API reference',
          items: [
            'website/api-reference-python',
            'website/api-reference-cpp',
          ],
        },
        'website/quick-reference',
        {
          type: 'category',
          label: 'License',
          link: {type: 'doc', id: 'license'},
          items: ['third-party-notices'],
        },
      ],
    },
  ],
};

export default sidebars;
