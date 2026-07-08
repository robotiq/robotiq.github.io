// Regenerates the software-tools tables by scanning docs/drivers/:
//  - one table per category (SDK, Physics Engine, Other) in docs/intro.mdx
//    and on each product's own index.mdx, all products x tools in that category
//  - one distro-compatibility table per ROS generation (ROS2, ROS1) in
//    docs/intro.mdx and on each product's own index.mdx, all products x distros
//
// Each product (hardware) is a folder under docs/drivers/ with its own
// index.mdx (frontmatter title = row label). Underneath, tool pages are
// found by walking the folder tree until an index.mdx with a
// `Category-<Name>` shields.io badge is found — that page is a leaf ("tool")
// classified into that category, regardless of how deep it's nested (e.g.
// docs/drivers/<product>/SDK/Python/index.mdx or docs/drivers/<product>/ROS/ROS2/index.mdx).
// Plain folders in between (SDK/, ROS/, Physics Engine/) are just containers.
//
// Non-ROS tool pages carry a single `Supported_by-<Label>-<Color>` badge,
// shown compactly as the table cell.
//
// ROS tool pages (Category-ROS1 / Category-ROS2) instead carry one or more
// `Distro-<Name>` badges, each immediately followed by its own
// `Supported_by-<Label>-<Color>` badge — one pair per ROS distro that page
// supports. Those pairs become the columns of the ROS compatibility table.
//
// Add a new hardware folder, tool page, or distro badge under docs/drivers/
// and every table picks it up automatically on the next `npm start` / `npm run build`.

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const ROOT = path.resolve(__dirname, '..');
const DRIVERS_DIR = path.join(ROOT, 'docs', 'drivers');
const INTRO_FILE = path.join(ROOT, 'docs', 'intro.mdx');

// Non-ROS categories: rendered as a plain "product x tool" table.
const CATEGORIES = ['SDK', 'Physics_Engine', 'Other'];
const CATEGORY_DISPLAY = {
  SDK: 'SDK',
  Physics_Engine: 'Physics Engine',
  Other: 'Other',
};
const NO_PRODUCTS_MESSAGE = {
  SDK: '_No SDK drivers documented yet._',
  Physics_Engine: '_No physics engine integrations documented yet._',
  Other: '_No other community integrations documented yet._',
};

// ROS categories: rendered as a "product x distro" compatibility table.
const ROS_CATEGORIES = ['ROS2', 'ROS1'];
const NO_ROS_MESSAGE = {
  ROS2: '_No products currently support ROS 2._',
  ROS1: '_No products currently support ROS 1._',
};

// Preferred left-to-right column/distro order. Anything not listed here
// still appears automatically — it's just sorted alphabetically after these.
const COLUMN_ORDER = {
  SDK: ['C', 'C++', 'Python'],
  Physics_Engine: ['Isaac Sim', 'PyBullet'],
  Other: [],
};
const DISTRO_ORDER = {
  ROS2: ['Foxy', 'Galactic', 'Humble', 'Iron', 'Jazzy', 'Rolling'],
  ROS1: ['Indigo', 'Jade', 'Kinetic', 'Melodic', 'Noetic'],
};

// One-line description shown in the legend below each ROS compatibility
// table. A distro missing here still gets its own column — it just has no
// legend entry until one is added.
const DISTRO_DESCRIPTIONS = {
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
};

// One-line description shown in the legend below each category table. A
// column missing here still appears — it just has no legend entry.
const COLUMN_DESCRIPTIONS = {
  'C': 'Low-level C driver talking directly to the hardware\'s communication protocol (e.g. Modbus RTU, serial).',
  'C++': 'Low-level C++ driver/SDK for direct hardware integration.',
  'Python': 'Python driver/SDK for scripting and rapid prototyping.',
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

// Reads each Distro badge paired with the Supported_by badge immediately
// following it — one pair per ROS distro the page supports.
function readDistroSupportPairs(raw) {
  const pairs = [];
  const re = /badge\/Distro-([A-Za-z0-9_]+)-[A-Za-z0-9]+\)[\s\S]*?badge\/Supported_by-([A-Za-z0-9_]+)-([A-Za-z0-9]+)\)/g;
  let m;
  while ((m = re.exec(raw))) {
    const [, distro, label, color] = m;
    const displayLabel = label.replace(/_/g, ' ');
    pairs.push({
      distro: distro.replace(/_/g, ' '),
      badge: `![${displayLabel}](https://img.shields.io/badge/${label}-${color})`,
    });
  }
  return pairs;
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

// product: { title, href, indexPath, tools: { SDK: { toolTitle -> {href, localHref, badge} }, ... },
//            ros: { ROS2: {href, localHref, pairs: [{distro, badge}]}, ... } }
const products = [];
const categoryColumns = { SDK: new Set(), Physics_Engine: new Set(), Other: new Set() };
const rosDistros = { ROS2: new Set(), ROS1: new Set() };

for (const hardwareName of fs.readdirSync(DRIVERS_DIR).sort()) {
  const hardwareDir = path.join(DRIVERS_DIR, hardwareName);
  if (!isDirectory(hardwareDir)) continue;

  const hardwareIndex = path.join(hardwareDir, 'index.mdx');
  if (!fs.existsSync(hardwareIndex)) continue;

  const product = {
    title: readFrontmatterTitle(fs.readFileSync(hardwareIndex, 'utf8')) || hardwareName,
    href: docHref('drivers', hardwareName),
    indexPath: hardwareIndex,
    tools: { SDK: {}, Physics_Engine: {}, Other: {} },
    ros: {},
  };

  for (const tool of collectToolPages(hardwareDir, hardwareDir)) {
    const href = docHref('drivers', hardwareName, ...tool.relSegments);
    const localHref = docHref(...tool.relSegments);

    if (tool.category === 'ROS1' || tool.category === 'ROS2') {
      const pairs = readDistroSupportPairs(tool.raw);
      product.ros[tool.category] = { href, localHref, pairs };
      pairs.forEach((p) => rosDistros[tool.category].add(p.distro));
      continue;
    }

    if (!CATEGORIES.includes(tool.category)) continue; // unknown category badge — ignore
    categoryColumns[tool.category].add(tool.title);
    product.tools[tool.category][tool.title] = {
      href,
      localHref,
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

function buildCategoryTable(catKey, productList, { local } = {}) {
  const columns = [...categoryColumns[catKey]].sort(byOrder(COLUMN_ORDER[catKey] || []));
  const relevant = productList.filter((p) => Object.keys(p.tools[catKey]).length > 0);
  if (!columns.length || !relevant.length) return null;

  const header = `| Product | ${columns.join(' | ')} |`;
  const separator = `|${'---|'.repeat(columns.length + 1)}`;
  const rows = relevant.map((p) => {
    const cells = columns.map((col) => {
      const tool = p.tools[catKey][col];
      if (!tool) return '-';
      const href = local ? tool.localHref : tool.href;
      return tool.badge ? `[${tool.badge}](${href})` : `[${col}](${href})`;
    });
    const productCell = local ? p.title : `[${p.title}](${p.href})`;
    return `| ${productCell} | ${cells.join(' | ')} |`;
  });

  return [header, separator, ...rows].join('\n');
}

function buildRosTable(rosKey, productList, { local } = {}) {
  const distros = [...rosDistros[rosKey]].sort(byOrder(DISTRO_ORDER[rosKey] || []));
  const relevant = productList.filter((p) => p.ros[rosKey]);
  if (!distros.length || !relevant.length) return null;

  const header = `| ${rosKey} | ${distros.join(' | ')} |`;
  const separator = `|${'---|'.repeat(distros.length + 1)}`;
  const rows = relevant.map((p) => {
    const entry = p.ros[rosKey];
    const href = local ? entry.localHref : entry.href;
    const cells = distros.map((distro) => {
      const pair = entry.pairs.find((pp) => pp.distro === distro);
      return pair ? `[${pair.badge}](${href})` : '-';
    });
    const productCell = local ? p.title : `[${p.title}](${p.href})`;
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

function legendForRos(rosKey) {
  return [...rosDistros[rosKey]]
    .sort(byOrder(DISTRO_ORDER[rosKey] || []))
    .filter((distro) => DISTRO_DESCRIPTIONS[distro])
    .map((distro) => `- **${distro}** — ${DISTRO_DESCRIPTIONS[distro]}`)
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
  const table = buildCategoryTable(catKey, products, { local: false });
  const legend = table ? legendFor(catKey) : '';
  const content = table ? [table, legend].filter(Boolean).join('\n\n') : NO_PRODUCTS_MESSAGE[catKey];
  writeBetweenMarkers(INTRO_FILE, catKey.toUpperCase(), content);
}

for (const rosKey of ROS_CATEGORIES) {
  const table = buildRosTable(rosKey, products, { local: false });
  const legend = table ? legendForRos(rosKey) : '';
  const content = table ? [table, legend].filter(Boolean).join('\n\n') : NO_ROS_MESSAGE[rosKey];
  writeBetweenMarkers(INTRO_FILE, rosKey, content);
}

console.log(`[generate-tools-table] Wrote ${CATEGORIES.length + ROS_CATEGORIES.length} category tables to docs/intro.mdx`);

// --- each product's own index.mdx: same tables, scoped to that one product ---

for (const product of products) {
  for (const catKey of CATEGORIES) {
    const table = buildCategoryTable(catKey, [product], { local: true });
    const legend = table ? legendFor(catKey) : '';
    const content = table ? [table, legend].filter(Boolean).join('\n\n') : NO_PRODUCTS_MESSAGE[catKey];
    writeBetweenMarkers(product.indexPath, `PRODUCT-${catKey.toUpperCase()}`, content);
  }
  for (const rosKey of ROS_CATEGORIES) {
    const table = buildRosTable(rosKey, [product], { local: true });
    const legend = table ? legendForRos(rosKey) : '';
    const content = table ? [table, legend].filter(Boolean).join('\n\n') : NO_ROS_MESSAGE[rosKey];
    writeBetweenMarkers(product.indexPath, `PRODUCT-${rosKey}`, content);
  }
  console.log(`[generate-tools-table] Wrote category tables to ${path.relative(ROOT, product.indexPath)}`);
}
