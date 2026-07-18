// Headless smoke test: Coliseum Sands (coliseum) — sunken gladiator pit
// under a royal box. Geometry, votability, tier reachability, spawn
// footing, blast KOs, snapshot fidelity, no regressions elsewhere.
// Run: node test-coliseum.mjs
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
  const m = MAPS.coliseum;
  check('coliseum exists and is named Coliseum Sands', !!m && m.name === 'Coliseum Sands');
  check('coliseum is votable (not hidden)', MAP_IDS.includes('coliseum'));
  check('a large arena, but not the biggest (temple keeps that crown)',
    m.main.w < MAPS.temple.main.w && m.main.w > MAPS.battlefield.main.w);
  check('main floor spans ±750 at y=0', m.main.x === -750 && m.main.w === 1500 && m.main.y === 0);
  check('six platforms, exactly one mover (the swinging banner)',
    m.plats.length === 6 && m.plats.filter(p => p.move).length === 1);
  check('every platform floats over the arena floor', m.plats.every(p =>
    p.x >= m.main.x && p.x + p.w <= m.main.x + m.main.w && p.y < m.main.y));
  check('all four spawns stand on the arena floor', m.spawns.length === 4
    && m.spawns.every(x => x > m.main.x && x < m.main.x + m.main.w));
  check('blast box clears the stage on every side', m.blast.l < m.main.x - 650
    && m.blast.r > m.main.x + m.main.w + 650 && m.blast.t < -1100 && m.blast.b > m.main.h);
}

// --- 2. tier reachability ---
// Single jump clears ~155u; double jump reaches ~259u (same rule used by
// test-temple.mjs and test-frostspire.mjs, since jump physics are shared
// across every map). Every static stand/terrace/box must be single-jumpable
// from a lower surface overlapping it horizontally (within 60u); the
// swinging banner is the one platform allowed to need a double jump.
{
  const m = MAPS.coliseum;
  const surfaces = [{ x: m.main.x, w: m.main.w, y: m.main.y }, ...m.plats];
  const reach = (p, rise) => surfaces.some(s => s !== p && s.y > p.y && s.y - p.y <= rise
    && s.x < p.x + p.w + 60 && s.x + s.w > p.x - 60);
  const statics = m.plats.filter(p => !p.move);
  check('every static tier is single-jumpable from a lower surface', statics.every(p => reach(p, 155)));
  const banner = m.plats.find(p => p.move);
  check('the swinging banner needs a double jump off the floor, not a single', !reach(banner, 155) && reach(banner, 259));
  const apex = m.plats.reduce((a, p) => (p.y < a.y ? p : a));
  check('royal box crowns the stage above -400', apex.y <= -400 && apex.w >= 300);
}

// --- 3. deterministic geometry (one live mover) ---
{
  const at = t => platsAt('coliseum', t);
  check('platsAt is deterministic', JSON.stringify(at(500)) === JSON.stringify(at(500)));
  check('the banner actually moves over time', JSON.stringify(at(0)) !== JSON.stringify(at(4)));
  check('static plats never move', at(0).filter(p => !p.move).every((p, i) =>
    JSON.stringify(p) === JSON.stringify(at(4).filter(q => !q.move)[i])));
}

// --- 4. spawn footing & clean sim ---
{
  const g = new Game(players, 9, 'coliseum');
  for (let i = 0; i < 30; i++) g.step();
  check('both fighters land grounded on the arena floor', g.fighters.every(f => f.grounded && Math.abs(f.y + 32) < 1));
  const inp = blankInput();
  inp.mx = 1;
  g.setInput('A', inp);
  for (let i = 0; i < 300; i++) g.step();
  check('5s sim runs clean on the big floor', !g.over && g.fighters.every(f => !f.dead));
  check('runner is still inside the blast box', g.fighters[0].x < MAPS.coliseum.blast.r);
}

// --- 5. blast KOs at the far bounds ---
{
  const g = new Game(players, 9, 'coliseum');
  const f = g.fighters[0];
  const before = f.stocks;
  f.x = MAPS.coliseum.blast.l - 10;
  g.step();
  check('crossing the west blast line costs a stock', f.stocks === before - 1);
  const g2 = new Game(players, 9, 'coliseum');
  const f2 = g2.fighters[0];
  f2.x = -600; f2.y = MAPS.coliseum.blast.t - 10;
  g2.step();
  check('sky KO works at the raised ceiling', f2.stocks === before - 1);
}

// --- 6. snapshot fidelity ---
{
  const g = new Game(players, 9, 'coliseum');
  for (let i = 0; i < 100; i++) g.step();
  const snap = g.snapshot();
  check('snapshot carries the tick', snap.tk === g.tick);
  check('replica geometry matches', JSON.stringify(platsAt('coliseum', snap.tk)) === JSON.stringify(platsAt('coliseum', g.tick)));
}

// --- 7. other maps untouched ---
{
  check('temple keeps its seven plats', MAPS.temple.plats.length === 7);
  check('frostspire keeps its floe', MAPS.frostspire.plats.filter(p => p.move).length === 1);
  check('battlefield triplat untouched', MAPS.battlefield.plats.length === 3 && MAPS.battlefield.plats.every(p => !p.move));
  check('neon heights keeps its movers', MAPS.skyline.plats.filter(p => p.move).length === 2);
  check('dust divide still flat', MAPS.flatlands.plats.length === 0);
  check('training room still hidden', MAPS.training.hidden && !MAP_IDS.includes('training'));
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
