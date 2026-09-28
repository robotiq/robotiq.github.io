import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import {
  useActivePlugin,
  useDoc,
  useDocVersionSuggestions,
  useDocsPreferredVersion,
  useDocsVersion,
} from '@docusaurus/plugin-content-docs/client';
import {ThemeClassNames} from '@docusaurus/theme-common';
import {VERSIONED_TOOLS} from '../../../scripts/versioned-tools';
import stableTags from '../../../versioned-tools-stable.json';

// Swizzled from @docusaurus/theme-classic's own DocVersionBanner, which
// hardcodes two stacked paragraphs ("This is unreleased documentation for
// ... version." then, on its own line, "For up-to-date documentation, see
// the latest version (...).") — condensed to one line/one sentence here.
// Extended to also render an info banner on Stable pages (stock Docusaurus
// only ever sets `banner` for a non-`current` version, never for the one
// that's neither current nor deprecated) naming that page's own tag — see
// findToolId below for why "that page's own tag" isn't just one sitewide
// number.

// Every submodule-backed tool can be at a different tag even though
// Development (main)/Stable is a single sitewide choice (see
// docs/contribute/versioning.mdx) — the shared 'versioned-tools' instance
// has no one overall version number to print, so each page names its own
// tool's own tag instead, read off VERSIONED_TOOLS'/`versioned-tools-stable.json`.
// `docId` is relative to the 'versioned-tools' instance's own root, e.g.
// 'Adaptive grippers/Libraries/C++/index' or
// '.../Libraries/C++/docs/environment-setup'.
function findToolId(docId) {
  return Object.keys(VERSIONED_TOOLS).find(
    (toolId) => docId === VERSIONED_TOOLS[toolId].toolPath || docId.startsWith(`${VERSIONED_TOOLS[toolId].toolPath}/`)
  );
}

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

function DocVersionBannerEnabled({className, versionMetadata, stableTag}) {
  const {pluginId} = useActivePlugin({failfast: true});
  const {savePreferredVersionName} = useDocsPreferredVersion(pluginId);
  const {latestDocSuggestion, latestVersionSuggestion} = useDocVersionSuggestions(pluginId);
  const getVersionMainDoc = (version) => version.docs.find((doc) => doc.id === version.mainDocId);
  const latestVersionSuggestedDoc = latestDocSuggestion ?? getVersionMainDoc(latestVersionSuggestion);
  // latestVersionSuggestion.label is just "Stable" (no tag — see
  // docusaurus.config.js) since one sitewide label can't carry every
  // tool's own separate tag; this page's own tag (if known) is appended
  // here instead.
  const linkLabel = stableTag ? `${latestVersionSuggestion.label} (${stableTag})` : latestVersionSuggestion.label;

  return (
    <div
      className={clsx(className, ThemeClassNames.docs.docVersionBanner, 'alert alert--warning margin-bottom--md')}
      role="alert">
      <BannerText banner={versionMetadata.banner} />{' '}
      <b>
        <Link
          to={latestVersionSuggestedDoc.path}
          onClick={() => savePreferredVersionName(latestVersionSuggestion.name)}>
          {linkLabel}
        </Link>
      </b>
      .
    </div>
  );
}

function StableInfoBanner({className, stableTag}) {
  return (
    <div
      className={clsx(className, ThemeClassNames.docs.docVersionBanner, 'alert alert--info margin-bottom--md')}
      role="alert">
      This page reflects <b>Stable {stableTag}</b>.
    </div>
  );
}

export default function DocVersionBanner({className}) {
  const versionMetadata = useDocsVersion();
  const {metadata} = useDoc();
  const toolId = findToolId(metadata.id);
  const stableTag = toolId ? stableTags[toolId] : undefined;

  if (versionMetadata.banner) {
    return <DocVersionBannerEnabled className={className} versionMetadata={versionMetadata} stableTag={stableTag} />;
  }
  // PropVersionMetadata's own version-name field is `version`, not `name`
  // (that's GlobalVersion, the shape useDocVersionSuggestions returns
  // above, in DocVersionBannerEnabled) — confirmed the hard way: this
  // returned `undefined` for every page until fixed, silently rendering
  // no Stable info banner anywhere.
  if (versionMetadata.version === 'stable' && stableTag) {
    return <StableInfoBanner className={className} stableTag={stableTag} />;
  }
  return null;
}
