#!/usr/bin/env node
// Automates materializing the shared "Stable" Docusaurus version for every
// versioned tool at once (see docs/website/versioning.mdx) — one
// command in place of what used to be a by-hand checkout/sync/version/
// restore procedure, including the link-rewrite step that procedure was
// easy to forget a piece of.
//
// Usage:
//   node scripts/cut-version.js stable [<toolId>=<tag> ...]
//
// Every submodule that has any tags is cut at its own newest tag by
// default; pass `<toolId>=<tag>` pairs to pin specific tools to a specific
// tag instead (e.g. re-cutting Stable without also picking up another
// tool's brand new tag). A tool whose submodule has no tags at all is left
// out of the cut entirely — its Stable content just mirrors whatever's
// currently synced from its own live main branch, same as Latest,
// until it gets a first tag.
//
// This module has two exported entry points, not one — the split matters:
// `materializeStable(tagByTool)` runs the actual checkout/sync/version/
// restore pipeline for a GIVEN set of tags, with no opinion on where those
// tags came from. `cutStable(tagByTool = resolveTagsToCut())` is the
// higher-level operation this file's own CLI runs: resolve which tags
// *should* be Stable (default: each tool's own newest), materialize them,
// and persist the result to software-tools-stable.json. The reason
// `materializeStable` needs to exist on its own: Stable's frozen content
// is no longer committed to git (see .gitignore) — every normal build
// re-derives it fresh from whatever software-tools-stable.json already
// records, via scripts/ensure-stable-version.js, which calls
// `materializeStable` directly without ever re-resolving tags itself (a
// normal build must be deterministic from what's already committed, not
// silently pick up whatever tag happens to be newest on GitHub right
// now — only this file's own CLI, or the daily
// .github/workflows/cut-versions.yml job, ever decides that).
const fs = require('fs');
const os = require('os');
const path = require('path');
const {execSync, execFileSync} = require('child_process');
const {listTags} = require('./list-submodule-tags');
const {VERSIONED_TOOLS} = require('./versioned-tools');
const {pruneLegacyFolder} = require('./lib/prune');

const ROOT = path.resolve(__dirname, '..');
const STABLE_TAGS_PATH = path.join(ROOT, 'software-tools-stable.json');
const INSTANCE_ID = 'software-tools';
const SOFTWARE_TOOLS_ROOT = path.join(ROOT, 'software-tools');
// Never referenced by docusaurus.config.js's own `versions`/`lastVersion`
// config — see the big comment in cutStable for why that matters.
const TMP_VERSION_NAME = 'cut-version-in-progress';

function readStableTags() {
  return JSON.parse(fs.readFileSync(STABLE_TAGS_PATH, 'utf8'));
}

function writeStableTags(tags) {
  fs.writeFileSync(STABLE_TAGS_PATH, JSON.stringify(tags, null, 2) + '\n');
}

function run(cmd, opts = {}) {
  console.log(`[cut-version] $ ${cmd}`);
  execSync(cmd, {cwd: ROOT, stdio: 'inherit', ...opts});
}

function sync({skipReset}) {
  run('node scripts/sync-external-docs.js', {
    env: {...process.env, ...(skipReset ? {SKIP_SUBMODULE_RESET: '1'} : {})},
  });
}

function checkoutSubmoduleAt(submodule, ref) {
  execFileSync('git', ['checkout', ref], {cwd: path.join(ROOT, 'external', submodule), stdio: 'inherit'});
}

// The exact commit a submodule was actually at, read right before
// materializeStable moves it anywhere — NOT the superproject's pinned
// gitlink SHA, which `npm run preview`/`SKIP_SUBMODULE_RESET=1 npm start`
// deliberately leave behind (they check out a WIP branch's FETCH_HEAD
// instead, precisely so a build picks up unreleased commits). Restoring
// to the PIN unconditionally, as this used to, silently discarded that
// WIP checkout the moment a Stable cut ran afterward in the same process
// (both `preview` and `SKIP_SUBMODULE_RESET=1 npm start` end with
// `ensure-stable-version.js`, which calls materializeStable whenever its
// marker is stale) — confirmed: a preview of a submodule's WIP branch
// reverted to its real pin partway through, with no cut-version.js
// command run directly, no error, nothing to say why.
function readSubmoduleHead(submodule) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {cwd: path.join(ROOT, 'external', submodule)}).toString().trim();
}

// Restores the submodule to whatever commit readSubmoduleHead captured —
// a plain checkout of that exact SHA, not `git submodule update --force`
// (which re-resolves to the superproject's own pin, ignoring the SHA
// entirely — exactly the bug this replaces).
function restoreSubmoduleHead(submodule, sha) {
  execFileSync('git', ['checkout', sha], {cwd: path.join(ROOT, 'external', submodule), stdio: 'inherit'});
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Content synced from a submodule routinely links back to its own source
// on GitHub (tree/blob URLs, a "Source Code" button href) at `main` —
// correct for Latest, wrong once frozen into a Stable snapshot: the
// file at `main` can already differ from what shipped in the tag Stable
// represents. Rewrites every such link, in every file under `dir`
// (recursively, `.md` and `.mdx` both — the synced guides and the
// hand-authored wrapper page's own CTA button), to point at `tag`
// instead.
function rewriteMainLinksToTag(dir, repoUrl, tag) {
  if (!fs.existsSync(dir)) return;
  const escapedRepo = escapeRegExp(repoUrl);
  const treeOrBlob = new RegExp(`${escapedRepo}/(tree|blob)/main/`, 'g');
  const bareRepo = new RegExp(`${escapedRepo}(["'\\s)>]|$)`, 'g');
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rewriteMainLinksToTag(child, repoUrl, tag);
      continue;
    }
    if (!/\.mdx?$/.test(entry.name)) continue;
    const original = fs.readFileSync(child, 'utf8');
    const rewritten = original
      .replace(treeOrBlob, `${repoUrl}/$1/${tag}/`)
      .replace(bareRepo, `${repoUrl}/tree/${tag}$1`);
    if (rewritten !== original) {
      fs.writeFileSync(child, rewritten);
      console.log(`[cut-version] Rewrote main->${tag} links in ${path.relative(ROOT, child)}`);
    }
  }
}

// A tool's own wrapper page can carry an AUTO-GENERATED-SUBPAGES-TABLE
// block (see "A tool page's own sub-section list" in
// docs/website/tools-tables.mdx) listing "Introduction guides"/"API
// Reference", and a guide folder's own landing page can carry a nested
// AUTO-GENERATED-GUIDES-TABLE block listing its individual guide pages —
// both the same `<a className="subpage-link" href="...">` shape.
// generate-tools-table.js's own writer for these deliberately never
// empties an already non-empty block — a safety net against a transient
// LOCAL build gap (Doxygen/guides not synced yet), not appropriate for a
// cut, which must freeze exactly what this tag actually produced, even if
// that's nothing. Without this, a frozen snapshot can carry a table
// pointing at pages that don't exist in it at all.
//
// Generic across both marker kinds (SUBPAGES/GUIDES) and any nesting
// depth — verifies each link's target actually exists on disk (a
// `<href>.md`/`.mdx` file, or a `<href>/index.md`/`.mdx` folder) rather
// than assuming a fixed shape, so it needs no per-tool knowledge of what
// its sub-pages are called.
//
// Matched ONLY by marker name (SUBPAGES/GUIDES), not every
// AUTO-GENERATED-*-TABLE block — generate-tools-table.js also writes
// several OTHER same-shaped marker pairs into files under this same tree
// (AUTO-GENERATED-PRODUCT-LIBRARIES-TABLE and friends, on a product's own
// index.mdx/ROS/index.mdx), holding a plain markdown table, not
// `<a className="subpage-link">` anchors — a real, confirmed bug hit the
// first time cutStable() actually ran generate-tools-table.js during a
// cut (see its own comment): matching those too found zero "subpage-link"
// anchors inside a markdown table, so survivors came up empty and this
// function wiped every product's freshly-written real table back to
// nothing, immediately after generate-tools-table.js had just written it.
function pruneDanglingSubpageLinks(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pruneDanglingSubpageLinks(child);
      continue;
    }
    if (!entry.name.endsWith('.mdx')) continue;
    const raw = fs.readFileSync(child, 'utf8');
    const blockRegex = /\{\/\* (AUTO-GENERATED-(?:SUBPAGES|GUIDES)-TABLE):START \*\/\}[\s\S]*?\{\/\* AUTO-GENERATED-(?:SUBPAGES|GUIDES)-TABLE:END \*\/\}/g;
    let changed = false;
    const updated = raw.replace(blockRegex, (block, markerKey) => {
      const links = [...block.matchAll(/<a className="subpage-link" href="([^"]+)">([^<]+)<\/a>/g)];
      const survivors = links
        .map(([, href, label]) => ({href, label}))
        .filter(({href}) => {
          const target = path.join(path.dirname(child), href);
          return (
            fs.existsSync(`${target}.md`) ||
            fs.existsSync(`${target}.mdx`) ||
            fs.existsSync(path.join(target, 'index.md')) ||
            fs.existsSync(path.join(target, 'index.mdx'))
          );
        });
      const list = survivors.length
        ? `<div className="subpage-links">\n${survivors.map((s) => `  <a className="subpage-link" href="${s.href}">${s.label}</a>`).join('\n')}\n</div>`
        : '';
      const newBlock = `{/* ${markerKey}:START */}\n${list}\n{/* ${markerKey}:END */}`;
      if (newBlock !== block) changed = true;
      return newBlock;
    });
    if (changed) {
      fs.writeFileSync(child, updated);
      console.log(`[cut-version] Pruned dangling subpage links in ${path.relative(ROOT, child)}`);
    }
  }
}

// Hand-authored .mdx wrapper pages under software-tools/ are never
// regenerated by sync-external-docs.js (by design — see "Splitting a tool
// page..." in docs/website/how-it-works.mdx), so re-syncing after a cut
// does NOT undo rewriteMainLinksToTag's own mutation of them — has to be
// restored explicitly. Every *other* git-tracked file under `dir` needs
// the same treatment — not just `.mdx`: `software-tools/Force Torque
// Sensor/Libraries/C/_readme.md` is the one committed exception to "every
// .md under here is synced/regenerated" (see the matching comment in
// .gitignore) — a hand-authored file with no sync job of its own, wiped
// the same way an .mdx would be by pruneLegacyFolder's own "keep only
// .mdx" rule otherwise. Backing up whatever `git ls-files` actually
// considers tracked (not a fixed extension list) handles that exception,
// and any future one, without needing to hardcode it here too.
//
// Backups live in a throwaway OS temp directory, NOT alongside the
// original files: a sibling `<file>.mdx.backup`-style name gets destroyed
// by pruneLegacyFolder's own cleanup (it doesn't end in `.mdx`, so
// pruneLegacyFolder's "keep only .mdx" rule deletes it as stale synced
// content).
function backupTrackedFiles(dir, backupRoot) {
  if (!fs.existsSync(dir)) return [];
  const tracked = execFileSync('git', ['ls-files', '--full-name', dir], {cwd: ROOT})
    .toString()
    .split('\n')
    .filter(Boolean);
  return tracked.map((relPath) => {
    const original = path.join(ROOT, relPath);
    const backupPath = path.join(backupRoot, relPath);
    fs.mkdirSync(path.dirname(backupPath), {recursive: true});
    fs.copyFileSync(original, backupPath);
    return {original, backup: backupPath};
  });
}

function restoreTrackedFiles(backups) {
  for (const {original, backup} of backups) {
    fs.mkdirSync(path.dirname(original), {recursive: true});
    fs.copyFileSync(backup, original);
  }
}

// Restores only whichever backed-up files are STILL MISSING after
// pruneLegacyFolder + sync — i.e. exactly the ones neither survived the
// prune (kept only .mdx) nor got regenerated fresh by a real sync job at
// the new tag (e.g. Force Torque Sensor's Libraries/C/_readme.md, which
// has no sync job at all — see backupTrackedFiles' own comment). A
// tracked file a sync job DID regenerate already exists again with its
// correct new-tag content by this point; restoring it here regardless
// would silently overwrite that with the stale pre-cut backup instead.
// Has to run before `docs:version:` captures the snapshot, not only in
// the end-of-cut cleanup — that one restores the *live* tree for
// Latest's own sake afterward, too late to be part of this cut.
function restoreMissingTrackedFiles(backups) {
  for (const {original, backup} of backups) {
    if (fs.existsSync(original)) continue;
    fs.mkdirSync(path.dirname(original), {recursive: true});
    fs.copyFileSync(backup, original);
  }
}

// Runs every step regardless of whether an earlier one throws, then
// re-raises a single combined error if any did. Used for the "restore
// Latest's live state" cleanup: a failure in one restoration step
// (e.g. copying a backed-up .mdx file back) must never skip the others
// (e.g. restoring a submodule pin) — an error inside a plain try/finally
// block's own finally body aborts the rest of that finally block
// immediately, the same as an error anywhere else.
function bestEffort(steps) {
  const errors = [];
  for (const step of steps) {
    try {
      step();
    } catch (e) {
      errors.push(e);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Cleanup step(s) failed:\n${errors.map((e) => e.stack || e.message).join('\n\n')}`);
  }
}

// Docusaurus's `docs:version:` CLI refuses to cut a version name that
// already exists ("this version already exists!") — no overwrite option.
// Safe to call on a version that was never cut (all three paths are
// no-ops then).
function deleteExistingVersion(versionName) {
  const versionsPath = path.join(ROOT, `${INSTANCE_ID}_versions.json`);
  if (fs.existsSync(versionsPath)) {
    const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8')).filter((v) => v !== versionName);
    fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n');
  }
  fs.rmSync(path.join(ROOT, `${INSTANCE_ID}_versioned_docs`, `version-${versionName}`), {recursive: true, force: true});
  fs.rmSync(path.join(ROOT, `${INSTANCE_ID}_versioned_sidebars`, `version-${versionName}-sidebars.json`), {force: true});
}

// Renames an already-cut version in place — the versioned_docs folder,
// the versioned_sidebars file, and its entry in versions.json.
function renameVersion(fromName, toName) {
  const versionsPath = path.join(ROOT, `${INSTANCE_ID}_versions.json`);
  const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
  const idx = versions.indexOf(fromName);
  if (idx === -1) throw new Error(`'${fromName}' not found in ${path.relative(ROOT, versionsPath)}`);
  versions[idx] = toName;
  fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n');

  fs.renameSync(
    path.join(ROOT, `${INSTANCE_ID}_versioned_docs`, `version-${fromName}`),
    path.join(ROOT, `${INSTANCE_ID}_versioned_docs`, `version-${toName}`)
  );
  fs.renameSync(
    path.join(ROOT, `${INSTANCE_ID}_versioned_sidebars`, `version-${fromName}-sidebars.json`),
    path.join(ROOT, `${INSTANCE_ID}_versioned_sidebars`, `version-${toName}-sidebars.json`)
  );
}

// Resolves which tag each versioned tool's Stable should track: every
// tool with any tags gets its own newest by default, overridden per-tool
// by `overrides` (a {toolId: tag} map — see main()'s `<toolId>=<tag>`
// argument parsing). A tool with no tags at all (nothing released yet) is
// left out of the returned map entirely.
function resolveTagsToCut(overrides = {}) {
  const tagByTool = {};
  for (const [toolId, tool] of Object.entries(VERSIONED_TOOLS)) {
    const tags = listTags(tool.repoUrl);
    if (tags.length === 0) continue;
    const tag = overrides[toolId] || tags[0].name;
    if (!tags.some((t) => t.name === tag)) {
      throw new Error(`'${tag}' is not a tag on ${tool.repoUrl} for '${toolId}' (found: ${tags.map((t) => t.name).join(', ')})`);
    }
    tagByTool[toolId] = tag;
  }
  return tagByTool;
}

// Two tools can share one submodule (tactile-cpp/tactile-python both back
// onto tactile_sensors; adaptive-grippers-ros/tactile-ros both back onto
// robotiq_ros) — but checkoutSubmoduleAt below runs once per TOOL, not
// once per submodule, and only one checkout of a given submodule can
// exist at a time. If tagByTool ever disagrees within a group (a manual
// `<toolId>=<tag>` override touching only one of them, or a hand-edited
// software-tools-stable.json), whichever tool's checkout happens to run
// last in that loop silently wins the actual content for BOTH — while
// software-tools-stable.json, and so each tool's own banner, keeps
// claiming its own (different, wrong) tag. Fail fast instead.
function assertSubmodulesAgree(tagByTool) {
  const bySubmodule = {};
  for (const [toolId, tag] of Object.entries(tagByTool)) {
    const {submodule} = VERSIONED_TOOLS[toolId];
    const prior = bySubmodule[submodule];
    if (prior && prior.tag !== tag) {
      throw new Error(
        `'${prior.toolId}' and '${toolId}' share the '${submodule}' submodule but are pinned to different ` +
        `tags (${prior.tag} vs ${tag}) — every tool backed by the same submodule must resolve to the same ` +
        `tag, since only one checkout of it can exist at a time.`
      );
    }
    bySubmodule[submodule] = {toolId, tag};
  }
}

// Materializes Stable for every versioned tool at once, into the single
// shared 'software-tools' instance (see docusaurus.config.js,
// docs/website/versioning.mdx) — one Docusaurus version, covering every
// submodule-backed tool's own subfolder simultaneously, each at its own
// tag (`tagByTool`). Runs the exact same generation pipeline Latest's own
// content goes through (sync-external-docs.js, generate-tools-table.js) —
// the only difference between the two versions is which commit each
// submodule is checked out at when that pipeline runs. Called both from
// cutStable() below (after it resolves which tags to use) and directly
// from scripts/ensure-stable-version.js (with whatever's already recorded
// in software-tools-stable.json, on every normal build).
function materializeStable(tagByTool) {
  if (Object.keys(tagByTool).length === 0) {
    throw new Error('No versioned tool has any tags yet — nothing to materialize Stable from.');
  }
  assertSubmodulesAgree(tagByTool);
  console.log(`[cut-version] Materializing Stable: ${Object.entries(tagByTool).map(([t, tag]) => `${t}@${tag}`).join(', ')}`);

  // Cut into a scratch name, never 'stable' directly. docusaurus.config.js's
  // `lastVersion: 'stable'` (and the `versions.stable` entry) has to keep
  // pointing at a name that actually exists in <id>_versions.json for the
  // ENTIRE time any `docusaurus` CLI command runs (including this one —
  // `docs:version:` still loads the full plugin config to know the
  // routePath/sidebar structure) — deleting the old 'stable' first and
  // only recreating it via this same command trips
  // "Docs option lastVersion: stable is invalid". Cutting into a name
  // `lastVersion` never references sidesteps that window entirely; the
  // real 'stable' only gets replaced afterward, via a plain filesystem
  // rename, with no `docusaurus` command running in between to validate
  // anything.
  deleteExistingVersion(TMP_VERSION_NAME);

  const trackedBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cut-version-tracked-'));
  const trackedBackups = backupTrackedFiles(SOFTWARE_TOOLS_ROOT, trackedBackupDir);
  // submodule -> the exact commit it was at before this function touched
  // it, captured once per submodule (two tools can share one — the
  // second tool's own checkout below must not overwrite the first
  // capture with an already-moved HEAD).
  const headBySubmodule = new Map();
  try {
    for (const [toolId, tag] of Object.entries(tagByTool)) {
      const tool = VERSIONED_TOOLS[toolId];
      if (!headBySubmodule.has(tool.submodule)) {
        headBySubmodule.set(tool.submodule, readSubmoduleHead(tool.submodule));
      }
      checkoutSubmoduleAt(tool.submodule, tag);
    }
    // Stale-content contamination guard: a tag can predate a guide folder
    // or a Doxyfile the *current* main-branch checkout produces — sync
    // only ever adds/overwrites, so leftover content from a previous
    // (usually newer) checkout would otherwise get captured into this
    // cut. Every synced file is `.md` (this repo's own convention — see
    // .gitignore's `software-tools/**/*.md` rule); wiping those first,
    // keeping only the hand-authored `.mdx` wrapper page(s), guarantees
    // this run's sync output is exactly and only what these tags produce.
    pruneLegacyFolder(SOFTWARE_TOOLS_ROOT);
    // scripts/generated/ (gitignored) caches the last doxygen2docusaurus
    // run's own sidebar JSON — sidebars.software-tools.js reads it
    // unconditionally whenever it exists, with no way to tell whether it
    // still matches what's actually synced right now. A tag whose sync
    // skips the doxygen2docusaurus job (no Doxyfile yet) leaves this
    // stale cache untouched, so the frozen sidebar snapshot ends up with
    // a full nested API tree pointing at doc ids that don't exist in this
    // cut at all. Wiping it first guarantees the post-sync cache (if any)
    // matches these tags.
    fs.rmSync(path.join(ROOT, 'scripts', 'generated'), {recursive: true, force: true});
    sync({skipReset: true});
    // See restoreMissingTrackedFiles' own comment — puts back any tracked
    // file pruneLegacyFolder deleted that no sync job regenerated (e.g. a
    // hand-authored .md with no sync job of its own), before docs:version:
    // captures this cut's snapshot.
    restoreMissingTrackedFiles(trackedBackups);
    // Fills in every product landing page's AUTO-GENERATED-PRODUCT-*-TABLE
    // block (and docs/intro.mdx's own tables) for THIS tag's actual synced
    // content — a real, confirmed gap without this: a wrapper .mdx page is
    // never touched by pruneLegacyFolder (kept, not a synced .md), so its
    // marker blocks stay exactly however they were hand-authored
    // (genuinely empty, since only this script ever fills them) unless
    // something actually runs it during the cut. Every normal build does,
    // via the `generate` prebuild hook — this cut process is the one path
    // that skipped it, so every product page's own tables froze into
    // Stable completely empty, permanently, until re-cut with this fixed.
    // Safe to run unmodified here (not a cut-specific variant): it also
    // rewrites docs/intro.mdx, but confirmed idempotent for it (the tables
    // there only depend on which wrapper pages carry which badges, not on
    // any synced sub-content, so it comes out byte-identical whichever tag
    // happens to be checked out). Its own subpage-link writer
    // (installLinkListBlock, inside ensureSubpagesBlock) deliberately never
    // empties an already-non-empty block — the right behavior for a normal
    // dev build (guards against a transient local gap) but wrong for a
    // cut, which can leave a stale entry (e.g. "API Reference" surviving
    // from a later checkout) sitting in a block whose fresh computation
    // for THIS tag actually found nothing — pruneDanglingSubpageLinks
    // right after this is what actually guarantees no dangling links
    // reach the cut, regardless of what this step's own safety net did or
    // didn't touch.
    run('node scripts/generate-tools-table.js');
    pruneDanglingSubpageLinks(SOFTWARE_TOOLS_ROOT);
    for (const [toolId, tag] of Object.entries(tagByTool)) {
      const tool = VERSIONED_TOOLS[toolId];
      const toolDir = path.join(SOFTWARE_TOOLS_ROOT, tool.toolPath);
      rewriteMainLinksToTag(toolDir, tool.repoUrl, tag);
    }
    run(`npm run docusaurus -- docs:version:${INSTANCE_ID} ${TMP_VERSION_NAME}`);
  } finally {
    // Runs regardless of whether the cut above succeeded, and regardless
    // of whether any one of these steps itself fails — restoring
    // Latest's live state (every checked-out submodule's own prior HEAD,
    // plus the synced content and hand-authored wrapper pages) must never
    // be skipped because an earlier restoration step happened to throw.
    // See bestEffort's own comment for why this isn't just a plain
    // sequence of statements.
    bestEffort([
      () => restoreTrackedFiles(trackedBackups),
      ...[...headBySubmodule].map(([submodule, sha]) => () => restoreSubmoduleHead(submodule, sha)),
      // skipReset: true — every submodule this function could have moved
      // is already back at its correct commit via restoreSubmoduleHead
      // just above (and every OTHER submodule was never touched at all).
      // `skipReset: false` ran sync-external-docs.js's own blanket `git
      // submodule update --init --force` across ALL submodules here,
      // which doesn't know about any of that — it unconditionally resets
      // every one of them to the superproject's own pinned SHA, undoing
      // `npm run preview`/`SKIP_SUBMODULE_RESET=1 npm start`'s whole point
      // (a WIP branch checked out at FETCH_HEAD, not the pin) the moment
      // this ran afterward in the same process. This only needs to COPY
      // content from whatever's now sitting in external/ — which is
      // already exactly right — not reset anything itself.
      () => sync({skipReset: true}),
      // Latest's own AUTO-GENERATED-*-TABLE content just got overwritten
      // by this function's OWN generate-tools-table.js call above (which
      // reflects the STABLE tags just checked out, not Latest's) — has to
      // be regenerated again now that Latest's live submodule state is
      // back, so materializeStable is fully self-contained regardless of
      // what already ran before it in the same process. This matters now
      // in a way it didn't when this was cutStable()'s own body: called
      // from scripts/ensure-stable-version.js, this runs as the LAST step
      // of `npm run generate` — Latest's own generate-tools-table.js call
      // (earlier in that same run) would otherwise get silently
      // clobbered, with nothing left afterward to fix it.
      () => run('node scripts/generate-tools-table.js'),
    ]);
  }

  // Only reached once Latest's live state is confirmed restored
  // above — everything from here on is a plain filesystem rename, no
  // submodule/sync involved, so there's nothing left that could leave
  // Latest's own content broken even if this part fails.
  deleteExistingVersion('stable');
  renameVersion(TMP_VERSION_NAME, 'stable');
}

// Resolves which tags Stable *should* track (default: each tool's own
// newest — see resolveTagsToCut() below unless the caller already
// resolved its own, e.g. auto-cut-versions.js, which re-resolves the
// newest tags itself rather than trusting a caller-supplied map, since a
// cut triggered by one tool's new tag must still pick up every other
// tool's own current newest too), materializes them, and persists the
// result to software-tools-stable.json — the single source of truth
// scripts/ensure-stable-version.js reads on every subsequent normal
// build to reproduce this same result without ever re-resolving tags
// itself.
function cutStable(tagByTool = resolveTagsToCut()) {
  materializeStable(tagByTool);

  const stableTags = readStableTags();
  for (const [toolId, tag] of Object.entries(tagByTool)) stableTags[toolId] = tag;
  writeStableTags(stableTags);

  console.log('[cut-version] Done. Review the diff, then run a full build before committing.');
}

function parseToolTagArgs(args) {
  const overrides = {};
  for (const arg of args) {
    const [toolId, tag] = arg.split('=');
    if (!toolId || !tag) throw new Error(`Expected '<toolId>=<tag>', got '${arg}'`);
    if (!VERSIONED_TOOLS[toolId]) throw new Error(`Unknown plugin id '${toolId}' — add it to scripts/versioned-tools.js`);
    overrides[toolId] = tag;
  }
  return overrides;
}

function main() {
  const [versionName, ...rest] = process.argv.slice(2);
  if (versionName !== 'stable') {
    console.error('Usage: node scripts/cut-version.js stable [<toolId>=<tag> ...]');
    process.exit(1);
  }
  cutStable(resolveTagsToCut(parseToolTagArgs(rest)));
}

if (require.main === module) {
  main();
}

module.exports = {
  rewriteMainLinksToTag,
  pruneDanglingSubpageLinks,
  readStableTags,
  writeStableTags,
  resolveTagsToCut,
  assertSubmodulesAgree,
  materializeStable,
  cutStable,
};
