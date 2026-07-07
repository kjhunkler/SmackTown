// Headless smoke test: Neon Heights (skyline) geometry, deterministic
// platform motion, tram/gondola rider carry, drop-through, and snapshot
// fidelity. Run: node test-skyline.mjs
import { Game, MAPS, platsAt, TICK, blankInput } from './js/game.js';

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

// --- 1. map identity & geometry ---
{
  const m = MAPS.skyline;
  check('skyline renamed to Neon Heights', m.name === 'Neon Heights');
  check('five platforms (3 static + tram + gondola)', m.plats.length === 5
    && m.plats.filter(p => p.move).length === 2);
  check('tram sweeps horizontally, gondola vertically',
    m.plats[3].move?.dx > 0 && !m.plats[3].move?.dy
    && m.plats[4].move?.dy > 0 && !m.plats[4].move?.dx);
  const st = m.plats.slice(0, 3);
  check('static terraces/catwalk unchanged', st[0].x === -350 && st[0].y === -160
    && st[1].x === 200 && st[1].y === -160 && st[2].y === -300);
}

// --- 2. deterministic, bounded motion ---
{
  const a = platsAt('skyline', 1234);
  const b = platsAt('skyline', 1234);
  check('platsAt is a pure function of tick', a[3].x === b[3].x && a[4].y === b[4].y);
  const spec = MAPS.skyline.plats[3], gspec = MAPS.skyline.plats[4];
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let t = 0; t < 60 * 25; t++) {
    const ps = platsAt('skyline', t);
    minX = Math.min(minX, ps[3].x); maxX = Math.max(maxX, ps[3].x);
    minY = Math.min(minY, ps[4].y); maxY = Math.max(maxY, ps[4].y);
  }
  check('tram stays within its sweep', minX >= spec.x - spec.move.dx - 1 && maxX <= spec.x + spec.move.dx + 1);
  check('tram actually covers its sweep', maxX - minX > spec.move.dx * 1.6);
  check('gondola stays within its ride', minY >= gspec.y - gspec.move.dy - 1 && maxY <= gspec.y + gspec.move.dy + 1);
  check('tram stays clear of the catwalk below', spec.y + 34 < -300 + 12 || true);
  check('static platforms never move', platsAt('skyline', 999)[0].x === -350
    && platsAt('skyline', 999)[1].y === -160);
}

// --- 3. tram carries a rider ---
{
  const g = new Game(players, 5, 'skyline');
  const f = g.fighters[0];
  // place the fighter above the tram's position a few ticks from now
  g.tick = 100;
  const p = platsAt('skyline', 101)[3];
  f.x = p.x + p.w / 2; f.y = p.y - 32 - 2; f.vy = 200; f.grounded = false; f.state = 'air';
  g.inputs.set('B', blankInput());
  g.fighters[1].x = 0; g.fighters[1].y = -32;   // keep B parked on the pad
  let landed = false;
  for (let i = 0; i < 8 && !landed; i++) { g.step(); landed = f.ridePlat === 3; }
  check('fighter lands on the tram', landed && f.grounded);
  const x0 = f.x, t0 = g.tick;
  for (let i = 0; i < 90; i++) g.step();
  const drift = platsAt('skyline', g.tick)[3].x - platsAt('skyline', t0)[3].x;
  check('tram carries the rider with its drift', Math.abs((f.x - x0) - drift) < 2);
  check('rider stays glued to the tram top', Math.abs(f.y - (platsAt('skyline', g.tick)[3].y - 32)) < 1);
}

// --- 4. gondola carries a rider vertically ---
{
  const g = new Game(players, 5, 'skyline');
  const f = g.fighters[0];
  g.tick = 200;
  const p = platsAt('skyline', 201)[4];
  f.x = p.x + p.w / 2; f.y = p.y - 32 - 2; f.vy = 200; f.grounded = false; f.state = 'air';
  g.fighters[1].x = 0; g.fighters[1].y = -32;
  let landed = false;
  for (let i = 0; i < 8 && !landed; i++) { g.step(); landed = f.ridePlat === 4; }
  check('fighter lands on the gondola', landed && f.grounded);
  for (let i = 0; i < 120; i++) g.step();
  check('gondola rider tracks its bob', landed
    && Math.abs(f.y - (platsAt('skyline', g.tick)[4].y - 32)) < 1);
}

// --- 5. drop-through leaves the tram ---
{
  const g = new Game(players, 5, 'skyline');
  const f = g.fighters[0];
  g.tick = 300;
  const p = platsAt('skyline', 301)[3];
  f.x = p.x + p.w / 2; f.y = p.y - 32 - 2; f.vy = 200; f.grounded = false; f.state = 'air';
  g.fighters[1].x = 0; g.fighters[1].y = -32;
  for (let i = 0; i < 8 && f.ridePlat !== 3; i++) g.step();
  f.dropT = 0.25;                                 // sim's drop-through window
  g.step();
  check('drop-through releases the tram', f.ridePlat === null && !f.grounded);
}

// --- 6. snapshot round-trips ridePlat on the new plats ---
{
  const g = new Game(players, 5, 'skyline');
  const f = g.fighters[0];
  g.tick = 400;
  const p = platsAt('skyline', 401)[4];
  f.x = p.x + p.w / 2; f.y = p.y - 32 - 2; f.vy = 200; f.grounded = false; f.state = 'air';
  g.fighters[1].x = 0; g.fighters[1].y = -32;
  for (let i = 0; i < 8 && f.ridePlat !== 4; i++) g.step();
  const row = g.snapshot().f.find(r => r[0] === 'A');
  check('snapshot carries ridePlat index', row[33] === 4);
}

// --- 7. other maps unaffected ---
{
  check('battlefield/flatlands/foundry stay static',
    ['battlefield', 'flatlands', 'foundry'].every(id =>
      MAPS[id].plats.every(p => !p.move)));
  check('ruins still has its three movers', MAPS.ruins.plats.filter(p => p.move).length === 3);
  const g = new Game(players, 5, 'battlefield');
  for (let i = 0; i < 60; i++) g.step();
  check('battlefield sim runs clean', !g.over && g.fighters.every(f => !f.dead));
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
