#!/usr/bin/env node
// Checks every tool currently tracking a Stable tag
// (versioned-tools-stable.json) for a newer tag upstream, and cuts Stable
// (then re-cuts Previous versions, since the older-tags list it shows
// shifts whenever Stable moves) for any that have one. Driven by
// .github/workflows/cut-versions.yml so nobody has to remember to run
// scripts/cut-version.js by hand after a release — see "Cutting Stable or
// Previous versions" in docs/contribute/versioning.mdx.
//
// No filtering on tag name yet (e.g. skipping pre-release/beta tags) —
// every tool currently opted into versioning only ever tags real releases,
// so "newest tag" already means "newest release" for all of them. A
// name-based filter is a deliberate, not-yet-needed follow-up.
const fs = require('fs');
const path = require('path');
const {listTags} = require('./list-submodule-tags');
const {VERSIONED_TOOLS} = require('./versioned-tools');
const {cutStable, cutPreviousVersions, readStableTags} = require('./cut-version');

const ROOT = path.resolve(__dirname, '..');
const SUMMARY_PATH = path.join(ROOT, 'cut-version-summary.md');

function buildSummary(cut) {
  const lines = [
    'Automated Stable cut via `scripts/cut-version.js` (see ' +
      '`.github/workflows/cut-versions.yml`) — review the diff, not the ' +
      "decision to cut: every tool here only tags real releases, so a " +
      'newer tag existing upstream is itself the signal to cut.',
    '',
    ...cut.map((c) => `- **${c.toolId}**: \`${c.from}\` → \`${c.to}\``),
  ];
  return lines.join('\n') + '\n';
}

function main() {
  fs.rmSync(SUMMARY_PATH, {force: true});

  const stableTags = readStableTags();
  const cut = [];
  for (const toolId of Object.keys(stableTags)) {
    const tool = VERSIONED_TOOLS[toolId];
    if (!tool) {
      console.warn(
        `[auto-cut-versions] '${toolId}' is in versioned-tools-stable.json but not scripts/versioned-tools.js — skipping.`
      );
      continue;
    }
    const tags = listTags(tool.repoUrl);
    if (tags.length === 0) continue;
    const newest = tags[0].name;
    const current = stableTags[toolId];
    if (newest === current) {
      console.log(`[auto-cut-versions] '${toolId}' already at its newest tag (${current}).`);
      continue;
    }
    console.log(`[auto-cut-versions] '${toolId}': ${current} -> ${newest}`);
    cutStable(toolId, newest);
    cutPreviousVersions(toolId);
    cut.push({toolId, from: current, to: newest});
  }

  if (cut.length === 0) {
    console.log('[auto-cut-versions] Nothing to cut — every tool is already at its newest tag.');
    return;
  }

  fs.writeFileSync(SUMMARY_PATH, buildSummary(cut));
  console.log(`[auto-cut-versions] Wrote ${path.relative(ROOT, SUMMARY_PATH)}`);
}

if (require.main === module) {
  main();
}

module.exports = {buildSummary};
