// Headless smoke test: Ancient Temple (temple) — the biggest arena in the
// rotation. Geometry, votability, tier reachability, spawn footing, blast
// KOs at the huge bounds, snapshot fidelity, no regressions elsewhere.
// Run: node test-temple.mjs
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
  const m = MAPS.temple;
  check('temple exists and is named Ancient Temple', !!m && m.name === 'Ancient Temple');
  check('temple is votable (not hidden)', MAP_IDS.includes('temple'));
  check('widest main floor in the rotation', MAP_IDS.every(id => id === 'temple' || MAPS[id].main.w < m.main.w));
  check('widest blast box in the rotation', MAP_IDS.every(id => id === 'temple'
    || (MAPS[id].blast.r - MAPS[id].blast.l) < (m.blast.r - m.blast.l)));
  check('main floor spans ±920 at y=0', m.main.x === -920 && m.main.w === 1840 && m.main.y === 0);
  check('seven platforms, all static', m.plats.length === 7 && m.plats.every(p => !p.move));
  check('every platform floats over the foundation', m.plats.every(p =>
    p.x >= m.main.x && p.x + p.w <= m.main.x + m.main.w && p.y < m.main.y));
  check('all four spawns stand on the foundation', m.spawns.length === 4
    && m.spawns.every(x => x > m.main.x && x < m.main.x + m.main.w));
  check('blast box clears the stage on every side', m.blast.l < m.main.x - 900
    && m.blast.r > m.main.x + m.main.w + 900 && m.blast.t < -1100 && m.blast.b > m.main.h);
}

// --- 2. tier reachability ---
// Single jump clears ~142u (860²/2·2600) plus apex easing; double jump adds
// ~117u more. Rule: every platform must be single-jumpable (≤155u rise) from
// some surface below it that overlaps it horizontally (within a 60u reach),
// except the fallen columns which may ask for a double jump from the ground.
{
  const m = MAPS.temple;
  const surfaces = [{ x: m.main.x, w: m.main.w, y: m.main.y }, ...m.plats];
  const reach = (p, rise) => surfaces.some(s => s !== p && s.y > p.y && s.y - p.y <= rise
    && s.x < p.x + p.w + 60 && s.x + s.w > p.x - 60);
  const singles = m.plats.filter(p => reach(p, 155));
  const doubles = m.plats.filter(p => !reach(p, 155) && reach(p, 259));
  check('every tier is jumpable from a lower surface', singles.length + doubles.length === m.plats.length);
  check('at most the two fallen columns need a double jump', doubles.length <= 2);
  const apex = m.plats.reduce((a, p) => (p.y < a.y ? p : a));
  check('apex bridge crowns the stage above -400', apex.y <= -400 && apex.w >= 300);
}

// --- 3. static, deterministic geometry ---
{
  const at = t => platsAt('temple', t);
  check('platsAt is deterministic', JSON.stringify(at(500)) === JSON.stringify(at(500)));
  check('nothing ever moves', JSON.stringify(at(0)) === JSON.stringify(at(9999)));
}

// --- 4. spawn footing & clean sim ---
{
  const g = new Game(players, 9, 'temple');
  for (let i = 0; i < 30; i++) g.step();
  check('both fighters land grounded on the foundation', g.fighters.every(f => f.grounded && Math.abs(f.y + 32) < 1));
  const inp = blankInput();
  inp.mx = 1;
  g.setInput('A', inp);
  for (let i = 0; i < 300; i++) g.step();
  check('5s sim runs clean on the big floor', !g.over && g.fighters.every(f => !f.dead));
  check('runner is still inside the huge blast box', g.fighters[0].x < MAPS.temple.blast.r);
}

// --- 5. blast KOs at the far bounds ---
{
  const g = new Game(players, 9, 'temple');
  const f = g.fighters[0];
  const before = f.stocks;
  f.x = MAPS.temple.blast.l - 10;
  g.step();
  check('crossing the west blast line costs a stock', f.stocks === before - 1);
  const g2 = new Game(players, 9, 'temple');
  const f2 = g2.fighters[0];
  f2.x = -600; f2.y = MAPS.temple.blast.t - 10;
  g2.step();
  check('sky KO works at the raised ceiling', f2.stocks === before - 1);
}

// --- 6. snapshot fidelity ---
{
  const g = new Game(players, 9, 'temple');
  for (let i = 0; i < 100; i++) g.step();
  const snap = g.snapshot();
  check('snapshot carries the tick', snap.tk === g.tick);
  check('replica geometry matches', JSON.stringify(platsAt('temple', snap.tk)) === JSON.stringify(platsAt('temple', g.tick)));
}

// --- 7. other maps untouched ---
{
  check('battlefield triplat untouched', MAPS.battlefield.plats.length === 3 && MAPS.battlefield.plats.every(p => !p.move));
  check('neon heights keeps its movers', MAPS.skyline.plats.filter(p => p.move).length === 2);
  check('ruined city keeps its movers', MAPS.ruins.plats.filter(p => p.move).length === 3);
  check('dust divide still flat', MAPS.flatlands.plats.length === 0);
  check('training room still hidden', MAPS.training.hidden && !MAP_IDS.includes('training'));
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
