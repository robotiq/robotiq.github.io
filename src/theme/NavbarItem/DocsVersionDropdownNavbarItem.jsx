import React from 'react';
import {useHistory} from '@docusaurus/router';
import {useActiveDocContext, useDocsPreferredVersion, useVersions} from '@docusaurus/plugin-content-docs/client';
import DropdownNavbarItem from '@theme/NavbarItem/DropdownNavbarItem';
import DefaultNavbarItem from '@theme/NavbarItem/DefaultNavbarItem';
import findNearestDocInVersion from '../findNearestDocInVersion';

// The stock component always navigates on click — to the equivalent doc in
// the target version, or that version's own main doc when there isn't one.
// Outside the software-tools instance there's no "same page" to map, so
// that would jump to the instance's own main doc (confirmed by testing:
// picking a version from `/` used to land on gripper docs, when the
// visitor just wants to stay on `/`) — this only navigates when
// useActiveDocContext finds an active version for the CURRENT page, i.e.
// the visitor is already inside the instance; outside it, this only saves
// the preference, same as the stock component effectively does there too
// (nothing to navigate to).
//
// This used to never navigate itself anywhere, leaving
// src/theme/Layout/index.jsx's own StickyVersionRedirect effect as the
// sole mover, specifically to avoid racing it — but that effect re-running
// on every render (not just once per click) turned out to cause its own
// "Maximum update depth exceeded" loop regardless (see its own comment for
// the full breakdown and the ref-based guard that now fixes it). With that
// guard in place, a click-driven navigation here and StickyVersionRedirect
// no longer race: by the time that effect runs after this onClick's
// `history.push`, the URL already matches, so it's a no-op — it's now only
// the backstop for landing on a mismatched version some OTHER way (e.g.
// the docs/intro.mdx case its own comment describes).
export default function DocsVersionDropdownNavbarItem({
  mobile,
  docsPluginId,
  dropdownActiveClassDisabled,
  dropdownItemsBefore = [],
  dropdownItemsAfter = [],
  versions: _configs,
  ...props
}) {
  const history = useHistory();
  const versions = useVersions(docsPluginId);
  const {activeVersion, activeDoc} = useActiveDocContext(docsPluginId);
  const {preferredVersion, savePreferredVersionName} = useDocsPreferredVersion(docsPluginId);
  // With no stored preference yet (first visit, or localStorage cleared),
  // prefer whichever version the CURRENT page actually belongs to over the
  // sitewide isLast/versions[0] guess — without this, a deep link straight
  // into a `/next/` (Latest) page showed "Stable" in the navbar (and the
  // mobile menu) until the visitor picked something themselves.
  // activeVersion is undefined outside the instance (e.g. `/`,
  // `/docs/intro`), where there's no "current page's version" to prefer.
  const displayed = preferredVersion ?? activeVersion ?? versions.find((v) => v.isLast) ?? versions[0];

  const items = [
    ...dropdownItemsBefore,
    ...versions.map((version) => ({
      label: version.label,
      href: '#',
      isActive: () => version === displayed,
      onClick: (e) => {
        e.preventDefault();
        savePreferredVersionName(version.name);
        if (!activeVersion || !activeDoc || version.name === activeVersion.name) return;
        const target = findNearestDocInVersion(activeDoc.id, version)?.path;
        if (target) history.push(target);
      },
    })),
    ...dropdownItemsAfter,
  ];

  // Mirrors the stock component's own "don't render a 1-item dropdown"
  // guard — dead code today (this site always has 2 versions) but keeps
  // this safe if that ever changes.
  if (items.length <= 1) {
    return (
      <DefaultNavbarItem
        {...props}
        mobile={mobile}
        label={displayed.label}
        href="#"
        onClick={(e) => e.preventDefault()}
        isActive={dropdownActiveClassDisabled ? () => false : undefined}
      />
    );
  }

  return (
    <DropdownNavbarItem
      {...props}
      mobile={mobile}
      label={displayed.label}
      items={items}
      isActive={dropdownActiveClassDisabled ? () => false : undefined}
    />
  );
}
