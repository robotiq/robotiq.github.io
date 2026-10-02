// Regression test for a real bug: a "subpage-link" tile (the "Get
// started"/"Contents" boxes generate-tools-table.js installs — see
// installLinkListBlock in scripts/generate-tools-table.js) renders as a
// raw `<a href>`, not a Docusaurus `<Link>`, so the browser resolves it
// with plain relative-URL rules at click time, not anything Docusaurus
// resolves at build time the way a markdown link would. A href pointing
// at a FOLDER (e.g. a tool's own "docs" or "API" subsection) needs an
// explicit trailing slash — without one, landing on that folder's own
// index page leaves the browser's address bar one segment short of that
// page's real canonical URL, and any *further* relative link clicked from
// there (e.g. one of that folder's own guide tiles) resolves against the
// wrong base and silently 404s. Confirmed the hard way: exactly this
// chain, via a tool page's own "Introduction guides" tile → its "Quick
// start" tile.
//
// Scans the actual tracked content (not scripts/generate-tools-table.js's
// internals) — same "drift guard" reasoning as
// test/site-nav-tree.test.mjs's own: it catches the invariant breaking
// however it breaks (a regenerated marker block, or someone hand-editing
// one), runs fast and offline, and doesn't need a real build.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOFTWARE_TOOLS_ROOT = path.join(ROOT, 'software-tools');

function isDirectory(p) {
  return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

function findMdxFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findMdxFiles(full));
    } else if (entry.name.endsWith('.mdx')) {
      found.push(full);
    }
  }
  return found;
}

// Matches both className= (source .mdx) and class= (any already-rendered
// HTML this might one day also be asked to check) orderings of attributes.
const SUBPAGE_LINK_RE = /<a\s+class(?:Name)?="subpage-link"\s+href="([^"]+)"/g;

function findSubpageLinks(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return [...raw.matchAll(SUBPAGE_LINK_RE)].map((m) => m[1]);
}

test('every subpage-link href pointing at a folder ends with a trailing slash', () => {
  const mdxFiles = findMdxFiles(SOFTWARE_TOOLS_ROOT);
  let checked = 0;
  const violations = [];

  for (const file of mdxFiles) {
    for (const href of findSubpageLinks(file)) {
      checked += 1;
      const target = path.join(path.dirname(file), href.replace(/\/$/, ''));
      if (isDirectory(target) && !href.endsWith('/')) {
        violations.push(`${path.relative(ROOT, file)}: href="${href}" points at a folder (${path.relative(ROOT, target)}) but has no trailing slash`);
      }
    }
  }

  assert.ok(checked > 0, 'expected to find at least one subpage-link in software-tools/ — did the site structure change?');
  assert.deepEqual(violations, []);
});

module.exports = {findMdxFiles, findSubpageLinks};
