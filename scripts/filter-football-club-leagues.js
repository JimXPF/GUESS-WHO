/**
 * Tag every football player with clubLeague; set allowed league whitelist in meta.
 * Does NOT remove players — question pool filtering happens at runtime.
 *
 * Usage: node scripts/filter-football-club-leagues.js [source.json]
 */
const fs = require('fs');
const path = require('path');
const { saveThemeData } = require('./lib/image-utils');

const ALLOWED_CLUB_LEAGUES = [
  { id: 'premier-league', label: '英超球员', name: '英超' },
  { id: 'la-liga', label: '西甲球员', name: '西甲' },
  { id: 'serie-a', label: '意甲球员', name: '意甲' },
  { id: 'bundesliga', label: '德甲球员', name: '德甲' },
  { id: 'ligue-1', label: '法甲球员', name: '法甲' },
  { id: 'mls', label: '美职联球员', name: '美职联' },
  { id: 'saudi-pro-league', label: '沙特联球员', name: '沙特联' },
  { id: 'j-league', label: 'J联赛球员', name: 'J联赛' },
  { id: 'k-league', label: 'K联赛球员', name: 'K联赛' },
  { id: 'csl', label: '中超球员', name: '中超' },
  { id: 'eredivisie', label: '荷甲球员', name: '荷甲' },
  { id: 'primeira-liga', label: '葡超球员', name: '葡超' },
];

const ALLOWED_LABELS = new Set(ALLOWED_CLUB_LEAGUES.map((l) => l.label));

function main() {
  const sourcePath =
    process.argv[2] ||
    (fs.existsSync(path.join(__dirname, '../dist/server/data/football.json'))
      ? path.join(__dirname, '../dist/server/data/football.json')
      : path.join(__dirname, '../server/data/football.json'));

  const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
  const clubLeagues = raw.meta?.clubLeagues ?? {};
  const players = raw.players ?? [];

  const tagged = players.map((player) => {
    const club = String(player.club || '').trim();
    const league = club && club !== '无' ? clubLeagues[club] || null : null;
    const next = { ...player };
    if (league) next.clubLeague = league;
    else delete next.clubLeague;
    return next;
  });

  saveThemeData('football.json', tagged, {
    clubLeaguePolicy: 'filterAtQuestionTime',
    allowedClubLeagues: ALLOWED_CLUB_LEAGUES,
    clubLeagues,
  });

  const playable = tagged.filter(
    (p) => p.clubLeague && ALLOWED_LABELS.has(p.clubLeague)
  );

  console.log('=== Football club league tagging ===');
  console.log(`Source: ${sourcePath}`);
  console.log(`Players in bank: ${tagged.length}`);
  console.log(`Playable at question time: ${playable.length}`);
  console.log(`clubLeagues map: ${Object.keys(clubLeagues).length} clubs`);
  console.log('Playable by league:');
  const byLeague = {};
  for (const p of playable) byLeague[p.clubLeague] = (byLeague[p.clubLeague] || 0) + 1;
  for (const { label } of ALLOWED_CLUB_LEAGUES) {
    console.log(`  ${label}: ${byLeague[label] || 0}`);
  }
}

main();
