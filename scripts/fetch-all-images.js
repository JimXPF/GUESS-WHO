/**
 * Fetch CS:GO player avatars from Perfect World data center.
 *
 * Usage: node scripts/fetch-all-images.js [--force]
 */
const { spawnSync } = require('child_process');
const path = require('path');
const { printCoverage } = require('./lib/image-utils');

const root = path.join(__dirname, '..');
const extraArgs = process.argv.includes('--force') ? ['--force'] : [];

console.log('=== Guess Who: fetch CS:GO images (Perfect World) ===\n');

const res = spawnSync(
  process.execPath,
  [path.join(__dirname, 'scrape-csgo-wanmei.js'), ...extraArgs],
  { cwd: root, stdio: 'inherit' }
);
if (res.status !== 0) process.exit(res.status ?? 1);

printCoverage();
