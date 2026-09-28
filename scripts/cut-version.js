#!/usr/bin/env node
// Automates cutting a "Stable" or "Previous versions" snapshot for a
// versioned tool (see docs/contribute/versioning.mdx) — one command in
// place of what used to be a by-hand checkout/sync/version/restore
// procedure, including the link-rewrite and label-update steps that
// procedure was easy to forget a piece of.
//
// Usage:
//   node scripts/cut-version.js <plugin-id> stable [<tag>]
//   node scripts/cut-version.js <plugin-id> previous-versions
//
// <tag> defaults to the submodule's newest tag (list-submodule-tags.js).
// Run 'stable' before 'previous-versions' for a tool that needs both —
// the previous-versions signpost excludes whichever tag
// versioned-tools-stable.json currently records for this tool, so it
// needs to already be current.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {execSync, execFileSync} = require('child_process');
const {listTags} = require('./list-submodule-tags');
const {VERSIONED_TOOLS} = require('./versioned-tools');
const {pruneLegacyFolder} = require('./lib/prune');

const ROOT = path.resolve(__dirname, '..');
const STABLE_TAGS_PATH = path.join(ROOT, 'versioned-tools-stable.json');
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
// pointing at pages that don't exist in it at all — confirmed by hitting
// this at BOTH levels while testing this script against a tag that
// predates both the guide folder and the API's own Doxyfile: the tool's
// own "API Reference" link, and (one level deeper, inside the guide
// folder's own landing page) five individual guide links, all dangling.
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
// Stable). Confirmed by testing: an early version of this script skipped
// this step and captured the admonition into a real Stable cut. Strips
// the exact block every wrapper page's admonition uses; a no-op on any
// file that doesn't have it.
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

// Hand-authored .mdx wrapper pages under a tool's versioned-tools/
// folder are never regenerated by sync-external-docs.js (by design — see
// "Splitting a tool page..." in docs/contribute/how-it-works.mdx), so
// re-syncing after a cut does NOT undo rewriteMainLinksToTag's own
// mutation of them — has to be restored explicitly. Backups live in a
// throwaway OS temp directory, NOT alongside the original files: a
// sibling `<file>.mdx.backup`-style name was tried first and reliably
// destroyed by pruneLegacyFolder's own cleanup (it doesn't end in
// `.mdx`, so pruneLegacyFolder's "keep only .mdx" rule deletes it as
// stale synced content) — confirmed by hitting that exact failure while
// testing this script against a real tool.
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
// (e.g. restoring the submodule pin) — confirmed by hitting exactly that
// failure mode while testing this script: an error inside a plain
// try/finally block's own finally body aborts the rest of that finally
// block immediately, the same as an error anywhere else.
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
function deleteExistingVersion(toolId, versionName) {
  const versionsPath = path.join(ROOT, `${toolId}_versions.json`);
  if (fs.existsSync(versionsPath)) {
    const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8')).filter((v) => v !== versionName);
    fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n');
  }
  fs.rmSync(path.join(ROOT, `${toolId}_versioned_docs`, `version-${versionName}`), {recursive: true, force: true});
  fs.rmSync(path.join(ROOT, `${toolId}_versioned_sidebars`, `version-${versionName}-sidebars.json`), {force: true});
}

// Renames an already-cut version in place — the versioned_docs folder,
// the versioned_sidebars file, and its entry in versions.json.
function renameVersion(toolId, fromName, toName) {
  const versionsPath = path.join(ROOT, `${toolId}_versions.json`);
  const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
  const idx = versions.indexOf(fromName);
  if (idx === -1) throw new Error(`'${fromName}' not found in ${path.relative(ROOT, versionsPath)}`);
  versions[idx] = toName;
  fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n');

  fs.renameSync(
    path.join(ROOT, `${toolId}_versioned_docs`, `version-${fromName}`),
    path.join(ROOT, `${toolId}_versioned_docs`, `version-${toName}`)
  );
  fs.renameSync(
    path.join(ROOT, `${toolId}_versioned_sidebars`, `version-${fromName}-sidebars.json`),
    path.join(ROOT, `${toolId}_versioned_sidebars`, `version-${toName}-sidebars.json`)
  );
}

function readFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const body = match ? match[1] : '';
  const get = (key) => {
    const m = body.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim().replace(/\r$/, '').replace(/^["']|["']$/g, '') : undefined;
  };
  return {title: get('title'), sidebarLabel: get('sidebar_label')};
}

function cutStable(toolId, requestedTag) {
  const tool = VERSIONED_TOOLS[toolId];
  if (!tool) throw new Error(`Unknown plugin id '${toolId}' — add it to scripts/versioned-tools.js`);

  const tags = listTags(tool.repoUrl);
  if (tags.length === 0) throw new Error(`${tool.repoUrl} has no semver tags — nothing to cut Stable from yet`);
  const tag = requestedTag || tags[0].name;
  if (!tags.some((t) => t.name === tag)) {
    throw new Error(`'${tag}' is not a tag on ${tool.repoUrl} (found: ${tags.map((t) => t.name).join(', ')})`);
  }

  const liveToolDir = path.join(ROOT, 'versioned-tools', tool.toolPath);

  console.log(`[cut-version] Cutting '${toolId}' Stable at ${tag}...`);
  // Cut into a scratch name, never 'stable' directly. docusaurus.config.js's
  // `lastVersion: 'stable'` (and the `versions.stable` entry) has to keep
  // pointing at a name that actually exists in <id>_versions.json for the
  // ENTIRE time any `docusaurus` CLI command runs (including this one —
  // `docs:version:` still loads the full plugin config to know the
  // routePath/sidebar structure) — deleting the old 'stable' first and
  // only recreating it via this same command trips
  // "Docs option lastVersion: stable is invalid", confirmed by hitting it
  // directly. Cutting into a name `lastVersion` never references sidesteps
  // that window entirely; the real 'stable' only gets replaced afterward,
  // via a plain filesystem rename, with no `docusaurus` command running
  // in between to validate anything.
  deleteExistingVersion(toolId, TMP_VERSION_NAME);

  const mdxBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cut-version-mdx-'));
  const mdxBackups = backupMdxFiles(liveToolDir, mdxBackupDir);
  try {
    checkoutSubmoduleAt(tool.submodule, tag);
    // Stale-content contamination guard: a tag can predate a guide folder
    // or a Doxyfile the *current* main-branch checkout produces — sync
    // only ever adds/overwrites, so leftover content from a previous
    // (usually newer) checkout would otherwise get captured into this
    // cut. Every synced file is `.md` (this repo's own convention — see
    // .gitignore's `versioned-tools/**/*.md` rule); wiping those first,
    // keeping only the hand-authored `.mdx` wrapper page(s), guarantees
    // this run's sync output is exactly and only what this tag produces.
    pruneLegacyFolder(liveToolDir);
    // scripts/generated/ (gitignored) caches the last doxygen2docusaurus
    // run's own sidebar JSON — sidebars.<tool>.js reads it unconditionally
    // whenever it exists, with no way to tell whether it still matches
    // what's actually synced right now. A tag whose sync skips the
    // doxygen2docusaurus job (no Doxyfile yet) leaves this stale cache
    // untouched, so the frozen sidebar snapshot ends up with a full nested
    // API tree pointing at doc ids that don't exist in this cut at all —
    // confirmed by hitting exactly that while testing this script. Wiping
    // it first guarantees the post-sync cache (if any) matches this tag.
    fs.rmSync(path.join(ROOT, 'scripts', 'generated'), {recursive: true, force: true});
    sync({skipReset: true});
    pruneDanglingSubpageLinks(liveToolDir);
    rewriteMainLinksToTag(liveToolDir, tool.repoUrl, tag);
    stripDevelopmentOnlyAdmonition(liveToolDir);
    run(`npm run docusaurus -- docs:version:${toolId} ${TMP_VERSION_NAME}`);
  } finally {
    // Runs regardless of whether the cut above succeeded, and regardless
    // of whether any one of these three steps itself fails — restoring
    // Development's live state (submodule pin + synced content + the
    // hand-authored wrapper page) must never be skipped because an
    // earlier restoration step happened to throw. See bestEffort's own
    // comment for why this isn't just a plain sequence of statements.
    bestEffort([
      () => restoreMdxFiles(mdxBackups),
      () => restoreSubmodulePin(tool.submodule),
      () => sync({skipReset: false}),
    ]);
  }

  // Only reached once Development's live state is confirmed restored
  // above — everything from here on is a plain filesystem rename, no
  // submodule/sync involved, so there's nothing left that could leave
  // Development's own content broken even if this part fails.
  deleteExistingVersion(toolId, 'stable');
  renameVersion(toolId, TMP_VERSION_NAME, 'stable');

  const stableTags = readStableTags();
  stableTags[toolId] = tag;
  writeStableTags(stableTags);

  run('node scripts/regenerate-versioned-sidebars.mjs');
  console.log(`[cut-version] Done. '${toolId}' Stable now tracks ${tag}. Review the diff, then run a full build before committing.`);
}

function buildSignpost({title, sidebarLabel, submodule, repoUrl, stableTag, olderTags}) {
  const body =
    olderTags.length === 0
      ? `**Stable** currently tracks \`${submodule}\`'s only tagged release so far,\n**${stableTag}** — there are no older releases archived here yet.\n\nOnce a newer tag is cut, older releases will be listed here with a link\nto their own tag in the source repository.\n`
      : `**Stable** currently tracks \`${submodule}\`'s newest release, **${stableTag}**.\n\nWe only host **Development (main)** and **Stable** here — older releases\naren't archived on this site. Browse their own tag in the source\nrepository instead:\n\n${olderTags.map((t) => `- **${t}** — [browse source](${repoUrl}/tree/${t})`).join('\n')}\n`;
  return `---\ntitle: ${title}\nsidebar_label: ${sidebarLabel}\n---\n\n${body}`;
}

function cutPreviousVersions(toolId) {
  const tool = VERSIONED_TOOLS[toolId];
  if (!tool) throw new Error(`Unknown plugin id '${toolId}' — add it to scripts/versioned-tools.js`);

  const stableTags = readStableTags();
  const stableTag = stableTags[toolId];
  if (!stableTag) throw new Error(`No Stable tag recorded for '${toolId}' in versioned-tools-stable.json — cut 'stable' first`);

  const tags = listTags(tool.repoUrl);
  const olderTags = tags.map((t) => t.name).filter((name) => name !== stableTag);

  const liveToolDir = path.join(ROOT, 'versioned-tools', tool.toolPath);
  const wrapperPath = path.join(liveToolDir, 'index.mdx');
  const {title, sidebarLabel} = readFrontmatter(wrapperPath);

  console.log(`[cut-version] Cutting '${toolId}' Previous versions (${olderTags.length} older tag(s))...`);
  // Same scratch-name-then-rename approach as cutStable, same reason —
  // see the comment there.
  deleteExistingVersion(toolId, TMP_VERSION_NAME);

  // Previous-versions is a signpost only — real synced content (docs/,
  // API/, ...) currently sitting in liveToolDir is Development's own
  // valid, current content, but this cut must not capture it: without
  // clearing it first, `docs:version:` freezes whatever's ACTUALLY there
  // (a full docs/API tree) alongside the signpost text, not the sparse
  // two-file snapshot this version is supposed to be — confirmed by
  // hitting exactly that while testing this script. Unlike cutStable,
  // there's no submodule/sync step to regenerate this afterward, so the
  // whole directory is backed up wholesale first and restored wholesale
  // after, rather than relying on a re-sync.
  const fullBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cut-version-full-'));
  fs.cpSync(liveToolDir, fullBackupDir, {recursive: true});
  try {
    pruneLegacyFolder(liveToolDir);
    // pruneLegacyFolder only strips synced (.md) content — a hand-authored
    // sub-page like a guide folder's own docs/index.mdx survives it, the
    // same as it correctly does for cutStable. Previous-versions is a
    // pure signpost with no sub-navigation at all, though (unlike Stable,
    // which is real, if possibly sparse, content) — remove every
    // sub-page, keeping only the top-level wrapper page itself.
    for (const entry of fs.readdirSync(liveToolDir, {withFileTypes: true})) {
      if (entry.name === 'index.mdx') continue;
      fs.rmSync(path.join(liveToolDir, entry.name), {recursive: true, force: true});
    }
    fs.writeFileSync(
      wrapperPath,
      buildSignpost({
        title: title || toolId,
        sidebarLabel: sidebarLabel || toolId,
        submodule: tool.submodule,
        repoUrl: tool.repoUrl,
        stableTag,
        olderTags,
      })
    );
    // Same stale-cache trap as cutStable (see its own comment on this same
    // rmSync call) — sidebars.<tool>.js reads scripts/generated/'s cached
    // doxygen sidebar JSON unconditionally whenever the file exists, with
    // no way to tell it no longer matches what's on disk. A cache left
    // over from an earlier cutStable run (or just a normal `npm run
    // build`) otherwise leaks a full nested API tree into what must be a
    // pure two-file signpost — confirmed by hitting exactly that: the cut
    // itself reported success, but the frozen sidebar it produced
    // referenced doc ids that don't exist anywhere in this version,
    // failing Docusaurus's own checkSidebarsDocIds validation at build
    // time.
    fs.rmSync(path.join(ROOT, 'scripts', 'generated'), {recursive: true, force: true});
    run(`npm run docusaurus -- docs:version:${toolId} ${TMP_VERSION_NAME}`);
  } finally {
    bestEffort([
      () => {
        fs.rmSync(liveToolDir, {recursive: true, force: true});
        fs.cpSync(fullBackupDir, liveToolDir, {recursive: true});
      },
    ]);
  }

  deleteExistingVersion(toolId, 'previous-versions');
  renameVersion(toolId, TMP_VERSION_NAME, 'previous-versions');

  run('node scripts/regenerate-versioned-sidebars.mjs');
  console.log(`[cut-version] Done. Review the diff, then run a full build before committing.`);
}

function main() {
  const [toolId, versionName, tag] = process.argv.slice(2);
  if (!toolId || !versionName) {
    console.error('Usage: node scripts/cut-version.js <plugin-id> stable [<tag>]');
    console.error('       node scripts/cut-version.js <plugin-id> previous-versions');
    process.exit(1);
  }
  if (versionName === 'stable') {
    cutStable(toolId, tag);
  } else if (versionName === 'previous-versions') {
    cutPreviousVersions(toolId);
  } else {
    console.error(`Unknown version name '${versionName}' — expected 'stable' or 'previous-versions'`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  rewriteMainLinksToTag,
  stripDevelopmentOnlyAdmonition,
  pruneDanglingSubpageLinks,
  buildSignpost,
  readFrontmatter,
  readStableTags,
  cutStable,
  cutPreviousVersions,
};
