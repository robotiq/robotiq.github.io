// Basic "the docs are not broken" smoke test, run against the production
// build produced by `npm run build`.
//
// Docusaurus already fails the build on broken internal links / anchors
// (onBrokenLinks: 'throw' in docusaurus.config.js), so a successful build is
// most of the guarantee. This script adds a few cheap sanity checks on top:
//   1. the build actually happened,
//   2. the key pages were emitted, and
//   3. the auto-generated tools table was injected into the intro page
//      (catches a silently-broken generate-tools-table.js).
//
// Usage: npm run build && npm test

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, 'build');

// Stable routes that should always be generated. Kept deliberately short so
// the test doesn't turn into a mirror of the sidebar — it's a smoke test.
const REQUIRED_PAGES = [
  'index.html',
  '404.html',
  'docs/intro/index.html',
  'docs/contribute/index.html',
  'docs/drivers/TSF-85/index.html',
];

const errors = [];

if (!fs.existsSync(BUILD_DIR)) {
  console.error('[check-build] No build/ directory found. Run `npm run build` first.');
  process.exit(1);
}

for (const page of REQUIRED_PAGES) {
  if (!fs.existsSync(path.join(BUILD_DIR, page))) {
    errors.push(`missing expected page: ${page}`);
  }
}

// The intro page must contain the generated tools table (a rendered <table>
// with at least one shields.io support badge). If the generator no-ops or
// breaks, the section renders empty and this catches it.
const introPath = path.join(BUILD_DIR, 'docs/intro/index.html');
if (fs.existsSync(introPath)) {
  const intro = fs.readFileSync(introPath, 'utf8');
  if (!intro.includes('<table')) {
    errors.push('docs/intro is missing the generated tools <table>');
  }
  if (!intro.includes('img.shields.io/badge')) {
    errors.push('docs/intro tools table has no support badges (generator likely no-op)');
  }
}

if (errors.length) {
  console.error('[check-build] FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

console.log(`[check-build] OK — ${REQUIRED_PAGES.length} pages present, tools table generated.`);
