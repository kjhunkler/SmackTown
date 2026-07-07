// Headless smoke test: Dust Divide (flatlands) — rename only, geometry
// untouched, still perfectly flat, sim runs clean. Run: node test-flatlands.mjs
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
  const m = MAPS.flatlands;
  check('flatlands renamed to Dust Divide', m.name === 'Dust Divide');
  check('still perfectly flat (no plats)', m.plats.length === 0);
  check('main floor geometry unchanged', m.main.x === -520 && m.main.w === 1040 && m.main.y === 0);
  check('blast box unchanged', m.blast.l === -1300 && m.blast.r === 1300);
  check('spawns unchanged', m.spawns.join() === '-380,380,-130,130');
  check('platsAt returns empty for any tick', platsAt('flatlands', 0).length === 0
    && platsAt('flatlands', 12345).length === 0);
}

// --- 2. sim integrity on the flat ---
{
  const g = new Game(players, 9, 'flatlands');
  const inp = blankInput();
  inp.mx = 1;
  g.setInput('A', inp);
  for (let i = 0; i < 300; i++) g.step();
  const a = g.fighters[0];
  check('sim runs 5s clean', !g.over && g.fighters.every(f => !f.dead));
  check('runner stays on the hardpan', a.grounded && Math.abs(a.y - (-32)) < 1);
  check('nobody rides a phantom platform', g.fighters.every(f => f.ridePlat === null));
}

// --- 3. other maps untouched ---
{
  check('neon heights keeps its movers', MAPS.skyline.plats.filter(p => p.move).length === 2);
  check('ruined city keeps its movers', MAPS.ruins.plats.filter(p => p.move).length === 3);
  check('battlefield/foundry static and intact',
    MAPS.battlefield.plats.length === 3 && MAPS.foundry.plats.length === 2
    && [...MAPS.battlefield.plats, ...MAPS.foundry.plats].every(p => !p.move));
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
