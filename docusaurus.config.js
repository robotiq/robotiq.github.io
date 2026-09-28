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
// exist in versioned-tools_versions.json RIGHT NOW — including
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
    return JSON.parse(fs.readFileSync(new URL('./versioned-tools_versions.json', import.meta.url), 'utf8')).includes('stable');
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
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
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
  // tool's Stable/Development (main) content — see
  // docs/contribute/versioning.mdx. Product/ROS/third-party pages with no
  // submodule to version against stay on the single default instance above.
  // A tool gets versioned content here by having an entry in
  // scripts/versioned-tools.js and a matching leaf in
  // scripts/site-nav-tree.mjs's SITE_TREE / sidebars.versioned-tools.js's
  // active-items map — nothing here in docusaurus.config.js itself changes
  // per tool.
  //
  // `path` deliberately lives under versioned-tools/, not docs/ — nesting
  // this instance's files inside the default instance's own docs/ tree
  // (even with `exclude` covering them there) reproducibly broke MDX
  // compilation with a bogus "Unexpected FunctionDeclaration ... non-esm"
  // error; moving the exact same files outside docs/ fixed it. See the
  // matching comment on `destRoot` in sync-external-docs.js.
  //
  // `routeBasePath: 'docs/drivers'` overlaps, textually, with the default
  // instance's own 'docs' routeBasePath and its own docs/drivers/ content
  // (Force Torque Sensor, EPick, every product's ROS pages, ...) — that's
  // fine: Docusaurus doesn't require exclusive prefix ownership, only that
  // two instances never generate the *same* literal route, and the
  // underlying file sets are disjoint (this instance's own
  // versioned-tools/ tree only ever contains the handful of
  // submodule-backed tool subfolders; the default instance's docs/drivers/
  // never contains those same subpaths — confirmed empty there today).
  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: 'versioned-tools',
        path: 'versioned-tools',
        routeBasePath: 'docs/drivers',
        sidebarPath: './sidebars.versioned-tools.js',
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
        // URL serves" in docs/contribute/versioning.mdx. No per-tool tag in
        // either label — every submodule can be at a different tag, so
        // there's no single sitewide version number to print here; each
        // page's own banner (src/theme/DocVersionBanner) names its own
        // submodule's actual tag instead.
        // Docusaurus validates every key here against the versions that
        // already exist in versioned-tools_versions.json too, not just
        // `lastVersion` above (confirmed by hitting "Invalid docs option
        // versions: unknown versions (stable) found" while bootstrapping
        // the very first cut ever) — `stable`'s whole entry has to stay
        // out until it's a real version, same bootstrapping reason as
        // `lastVersion` above.
        versions: {
          current: { label: 'Development (main)', path: 'next', banner: 'unreleased', noIndex: true },
          ...(stableVersionExists ? {stable: { label: 'Stable', path: '' }} : {}),
        },
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
            sidebarId: 'driverSidebar',
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
          // Renders site-wide (every page, not just versioned-tools' own
          // pages) — the stock behavior for this navbar item type: outside
          // its own instance it falls back to a plain link to that
          // instance's lastVersion instead of disappearing, which is
          // exactly "always on top of the site" (explicit requirement —
          // previously this used a custom-scoped wrapper to HIDE it
          // outside its own instance, back when there were 4 separate
          // per-tool instances and showing all 4 dropdowns at once would
          // have been wrong; with exactly one shared instance now, that
          // scoping is no longer needed).
          {
            type: 'docsVersionDropdown',
            docsPluginId: 'versioned-tools',
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
            title: 'Docs',
            items: [
              {
                label: 'Drivers',
                to: '/docs/intro',
              },
              {
                label: 'Contribute (Robotiq internal)',
                to: '/docs/contribute',
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
