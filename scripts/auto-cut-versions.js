#!/usr/bin/env node
// Checks every submodule that any versioned tool tracks
// (versioned-tools-stable.json) for a newer tag upstream, and — if any of
// them has one — cuts the one shared Stable version for every tool at
// once (scripts/cut-version.js always cuts them together; there's no way
// to cut just one tool's own portion of a shared instance). Driven by
// .github/workflows/cut-versions.yml so nobody has to remember to run
// that script by hand after a release — see "Cutting Stable or Previous
// versions" in docs/contribute/versioning.mdx.
//
// No filtering on tag name yet (e.g. skipping pre-release/beta tags) —
// every tool currently opted into versioning only ever tags real releases,
// so "newest tag" already means "newest release" for all of them. A
// name-based filter is a deliberate, not-yet-needed follow-up.
const fs = require('fs');
const path = require('path');
const {VERSIONED_TOOLS} = require('./versioned-tools');
const {cutStable, resolveTagsToCut, readStableTags} = require('./cut-version');

const ROOT = path.resolve(__dirname, '..');
const SUMMARY_PATH = path.join(ROOT, 'cut-version-summary.md');

function buildSummary(moved) {
  const lines = [
    'Automated Stable cut via `scripts/cut-version.js` (see ' +
      '`.github/workflows/cut-versions.yml`) — review the diff, not the ' +
      "decision to cut: every tool here only tags real releases, so a " +
      'newer tag existing upstream is itself the signal to cut. Every ' +
      'versioned tool is cut together into the one shared Stable version, ' +
      'so this includes every tool currently at its newest tag, not only ' +
      'the one(s) that actually moved.',
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
  // A tool that's IN versioned-tools-stable.json but no longer in
  // VERSIONED_TOOLS (removed/renamed) would silently vanish from
  // tagByTool above — surfaced here so it's not just silently dropped.
  for (const toolId of Object.keys(stableTags)) {
    if (!VERSIONED_TOOLS[toolId]) {
      console.warn(`[auto-cut-versions] '${toolId}' is in versioned-tools-stable.json but not scripts/versioned-tools.js — leaving its recorded tag as is.`);
    }
  }

  if (moved.length === 0) {
    console.log('[auto-cut-versions] Nothing to cut — every tool is already at its newest tag.');
    return;
  }

  cutStable(tagByTool);

  fs.writeFileSync(SUMMARY_PATH, buildSummary(moved));
  console.log(`[auto-cut-versions] Wrote ${path.relative(ROOT, SUMMARY_PATH)}`);
}

if (require.main === module) {
  main();
}

module.exports = {buildSummary};
