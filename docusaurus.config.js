// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';
import remarkRobotiqWordmark from './src/remark/robotiqWordmark.mjs';
import remarkYoutubeEmbed from './src/remark/youtubeEmbed.mjs';
import rehypeExternalLinksNewTab from './src/remark/externalLinksNewTab.mjs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

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

  // Per-tool documentation versioning (Latest / Stable / Previous versions)
  // — see draft/documentation-versioning.md. Only Robotiq-maintained,
  // submodule-synced tools get their own instance like this (one per
  // instance below); product/ROS/third-party pages stay on the single
  // instance above, which has nothing to version against (no submodule,
  // no tags). The C++ API reference (2f85_cpp) has its own separate,
  // larger instance further down — its absolute-slug generation needed
  // reworking first; see runDoxygen2Docusaurus's `apiBaseUrl`/`docsBaseUrl`
  // handling in sync-external-docs.js.
  //
  // `path` deliberately lives under versioned-tools/, not docs/ — nesting
  // this instance's files inside the default instance's own docs/ tree
  // (even with `exclude` covering them there) reproducibly broke MDX
  // compilation with a bogus "Unexpected FunctionDeclaration ... non-esm"
  // error; moving the exact same files outside docs/ fixed it. See the
  // matching comment on `destRoot` in sync-external-docs.js.
  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: 'tactile-python',
        path: 'versioned-tools/Tactile Sensor/Libraries/Python',
        routeBasePath: 'docs/drivers/Tactile Sensor/Libraries/Python',
        sidebarPath: './sidebars.tactile-python.js',
        remarkPlugins: [remarkRobotiqWordmark, remarkYoutubeEmbed],
        rehypePlugins: [rehypeExternalLinksNewTab],
        includeCurrentVersion: true,
        lastVersion: 'stable',
        versions: {
          current: { label: 'Latest', path: '' },
          // Labeled with its tag: without this, the tag Stable actually
          // tracks isn't visible anywhere on the site, which reads as
          // "only 1 of tactile_sensors' 2 releases is on this site" even
          // though Stable IS the newer one — see
          // versioned-tools' version-previous-versions/index.mdx for the
          // matching explanation. Update this by hand whenever Stable is
          // re-cut to a newer tag (see scripts/list-submodule-tags.js).
          stable: { label: 'Stable (v2.0.0)', path: 'stable' },
          'previous-versions': { label: 'Previous versions', path: 'previous-versions' },
        },
      }),
    ],
    [
      '@docusaurus/plugin-content-docs',
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: 'tactile-cpp',
        path: 'versioned-tools/Tactile Sensor/Libraries/C++',
        routeBasePath: 'docs/drivers/Tactile Sensor/Libraries/C++',
        sidebarPath: './sidebars.tactile-cpp.js',
        remarkPlugins: [remarkRobotiqWordmark, remarkYoutubeEmbed],
        rehypePlugins: [rehypeExternalLinksNewTab],
        includeCurrentVersion: true,
        lastVersion: 'stable',
        versions: {
          current: { label: 'Latest', path: '' },
          // See the matching comment on 'tactile-python' above.
          stable: { label: 'Stable (v2.0.0)', path: 'stable' },
          'previous-versions': { label: 'Previous versions', path: 'previous-versions' },
        },
      }),
    ],
    [
      '@docusaurus/plugin-content-docs',
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: 'isaac-sim',
        path: 'versioned-tools/Adaptive grippers/Simulation/Isaac Sim',
        routeBasePath: 'docs/drivers/Adaptive grippers/Simulation/Isaac Sim',
        sidebarPath: './sidebars.isaac-sim.js',
        remarkPlugins: [remarkRobotiqWordmark, remarkYoutubeEmbed],
        rehypePlugins: [rehypeExternalLinksNewTab],
        // No lastVersion/versions config yet — isaacsim_assets has no tags,
        // so there's nothing to cut a 'stable'/'previous-versions' version
        // from. Only 'Latest' exists for now. Deliberately no matching
        // navbar item below either: with only one version, Docusaurus
        // renders it as a plain "Current" button rather than hiding it —
        // clutter with no payoff until this submodule gets its first real
        // tag. Add a `custom-scopedVersionDropdown` item for 'isaac-sim'
        // (matching 'tactile-python'/'tactile-cpp' below) once it does.
        includeCurrentVersion: true,
      }),
    ],
    [
      '@docusaurus/plugin-content-docs',
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: 'adaptive-grippers-cpp',
        path: 'versioned-tools/Adaptive grippers/Libraries/C++',
        routeBasePath: 'docs/drivers/Adaptive grippers/Libraries/C++',
        sidebarPath: './sidebars.adaptive-grippers-cpp.js',
        remarkPlugins: [remarkRobotiqWordmark, remarkYoutubeEmbed],
        rehypePlugins: [rehypeExternalLinksNewTab],
        includeCurrentVersion: true,
        lastVersion: 'stable',
        versions: {
          current: { label: 'Latest', path: '' },
          // See the matching comment on 'tactile-python' above. 2f85_cpp
          // only has one tag so far (v1.0.0) — Previous versions has
          // nothing older to list yet, see that version's own index.mdx.
          stable: { label: 'Stable (v1.0.0)', path: 'stable' },
          'previous-versions': { label: 'Previous versions', path: 'previous-versions' },
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
          // The stock 'docsVersionDropdown' navbar item always renders,
          // site-wide — outside its own instance it just falls back to a
          // link instead of disappearing, which isn't the scoping this
          // needs (see "Scope" in draft/documentation-versioning.md: each
          // of these must only appear on its own instance's own pages).
          // src/theme/NavbarItem/ScopedDocsVersionDropdown.jsx wraps it
          // with that visibility check; ComponentTypes.js registers it
          // under this custom type. One item per versioned instance — each
          // hides itself unless active, so only ever one shows at a time.
          {
            type: 'custom-scopedVersionDropdown',
            docsPluginId: 'tactile-python',
            position: 'right',
          },
          {
            type: 'custom-scopedVersionDropdown',
            docsPluginId: 'tactile-cpp',
            position: 'right',
          },
          {
            type: 'custom-scopedVersionDropdown',
            docsPluginId: 'adaptive-grippers-cpp',
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
