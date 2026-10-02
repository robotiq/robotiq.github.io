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
import findToolId from '../findToolId';
import stableTags from '../../../software-tools-stable.json';

// Swizzled from @docusaurus/theme-classic's own DocVersionBanner, which
// hardcodes two stacked paragraphs ("This is unreleased documentation for
// ... version." then, on its own line, "For up-to-date documentation, see
// the latest version (...).") — condensed to one line/one sentence here.
// Extended to also render an info banner on Stable pages (stock Docusaurus
// only ever sets `banner` for a non-`current` version, never for the one
// that's neither current nor deprecated) naming that page's own tag.
//
// Every submodule-backed tool can be at a different tag even though
// Development (main)/Stable is a single sitewide choice (see
// docs/contribute/versioning.mdx) — the shared 'software-tools' instance
// has no one overall version number to print, so each page names its own
// tool's own tag instead, read off `software-tools-stable.json`. Neither
// banner renders at all on a page with no registered submodule behind it
// (findToolId returns undefined), nor on one that's registered but has no
// tag recorded yet (software-tools-stable.json has no entry for it, so
// Stable is just a mirror of its live `main` — nothing to call either
// page out as different from the other) — see the comment on the first
// check below.

// Reads the current version's own label (`versionMetadata.label` in
// docusaurus.config.js — currently "Development (main)") rather than
// hardcoding it here, so the two can never drift out of sync the way a
// hardcoded "Latest" once did after that label changed to something that
// no longer reads as a release name. The text states plainly that this
// content can change, and mentions Stable as an option for a reader who
// wants a stable, supported reference instead — not an instruction to go
// use it; this version itself is a perfectly fine place to be.
// Deliberately says nothing about "APIs" or any specific kind of content —
// this banner is sitewide, covering any submodule-backed tool's page, not
// just ones with a generated reference.
function BannerText({banner, currentVersionLabel}) {
  if (banner === 'unreleased') {
    return (
      <>
        <code>{currentVersionLabel}</code> can change or be removed without
        notice. For a stable, supported reference, see
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
      <BannerText banner={versionMetadata.banner} currentVersionLabel={versionMetadata.label} />{' '}
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

  // Gated on toolId AND stableTag, not just versionMetadata.banner — the
  // banner config applies to the whole 'current' version uniformly, but
  // "documents the unreleased development version, see Stable" is simply
  // false for a page that never actually differs between Latest and
  // Stable: a third-party tool with no registered submodule at all (no
  // `toolId` — Force Torque Sensor, EPick, ROS pages, ...), confirmed by
  // hitting it directly (the third-party Python gripper driver page
  // showed the banner anyway before the toolId guard); or a registered,
  // submodule-backed tool with no tags yet (e.g. Isaac Sim — see
  // scripts/versioned-tools.js), whose Stable is just a mirror of
  // whatever's currently on `main` (no entry in software-tools-stable.json
  // for materializeStable to check out a pin from), so `stableTag` is
  // undefined too even though `toolId` is found.
  if (versionMetadata.banner && toolId && stableTag) {
    return <DocVersionBannerEnabled className={className} versionMetadata={versionMetadata} />;
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
