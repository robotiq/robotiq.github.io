#!/usr/bin/env node
// Automates cutting a shared "Stable" snapshot for every versioned tool at
// once (see docs/contribute/versioning.mdx) — one command in place of what
// used to be a by-hand checkout/sync/version/restore procedure, including
// the link-rewrite step that procedure was easy to forget a piece of.
//
// Usage:
//   node scripts/cut-version.js stable [<toolId>=<tag> ...]
//
// Every submodule that has any tags is cut at its own newest tag by
// default; pass `<toolId>=<tag>` pairs to pin specific tools to a specific
// tag instead (e.g. re-cutting Stable without also picking up another
// tool's brand new tag). A tool whose submodule has no tags at all is left
// out of the cut entirely — its Stable content just mirrors whatever's
// currently synced from its own live main branch, same as Development,
// until it gets a first tag.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {execSync, execFileSync} = require('child_process');
const {listTags} = require('./list-submodule-tags');
const {VERSIONED_TOOLS} = require('./versioned-tools');
const {pruneLegacyFolder} = require('./lib/prune');

const ROOT = path.resolve(__dirname, '..');
const STABLE_TAGS_PATH = path.join(ROOT, 'versioned-tools-stable.json');
const INSTANCE_ID = 'versioned-tools';
const VERSIONED_TOOLS_ROOT = path.join(ROOT, 'versioned-tools');
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

// Restores the submodule to its actual PINNED commit — NOT `git checkout
// main`, which checks out whatever the local `main` branch ref currently
// points to. That's a real, previously-hit bug: a local `main` that
// hasn't been fetched recently can be behind (or a fast-forward ahead of)
// the commit this repo's git tree actually pins, silently leaving the
// submodule at the wrong commit after a "restore". `git submodule update
// --init --force`, scoped to just this one submodule, is the same
// mechanism sync-external-docs.js's own normal (non-SKIP_SUBMODULE_RESET)
// path already uses — it always resolves to the real pin, regardless of
// what the local branch ref says.
function restoreSubmodulePin(submodule) {
  execFileSync('git', ['submodule', 'update', '--init', '--force', '--', `external/${submodule}`], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Content synced from a submodule routinely links back to its own source
// on GitHub (tree/blob URLs, a "Source Code" button href) at `main` —
// correct for Development, wrong once frozen into a Stable snapshot: the
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
// docs/contribute/tools-tables.mdx) listing "Introduction guides"/"API
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
// Generic across both marker kinds and any nesting depth — verifies each
// link's target actually exists on disk (a `<href>.md`/`.mdx` file, or a
// `<href>/index.md`/`.mdx` folder) rather than assuming a fixed shape, so
// it needs no per-tool knowledge of what its sub-pages are called.
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
    const blockRegex = /\{\/\* (AUTO-GENERATED-[\w-]+-TABLE):START \*\/\}[\s\S]*?\{\/\* AUTO-GENERATED-[\w-]+-TABLE:END \*\/\}/g;
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

// Every versioned tool's wrapper page carries a "Use a released version"
// admonition (see docs/contribute/versioning.mdx's checklist) telling a
// Development reader to go use Stable instead — real content for
// Development, but wrong once frozen verbatim into the Stable snapshot
// itself (a reader already ON Stable doesn't need to be told to use
// Stable). Strips the exact block every wrapper page's admonition uses; a
// no-op on any file that doesn't have it.
const DEV_ADMONITION_RE = /:::tip Use a released version\r?\n[\s\S]*?\r?\n:::\r?\n\r?\n?/;

function stripDevelopmentOnlyAdmonition(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      stripDevelopmentOnlyAdmonition(child);
      continue;
    }
    if (!entry.name.endsWith('.mdx')) continue;
    const original = fs.readFileSync(child, 'utf8');
    const stripped = original.replace(DEV_ADMONITION_RE, '');
    if (stripped !== original) {
      fs.writeFileSync(child, stripped);
      console.log(`[cut-version] Stripped Development-only admonition from ${path.relative(ROOT, child)}`);
    }
  }
}

// Hand-authored .mdx wrapper pages under versioned-tools/ are never
// regenerated by sync-external-docs.js (by design — see "Splitting a tool
// page..." in docs/contribute/how-it-works.mdx), so re-syncing after a cut
// does NOT undo rewriteMainLinksToTag's own mutation of them — has to be
// restored explicitly. Backups live in a throwaway OS temp directory, NOT
// alongside the original files: a sibling `<file>.mdx.backup`-style name
// gets destroyed by pruneLegacyFolder's own cleanup (it doesn't end in
// `.mdx`, so pruneLegacyFolder's "keep only .mdx" rule deletes it as stale
// synced content).
function backupMdxFiles(dir, backupRoot, base = dir) {
  const backups = [];
  if (!fs.existsSync(dir)) return backups;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      backups.push(...backupMdxFiles(child, backupRoot, base));
      continue;
    }
    if (!entry.name.endsWith('.mdx')) continue;
    const backupPath = path.join(backupRoot, path.relative(base, child));
    fs.mkdirSync(path.dirname(backupPath), {recursive: true});
    fs.copyFileSync(child, backupPath);
    backups.push({original: child, backup: backupPath});
  }
  return backups;
}

function restoreMdxFiles(backups) {
  for (const {original, backup} of backups) {
    fs.copyFileSync(backup, original);
  }
}

// Runs every step regardless of whether an earlier one throws, then
// re-raises a single combined error if any did. Used for the "restore
// Development's live state" cleanup: a failure in one restoration step
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

// Cuts Stable for every versioned tool at once, into the single shared
// 'versioned-tools' instance (see docusaurus.config.js,
// docs/contribute/versioning.mdx) — one Docusaurus version, covering every
// submodule-backed tool's own subfolder simultaneously, each at its own
// tag (`tagByTool`, from resolveTagsToCut() unless the caller already
// resolved its own — see auto-cut-versions.js, which re-resolves the
// newest tags itself rather than trusting a caller-supplied map, since a
// cut triggered by one tool's new tag must still pick up every other
// tool's own current newest too).
function cutStable(tagByTool = resolveTagsToCut()) {
  if (Object.keys(tagByTool).length === 0) {
    throw new Error('No versioned tool has any tags yet — nothing to cut Stable from.');
  }
  console.log(`[cut-version] Cutting Stable: ${Object.entries(tagByTool).map(([t, tag]) => `${t}@${tag}`).join(', ')}`);

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

  const mdxBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cut-version-mdx-'));
  const mdxBackups = backupMdxFiles(VERSIONED_TOOLS_ROOT, mdxBackupDir);
  const checkedOutSubmodules = new Set();
  try {
    for (const [toolId, tag] of Object.entries(tagByTool)) {
      const tool = VERSIONED_TOOLS[toolId];
      checkoutSubmoduleAt(tool.submodule, tag);
      checkedOutSubmodules.add(tool.submodule);
    }
    // Stale-content contamination guard: a tag can predate a guide folder
    // or a Doxyfile the *current* main-branch checkout produces — sync
    // only ever adds/overwrites, so leftover content from a previous
    // (usually newer) checkout would otherwise get captured into this
    // cut. Every synced file is `.md` (this repo's own convention — see
    // .gitignore's `versioned-tools/**/*.md` rule); wiping those first,
    // keeping only the hand-authored `.mdx` wrapper page(s), guarantees
    // this run's sync output is exactly and only what these tags produce.
    pruneLegacyFolder(VERSIONED_TOOLS_ROOT);
    // scripts/generated/ (gitignored) caches the last doxygen2docusaurus
    // run's own sidebar JSON — sidebars.versioned-tools.js reads it
    // unconditionally whenever it exists, with no way to tell whether it
    // still matches what's actually synced right now. A tag whose sync
    // skips the doxygen2docusaurus job (no Doxyfile yet) leaves this
    // stale cache untouched, so the frozen sidebar snapshot ends up with
    // a full nested API tree pointing at doc ids that don't exist in this
    // cut at all. Wiping it first guarantees the post-sync cache (if any)
    // matches these tags.
    fs.rmSync(path.join(ROOT, 'scripts', 'generated'), {recursive: true, force: true});
    sync({skipReset: true});
    pruneDanglingSubpageLinks(VERSIONED_TOOLS_ROOT);
    for (const [toolId, tag] of Object.entries(tagByTool)) {
      const tool = VERSIONED_TOOLS[toolId];
      const toolDir = path.join(VERSIONED_TOOLS_ROOT, tool.toolPath);
      rewriteMainLinksToTag(toolDir, tool.repoUrl, tag);
      stripDevelopmentOnlyAdmonition(toolDir);
    }
    run(`npm run docusaurus -- docs:version:${INSTANCE_ID} ${TMP_VERSION_NAME}`);
  } finally {
    // Runs regardless of whether the cut above succeeded, and regardless
    // of whether any one of these steps itself fails — restoring
    // Development's live state (every checked-out submodule's pin, plus
    // the synced content and hand-authored wrapper pages) must never be
    // skipped because an earlier restoration step happened to throw. See
    // bestEffort's own comment for why this isn't just a plain sequence
    // of statements.
    bestEffort([
      () => restoreMdxFiles(mdxBackups),
      ...[...checkedOutSubmodules].map((submodule) => () => restoreSubmodulePin(submodule)),
      () => sync({skipReset: false}),
    ]);
  }

  // Only reached once Development's live state is confirmed restored
  // above — everything from here on is a plain filesystem rename, no
  // submodule/sync involved, so there's nothing left that could leave
  // Development's own content broken even if this part fails.
  deleteExistingVersion('stable');
  renameVersion(TMP_VERSION_NAME, 'stable');

  const stableTags = readStableTags();
  for (const [toolId, tag] of Object.entries(tagByTool)) stableTags[toolId] = tag;
  writeStableTags(stableTags);

  run('node scripts/regenerate-versioned-sidebars.mjs');
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
  stripDevelopmentOnlyAdmonition,
  pruneDanglingSubpageLinks,
  readStableTags,
  resolveTagsToCut,
  cutStable,
};
