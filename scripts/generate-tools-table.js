// Regenerates the software-tools tables by scanning docs/drivers/:
//  - one table per category (SDK, ROS2, ROS1, Physics Engine, Other) in
//    docs/intro.mdx, all products x tools in that category
//  - the same SDK / Physics Engine / Other tables, single-row versions
//    scoped to just that product, on each product's own index.mdx
//  - the same ROS2 / ROS1 tables, single-row versions scoped to just that
//    product, on each product's ROS/index.mdx
//
// Each product (hardware) is a folder under docs/drivers/ with its own
// index.mdx (frontmatter title = row label). Underneath, tool pages are
// found by walking the folder tree until an index.mdx with a
// `Category-<Name>` shields.io badge is found — that page is a leaf ("tool")
// classified into that category, regardless of how deep it's nested (e.g.
// docs/drivers/<product>/SDK/Python/index.mdx or
// docs/drivers/<product>/ROS/ROS2-Humble/index.mdx). Plain folders in
// between (SDK/, ROS/, Physics Engine/) are just containers — except ROS/
// itself, which also carries its own index.mdx (no Category badge, so it's
// still treated as a container), the landing page that receives the ROS2 /
// ROS1 tables.
//
// A ROS tool page is a single distro (title = distro name, e.g. "Humble"),
// carrying a `Category-ROS1` or `Category-ROS2` badge — otherwise identical
// to a non-ROS tool page (one `Supported_by-<Label>-<Color>` badge). A
// product supporting several distros gets one leaf folder per distro (e.g.
// `ROS/ROS2-Humble/`, `ROS/ROS2-Iron/`) instead of one page listing many.
//
// Add a new hardware folder, tool page, or distro page under docs/drivers/
// and every table picks it up automatically on the next `npm start` / `npm run build`.

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const ROOT = path.resolve(__dirname, '..');
const DRIVERS_DIR = path.join(ROOT, 'docs', 'drivers');
const INTRO_FILE = path.join(ROOT, 'docs', 'intro.mdx');

// Categories, in the order their tables appear on docs/intro.mdx. Every
// category — ROS1/ROS2 included — is rendered the same way: a plain
// "product x tool" table, one column per distinct tool `title` found under
// that category's leaf pages.
const CATEGORIES = ['SDK', 'ROS2', 'ROS1', 'Physics_Engine', 'Other'];
const NO_PRODUCTS_MESSAGE = {
  SDK: '_No SDK drivers documented yet._',
  ROS2: '_No products currently support ROS 2._',
  ROS1: '_No products currently support ROS 1._',
  Physics_Engine: '_No physics engine integrations documented yet._',
  Other: '_No other community integrations documented yet._',
};

// Categories whose tables live on the product's own index.mdx, vs. on its
// ROS/index.mdx landing page (see "each product's ROS/index.mdx" below).
const PRODUCT_PAGE_CATEGORIES = ['SDK', 'Physics_Engine', 'Other'];
const PRODUCT_ROS_CATEGORIES = ['ROS2', 'ROS1'];

// Preferred left-to-right column order. Anything not listed here still
// appears automatically — it's just sorted alphabetically after these.
const COLUMN_ORDER = {
  SDK: ['C', 'C++', 'Python'],
  ROS2: ['Rolling', 'Jazzy', 'Iron', 'Humble', 'Galactic', 'Foxy'],
  ROS1: ['Noetic', 'Melodic', 'Kinetic', 'Jade', 'Indigo'],
  Physics_Engine: ['Isaac Sim', 'PyBullet'],
  Other: [],
};

// One-line description shown in the legend below each category table. A
// column missing here still appears — it just has no legend entry.
const COLUMN_DESCRIPTIONS = {
  'C': 'Low-level C driver talking directly to the hardware\'s communication protocol (e.g. Modbus RTU, serial).',
  'C++': 'Low-level C++ driver/SDK for direct hardware integration.',
  'Python': 'Python driver/SDK for scripting and rapid prototyping.',
  'Foxy': 'ROS 2 LTS release (2020), end of life.',
  'Galactic': 'ROS 2 release (2021), end of life.',
  'Humble': 'ROS 2 LTS release (2022), supported until 2027.',
  'Iron': 'ROS 2 release (2023), end of life.',
  'Jazzy': 'ROS 2 LTS release (2024), supported until 2029.',
  'Rolling': 'ROS 2 rolling development distro, always tracking the latest sources.',
  'Indigo': 'ROS 1 release (2014), end of life.',
  'Jade': 'ROS 1 release (2015), end of life.',
  'Kinetic': 'ROS 1 release (2016), end of life.',
  'Melodic': 'ROS 1 release (2018), end of life.',
  'Noetic': 'Final ROS 1 release (2020), end of life May 2025.',
  'Isaac Sim': 'NVIDIA Isaac Sim integration for simulating the hardware.',
  'PyBullet': 'PyBullet integration for physics-based simulation.',
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
// a Category badge. Recurses through plain container folders (SDK/, ROS/,
// Physics Engine/, ...) that have no such index.mdx of their own.
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

// product: { title, href, indexPath, rosIndexPath,
//            tools: { SDK: { toolTitle -> {href, localHref, rosLocalHref, badge} }, ... } }
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
    rosIndexPath: path.join(hardwareDir, 'ROS', 'index.mdx'),
    tools: {},
  };
  for (const catKey of CATEGORIES) product.tools[catKey] = {};

  for (const tool of collectToolPages(hardwareDir, hardwareDir)) {
    if (!CATEGORIES.includes(tool.category)) continue; // unknown category badge — ignore

    categoryColumns[tool.category].add(tool.title);
    product.tools[tool.category][tool.title] = {
      href: docHref('drivers', hardwareName, ...tool.relSegments),
      localHref: docHref(...tool.relSegments),
      // Relative to the product's ROS/index.mdx rather than its top-level
      // index.mdx — only meaningful (and only used) for ROS1/ROS2 tools,
      // which always live one level deeper, under ROS/.
      rosLocalHref: docHref(...tool.relSegments.slice(1)),
      badge: readCompactBadge(tool.raw),
    };
  }

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
//  - 'href'         — root-relative, for docs/intro.mdx
//  - 'localHref'    — relative to the product's own index.mdx
//  - 'rosLocalHref' — relative to the product's ROS/index.mdx
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
  const content = table ? [table, legend].filter(Boolean).join('\n\n') : NO_PRODUCTS_MESSAGE[catKey];
  writeBetweenMarkers(INTRO_FILE, catKey.toUpperCase(), content);
}

console.log(`[generate-tools-table] Wrote ${CATEGORIES.length} category tables to docs/intro.mdx`);

// --- each product's own index.mdx: SDK / Physics Engine / Other tables,
//     single-row versions scoped to just that product ---

for (const product of products) {
  for (const catKey of PRODUCT_PAGE_CATEGORIES) {
    const table = buildCategoryTable(catKey, [product], { hrefField: 'localHref' });
    const legend = table ? legendFor(catKey) : '';
    const content = table ? [table, legend].filter(Boolean).join('\n\n') : NO_PRODUCTS_MESSAGE[catKey];
    writeBetweenMarkers(product.indexPath, `PRODUCT-${catKey.toUpperCase()}`, content);
  }
  console.log(`[generate-tools-table] Wrote category tables to ${path.relative(ROOT, product.indexPath)}`);

  // --- each product's ROS/index.mdx: ROS2 / ROS1 tables, single-row
  //     versions scoped to just that product ---

  const hasRosTools = PRODUCT_ROS_CATEGORIES.some((k) => Object.keys(product.tools[k]).length > 0);
  if (!hasRosTools) continue;

  if (!fs.existsSync(product.rosIndexPath)) {
    throw new Error(
      `[generate-tools-table] ${path.relative(ROOT, product.indexPath)} has ROS tool pages but ` +
      `${path.relative(ROOT, product.rosIndexPath)} does not exist. Create it with ` +
      `AUTO-GENERATED-PRODUCT-ROS2-TABLE and AUTO-GENERATED-PRODUCT-ROS1-TABLE marker pairs.`
    );
  }
  for (const catKey of PRODUCT_ROS_CATEGORIES) {
    const table = buildCategoryTable(catKey, [product], { hrefField: 'rosLocalHref' });
    const legend = table ? legendFor(catKey) : '';
    const content = table ? [table, legend].filter(Boolean).join('\n\n') : NO_PRODUCTS_MESSAGE[catKey];
    writeBetweenMarkers(product.rosIndexPath, `PRODUCT-${catKey}`, content);
  }
  console.log(`[generate-tools-table] Wrote ROS tables to ${path.relative(ROOT, product.rosIndexPath)}`);
}
