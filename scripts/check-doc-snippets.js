// Runs each submodule's own doc-snippet verifier, for every job in
// external-jobs.js that declares a `docSnippetsCheck` (see that file's
// comment on the 2f85_cpp docs job, and "Verifying markdown code examples
// against real source" in contribute.mdx).
//
// This is a *verifier*, not a generator: it fails the build loudly on a
// mismatch rather than silently rewriting the copied markdown. It runs the
// exact script vendored in the submodule at this pinned commit — not a copy
// living in this repo — so it's always checking with the same tool version
// the upstream repo's own CI used. That also means it runs during a plain
// `npm start`/`npm run build` (via the `generate` prebuild step), not just
// in this site's own CI: it catches drift even while previewing uncommitted
// edits to a submodule you're actively working on (see
// SKIP_SUBMODULE_RESET in sync-external-docs.js), before anything is ever
// pushed for the submodule's own CI to see.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const JOBS = require('./external-jobs');

// Node 20 (this site's CI, see .github/workflows/ci.yml) has no fs.globSync
// (added in Node 22) and this repo carries no glob dependency — every
// `docSnippetsCheck.markdownGlob` in practice is a plain `<dir>/*.<ext>`, so
// a minimal single-segment expander is enough; no need for a real globber.
function expandSimpleGlob(pattern, cwd) {
  const dir = path.dirname(pattern);
  const filePattern = path.basename(pattern);
  const re = new RegExp(`^${filePattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  const dirPath = path.join(cwd, dir);
  return fs.readdirSync(dirPath).filter((f) => re.test(f)).map((f) => path.join(dirPath, f));
}

let failures = 0;

for (const job of JOBS) {
  if (!job.docSnippetsCheck) continue;
  const submoduleRoot = path.join(ROOT, 'external', job.submodule);
  const { script, markdownGlob, examplesDir } = job.docSnippetsCheck;
  const scriptPath = path.join(submoduleRoot, script);
  if (!fs.existsSync(scriptPath)) {
    console.warn(`[check-doc-snippets] ${job.submodule}: no ${script} at this pinned commit yet — skipping`);
    continue;
  }
  const markdownFiles = expandSimpleGlob(markdownGlob, submoduleRoot);

  if (markdownFiles.length === 0) {
    console.warn(`[check-doc-snippets] ${job.submodule}: no files matched ${markdownGlob} — skipping`);
    continue;
  }

  console.log(`[check-doc-snippets] ${job.submodule}: running ${script}`);
  try {
    execFileSync(
      'python3',
      [scriptPath, ...markdownFiles, '--examples-dir', path.join(submoduleRoot, examplesDir)],
      { stdio: 'inherit' },
    );
  } catch {
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`[check-doc-snippets] ${failures} submodule(s) failed their doc-snippet check`);
  process.exit(1);
}
