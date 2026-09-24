// Copies content from git submodules into the Docusaurus docs tree.
// Supports single files and full folders. Add new repos to JOBS below.
//
// Single-file job: all relative links become absolute GitHub URLs.
// Folder job: links within the copied folder stay relative;
//             links escaping the folder become absolute GitHub URLs.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Reset all submodules to the committed state before syncing, so local edits
// inside external/ never silently affect the build. Set SKIP_SUBMODULE_RESET=1
// to opt out temporarily — e.g. to preview uncommitted edits (or a locally
// generated API reference) from a tool repo you're actively working on. See
// "Previewing local edits to a submodule" in docs/contribute/index.mdx.
if (process.env.SKIP_SUBMODULE_RESET === '1') {
  console.warn('[sync-external-docs] SKIP_SUBMODULE_RESET=1 — using external/ as-is; local edits will NOT be reset. Do not use this for a real build.');
} else {
  try {
    execSync('git submodule update --init --force', { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.warn('[sync-external-docs] git submodule update failed — continuing with current state');
  }
}

// Jobs live in external-jobs.js (shared with preview-external-docs.js) —
// add new repos there.
const JOBS = require('./external-jobs');

// A job with a `doxygen2docusaurus` field (instead of `from`) is a
// Doxygen-generated API reference — runs once the submodule has a Doxyfile
// (GENERATE_XML=YES) and Doxygen-style comments. See "C++ — Doxygen +
// doxygen2docusaurus" in docs/contribute/api-reference-cpp.mdx. Requires
// Doxygen on PATH; doxygen2docusaurus itself is a
// normal npm devDependency (@xpack/doxygen2docusaurus).
//
// Staged in a scratch folder at the repo root (gitignored), never written
// straight into docs/ — doxygen2docusaurus wipes its whole output folder on
// every run, and this script still needs to run its own post-processing
// passes (stripping private sections, merging member tables, fixing dead
// links, ...) on the raw output before it becomes the final docs/ content,
// plus prune whatever the previous run left behind that the submodule no
// longer has. Every page under this job comes straight from the submodule —
// there is no hand-authored content of this site's own to protect here.
//
// `apiFolderPath`/`apiBaseUrl` drive every generated slug, sidebar doc id,
// and internal cross-reference link doxygen2docusaurus bakes in — for a job
// on the single default docs instance, that's the job's own `to` (this
// site's real mount point, e.g. 'drivers/Adaptive grippers/Libraries/C++/API'),
// so nothing needs post-hoc rewriting: the file lands at exactly the path
// its own baked-in links already assume. A job with `destRoot` (its own
// versioned plugin instance — see draft/documentation-versioning.md) is
// different: `apiBaseUrl` there is just the instance-relative tail (e.g.
// 'API'), since the instance's own `routeBasePath` already supplies
// everything before it — doxygen2docusaurus's own slug/id construction
// doesn't know that, so runDoxygen2Docusaurus additionally sets
// `docsBaseUrl` to the instance's full routeBasePath (for the *absolute*
// `<a href="/docs/...">` backlinks doxygen2docusaurus bakes into raw HTML,
// which — unlike a Docusaurus slug — never gets combined with routeBasePath
// automatically) and this script's own downstream helpers (everything from
// here down that reads or constructs a `/docs/...`-shaped path) read
// `currentRoutePrefix`/`currentDocsRoot` instead of hardcoding `/docs` or
// `docs/`. Module-level, not threaded as parameters, because this whole
// pipeline only ever processes one job at a time, strictly sequentially —
// see where runDoxygen2Docusaurus sets them, right before doing any work.
const DOXYGEN2DOCUSAURUS_STAGING_DIR = path.join(ROOT, '.doxygen2docusaurus-staging');
const DOXYGEN2DOCUSAURUS_CONFIG_PATH = path.join(ROOT, 'doxygen2docusaurus.json');
const DOXYGEN2DOCUSAURUS_BIN = require.resolve('@xpack/doxygen2docusaurus/bin/doxygen2docusaurus.js');

let currentDocsRoot = path.join(ROOT, 'docs');
let currentRoutePrefix = '/docs';

// Where sidebars.js reads the (pruned) generated sidebar subtree from —
// stable path, checked into .gitignore, regenerated on every sync.
function doxygenSidebarOutputPath(apiFolderPath) {
  // Collapsing every non-alphanumeric run to one '-' is lossy — e.g.
  // 'drivers/Force Torque Sensor/Libraries/C++/API' and
  // 'drivers/Force Torque Sensor/Libraries/C/API' both become
  // 'drivers-Force-Torque-Sensor-Libraries-C-API' ('/' and '+' collapse identically), so a
  // second doxygen2docusaurus job for a plain C driver alongside a C++ one
  // would silently overwrite the first job's sidebar file with no error.
  // A short content hash of the real, un-collapsed path guarantees two
  // different `apiFolderPath`s never collide, whatever characters either
  // contains, while the collapsed name stays for readability.
  const safeName = apiFolderPath.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const hash = crypto.createHash('sha1').update(apiFolderPath).digest('hex').slice(0, 8);
  return path.join(ROOT, 'scripts', 'generated', `doxygen-sidebar-${safeName}-${hash}.json`);
}

// Matches a sidebar node's doc `id` (or its `link.id`) against the job's
// `exclude` list, using the same relative-path matching rule as a folder
// job's own `exclude` (exact segment or path prefix) — the doc `id` has no
// file extension, so an `exclude` entry naming a file (e.g. 'index.md') is
// compared with its extension stripped.
function pruneDoxygenSidebarNode(node, apiFolderPath, exclude) {
  const nodeId = node.id ?? node.link?.id;
  if (typeof nodeId === 'string' && nodeId.startsWith(`${apiFolderPath}/`)) {
    const rel = nodeId.slice(apiFolderPath.length + 1);
    const isExcluded = (exclude || []).some((ex) => {
      const exNoExt = ex.replace(/\.mdx?$/, '');
      return rel === exNoExt || rel.startsWith(`${exNoExt}/`);
    });
    if (isExcluded) return null;
  }
  if (!Array.isArray(node.items)) return node;
  const items = node.items
    .map((child) => pruneDoxygenSidebarNode(child, apiFolderPath, exclude))
    .filter(Boolean);
  // Drop a category that's left with nothing to show and no page of its own.
  if (items.length === 0 && node.link == null) return null;
  return { ...node, items };
}

// doxygen2docusaurus bakes plain HTML `<a href="/docs/...">` backlinks into
// every documented entity ("Definition at line N of file X", the
// `#include <...>` line, etc.) pointing at its own Files/Folders/Namespaces
// pages — which this job excludes (see external-jobs.js). Left alone,
// Docusaurus's own broken-link check fails the build on every one of them.
// Degrade a link into plain text exactly when its target falls under an
// excluded path — same "don't ship a dead link" rule rewriteLinks already
// applies to relative markdown-style links from a README-style job.
function stripDeadDoxygenLinks(content, apiFolderPath, exclude) {
  const prefix = `${currentRoutePrefix}/${apiFolderPath}/`;
  return content.replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (match, href, text) => {
    if (!href.startsWith(prefix)) return match;
    // `rel` comes from a URL, so it never has a file extension — but an
    // exclude entry naming a specific file (e.g. 'indices/classes/all.md')
    // does. Same '.mdx?'-stripping normalization pruneDoxygenSidebarNode
    // above already applies for exactly this reason; without it here, a
    // cross-reference doxygen2docusaurus emits into one of those excluded
    // pages would never degrade to plain text, and onBrokenLinks: 'throw'
    // would fail the build on it instead.
    const rel = href.slice(prefix.length).split('#')[0];
    const isExcluded = (exclude || []).some((ex) => {
      const exNoExt = ex.replace(/\.mdx?$/, '');
      return rel === exNoExt || rel.startsWith(`${exNoExt}/`);
    });
    return isExcluded ? text : match;
  });
}

// Doxygen's XML always records private members (`prot="private"`), regardless
// of the Doxyfile's EXTRACT_PRIVATE setting — confirmed against this library's own
// generated XML — because the XML backend is meant to give downstream tooling
// the complete structural picture and leaves visibility filtering up to the
// consumer. Doxybook2 (this site's previous generator) filtered private
// members out by default; doxygen2docusaurus has no such option and renders
// every section kind it finds. Reproduce this site's established "public API
// only" convention here instead.
function stripPrivateMemberSections(content) {
  // The summary "## Private ... Index" tables aren't wrapped in a div — just
  // a heading followed by one flat <table>, so a bounded match is safe.
  content = content.replace(
    /## Private[^\n]*Index\n\n<table class="doxyMembersIndex">[\s\S]*?<\/table>\n\n?/g,
    ''
  );
  // The "## Private ..." detail sections are each a whole
  // <div class="doxySectionDef">...</div> block, but those divs nest deeply
  // (member items, proto tables, code listings), so a naive non-greedy regex
  // would stop at the first nested </div> instead of the matching outer one.
  // Track nesting depth instead.
  const OPEN = '<div class="doxySectionDef">';
  let result = '';
  let i = 0;
  while (i < content.length) {
    const start = content.indexOf(OPEN, i);
    if (start === -1) {
      result += content.slice(i);
      break;
    }
    const isPrivateSection = /^\s*\n\s*## Private/.test(
      content.slice(start + OPEN.length, start + OPEN.length + 200)
    );
    if (!isPrivateSection) {
      result += content.slice(i, start + OPEN.length);
      i = start + OPEN.length;
      continue;
    }
    let depth = 0;
    let j = start;
    while (j < content.length) {
      if (content.startsWith('<div', j)) {
        depth++;
        j += 4;
      } else if (content.startsWith('</div>', j)) {
        depth--;
        j += 6;
        if (depth === 0) break;
      } else {
        j++;
      }
    }
    result += content.slice(i, start);
    i = j;
  }
  return result;
}

// Every documented member gets its own "Definition at line N of file X."
// (or, when declared and defined in different files, "Declaration at line N
// of file X, definition at line M of file Y.") caption — rendered
// unconditionally by doxygen2docusaurus with no options-file toggle to turn
// it off (see the renderProgramListingInline comment above). Classic Doxygen
// HTML shows the same caption, but this library's docs exclude the Files pages
// those links point to (see external-jobs.js), so here it's dead weight:
// a sentence naming an internal source file the reader can't follow to.
// Each caption is always emitted as a single self-contained
// `<p>Definition ...</p>` / `<p>Declaration ...</p>` line (confirmed against
// renderLocationToLines, which builds the whole paragraph as one string
// before appending it), so a per-line match is safe.
function stripLocationParagraphs(content) {
  return content.replace(/^<p>(?:Definition|Declaration)\b[^\n]*<\/p>\n+/gm, '');
}

// Classic Doxygen HTML renders a class's whole member overview as ONE compact
// table: a bold in-table heading row per kind (Public Member Functions,
// Public Attributes, ...), one row per member, and a second "brief
// description" row only when a member actually has a one-line brief — no
// blank separator rows between members. doxygen2docusaurus instead emits a
// separate "## <Kind> Index" heading and its own <table> per kind, and
// unconditionally emits both a description row (even when empty) and a
// blank separator row after every member — three rows per member regardless
// of content, which reads as far more sprawling than Doxygen's own page for
// the same class. Rebuild the classic single-table shape from its output.
function mergeMemberIndexTables(content) {
  const indexBlockRe = /## ([^\n]+?) Index\n\n<table class="doxyMembersIndex">\n([\s\S]*?)\n<\/table>\n\n?/g;
  const sections = [];
  const matches = [];
  let match;
  while ((match = indexBlockRe.exec(content)) !== null) {
    matches.push(match);
    sections.push({ label: match[1], body: match[2] });
  }
  if (sections.length === 0) return content;

  const rowRe = /<tr class="doxyMemberIndex(Item|Description|Separator)">[\s\S]*?<\/tr>/g;
  const rows = [];
  for (const { label, body } of sections) {
    rows.push(`<tr class="doxyMemberIndexHeading"><td colspan="2">${label}</td></tr>`);
    let rowMatch;
    rowRe.lastIndex = 0;
    while ((rowMatch = rowRe.exec(body)) !== null) {
      const [text, kind] = [rowMatch[0], rowMatch[1]];
      if (kind === 'Separator') continue; // no gaps between members, same as Doxygen's own page
      if (kind === 'Description' && !/<p>/.test(text)) continue; // only real one-line briefs get a row
      rows.push(text);
    }
  }

  // Wrapped in a scrollable container as a fallback: wrapping long types (see
  // the white-space fix on td.doxyMemberIndexItemType in custom.css) should
  // keep this from ever overflowing in practice, but without this wrapper an
  // overflow has nowhere to go except silently past the page's edge — a
  // scrollbar at least keeps the rest of the content reachable if it ever
  // does happen again (e.g. a future, even longer type expression).
  const merged = `## Members\n\n<div class="doxyMembersIndexScroll">\n\n<table class="doxyMembersIndex">\n${rows.join('\n')}\n</table>\n\n</div>\n\n`;

  // Splice out each matched index block's own span and drop `merged` in at
  // the first one — NOT a single slice from the first block's start to the
  // last block's end, which would silently delete anything sitting between
  // two index blocks (e.g. an "## Included Headers" section) instead of
  // just the blocks themselves.
  let result = '';
  let cursor = 0;
  matches.forEach((m, idx) => {
    result += content.slice(cursor, m.index);
    result += idx === 0 ? merged : '';
    cursor = m.index + m[0].length;
  });
  result += content.slice(cursor);
  return result;
}

// The "## Declaration" block is just a stub — "class Robotiq::Gripper { ... }"
// with a literal "{ ... }" body, no real content — that classic Doxygen HTML
// doesn't show at all. Drop it, but first pull the fully-qualified name
// (namespace included, e.g. "Robotiq::Gripper", or with template parameters
// for a class template) out of it to fix the page's H1, which
// doxygen2docusaurus otherwise titles with just the bare class name (e.g.
// "`Gripper` Class" instead of Doxygen's own "Robotiq::Gripper Class").
function improveTitleAndStripDeclaration(content) {
  const declMatch = content.match(/## Declaration\n\n<div class="doxyDeclaration">\n([\s\S]*?)\n<\/div>\n\n?/);
  if (!declMatch) return content;

  const lastLine = declMatch[1].trim().split('\n').pop();
  const nameMatch = lastLine.match(/(?:class|struct|union)\s+([\w:]+(?:&lt;.*&gt;)?)\s*\{/);
  let result = content.replace(declMatch[0], '');
  if (nameMatch) {
    result = result.replace(/^# `[^`]+`( .+)$/m, (full, suffix) => `# ${nameMatch[1]}${suffix}`);
  }
  return result;
}

// doxygen2docusaurus never writes a `title:` frontmatter field on any page
// it generates — only slug/custom_edit_url/toc_max_heading_level/keywords —
// and Docusaurus's own "fall back to the first heading" rule only fires
// when that heading truly is the first thing in the body, which it never is
// here: every page opens with a `<div class="doxyPage">` line before the
// real "# <Title>" heading. Every generated page's browser tab, sidebar
// history entry, and search index result was, as a result, titled by its
// bare filename slug (e.g. "core-api", "robotiq-gripper") instead of the
// heading text — including the namespace-qualified one
// improveTitleAndStripDeclaration above goes to the trouble of fixing,
// which nothing was ever reading as the title in the first place.
function injectTitleFromH1(content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fmMatch || /^title:/m.test(fmMatch[1])) return content;
  const h1Match = content.slice(fmMatch[0].length).match(/^# (.+)$/m);
  if (!h1Match) return content;
  const escaped = h1Match[1].replace(/"/g, '\\"');
  const newFrontmatter = `---\n${fmMatch[1]}\ntitle: "${escaped}"\n---\n`;
  return content.replace(fmMatch[0], newFrontmatter);
}

// A group/class/struct page's own top-level description (as opposed to a
// member's) is split in two by doxygen2docusaurus, same as classic Doxygen
// HTML: a short brief right under the title with a "More..." jump link, then
// the full brief-plus-detailed text repeated much further down, under its
// own "## Description" heading, after the whole Members table. That forces
// a click-and-scroll just to read what a group/class actually is before
// getting to its member list. Move the full description to the top instead
// — the anchor a "More..." link elsewhere on the site points at
// (".../thisPage/#details") is preserved in place, just without a visible
// heading now that there's nothing left below it to jump to.
//
// Scoped to the page's OWN brief via the literal bare `href="#details"` —
// a member's own "More..." link points at that MEMBER's anchor instead
// (e.g. `#a707374e8627e097c26a9ed30fa2fa703`), never the bare fragment, so
// this can't misfire on one of those.
function moveDetailedDescriptionToTop(content) {
  const briefMatch = content.match(/^# .+\n\n<p>[\s\S]*?<a href="#details">More\.\.\.<\/a><\/p>\n/m);
  if (!briefMatch) return content;

  // A group page's own "## Description" section runs straight to the
  // footer's <hr/> — nothing else follows it. A class/struct page's does
  // NOT: right after its own description come that class's own per-kind
  // member *detail* sections (Public Constructors, Public Operators, ...),
  // each its own `<div class="doxySectionDef">` block with its own "## "
  // heading, still well before the same footer <hr/>. Bounding only on
  // <hr/> — true of every page, only sufficient for group pages — pulled
  // every one of those member-detail sections up to the top as if they
  // were part of the description too, on every class/struct page, shoving
  // the actual Members index (and Included Headers) down to the bottom.
  const descMatch = content.match(/## Description \{#details\}\n\n([\s\S]*?)\n+(?=<hr\/>|<div class="doxySectionDef">|^## )/m);
  if (!descMatch) return content;

  const withoutOldSection = content.replace(descMatch[0], '');
  const newBrief = `${briefMatch[0].slice(0, briefMatch[0].indexOf('\n\n') + 2)}<a id="details"></a>\n\n${descMatch[1]}\n\n`;
  return withoutOldSection.replace(briefMatch[0], newBrief);
}

// Classic Doxygen HTML renders a multi-parameter function's own declaration
// line as a multi-row table — one parameter per row, type and name in their
// own aligned columns — so it reads top-to-bottom instead of as one long
// wrapped run-on line. doxygen2docusaurus instead dumps the whole signature
// as flat text in a single cell, which for anything beyond ~2 parameters
// wraps into a hard-to-follow paragraph. Rebuild the classic shape from it.
function splitTopLevelParams(paramsStr) {
  const params = [];
  let depth = 0;
  let current = '';
  let i = 0;
  while (i < paramsStr.length) {
    if (paramsStr.startsWith('&lt;', i)) { depth++; current += '&lt;'; i += 4; continue; }
    if (paramsStr.startsWith('&gt;', i)) { depth--; current += '&gt;'; i += 4; continue; }
    if (paramsStr[i] === '(') { depth++; current += '('; i++; continue; }
    if (paramsStr[i] === ')') { depth--; current += ')'; i++; continue; }
    // A brace-init default argument (e.g. `= {0, 0}`) has its own comma(s)
    // that aren't parameter separators either — same treatment as `()`/`<>`.
    if (paramsStr[i] === '{') { depth++; current += '{'; i++; continue; }
    if (paramsStr[i] === '}') { depth--; current += '}'; i++; continue; }
    if (paramsStr[i] === ',' && depth === 0) {
      params.push(current);
      current = '';
      i++;
      continue;
    }
    current += paramsStr[i];
    i++;
  }
  if (current.trim() !== '') params.push(current);
  return params.map((p) => p.trim());
}

// Doxygen always renders a parameter's name as plain trailing text (never
// wrapped in a cross-reference link, unlike its type) — so the last bare
// identifier in the string is reliably the name, regardless of what HTML
// tags or template angle brackets came before it in the type.
// A plain indexOf('=') would also match the one inside a cross-reference
// link's own href="..." attribute (e.g. a type like
// `<a href="/docs/.../logger">Logger</a>`) — only a '=' outside any HTML tag
// can be a real default-value assignment.
function findTopLevelEquals(str) {
  let insideTag = false;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '<') insideTag = true;
    else if (str[i] === '>') insideTag = false;
    else if (str[i] === '=' && !insideTag) return i;
  }
  return -1;
}

function splitTypeAndParam(paramStr) {
  let beforeDefault = paramStr;
  let defaultVal = '';
  const eqIdx = findTopLevelEquals(paramStr);
  if (eqIdx !== -1) {
    beforeDefault = paramStr.slice(0, eqIdx).trim();
    defaultVal = paramStr.slice(eqIdx + 1).trim();
  }
  const m = beforeDefault.match(/^([\s\S]*?)([A-Za-z_]\w*)\s*$/);
  if (!m) return { type: beforeDefault, name: '', defaultVal };
  return { type: m[1].trim(), name: m[2], defaultVal };
}

function splitMemberSignatures(content) {
  return content.replace(
    /<table class="doxyMemberName">\n<tr>\n<td class="doxyMemberName">([\s\S]*?)<\/td>\n<\/tr>\n<\/table>/g,
    (match, signature) => {
      const openIdx = signature.indexOf('(');
      if (openIdx === -1) return match;
      let depth = 0;
      let closeIdx = -1;
      for (let i = openIdx; i < signature.length; i++) {
        if (signature[i] === '(') depth++;
        else if (signature[i] === ')' && --depth === 0) { closeIdx = i; break; }
      }
      if (closeIdx === -1) return match;

      const prefix = signature.slice(0, openIdx).trimEnd();
      const paramsStr = signature.slice(openIdx + 1, closeIdx);
      const suffix = signature.slice(closeIdx + 1);
      if (paramsStr.trim() === '') return match; // no-arg signature reads fine on one line

      // Four real columns — [prefix][paren][type][name] — left empty on
      // every row but where they actually have something to say, exactly
      // like classic Doxygen's own .memname table. That's what makes every
      // parameter line up right after wherever "(" landed on the first
      // line: it's a real table column reserving that width on every row,
      // not a guessed fixed indent that would only happen to match one
      // particular prefix's length.
      const paramRows = splitTopLevelParams(paramsStr).map((raw) => {
        const { type, name, defaultVal } = splitTypeAndParam(raw);
        return { type, name, defaultVal };
      });

      const rowHtml = (prefixCell, parenCell, typeCell, nameCell) =>
        `<tr><td class="doxyMemberNamePrefix">${prefixCell}</td><td class="doxyMemberNameParen">${parenCell}</td><td class="doxyMemberNameParamType">${typeCell}</td><td class="doxyMemberNameParamName">${nameCell}</td></tr>`;

      const rows = paramRows.map(({ type, name, defaultVal }, i) => {
        const nameCell = `${name}${defaultVal ? ` = ${defaultVal}` : ''}${i < paramRows.length - 1 ? ',' : ''}`;
        return rowHtml(i === 0 ? prefix : '', i === 0 ? '(' : '', type, nameCell);
      });
      rows.push(rowHtml('', `)${suffix}`, '', ''));

      return `<table class="doxyMemberName">\n${rows.join('\n')}\n</table>`;
    },
  );
}

// stripPrivateMemberSections removes a member's whole section from its own
// class/struct page, but doxygen2docusaurus also lists every member again,
// across all classes, on separate alphabetical "Class Members" index pages
// (indices/classes/all, /functions, /variables, ...) — those still link to
// the now-deleted anchor. Cross-file, so it can only be cleaned up after
// every page has already been written once.
function walkMarkdownFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdownFiles(full, out);
    else if (MARKDOWN_EXTS_FOR_ANCHORS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}
const MARKDOWN_EXTS_FOR_ANCHORS = new Set(['.md', '.mdx']);

function buildAnchorIndex(destPath) {
  const files = walkMarkdownFiles(destPath);
  const bySlug = new Map();
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const slugMatch = content.match(/^slug:\s*(.+?)\s*$/m);
    if (!slugMatch) continue;
    let slug = slugMatch[1];
    if (slug.endsWith('/')) slug = slug.slice(0, -1);
    const ids = new Set();
    for (const m of content.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
    for (const m of content.matchAll(/\{#([^}]+)\}/g)) ids.add(m[1]);
    bySlug.set(slug, ids);
  }
  return { files, bySlug };
}

function resolveAnchorTarget(href, bySlug) {
  const hashIdx = href.indexOf('#');
  if (hashIdx === -1) return null;
  const id = href.slice(hashIdx + 1);
  let pathPart = href.slice(currentRoutePrefix.length, hashIdx);
  if (pathPart.endsWith('/')) pathPart = pathPart.slice(0, -1);
  const ids = bySlug.get(pathPart);
  if (!ids) return true; // target page unknown to us — treat as fine, leave alone
  return ids.has(id);
}

function stripDanglingAnchorLinksAcrossFiles(destPath) {
  const { files, bySlug } = buildAnchorIndex(destPath);
  // The alphabetical "Class Members" indices (indices/classes/all,
  // /functions, /variables, ...) list every member by name in a flat <li>
  // per entry, e.g. "<li><b>_impl</b>: as variable in class ...</li>". A
  // member whose own page no longer documents it (private, stripped above)
  // has nothing to link to — degrading just the link to plain text (as the
  // generic branch below does for e.g. dead "#include" backlinks) would
  // still leave its name listed, which reads as "this project has a public
  // member named _impl" — wrong. Drop the whole entry instead.
  const isClassMembersIndexPage = (file) => /[\\/]indices[\\/]classes[\\/]/.test(file);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let cleaned;
    if (isClassMembersIndexPage(file)) {
      cleaned = content.replace(/<li>[\s\S]*?<\/li>\n?/g, (li) => {
        const hrefMatch = li.match(/<a href="(\/docs\/[^"]*)">/);
        if (!hrefMatch) return li;
        const resolved = resolveAnchorTarget(hrefMatch[1], bySlug);
        return resolved === false ? '' : li;
      });
    } else {
      cleaned = content.replace(/<a href="(\/docs\/[^"]*)">([\s\S]*?)<\/a>/g, (match, href, text) => {
        const resolved = resolveAnchorTarget(href, bySlug);
        return resolved === false ? text : match;
      });
    }
    if (cleaned !== content) fs.writeFileSync(file, cleaned, 'utf8');
  }
}

// Doxygen's own indices split by *lexical scope* (Class Members vs.
// Namespace Members) — but this library organizes almost everything free-
// standing into Modules via \ingroup/\addtogroup instead, and Doxygen's XML
// then records a grouped member as a bare `<member refid=".">` pointer in
// its namespace's compound file, with the actual `<memberdef>` living only
// in the group's compound file. Neither Doxygen's nor doxygen2docusaurus's
// built-in indices follow that pointer, so a grouped free function/enum/
// variable/typedef doesn't appear in either index. This generates one that
// does, reading the Doxygen XML directly rather than the generated Markdown.

// Doxygen's refid convention is "<compoundId>_1<memberAnchor>" — the anchor
// half is exactly the HTML id doxygen2docusaurus renders on whichever page
// actually documents the member (its group's page, if it has one).
function doxygenAnchorFromRefId(refid) {
  const idx = refid.lastIndexOf('_1');
  return idx === -1 ? refid : refid.slice(idx + 2);
}

// Maps every HTML anchor id already rendered onto a generated page back to
// that page's slug, by scanning the finished docs/ output (already-written
// by processFolder) rather than re-deriving doxygen2docusaurus's own
// compound-id-to-slug scheme.
function buildAnchorToSlugMap(destPath) {
  const map = new Map();
  for (const file of walkMarkdownFiles(destPath)) {
    const content = fs.readFileSync(file, 'utf8');
    const slug = readDocSlug(file, content);
    if (!slug) continue;
    // A member's own anchor is a Markdown heading id ("### Name {#id}"),
    // e.g. every group page's per-member headings; a plain HTML id="..."
    // attribute also occurs (self-anchors inside member docs) and is worth
    // matching too.
    for (const m of content.matchAll(/\sid="([^"]+)"/g)) map.set(m[1], slug);
    for (const m of content.matchAll(/\{#([^}]+)\}/g)) map.set(m[1], slug);
  }
  return map;
}

// ---------------------------------------------------------------------
// Linking a member's detailed prototype using Doxygen's own resolved data
// ---------------------------------------------------------------------
//
// doxygen2docusaurus renders a member's detailed signature from Doxygen's
// XML <definition> field (see the "prototype" variable in its own
// members-vm.js), which is always a flat, unlinked string by Doxygen's own
// XML schema — unlike <type>, which carries a real <ref> whenever Doxygen
// resolved the type. That's why e.g. "GripperStatus" in "GripperStatus
// Robotiq::Gripper::getStatus()" isn't clickable here even though the
// exact same type IS linked in the member summary table just above it on
// the same page (built from <type>, not <definition>) — and even though
// Doxygen's OWN HTML output links it too (confirmed directly: hovering it
// there resolves to struct_robotiq_1_1_gripper_status.html).
//
// This recovers those links from data already available, deterministically
// — never by guessing "does a type named X probably have a page":
//  - A return type's <type> field, read back out of the same compound's
//    own Doxygen XML, already carries a <ref> whenever Doxygen resolved it
//    (fixes the getStatus() case on its own).
//  - A parameter's <type> field sometimes has no <ref> even when Doxygen
//    resolved it for its OWN HTML rendering (confirmed for
//    toString(ConnectionState) — Doxygen's HTML links "ConnectionState",
//    its XML <param><type> doesn't). For exactly that gap, fall back to
//    Doxygen's own generated HTML for the same member — same refid scheme,
//    parallel XML/HTML filenames per compound — and reuse whatever link it
//    already resolved there, matched by the plain type text (identical
//    either way).
// Either way, once resolved to a refid, the same two maps used everywhere
// else in this file turn it into an actual site URL — a target this
// pipeline doesn't otherwise know about is left as plain text, same
// "degrade rather than guess" rule as stripDeadDoxygenLinks.

function extractTypeRef(typeFieldXml) {
  const m = (typeFieldXml || '').match(/<ref refid="([^"]+)" kindref="([^"]+)">([^<]*)<\/ref>/);
  return m ? { refid: m[1], kindref: m[2], text: m[3] } : null;
}

// Same plain-text rendering Doxygen itself shows for a <type> field
// (ref or not) — used only to know what text to search/match, never to
// invent new visible text.
function typeFieldPlainText(typeFieldXml) {
  return (typeFieldXml || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// Every member's own <type> (return) and <param><type> (each parameter) in
// one compound's XML file, read and regex-scanned once per compound (not
// once per member — several members share one compound's file) and cached
// by basename, keyed internally by each member's own local anchor.
const compoundMemberFieldsCache = new Map();
function getMemberFields(doxygenXmlDir, basename, localAnchor) {
  let byAnchor = compoundMemberFieldsCache.get(basename);
  if (!byAnchor) {
    byAnchor = new Map();
    const xmlPath = path.join(doxygenXmlDir, `${basename}.xml`);
    if (fs.existsSync(xmlPath)) {
      const xml = fs.readFileSync(xmlPath, 'utf8');
      for (const m of xml.matchAll(/<memberdef\b[^>]*\bid="([^"]+)"[\s\S]*?<\/memberdef>/g)) {
        const idx = m[1].lastIndexOf('_1');
        if (idx === -1) continue;
        const anchor = m[1].slice(idx + 2);
        // A templated member's <templateparamlist> (e.g. Robotiq::waitUntil's
        // `typename Predicate`) sits before the real return <type> and carries
        // its own <param><type> entries — left in, they'd become the "return
        // type" (first <type> match) and shift every real param one slot out
        // of alignment with doxygen2docusaurus's own rendered param cells.
        const withoutTemplateParams = m[0].replace(/<templateparamlist>[\s\S]*?<\/templateparamlist>/, '');
        byAnchor.set(anchor, {
          returnType: withoutTemplateParams.match(/<type>([\s\S]*?)<\/type>/)?.[1] ?? null,
          params: [...withoutTemplateParams.matchAll(/<param>([\s\S]*?)<\/param>/g)]
            .map((mm) => ({ type: mm[1].match(/<type>([\s\S]*?)<\/type>/)?.[1] ?? null })),
        });
      }
    }
    compoundMemberFieldsCache.set(basename, byAnchor);
  }
  return byAnchor.get(localAnchor) ?? null;
}

// A member's local anchor (e.g. "a9b1120dc938148af2e7804db99a2e1ce") to the
// basename of the XML/HTML file pair that defines it (e.g.
// "class_robotiq_1_1_gripper"). Every memberdef id in Doxygen's XML is
// "<compoundBasename>_1<localAnchor>", and a compound's XML and HTML
// output share that same basename (confirmed: class_robotiq_1_1_gripper.xml
// / .html, group__connection.xml / .html) — so this needs no per-member
// guessing, just one scan of every XML file's own memberdef ids.
function buildMemberBasenameMap(doxygenXmlDir) {
  const map = new Map();
  for (const name of fs.readdirSync(doxygenXmlDir)) {
    if (!name.endsWith('.xml') || name === 'index.xml') continue;
    const basename = name.slice(0, -4);
    const content = fs.readFileSync(path.join(doxygenXmlDir, name), 'utf8');
    for (const m of content.matchAll(/<memberdef\b[^>]*\bid="([^"]+)"/g)) {
      const idx = m[1].lastIndexOf('_1');
      if (idx !== -1) map.set(m[1].slice(idx + 2), basename);
    }
  }
  return map;
}

// Every compound (class/struct/union) Doxygen documented, mapped to the
// slug of the page doxygen2docusaurus generated for it. Needed because a
// return/parameter type that's a whole compound (not a member within one)
// never appears as an anchor inside its OWN page (nothing there to
// self-reference), so buildAnchorToSlugMap alone can't resolve it. Matched
// by the fully-qualified name Doxygen's index.xml and every generated
// compound page's own H1 ("<Qualified::Name> Struct"/"... Class"/...) both
// carry.
function buildCompoundToSlugMap(doxygenXmlDir, destPath) {
  const map = new Map();
  const indexPath = path.join(doxygenXmlDir, 'index.xml');
  if (!fs.existsSync(indexPath)) return map;

  const compounds = [...fs.readFileSync(indexPath, 'utf8').matchAll(
    /<compound refid="([^"]+)" kind="(?:class|struct|union|interface)"><name>([^<]*)<\/name>/g
  )].map(([, refid, name]) => ({ refid, name }));
  if (compounds.length === 0) return map;

  for (const file of walkMarkdownFiles(destPath)) {
    const content = fs.readFileSync(file, 'utf8');
    const h1 = content.replace(/^---\n[\s\S]*?\n---\n/, '').match(/^# (.+)$/m);
    if (!h1) continue;
    const compound = compounds.find((c) => h1[1] === c.name || h1[1].startsWith(`${c.name} `));
    if (compound) {
      const slug = readDocSlug(file, content);
      if (slug) map.set(compound.refid, slug);
    }
  }
  return map;
}

// Doxygen's classic HTML href for a target ("struct_x.html",
// "group__y.html#gaz...", or same-file "#gaz...") back into the refid
// scheme the rest of this file already uses (doxygenAnchorFromRefId,
// buildAnchorToSlugMap) — the mirror image of how such an href was
// generated in the first place: a compound's XML and HTML output share one
// basename, and a member's HTML anchor is always the same "<localAnchor>"
// tail its XML memberdef id has.
function doxygenHrefToRefid(href, currentBasename) {
  const hashIdx = href.indexOf('#');
  const filePart = hashIdx === -1 ? href : href.slice(0, hashIdx);
  const fragment = hashIdx === -1 ? null : href.slice(hashIdx + 1);
  const basename = filePart ? filePart.replace(/\.html$/, '') : currentBasename;
  return fragment ? `${basename}_1${fragment}` : basename;
}

// Doxygen's own HTML sometimes resolves a cross-reference its XML export
// doesn't carry (confirmed for parameter types, e.g. toString's
// ConnectionState) — reusing whatever it already resolved there, rather
// than re-deriving it, for exactly that gap. Searches only this one
// member's own <table class="memname"> block in its compound's classic
// HTML page (never the whole file — a type name could otherwise coincide
// with an unrelated link elsewhere on the page) and matches by the exact
// plain type text, so a genuinely unresolvable type (e.g. std::string_view,
// unlinked in Doxygen's HTML too) correctly yields nothing here either.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const memberHtmlBlockCache = new Map();
function findLinkInDoxygenHtml(doxygenHtmlDir, basename, localAnchor, plainText, anchorToSlug, compoundToSlug) {
  const cacheKey = `${basename}::${localAnchor}`;
  let block = memberHtmlBlockCache.get(cacheKey);
  if (block === undefined) {
    block = null;
    const htmlPath = path.join(doxygenHtmlDir, `${basename}.html`);
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8');
      const idIdx = html.indexOf(`id="${localAnchor}"`);
      const tableIdx = idIdx === -1 ? -1 : html.indexOf('<table class="memname">', idIdx);
      const tableEnd = tableIdx === -1 ? -1 : html.indexOf('</table>', tableIdx);
      if (tableIdx !== -1 && tableEnd !== -1) block = html.slice(tableIdx, tableEnd);
    }
    memberHtmlBlockCache.set(cacheKey, block);
  }
  if (!block) return null;

  for (const m of block.matchAll(/<a class="el" href="([^"]+)">([^<]+)<\/a>/g)) {
    // Doxygen's HTML only ever wraps the bare type name — "Gripper" in
    // "const Gripper &amp;", never the qualifiers or "&"/"*" around it —
    // while plainText here is the *whole* <type> field. A prefix check
    // (plainText.startsWith(m[2])) misses a *leading* qualifier ("const
    // DeviceProfile &" doesn't start with "DeviceProfile") and, worse, lets
    // a shorter identifier falsely match a longer one that starts with it
    // ("GripperStatus".startsWith("Gripper") picks the Gripper class page
    // for a GripperStatus parameter). A whole-word search fixes both: it
    // finds the identifier anywhere in the field, and `\b` on both sides
    // rejects a match that's actually the prefix of a longer identifier.
    if (!new RegExp(`\\b${escapeRegExp(m[2])}\\b`).test(plainText)) continue;
    const linkText = m[2];
    const href = m[1];
    const refid = doxygenHrefToRefid(href, basename);
    // Whether this points at a whole compound (a bare "struct_x.html", no
    // "#") or a member within one ("...html#localAnchor", or a same-file
    // "#localAnchor") has to come from the href itself, not be re-derived
    // from refid afterwards: doxygenAnchorFromRefId assumes a
    // "<compound>_1<memberHash>" shape, but a *compound*'s own refid (e.g.
    // "struct_robotiq_1_1_fault_status") already contains "_1" pairs of its
    // own, from Doxygen's "::" encoding — running it through that function
    // regardless produced garbage fragments (#_fault_status and friends).
    if (href.includes('#')) {
      const anchor = doxygenAnchorFromRefId(refid);
      const slug = anchorToSlug.get(anchor);
      if (slug) return { text: linkText, href: `${currentRoutePrefix}${slug}#${anchor}` };
    } else {
      const slug = compoundToSlug.get(refid);
      if (slug) return { text: linkText, href: `${currentRoutePrefix}${slug}` };
    }
  }
  return null;
}

// Resolves one <type> field (a memberdef's return type, or one of its
// <param>s) to a site URL, preferring the ref Doxygen's XML already carries
// and falling back to Doxygen's own HTML only when the XML has none.
function resolveTypeLink(typeFieldXml, ctx) {
  const plainText = typeFieldPlainText(typeFieldXml);
  if (!plainText) return null;

  const ref = extractTypeRef(typeFieldXml);
  if (ref) {
    const anchor = doxygenAnchorFromRefId(ref.refid);
    const slug = ref.kindref === 'compound' ? ctx.compoundToSlug.get(ref.refid) : ctx.anchorToSlug.get(anchor);
    // Only the ref's own text gets linked (e.g. "Foo", not "const Foo &") —
    // matches Doxygen's own convention of never wrapping a surrounding
    // qualifier, and matters even though neither getStatus() nor
    // ActivationResult (the two return-type cases this was verified
    // against) actually have one, since a future "const Foo &" return type
    // otherwise would.
    if (slug) return { plainText: ref.text, href: `${currentRoutePrefix}${slug}${ref.kindref === 'compound' ? '' : `#${anchor}`}` };
  }

  const found = findLinkInDoxygenHtml(ctx.doxygenHtmlDir, ctx.basename, ctx.localAnchor, plainText, ctx.anchorToSlug, ctx.compoundToSlug);
  return found ? { plainText: found.text, href: found.href } : null;
}

// Splices a resolved { plainText, href } into a doxyMemberName-family
// cell at the type name's own position — not necessarily offset 0, since a
// leading qualifier ("const DeviceProfile &") puts the identifier after
// "const ". Matches the *first* whole-word occurrence only (`\b`-bounded,
// same reasoning as findLinkInDoxygenHtml above), which is always the type
// itself: it appears before the parameter name in a doxyMemberName cell, so
// a parameter name that happens to coincide with the type name later in the
// same cell is never touched.
//
// Skips entirely if the cell already has a link: doxygen2docusaurus's own
// template links a param/return type straight from the XML ref itself for
// cases it already handles (e.g. GripperCommand in `setCommand(const
// GripperCommand&)`) — resolveTypeLink doesn't know that already happened,
// so without this guard the identifier's own whole-word match lands inside
// that existing `<a>`'s text and wraps a second, nested `<a>` around it.
// One `<type>` field is always exactly one cell here, never a mix of
// already-linked and not-yet-linked text, so "has any `<a`" is enough.
function linkifyLeadingText(cellHtml, resolved) {
  if (!resolved || cellHtml.includes('<a ')) return cellHtml;
  const match = new RegExp(`\\b${escapeRegExp(resolved.plainText)}\\b`).exec(cellHtml);
  if (!match) return cellHtml;
  const start = match.index;
  const end = start + resolved.plainText.length;
  return `${cellHtml.slice(0, start)}<a href="${resolved.href}">${resolved.plainText}</a>${cellHtml.slice(end)}`;
}

// Runs once per doxygen2docusaurus job, after every page it produced has
// been written (see runDoxygen2Docusaurus) — needs the finished docs/
// output to build anchorToSlug/compoundToSlug from, the same way
// stripDanglingAnchorLinksAcrossFiles does.
function linkifyMemberPrototypes(destPath, doxygenXmlDir, doxygenHtmlDir) {
  if (!fs.existsSync(doxygenXmlDir) || !fs.existsSync(doxygenHtmlDir)) return;

  const anchorToSlug = buildAnchorToSlugMap(destPath);
  const compoundToSlug = buildCompoundToSlugMap(doxygenXmlDir, destPath);
  const memberBasename = buildMemberBasenameMap(doxygenXmlDir);

  for (const file of walkMarkdownFiles(destPath)) {
    const content = fs.readFileSync(file, 'utf8');
    const updated = content.replace(
      /\{#([A-Za-z0-9_]+)\}\n\n<div class="doxyMemberItem">\n<div class="doxyMemberProto">[\s\S]*?<table class="doxyMemberName">\n([\s\S]*?)\n<\/table>/g,
      (whole, localAnchor, tableBody) => {
        const basename = memberBasename.get(localAnchor);
        const fields = basename && getMemberFields(doxygenXmlDir, basename, localAnchor);
        if (!fields) return whole;

        const ctx = { basename, localAnchor, doxygenHtmlDir, anchorToSlug, compoundToSlug };
        const returnTypeLink = resolveTypeLink(fields.returnType, ctx);
        let paramIndex = 0;
        const newBody = tableBody
          .replace(
            /(<td class="doxyMemberName">)([\s\S]*?)(<\/td>)/,
            (m, open, text, close) => `${open}${linkifyLeadingText(text, returnTypeLink)}${close}`
          )
          .replace(
            /(<td class="doxyMemberNamePrefix">)([\s\S]*?)(<\/td>)/,
            (m, open, text, close) => `${open}${linkifyLeadingText(text, returnTypeLink)}${close}`
          )
          .replace(
            /(<td class="doxyMemberNameParamType">)([\s\S]*?)(<\/td>)/g,
            (m, open, text, close) => {
              const param = fields.params[paramIndex];
              paramIndex += 1;
              return `${open}${param ? linkifyLeadingText(text, resolveTypeLink(param.type, ctx)) : text}${close}`;
            }
          );

        return newBody === tableBody ? whole : whole.replace(tableBody, newBody);
      }
    );
    if (updated !== content) fs.writeFileSync(file, updated, 'utf8');
  }
}

// Every enum/typedef/variable/function directly inside a namespace's own
// sectiondefs (kind="enum"/"typedef"/"var"/"func"/"user-defined" — Doxygen
// uses "user-defined" for a \addtogroup-tagged block of mixed kinds) is, by
// construction, NOT a class member — classes only ever appear via a
// namespace's <innerclass> list, never inside a sectiondef. So every entry
// this returns is already exactly the "free, not nested in a class" set the
// index needs, with no separate filtering step required.
// Strips XML/HTML markup down to plain text for a compact index blurb —
// used on both raw Doxygen XML (<ref>/<computeroutput>/<para>) and the
// already-generated HTML pages (<a>/<code>/...), since a one-line brief
// doesn't need its own cross-reference links to still be useful.
function stripMarkupToText(markup) {
  return markup
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBriefFromXmlBlock(block) {
  // An enum's <memberdef> lists its <enumvalue> children — each with its own
  // nested <briefdescription> — before the enum's OWN brief/detailed
  // description. Strip those out first so the first remaining
  // <briefdescription> is guaranteed to be the enum's own, not e.g. its
  // first enumerator's ("rACT — must stay set after activation" instead of
  // the enum's actual "The packed action-request byte...").
  const withoutEnumValues = block.replace(/<enumvalue[^>]*>[\s\S]*?<\/enumvalue>/g, '');
  const m = withoutEnumValues.match(/<briefdescription>\n?([\s\S]*?)<\/briefdescription>/);
  return m ? stripMarkupToText(m[1]) : '';
}

// The compound-level (whole class/struct) <briefdescription> sits directly
// under <compounddef> at 4-space indentation, distinct from any member's own
// <briefdescription> nested deeper inside a <memberdef>/<enumvalue> — this
// indentation is what tells them apart.
function extractCompoundBrief(xmlContent) {
  const m = xmlContent.match(/\n {4}<briefdescription>\n([\s\S]*?)\n {4}<\/briefdescription>/);
  return m ? stripMarkupToText(m[1]) : '';
}

// A grouped free member (see the module-level comment above
// parseNamespaceFreeMembers) has its full <memberdef> — brief description
// included — only in its group's own compound XML file, found by the same
// "<compoundId>_1<anchor>" refid convention doxygenAnchorFromRefId relies on.
function findGroupMemberBrief(doxygenXmlDir, refid) {
  const idx = refid.lastIndexOf('_1');
  if (idx === -1) return '';
  const xmlPath = path.join(doxygenXmlDir, `${refid.slice(0, idx)}.xml`);
  if (!fs.existsSync(xmlPath)) return '';
  const content = fs.readFileSync(xmlPath, 'utf8');
  const escapedRefid = refid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = content.match(new RegExp(`<memberdef[^>]*\\bid="${escapedRefid}"[^>]*>([\\s\\S]*?)<\\/memberdef>`));
  return m ? extractBriefFromXmlBlock(m[1]) : '';
}

function parseNamespaceFreeMembers(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const entries = [];
  for (const section of xml.matchAll(/<sectiondef kind="[^"]*">([\s\S]*?)<\/sectiondef>/g)) {
    const body = section[1];
    for (const m of body.matchAll(/<member refid="([^"]+)" kind="([^"]+)"><name>([^<]*)<\/name><\/member>/g)) {
      entries.push({ kind: m[2], name: m[3], refid: m[1] });
    }
    for (const m of body.matchAll(/<memberdef kind="(enum|typedef|variable|function)"[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/memberdef>/g)) {
      const locationMatch = m[3].match(/<location file="([^"]+)"/);
      entries.push({
        kind: m[1],
        name: (m[3].match(/<name>([^<]*)<\/name>/) || [])[1] || '?',
        refid: null,
        file: locationMatch ? locationMatch[1] : null,
        brief: extractBriefFromXmlBlock(m[3]),
      });
    }
  }
  return entries;
}

const FREE_MEMBER_KIND_SECTIONS = [
  ['enum', 'Enums'],
  ['typedef', 'Data Types'],
  ['variable', 'Variables'],
  ['function', 'Functions'],
];

function renderFreeSymbolsIndex(namespaceXmlPaths, anchorToSlug, classEntries, apiFolderPath, doxygenXmlDir) {
  const byKind = { enum: [], typedef: [], variable: [], function: [] };
  for (const xmlPath of namespaceXmlPaths) {
    if (!fs.existsSync(xmlPath)) continue;
    for (const entry of parseNamespaceFreeMembers(xmlPath)) {
      if (byKind[entry.kind]) byKind[entry.kind].push(entry);
    }
  }

  const lines = [
    '---',
    '',
    '# DO NOT EDIT!',
    '# Generated by scripts/sync-external-docs.js from the Doxygen XML directly.',
    '',
    `slug: /${apiFolderPath}/indices/free-symbols`,
    'title: Global Index',
    'custom_edit_url: null',
    '',
    '---',
    '',
    'Every class, and every free (non-member) function, variable, data type,',
    'and enum in the project, regardless of how it\'s organized into Modules —',
    'unlike the per-topic pages, nothing here is grouped.',
    '',
  ];

  if (classEntries.length > 0) {
    lines.push('## Classes', '');
    for (const entry of classEntries.slice().sort((a, b) => a.title.localeCompare(b.title))) {
      // Raw HTML, not `[text](url)` — every one of this site's slugs under
      // this API section contains a literal space ("Adaptive grippers"), and
      // CommonMark's bare (no angle-bracket) link-destination syntax
      // doesn't permit a literal space, so it silently fails to parse as a
      // link at all and prints as literal text instead. This is exactly why
      // every other doxygen2docusaurus-generated page on this site already
      // uses raw `<a href>` rather than Markdown link syntax.
      const trailers = [];
      if (entry.group) trailers.push(`<strong>${entry.group}</strong>`);
      if (entry.brief) trailers.push(entry.brief);
      lines.push(`- <a href="${currentRoutePrefix}${entry.slug}">${entry.title}</a>${trailers.length ? ` — ${trailers.join(' — ')}` : ''}`);
    }
    lines.push('');
  }

  for (const [kind, title] of FREE_MEMBER_KIND_SECTIONS) {
    // Operator overloads (operator==, operator!=, ...) are noise here: they
    // read oddly out of context and, for this library, are never \ingroup-tagged
    // — so they'd only ever show up as the unlinked "not otherwise
    // documented" fallback below anyway.
    const sorted = byKind[kind]
      .filter((entry) => !entry.name.startsWith('operator'))
      .sort((a, b) => a.name.localeCompare(b.name));
    // This index lists names to scan, not signatures to read — the linked
    // group page already shows every overload in full. One entry per name
    // (sort is stable, so this keeps whichever overload the source declares
    // first) rather than one indistinguishable-looking line per overload
    // (e.g. `waitFor` × 2, `toString` × 8).
    const items = [];
    const seenNames = new Set();
    for (const entry of sorted) {
      if (seenNames.has(entry.name)) continue;
      seenNames.add(entry.name);
      items.push(entry);
    }
    if (items.length === 0) continue;
    lines.push(`## ${title}`, '');
    for (const entry of items) {
      const anchor = entry.refid ? doxygenAnchorFromRefId(entry.refid) : null;
      const slug = anchor ? anchorToSlug.get(anchor) : null;
      const displayName = kind === 'function' ? `${entry.name}()` : entry.name;
      if (slug) {
        const trailers = [];
        const groupTitle = readPageH1(slug);
        if (groupTitle) trailers.push(`<strong>${groupTitle}</strong>`);
        const brief = findGroupMemberBrief(doxygenXmlDir, entry.refid);
        if (brief) trailers.push(brief);
        lines.push(`- <a href="${currentRoutePrefix}${slug}#${anchor}"><code>${displayName}</code></a>${trailers.length ? ` — ${trailers.join(' — ')}` : ''}`);
      } else {
        // Not \ingroup-tagged, so there's no Modules page (or any other
        // page — Namespaces are out of this site's scope) documenting it.
        // Still worth listing so it isn't invisible, just without a link.
        const trailers = [];
        if (entry.brief) trailers.push(entry.brief);
        if (entry.file) trailers.push(`declared in <code>${entry.file}</code>, ungrouped (no page on this site)`);
        lines.push(`- <code>${displayName}</code>${trailers.length ? ` — ${trailers.join(' — ')}` : ''}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// Every namespace the current Doxygen XML actually contains, read from its
// own index (index.xml lists every compound Doxygen just produced) instead
// of a hand-maintained list — so a namespace added, renamed, or removed
// upstream (this library has grown Robotiq::profiles and Robotiq::units since
// this list was first written, neither of which a hardcoded array would
// ever have picked up) needs no matching edit here. `std` is the standard
// library, never part of this library's own surface; a `detail` namespace at
// any nesting level is this codebase's established internal-implementation
// convention (see \snippet doc-comment examples living in Robotiq::detail,
// "Compile-checked examples with \snippet" in api-reference-cpp.mdx) — both
// excluded by that general rule, not by naming this library's specific
// namespaces one by one.
function discoverNamespaceXmlPaths(doxygenXmlDir) {
  const indexPath = path.join(doxygenXmlDir, 'index.xml');
  if (!fs.existsSync(indexPath)) return [];
  const indexXml = fs.readFileSync(indexPath, 'utf8');
  const paths = [];
  for (const m of indexXml.matchAll(/<compound refid="([^"]+)" kind="namespace"><name>([^<]*)<\/name>/g)) {
    const [, refid, name] = m;
    if (name === 'std' || /(?:^|::)detail(?:::|$)/.test(name)) continue;
    paths.push(path.join(doxygenXmlDir, `${refid}.xml`));
  }
  return paths;
}

function generateFreeSymbolsIndex(destPath, doxygenXmlDir, apiFolderPath, classIdToGroupLabel) {
  const anchorToSlug = buildAnchorToSlugMap(destPath);

  const namespaceXmlPaths = discoverNamespaceXmlPaths(doxygenXmlDir);

  const classEntries = [];
  for (const sub of ['classes', 'structs']) {
    const dir = path.join(destPath, sub);
    if (!fs.existsSync(dir)) continue;
    for (const file of walkMarkdownFiles(dir)) {
      const content = fs.readFileSync(file, 'utf8');
      const slug = readDocSlug(file, content);
      // Skip the frontmatter block first — it opens with its own "# DO NOT
      // EDIT!" comment line, which /^# .+$/m would otherwise match instead
      // of the page's real title.
      const afterFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');
      const titleMatch = afterFrontmatter.match(/^# (.+)$/m);
      // The class's own intro paragraph, right after its H1 and before
      // "## Included Headers"/"## Declaration" — same brief the page itself
      // leads with, just reused here instead of re-deriving it from XML.
      const briefMatch = afterFrontmatter.match(/^# .+\n\n<p>([\s\S]*?)<\/p>/m);
      const brief = briefMatch
        ? stripMarkupToText(briefMatch[1].replace(/\s*<a href="#details">More\.\.\.<\/a>\s*$/, ''))
        : '';
      if (slug && titleMatch) {
        const id = path.relative(currentDocsRoot, file).replace(/\.mdx?$/, '').split(path.sep).join('/');
        classEntries.push({ slug, title: titleMatch[1], brief, group: classIdToGroupLabel.get(id) });
      }
    }
  }

  const outPath = path.join(destPath, 'indices', 'free-symbols.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderFreeSymbolsIndex(namespaceXmlPaths, anchorToSlug, classEntries, apiFolderPath, doxygenXmlDir), 'utf8');
  return outPath;
}

function runDoxygen2Docusaurus(job, written, folderDestPaths) {
  const submoduleRoot = path.join(ROOT, 'external', job.submodule);
  const doxyfileDir = path.join(submoduleRoot, job.doxygen2docusaurus.doxyfileDir);
  if (!fs.existsSync(path.join(doxyfileDir, 'Doxyfile'))) {
    console.warn(`[sync-external-docs] Missing Doxyfile: ${path.relative(ROOT, doxyfileDir)} — run: git submodule update --init`);
    return;
  }

  // Doxygen never cleans its own OUTPUT_DIRECTORY — an XML compound for a
  // file/symbol that existed in a PREVIOUS run (e.g. before it was added to
  // the Doxyfile's EXCLUDE, or before it was deleted upstream) is simply
  // left behind, not regenerated, and not removed. Every downstream step
  // here reads that directory as if it were authoritative, so a stale file
  // silently reappears in the generated docs even though nothing currently
  // documents it. Deleting it first guarantees this run's XML reflects
  // exactly the current submodule state, nothing carried over.
  const doxygenXmlDirAbs = path.join(doxyfileDir, 'doxygen-xml');
  fs.rmSync(doxygenXmlDirAbs, { recursive: true, force: true });
  execSync('doxygen', { cwd: doxyfileDir, stdio: 'inherit' });

  // See the big comment above DOXYGEN2DOCUSAURUS_STAGING_DIR for the full
  // reasoning. Short version: a job with `destRoot` gets its own versioned
  // plugin instance, whose `routeBasePath` already supplies everything up
  // to the tool's own root — so `apiFolderPath` (which drives every slug,
  // sidebar doc id, and staging path doxygen2docusaurus produces) is
  // reduced to just the tail past that root (its own basename, e.g.
  // 'API'), and every downstream helper needs `currentDocsRoot`/
  // `currentRoutePrefix` set to match before it runs.
  const apiFolderPath = job.destRoot ? path.basename(job.to) : job.to;
  currentDocsRoot = job.destRoot
    ? path.join(ROOT, job.destRoot, path.dirname(job.to))
    : path.join(ROOT, 'docs');
  currentRoutePrefix = job.destRoot ? job.routeBasePath : '/docs';

  const doxygenXmlInputFolderPath = path
    .relative(ROOT, doxygenXmlDirAbs)
    .split(path.sep)
    .join('/');
  const stagingDirRel = path.relative(ROOT, DOXYGEN2DOCUSAURUS_STAGING_DIR).split(path.sep).join('/');
  const sidebarCategoryFilePath = `${stagingDirRel}/sidebar-category-doxygen.json`;

  fs.rmSync(DOXYGEN2DOCUSAURUS_STAGING_DIR, { recursive: true, force: true });
  fs.writeFileSync(DOXYGEN2DOCUSAURUS_CONFIG_PATH, JSON.stringify({
    doxygenXmlInputFolderPath,
    docsFolderPath: stagingDirRel,
    apiFolderPath,
    baseUrl: '/',
    // Unlike a Docusaurus slug (which Docusaurus itself combines with the
    // owning instance's routeBasePath at routing time), the *absolute*
    // `<a href="/docs/...">` backlinks doxygen2docusaurus bakes straight
    // into raw HTML never go through that combination — docsBaseUrl has to
    // already be the full public prefix for those to land on the right
    // page. currentRoutePrefix is that prefix with its leading '/' already
    // stripped off here to match this option's own (bare, no-leading-
    // slash) convention, same as the default 'docs' value it replaces.
    docsBaseUrl: job.destRoot ? currentRoutePrefix.replace(/^\//, '') : 'docs',
    apiBaseUrl: apiFolderPath,
    sidebarCategoryFilePath,
    sidebarCategoryLabel: 'API Reference',
    // No navbar dropdown — this site's C++ API reference is reached via the
    // sidebar (see sidebars.js), same as before this migration.
    navbarDropdownFilePath: '',
    // Redirected into the staging dir so a normal generate run never
    // overwrites this site's own hand-adapted src/css/custom.css — see
    // "Matching Doxygen's own reference look" in
    // docs/contribute/api-reference-cpp.mdx.
    customCssFilePath: `${stagingDirRel}/custom-doxygen2docusaurus.css`,
    // Classic Doxygen HTML never repeats a member's own source line inline
    // under its documentation — the source is one click away via "Definition
    // at line N of file X". doxygen2docusaurus's default instead re-embeds
    // that single highlighted line as its own code block after every member,
    // which reads as noise rather than useful context. The remaining
    // "Definition at line N of file X" caption itself has no matching
    // options-file toggle (confirmed against the installed version's
    // renderLocationToLines, which renders it unconditionally); it's instead
    // stripped in post-processing below by stripLocationParagraphs.
    renderProgramListingInline: false,
  }, null, 2));

  try {
    execSync(`node "${DOXYGEN2DOCUSAURUS_BIN}"`, { cwd: ROOT, stdio: 'inherit' });
  } finally {
    fs.rmSync(DOXYGEN2DOCUSAURUS_CONFIG_PATH, { force: true });
  }

  const rawSidebar = JSON.parse(fs.readFileSync(path.join(ROOT, sidebarCategoryFilePath), 'utf8'));
  let prunedItems = (rawSidebar.items || [])
    .map((node) => pruneDoxygenSidebarNode(node, apiFolderPath, job.exclude))
    .filter(Boolean);

  // One-time hygiene: this migration renamed every generated subfolder
  // (e.g. Doxybook2's 'Classes' → doxygen2docusaurus's 'classes'). On a
  // case-insensitive-but-case-preserving filesystem (Windows/macOS default),
  // writing into 'classes' silently merges into an already-existing
  // 'Classes' directory instead of creating a fresh one — and then
  // pruneStale's exact-string `written` lookup below sees the on-disk
  // 'Classes' casing, doesn't find it in a `written` set keyed by 'classes',
  // and deletes the files this very run just wrote. Deleting the whole
  // destination tree first (except the hand-authored index.mdx/README,
  // which pruneStale itself always exempts) sidesteps this regardless of
  // what casing a previous pipeline left behind.
  const destPath = path.join(ROOT, job.destRoot || 'docs', job.to);
  if (fs.existsSync(destPath)) {
    for (const entry of fs.readdirSync(destPath, { withFileTypes: true })) {
      const base = entry.name.replace(/\.[^.]+$/, '');
      if (!entry.isDirectory() && (base === 'index' || base === 'README')) continue;
      fs.rmSync(path.join(destPath, entry.name), { recursive: true, force: true });
    }
  }

  // doxygen2docusaurus's own pages carry no relative markdown-style links —
  // every internal cross-reference is an absolute `<a href="/docs/...">`
  // (see the comment above), which rewriteLinks already leaves untouched.
  // submoduleRoot/repoUrl/branch are passed only as a defensive fallback in
  // case that ever changes.
  const stagingApiDir = path.join(DOXYGEN2DOCUSAURUS_STAGING_DIR, apiFolderPath);
  processFolder(stagingApiDir, destPath, {
    exclude: job.exclude,
    submoduleRoot,
    repoUrl: job.repoUrl,
    branch: job.branch,
    rawCopy: true,
    transformContent: (content) => injectTitleFromH1(moveDetailedDescriptionToTop(stripDeadDoxygenLinks(splitMemberSignatures(improveTitleAndStripDeclaration(mergeMemberIndexTables(stripLocationParagraphs(stripPrivateMemberSections(content))))), apiFolderPath, job.exclude))),
  }, stagingApiDir, written);
  folderDestPaths.add(destPath);
  stripDanglingAnchorLinksAcrossFiles(destPath);
  linkifyMemberPrototypes(destPath, doxygenXmlDirAbs, path.join(doxyfileDir, 'doxygen-html'));

  // Doxybook2 (this site's previous generator) nested a group's own classes
  // directly under that group in the sidebar; doxygen2docusaurus instead
  // keeps two separate top-level trees ("Topics" for \defgroup/\ingroup
  // groups, "Classes" for every class flattened together) with no option to
  // merge them. Reproduce the old, more useful nesting: each group page's
  // own generated "Classes" heading (inside the merged Members table — see
  // mergeMemberIndexTables) already lists exactly which classes it owns, so
  // read that back out of the finished docs/ output and move those sidebar
  // nodes across from "Classes" into their owning group.
  const topicsNode = prunedItems.find((n) => n.label === 'Topics');
  const classesNode = prunedItems.find((n) => n.label === 'Classes');
  const classIdToGroupLabel = new Map();
  if (topicsNode && classesNode) {
    const slugToClassNode = new Map();
    collectLeavesBySlug(classesNode, slugToClassNode);

    const matchedNodes = new Set();
    // slugToClassNode is consumed (entries deleted once claimed) by the
    // post-order walk below, so a class already claimed by a nested subgroup
    // can't also be re-claimed by an ancestor group's own page — several
    // group pages rolled up a subgroup's classes onto their own overview,
    // and without this a class ended up double-listed under both.
    const newTopicsNode = attachClassesToGroups(topicsNode, slugToClassNode, matchedNodes);
    collectClassGroupLabels(newTopicsNode, matchedNodes, classIdToGroupLabel);

    // The Global Index (generated below) already covers every class — plus
    // every free function/variable/data type/enum — in one page, making the
    // "Classes" category (by now just a tree-overview link; every class
    // able to move into a group already has) redundant. Drop the whole
    // category and its now-unreferenced landing page — this has to run
    // AFTER attachClassesToGroups above, not as a job-level `exclude` entry,
    // since that would delete the class docs nested under this same
    // category (Classes > Hierarchy > ...) before the merge ever ran.
    if (classesNode.link) fs.rmSync(path.join(currentDocsRoot, `${classesNode.link.id}.md`), { force: true });
    prunedItems = prunedItems
      .map((n) => (n === topicsNode ? newTopicsNode : n === classesNode ? null : n))
      .filter(Boolean);
  }

  const freeSymbolsIndexPath = generateFreeSymbolsIndex(destPath, path.join(doxyfileDir, 'doxygen-xml'), apiFolderPath, classIdToGroupLabel);
  written.add(freeSymbolsIndexPath); // else pruneStale (run after every job) deletes it right back out
  prunedItems.push({
    type: 'doc',
    label: 'Global Index',
    id: path.relative(currentDocsRoot, freeSymbolsIndexPath).replace(/\.md$/, '').split(path.sep).join('/'),
  });

  const sidebarOutputPath = doxygenSidebarOutputPath(apiFolderPath);
  fs.mkdirSync(path.dirname(sidebarOutputPath), { recursive: true });
  fs.writeFileSync(sidebarOutputPath, JSON.stringify(prunedItems, null, 2));
  console.log(`[sync-external-docs] doxygen2docusaurus sidebar → ${path.relative(ROOT, sidebarOutputPath)}`);
  console.log(`[sync-external-docs] ${job.submodule} (doxygen2docusaurus) → ${job.destRoot || 'docs'}/${job.to}/`);
}

function readDocSlug(file, preReadContent) {
  const content = preReadContent ?? fs.readFileSync(file, 'utf8');
  const m = content.match(/^slug:\s*(.+?)\s*$/m);
  if (!m) return null;
  let slug = m[1];
  if (slug.endsWith('/')) slug = slug.slice(0, -1);
  return slug;
}

// The page's own H1 (e.g. "ActionByte" for groups/action.md) — none of
// these generated pages carry a `title:` frontmatter field, so the H1 is
// the only source for a human-readable name.
function readPageH1(slug) {
  const file = path.join(currentDocsRoot, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const afterFrontmatter = fs.readFileSync(file, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
  const m = afterFrontmatter.match(/^# (.+)$/m);
  return m ? m[1] : null;
}

// Collect every leaf doc node under a sidebar subtree, keyed by the page's
// own `slug:` frontmatter — NOT its sidebar `id`, which is derived from the
// file's on-disk name and can disagree with the slug (e.g. id
// ".../classes/robotiq-gripper" vs slug ".../classes/robotiq/gripper").
// Group pages link to classes by slug (real URLs), so slug is the only key
// that lets the two be matched up.
function collectLeavesBySlug(node, out) {
  const id = node.type === 'doc' ? node.id : node.link?.type === 'doc' ? node.link.id : null;
  if (id) {
    const file = path.join(currentDocsRoot, `${id}.md`);
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      const slug = readDocSlug(file, content);
      if (slug) {
        out.set(slug, node);
        // doxygen2docusaurus's own sidebar label is just the bare name
        // ("Gripper") — its page's own H1 (fixed to be namespace-qualified
        // by improveTitleAndStripDeclaration, e.g. "Robotiq::Gripper Class")
        // has the "Class"/"Struct"/"Class Template" suffix that makes it
        // clear at a glance what kind of thing this is once it's nested
        // under a group instead of under its own "Classes"/"Structs"
        // sidebar section. This library's classes are all directly in one
        // namespace, so the title is always "Namespace::Name[<T>] Suffix" —
        // dropping the "Namespace::" prefix leaves exactly that label.
        const afterFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');
        const titleMatch = afterFrontmatter.match(/^# (.+)$/m);
        if (titleMatch) node.label = titleMatch[1].split('::').pop();
      }
    }
  }
  for (const child of node.items || []) collectLeavesBySlug(child, out);
}

// Reads the slugs linked under a group page's own "Classes" heading row
// (inside the single merged Members table mergeMemberIndexTables produces),
// stopping at the next heading row or the end of the table.
function classSlugsOwnedByGroupPage(file) {
  const content = fs.readFileSync(file, 'utf8');
  const headingRe = /<tr class="doxyMemberIndexHeading"><td colspan="2">([^<]*)<\/td><\/tr>/g;
  const headings = [];
  let m;
  while ((m = headingRe.exec(content)) !== null) {
    headings.push({ label: m[1], end: m.index + m[0].length });
  }
  const slugs = [];
  headings.forEach((heading, i) => {
    if (heading.label !== 'Classes') return;
    const sectionEnd = i + 1 < headings.length ? headings[i + 1].end : content.length;
    const section = content.slice(heading.end, sectionEnd);
    // Only the class-name link in each entry's own doxyMemberIndexItemName
    // cell counts as ownership. A member's doxyMemberIndexDescriptionRight
    // brief is free-form prose that can — and does — link to OTHER classes
    // in passing (Platform's own one-line description mentions Gripper),
    // which must not be mistaken for a second "Classes" entry.
    const hrefRe = new RegExp(`doxyMemberIndexItemName"[^>]*><a href="(${escapeRegExp(currentRoutePrefix)}/[^"]*)">`, 'g');
    for (const itemMatch of section.matchAll(hrefRe)) {
      let slug = itemMatch[1].slice(currentRoutePrefix.length);
      if (slug.endsWith('/')) slug = slug.slice(0, -1);
      slugs.push(slug);
    }
  });
  return slugs;
}

// Every doc-id slug reachable inside a node's own `items` subtree (NOT
// including the node itself) — the same id-to-slug resolution
// collectLeavesBySlug uses, reused here to find which classes are already
// represented via nesting under a class node doxygen2docusaurus built
// (e.g. a derived class under its base).
function collectDescendantSlugs(node) {
  const slugs = new Set();
  for (const child of node.items || []) {
    const id = child.type === 'doc' ? child.id : child.link?.type === 'doc' ? child.link.id : null;
    if (id) {
      const file = path.join(currentDocsRoot, `${id}.md`);
      if (fs.existsSync(file)) {
        const slug = readDocSlug(file, fs.readFileSync(file, 'utf8'));
        if (slug) slugs.add(slug);
      }
    }
    for (const nestedSlug of collectDescendantSlugs(child)) slugs.add(nestedSlug);
  }
  return slugs;
}

// Walks the Topics tree, attaching each group's owned classes as sidebar
// items. A group with no items yet (a plain `{type: 'doc'}` leaf) becomes a
// category so it can hold them, keeping its own page as that category's
// link.
function attachClassesToGroups(node, slugToClassNode, matchedNodes) {
  // Post-order: recurse into children FIRST, so a class owned by a nested
  // subgroup is claimed (and removed from slugToClassNode) there before this
  // node's own page — which often rolls its subgroups' classes up onto its
  // own overview too — gets a chance to re-claim the same class.
  let result = node;
  if (Array.isArray(node.items)) {
    result = { ...node, items: node.items.map((child) => attachClassesToGroups(child, slugToClassNode, matchedNodes)) };
  }

  const id = result.type === 'doc' ? result.id : result.link?.type === 'doc' ? result.link.id : null;
  if (!id) return result;
  const file = path.join(currentDocsRoot, `${id}.md`);
  if (!fs.existsSync(file)) return result;

  // doxygen2docusaurus's own "Classes" tree already nests a derived class
  // under its base class — so a base class's node here can itself carry
  // `items` full of derived-class nodes. A group page's "Classes" list
  // commonly names both the base AND its derived classes as their own
  // entries (all \ingroup the same group), so classSlugsOwnedByGroupPage
  // below returns every one of those slugs independently. Claiming the base
  // class already brings its derived children along via that nesting;
  // claiming them AGAIN here would push them a second time as direct
  // siblings of the very node they're already nested inside. Track and skip
  // any slug already pulled in that way, and consume it from
  // slugToClassNode too so a *different* group can't independently claim it
  // either — the same "claimed once" guarantee cross-group claims already get.
  const owned = [];
  const alreadyNested = new Set();
  for (const slug of classSlugsOwnedByGroupPage(file)) {
    if (alreadyNested.has(slug)) continue;
    const classNode = slugToClassNode.get(slug);
    if (classNode) {
      owned.push(classNode);
      slugToClassNode.delete(slug);
      for (const nestedSlug of collectDescendantSlugs(classNode)) {
        alreadyNested.add(nestedSlug);
        slugToClassNode.delete(nestedSlug);
      }
    }
  }
  if (owned.length === 0) return result;

  if (result.type === 'doc') {
    result = { type: 'category', label: result.label, link: { type: 'doc', id: result.id }, items: [] };
  } else if (!Array.isArray(result.items)) {
    result = { ...result, items: [] };
  }
  for (const classNode of owned) {
    result.items.push(classNode);
    matchedNodes.add(classNode);
  }
  return result;
}

// Reads back, for every class attachClassesToGroups just moved, which group
// actually ended up claiming it — the Global Index wants to show "in
// <Group>" next to a class exactly like it already does for free members,
// and re-deriving that independently would risk the same double-claim bug
// (a group page rolling up its subgroups' classes) attachClassesToGroups's
// post-order/consume-on-claim approach exists to avoid.
function collectClassGroupLabels(node, matchedNodes, out) {
  for (const child of node.items || []) {
    if (matchedNodes.has(child)) {
      const id = child.type === 'doc' ? child.id : child.link?.id;
      if (id) out.set(id, node.label);
    }
    collectClassGroupLabels(child, matchedNodes, out);
  }
}

const MARKDOWN_EXTS = new Set(['.md', '.mdx']);
const COPY_EXTS = new Set(['.md', '.mdx', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf']);

function isAbsoluteHref(href) {
  return /^(https?:\/\/|mailto:|#|\/)/.test(href);
}

// Rewrites markdown links in `content`.
//   srcFile / destFile  : absolute paths of the file being processed
//   copiedRoot          : if non-null, the source folder being synced as a whole.
//                         Links that resolve inside it are re-expressed as relative paths
//                         from the destination file. Pass null for single-file syncs.
//   destCopiedRoot      : destination counterpart of copiedRoot (null for single-file)
//   submoduleRoot       : absolute path to the submodule root
//   repoUrl / branch    : used to build absolute GitHub URLs
function rewriteLinks(content, { srcFile, destFile, copiedRoot, destCopiedRoot, submoduleRoot, repoUrl, branch, exclude }) {
  const srcDir = path.dirname(srcFile);
  const destDir = path.dirname(destFile);

  // Strip content wrapped in <!-- docs-site:exclude --> ... <!-- /docs-site:exclude -->.
  // Lets a submodule README carry a "full docs at <url>" blurb that renders on GitHub
  // but never makes it into the synced docs page.
  content = content.replace(/<!--\s*docs-site:exclude\s*-->[\s\S]*?<!--\s*\/docs-site:exclude\s*-->\n?/g, '');

  // Strip the leading H1 for a SINGLE-FILE sync (copiedRoot null) — the
  // wrapper .mdx that imports it supplies the page's own title via
  // frontmatter, so the partial's own H1 would just be a second, redundant
  // one. Uses 'm' (without 'g') so it finds the first "# " line anywhere
  // near the top and removes only that one match, even when the README
  // opens with a badge or blank line before its title.
  //
  // A FOLDER sync (copiedRoot set, e.g. a submodule's docs/ guides) has no
  // such wrapper — each file becomes its own standalone page — and this
  // pipeline never adds a `title:` frontmatter field to replace what the H1
  // would have supplied, so stripping it here left every one of those pages
  // titleless; Docusaurus then fell back to the filename-derived slug as
  // the browser tab/sidebar title instead. Leaving the H1 in place lets
  // Docusaurus's own default (first H1 = page title, when no frontmatter
  // title is set) do the right thing instead.
  if (!copiedRoot) {
    // `\r?\n` (not a bare `\n`) — a source file with Windows CRLF line
    // endings (confirmed for robotiq/isaacsim_assets's guide) has `.`
    // stop right before the `\r`, one character short of the literal `\n`
    // this used to require immediately after — silently leaving the H1
    // (and its redundant page title) in place instead of stripping it.
    content = content.replace(/^# .*(?:\r?\n)+/m, '');
  }

  // Convert <url> autolinks to [url](url) — MDX treats angle-bracket URLs as JSX and fails.
  content = content.replace(/<(https?:\/\/[^>\s]+)>/g, '[$1]($1)');

  return content.replace(/(!?)\[([^\]]*)\]\(([^)\n]+)\)/g, (match, bang, text, href) => {
    const hashIdx = href.indexOf('#');
    const hrefPath = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
    const anchor = hashIdx >= 0 ? href.slice(hashIdx) : '';

    if (!hrefPath.trim() || isAbsoluteHref(hrefPath)) return match;

    const absTarget = path.resolve(srcDir, hrefPath);

    if (copiedRoot) {
      const relToRoot = path.relative(copiedRoot, absTarget);
      if (!relToRoot.startsWith('..')) {
        // Doxybook2 sometimes emits cross-reference links to pages it never
        // actually generates (e.g. namespaces with no \namespace doc comment
        // upstream) — degrade to plain text rather than shipping a dead link.
        // Same treatment for a target this job's own `exclude` list drops:
        // it exists in the submodule but will never actually be copied.
        const relToRootPosix = relToRoot.replace(/\\/g, '/');
        const isExcluded = (exclude || []).some(ex => relToRootPosix === ex || relToRootPosix.startsWith(ex + '/'));
        if (!fs.existsSync(absTarget) || isExcluded) return text;
        // Target is inside the copied folder — rewrite as a relative path from dest
        const absDestTarget = path.join(destCopiedRoot, relToRoot);
        const newRel = path.relative(destDir, absDestTarget).replace(/\\/g, '/');
        return `${bang}[${text}](${newRel}${anchor})`;
      }
    }

    // Target escapes the copied content — make it an absolute GitHub URL.
    // Image embeds (`![...]`) need the raw file bytes to render as an <img>;
    // a "blob" URL serves GitHub's HTML file-viewer page instead, which
    // renders as a broken image. Plain links keep using blob/tree so
    // clicking them opens GitHub's viewer.
    const relToSubmodule = path.relative(submoduleRoot, absTarget).replace(/\\/g, '/');
    if (bang) {
      const rawBase = repoUrl.replace('https://github.com/', 'https://raw.githubusercontent.com/');
      return `${bang}[${text}](${rawBase}/${branch}/${relToSubmodule}${anchor})`;
    }
    const hasExt = path.extname(relToSubmodule) !== '';
    const ghBase = hasExt ? `${repoUrl}/blob/${branch}` : `${repoUrl}/tree/${branch}`;
    return `[${text}](${ghBase}/${relToSubmodule}${anchor})`;
  });
}

// A submodule's own guides are written for GitHub's renderer, which turns
// `> **Note:** ...` into a plain indented quote — readable enough there,
// but flat and unstyled once copied verbatim onto this site. Docusaurus
// has a real, better-looking equivalent (":::note ... :::", a properly
// styled callout box — see docs/intro.mdx), so convert every such
// blockquote to it here, once, for every synced doc from any submodule,
// rather than leaving each one to render poorly (or need a per-file fix
// that the next sync would just overwrite anyway).
const BLOCKQUOTE_ADMONITION_TYPE = {
  note: 'note',
  tip: 'tip',
  info: 'info',
  important: 'info',
  warning: 'warning',
  caution: 'warning',
  danger: 'danger',
};

function convertBlockquoteAdmonitions(content) {
  return content.replace(/(^>.*(?:\r?\n>.*)*)/gm, (block) => {
    const joined = block
      .split(/\r?\n/)
      .map((line) => line.replace(/^>\s?/, ''))
      .join('\n');
    const m = joined.match(/^\*\*(Note|Tip|Info|Important|Warning|Caution|Danger)\s*:\*\*\s*/i);
    if (!m) return block; // an ordinary quotation, not a callout — leave it as a blockquote

    const type = BLOCKQUOTE_ADMONITION_TYPE[m[1].toLowerCase()];
    const body = joined.slice(m[0].length).replace(/\n+$/, '');
    return `:::${type}\n${body}\n:::`;
  });
}

// Doxybook2's default frontmatter template emits unquoted scalar values
// (e.g. `summary: ... an injectable interface: one exchange thread ...`),
// which breaks YAML parsing whenever a Doxygen \brief comment contains a
// colon. Quote any unquoted frontmatter value so Docusaurus can always
// parse it, regardless of what the source comment contains.
function sanitizeFrontmatter(content) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  if (!match) return content;
  const frontmatter = match[0];
  const body = content.slice(frontmatter.length);
  const fixed = frontmatter.replace(/^([A-Za-z0-9_-]+): (.+)$/gm, (line, key, value) => {
    const trimmed = value.trim();
    if (/^["'].*["']$/.test(trimmed) || /^-?\d+(\.\d+)?$/.test(trimmed)) return line;
    return `${key}: "${trimmed.replace(/"/g, '\\"')}"`;
  });
  return fixed + body;
}

// Overrides the frontmatter `title:` and the body's leading H1 with `title`
// — used to give a copied page a clearer name than the one Doxybook2 gave
// it (e.g. a header's path instead of what it's actually about).
function applyTitleOverride(content, title) {
  if (title == null) return content;
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fmMatch) return content;
  const escaped = title.replace(/"/g, '\\"');
  const newFm = fmMatch[1].replace(/^title:.*$/m, `title: "${escaped}"`);
  const body = content.slice(fmMatch[0].length).replace(/^# .*$/m, `# ${title}`);
  return `---\n${newFm}\n---\n${body}`;
}

// Stamps `sidebar_position: N` into the frontmatter (adding a frontmatter
// block if the file has none) — lets an autogenerated sidebar category
// order its items without hand-listing them in sidebars.js.
function applySidebarPosition(content, position) {
  if (position == null) return content;
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (fmMatch) {
    if (/^sidebar_position:/m.test(fmMatch[1])) return content;
    const newFm = `${fmMatch[1]}\nsidebar_position: ${position}`;
    return `---\n${newFm}\n---\n${content.slice(fmMatch[0].length)}`;
  }
  return `---\nsidebar_position: ${position}\n---\n\n${content}`;
}

function processFile(srcFile, destFile, opts) {
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  // `rawCopy`: skip README-oriented processing (link rewriting, frontmatter
  // sanitizing, title/sidebar-position overrides) entirely — used for
  // doxygen2docusaurus output, whose Markdown is already exactly what this
  // site needs: absolute `/docs/...` links (rewriteLinks would only touch
  // relative ones anyway) and frontmatter that's already valid, correctly
  // typed YAML. Running it through sanitizeFrontmatter's blanket
  // "quote every unquoted value" rule actually broke it: it turned
  // `custom_edit_url: null` into the string `custom_edit_url: "null"`,
  // which Docusaurus then resolves as a real (and broken) relative link.
  if (opts.rawCopy) {
    if (MARKDOWN_EXTS.has(path.extname(srcFile).toLowerCase()) && typeof opts.transformContent === 'function') {
      fs.writeFileSync(destFile, opts.transformContent(fs.readFileSync(srcFile, 'utf8')), 'utf8');
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
    return;
  }
  if (MARKDOWN_EXTS.has(path.extname(srcFile).toLowerCase())) {
    let raw = applyTitleOverride(fs.readFileSync(srcFile, 'utf8'), opts.titleOverride);
    raw = applySidebarPosition(raw, opts.sidebarPosition);
    raw = sanitizeFrontmatter(raw);
    raw = convertBlockquoteAdmonitions(raw);
    fs.writeFileSync(destFile, rewriteLinks(raw, { srcFile, destFile, ...opts }), 'utf8');
  } else {
    fs.copyFileSync(srcFile, destFile);
  }
}

// `exclude` (opts.exclude): paths relative to the folder job's root,
// forward-slash separated (e.g. 'Files' or 'index_files.md') — skipped
// entirely, subtrees included.
// `sidebarPositions` (opts.sidebarPositions): map of the same relative
// paths to a `sidebar_position` value, stamped onto that file.
// `written` (Set of absolute dest paths) accumulates every file this or any
// other job produces this run — see pruneStale below.
function processFolder(srcDir, destDir, opts, rootSrcDir = srcDir, written = new Set()) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const relFromRoot = path.relative(rootSrcDir, path.join(srcDir, entry.name)).replace(/\\/g, '/');
    if ((opts.exclude || []).some(ex => relFromRoot === ex || relFromRoot.startsWith(ex + '/'))) continue;
    const srcChild = path.join(srcDir, entry.name);
    const destChild = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      processFolder(srcChild, destChild, opts, rootSrcDir, written);
    } else if (COPY_EXTS.has(path.extname(entry.name).toLowerCase())) {
      processFile(srcChild, destChild, { ...opts, sidebarPosition: (opts.sidebarPositions || {})[relFromRoot] });
      written.add(destChild);
    }
  }
  return written;
}

// A folder job only ever adds/overwrites — if the source repo renames or
// removes a file, the old copy would otherwise linger in docs/ forever and
// get picked up as a stale, duplicate sidebar entry (see
// scripts/folder-sidebar.mjs, which lists every file actually present on
// disk). Called once per folder job's destDir after all JOBS have run, so
// files written by an unrelated job into the same tree (e.g. the register-
// map file job writing into a folder job's API/Modules/) are already in
// `written` and don't get flagged as stale.
// `index`/`README` are exempt — those are this site's own hand-authored
// landing pages for the folder, never synced from source (see "Splitting a
// tool page into overview, API reference, and guides" in
// docs/contribute/how-it-works.mdx).
function pruneStale(destDir, written) {
  if (!fs.existsSync(destDir)) return;
  for (const entry of fs.readdirSync(destDir, { withFileTypes: true })) {
    const child = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      pruneStale(child, written);
      if (fs.readdirSync(child).length === 0) fs.rmdirSync(child);
      continue;
    }
    if (!COPY_EXTS.has(path.extname(entry.name).toLowerCase())) continue;
    const base = entry.name.replace(/\.[^.]+$/, '');
    if (base === 'index' || base === 'README') continue;
    if (!written.has(child)) {
      console.log(`[sync-external-docs] Removing stale: ${path.relative(ROOT, child)}`);
      fs.unlinkSync(child);
    }
  }
}

const written = new Set();
const folderDestPaths = new Set();

for (const job of JOBS) {
  if (job.doxygen2docusaurus) {
    runDoxygen2Docusaurus(job, written, folderDestPaths);
    continue;
  }

  const submoduleRoot = path.join(ROOT, 'external', job.submodule);
  const srcPath = path.join(submoduleRoot, job.from);
  // Defaults to 'docs' for every existing job. A job whose content needs to
  // live outside the main Docusaurus docs instance's own tree — e.g. a tool
  // piloting per-tool documentation versioning (see
  // draft/documentation-versioning.md) as its own separate plugin instance
  // — sets destRoot explicitly instead. Physically nesting that instance's
  // files inside docs/ (even with the default instance's own `exclude`
  // covering them) reproducibly breaks MDX compilation with a bogus
  // "Unexpected FunctionDeclaration ... non-esm" error — confirmed by
  // bisecting content (irrelevant) and path (moving the exact same files
  // outside docs/ fixed it) while building the tactile-python pilot.
  const destPath = path.join(ROOT, job.destRoot || 'docs', job.to);

  if (!fs.existsSync(srcPath)) {
    console.warn(`[sync-external-docs] Missing: external/${job.submodule}/${job.from} — run: git submodule update --init`);
    continue;
  }

  const isDir = fs.statSync(srcPath).isDirectory();
  const opts = {
    copiedRoot: isDir ? srcPath : null,
    destCopiedRoot: isDir ? destPath : null,
    submoduleRoot,
    repoUrl: job.repoUrl,
    branch: job.branch,
    exclude: job.exclude,
    titleOverride: job.titleOverride,
    sidebarPositions: job.sidebarPositions,
  };

  if (isDir) {
    processFolder(srcPath, destPath, opts, srcPath, written);
    folderDestPaths.add(destPath);
    console.log(`[sync-external-docs] ${job.submodule}/${job.from}/ → ${job.destRoot || 'docs'}/${job.to}/`);
  } else {
    processFile(srcPath, destPath, { ...opts, srcFile: srcPath, destFile: destPath });
    written.add(destPath);
    console.log(`[sync-external-docs] ${job.submodule}/${job.from} → ${job.destRoot || 'docs'}/${job.to}`);
  }
}

for (const destPath of folderDestPaths) {
  pruneStale(destPath, written);
}
