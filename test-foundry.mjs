// Headless smoke test: The Crucible (foundry) — geometry untouched, molten
// geysers cycle deterministically, burns apply percent + launch with a
// cooldown, respect invulnerability, keep KO attribution, and survive
// snapshot round-trips. Run: node test-foundry.mjs
import { Game, MAPS, platsAt, hazardsAt, blankInput, restoreFighter } from './js/game.js';

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
const VENT_A = -186 + 36;              // center of the west vent
const SAFE_X = 250;                    // clear of both vents

// --- 1. identity & geometry ---
{
  const m = MAPS.foundry;
  check('foundry renamed to The Crucible', m.name === 'The Crucible');
  check('deck geometry unchanged', m.main.x === -300 && m.main.w === 600 && m.main.y === 0);
  check('side perches unchanged and static',
    m.plats.length === 2 && m.plats.every(p => !p.move)
    && m.plats[0].x === -420 && m.plats[1].x === 280);
  check('blast box & spawns unchanged', m.blast.l === -1120 && m.spawns.join() === '-210,210,-60,60');
  check('two vents defined on the deck', m.hazards.length === 2
    && m.hazards.every(h => h.x >= m.main.x && h.x + h.w <= m.main.x + m.main.w));
}

// --- 2. deterministic hazard clock ---
{
  const at = tk => hazardsAt('foundry', tk);
  check('hazardsAt is deterministic', JSON.stringify(at(777)) === JSON.stringify(at(777)));
  check('vent A warns at t=0', at(0)[0].state === 'warn');
  check('vent A erupts after the telegraph', at(120)[0].state === 'erupt');
  check('vent A rests after erupting', at(200)[0].state === 'idle');
  check('vents run out of phase', at(120)[1].state === 'idle' && at(450)[1].state === 'erupt');
  check('cycle repeats every period', at(0)[0].state === at(11 * 60)[0].state
    && at(120)[0].state === at(120 + 11 * 60)[0].state);
  check('other maps have no hazards', ['battlefield', 'flatlands', 'skyline', 'ruins', 'garden']
    .every(id => hazardsAt(id, 0).length === 0));
}

// --- 3. the burn: damage, launch, cooldown ---
{
  const g = new Game(players, 9, 'foundry');
  const f = g.fighters[0];
  f.x = VENT_A; g.fighters[1].x = SAFE_X;
  let burnTick = 0, burnEvents = 0, launched = false;
  for (let i = 0; i < 160; i++) {
    g.step();
    if (g.events.some(e => e.e === 'burn' && e.vic === 'A')) {
      burnEvents++;
      if (!burnTick) {
        burnTick = g.tick;
        launched = f.vy < 0 && f.state === 'hitstun';   // checked at the burn tick
      }
    }
  }
  check('geyser burns the camper', burnEvents > 0 && f.pct > 0);
  check('burn waits out the telegraph', burnTick >= 90);
  check('burn launches upward into hitstun', launched);
  check('burn cooldown prevents combo-locking', burnEvents <= 2);
  check('bystander on safe ground untouched', g.fighters[1].pct === 0);
  check('burn is an SD, not a KO credit', f.lastHitBy === null);
}

// --- 4. invulnerability & attribution ---
{
  const g = new Game(players, 9, 'foundry');
  const f = g.fighters[0];
  f.x = VENT_A; f.invuln = 99;
  g.fighters[1].x = SAFE_X;
  for (let i = 0; i < 160; i++) g.step();
  check('spawn invulnerability shrugs off the melt', f.pct === 0);

  const g2 = new Game(players, 9, 'foundry');
  const f2 = g2.fighters[0];
  f2.x = VENT_A; f2.lastHitBy = 'B';         // smacked into the vent by Bob
  g2.fighters[1].x = SAFE_X;
  for (let i = 0; i < 160 && f2.pct === 0; i++) g2.step();
  check('geyser keeps KO attribution', f2.pct > 0 && f2.lastHitBy === 'B');
}

// --- 5. snapshot round-trips burnT ---
{
  const g = new Game(players, 9, 'foundry');
  const f = g.fighters[0];
  f.x = VENT_A; g.fighters[1].x = SAFE_X;
  for (let i = 0; i < 100 && f.burnT === 0; i++) g.step();
  check('burnT is live after a burn', f.burnT > 0);
  const row = g.snapshot().f.find(r => r[0] === 'A');
  check('snapshot carries burnT', Math.abs(row[35] - f.burnT) < 0.011);
  const g2 = new Game(players, 9, 'foundry');
  restoreFighter(g2.fighters[0], row);
  check('restore round-trips burnT', Math.abs(g2.fighters[0].burnT - f.burnT) < 0.011);
}

// --- 6. sim integrity & other maps ---
{
  const g = new Game(players, 9, 'foundry');
  g.fighters[0].x = SAFE_X; g.fighters[1].x = -60;
  const inp = blankInput();
  for (let i = 0; i < 600; i++) {            // a full geyser cycle, nobody dies
    inp.mx = 0;
    g.setInput('A', inp);
    g.step();
  }
  check('10s sim survives a full vent cycle', !g.over);
  check('neon heights keeps its movers', MAPS.skyline.plats.filter(p => p.move).length === 2);
  check('overgrown eden keeps its flowers', MAPS.garden.plats.filter(p => p.move).length === 2);
  check('sky bastion triplat untouched', MAPS.battlefield.plats.length === 3
    && MAPS.battlefield.plats.every(p => !p.move));
  check('platsAt still static for foundry',
    JSON.stringify(platsAt('foundry', 0)) === JSON.stringify(platsAt('foundry', 5000)));
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
