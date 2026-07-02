// Regenerates:
//  - the software tools overview table in docs/intro.mdx (all products x all tools)
//  - a single-row version of that same table on each product's own index.mdx
// by scanning docs/drivers/. Each row is a product (hardware), taken from its
// index.mdx frontmatter title. Each column is a software framework/language
// (C, C++, Python, ROS, ...), taken from the title of each tool subfolder's
// index.mdx found across all products. Each cell shows that tool's own
// shields.io support badge, linking to its documentation page.
//
// Add a new hardware or tool page under docs/drivers/ and both tables pick
// it up automatically on the next `npm start` / `npm run build`.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRIVERS_DIR = path.join(ROOT, 'docs', 'drivers');
const INTRO_FILE = path.join(ROOT, 'docs', 'intro.mdx');

const START_MARKER = '{/* AUTO-GENERATED-TOOLS-TABLE:START */}';
const END_MARKER = '{/* AUTO-GENERATED-TOOLS-TABLE:END */}';

const PRODUCT_START_MARKER = '{/* AUTO-GENERATED-PRODUCT-TOOLS-TABLE:START */}';
const PRODUCT_END_MARKER = '{/* AUTO-GENERATED-PRODUCT-TOOLS-TABLE:END */}';

// Preferred left-to-right column order. Any tool title not listed here still
// appears automatically — it's just sorted alphabetically after these.
const COLUMN_ORDER = ['C', 'C++', 'Python', 'ROS', 'Isaac Sim', 'PyBullet'];

// One-line description shown in the legend below the table. A tool title
// missing here still gets its own column — it just has no legend entry
// until one is added.
const COLUMN_DESCRIPTIONS = {
  'C': 'Low-level C driver talking directly to the hardware\'s communication protocol (e.g. Modbus RTU, serial).',
  'C++': 'Low-level C++ driver/SDK for direct hardware integration.',
  'Python': 'Python driver/SDK for scripting and rapid prototyping.',
  'ROS': 'ROS 2 package exposing the hardware as nodes, topics, and services.',
  'Isaac Sim': 'NVIDIA Isaac Sim integration for simulating the hardware.',
  'PyBullet': 'PyBullet integration for physics-based simulation.',
};

function readFrontmatterTitle(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const frontmatter = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatter) return null;
  const title = frontmatter[1].match(/^title:\s*(.+)$/m);
  return title ? title[1].trim() : null;
}

// Reads the page's own "Supported by <Label>" badge and returns a compact
// version for the table — same label/color, without the "Supported by"
// prefix — so the table stays dense. The source page's badge is untouched.
function readCompactBadge(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const badge = raw.match(/badge\/Supported_by-([A-Za-z0-9_]+)-([A-Za-z0-9]+)/);
  if (!badge) return null;
  const [, label, color] = badge;
  const displayLabel = label.replace(/_/g, ' ');
  return `![${displayLabel}](https://img.shields.io/badge/${label}-${color})`;
}

function docHref(...segments) {
  // Only spaces need escaping to keep the link valid Markdown; other
  // characters (e.g. the "+" in "C++") must stay literal to match the
  // page's actual URL.
  return segments.map((s) => s.replace(/ /g, '%20')).join('/');
}

function isDirectory(p) {
  return fs.statSync(p).isDirectory();
}

// product name -> { title, href, tools: { toolTitle -> { href, badge } } }
const products = [];
const toolTitles = new Set();

for (const hardwareName of fs.readdirSync(DRIVERS_DIR).sort()) {
  const hardwareDir = path.join(DRIVERS_DIR, hardwareName);
  if (!isDirectory(hardwareDir)) continue;

  const hardwareIndex = path.join(hardwareDir, 'index.mdx');
  if (!fs.existsSync(hardwareIndex)) continue;

  const product = {
    title: readFrontmatterTitle(hardwareIndex) || hardwareName,
    href: docHref('drivers', hardwareName),
    indexPath: hardwareIndex,
    tools: {},
  };

  for (const toolName of fs.readdirSync(hardwareDir).sort()) {
    const toolDir = path.join(hardwareDir, toolName);
    if (!isDirectory(toolDir)) continue;

    const toolIndex = path.join(toolDir, 'index.mdx');
    if (!fs.existsSync(toolIndex)) continue;

    const toolTitle = readFrontmatterTitle(toolIndex) || toolName;
    toolTitles.add(toolTitle);
    product.tools[toolTitle] = {
      // Root-relative — correct from docs/intro.mdx.
      href: docHref('drivers', hardwareName, toolName),
      // Page-relative — correct from the product's own index.mdx, which
      // already lives inside docs/drivers/<hardwareName>/.
      localHref: docHref(toolName),
      badge: readCompactBadge(toolIndex),
    };
  }

  products.push(product);
}

const columns = [...toolTitles].sort((a, b) => {
  const rankA = COLUMN_ORDER.indexOf(a);
  const rankB = COLUMN_ORDER.indexOf(b);
  if (rankA === -1 && rankB === -1) return a.localeCompare(b);
  if (rankA === -1) return 1;
  if (rankB === -1) return -1;
  return rankA - rankB;
});

function productRow(product) {
  const cells = columns.map((col) => {
    const tool = product.tools[col];
    if (!tool) return '-';
    return tool.badge ? `[${tool.badge}](${tool.href})` : `[${col}](${tool.href})`;
  });
  return `| [${product.title}](${product.href}) | ${cells.join(' | ')} |`;
}

// Same row, but for embedding on the product's own index.mdx: tool links
// are page-relative (no "drivers/<product>/" prefix, which would double up
// with the current page's own path) and the product cell isn't a link,
// since it's the current page.
function productRowLocal(product) {
  const cells = columns.map((col) => {
    const tool = product.tools[col];
    if (!tool) return '-';
    return tool.badge ? `[${tool.badge}](${tool.localHref})` : `[${col}](${tool.localHref})`;
  });
  return `| ${product.title} | ${cells.join(' | ')} |`;
}

const headerRow = `| Product | ${columns.join(' | ')} |`;
const separatorRow = `|${'---|'.repeat(columns.length + 1)}`;
const bodyRows = products.map(productRow);

const table = [headerRow, separatorRow, ...bodyRows].join('\n');

const legend = columns
  .filter((col) => COLUMN_DESCRIPTIONS[col])
  .map((col) => `- **${col}** — ${COLUMN_DESCRIPTIONS[col]}`)
  .join('\n');

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function writeBetweenMarkers(filePath, startMarker, endMarker, content) {
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

writeBetweenMarkers(INTRO_FILE, START_MARKER, END_MARKER, `${table}\n\n${legend}`);
console.log(`[generate-tools-table] Wrote ${products.length} products x ${columns.length} tools to docs/intro.mdx`);

for (const product of products) {
  const productTable = [headerRow, separatorRow, productRowLocal(product)].join('\n');
  writeBetweenMarkers(product.indexPath, PRODUCT_START_MARKER, PRODUCT_END_MARKER, productTable);
  console.log(`[generate-tools-table] Wrote tools table to ${path.relative(ROOT, product.indexPath)}`);
}
