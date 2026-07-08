// Headless smoke test: the weapons system. Strong attacks route through the
// equipped weapon — bare fists keep the smash kit, swords lunge-slash with a
// fast charge, magic casts mana-fueled knockback bursts whose range scales
// with charge. Run: node test-weapons.mjs
import { Game, gameFromSnapshot, blankInput } from './js/game.js';
import { sanitizeBuild, buildCost, derivedStats } from './js/profile.js';

let n = 0, fails = 0;
function check(name, ok) {
  n++;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}. ${name}`);
}

const build = (weapon = 'unarmed') => ({
  stats: { power: 0, speed: 0, defense: 0, agility: 0 },
  weapon, abilities: [], augments: [],
});
const mkGame = (wA = 'unarmed', wB = 'unarmed') => new Game([
  { id: 'A', name: 'Alice', color: '#f00', build: build(wA) },
  { id: 'B', name: 'Bob', color: '#0f0', build: build(wB) },
], 7, 'flatlands');

// --- 1. build plumbing ---
{
  const b = sanitizeBuild(build('sword'));
  check('sanitize keeps a real weapon', b.weapon === 'sword');
  check('sanitize defaults junk weapons to unarmed', sanitizeBuild({ ...build(), weapon: 'bazooka' }).weapon === 'unarmed');
  check('old builds without a weapon are unarmed', sanitizeBuild({ stats: {}, abilities: [], augments: [] }).weapon === 'unarmed');
  check('weapons cost credits', buildCost(build('magic')) === 250 && buildCost(build()) === 0);
  check('derived stats carry the weapon', derivedStats(build('magic')).weapon === 'magic');
}

// --- 2. no neutral strong attack: neutral = side attack, as faced ---
{
  const g = mkGame();
  const a = g.fighters[0];
  a.facing = -1;
  g._startAttack(a, { kind: 'swipe', dx: 0, dy: 0 });
  check('neutral swipe becomes fsmash', a.atk === 'fsmash');
  check('neutral swipe aims where you face', a.atkDir && a.atkDir.x === -1 && a.atkDir.y === 0);
  const g2 = mkGame();
  const a2 = g2.fighters[0];
  g2._startCharge(a2, { dx: 0, dy: 0 });
  check('neutral charge locks the facing aim', a2.state === 'charge' && a2.chgAim.dx === a2.facing);
}

// --- 3. unarmed keeps the classic smash kit ---
{
  const g = mkGame();
  const a = g.fighters[0];
  g._startAttack(a, { kind: 'swipe', dx: 0, dy: -1 });
  check('unarmed up swipe is usmash', a.atk === 'usmash');
  const g2 = mkGame();
  g2._startAttack(g2.fighters[0], { kind: 'swipe', dx: 0, dy: 1 });
  check('unarmed grounded down swipe is dsmash', g2.fighters[0].atk === 'dsmash');
}

// --- 4. sword: slash, lunge, fast charge ---
{
  const g = mkGame('sword');
  const a = g.fighters[0];
  check('sword charges much faster than fists', g._chargeMax(a) < mkGame()._chargeMax(mkGame().fighters[0]));
  g._startAttack(a, { kind: 'swipe', dx: 1, dy: 0 });
  check('sword swipe is a slash', a.atk === 'slash');
  check('side slash lunges forward', a.vx > 500);

  const g2 = mkGame('sword');
  const b = g2.fighters[0];
  b.grounded = false; b.y = -200; b.vy = 0;
  g2._startAttack(b, { kind: 'swipe', dx: 0, dy: -1 });
  check('aerial up slash lunges upward', b.vy < -400);
  check('up lunge arms the rise cooldown', b.riseT > 0);
  b.state = 'air'; b.atk = null; b.vy = 0;
  g2._startAttack(b, { kind: 'swipe', dx: 0, dy: -1 });
  check('chained up slashes do not climb', b.vy === 0);

  const g3 = mkGame('sword');
  const c = g3.fighters[0];
  g3._startAttack(c, { kind: 'swipe', dx: 0, dy: 1 });
  check('grounded down slash stays out of the floor', c.vy === 0 && c.grounded);

  // charge = dash length: a full-charge release lunges harder and slides longer
  const g4 = mkGame('sword');
  const d = g4.fighters[0];
  g4._startAttack(d, { kind: 'swipe', dx: 1, dy: 0 });
  const v0 = d.vx, t0 = d.dashT;
  const g5 = mkGame('sword');
  const e = g5.fighters[0];
  g5._startAttack(e, { kind: 'swipe', dx: 1, dy: 0 }, false, 1);   // full charge
  check('charged slash lunges faster', e.vx > v0 * 1.5);
  check('charged slash slides longer', e.dashT > t0);
}

// --- 5. magic: bursts, mana, charge = range ---
{
  const g = mkGame('magic');
  const a = g.fighters[0];
  g._startAttack(a, { kind: 'swipe', dx: 1, dy: 0 });
  check('magic swipe is a cast', a.atk === 'mcast');
  const pr = g.projectiles[0];
  check('cast spawns a burst', pr && pr.kind === 'burst');
  check('burst is high knockback, low damage', pr.kb >= 300 && pr.dmg < 5);
  check('cast drains mana', a.mana === 65);

  const weak = pr.vx * pr.ttl;
  const g2 = mkGame('magic');
  const b = g2.fighters[0];
  b.mana = 100;
  g2._startAttack(b, { kind: 'swipe', dx: 1, dy: 0 }, false, 1);   // full charge
  const pr2 = g2.projectiles[0];
  check('charge scales range hard', pr2.vx * pr2.ttl > weak * 3);
  check('charge scales damage and knockback', pr2.dmg > pr.dmg && pr2.kb > pr.kb);

  const g3 = mkGame('magic');
  const c = g3.fighters[0];
  c.mana = 10;
  g3._startAttack(c, { kind: 'swipe', dx: 1, dy: 0 });
  check('dry cast fizzles: no burst, mana kept', g3.projectiles.length === 0 && c.mana === 10);
  check('fizzle announces itself', g3.events.some(e => e.e === 'fizzle' && e.id === 'A'));

  const g4 = mkGame('magic');
  const d = g4.fighters[0];
  d.mana = 40;
  for (let i = 0; i < 60; i++) g4.step();                          // one second
  check('mana recharges on its own', d.mana > 60 && d.mana <= 100);
}

// --- 6. a burst actually launches someone ---
{
  const g = mkGame('magic');
  const [a, b] = g.fighters;
  b.x = a.x + 120; b.facing = -1;
  a.facing = 1;
  g._startAttack(a, { kind: 'swipe', dx: 1, dy: 0 });
  for (let i = 0; i < 30 && b.state !== 'hitstun'; i++) g.step();
  check('burst connects and launches', b.state === 'hitstun' && b.pct > 0);
  check('spent burst is dead', g.projectiles.every(p => p.ttl <= 0));
}

// --- 6b. weapon knockback identity: sword launches least, magic most ---
{
  const launch = (weapon, atk) => {
    const g = mkGame(weapon);
    const [a, b] = g.fighters;
    b.pct = 60;
    if (weapon === 'magic') {
      b.x = a.x + 120; a.facing = 1;
      g._startAttack(a, { kind: 'swipe', dx: 1, dy: 0 });
      for (let i = 0; i < 30 && b.state !== 'hitstun'; i++) g.step();
    } else {
      a.x = 0; b.x = 60; a.facing = 1; a.grounded = true; b.grounded = true;
      a.state = 'attack'; a.atk = atk; a.stateT = 0.17; a.atkDir = { x: 1, y: 0 };
      g._resolveAttacks();
    }
    return Math.hypot(b.vx, b.vy);
  };
  const sword = launch('sword', 'slash');
  const fists = launch('unarmed', 'fsmash');
  const magic = launch('magic', 'mcast');
  check('sword launches weaker than fists', sword < fists);
  check('magic launches harder than sword', magic > sword * 1.3);
}

// --- 7. casts never grow a melee hitbox ---
{
  const g = mkGame('magic');
  const a = g.fighters[0];
  g._startAttack(a, { kind: 'swipe', dx: 1, dy: 0 });
  let sawActive = false;
  for (let i = 0; i < 25; i++) {
    a.stateT += 1 / 60;
    const hb = g.hitboxFor(a);
    if (hb && hb.active) sawActive = true;
    if (a.state !== 'attack') break;
  }
  check('mcast has no active melee box', !sawActive);
  const g2 = mkGame('magic');
  const b = g2.fighters[0];
  g2._startCharge(b, { dx: 1, dy: 0 });
  const hb = g2.hitboxFor(b);
  check('charging a cast still telegraphs', hb && hb.active === false);
}

// --- 8. mana survives the snapshot round-trip ---
{
  const g = mkGame('magic');
  g.fighters[0].mana = 42.24;
  const g2 = gameFromSnapshot([
    { id: 'A', name: 'Alice', color: '#f00', build: build('magic') },
    { id: 'B', name: 'Bob', color: '#0f0', build: build() },
  ], g.snapshot(), 8);
  check('snapshot restores mana', Math.abs(g2.fighters[0].mana - 42.2) < 0.01);
}

// --- 9. weapons flow through a full stepped fight without exploding ---
{
  const g = mkGame('sword', 'magic');
  const ia = blankInput(), ib = blankInput();
  g.inputs.set('A', ia); g.inputs.set('B', ib);
  for (let i = 0; i < 600; i++) {
    if (i % 40 === 0) ia.atk = { kind: 'swipe', dx: 1, dy: 0 };
    if (i % 55 === 0) ib.atk = { kind: 'swipe', dx: -1, dy: 0 };
    g.step();
  }
  const ok = g.fighters.every(f => Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.mana));
  check('600 mixed-weapon ticks stay finite', ok);
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
