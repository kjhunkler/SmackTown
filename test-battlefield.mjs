// Headless smoke test: Sky Bastion (battlefield) — rename only, the sacred
// triplat geometry untouched, still fully static, sim runs clean, no
// regressions elsewhere. Run: node test-battlefield.mjs
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
  const m = MAPS.battlefield;
  check('battlefield renamed to Sky Bastion', m.name === 'Sky Bastion');
  check('main deck geometry unchanged', m.main.x === -340 && m.main.w === 680 && m.main.y === 0);
  check('triplat intact and static', m.plats.length === 3 && m.plats.every(p => !p.move));
  check('triplat positions unchanged',
    m.plats[0].x === -230 && m.plats[0].y === -130 && m.plats[0].w === 170
    && m.plats[1].x === 60 && m.plats[1].y === -130
    && m.plats[2].x === -85 && m.plats[2].y === -250);
  check('blast box unchanged', m.blast.l === -1150 && m.blast.r === 1150);
  check('spawns unchanged', m.spawns.join() === '-240,240,-80,80');
  check('platsAt is static for any tick',
    JSON.stringify(platsAt('battlefield', 0)) === JSON.stringify(platsAt('battlefield', 9999)));
}

// --- 2. sim integrity on the bastion ---
{
  const g = new Game(players, 9, 'battlefield');
  const f = g.fighters[0];
  f.x = -145; f.y = -170; f.vy = 100; f.grounded = false; f.state = 'air';
  g.fighters[1].x = 200; g.fighters[1].y = -32;
  for (let i = 0; i < 30 && f.ridePlat === null; i++) g.step();
  check('fighter lands on a side pad', f.ridePlat === 0 && Math.abs(f.y - (-130 - 32)) < 1);
  const yBefore = f.y;
  for (let i = 0; i < 120; i++) g.step();
  check('static pad never carries its rider', f.ridePlat === 0 && f.y === yBefore);
  const inp = blankInput();
  for (let i = 0; i < 300; i++) {                 // patrol so nobody runs off the lip
    inp.mx = (i % 120) < 60 ? -1 : 1;
    g.setInput('B', inp);
    g.step();
  }
  check('5s sim runs clean', !g.over && g.fighters.every(fx => !fx.dead));
}

// --- 3. other maps untouched ---
{
  check('neon heights keeps its movers', MAPS.skyline.plats.filter(p => p.move).length === 2);
  check('ruined city keeps its movers', MAPS.ruins.plats.filter(p => p.move).length === 3);
  check('overgrown eden keeps its flowers', MAPS.garden.plats.filter(p => p.move).length === 2);
  check('dust divide still flat', MAPS.flatlands.name === 'Dust Divide' && MAPS.flatlands.plats.length === 0);
  check('foundry static and intact', MAPS.foundry.plats.length === 2 && MAPS.foundry.plats.every(p => !p.move));
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
