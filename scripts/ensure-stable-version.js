#!/usr/bin/env node
// Runs on every `npm start`/`npm run build` (the `generate` prebuild
// hook — see package.json) so Stable exists and is correct without
// anyone needing to have run `node scripts/cut-version.js stable` in
// THIS checkout first. Necessary because Stable's frozen content
// (software-tools_versioned_docs/, software-tools_versioned_sidebars/,
// software-tools_versions.json) is gitignored now, not committed — see
// the comment on that rule in .gitignore for why. The only thing that IS
// committed is software-tools-stable.json, a small {toolId: tag} map;
// this script's whole job is turning that into a real Docusaurus version
// on disk, via scripts/cut-version.js's own materializeStable(), the
// exact same pipeline Latest's own content already goes through.
//
// Deliberately reads the tags already recorded (readStableTags()), never
// re-resolves "each tool's newest tag" itself (resolveTagsToCut()) — a
// normal build has to be deterministic from what's actually committed,
// not silently pick up whatever's newest on GitHub at the moment someone
// happens to run `npm start`. Only scripts/cut-version.js's own CLI (run
// by hand, or by the daily .github/workflows/cut-versions.yml job) ever
// decides that a NEWER tag should become Stable.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {readStableTags, materializeStable} = require('./cut-version');

const ROOT = path.resolve(__dirname, '..');
const VERSIONS_PATH = path.join(ROOT, 'software-tools_versions.json');
// Gitignored — this is a LOCAL cache of "which tags did we last
// materialize into the versioned_docs/ that's currently sitting on disk
// in THIS working directory," not a record anyone else needs to see. Its
// only job is letting a repeated `npm start` during a normal dev session
// skip redoing the (checkout-heavy) work when nothing about Stable's own
// tag pins has changed since the last run.
const MARKER_PATH = path.join(ROOT, '.stable-materialized.json');

// Catches everything that can change what Stable's materialized content
// actually looks like, beyond just the tag map: a hand-authored .mdx
// wrapper page for a VERSIONED tool (never tag-pinned, carried through
// as-is — see backupTrackedFiles' own comment), or any page at all for a
// NON-versioned tool (EPick, Force Torque Sensor, Isaac Sim — none of
// them pinned, so their whole page just gets captured into Stable
// verbatim from whatever's on disk right now). Editing either kind and
// re-running `npm start` left tagByTool byte-identical to the marker, so
// the skip-cache below used to fire anyway, leaving Stable rendering the
// PRE-edit content — confusing in a dev session, though never a prod
// issue (CI/deploy always start from a clean checkout with no marker to
// begin with). `git status --porcelain` alone would miss a committed
// change reached by switching branches/commits with no local diff, so
// HEAD's own SHA is folded in too.
function computeContentFingerprint() {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT}).toString().trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'software-tools/'], {cwd: ROOT}).toString();
  return {head, dirty};
}

function stableAlreadyExists() {
  if (!fs.existsSync(VERSIONS_PATH)) return false;
  try {
    return JSON.parse(fs.readFileSync(VERSIONS_PATH, 'utf8')).includes('stable');
  } catch {
    return false;
  }
}

function readMarker() {
  if (!fs.existsSync(MARKER_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(MARKER_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const tagByTool = readStableTags();
  if (Object.keys(tagByTool).length === 0) {
    console.log('[ensure-stable-version] No versioned tool has a recorded stable tag yet — nothing to materialize.');
    return;
  }

  const current = {tagByTool, fingerprint: computeContentFingerprint()};
  if (stableAlreadyExists() && JSON.stringify(readMarker()) === JSON.stringify(current)) {
    console.log('[ensure-stable-version] Stable already materialized for the current tag pins — skipping.');
    return;
  }

  materializeStable(tagByTool);
  // Written only after materializeStable() fully returns — it wipes and
  // repopulates scripts/generated/ internally (see its own comment), so
  // writing the marker anywhere inside that directory, or before this
  // point, would risk it being deleted by materializeStable's own cache
  // clearing the next time this runs. Re-reads the fingerprint rather than
  // reusing `current` above — materializeStable's own restore steps leave
  // software-tools/ exactly as they found it, so this should normally
  // match `current` byte-for-byte, but re-reading costs nothing and never
  // trusts that assumption blindly.
  fs.writeFileSync(
    MARKER_PATH,
    JSON.stringify({tagByTool, fingerprint: computeContentFingerprint()}, null, 2) + '\n'
  );
  console.log('[ensure-stable-version] Stable materialized.');
}

main();
