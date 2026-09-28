import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import {
  useActivePlugin,
  useDocVersionSuggestions,
  useDocsPreferredVersion,
  useDocsVersion,
} from '@docusaurus/plugin-content-docs/client';
import {ThemeClassNames} from '@docusaurus/theme-common';

// Swizzled from @docusaurus/theme-classic's own DocVersionBanner, which
// hardcodes two stacked paragraphs ("This is unreleased documentation for
// ... version." then, on its own line, "For up-to-date documentation, see
// the latest version (...).") — condensed to one line/one sentence here.
//
// The 'unreleased' text also states this site's actual API-stability
// policy, not just "unreleased" — Development (main) documents
// in-progress work, and a reader landing here (e.g. from a search result,
// before `noIndex` on that version took effect everywhere it's indexed)
// needs to know its APIs aren't a commitment, not just that it's "not the
// latest" — see docs/api-stability.mdx for the full policy this links to.
function BannerText({banner}) {
  if (banner === 'unreleased') {
    return (
      <>
        Experimental: documents unreleased <code>main</code>. APIs may
        change or be removed without notice and aren't covered by our{' '}
        <Link to="/docs/api-stability">compatibility commitment</Link>. Use
      </>
    );
  }
  return <>No longer maintained — for the latest release, see</>;
}

function DocVersionBannerEnabled({className, versionMetadata}) {
  const {pluginId} = useActivePlugin({failfast: true});
  const {savePreferredVersionName} = useDocsPreferredVersion(pluginId);
  const {latestDocSuggestion, latestVersionSuggestion} = useDocVersionSuggestions(pluginId);
  const getVersionMainDoc = (version) => version.docs.find((doc) => doc.id === version.mainDocId);
  const latestVersionSuggestedDoc = latestDocSuggestion ?? getVersionMainDoc(latestVersionSuggestion);

  return (
    <div
      className={clsx(className, ThemeClassNames.docs.docVersionBanner, 'alert alert--warning margin-bottom--md')}
      role="alert">
      <BannerText banner={versionMetadata.banner} />{' '}
      <b>
        <Link
          to={latestVersionSuggestedDoc.path}
          onClick={() => savePreferredVersionName(latestVersionSuggestion.name)}>
          {latestVersionSuggestion.label}
        </Link>
      </b>
      .
    </div>
  );
}

export default function DocVersionBanner({className}) {
  const versionMetadata = useDocsVersion();
  if (!versionMetadata.banner) return null;
  return <DocVersionBannerEnabled className={className} versionMetadata={versionMetadata} />;
}
