// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import fs from 'node:fs';
import {themes as prismThemes} from 'prism-react-renderer';
import remarkRobotiqWordmark from './src/remark/robotiqWordmark.mjs';
import remarkYoutubeEmbed from './src/remark/youtubeEmbed.mjs';
import rehypeExternalLinksNewTab from './src/remark/externalLinksNewTab.mjs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// Bootstrapping-only self-check: every `docusaurus`/`docs:version:` CLI
// invocation validates `lastVersion` against whatever versions actually
// exist in software-tools_versions.json RIGHT NOW — including
// scripts/cut-version.js's own `docs:version:` call that's about to CREATE
// 'stable' for the very first time, when it doesn't exist yet anywhere.
// Hardcoding `lastVersion: 'stable'` unconditionally would make that very
// first cut impossible (a chicken-and-egg: cutting 'stable' requires
// 'stable' to already be a valid lastVersion) — confirmed by hitting
// exactly that: "Docs option lastVersion: stable is invalid. Available
// version names are: current". Falling back to `undefined` (Docusaurus's
// own default — resolves to `current`) until 'stable' genuinely exists
// makes that first cut self-bootstrapping, no one-time manual config edit
// needed; every invocation after that first successful cut sees 'stable'
// in the file and behaves exactly as before.
const stableVersionExists = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL('./software-tools_versions.json', import.meta.url), 'utf8')).includes('stable');
  } catch {
    return false;
  }
})();

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Build with Robotiq',
  tagline: 'Software & Documentation for developpers',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    // Improve compatibility with the upcoming Docusaurus v4. One gotcha
    // this turns off: MDX v1 compat's legacy admonition-title syntax
    // (`:::tip Some Title`). With v4 on, that's silently accepted by the
    // MDX parser but renders as a literal `:::tip Some Title ... :::`
    // paragraph, with no build error — confirmed the hard way, twice
    // (a generated notice in sync-external-docs.js, and every versioned
    // tool wrapper page's own admonition, both went unnoticed for a while
    // rendering as raw text). A custom admonition title needs the
    // bracketed directive-label syntax instead: `:::tip[Some Title]`.
    // Plain `:::tip`/`:::note`/... with no custom title is unaffected.
    v4: true,
    faster: {
      // v4's fasterByDefault turns this on along with the rest of the
      // rspack/SWC "Faster" toolchain. On this machine it panics on nearly
      // every `npm start` — "ModuleGraphModule with identifier ... not
      // found" inside rspack's persistent module-graph cache
      // (crates\rspack_core\src\module_graph\mod.rs), on a different module
      // each time (cssExtractHmr.js, react/jsx-runtime.js, ...) — a
      // rspack persistent-cache bug, not a project misconfiguration:
      // https://github.com/web-infra-dev/rspack/issues. Clearing
      // node_modules/.cache/rspack and .docusaurus only delays the next
      // occurrence. Disabling just this one flag keeps every other v4/
      // Faster benefit (SWC, rspack bundling itself, lightningcss, ...)
      // and only drops the on-disk cache between runs.
      rspackPersistentCache: false,
    },
  },

  // Set the production url of your site here
  url: 'https://robotiq.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'robotiq', // Usually your GitHub org/user name.
  projectName: 'robotiq.github.io', // Usually your repo name.

  onBrokenLinks: 'throw',
  // 'warn' (not 'throw') — currently masking one real anchor mismatch, not
  // a generated-content quirk: a submodule's own synced guide
  // (docs/drivers/Adaptive grippers/Libraries/C++/docs/03-how-it-works.md) links to a
  // heading in a sibling guide that was since renamed
  // (04-robust-example-walkthrough.md#sharing-one-logger no longer exists;
  // the heading is now "Naming the loggers"). Fixed upstream in the library
  // repo (grippers), pending push + re-sync — restore this to 'throw' once
  // that lands and the build is clean again, rather than leaving broken
  // hand-authored cross-references silently tolerated site-wide.
  onBrokenAnchors: 'warn',

  // Generated content (the doxygen2docusaurus API reference, synced
  // READMEs) is plain CommonMark, not MDX — it uses raw HTML like bare
  // `<br>`/`<table>` that MDX's JSX parser rejects. 'detect' compiles `.md`
  // files as plain Markdown and `.mdx` files (all hand-authored wrapper
  // pages) as MDX, by extension.
  markdown: {
    format: 'detect',
    mermaid: true,
  },

  themes: ['@docusaurus/theme-mermaid'],

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          // editUrl: 'https://github.com/robotiq/robotiq.github.io/tree/main/',
          remarkPlugins: [remarkRobotiqWordmark, remarkYoutubeEmbed],
          rehypePlugins: [rehypeExternalLinksNewTab],
        },
        blog: false,
theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  // One shared instance for every Robotiq-maintained, submodule-synced
  // tool's Stable/Latest content — see
  // docs/website/versioning.mdx. EVERY product/tool page lives here,
  // versioned or not (Force Torque Sensor, EPick, every product's own ROS
  // pages, ...), not just the submodule-backed ones — see the
  // `routeBasePath` comment below for why that's required, not just
  // convenient. A tool gets *versioned* content specifically by having an
  // entry in scripts/versioned-tools.js and a matching leaf in
  // scripts/site-nav-tree.mjs's SITE_TREE / sidebars.software-tools.js's
  // active-items map — nothing here in docusaurus.config.js itself changes
  // per tool.
  //
  // `path` deliberately lives under software-tools/, not docs/ — nesting
  // this instance's files inside the default instance's own docs/ tree
  // (even with `exclude` covering them there) reproducibly broke MDX
  // compilation with a bogus "Unexpected FunctionDeclaration ... non-esm"
  // error; moving the exact same files outside docs/ fixed it. See the
  // matching comment on `destRoot` in sync-external-docs.js.
  //
  // `routeBasePath: 'docs/drivers'` has to be this instance's ONLY, and
  // this instance's own content root has to be the ONLY thing under it —
  // two plugin instances can NOT split ownership of one URL prefix,
  // even for genuinely disjoint underlying content. Docusaurus generates
  // one non-exact, prefix-matching top-level React Router route per
  // instance's own routeBasePath; React Router's `<Switch>` commits to
  // whichever one matches FIRST (registration order) for the ENTIRE
  // prefix and never falls through to try another route if nothing
  // matches deeper — confirmed by hitting exactly that: with product
  // pages (Force Torque Sensor, EPick, every product's own ROS pages)
  // left on the default instance's own docs/drivers/ and only the
  // submodule-backed tool pages moved here, this instance's own
  // `/docs/drivers` wrapper route intercepted EVERY path under that
  // prefix client-side — including ones that were still real pages on
  // the default instance — and 404'd them, even though the initial
  // server-rendered HTML for that exact URL was completely fine (a hard
  // load never goes through React Router's own matching at all, so the
  // break only showed up navigating there via a client-side link click).
  // Moving every product/tool page here, so nothing else claims any part
  // of `/docs/drivers/*`, is what actually fixes that, not a
  // workaround.
  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: 'software-tools',
        path: 'software-tools',
        routeBasePath: 'docs/drivers',
        sidebarPath: './sidebars.software-tools.js',
        remarkPlugins: [remarkRobotiqWordmark, remarkYoutubeEmbed],
        rehypePlugins: [rehypeExternalLinksNewTab],
        includeCurrentVersion: true,
        lastVersion: stableVersionExists ? 'stable' : undefined,
        // Stable owns the root path (''), not `current` — a first-time
        // visitor (or an external link, or a search result) should land on
        // released content, not on whatever `main` happens to be at that
        // moment. `current` moves to `next` instead, banner-tagged
        // 'unreleased' and excluded from search/sitemap (`noIndex`) so it's
        // never what search sends someone to. See "Which version the root
        // URL serves" in docs/website/versioning.mdx. No per-tool tag in
        // either label — every submodule can be at a different tag, so
        // there's no single sitewide version number to print here; each
        // page's own banner (src/theme/DocVersionBanner) names its own
        // submodule's actual tag instead.
        // Docusaurus validates every key here against the versions that
        // already exist in software-tools_versions.json too, not just
        // `lastVersion` above (confirmed by hitting "Invalid docs option
        // versions: unknown versions (stable) found" while bootstrapping
        // the very first cut ever) — `stable`'s whole entry has to stay
        // out until it's a real version, same bootstrapping reason as
        // `lastVersion` above.
        versions: {
          // `badge: false` on both — Docusaurus's own default "Version: X"
          // pill duplicated src/theme/DocVersionBanner's own top-of-page
          // banner, which already says the same thing with more context
          // (why it's Latest/Stable, and what to do about it) — confirmed
          // by hitting it directly, both stacked on the same page. There
          // used to be a swizzled src/theme/DocVersionBadge just to
          // suppress the pill on pages with no registered tool behind
          // them; disabling it sitewide here instead makes that swizzle
          // unnecessary — deleted.
          current: { label: 'Development (main)', path: 'next', banner: 'unreleased', noIndex: true, badge: false },
          ...(stableVersionExists ? {stable: { label: 'Stable', path: '', badge: false }} : {}),
        },
      }),
    ],

    // Redirects every page this rework removed outright (not moved, not
    // renamed — gone) to the nearest page that still covers the same
    // ground, so an external link, bookmark, or search result pointing at
    // the live site's current URLs doesn't just 404 once this ships.
    [
      '@docusaurus/plugin-client-redirects',
      /** @type {import('@docusaurus/plugin-client-redirects').Options} */
      ({
        redirects: [
          // Collapsed from one page per ROS distro/generation into a
          // single ROS page per product (see "ROS" in
          // docs/website/how-it-works.mdx) — every removed distro page
          // redirects to it.
          {
            to: '/docs/drivers/Adaptive grippers/ROS/',
            from: [
              '/docs/drivers/Adaptive grippers/ROS/ROS1-Indigo/',
              '/docs/drivers/Adaptive grippers/ROS/ROS1-Kinetic/',
              '/docs/drivers/Adaptive grippers/ROS/ROS1-Melodic/',
              '/docs/drivers/Adaptive grippers/ROS/ROS2-Humble/',
              '/docs/drivers/Adaptive grippers/ROS/ROS2-Jazzy/',
              '/docs/drivers/Adaptive grippers/ROS/ROS2-Lyrical/',
            ],
          },
          {
            to: '/docs/drivers/Tactile Sensor/ROS/',
            from: [
              '/docs/drivers/Tactile Sensor/ROS/ROS1-Noetic/',
              '/docs/drivers/Tactile Sensor/ROS/ROS2-Humble/',
              '/docs/drivers/Tactile Sensor/ROS/ROS2-Jazzy/',
              '/docs/drivers/Tactile Sensor/ROS/ROS2-Lyrical/',
            ],
          },
          // Collapsing every versioned tool into one shared Stable/Latest
          // switcher (see docs/website/versioning.mdx) replaced each
          // tool's own multi-version history with just these two — there's
          // no equivalent "previous versions" page any more, so this sends
          // a visitor to the tool's own root instead.
          {
            to: '/docs/drivers/Tactile Sensor/Libraries/C++/',
            from: '/docs/drivers/Tactile Sensor/Libraries/C++/previous-versions/',
          },
          {
            to: '/docs/drivers/Tactile Sensor/Libraries/Python/',
            from: '/docs/drivers/Tactile Sensor/Libraries/Python/previous-versions/',
          },
          {
            to: '/docs/drivers/Adaptive grippers/Libraries/C++/',
            from: '/docs/drivers/Adaptive grippers/Libraries/C++/previous-versions/',
          },
        ],
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: 'img/robotiq-social-card.jpg',
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        // 'dark' keeps the navbar black regardless of the user's light/dark mode preference.
        // This matches the Robotiq brand which always uses a black navbar with blue accent.
        style: 'dark',
        // title is empty because the logo SVG already includes the full "ROBOTIQ" wordmark.
        title: '',
        logo: {
          alt: 'Robotiq',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'softwareToolsSidebar',
            docsPluginId: 'software-tools',
            position: 'left',
            label: 'Software Tools',
          },
          // Examples navbar item — uncomment when content is ready
          // {
          //   type: 'docSidebar',
          //   sidebarId: 'examplesSidebar',
          //   position: 'left',
          //   label: 'Examples',
          // },
          // Renders site-wide (every page, not just software-tools' own
          // pages) — the stock behavior for this navbar item type. Type
          // 'docsVersionDropdown' resolves to
          // src/theme/NavbarItem/DocsVersionDropdownNavbarItem.jsx, a
          // swizzled wrapper: inside the instance it's the stock component
          // unchanged (switching versions keeps you on the equivalent
          // page); outside it (the home page, docs/intro.mdx,
          // docs/website/*, ...) the stock component's own fallback was
          // to navigate to software-tools' own main doc, which is a real
          // navigation away from wherever the visitor actually was — the
          // wrapper instead just remembers the choice and stays put. See
          // that file's own comment for why.
          {
            type: 'docsVersionDropdown',
            docsPluginId: 'software-tools',
            position: 'right',
          },
{
            href: 'https://github.com/robotiq',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Website',
            items: [
              {
                label: 'Contribute (Robotiq internal)',
                to: '/docs/website',
              },
              {
                label: 'License',
                to: '/docs/license',
              },
            ],
          },
          {
            title: 'Products',
            items: [
              {
                label: 'Grippers',
                href: 'https://robotiq.com/products/grippers',
              },
              {
                label: 'Force sensor',
                href: 'https://robotiq.com/products/ft-300-force-torque-sensor',
              },
              {
                label: 'Tactile sensor',
                href: 'https://robotiq.com/tactile-sensor-fingertips',
              },
            ],
          },
          {
            title: 'Company',
            items: [
              {
                label: 'robotiq.com',
                href: 'https://robotiq.com',
              },
{
                label: 'GitHub',
                href: 'https://github.com/robotiq',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Robotiq, Inc. All rights reserved.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
