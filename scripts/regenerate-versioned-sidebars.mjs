// @ts-check

// Regenerates every already-cut version's frozen sidebar snapshot
// (<tool>_versioned_sidebars/version-<name>-sidebars.json) from the live
// scripts/site-nav-tree.mjs, so a later change to the shared site nav tree
// (new product, renamed label, moved/removed page) doesn't leave an
// already-cut version holding a stale copy of the OLD tree forever — see
// docs/contribute/versioning.mdx and the big comment on
// extractActiveItem/regenerateInstanceSidebar in site-nav-tree.mjs for how
// this correctly regenerates a version WITHOUT needing to already know
// what real content shape that specific version's active tool has (which
// can differ from the tool's own *current* version).
//
// Run as part of `npm run generate`, so it's always fresh before a build;
// ci.yml's "Verify generated content is committed" step then catches
// drift here the same way it already does for docs/ and versioned-tools/.
//
// A tool discovered by its `<tool>_versioned_sidebars/` folder name — no
// hardcoded tool list to keep in sync as more tools gain versioning.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { regenerateInstanceSidebar } from './site-nav-tree.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SUFFIX = '_versioned_sidebars';

let changed = 0;

for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.endsWith(SUFFIX)) continue;
  const tool = entry.name.slice(0, -SUFFIX.length);
  const dir = path.join(ROOT, entry.name);

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('-sidebars.json')) continue;
    const filePath = path.join(dir, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    const existing = JSON.parse(raw);
    const [sidebarKey, existingItems] = Object.entries(existing)[0];

    const regenerated = regenerateInstanceSidebar(tool, existingItems);
    if (regenerated === undefined) {
      console.warn(
        `[regenerate-versioned-sidebars] Could not find '${tool}'s own content in ${path.relative(ROOT, filePath)} — left unchanged. The site nav tree's shape may have changed structurally since this was last regenerated; regenerate this one by hand.`
      );
      continue;
    }

    const next = JSON.stringify({ [sidebarKey]: regenerated }, null, 2) + '\n';
    // Compare with line endings normalized — this repo's checked-out files
    // are CRLF (Windows git config), this script's own output is LF, and
    // git re-normalizes that difference on the next commit regardless, so
    // comparing raw bytes would report a "change" on every single run even
    // when nothing about the actual sidebar content differs.
    if (next.replace(/\r\n/g, '\n') !== raw.replace(/\r\n/g, '\n')) {
      fs.writeFileSync(filePath, next);
      changed += 1;
      console.log(`[regenerate-versioned-sidebars] Updated ${path.relative(ROOT, filePath)}`);
    }
  }
}

if (changed === 0) {
  console.log('[regenerate-versioned-sidebars] All versioned sidebar snapshots already up to date.');
}
