// Regenerates docs/third-party-notices.mdx: this site's direct production
// dependencies (package.json's `dependencies`) and their licenses, read
// from package-lock.json (see lib/lockfile-licenses.js for why the
// lockfile and not node_modules). Only direct dependencies are listed —
// the full transitive tree is ~1,500 packages, mostly Docusaurus's own
// build toolchain that never reaches the browser; every one of those is
// still license-checked by check-dependency-licenses.js. Keeping this
// list build-generated, rather than hand-maintained, means it can never
// drift from package.json: it's part of `npm run generate` (see
// package.json), and CI's "Verify generated content is committed" step
// already diffs docs/**, so a dependency change that alters this output
// without re-running `npm run generate` first fails CI the same way a
// stale tools table would.
const fs = require('node:fs');
const path = require('node:path');
const {ROOT, readLockfile} = require('./lib/lockfile-licenses');

const OUTPUT_PATH = path.join(ROOT, 'docs', 'third-party-notices.mdx');

const lockfile = readLockfile();
const direct = Object.keys(lockfile.packages[''].dependencies || {}).sort((a, b) => a.localeCompare(b));

const lines = direct.map((name) => {
  const info = lockfile.packages[`node_modules/${name}`];
  if (!info) {
    console.error(`generate-third-party-notices.js: ${name} is in package.json but not in package-lock.json — run npm install`);
    process.exit(1);
  }
  return `- [${name}](https://www.npmjs.com/package/${name}) — ${info.license || 'see package'}`;
});

const content = `---
title: Third-Party Notices
sidebar_label: Third-party notices
---

# Third-party notices

This site is built with the open-source packages listed below, each under
its own license, and their transitive dependencies — see
[\`package-lock.json\`](https://github.com/robotiq/robotiq.github.io/blob/main/package-lock.json)
for the full tree. Every production dependency, direct or transitive, is
checked against a permissive-license allowlist on each pull request. See
[License](/docs/license) for this site's own license.

${lines.join('\n')}
`;

fs.writeFileSync(OUTPUT_PATH, content, 'utf8');
console.log(`generate-third-party-notices.js: wrote ${lines.length} entries to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
