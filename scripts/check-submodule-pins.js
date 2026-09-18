// A submodule pin is just a commit SHA — nothing about it records which
// branch that commit came from. "Previewing local edits to a submodule"
// (docs/contribute/index.mdx) deliberately points external/<submodule> at
// a WIP branch/fork while prototyping; the risk that workflow accepts is
// forgetting to point it back at a real, reviewed branch before
// committing — the pin then merges into main referencing a commit that
// only exists on someone's feature branch, which can vanish later (a
// rebase, a deleted branch) and isn't the upstream repo's own
// reviewed/released state either way.
//
// Deliberately checks against the submodule repo's OWN actual default
// branch (via `git ls-remote --symref ... HEAD`, no GitHub API needed) —
// not external-jobs.js's `branch` field. That field is exactly the kind of
// thing this bug is about: it's itself sometimes pointed at a WIP branch
// while prototyping (caught once this way, while building this script:
// 2f85_cpp's entry briefly pointed at `documentation-update` instead of
// `main`) and could be forgotten the same way the pin could. Trusting it as
// ground truth would make this check blind to that exact case — asking the
// remote directly means neither the pin nor the declared branch can quietly
// drift without this catching it. This means every submodule here is
// expected to track its repo's actual default branch, full stop — not a
// "warn unless deliberate" heuristic, since there's no way to automate
// telling a deliberately-tracked stable branch apart from a forgotten WIP
// one; add a per-submodule opt-out here explicitly if that's ever needed.
//
// This is a CI-only safety net, not a local restriction: it only ever
// reads the *committed* pin (whatever ends up in a PR) and never touches
// external/<submodule>'s local checkout, so local prototyping is
// completely unaffected — see .github/workflows/ci.yml.
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const JOBS = require('./external-jobs');

const submodules = new Map();
for (const job of JOBS) {
  if (!submodules.has(job.submodule)) {
    submodules.set(job.submodule, { repoUrl: job.repoUrl, declaredBranch: job.branch });
  }
}

function fetchDefaultBranch(repoUrl) {
  const output = execFileSync('git', ['ls-remote', '--symref', repoUrl, 'HEAD'], { encoding: 'utf8' });
  const match = output.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD/m);
  if (!match) throw new Error(`could not determine ${repoUrl}'s default branch from 'git ls-remote --symref'`);
  return match[1];
}

let failures = 0;
for (const [submodule, { repoUrl, declaredBranch }] of submodules) {
  const cwd = path.join(ROOT, 'external', submodule);
  // `HEAD:external/<submodule>` reads the gitlink SHA recorded in the
  // *superproject's* committed tree — the actual pin. `git rev-parse HEAD`
  // with cwd inside the submodule instead reads whatever's checked out
  // there right now, which `sync-external-docs.js`'s own
  // `git submodule update --force` (run earlier in the same build) may have
  // silently left on a stale commit if that update failed (it swallows the
  // error) — this would then validate the wrong commit instead of the one
  // that's actually committed and about to merge.
  const pinned = execFileSync('git', ['rev-parse', `HEAD:external/${submodule}`], { cwd: ROOT, encoding: 'utf8' }).trim();
  const defaultBranch = fetchDefaultBranch(repoUrl);

  if (declaredBranch !== defaultBranch) {
    console.error(
      `[check-submodule-pins] ${submodule}: external-jobs.js declares branch '${declaredBranch}', but ` +
      `${repoUrl}'s actual default branch is '${defaultBranch}'. Every submodule here is expected to track ` +
      `its repo's default branch — external-jobs.js is still pointed at a WIP branch; change it back ` +
      `to '${defaultBranch}'.`
    );
    failures += 1;
  }

  // Fetches just the tip of the default branch — no need for the rest of
  // its history, `--is-ancestor` below only needs pinned and FETCH_HEAD to
  // share a reachable path, and the local clone already has everything
  // reachable from the pinned commit itself.
  execFileSync('git', ['fetch', '--quiet', repoUrl, defaultBranch], { cwd, stdio: 'inherit' });

  try {
    execFileSync('git', ['merge-base', '--is-ancestor', pinned, 'FETCH_HEAD'], { cwd });
    console.log(`[check-submodule-pins] ${submodule}: ${pinned.slice(0, 7)} is on ${defaultBranch} — OK`);
  } catch {
    console.error(
      `[check-submodule-pins] ${submodule} is pinned to ${pinned.slice(0, 7)}, which is not reachable from ` +
      `${repoUrl}#${defaultBranch}.\n` +
      `This usually means external/${submodule} is still pointed at a WIP/preview branch (see "Previewing ` +
      `local edits to a submodule" in docs/contribute/index.mdx) — point it back at ${defaultBranch} and ` +
      `commit the updated pin:\n` +
      `  cd external/${submodule} && git fetch origin ${defaultBranch} && git checkout origin/${defaultBranch} && cd ../..`
    );
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`[check-submodule-pins] ${failures} problem(s) found`);
  process.exit(1);
}

console.log('[check-submodule-pins] every submodule pin is reachable from its repo\'s actual default branch');
