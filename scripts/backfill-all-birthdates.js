/**
 * Backfill birthDate for csgo + nba from local caches / Hupu (no Wikipedia).
 *
 * Usage:
 *   node scripts/backfill-all-birthdates.js
 *   node scripts/backfill-all-birthdates.js --themes csgo,nba
 *   node scripts/backfill-all-birthdates.js --only-missing
 */
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const themesArg = (() => {
  const i = args.indexOf('--themes');
  return i >= 0 ? args[i + 1].split(',') : ['csgo', 'nba'];
})();
const passArgs = args.filter((a, i) => {
  if (a === '--themes') return false;
  if (i > 0 && args[i - 1] === '--themes') return false;
  return true;
});

const scripts = {
  csgo: 'backfill-csgo-birthdates.js',
  nba: 'backfill-nba-birthdates.js',
};

for (const theme of themesArg) {
  const script = scripts[theme];
  if (!script) {
    console.error(`Unknown theme: ${theme} (supported: csgo, nba)`);
    process.exit(1);
  }
  console.log(`\n========== ${theme.toUpperCase()} ==========\n`);
  const res = spawnSync(process.execPath, [path.join(__dirname, script), ...passArgs], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
  if (res.status !== 0) process.exit(res.status || 1);
}

console.log('\nAll birthdate backfills complete.');
