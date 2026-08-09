// @ts-check

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.

 @type {import('@docusaurus/plugin-content-docs').SidebarsConfig}
 */
const sidebars = {
  driverSidebar: [
    'intro',
    {
      type: 'category',
      label: '2F / Hand-E',
      link: { type: 'doc', id: 'drivers/2F hande/index' },
      items: [
        {
          type: 'category',
          label: 'SDK',
          items: [
            'drivers/2F hande/SDK/C++/index',
            'drivers/2F hande/SDK/Python/index',
          ],
        },
        {
          type: 'category',
          label: 'ROS',
          items: [
            'drivers/2F hande/ROS/ROS2/index',
            'drivers/2F hande/ROS/ROS1/index',
          ],
        },
        {
          type: 'category',
          label: 'Physics Engine',
          items: [
            'drivers/2F hande/Physics Engine/Isaac Sim/index',
            'drivers/2F hande/Physics Engine/PyBullet/index',
          ],
        },
        {
          type: 'category',
          label: 'Other',
          items: [
            'drivers/2F hande/GraspGen/index',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'TSF-85',
      link: { type: 'doc', id: 'drivers/TSF-85/index' },
      items: [
        {
          type: 'category',
          label: 'SDK',
          items: [
            'drivers/TSF-85/SDK/C++/index',
            'drivers/TSF-85/SDK/Python/index',
          ],
        },
        {
          type: 'category',
          label: 'ROS',
          items: [
            'drivers/TSF-85/ROS/ROS2/index',
          ],
        },
        {
          type: 'category',
          label: 'Physics Engine',
          items: [
            'drivers/TSF-85/Physics Engine/Isaac Sim/index',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'FT300-S',
      link: { type: 'doc', id: 'drivers/FT300/index' },
      items: [
        {
          type: 'category',
          label: 'SDK',
          items: [
            'drivers/FT300/SDK/C/index',
            'drivers/FT300/SDK/Python/index',
          ],
        },
        {
          type: 'category',
          label: 'ROS',
          items: [
            'drivers/FT300/ROS/ROS2/index',
          ],
        },
      ],
    },
  ]
};

export default sidebars;
