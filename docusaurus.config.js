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
                to: '/docs/drivers',
              },
              {
                label: 'Contribute',
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
