import React, {useEffect} from 'react';
import OriginalLayout from '@theme-original/Layout';
import {useHistory} from '@docusaurus/router';
import {useActiveDocContext, useDocsPreferredVersion} from '@docusaurus/plugin-content-docs/client';

const PLUGIN_ID = 'versioned-tools';

// Docusaurus already remembers the visitor's last-chosen version for this
// instance (useDocsPreferredVersion's own localStorage, saved whenever the
// version dropdown or a DocVersionBanner suggestion link is used — see
// src/theme/DocVersionBanner) and keeps you in it while you click internal
// links within a version. The one thing it doesn't do on its own: landing
// on a versioned-tools page whose OWN version doesn't match that stored
// preference (most commonly the site root, which always serves Stable,
// regardless of what a returning visitor picked last time) — this
// redirects to the equivalent page in the preferred version instead, so
// "stay on whichever version I last picked" holds across visits, not just
// within one.
//
// Swizzled into Layout (wrap), not Root: useDocsPreferredVersion needs
// <DocsPreferredVersionContextProvider>, which @theme/Layout/Provider only
// mounts INSIDE Layout's own children tree — Root wraps the whole app
// from further out, before that provider exists yet. Confirmed the hard
// way: mounting this in Root crashed every page in dev with "Hook
// useDocsPreferredVersionContext is called outside the
// <DocsPreferredVersionContextProvider>."
function StickyVersionRedirect() {
  const history = useHistory();
  const {activeVersion, alternateDocVersions} = useActiveDocContext(PLUGIN_ID);
  const {preferredVersion} = useDocsPreferredVersion(PLUGIN_ID);

  useEffect(() => {
    if (!activeVersion || !preferredVersion || preferredVersion.name === activeVersion.name) return;
    const target = alternateDocVersions[preferredVersion.name]?.path;
    if (target && target !== window.location.pathname) {
      history.replace(target + window.location.search + window.location.hash);
    }
  }, [activeVersion, preferredVersion, alternateDocVersions, history]);

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
