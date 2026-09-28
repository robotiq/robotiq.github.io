// Registry connecting a versioned tool's Docusaurus plugin `id` (in
// docusaurus.config.js) to the submodule/repo it's cut from. This is the
// one thing scripts/cut-version.js can't derive from existing config —
// external-jobs.js knows submodule -> job, docusaurus.config.js knows
// plugin id -> routeBasePath, but nothing connects "this plugin id" to
// "this submodule" directly. Hand-maintained, same as every other
// per-tool registration step in docs/contribute/versioning.mdx's "Adding
// versioning to a new tool" checklist — add an entry here as its own
// step when a new tool is versioned.
// `toolPath` is this tool's own subfolder under `versioned-tools/` —
// matches the plugin's own `path` in docusaurus.config.js with the
// `versioned-tools/` prefix stripped, and every relevant job's own `to`
// in external-jobs.js starts with it. Needed because one submodule can
// back more than one tool (tactile_sensors backs both tactile-cpp and
// tactile-python) — this is what scopes an operation to only this tool's
// own files, not the whole submodule's output.
const VERSIONED_TOOLS = {
  'tactile-cpp': {
    submodule: 'tactile_sensors',
    repoUrl: 'https://github.com/robotiq/tactile_sensors',
    toolPath: 'Tactile Sensor/Libraries/C++',
  },
  'tactile-python': {
    submodule: 'tactile_sensors',
    repoUrl: 'https://github.com/robotiq/tactile_sensors',
    toolPath: 'Tactile Sensor/Libraries/Python',
  },
  'adaptive-grippers-cpp': {
    submodule: '2f85_cpp',
    repoUrl: 'https://github.com/robotiq/grippers',
    toolPath: 'Adaptive grippers/Libraries/C++',
  },
  'isaac-sim': {
    submodule: 'isaacsim_assets',
    repoUrl: 'https://github.com/robotiq/isaacsim_assets',
    toolPath: 'Adaptive grippers/Simulation/Isaac Sim',
  },
};

module.exports = { VERSIONED_TOOLS };
