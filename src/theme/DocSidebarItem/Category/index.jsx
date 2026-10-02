import React from 'react';
import OriginalDocSidebarItemCategory from '@theme-original/DocSidebarItem/Category';

// The stock component already supports a category header that's both a
// real link AND still expands/collapses on click — it's built entirely
// around `item.href` being a truthy string (see its own
// DocSidebarItemCategoryCollapsible: `href` drives handleItemClick's
// "navigate, don't just toggle" branch, and gets forwarded straight onto
// the rendered <Link>). Docusaurus only ever sets that itself from a
// category's `link: {type: 'doc', id}` — resolved at sidebar-build time
// against docs in that SAME plugin instance.
//
// scripts/site-nav-tree.mjs's `buildOverviewSidebar()` needs the exact
// same "clickable AND expandable" behavior for a category whose landing
// page belongs to a DIFFERENT instance (the real per-tool sidebar can use
// `link: {type: 'doc', id}` directly since everything there lives in one
// instance; this mirror, on docs/intro.mdx's own instance, can't). A bare
// `href` on a category item isn't an option either — Docusaurus's sidebar
// schema validation rejects it outright at build time ("not allowed").
// `customProps` is the one field every sidebar item schema leaves
// completely unrestricted, so site-nav-tree.mjs stashes the URL there
// instead (`customProps: {href}`) and this swizzle patches it onto
// `item.href` before handing off to the stock component — same
// mechanism, same resulting behavior, just fed from a field Docusaurus's
// own config validation doesn't police.
export default function DocSidebarItemCategory({item, ...props}) {
  const href = item.customProps?.href;
  const patchedItem = href ? {...item, href} : item;
  return <OriginalDocSidebarItemCategory item={patchedItem} {...props} />;
}
