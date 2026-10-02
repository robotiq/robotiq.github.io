import React, {useEffect, useRef} from 'react';
import OriginalLayout from '@theme-original/Layout';
import {useHistory, useLocation} from '@docusaurus/router';
import {useActiveDocContext, useDocsPreferredVersion} from '@docusaurus/plugin-content-docs/client';
import findNearestDocInVersion from '../findNearestDocInVersion';

const PLUGIN_ID = 'software-tools';

// Docusaurus already remembers the visitor's last-chosen version for this
// instance (useDocsPreferredVersion's own localStorage, saved whenever the
// version dropdown or a DocVersionBanner suggestion link is used — see
// src/theme/DocVersionBanner) and keeps you in it while you click internal
// links within a version. The one thing it doesn't do on its own: landing
// on a software-tools page whose OWN version doesn't match that stored
// preference — this redirects to the equivalent page in the preferred
// version instead, so "stay on whichever version I last picked" holds
// everywhere, not just while clicking links that were already
// version-aware. This covers two real cases:
// - Returning to the site root, which always serves Stable regardless of
//   what a returning visitor picked last time.
// - Following one of the auto-generated tool-table links on docs/intro.mdx
//   (see generate-tools-table.js) — intro.mdx deliberately lives outside
//   this instance so its own URL never changes, so those links can only
//   ever be plain, version-less paths, always resolving to whichever
//   version owns the bare URL (Stable). This is the only place that fixes
//   it up afterward.
//
// Swizzled into Layout (wrap), not Root: useDocsPreferredVersion needs
// <DocsPreferredVersionContextProvider>, which @theme/Layout/Provider only
// mounts INSIDE Layout's own children tree — Root wraps the whole app
// from further out, before that provider exists yet. Confirmed the hard
// way: mounting this in Root crashed every page in dev with "Hook
// useDocsPreferredVersionContext is called outside the
// <DocsPreferredVersionContextProvider>."
//
// Runs on every navigation, not just once per hard page load — needed for
// the docs/intro.mdx case above, which by definition isn't caught on first
// load (the visitor is already past it by the time they click the link).
// The version dropdown (src/theme/NavbarItem/DocsVersionDropdownNavbarItem.jsx)
// navigates on click too now, for the common case (picking a version while
// already on a software-tools page) — this effect is only the backstop for
// landing on a mismatched version some OTHER way, so the two don't race:
// by the time this runs after a dropdown click, the URL already matches,
// so the checks below are no-ops.
//
// Three bugs used to combine into a "Maximum update depth exceeded" (React
// #185) loop here, reproduced by switching versions and confirmed fixed by
// all three of the guards below:
// 1. `target` is a docs-data path, unencoded (e.g. a literal space in
//    "Adaptive grippers"); `window.location.pathname` is URL-encoded. Every
//    software-tools path has a space, so a direct `!==` comparison was
//    always true, even right after this effect's own redirect had already
//    landed there.
// 2. `activeDoc` (and `preferredVersion`) are new object references every
//    render (useActiveDocContext/useDocsPreferredVersion build them fresh
//    each call) — listing them in the deps array doesn't actually memoize
//    anything, so the effect re-ran on every render.
// 3. Docusaurus's own PendingNavigation keeps rendering the OLD location
//    while the next route preloads, so during that window this effect can
//    still read as mismatched for several renders in a row. Combined with
//    #1 and #2, each of those renders queued another `history.replace`,
//    each one starting another pending navigation — the loop.
function StickyVersionRedirect() {
  const history = useHistory();
  const location = useLocation();
  const {activeVersion, activeDoc} = useActiveDocContext(PLUGIN_ID);
  const {preferredVersion} = useDocsPreferredVersion(PLUGIN_ID);
  const activeVersionName = activeVersion?.name;
  const preferredVersionName = preferredVersion?.name;

  // Fixes #1: compare decoded paths instead of the raw (encoded)
  // window.location.pathname.
  const currentPath = decodeURI(location.pathname);

  // Fixes #2/#3: a ref (not state, so setting it never itself triggers a
  // render) remembering the last (path, preferred version) pair this
  // already redirected away from — belt-and-suspenders on top of the deps
  // array below, since it also catches a same-render-key re-run that #1's
  // fix alone wouldn't (e.g. a genuinely mismatched version with no
  // equivalent page, which keeps resolving to the same fallback target).
  const firedForRef = useRef(null);

  useEffect(() => {
    if (!activeVersionName || !preferredVersionName) return;
    if (preferredVersionName === activeVersionName) return;

    const key = `${currentPath}->${preferredVersionName}`;
    if (firedForRef.current === key) return;

    // Walks up to the nearest ancestor page that exists in the preferred
    // version when there's no equivalent of the CURRENT page in it — e.g.
    // an early tag can predate a Doxyfile, so Stable has no API reference
    // at all yet even though Latest does. Without this fallback, picking a
    // version with no equivalent page for the current doc either did
    // nothing (dropdown's label updated but nothing navigated, which
    // looked exactly like a broken click) or, with a plain mainDocId
    // fallback, dumped the visitor on the sitewide Overview even when a
    // much closer page (the tool's own, or the product's) was available.
    if (!activeDoc) return;
    const target = findNearestDocInVersion(activeDoc.id, preferredVersion)?.path;
    if (!target || decodeURI(target) === currentPath) return;

    firedForRef.current = key;
    history.replace(target + location.search + location.hash);
    // activeDoc/preferredVersion are deliberately left out of this array
    // (see #2 above) — they're new objects every render, so listing them
    // would defeat the point; whenever this effect DOES run, it always
    // reads their current-render values regardless of what's listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVersionName, preferredVersionName, currentPath, location.search, location.hash, history]);

  return null;
}

export default function Layout(props) {
  return (
    <OriginalLayout {...props}>
      <StickyVersionRedirect />
      {props.children}
    </OriginalLayout>
  );
}
