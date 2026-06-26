/**
 * 从 PokeAPI 同步第一世代 151 只宝可梦（中文名 + 第三世代升级招式）
 * 用法: node scripts/sync-pokemon-pokeapi.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'server', 'data', 'pokemon.json');
const GEN3_GROUPS = new Set(['ruby-sapphire', 'emerald', 'firered-leafgreen']);
const EVOLUTION_STAGE = ['未进化', '1阶进化', '2阶进化'];
const nameCache = new Map();

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchJson(res.headers.location).then(resolve).catch(reject);
          return;
        }
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function pickZhName(names, fallback) {
  const hit = (names || []).find(
    (n) => n.language?.name === 'zh-hans' || n.language?.name === 'zh-Hans'
  );
  return hit?.name || fallback;
}

async function localizedResource(kind, slug, fallback) {
  const key = `${kind}:${slug}`;
  if (nameCache.has(key)) return nameCache.get(key);
  const data = await fetchJson(`https://pokeapi.co/api/v2/${kind}/${slug}/`);
  const name = pickZhName(data.names, fallback || slug);
  nameCache.set(key, name);
  return name;
}

async function localizedType(typeUrl) {
  const data = await fetchJson(typeUrl);
  return pickZhName(data.names, data.name);
}

function evolutionDepth(chain, targetName) {
  let depth = null;
  function walk(node, d) {
    if (node.species.name === targetName) {
      depth = d;
      return true;
    }
    for (const evo of node.evolves_to || []) {
      if (walk(evo, d + 1)) return true;
    }
    return false;
  }
  walk(chain, 0);
  return depth ?? 0;
}

async function syncOne(id) {
  const species = await fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${id}/`);
  const pokemon = await fetchJson(`https://pokeapi.co/api/v2/pokemon/${id}/`);
  const name = pickZhName(species.names, species.name);
  const englishName =
    species.names.find((n) => n.language.name === 'en')?.name ||
    species.name.charAt(0).toUpperCase() + species.name.slice(1);

  const genus = species.genera.find((g) => g.language.name === 'zh-hans' || g.language.name === 'zh-Hans')?.genus || '';
  const category = genus || `${name}宝可梦`;

  const types = await Promise.all(pokemon.types.map((t) => localizedType(t.type.url)));
  const type1 = types[0] || null;
  const type2 = types[1] || null;

  const stats = {};
  for (const s of pokemon.stats) {
    stats[s.stat.name] = s.base_stat;
  }
  const baseStatTotal = Object.values(stats).reduce((a, b) => a + b, 0);

  const abilities = await Promise.all(
    pokemon.abilities.map(async (a) => ({
      name: await localizedResource('ability', a.ability.name, a.ability.name),
      hidden: a.is_hidden,
    }))
  );
  const primaryAbility = abilities.find((a) => !a.hidden)?.name || abilities[0]?.name || null;
  const hiddenAbility = abilities.find((a) => a.hidden)?.name || null;

  let evolutionStage = '未进化';
  if (species.evolution_chain?.url) {
    const chainData = await fetchJson(species.evolution_chain.url);
    const depth = evolutionDepth(chainData.chain, species.name);
    evolutionStage = EVOLUTION_STAGE[Math.min(depth, 2)] || '未进化';
  }

  const moveSet = new Set();
  for (const m of pokemon.moves) {
    const hasGen3Level = (m.version_group_details || []).some(
      (d) => GEN3_GROUPS.has(d.version_group.name) && d.move_learn_method.name === 'level-up'
    );
    if (!hasGen3Level) continue;
    const moveName = await localizedResource('move', m.move.name, m.move.name);
    if (moveName) moveSet.add(moveName);
  }
  const gen3LevelMoves = [...moveSet].sort((a, b) => a.localeCompare(b, 'zh-Hans'));

  return {
    id: species.name,
    name,
    englishName,
    aliases: englishName !== name ? [englishName] : [],
    dexNumber: species.id,
    type1,
    type2,
    evolutionStage,
    category,
    ability: primaryAbility,
    hiddenAbility,
    hp: stats.hp,
    attack: stats.attack,
    defense: stats.defense,
    spAttack: stats['special-attack'],
    spDefense: stats['special-defense'],
    speed: stats.speed,
    baseStatTotal,
    gen3LevelMoves,
    imageUrl:
      pokemon.sprites?.other?.['official-artwork']?.front_default ||
      pokemon.sprites?.front_default ||
      null,
  };
}

async function main() {
  const players = [];
  for (let id = 1; id <= 151; id++) {
    process.stdout.write(`\r同步 #${id}/151...`);
    try {
      players.push(await syncOne(id));
    } catch (e) {
      console.error(`\n#${id} failed:`, e.message);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log(`\n完成 ${players.length}/151，写入 ${OUT}`);
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        source: 'pokeapi-gen1-gen3-moves',
        players,
      },
      null,
      2
    ),
    'utf-8'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
