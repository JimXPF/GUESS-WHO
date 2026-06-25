/**
 * Re-apply CS:GO positions from meta.teamIgls + per-player sniperStat.
 * Usage: node scripts/reinfer-csgo-positions.js
 */
const { loadTheme, saveTheme } = require('./lib/theme-data');
const { inferTeamPositions, buildPositionMaps } = require('./lib/csgo-roster-utils');

function main() {
  const theme = loadTheme('csgo');
  const byTeam = new Map();

  for (const p of theme.players) {
    if (!byTeam.has(p.team)) byTeam.set(p.team, []);
    byTeam.get(p.team).push(p);
  }

  const positionMaps = buildPositionMaps([]);
  for (const roster of byTeam.values()) {
    inferTeamPositions(roster, positionMaps);
  }

  saveTheme('csgo', theme.players);

  const withStat = theme.players.filter((p) => p.sniperStat != null).length;
  const dual = theme.players.filter((p) => p.position === '狙击手/指挥');
  console.log(`Positions updated for ${byTeam.size} teams.`);
  console.log(`Players with sniperStat: ${withStat}/${theme.players.length}`);
  if (dual.length) {
    console.log(`狙击手/指挥: ${dual.map((p) => `${p.name} (${p.team})`).join(', ')}`);
  }
}

main();
