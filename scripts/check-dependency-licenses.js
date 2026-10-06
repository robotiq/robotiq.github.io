// Fails if any production dependency, direct or transitive, isn't under a
// license on the allowlist below — see ci.yml's "Check dependency licenses"
// step. Copyleft licenses (GPL/AGPL/LGPL/SSPL/BUSL...) would require this
// site's own source to be distributed under matching terms, which conflicts
// with its BSD-3-Clause license.
//
// Fails closed: an unknown, custom ("SEE LICENSE IN ...") or missing
// license fails too, rather than only matching known-bad names — a deny
// list can't anticipate every SPDX spelling (GPL-3.0-only,
// LGPL-2.1-or-later, ...). If this fails on a new permissive license,
// check it and add it to ALLOWED; if it fails on a package with no
// license field, check its LICENSE file and add it to MANUALLY_VERIFIED in
// lib/lockfile-licenses.js.
const {productionPackages} = require('./lib/lockfile-licenses');

const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  // File-level copyleft only: obligations apply to modified MPL files
  // themselves, not to this site's own source.
  'MPL-2.0',
  'Python-2.0',
  'Unlicense',
  'WTFPL',
]);

// Accepts a single SPDX id or a flat `A OR B` / `A AND B` expression
// (optionally parenthesized) — the only shapes present in the lockfile.
// OR passes if any alternative is allowed, AND only if every term is.
// Anything else (nested/mixed expressions) fails closed.
function isAllowed(license) {
  if (!license) return false;
  const expr = license.replace(/^\((.*)\)$/, '$1').trim();
  if (/[()]/.test(expr)) return false;
  if (/ OR /.test(expr) && / AND /.test(expr)) return false;
  if (/ OR /.test(expr)) return expr.split(' OR ').some((id) => ALLOWED.has(id.trim()));
  return expr.split(' AND ').every((id) => ALLOWED.has(id.trim()));
}

if (require.main === module) {
  const packages = productionPackages();
  const rejected = packages.filter((pkg) => !isAllowed(pkg.license));
  if (rejected.length > 0) {
    console.error('check-dependency-licenses.js: production dependencies with a license not on the allowlist:');
    for (const pkg of rejected) console.error(`  ${pkg.name}@${pkg.version}: ${pkg.license ?? '(none declared)'}`);
    process.exit(1);
  }
  console.log(`check-dependency-licenses.js: all ${packages.length} production packages are under an allowed license`);
}

module.exports = {isAllowed};
