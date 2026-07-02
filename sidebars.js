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
        'drivers/2F hande/C++/index',
        'drivers/2F hande/Python/index',
        'drivers/2F hande/ROS/index',
        'drivers/2F hande/Isaac Sim/index',
        'drivers/2F hande/PyBullet/index',
        'drivers/2F hande/GraspGen/index'
      ],
    },
    {
      type: 'category',
      label: 'TSF-85',
      link: { type: 'doc', id: 'drivers/TSF-85/index' },
      items: [
        'drivers/TSF-85/C++/index',
        'drivers/TSF-85/Python/index',
        'drivers/TSF-85/ROS/index',
        'drivers/TSF-85/Isaac Sim/index',        
      ],
    },
    {
      type: 'category',
      label: 'FT300-S',
      link: { type: 'doc', id: 'drivers/FT300/index' },
      items: [
        'drivers/FT300/C/index',
        'drivers/FT300/Python/index',
        'drivers/FT300/ROS/index',
      ],
    },
  ]
};

export default sidebars;
