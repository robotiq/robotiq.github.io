// One-command version of "Previewing local edits to a submodule" in
// contribute.mdx: fetches each submodule's declared repoUrl/branch from
// external-jobs.js, checks it out, then runs the sync with the reset
// disabled — so `npm run preview` picks up commits just pushed to a WIP
// fork/branch without the manual fetch+checkout dance.
//
// This only helps once those commits are pushed somewhere. For edits still
// sitting uncommitted in your own local clone of the tool repo, point
// external/<submodule> at that clone by hand instead — see
// "Previewing local edits to a submodule" in docs/contribute.mdx.
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const JOBS = require('./external-jobs');

const submodules = new Map();
for (const job of JOBS) {
  if (!submodules.has(job.submodule)) {
    submodules.set(job.submodule, { repoUrl: job.repoUrl, branch: job.branch });
  }
}

for (const [submodule, { repoUrl, branch }] of submodules) {
  const cwd = path.join(ROOT, 'external', submodule);
  console.log(`[preview-external-docs] ${submodule}: fetching ${repoUrl}#${branch}`);
  execSync(`git fetch "${repoUrl}" "${branch}"`, { cwd, stdio: 'inherit' });
  execSync('git checkout FETCH_HEAD', { cwd, stdio: 'inherit' });
}

execSync('node scripts/sync-external-docs.js', {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, SKIP_SUBMODULE_RESET: '1' },
});
