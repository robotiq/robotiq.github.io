// @ts-check

// Sidebar for the 'tactile-cpp' plugin instance only (see
// docusaurus.config.js's `plugins` array and
// draft/documentation-versioning.md). Built from the same shared tree as
// the main sidebar (scripts/site-nav-tree.mjs) so the rest of the site's
// navigation stays visible here too — only this tool's own node resolves
// to real content (a single page, no guides/API sub-navigation); every
// other node is a plain link into the main site or another versioned
// instance.

import { buildInstanceSidebar } from './scripts/site-nav-tree.mjs';

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tactileCppSidebar: buildInstanceSidebar('tactile-cpp', { type: 'doc', id: 'index', label: 'C++' }),
};

export default sidebars;
