// Copies content from git submodules into the Docusaurus docs tree.
// Supports single files and full folders. Add new repos to JOBS below.
//
// Single-file job: all relative links become absolute GitHub URLs.
// Folder job: links within the copied folder stay relative;
//             links escaping the folder become absolute GitHub URLs.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Reset all submodules to the committed state before syncing,
// so local edits inside external/ never silently affect the build.
try {
  execSync('git submodule update --init --force', { cwd: ROOT, stdio: 'inherit' });
} catch {
  console.warn('[sync-external-docs] git submodule update failed — continuing with current state');
}

// ── Add new repos here ─────────────────────────────────────────────────────
const JOBS = [
  //Organisation profile README
  {
    submodule: 'org-profile',
    repoUrl: 'https://github.com/robotiq/.github',
    branch: 'main',
    from: 'profile/README.md',
    to: '_org-profile-readme.md',
  },
  // TSF 85 CPP driver README
  {
    submodule: 'tactile_sensors',
    repoUrl: 'https://github.com/robotiq/tactile_sensors',
    branch: 'main',
    from: 'sdk_cpp/README.md',
    to: 'drivers/TSF-85/C++/_readme.md',
  },
  // TSF 85 Python driver README
  {
    submodule: 'tactile_sensors',
    repoUrl: 'https://github.com/robotiq/tactile_sensors',
    branch: 'main',
    from: 'sensor_quickstart/README.md',
    to: 'drivers/TSF-85/Python/_readme.md',
  },
  // Folder example — uncomment when a repo has a docs/ folder:
  // {
  //   submodule: 'tactile_sensors',
  //   repoUrl: 'https://github.com/Robotiq/tactile_sensors',
  //   branch: 'main',
  //   from: 'docs',
  //   to: 'drivers/tsf-85',
  // },
];
// ───────────────────────────────────────────────────────────────────────────

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
function rewriteLinks(content, { srcFile, destFile, copiedRoot, destCopiedRoot, submoduleRoot, repoUrl, branch }) {
  const srcDir = path.dirname(srcFile);
  const destDir = path.dirname(destFile);

  // Strip leading H1 — the wrapper .mdx supplies the page title via sidebar_label frontmatter.
  content = content.replace(/^# [^\n]*\n+/, '');

  // Convert <url> autolinks to [url](url) — MDX treats angle-bracket URLs as JSX and fails.
  content = content.replace(/<(https?:\/\/[^>\s]+)>/g, '[$1]($1)');

  return content.replace(/\[([^\]]*)\]\(([^)\n]+)\)/g, (match, text, href) => {
    const hashIdx = href.indexOf('#');
    const hrefPath = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
    const anchor = hashIdx >= 0 ? href.slice(hashIdx) : '';

    if (!hrefPath.trim() || isAbsoluteHref(hrefPath)) return match;

    const absTarget = path.resolve(srcDir, hrefPath);

    if (copiedRoot) {
      const relToRoot = path.relative(copiedRoot, absTarget);
      if (!relToRoot.startsWith('..')) {
        // Target is inside the copied folder — rewrite as a relative path from dest
        const absDestTarget = path.join(destCopiedRoot, relToRoot);
        const newRel = path.relative(destDir, absDestTarget).replace(/\\/g, '/');
        return `[${text}](${newRel}${anchor})`;
      }
    }

    // Target escapes the copied content — make it an absolute GitHub URL
    const relToSubmodule = path.relative(submoduleRoot, absTarget).replace(/\\/g, '/');
    const hasExt = path.extname(relToSubmodule) !== '';
    const ghBase = hasExt ? `${repoUrl}/blob/${branch}` : `${repoUrl}/tree/${branch}`;
    return `[${text}](${ghBase}/${relToSubmodule}${anchor})`;
  });
}

function processFile(srcFile, destFile, opts) {
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  if (MARKDOWN_EXTS.has(path.extname(srcFile).toLowerCase())) {
    const raw = fs.readFileSync(srcFile, 'utf8');
    fs.writeFileSync(destFile, rewriteLinks(raw, { srcFile, destFile, ...opts }), 'utf8');
  } else {
    fs.copyFileSync(srcFile, destFile);
  }
}

function processFolder(srcDir, destDir, opts) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcChild = path.join(srcDir, entry.name);
    const destChild = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      processFolder(srcChild, destChild, opts);
    } else if (COPY_EXTS.has(path.extname(entry.name).toLowerCase())) {
      processFile(srcChild, destChild, opts);
    }
  }
}

for (const job of JOBS) {
  const submoduleRoot = path.join(ROOT, 'external', job.submodule);
  const srcPath = path.join(submoduleRoot, job.from);
  const destPath = path.join(ROOT, 'docs', job.to);

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
  };

  if (isDir) {
    processFolder(srcPath, destPath, opts);
    console.log(`[sync-external-docs] ${job.submodule}/${job.from}/ → docs/${job.to}/`);
  } else {
    processFile(srcPath, destPath, { ...opts, srcFile: srcPath, destFile: destPath });
    console.log(`[sync-external-docs] ${job.submodule}/${job.from} → docs/${job.to}`);
  }
}
