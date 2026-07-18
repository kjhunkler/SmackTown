// Headless smoke test: per-weapon, per-aim charge floats. Each weapon's
// heavy-charge changes its airborne fall physics (the spear's down-thrust
// rises, the rang's down-charge hangs then vaults the thrower on release),
// with fall CAPS as the crisp observable: after ~0.43s of charging from
// vy=0 every configuration sits at its scaled terminal speed.
// Run: node test-chargefloat.mjs
import { Game, blankInput } from './js/game.js';

let n = 0, fails = 0;
function check(name, ok) {
  n++;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}. ${name}`);
}
const near = (a, b, eps = 2) => Math.abs(a - b) <= eps;

const MAX_FALL = 1150;               // mirrors game.js physics constants
const build = weapon => ({ stats: { power: 0, speed: 0, defense: 0, agility: 0 }, weapon, abilities: [], augments: [] });
const players = weapon => [
  { id: 'A', name: 'Alice', color: '#f00', build: build(weapon) },
  { id: 'B', name: 'Bob', color: '#0f0', build: build('unarmed') },
];

// Hoist the fighter into open air, start a held charge on the given aim,
// and step with the charge input held; returns the game + fighter.
function charging(weapon, dx, dy, ticks) {
  const g = new Game(players(weapon), 3, 'battlefield');
  const f = g.fighters[0];
  f.x = 0; f.y = -600; f.vx = 0; f.vy = 0; f.grounded = false; f.jumps = 0; f.invuln = 0;
  g.fighters[1].x = 500;
  const inp = blankInput();
  inp.chg = { dx, dy }; inp.chgArm = true;
  g.setInput('A', inp);
  for (let i = 0; i < ticks; i++) {
    const held = blankInput();
    held.chg = { dx, dy };
    g.setInput('A', held);
    g.step();
  }
  return { g, f };
}
const vyAt = (weapon, dx, dy, ticks = 26) => charging(weapon, dx, dy, ticks).f.vy;

// --- 1. every configuration lands on its scaled terminal speed ---
{
  check('shield charges with normal fall physics', near(vyAt('shield', 1, 0), MAX_FALL));
  check('sword up-charge falls 60% slow (cap 460)', near(vyAt('sword', 0, -1), MAX_FALL * 0.4));
  check('sword side-charge falls 60% slow too', near(vyAt('sword', 1, 0), MAX_FALL * 0.4));
  check('sword down-charge falls 60% slow too', near(vyAt('sword', 0, 1), MAX_FALL * 0.4));
  check('magic still hovers at 80% slow (cap 230)', near(vyAt('magic', 1, 0), MAX_FALL * 0.2));
  check('fists up-charge slows 40% (cap 690)', near(vyAt('unarmed', 0, -1), MAX_FALL * 0.6));
  check('fists side-charge slows 20% (cap 920)', near(vyAt('unarmed', 1, 0), MAX_FALL * 0.8));
  check('fists down-charge slows 20% too', near(vyAt('unarmed', 0, 1), MAX_FALL * 0.8));
  check('spear side-charge slows 40% (cap 690)', near(vyAt('spear', 1, 0), MAX_FALL * 0.6));
  check('spear up-charge slows 40% too', near(vyAt('spear', 0, -1), MAX_FALL * 0.6));
  check('rang side-charge keeps normal fall', near(vyAt('boomerang', 1, 0), MAX_FALL));
  check('rang up-charge keeps normal fall', near(vyAt('boomerang', 0, -1), MAX_FALL));
  check('rang down-charge hangs 80% slow (cap 230)', near(vyAt('boomerang', 0, 1), MAX_FALL * 0.2));
}

// --- 2. the spear's aerial down-thrust charge floats UP ---
{
  const early = vyAt('spear', 0, 1, 26);
  check('spear down-charge is rising within half a second', early < 0);
  const held = vyAt('spear', 0, 1, 60);
  check('the rise caps at 10% of fall speed (-115)', near(held, -MAX_FALL * 0.1));
  const { f } = charging('spear', 0, 1, 60);
  check('the floating spearman actually gains height', f.y < -600);
  // a fast fall in progress gets braked, then reversed
  const g2 = new Game(players('spear'), 3, 'battlefield');
  const f2 = g2.fighters[0];
  f2.y = -900; f2.vy = 900; f2.grounded = false; f2.jumps = 0;
  const inp = blankInput(); inp.chg = { dx: 0, dy: 1 }; inp.chgArm = true;
  g2.setInput('A', inp);
  for (let i = 0; i < 40; i++) { const h = blankInput(); h.chg = { dx: 0, dy: 1 }; g2.setInput('A', h); g2.step(); }
  check('a plummeting spearman brakes instead of snapping upward', f2.vy < 900 && f2.vy > -MAX_FALL * 0.1 - 2);
}

// --- 3. rang down-charge release: the upward vault ---
{
  const { g, f } = charging('boomerang', 0, 1, 30);
  g.setInput('A', blankInput());       // let go: release fires next tick
  g.step();
  check('releasing the down-charge vaults the thrower up hard', f.vy <= -780);
  check('the vault leaves charge state into the attack', f.state === 'attack');
  check('the vault burns the aerial-rise cooldown', f.riseT > 0);
  // a second immediate pop is gated by that cooldown
  const rise = f.vy;
  f.state = 'idle'; f.atk = null; f.stateT = 0;
  const inp = blankInput(); inp.chg = { dx: 0, dy: 1 }; inp.chgArm = true;
  g.setInput('A', inp);
  g.step();
  g.setInput('A', blankInput());
  g.step();
  check('no pogo ladder: an instant re-release does not pop again', f.vy >= rise);
}
{
  const { g, f } = charging('boomerang', 1, 0, 30);
  g.setInput('A', blankInput());
  g.step();
  check('a side-charge release never vaults', f.vy > -300);
}
{
  // grounded down-charge release: no launch off the floor
  const g = new Game(players('boomerang'), 3, 'battlefield');
  const f = g.fighters[0];
  for (let i = 0; i < 20; i++) g.step();  // settle onto the ground
  const inp = blankInput(); inp.chg = { dx: 0, dy: 1 }; inp.chgArm = true;
  g.setInput('A', inp);
  for (let i = 0; i < 20; i++) { const h = blankInput(); h.chg = { dx: 0, dy: 1 }; g.setInput('A', h); g.step(); }
  g.setInput('A', blankInput());
  g.step();
  check('a grounded down-charge release stays on the boardwalk', f.vy >= -300);
}

// --- 4. fists: the diagonal-up charge release is a real recovery ---
{
  const { g, f } = charging('unarmed', 1, -1, 30);
  g.setInput('A', blankInput());       // let go: release fires next tick
  g.step();
  check('diagonal-up fist release carries hard sideways', f.vx > 220);
  check('…and climbs hard at the same time', f.vy < -450);
}

// --- 5. charge floats only apply while actually charging ---
{
  const g = new Game(players('spear'), 3, 'battlefield');
  const f = g.fighters[0];
  f.y = -600; f.vy = 0; f.grounded = false; f.jumps = 0;
  for (let i = 0; i < 26; i++) g.step();
  check('an idle airborne spearman falls at full speed', near(f.vy, MAX_FALL));
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
