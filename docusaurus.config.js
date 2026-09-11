// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';

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
  // 'warn' (not 'throw'): generated API reference content can still produce
  // an anchor mismatch this repo doesn't fully control (e.g. a heading ID
  // Docusaurus's own slugger derives differently than the generator
  // expected) — a problem in generated content, not a real authoring
  // mistake. Hand-authored anchors still get flagged, just not fatally.
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
        },
        blog: false,
theme: {
          customCss: './src/css/custom.css',
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
            label: 'Docs',
          },
          // Examples navbar item — uncomment when content is ready
          // {
          //   type: 'docSidebar',
          //   sidebarId: 'examplesSidebar',
          //   position: 'left',
          //   label: 'Examples',
          // },
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
