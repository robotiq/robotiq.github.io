// Shared reader for the license data npm already records in
// package-lock.json, used by check-dependency-licenses.js (the CI gate) and
// generate-third-party-notices.js (the docs page). Reading the lockfile —
// not the installed node_modules tree — keeps both OS-independent: the
// lockfile lists every platform's optional native binaries (rspack/swc/
// lightningcss...) whichever OS wrote it, whereas node_modules only holds
// the current OS's set, so a tree walk produces different output on
// Windows vs. CI's Ubuntu.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

// A handful of old packages declare no `license` field at all (only a
// legacy `licenses` array, or nothing), so npm records none in the
// lockfile. Each one below was checked by hand against the LICENSE/README
// shipped in the package. Pinned by version so a bump gets re-checked
// instead of silently inheriting the old verdict.
const MANUALLY_VERIFIED = {
  'eval@0.1.8': 'MIT',
  'format@0.2.2': 'MIT',
  'khroma@2.1.0': 'MIT',
  'require-like@0.1.2': 'MIT',
};

function readLockfile() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
}

// Every package that ships with a production install (dev-only ones
// excluded), as {name, version, license}. `license` is null when neither
// the lockfile nor MANUALLY_VERIFIED knows it.
function productionPackages(lockfile = readLockfile()) {
  return Object.entries(lockfile.packages)
    .filter(([key, info]) => key !== '' && !info.dev && !info.link)
    .map(([key, info]) => {
      const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
      const license = info.license || MANUALLY_VERIFIED[`${name}@${info.version}`] || null;
      return {name, version: info.version, license};
    });
}

module.exports = {ROOT, readLockfile, productionPackages};
