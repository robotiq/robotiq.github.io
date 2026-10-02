// Unit tests for scripts/site-nav-tree.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSidebar} from '../scripts/site-nav-tree.mjs';

function activeItemsFixture() {
  return {
    'tactile-cpp': {type: 'doc', id: 'Tactile Sensor/Libraries/C++/index', label: 'C++'},
    'tactile-python': {type: 'doc', id: 'Tactile Sensor/Libraries/Python/index', label: 'Python'},
    'tactile-ros': {type: 'doc', id: 'Tactile Sensor/ROS/index', label: 'ROS'},
    'isaac-sim': {type: 'doc', id: 'Adaptive grippers/Simulation/Isaac Sim/index', label: 'Isaac Sim'},
    'adaptive-grippers-cpp': {type: 'doc', id: 'Adaptive grippers/Libraries/C++/index', label: 'C++'},
    'adaptive-grippers-ros': {type: 'doc', id: 'Adaptive grippers/ROS/index', label: 'ROS'},
  };
}

test('buildSidebar: every versioned tool node is exactly its own activeItems entry', () => {
  const activeItems = activeItemsFixture();
  const sidebar = buildSidebar(activeItems);

  const tactile = sidebar.find((n) => n.label === 'Tactile Sensor');
  const tactileLibraries = tactile.items.find((n) => n.label === 'Libraries');
  assert.deepEqual(tactileLibraries.items.find((n) => n.label === 'C++'), activeItems['tactile-cpp']);
  assert.deepEqual(tactileLibraries.items.find((n) => n.label === 'Python'), activeItems['tactile-python']);
  assert.deepEqual(tactile.items.find((n) => n.label === 'ROS'), activeItems['tactile-ros']);

  const adaptive = sidebar.find((n) => n.label === 'Adaptive grippers');
  const adaptiveLibraries = adaptive.items.find((n) => n.label === 'Libraries');
  assert.deepEqual(adaptiveLibraries.items.find((n) => n.label === 'C++'), activeItems['adaptive-grippers-cpp']);
  const simulation = adaptive.items.find((n) => n.label === 'Simulation');
  assert.deepEqual(simulation.items.find((n) => n.label === 'Isaac Sim'), activeItems['isaac-sim']);
  assert.deepEqual(adaptive.items.find((n) => n.label === 'ROS'), activeItems['adaptive-grippers-ros']);
});

test('buildSidebar: every non-versioned leaf is a plain doc id string', () => {
  const sidebar = buildSidebar(activeItemsFixture());
  const forceTorque = sidebar.find((n) => n.label === 'Force Torque Sensor');
  const libraries = forceTorque.items.find((n) => n.label === 'Libraries');
  assert.deepEqual(libraries.items, ['Force Torque Sensor/Libraries/C/index', 'Force Torque Sensor/Libraries/Python/index']);
});

test('buildSidebar: a category with a landing page carries a real doc link', () => {
  const sidebar = buildSidebar(activeItemsFixture());
  const epick = sidebar.find((n) => n.label === 'EPick');
  assert.deepEqual(epick.link, {type: 'doc', id: 'EPick/index'});
});
