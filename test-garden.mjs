// Headless smoke test: Overgrown Eden (garden) — log bridge intact, two
// gently bobbing flower-head platforms, deterministic motion, rider carry,
// snapshot fidelity, no regressions elsewhere. Run: node test-garden.mjs
import { Game, MAPS, platsAt, blankInput } from './js/game.js';

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
  const m = MAPS.garden;
  check('garden renamed to Overgrown Eden', m.name === 'Overgrown Eden');
  check('main shelf geometry unchanged', m.main.x === -460 && m.main.w === 920 && m.main.y === 0);
  check('log bridge unchanged', m.plats[0].x === -90 && m.plats[0].y === -205 && m.plats[0].w === 180 && !m.plats[0].move);
  check('two flower movers added', m.plats.filter(p => p.move).length === 2);
  check('flowers bob vertically only', m.plats.filter(p => p.move).every(p => p.move.dy === 70 && !p.move.dx));
  check('blast box & spawns unchanged', m.blast.l === -1260 && m.blast.r === 1260
    && m.spawns.join() === '-330,330,-120,120');
}

// --- 2. deterministic motion ---
{
  const at = t => platsAt('garden', t);
  check('platsAt is deterministic', JSON.stringify(at(500)) === JSON.stringify(at(500)));
  const west = at(0)[1];
  const period = 12 * 60;                                 // 12s at 60tps
  check('flower returns after full period', Math.abs(at(period)[1].y - west.y) < 0.001);
  const ys = [0, 90, 180, 270, 360, 450, 540, 630].map(t => at(t)[1].y);
  const span = Math.max(...ys) - Math.min(...ys);
  check('flower sweeps its 70px bob', span > 100 && span <= 140.001);
  check('log bridge never moves', at(0)[0].y === at(377)[0].y && at(0)[0].x === at(377)[0].x);
  const w0 = at(0)[1].y, e0 = at(0)[2].y;
  check('east flower runs half a period out of phase', Math.abs(at(6 * 60)[1].y - e0) < 0.001
    && Math.abs(at(6 * 60)[2].y - w0) < 0.001);
}

// --- 3. rider carry on a flower head ---
{
  const g = new Game(players, 9, 'garden');
  const f = g.fighters[0];
  const p0 = platsAt('garden', 1)[1];
  f.x = p0.x + p0.w / 2; f.y = p0.y - 40; f.vy = 0;
  g.fighters[1].x = 0; g.fighters[1].y = -32;
  for (let i = 0; i < 30 && f.ridePlat !== 1; i++) g.step();
  check('fighter lands and rides the flower', f.ridePlat === 1);
  const yA = f.y;
  for (let i = 0; i < 120; i++) g.step();
  check('rider is carried with the bob', f.ridePlat === 1 && Math.abs(f.y - yA) > 5);
  const pNow = platsAt('garden', g.tick)[1];
  check('rider glued to the pad surface', Math.abs((f.y + 32) - pNow.y) < 1);
  f.dropT = 0.25;                                         // sim's drop-through window
  g.step();
  check('drop-through releases the flower', f.ridePlat !== 1 && !f.grounded);
}

// --- 4. snapshot fidelity mid-bob ---
{
  const g = new Game(players, 9, 'garden');
  const f = g.fighters[0];
  const p0 = platsAt('garden', 1)[1];
  f.x = p0.x + p0.w / 2; f.y = p0.y - 40; f.vy = 0;
  g.fighters[1].x = 0; g.fighters[1].y = -32;
  for (let i = 0; i < 200; i++) g.step();
  const snap = g.snapshot();
  const row = snap.f.find(r => r[0] === 'A');
  check('snapshot carries tick and ridePlat', snap.tk === g.tick && row[33] === 1);
  const p2 = platsAt('garden', snap.tk)[1];
  check('replica derives identical flower pos', Math.abs(p2.y - platsAt('garden', g.tick)[1].y) < 0.001);
}

// --- 5. sim integrity & other maps ---
{
  const g = new Game(players, 9, 'garden');
  const inp = blankInput();
  inp.mx = 1;
  g.setInput('A', inp);
  for (let i = 0; i < 300; i++) g.step();
  check('5s sim runs clean on the shelf', !g.over && g.fighters.every(f => !f.dead));
  check('neon heights keeps its movers', MAPS.skyline.plats.filter(p => p.move).length === 2);
  check('ruined city keeps its movers', MAPS.ruins.plats.filter(p => p.move).length === 3);
  check('dust divide still flat', MAPS.flatlands.name === 'Dust Divide' && MAPS.flatlands.plats.length === 0);
  check('battlefield/foundry untouched',
    MAPS.battlefield.plats.length === 3 && MAPS.foundry.plats.length === 2
    && [...MAPS.battlefield.plats, ...MAPS.foundry.plats].every(p => !p.move));
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
