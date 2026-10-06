// Unit tests for scripts/check-dependency-licenses.js's license-expression
// matching — the CI gate that keeps copyleft dependencies out (see the
// "Check dependency licenses" step in .github/workflows/ci.yml).
const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowed } = require('../scripts/check-dependency-licenses');
const { productionPackages } = require('../scripts/lib/lockfile-licenses');

test('isAllowed: permissive ids and expressions pass', () => {
  for (const license of ['MIT', 'Apache-2.0', '(MIT OR CC0-1.0)', 'Apache-2.0 AND MIT', '(MIT OR GPL-2.0)']) {
    assert.equal(isAllowed(license), true, license);
  }
});

test('isAllowed: copyleft in any real SPDX spelling fails', () => {
  for (const license of ['GPL-3.0-only', 'LGPL-2.1-or-later', 'AGPL-3.0', 'SSPL-1.0', 'BUSL-1.1', 'MIT AND GPL-3.0']) {
    assert.equal(isAllowed(license), false, license);
  }
});

test('isAllowed: missing, custom or unparseable licenses fail closed', () => {
  for (const license of [null, '', 'SEE LICENSE IN LICENSE.md', '(MIT OR Apache-2.0) AND BSD-3-Clause']) {
    assert.equal(isAllowed(license), false, String(license));
  }
});

test('productionPackages: excludes dev-only packages and the root entry', () => {
  const lockfile = {
    packages: {
      '': { name: 'site' },
      'node_modules/a': { version: '1.0.0', license: 'MIT' },
      'node_modules/a/node_modules/b': { version: '2.0.0', license: 'ISC' },
      'node_modules/dev-only': { version: '1.0.0', license: 'GPL-3.0', dev: true },
      'node_modules/khroma': { version: '2.1.0' },
    },
  };
  assert.deepEqual(productionPackages(lockfile), [
    { name: 'a', version: '1.0.0', license: 'MIT' },
    { name: 'b', version: '2.0.0', license: 'ISC' },
    { name: 'khroma', version: '2.1.0', license: 'MIT' },
  ]);
});
