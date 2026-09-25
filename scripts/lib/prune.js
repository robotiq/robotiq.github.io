// Filesystem-pruning helpers used by sync-external-docs.js, extracted into
// their own module so they can be unit tested against a throwaway temp
// directory (fs.mkdtempSync) without running the full sync pipeline — that
// needs real submodule checkouts, network access, and the `doxygen`
// binary. See test/prune.test.js.
const fs = require('fs');
const path = require('path');

const COPY_EXTS = new Set(['.md', '.mdx', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf']);

// A folder job only ever adds/overwrites — if the source repo renames or
// removes a file, the old copy would otherwise linger in docs/ forever and
// get picked up as a stale, duplicate sidebar entry (see
// scripts/folder-sidebar.mjs, which lists every file actually present on
// disk). Called once per folder job's destDir after all JOBS have run, so
// files written by an unrelated job into the same tree (e.g. the register-
// map file job writing into a folder job's API/Modules/) are already in
// `written` and don't get flagged as stale.
// `index`/`README` are exempt — those are this site's own hand-authored
// landing pages for the folder, never synced from source (see "Splitting a
// tool page into overview, API reference, and guides" in
// docs/contribute/how-it-works.mdx).
// Returns the absolute paths it actually removed, so a caller can log them
// (e.g. relative to its own ROOT) without this module needing to know
// anything about the caller's own path conventions.
function pruneStale(destDir, written, removed = []) {
  if (!fs.existsSync(destDir)) return removed;
  for (const entry of fs.readdirSync(destDir, { withFileTypes: true })) {
    const child = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      pruneStale(child, written, removed);
      if (fs.readdirSync(child).length === 0) fs.rmdirSync(child);
      continue;
    }
    if (!COPY_EXTS.has(path.extname(entry.name).toLowerCase())) continue;
    const base = entry.name.replace(/\.[^.]+$/, '');
    if (base === 'index' || base === 'README') continue;
    if (!written.has(child)) {
      fs.unlinkSync(child);
      removed.push(child);
    }
  }
  return removed;
}

// A job with `destRoot` writes its output somewhere other than `docs/`
// (see the comment on `destRoot` in sync-external-docs.js) — but
// `pruneStale` only ever walks a job's *current* destPath, so it has no
// way to know about that same job's OLD output from before it gained a
// destRoot. A checkout that already ran this script once against an
// older commit (e.g. `main`, before this job moved) still has that old
// output sitting on disk, untracked and gitignored — `git checkout`
// doesn't touch gitignored files — so switching to a branch where the job
// now has a destRoot leaves both the old and new copies in place, and the
// main docs plugin instance keeps serving the stale one at the exact same
// public URL the job's own new instance now also serves. Docusaurus
// reports that as a duplicate route ("This could lead to non-deterministic
// routing behavior") rather than silently picking one — confirmed
// reproducible: sync on `main`, switch branches, `npm run build`, 49
// duplicate routes. A fresh clone or CI checkout never has this legacy
// output in the first place, so this only matters for a local checkout
// that's been sitting across the switch — but sync runs on every build,
// so cleaning it up here catches it automatically, no manual `rm -rf`
// needed once. Safe to remove once every job that will ever gain a
// destRoot already has one.
//
// The legacy path is NOT `docs/<job.to>` — `job.to` itself was shortened
// when destRoot was introduced (it dropped its leading `drivers/`
// segment, since the tool's own new plugin instance's `routeBasePath`
// already supplies everything up to the product root — see the
// `destRoot` comment in sync-external-docs.js and docusaurus.config.js's
// `plugins` array). Every destRoot job today is a product/tool under
// `docs/drivers/` before the move, so the legacy path is
// `docs/drivers/<job.to>`. Found this the hard way: the first version of
// this function used `path.join(rootDir, 'docs', job.to)` (matching the
// shape of the review comment that flagged this bug) and silently cleaned
// up nothing at all — verified by re-creating the exact stale files the
// reproduction steps described and confirming this version actually
// removes them.
// Deliberately NOT pruneStale's own index/README exemption: that one
// exists to protect a hand-authored `index.mdx` sitting next to synced
// siblings in the *live*, current destPath. This folder is pure legacy
// output nothing authors into any more, and this codebase's own
// convention (see .gitignore's `docs/drivers/**/*.md` rule) is that a
// `.md` file anywhere under `docs/drivers/` is always synced/generated,
// never hand-authored — including one literally named `index.md`
// (doxygen2docusaurus's own API landing page uses exactly that name).
// Only a genuine `.mdx` survives here.
function pruneLegacyFolder(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pruneLegacyFolder(child);
      if (fs.existsSync(child) && fs.readdirSync(child).length === 0) fs.rmdirSync(child);
      continue;
    }
    if (path.extname(entry.name).toLowerCase() === '.mdx') continue;
    fs.unlinkSync(child);
  }
}

function cleanupLegacyDestRoot(rootDir, job) {
  if (!job.destRoot) return;
  const legacyPath = path.join(rootDir, 'docs', 'drivers', job.to);
  if (!fs.existsSync(legacyPath)) return undefined;
  if (fs.statSync(legacyPath).isDirectory()) {
    pruneLegacyFolder(legacyPath);
    if (fs.existsSync(legacyPath) && fs.readdirSync(legacyPath).length === 0) {
      fs.rmdirSync(legacyPath);
    }
  } else {
    fs.unlinkSync(legacyPath);
  }
  return path.join('docs', 'drivers', job.to);
}

module.exports = { COPY_EXTS, pruneStale, pruneLegacyFolder, cleanupLegacyDestRoot };
