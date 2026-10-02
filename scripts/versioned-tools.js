// Registry connecting a versioned tool's Docusaurus plugin `id` (in
// docusaurus.config.js) to the submodule/repo it's cut from. This is the
// one thing scripts/cut-version.js can't derive from existing config —
// docusaurus.config.js knows plugin id -> routeBasePath, but nothing
// connects "this plugin id" to "this submodule" directly.
//
// Derived from scripts/external-jobs.js's own JOBS, not hand-written —
// every versioned tool's job(s) there are tagged with `toolId`/`toolPath`
// (via the `versionedTool(...)` wrapper), which is the only place that
// information needs to be stated now. Grouping those by `toolId` here
// picks up `submodule`/`repoUrl` for free from the enclosing
// `submoduleJobs(...)` call those jobs already live in.
const JOBS = require('./external-jobs');

const VERSIONED_TOOLS = {};
for (const job of JOBS) {
  if (!job.toolId) continue; // a job with no toolId isn't part of a versioned tool
  if (!VERSIONED_TOOLS[job.toolId]) {
    VERSIONED_TOOLS[job.toolId] = {
      submodule: job.submodule,
      repoUrl: job.repoUrl,
      // This tool's own subfolder under `software-tools/` — matches the
      // plugin's own `path` in docusaurus.config.js with the
      // `software-tools/` prefix stripped, and every one of this tool's
      // own jobs' `to` in external-jobs.js starts with it. Needed because
      // one submodule can back more than one tool (tactile_sensors backs
      // both tactile-cpp and tactile-python) — this is what scopes an
      // operation to only this tool's own files, not the whole
      // submodule's output.
      toolPath: job.toolPath,
    };
  }
}

module.exports = { VERSIONED_TOOLS };
