#!/usr/bin/env node
// Checks every submodule that any versioned tool tracks
// (software-tools-stable.json) for a newer tag upstream, and — if any of
// them has one — updates that same file to record it. Driven by
// .github/workflows/cut-versions.yml so nobody has to remember to do this
// by hand after a release — see "Cutting Stable" in
// docs/website/versioning.mdx.
//
// Deliberately does NOT itself run the checkout/sync/version pipeline
// (scripts/cut-version.js's materializeStable()) — Stable's frozen
// content isn't committed to git anymore (see .gitignore), so there's
// nothing here to freeze and commit either. Updating this one small file
// is the whole job; the workflow's own subsequent `npm run build && npm
// test` steps (already there, specifically so a broken cut never reaches
// main) are what actually materialize Stable from the tags this just
// recorded and verify the result — via
// scripts/ensure-stable-version.js, the same prebuild step every other
// build already goes through.
//
// No filtering on tag name yet (e.g. skipping pre-release/beta tags) —
// every tool currently opted into versioning only ever tags real releases,
// so "newest tag" already means "newest release" for all of them. A
// name-based filter is a deliberate, not-yet-needed follow-up.
const fs = require('fs');
const path = require('path');
const {VERSIONED_TOOLS} = require('./versioned-tools');
const {resolveTagsToCut, readStableTags, writeStableTags} = require('./cut-version');

const ROOT = path.resolve(__dirname, '..');
const SUMMARY_PATH = path.join(ROOT, 'cut-version-summary.md');

function buildSummary(moved) {
  const lines = [
    'Automated Stable tag update (see `.github/workflows/cut-versions.yml` ' +
      'and `scripts/cut-version.js`) — this PR only records which tag each ' +
      'tool tracks; the build/test steps on it materialize Stable from ' +
      'these tags and verify the result, same as every other build. ' +
      'Review the diff, not the decision: every tool here only tags real ' +
      'releases, so a newer tag existing upstream is itself the signal to ' +
      'move it.',
    '',
    ...moved.map((c) => `- **${c.toolId}**: \`${c.from}\` → \`${c.to}\``),
  ];
  return lines.join('\n') + '\n';
}

function main() {
  fs.rmSync(SUMMARY_PATH, {force: true});

  const stableTags = readStableTags();
  const tagByTool = resolveTagsToCut();
  const moved = [];
  for (const [toolId, newest] of Object.entries(tagByTool)) {
    const current = stableTags[toolId];
    if (newest === current) {
      console.log(`[auto-cut-versions] '${toolId}' already at its newest tag (${current}).`);
      continue;
    }
    console.log(`[auto-cut-versions] '${toolId}': ${current || '(none yet)'} -> ${newest}`);
    moved.push({toolId, from: current || '(none yet)', to: newest});
  }
  // A tool that's IN software-tools-stable.json but no longer in
  // VERSIONED_TOOLS (removed/renamed) would silently vanish from
  // tagByTool above — surfaced here so it's not just silently dropped.
  for (const toolId of Object.keys(stableTags)) {
    if (!VERSIONED_TOOLS[toolId]) {
      console.warn(`[auto-cut-versions] '${toolId}' is in software-tools-stable.json but not scripts/versioned-tools.js — leaving its recorded tag as is.`);
    }
  }

  if (moved.length === 0) {
    console.log('[auto-cut-versions] Nothing to cut — every tool is already at its newest tag.');
    return;
  }

  const updated = {...stableTags};
  for (const {toolId, to} of moved) updated[toolId] = to;
  writeStableTags(updated);

  fs.writeFileSync(SUMMARY_PATH, buildSummary(moved));
  console.log(`[auto-cut-versions] Wrote ${path.relative(ROOT, SUMMARY_PATH)}`);
}

if (require.main === module) {
  main();
}

module.exports = {buildSummary};
