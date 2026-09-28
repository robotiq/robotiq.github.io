import React, {useEffect} from 'react';
import {useHistory} from '@docusaurus/router';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';
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
// useActiveDocContext/useDocsPreferredVersion are both purely
// pathname/global-data driven (no DocProvider/DocsVersionProvider needed),
// so this is safe to mount unconditionally from Root, on every page —
// both return an empty/undefined result on a page that doesn't belong to
// this instance, rather than throwing.
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

export default function Root({children}) {
  return (
    <>
      {ExecutionEnvironment.canUseDOM && <StickyVersionRedirect />}
      {children}
    </>
  );
}
