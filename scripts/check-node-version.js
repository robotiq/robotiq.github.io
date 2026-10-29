// Fails if the running Node.js bundles a Brotli decoder vulnerable to
// CVE-2026-111497 ("Node2Shell"): a crafted Brotli stream can corrupt
// memory in whatever decompresses it, and the build decompresses one —
// fetch() in fetch-profile-readme.js accepts `Content-Encoding: br`.
// Runs first in ci.yml and deploy.yml (before npm ci),
// and again via npm run generate.
//
// Only release lines with a fix are accepted, each from its first fixed
// version. Node 20 never got a fix, and odd lines (23, 25) are end of life.
// To move to a new line, add its first fixed version here, then update
// engines in package.json and .nvmrc.
// https://www.aikido.dev/blog/python-packages-vulnerable-node2shell-brotli-cve-2026-111497

const FIXED = {
  22: [22, 23, 4],
  24: [24, 22, 1],
  26: [26, 12, 1],
};

function isFixed(version) {
  const parts = version.replace(/^v/, '').split('.').map(Number);
  const minimum = FIXED[parts[0]];
  if (!minimum) return false;
  for (let i = 1; i < 3; i++) {
    if (parts[i] !== minimum[i]) return parts[i] > minimum[i];
  }
  return true;
}

if (require.main === module) {
  if (!isFixed(process.version)) {
    const accepted = Object.values(FIXED).map((v) => `>=${v.join('.')}`).join(', ');
    console.error(`check-node-version.js: Node ${process.version} is vulnerable to CVE-2026-111497; use one of ${accepted}`);
    process.exit(1);
  }
  console.log(`check-node-version.js: Node ${process.version} is not affected by CVE-2026-111497`);
}
