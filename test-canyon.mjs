// Headless smoke test: Canyon Pass (canyon) — a sun-baked medium-sized
// red-rock canyon. Geometry, votability, tier reachability, spawn footing,
// blast KOs, snapshot fidelity, no regressions elsewhere.
// Run: node test-canyon.mjs
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
  const m = MAPS.canyon;
  check('canyon exists and is named Canyon Pass', !!m && m.name === 'Canyon Pass');
  check('canyon is votable (not hidden)', MAP_IDS.includes('canyon'));
  check('a medium arena: smaller than the three large maps', m.main.w < MAPS.coliseum.main.w
    && m.main.w < MAPS.frostspire.main.w && m.main.w < MAPS.temple.main.w);
  check('medium tier is comparable to the other medium maps',
    m.main.w > MAPS.skyline.main.w && m.main.w > MAPS.foundry.main.w);
  check('main floor spans ±360 at y=0', m.main.x === -360 && m.main.w === 720 && m.main.y === 0);
  check('three platforms, exactly one mover (the rope bridge)',
    m.plats.length === 3 && m.plats.filter(p => p.move).length === 1);
  check('every platform floats over the canyon floor', m.plats.every(p =>
    p.x >= m.main.x && p.x + p.w <= m.main.x + m.main.w && p.y < m.main.y));
  check('all four spawns stand on the canyon floor', m.spawns.length === 4
    && m.spawns.every(x => x > m.main.x && x < m.main.x + m.main.w));
  check('blast box clears the stage on every side', m.blast.l < m.main.x - 700
    && m.blast.r > m.main.x + m.main.w + 700 && m.blast.t < -800 && m.blast.b > m.main.h);
}

// --- 2. tier reachability ---
// Single jump clears ~155u; double jump reaches ~259u (same rule used by
// the other map tests, since jump physics are shared across every map).
// Both ledges must be single-jumpable from the floor; the rope bridge is
// allowed to need a double jump straight off the floor.
{
  const m = MAPS.canyon;
  const surfaces = [{ x: m.main.x, w: m.main.w, y: m.main.y }, ...m.plats];
  const reach = (p, rise) => surfaces.some(s => s !== p && s.y > p.y && s.y - p.y <= rise
    && s.x < p.x + p.w + 60 && s.x + s.w > p.x - 60);
  const statics = m.plats.filter(p => !p.move);
  check('both ledges are single-jumpable from the floor', statics.every(p => reach(p, 155)));
  const bridge = m.plats.find(p => p.move);
  check('the rope bridge needs a double jump off the floor, not a single', !reach(bridge, 155) && reach(bridge, 259));
}

// --- 3. deterministic geometry (one live mover) ---
{
  const at = t => platsAt('canyon', t);
  check('platsAt is deterministic', JSON.stringify(at(500)) === JSON.stringify(at(500)));
  check('the rope bridge actually sways over time', JSON.stringify(at(0)) !== JSON.stringify(at(4)));
  check('static plats never move', at(0).filter(p => !p.move).every((p, i) =>
    JSON.stringify(p) === JSON.stringify(at(4).filter(q => !q.move)[i])));
}

// --- 4. spawn footing & clean sim ---
{
  const g = new Game(players, 9, 'canyon');
  for (let i = 0; i < 30; i++) g.step();
  check('both fighters land grounded on the canyon floor', g.fighters.every(f => f.grounded && Math.abs(f.y + 32) < 1));
  const inp = blankInput();
  inp.mx = 1;
  g.setInput('A', inp);
  for (let i = 0; i < 300; i++) g.step();
  check('5s sim runs clean', !g.over && g.fighters.every(f => !f.dead));
  check('runner is still inside the blast box', g.fighters[0].x < MAPS.canyon.blast.r);
}

// --- 5. blast KOs at the far bounds ---
{
  const g = new Game(players, 9, 'canyon');
  const f = g.fighters[0];
  const before = f.stocks;
  f.x = MAPS.canyon.blast.l - 10;
  g.step();
  check('crossing the west blast line costs a stock', f.stocks === before - 1);
  const g2 = new Game(players, 9, 'canyon');
  const f2 = g2.fighters[0];
  f2.x = -180; f2.y = MAPS.canyon.blast.t - 10;
  g2.step();
  check('sky KO works at the ceiling', f2.stocks === before - 1);
}

// --- 6. snapshot fidelity ---
{
  const g = new Game(players, 9, 'canyon');
  for (let i = 0; i < 100; i++) g.step();
  const snap = g.snapshot();
  check('snapshot carries the tick', snap.tk === g.tick);
  check('replica geometry matches', JSON.stringify(platsAt('canyon', snap.tk)) === JSON.stringify(platsAt('canyon', g.tick)));
}

// --- 7. other maps untouched ---
{
  check('temple keeps its seven plats', MAPS.temple.plats.length === 7);
  check('docks keeps its crane', MAPS.docks.plats.filter(p => p.move).length === 1);
  check('coliseum keeps its banner', MAPS.coliseum.plats.filter(p => p.move).length === 1);
  check('battlefield triplat untouched', MAPS.battlefield.plats.length === 3 && MAPS.battlefield.plats.every(p => !p.move));
  check('dust divide still flat', MAPS.flatlands.plats.length === 0);
  check('training room still hidden', MAPS.training.hidden && !MAP_IDS.includes('training'));
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
