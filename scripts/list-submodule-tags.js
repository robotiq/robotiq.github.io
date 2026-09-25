#!/usr/bin/env node
// Lists a submodule repo's tags, newest first — the building block for two
// things described in draft/documentation-versioning.md:
//   - picking the *newest* tag to pin the "Stable" version to
//   - listing the *older* tags on a tool's "Previous versions" signpost
//     page, each linking straight to that tag's source
//
// Queries the remote directly (`git ls-remote --tags`), not a local
// checkout — see check-submodule-pins.js's own header comment for why a
// local checkout can't be trusted as ground truth here (it only has
// whatever was fetched, and won't notice a tag pushed since). Confirmed
// this matters in practice: this script found tactile_sensors' v2.0.0
// before a fresh `git fetch --tags` had ever been run locally.
//
// Usage: node scripts/list-submodule-tags.js <repoUrl> [repoUrl...]
// With no args, lists tags for every submodule declared in external-jobs.js.
const { execFileSync } = require('child_process');
const JOBS = require('./external-jobs');

// Only vN / vN.N / vN.N.N-style tags sort meaningfully against each other —
// anything else (a stray 'latest', a pre-release branch tag, ...) is left
// out rather than guessed at. Matches the semver-sort assumption already
// flagged as an open question in draft/documentation-versioning.md.
const SEMVER_TAG_RE = /^v(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;

function compareSemver(a, b) {
  const pa = a.match(SEMVER_TAG_RE);
  const pb = b.match(SEMVER_TAG_RE);
  for (let i = 1; i <= 3; i += 1) {
    const na = Number(pa[i] || 0);
    const nb = Number(pb[i] || 0);
    if (na !== nb) return nb - na; // descending, newest first
  }
  return 0;
}

// Returns [{ name, commit }], newest first. Skips non-semver tags and the
// '^{}' dereference lines `git ls-remote` emits for annotated tags (those
// point at the tag object itself, not the commit — 2f85_cpp's v1.0.0 is
// one, confirmed against its actual ls-remote output).
function listTags(repoUrl) {
  const output = execFileSync('git', ['ls-remote', '--tags', repoUrl], { encoding: 'utf8' });
  const tags = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^(\S+)\s+refs\/tags\/(\S+)$/);
    if (!match) continue;
    const [, commit, name] = match;
    if (name.endsWith('^{}')) continue;
    if (!SEMVER_TAG_RE.test(name)) continue;
    tags.push({ name, commit });
  }
  tags.sort((a, b) => compareSemver(a.name, b.name));
  return tags;
}

function reposFromJobs() {
  const seen = new Map();
  for (const job of JOBS) {
    if (!seen.has(job.submodule)) seen.set(job.submodule, job.repoUrl);
  }
  return [...seen.entries()];
}

if (require.main === module) {
  const explicit = process.argv.slice(2);
  const repos = explicit.length
    ? explicit.map((repoUrl) => [repoUrl, repoUrl])
    : reposFromJobs();

  for (const [label, repoUrl] of repos) {
    console.log(`${label} (${repoUrl})`);
    const tags = listTags(repoUrl);
    if (tags.length === 0) {
      console.log('  (no semver tags)');
    } else {
      for (const tag of tags) console.log(`  ${tag.name}  ${tag.commit.slice(0, 7)}`);
    }
  }
}

module.exports = { listTags, compareSemver, SEMVER_TAG_RE };
