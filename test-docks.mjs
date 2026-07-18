// Headless smoke test: Sunken Docks (docks) — a foggy medium-sized harbor
// pier. Geometry, votability, tier reachability, spawn footing, blast KOs,
// snapshot fidelity, no regressions elsewhere.
// Run: node test-docks.mjs
import { Game, MAPS, MAP_IDS, platsAt, blankInput } from './js/game.js';

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

// --- 1. identity & geometry ---
{
  const m = MAPS.docks;
  check('docks exists and is named Sunken Docks', !!m && m.name === 'Sunken Docks');
  check('docks is votable (not hidden)', MAP_IDS.includes('docks'));
  check('a medium arena: smaller than the three large maps', m.main.w < MAPS.coliseum.main.w
    && m.main.w < MAPS.frostspire.main.w && m.main.w < MAPS.temple.main.w);
  check('medium tier is comparable to ruins/garden, not the tiny stages',
    m.main.w > MAPS.skyline.main.w && m.main.w > MAPS.foundry.main.w);
  check('main floor spans ±500 at y=0', m.main.x === -500 && m.main.w === 1000 && m.main.y === 0);
  check('three platforms, exactly one mover (the crane)',
    m.plats.length === 3 && m.plats.filter(p => p.move).length === 1);
  check('every platform floats over the boardwalk', m.plats.every(p =>
    p.x >= m.main.x && p.x + p.w <= m.main.x + m.main.w && p.y < m.main.y));
  check('all four spawns stand on the boardwalk', m.spawns.length === 4
    && m.spawns.every(x => x > m.main.x && x < m.main.x + m.main.w));
  check('blast box clears the stage on every side', m.blast.l < m.main.x - 700
    && m.blast.r > m.main.x + m.main.w + 700 && m.blast.t < -800 && m.blast.b > m.main.h);
}

// --- 2. tier reachability ---
// Single jump clears ~155u; double jump reaches ~259u (same rule used by
// the other map tests, since jump physics are shared across every map).
// Both pier stacks must be single-jumpable from the boardwalk; the crane
// is allowed to need a double jump straight off the floor.
{
  const m = MAPS.docks;
  const surfaces = [{ x: m.main.x, w: m.main.w, y: m.main.y }, ...m.plats];
  const reach = (p, rise) => surfaces.some(s => s !== p && s.y > p.y && s.y - p.y <= rise
    && s.x < p.x + p.w + 60 && s.x + s.w > p.x - 60);
  const statics = m.plats.filter(p => !p.move);
  check('both pier stacks are single-jumpable from the boardwalk', statics.every(p => reach(p, 155)));
  const crane = m.plats.find(p => p.move);
  check('the crane needs a double jump off the floor, not a single', !reach(crane, 155) && reach(crane, 259));
}

// --- 3. deterministic geometry (one live mover) ---
{
  const at = t => platsAt('docks', t);
  check('platsAt is deterministic', JSON.stringify(at(500)) === JSON.stringify(at(500)));
  check('the crane actually moves over time', JSON.stringify(at(0)) !== JSON.stringify(at(4)));
  check('static plats never move', at(0).filter(p => !p.move).every((p, i) =>
    JSON.stringify(p) === JSON.stringify(at(4).filter(q => !q.move)[i])));
}

// --- 4. spawn footing & clean sim ---
{
  const g = new Game(players, 9, 'docks');
  for (let i = 0; i < 30; i++) g.step();
  check('both fighters land grounded on the boardwalk', g.fighters.every(f => f.grounded && Math.abs(f.y + 32) < 1));
  const inp = blankInput();
  inp.mx = 1;
  g.setInput('A', inp);
  for (let i = 0; i < 300; i++) g.step();
  check('5s sim runs clean', !g.over && g.fighters.every(f => !f.dead));
  check('runner is still inside the blast box', g.fighters[0].x < MAPS.docks.blast.r);
}

// --- 5. blast KOs at the far bounds ---
{
  const g = new Game(players, 9, 'docks');
  const f = g.fighters[0];
  const before = f.stocks;
  f.x = MAPS.docks.blast.l - 10;
  g.step();
  check('crossing the west blast line costs a stock', f.stocks === before - 1);
  const g2 = new Game(players, 9, 'docks');
  const f2 = g2.fighters[0];
  f2.x = -200; f2.y = MAPS.docks.blast.t - 10;
  g2.step();
  check('sky KO works at the ceiling', f2.stocks === before - 1);
}

// --- 6. snapshot fidelity ---
{
  const g = new Game(players, 9, 'docks');
  for (let i = 0; i < 100; i++) g.step();
  const snap = g.snapshot();
  check('snapshot carries the tick', snap.tk === g.tick);
  check('replica geometry matches', JSON.stringify(platsAt('docks', snap.tk)) === JSON.stringify(platsAt('docks', g.tick)));
}

// --- 7. other maps untouched ---
{
  check('temple keeps its seven plats', MAPS.temple.plats.length === 7);
  check('frostspire keeps its floe', MAPS.frostspire.plats.filter(p => p.move).length === 1);
  check('coliseum keeps its banner', MAPS.coliseum.plats.filter(p => p.move).length === 1);
  check('battlefield triplat untouched', MAPS.battlefield.plats.length === 3 && MAPS.battlefield.plats.every(p => !p.move));
  check('ruined city keeps its movers', MAPS.ruins.plats.filter(p => p.move).length === 3);
  check('training room still hidden', MAPS.training.hidden && !MAP_IDS.includes('training'));
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
