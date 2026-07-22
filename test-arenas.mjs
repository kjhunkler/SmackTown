// Headless smoke test: the six v212 arenas — Sakura Shrine, Corsair
// Galleon and Star Observatory (small); Storm Citadel, Fusion Core and
// World Tree Roots (large). Geometry invariants hold, every new map is
// votable, the sim runs clean on each, and movers actually move.
// Run: node test-arenas.mjs
import { Game, MAPS, MAP_IDS, mapsOfSize, platsAt, blankInput } from './js/game.js';

let n = 0, fails = 0;
function check(name, ok) {
  n++;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}. ${name}`);
}

const build = () => ({ stats: { power: 0, speed: 0, defense: 0, agility: 0 }, abilities: [], augments: [] });
const players = [
  { id: 'A', name: 'Alice', color: '#f00', build: build() },
  { id: 'B', name: 'Bob', color: '#0f0', build: build() },
];

const SMALL = ['shrine', 'galleon', 'observatory'];
const LARGE = ['citadel', 'reactor', 'roots'];
const NEW_MAPS = [...SMALL, ...LARGE];

// --- 1. rotation & size classes ---
{
  check('all six arenas are votable', NEW_MAPS.every(id => MAP_IDS.includes(id)));
  check('shrine/galleon/observatory are small', SMALL.every(id => MAPS[id].size === 'small'));
  check('citadel/reactor/roots are large', LARGE.every(id => MAPS[id].size === 'large'));
  check('six maps per size class',
    mapsOfSize('small').length === 6 && mapsOfSize('medium').length === 6 && mapsOfSize('large').length === 6);
}

// --- 2. geometry invariants on every new map ---
for (const id of NEW_MAPS) {
  const m = MAPS[id];
  const mainL = m.main.x, mainR = m.main.x + m.main.w;
  check(`${id}: blast box contains the whole stage`,
    m.blast.l < mainL && m.blast.r > mainR && m.blast.t < -500 && m.blast.b > m.main.h);
  check(`${id}: all spawns are over solid ground`,
    m.spawns.every(x => x > mainL + 20 && x < mainR - 20));
  check(`${id}: respawn point is inside the blast box`, m.respawnY > m.blast.t);
  // every static plat must be single-jumpable (≤150u) from some tier below
  // it — another static plat or the ground at y=0
  const statics = m.plats.filter(p => !p.move);
  check(`${id}: every static tier is single-jumpable from below`, statics.every(p => {
    const supports = [0, ...statics.filter(q => q !== p && q.y > p.y).map(q => q.y)];
    return supports.some(y => y - p.y <= 150);
  }));
}

// --- 3. movers move, statics don't ---
const MOVERS = { shrine: 0, galleon: 1, observatory: 1, citadel: 1, reactor: 1, roots: 1 };
for (const id of NEW_MAPS) {
  check(`${id}: mover count as designed`, MAPS[id].plats.filter(p => p.move).length === MOVERS[id]);
  const a = platsAt(id, 0), b = platsAt(id, 90);
  const moved = a.some((p, i) => p.x !== b[i].x || p.y !== b[i].y);
  check(`${id}: platsAt reflects its movers`, MAPS[id].plats.some(p => p.move) ? moved : !moved);
}

// --- 4. sim integrity: 5s clean run on each arena ---
for (const id of NEW_MAPS) {
  const g = new Game(players, 7, id);
  const inp = blankInput();
  for (let i = 0; i < 300; i++) {                 // patrol so nobody runs off the lip
    inp.mx = (i % 120) < 60 ? -1 : 1;
    g.setInput('B', inp);
    g.step();
  }
  check(`${id}: 5s sim runs clean`, !g.over && g.fighters.every(f => !f.dead && Number.isFinite(f.x) && Number.isFinite(f.y)));
}

// --- 5. blast KO still works on a new large map ---
{
  const g = new Game(players, 7, 'citadel');
  const f = g.fighters[0];
  const before = f.stocks;
  f.x = MAPS.citadel.blast.l - 10;
  g.step();
  check('citadel: crossing the blast line costs a stock', f.stocks === before - 1);
}

// --- 6. legacy maps untouched ---
{
  check('battlefield triplat untouched', MAPS.battlefield.plats.length === 3 && MAPS.battlefield.plats.every(p => !p.move));
  check('temple keeps its seven plats', MAPS.temple.plats.length === 7);
  check('training still hidden from the vote', !MAP_IDS.includes('training') && !MAP_IDS.includes('expanse'));
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
