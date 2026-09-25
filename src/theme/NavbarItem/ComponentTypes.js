import ComponentTypes from '@theme-original/NavbarItem/ComponentTypes';
import ScopedDocsVersionDropdown from './ScopedDocsVersionDropdown';

// Adds one custom navbar item type on top of the full stock set (re-used
// via @theme-original, not hand-copied) — see ScopedDocsVersionDropdown for
// why the stock 'docsVersionDropdown' type can't be used directly here.
export default {
  ...ComponentTypes,
  'custom-scopedVersionDropdown': ScopedDocsVersionDropdown,
};
