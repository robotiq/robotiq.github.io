// Regenerates the software-tools tables by scanning software-tools/:
//  - one table per category (Libraries, ROS, Simulation, Other) in
//    docs/intro.mdx, all products x tools in that category
//  - the same tables, single-row versions scoped to just that product, on
//    each product's own index.mdx
//  - the same Libraries / Simulation / Other tables again, once a product
//    actually has tools there, on that category's own dedicated
//    <Category>/index.mdx landing page — ROS is the one exception (see
//    below)
//
// Each product (hardware) is a folder under software-tools/ with its own
// index.mdx (frontmatter title = row label). Underneath, tool pages are
// found by walking the folder tree until an index.mdx with a
// `Category-<Name>` shields.io badge is found — that page is a leaf ("tool")
// classified into that category, regardless of how deep it's nested (e.g.
// software-tools/<product>/Libraries/Python/index.mdx or
// software-tools/<product>/ROS/index.mdx). Plain folders in between
// (Libraries/, Simulation/) are just containers.
//
// ROS is the one category capped at a single tool per product — there is
// no per-distro or per-generation split any more, just one `Category-ROS`
// page (software-tools/<product>/ROS/index.mdx), carrying real content
// itself (synced from https://github.com/robotiq/ros for Robotiq-
// maintained products, hand-authored for third-party ones) rather than
// being a container with its own auto-generated landing table. So unlike
// Libraries/Simulation/Other, ROS never gets a dedicated landing page
// written by this script — there's nothing to land on beyond the leaf
// page itself.
//
// Add a new hardware folder or tool page under software-tools/ and every
// table picks it up automatically on the next `npm start` / `npm run
// build`. Every product lives here — not just submodule-synced tools —
// because the shared 'software-tools' Docusaurus instance (see
// docs/contribute/versioning.mdx) owns the entire `/docs/drivers/*` URL
// space; a plugin instance can only build its own routes from its own
// content root, and two instances can't split ownership of one URL prefix
// (client-side route matching picks whichever instance's own top-level
// route registers first, for every path under that prefix, with no
// fallback to the other — confirmed by hitting this directly: a page that
// used to live in docs/drivers/ 404'd once 'software-tools' claimed
// /docs/drivers as its own routeBasePath).
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const ROOT = path.resolve(__dirname, '..');
const DRIVERS_DIR = path.join(ROOT, 'software-tools');
const INTRO_FILE = path.join(ROOT, 'docs', 'intro.mdx');

// Categories, in the order their tables appear on docs/intro.mdx and on
// each product page. Every category is rendered the same way: a plain
// "product x tool" table, one column per distinct tool `title` found
// under that category's leaf pages — for ROS that's always just the one
// column, "ROS", since a product has at most one ROS leaf page now.
const CATEGORIES = ['Libraries', 'ROS', 'Simulation', 'Other'];

// Categories that also get a dedicated, multi-item `<Category>/index.mdx`
// landing page once a product actually has any tools there (every one
// except ROS — see the header comment above for why).
const LANDING_PAGE_CATEGORIES = ['Libraries', 'Simulation', 'Other'];

// Heading text for each category, keyed by where it's rendered. The
// heading lives INSIDE the marker-controlled content (rather than
// hand-authored above it) specifically so a category with zero tools can
// omit its whole section — heading included, not just the table — by
// writing nothing between the markers at all.
const INTRO_HEADING = {
  Libraries: '### Libraries',
  ROS: '### ROS',
  Simulation: '### Simulation',
  Other: '### Other community projects',
};
const PRODUCT_HEADING = {
  Libraries: '### Libraries',
  ROS: '### ROS',
  Simulation: '### Simulation',
  Other: '### Other',
};

// Preferred left-to-right column order. Anything not listed here still
// appears automatically — it's just sorted alphabetically after these.
const COLUMN_ORDER = {
  Libraries: ['C', 'C++', 'Python'],
  Simulation: ['Isaac Sim', 'PyBullet', 'MuJoCo'],
  Other: [],
};

// Preferred order for a tool page's own sub-sections (collectSubpages) —
// matches how they're conventionally ordered in sidebars.js (guides
// before the generated API reference). A subpage folder not listed here
// still appears, just sorted alphabetically after these.
const SUBPAGE_ORDER = ['docs', 'API'];

// One-line description shown in the legend below each category table. A
// column missing here still appears — it just has no legend entry.
const COLUMN_DESCRIPTIONS = {
  'C': 'Compiled, performance-oriented language.',
  'C++': 'Compiled, performance-oriented object-oriented language.',
  'Python': 'Interpreted, prototyping-oriented language.',
  'Isaac Sim': 'NVIDIA Isaac Sim integration for simulating the hardware.',
  'PyBullet': 'PyBullet integration for physics-based simulation.',
  'MuJoCo': 'MuJoCo (MJCF) model for physics-based simulation.',
  'GraspGen': 'NVIDIA GraspGen asset/model package with Robotiq gripper definitions for grasp synthesis research.',
};

const START_MARKER = (key) => `{/* AUTO-GENERATED-${key}-TABLE:START */}`;
const END_MARKER = (key) => `{/* AUTO-GENERATED-${key}-TABLE:END */}`;

// Frontmatter is parsed with gray-matter (already a transitive dependency of
// Docusaurus, declared directly here) rather than a hand-rolled regex, so
// quoted values and colons inside a title (e.g. `title: "Foo: bar"`) parse
// correctly instead of producing a wrong column key.
function readFrontmatterTitle(raw) {
  const { data } = matter(raw);
  return typeof data.title === 'string' ? data.title.trim() : null;
}

function readCategory(raw) {
  const m = raw.match(/badge\/Category-([A-Za-z0-9_]+)-[A-Za-z0-9]+\)/);
  return m ? m[1] : null;
}

// Reads the page's own "Supported by <Label>" badge and returns a compact
// version for the table — same label/color, without the "Supported by"
// prefix — so the table stays dense. The source page's badge is untouched.
function readCompactBadge(raw) {
  const badge = raw.match(/badge\/Supported_by-([A-Za-z0-9_]+)-([A-Za-z0-9]+)/);
  if (!badge) return null;
  const [, label, color] = badge;
  const displayLabel = label.replace(/_/g, ' ');
  return `![${displayLabel}](https://img.shields.io/badge/${label}-${color})`;
}

function docHref(...segments) {
  // Escape characters that would break Markdown link syntax or be misread as
  // a URL fragment/query (space, #, ?, %) — everything else (e.g. the "+" in
  // "C++") must stay literal to match the page's actual URL.
  return segments.map((s) => s.replace(/[ #?%]/g, (c) => encodeURIComponent(c))).join('/');
}

function isDirectory(p) {
  return fs.statSync(p).isDirectory();
}

// Walks a hardware folder looking for tool leaf pages: an index.mdx carrying
// a Category badge. Recurses through plain container folders (Libraries/,
// Simulation/, ...) that have no such index.mdx of their own — ROS/ is
// NOT one of these any more: its own index.mdx carries the Category-ROS
// badge directly, so it's a leaf, not a container, and recursion never
// goes any deeper than it.
function collectToolPages(dir, hardwareDir) {
  const found = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (!isDirectory(full)) continue;

    const indexPath = path.join(full, 'index.mdx');
    if (fs.existsSync(indexPath)) {
      const raw = fs.readFileSync(indexPath, 'utf8');
      const category = readCategory(raw);
      if (category) {
        found.push({
          indexPath,
          raw,
          category,
          relSegments: path.relative(hardwareDir, full).split(path.sep),
          title: readFrontmatterTitle(raw) || name,
        });
        continue;
      }
    }
    found.push(...collectToolPages(full, hardwareDir));
  }
  return found;
}

// A tool leaf page can itself have sub-sections — currently just the
// "overview / API reference / guides" split documented under "Splitting a
// tool page into overview, API reference, and guides" in
// docs/contribute/how-it-works.mdx (e.g. Libraries/C++/docs/, Libraries/C++/API/).
// Generic, not tied to those two names: any immediate subdirectory of a
// tool's own folder that has its own index page (.mdx, or .md for
// doxygen2docusaurus's generated API/index.md) but carries no Category
// badge of its own — i.e. it's a sub-section of this tool, not a
// different tool — becomes an entry. A tool with none (every Simulation
// page today) yields an empty list.
function collectSubpages(toolDir) {
  const subpages = [];
  for (const name of fs.readdirSync(toolDir).sort()) {
    const full = path.join(toolDir, name);
    if (!isDirectory(full)) continue;

    const indexPath = ['index.mdx', 'index.md']
      .map((ext) => path.join(full, ext))
      .find((p) => fs.existsSync(p));
    if (!indexPath) continue;

    const raw = fs.readFileSync(indexPath, 'utf8');
    if (readCategory(raw)) continue;

    // "API Reference" matches the fixed label sidebars.js already uses for
    // this folder (doxygenApiCategory) rather than that generated page's
    // own long, product-specific title — kept consistent with it here too.
    const label = name.toLowerCase() === 'api' ? 'API Reference' : (readFrontmatterTitle(raw) || name);
    // Trailing slash is load-bearing, not cosmetic — this href is rendered
    // as a raw `<a href>` (see installLinkListBlock), not a Docusaurus
    // `<Link>`, so the browser resolves it with plain relative-URL rules
    // at click time, not anything Docusaurus-aware. `name` here is always
    // a folder (this function only ever collects an index PAGE found
    // inside a subdirectory), so without the trailing slash, clicking it
    // lands on a URL indistinguishable from a plain leaf page one level
    // up (e.g. "docs" instead of "docs/") — then any *further* relative
    // link on THAT landing page (e.g. one of collectFolderGuides' own
    // guide tiles) resolves against the wrong base and silently 404s.
    // Confirmed the hard way: exactly this chain, via the tool page's own
    // "Introduction guides" tile → its "Quick start" tile.
    subpages.push({label, href: `${name}/`});
  }
  subpages.sort((a, b) => byOrder(SUBPAGE_ORDER)(a.href, b.href));
  return subpages;
}

// Mirrors scripts/folder-sidebar.mjs's DefaultNumberPrefixParser handling
// (e.g. '01-quick-start.md' => doc id '.../quick-start') — duplicated, not
// shared, since that's ESM and this script is CommonJS (same reason
// doxygenSidebarOutputPath is duplicated between sidebars.js and
// sync-external-docs.js).
const IGNORED_PREFIX_PATTERN = /^\d+[-_.]\d+/;
const NUMBER_PREFIX_PATTERN = /^(?:\d+)\s*[-_.]+\s*([^-_.\s].*)$/;

function stripNumberPrefix(filename) {
  if (IGNORED_PREFIX_PATTERN.test(filename)) return filename;
  const match = NUMBER_PREFIX_PATTERN.exec(filename);
  return match ? match[1] : filename;
}

// A guide folder's own sibling files (e.g. Libraries/C++/docs/'s
// 01-environment-setup.md, 02-quick-start.md, ...) — same file set and
// order scripts/folder-sidebar.mjs already builds into the sidebar for
// this same folder, just also rendered as a visible list on that folder's
// own index page (see installLinkListBlock) rather than only in the nav.
function collectFolderGuides(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir).filter((f) => {
    if (isDirectory(path.join(dir, f))) return false;
    if (!/\.mdx?$/.test(f)) return false;
    const base = f.replace(/\.mdx?$/, '');
    return base !== 'index' && base !== 'README';
  });

  const parsed = entries.map((file) => {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    const { data } = matter(raw);
    // These are usually synced guides with no frontmatter at all (see
    // rewriteLinks in sync-external-docs.js) — Docusaurus itself falls
    // back to the page's first H1 as the title/sidebar label in that case,
    // so match that here instead of falling straight to the raw filename.
    const h1 = raw.match(/^#\s+(.+)$/m);
    const label = (typeof data.sidebar_label === 'string' && data.sidebar_label.trim())
      || (typeof data.title === 'string' && data.title.trim())
      || (h1 && h1[1].trim())
      || stripNumberPrefix(file.replace(/\.mdx?$/, ''));
    const position = typeof data.sidebar_position === 'number' ? data.sidebar_position : null;
    return { file, label, position };
  });

  parsed.sort((a, b) => {
    if (a.position != null && b.position != null) return a.position - b.position;
    if (a.position != null) return -1;
    if (b.position != null) return 1;
    return a.file.localeCompare(b.file, undefined, { numeric: true });
  });

  return parsed.map(({ file, label }) => ({ label, href: stripNumberPrefix(file.replace(/\.mdx?$/, '')) }));
}

function findFrontmatterEnd(lines) {
  let dashCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      dashCount += 1;
      if (dashCount === 2) return i;
    }
  }
  return -1;
}

// Every tool leaf page carries a Category + Supported_by badge near the
// top — the natural, consistent spot for a "here's what's under this
// page" list to sit, ahead of any hand-written introduction.
function findLastBadgeLine(lines, fromIndex) {
  let last = -1;
  for (let i = fromIndex; i < lines.length; i += 1) {
    if (/^!\[[^\]]*\]\(https:\/\/img\.shields\.io\/badge\//.test(lines[i].trim())) {
      last = i;
    } else if (last !== -1 && lines[i].trim() !== '') {
      break;
    }
  }
  return last;
}

// A page can prepare its own preferred spot for the list by adding a
// "## Contents" heading (any level) — e.g. a guide folder's own index page
// — checked before falling back to the badges/frontmatter heuristic above.
function findHeadingLine(lines, headingText) {
  const re = new RegExp(`^#+\\s+${escapeRegExp(headingText)}\\s*$`, 'i');
  return lines.findIndex((l) => re.test(l.trim()));
}

// Shared by ensureSubpagesBlock and ensureGuidesBlock: installs (or
// updates, or empties back out) a list of `.subpage-link` boxes between a
// self-managed marker pair. Unlike the category tables, this marker isn't
// expected to pre-exist on every page — most pages will never have
// anything to list here, and adding an always-empty marker block to each
// of them would be pure clutter. So this installs the marker itself the
// first time a page actually has something to list, right after a
// "## Contents" heading if the page has one, else right after the badges,
// else right after the frontmatter — and keeps it up to date (including
// emptying it back out, rather than deleting it) after that.
function installLinkListBlock(indexPath, items, markerKey) {
  const startMarker = START_MARKER(markerKey);
  const endMarker = END_MARKER(markerKey);
  const markerRegex = new RegExp(`${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`);
  const raw = fs.readFileSync(indexPath, 'utf8');
  // Rendered as boxes (".subpage-link" in src/css/custom.css) rather than a
  // plain bullet list — bold uppercase text in a solid blue box is the
  // graphic chart's own documented way to emphasize a short label, not a
  // one-off invention for this list.
  const list = items.length
    ? `<div className="subpage-links">\n${items.map((s) => `  <a className="subpage-link" href="${docHref(s.href)}">${s.label}</a>`).join('\n')}\n</div>`
    : '';
  const block = `${startMarker}\n${list}\n${endMarker}`;

  if (markerRegex.test(raw)) {
    // SUBPAGES/GUIDES come from gitignored, sync-generated folders
    // (API/index.md, docs/*.md) — on a fresh clone before the first full
    // build, or when the Doxygen step failed and sync-external-docs.js
    // warned-and-continued rather than crashing (its own documented
    // behavior), those folders are genuinely missing even though the
    // tracked page still correctly lists them. Rewriting to empty in that
    // case would wipe real, committed content over a transient local build
    // gap — so an empty result never overwrites an already non-empty
    // block; it only ever fills a previously-empty one. A genuine, permanent
    // removal upstream still needs a one-time manual edit here, same as any
    // other stale content a reviewer would catch in the diff.
    if (items.length === 0 && raw.match(markerRegex)[0].includes('subpage-link')) {
      console.warn(
        `[generate-tools-table] ${path.relative(ROOT, indexPath)}: found nothing to list for ${markerKey} this ` +
        `run, but the tracked block isn't empty — leaving it untouched (likely a partial build, e.g. Doxygen ` +
        `not run yet) rather than wiping real content.`
      );
      return;
    }
    const updated = raw.replace(markerRegex, block);
    if (updated !== raw) fs.writeFileSync(indexPath, updated, 'utf8');
    return;
  }

  if (items.length === 0) return;

  const lines = raw.split('\n');
  const frontmatterEnd = findFrontmatterEnd(lines);
  const contentsLine = findHeadingLine(lines, 'Contents');
  const badgeLine = findLastBadgeLine(lines, frontmatterEnd + 1);
  const insertAfter = contentsLine !== -1 ? contentsLine : (badgeLine !== -1 ? badgeLine : frontmatterEnd);
  const before = lines.slice(0, insertAfter + 1);
  const after = lines.slice(insertAfter + 1);
  fs.writeFileSync(indexPath, [...before, '', block, ...after].join('\n'), 'utf8');
}

function ensureSubpagesBlock(indexPath) {
  const toolDir = path.dirname(indexPath);
  const subpages = collectSubpages(toolDir);
  installLinkListBlock(indexPath, subpages, 'SUBPAGES');

  // A subpage that's itself a guide folder (e.g. Libraries/C++/docs/, holding
  // 01-environment-setup.md, 02-quick-start.md, ...) gets the same
  // treatment on ITS OWN index page — a folder with no such siblings
  // (e.g. the generated API/ folder, whose only children are subfolders
  // like classes/groups/indices/structs) yields an empty list, so nothing
  // is added there, same "nothing under, nothing shown" rule as above.
  for (const subpage of subpages) {
    const subpageDir = path.join(toolDir, subpage.href);
    const subpageIndexPath = ['index.mdx', 'index.md']
      .map((ext) => path.join(subpageDir, ext))
      .find((p) => fs.existsSync(p));
    if (!subpageIndexPath) continue;
    installLinkListBlock(subpageIndexPath, collectFolderGuides(subpageDir), 'GUIDES');
  }
}

// product: { title, href, indexPath,
//            tools: { Libraries: { toolTitle -> {href, localHref, categoryLocalHref, badge} }, ... } }
const products = [];
const categoryColumns = {};
for (const catKey of CATEGORIES) categoryColumns[catKey] = new Set();

for (const hardwareName of fs.readdirSync(DRIVERS_DIR).sort()) {
  const hardwareDir = path.join(DRIVERS_DIR, hardwareName);
  if (!isDirectory(hardwareDir)) continue;

  const hardwareIndex = path.join(hardwareDir, 'index.mdx');
  if (!fs.existsSync(hardwareIndex)) continue;

  const product = {
    title: readFrontmatterTitle(fs.readFileSync(hardwareIndex, 'utf8')) || hardwareName,
    href: docHref('drivers', hardwareName),
    indexPath: hardwareIndex,
    tools: {},
  };
  for (const catKey of CATEGORIES) product.tools[catKey] = {};

  const addTool = (tool) => {
    ensureSubpagesBlock(tool.indexPath);

    if (!CATEGORIES.includes(tool.category)) return; // unknown category badge — ignore

    categoryColumns[tool.category].add(tool.title);
    product.tools[tool.category][tool.title] = {
      href: docHref('drivers', hardwareName, ...tool.relSegments),
      localHref: docHref(...tool.relSegments),
      // Relative to the category's own <Category>/index.mdx landing page
      // (Libraries/index.mdx, Simulation/index.mdx, Other/index.mdx —
      // ROS has none, see the header comment, so this field is simply
      // unused for it) rather than the product's top-level index.mdx —
      // every other product-page category gets one of these once it
      // actually has any tools, one level below the product root, so
      // this only ever needs to drop that one leading segment.
      categoryLocalHref: docHref(...tool.relSegments.slice(1)),
      badge: readCompactBadge(tool.raw),
    };
  };

  for (const tool of collectToolPages(hardwareDir, hardwareDir)) addTool(tool);

  products.push(product);
}

function byOrder(order) {
  return (a, b) => {
    const ra = order.indexOf(a);
    const rb = order.indexOf(b);
    if (ra === -1 && rb === -1) return a.localeCompare(b);
    if (ra === -1) return 1;
    if (rb === -1) return -1;
    return ra - rb;
  };
}

// hrefField picks which of a tool's precomputed hrefs to link to:
//  - 'href'              — root-relative, for docs/intro.mdx
//  - 'localHref'          — relative to the product's own index.mdx (a
//                           category with zero tools for this product,
//                           still rendered there as a placeholder — no
//                           dedicated subpage exists to link into)
//  - 'categoryLocalHref'  — relative to that category's own dedicated
//                           <Category>/index.mdx landing page
function buildCategoryTable(catKey, productList, { hrefField = 'href' } = {}) {
  const columns = [...categoryColumns[catKey]].sort(byOrder(COLUMN_ORDER[catKey] || []));
  const relevant = productList.filter((p) => Object.keys(p.tools[catKey]).length > 0);
  if (!columns.length || !relevant.length) return null;

  const header = `| Product | ${columns.join(' | ')} |`;
  const separator = `|${'---|'.repeat(columns.length + 1)}`;
  const rows = relevant.map((p) => {
    const cells = columns.map((col) => {
      const tool = p.tools[catKey][col];
      if (!tool) return '-';
      const href = tool[hrefField];
      return tool.badge ? `[${tool.badge}](${href})` : `[${col}](${href})`;
    });
    const productCell = hrefField === 'href' ? `[${p.title}](${p.href})` : p.title;
    return `| ${productCell} | ${cells.join(' | ')} |`;
  });

  return [header, separator, ...rows].join('\n');
}

function legendFor(catKey) {
  return [...categoryColumns[catKey]]
    .sort(byOrder(COLUMN_ORDER[catKey] || []))
    .filter((col) => COLUMN_DESCRIPTIONS[col])
    .map((col) => `- **${col}** — ${COLUMN_DESCRIPTIONS[col]}`)
    .join('\n');
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// When a category has no tools, writes nothing at all between its markers
// — not even a "not documented yet" placeholder — so the whole section,
// heading included, disappears from the rendered page rather than sitting
// there under an empty heading.
function sectionContent(headingLine, table, legend) {
  if (!table) return '';
  const body = [table, legend].filter(Boolean).join('\n\n');
  return headingLine ? [headingLine, body].join('\n\n') : body;
}

function writeBetweenMarkers(filePath, key, content) {
  const startMarker = START_MARKER(key);
  const endMarker = END_MARKER(key);
  const raw = fs.readFileSync(filePath, 'utf8');
  const markerRegex = new RegExp(`${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`);

  if (!markerRegex.test(raw)) {
    throw new Error(
      `[generate-tools-table] Markers not found in ${path.relative(ROOT, filePath)}. Add ${startMarker} and ${endMarker} where the table should be inserted.`
    );
  }

  const block = `${startMarker}\n${content}\n${endMarker}`;
  fs.writeFileSync(filePath, raw.replace(markerRegex, block), 'utf8');
}

// --- docs/intro.mdx: one table per category, across all products ---

for (const catKey of CATEGORIES) {
  const table = buildCategoryTable(catKey, products, { hrefField: 'href' });
  const legend = table ? legendFor(catKey) : '';
  writeBetweenMarkers(INTRO_FILE, catKey.toUpperCase(), sectionContent(INTRO_HEADING[catKey], table, legend));
}

console.log(`[generate-tools-table] Wrote ${CATEGORIES.length} category tables to docs/intro.mdx`);

// --- every category gets the exact SAME treatment on the product's own
//     index.mdx: an inline single-row table scoped to just that product.
//     AND, once the product actually has any tools in that category AND
//     it's one of LANDING_PAGE_CATEGORIES, the same table again on that
//     category's own dedicated `<Category>/index.mdx` landing page
//     (hand-authored, this script only fills in its table, never creates
//     the page itself, so a category's first tool needs that file
//     created once by hand) — the product page's own table is a quick,
//     at-a-glance summary, and the dedicated page is what a click on that
//     category in the sidebar actually lands on. ROS never gets this
//     second step: its own `<Category>/index.mdx` IS the leaf tool page
//     (see the header comment), not a landing page for this script to
//     fill in. ---

function writeProductCategoryTable(product, catKey, markerKey) {
  const hasTools = Object.keys(product.tools[catKey]).length > 0;
  const table = buildCategoryTable(catKey, [product], { hrefField: 'localHref' });
  const legend = table ? legendFor(catKey) : '';
  writeBetweenMarkers(product.indexPath, markerKey, sectionContent(PRODUCT_HEADING[catKey], table, legend));
  return hasTools;
}

function writeCategoryLandingTable(product, catKey, markerKey, landingPath, missingFileHint) {
  if (!fs.existsSync(landingPath)) {
    throw new Error(
      `[generate-tools-table] ${path.relative(ROOT, product.indexPath)} has ${catKey} tool pages but ` +
      `${path.relative(ROOT, landingPath)} does not exist. ${missingFileHint}`
    );
  }
  const table = buildCategoryTable(catKey, [product], { hrefField: 'categoryLocalHref' });
  const legend = table ? legendFor(catKey) : '';
  writeBetweenMarkers(landingPath, markerKey, sectionContent(null, table, legend));
}

for (const product of products) {
  for (const catKey of CATEGORIES) {
    const markerKey = `PRODUCT-${catKey.toUpperCase()}`;
    const hasTools = writeProductCategoryTable(product, catKey, markerKey);
    if (!hasTools || !LANDING_PAGE_CATEGORIES.includes(catKey)) continue;

    const categoryIndexPath = path.join(path.dirname(product.indexPath), catKey, 'index.mdx');
    writeCategoryLandingTable(
      product, catKey, markerKey, categoryIndexPath,
      `Create it with an AUTO-GENERATED-${markerKey}-TABLE marker pair.`
    );
  }
  console.log(`[generate-tools-table] Wrote category tables for ${path.relative(ROOT, path.dirname(product.indexPath))}`);
}
