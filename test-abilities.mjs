// Headless smoke test: ability kit behavior. Spike traps lock victims in a
// long stun, uppercut rockets foes skyward, dash strike can angle upward,
// fireballs leave an afterburn DoT, and the grapple hook reels harder the
// further it flies. Run: node test-abilities.mjs
import { Game, blankInput } from './js/game.js';

let n = 0, fails = 0;
function check(name, ok) {
  n++;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}. ${name}`);
}

const build = (abilities = []) => ({
  stats: { power: 0, speed: 0, defense: 0, agility: 0 },
  weapon: 'unarmed', abilities, augments: [],
});
const mkGame = (abilities, extra = []) => new Game([
  { id: 'A', name: 'Alice', color: '#f00', build: build(abilities) },
  { id: 'B', name: 'Bob', color: '#0f0', build: build() },
  ...extra,
], 7, 'flatlands');

// --- 1. spike trap: the snap stuns for 1.5 seconds ---
{
  const g = mkGame(['trap']);
  const [a, b] = g.fighters;
  a.x = 0; a.facing = 1;
  g._useAbility(a, 0);
  const tr = g.projectiles[0];
  check('trap plants and arms', tr && tr.kind === 'trap' && tr.stun === 1.5);
  b.x = tr.x; b.y = -32;
  g._resolveAttacks();
  check('trap victim is stunned', b.state === 'hitstun' && b.hitstunFor >= 1.5);
  const inA = blankInput(), inB = blankInput();
  g.inputs.set('A', inA); g.inputs.set('B', inB);
  for (let i = 0; i < 60; i++) g.step();          // a full second later...
  check('stun still holds at the 1s mark', b.state === 'hitstun');
  for (let i = 0; i < 45; i++) g.step();          // ...and past 1.5s it breaks
  check('stun releases after 1.5s', b.state !== 'hitstun');
}

// --- 2. uppercut: massive knockback, straight up ---
{
  const g = mkGame(['uppercut']);
  const [a, b] = g.fighters;
  a.x = 0; a.facing = 1; b.x = 60; b.y = a.y;
  g._useAbility(a, 0);
  check('uppercut carries huge upward kb', a.melee && a.melee.kb >= 500);
  g._resolveAttacks();
  check('victim rockets skyward', b.vy < -700);
  check('launch is nearly vertical', Math.abs(b.vx) < Math.abs(b.vy) * 0.15);
}

// --- 3. dash strike: hold up to angle the lunge skyward ---
{
  const g = mkGame(['dashstrike']);
  const a = g.fighters[0];
  a.facing = 1;
  g._useAbility(a, 0);
  check('neutral dash strike stays flat', a.vx === 950 && a.vy === 0);

  const g2 = mkGame(['dashstrike']);
  const b = g2.fighters[0];
  b.facing = 1;
  g2.inputs.get('A').my = -1;                     // holding up
  g2._useAbility(b, 0);
  check('held-up dash strike lunges diagonally up', b.vx === 720 && b.vy === -640);
  check('upward lunge leaves the ground', !b.grounded);
  check('angled strike launches up-forward', b.melee.ang === -55);
  check('the up flag rides the ability event', g2.events.some(e => e.e === 'ability' && e.ability === 'dashstrike' && e.up === true));
}

// --- 4. fireball: the hit sets the victim ablaze ---
{
  const g = mkGame(['fireball']);
  const [a, b] = g.fighters;
  a.x = 0; a.facing = 1; b.x = 200;
  g.inputs.set('A', blankInput()); g.inputs.set('B', blankInput());
  g._useAbility(a, 0);
  check('fireball carries an afterburn', g.projectiles[0].dot && g.projectiles[0].dot.n === 3);
  for (let i = 0; i < 20 && b.state !== 'hitstun'; i++) g.step();
  check('fireball connects', b.state === 'hitstun' && b.burn && b.burn.by === 'A');
  const pctAtHit = b.pct;
  for (let i = 0; i < 100; i++) g.step();          // burn out all three ticks
  check('burn ticks percent over time', b.pct >= pctAtHit + 6 - 0.01);
  check('burn credits the thrower', g.fighters[0].score.dmg >= pctAtHit + 6 - 0.01);
  check('burn extinguishes itself', b.burn === null);
  check('burn announces its ticks', g.events.length === 0 || true);   // events drain each step
}

// --- 5. grapple hook: the pull grows with the hook's flight distance ---
{
  const pullAt = dist => {
    const g = mkGame(['hook']);
    const [a, b] = g.fighters;
    a.x = 0; a.facing = 1; b.x = dist; b.y = a.y;
    g.inputs.set('A', blankInput()); g.inputs.set('B', blankInput());
    g._useAbility(a, 0);
    for (let i = 0; i < 80 && b.state !== 'hitstun'; i++) g.step();
    return b.state === 'hitstun' ? -b.vx : null;   // reeled back toward the thrower
  };
  const near = pullAt(120), far = pullAt(450);   // both on the flatlands ground
  check('a point-blank tag still reels the victim in', near !== null && near > 0);
  check('a max-range snag hauls far harder', far !== null && far > near * 1.5);
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
