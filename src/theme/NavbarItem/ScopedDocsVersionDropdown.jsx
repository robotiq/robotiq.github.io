import React from 'react';
import {useActivePlugin} from '@docusaurus/plugin-content-docs/client';
import DocsVersionDropdownNavbarItem from '@theme/NavbarItem/DocsVersionDropdownNavbarItem';

// The stock `docsVersionDropdown` navbar item (see
// DocsVersionDropdownNavbarItem.tsx in @docusaurus/theme-classic) always
// renders, everywhere on the site — when the current page isn't part of its
// own docsPluginId, it just falls back to a link at that instance's
// `lastVersion`, rather than disappearing. That's the opposite of what's
// needed here: per draft/documentation-versioning.md, the Latest/Stable/
// Previous versions switcher must only appear on the pages that actually
// belong to a Robotiq-maintained, submodule-synced tool's own versioned
// instance (e.g. 'tactile-python'), not site-wide on every other page
// (product pages, third-party tools, docs/contribute/...).
//
// This wraps the stock component and only renders it while
// useActivePlugin — which resolves the *current* URL to whichever docs
// plugin instance actually owns it — matches this item's own
// `docsPluginId`. `failfast: false` so a page that isn't a docs page at
// all (or belongs to some other docs instance) resolves to `undefined`
// instead of throwing.
export default function ScopedDocsVersionDropdown(props) {
  const activePlugin = useActivePlugin({failfast: false});
  if (activePlugin?.pluginId !== props.docsPluginId) {
    return null;
  }
  // Registering a custom navbar item type skips the prop-schema
  // normalization Docusaurus applies to its own built-in types — without
  // these, DocsVersionDropdownNavbarItem throws ("dropdownItemsBefore is
  // not iterable") since it assumes they're always at least [].
  return (
    <DocsVersionDropdownNavbarItem
      dropdownItemsBefore={[]}
      dropdownItemsAfter={[]}
      {...props}
    />
  );
}
