// Headless smoke test: the weapons system. Strong attacks route through the
// equipped weapon — bare fists keep the smash kit, swords lunge-slash with a
// fast charge, magic casts mana-fueled knockback bursts whose range scales
// with charge, boomerangs throw a returning blade, and the shield rams with
// a rebound. Run: node test-weapons.mjs
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
  check('weapons are free', buildCost(build('magic')) === 0 && buildCost(build()) === 0);
  check('spear is free too', buildCost(build('spear')) === 0);
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
  check('side slash lunges forward', a.vx > 400);

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

// --- 4b. the blade IS the hitbox: long, thin, run out along the aim ---
{
  const box = (weapon, atk, dir) => {
    const g = mkGame(weapon);
    const a = g.fighters[0];
    a.facing = 1; a.state = 'attack'; a.atk = atk; a.stateT = 0.17; a.atkDir = dir;
    return g.hitboxFor(a);
  };
  const sword = box('sword', 'slash', { x: 1, y: 0 });
  const fists = box('unarmed', 'fsmash', { x: 1, y: 0 });
  check('slash box is flagged as a blade', sword.blade === true && !fists.blade);
  check('blade reaches further than a fist', sword.dx + sword.hw > fists.dx + fists.hw + 20);
  check('blade band is thinner than a fist arc', sword.hh < fists.hh / 2);
  const up = box('sword', 'slash', { x: 0, y: -1 });
  check('up slash turns the blade vertical', up.hh > up.hw * 2 && up.dy < 0);
  const diag = box('sword', 'slash', { x: 1, y: 1 });
  check('diagonal slash runs out along the diagonal', diag.dx > 30 && diag.dy > 30);

  const g = mkGame('sword');
  const c = g.fighters[0];
  g._startCharge(c, { dx: 1, dy: 0 });
  const hb = g.hitboxFor(c);
  check('charging a slash telegraphs the blade', hb && hb.blade === true && hb.active === false);

  // the long blade outranges a fist: connects where an fsmash whiffs
  const reach = (weapon, atk) => {
    const g2 = mkGame(weapon);
    const [a, b] = g2.fighters;
    a.x = 0; b.x = 145; a.facing = 1; a.grounded = true; b.grounded = true;
    a.state = 'attack'; a.atk = atk; a.stateT = 0.17; a.atkDir = { x: 1, y: 0 };
    g2._resolveAttacks();
    return b.pct > 0;
  };
  check('blade tip connects at fist-whiff range', reach('sword', 'slash') && !reach('unarmed', 'fsmash'));
}

// --- 4c. spear: a dead zone up close, the longest reach, the biggest hit ---
{
  const g = mkGame('spear');
  const a = g.fighters[0];
  check('spear charges at the regular (bare-fist) speed', g._chargeMax(a) === mkGame()._chargeMax(mkGame().fighters[0]));
  g._startAttack(a, { kind: 'swipe', dx: 1, dy: 0 });
  check('spear swipe is a thrust', a.atk === 'thrust');
  check('thrust rides a small lunge along its aim', a.vx > 100 && a.vx < 400);

  const box = (weapon, atk, dir) => {
    const g2 = mkGame(weapon);
    const f = g2.fighters[0];
    f.facing = 1; f.state = 'attack'; f.atk = atk; f.stateT = 0.19; f.atkDir = dir;
    return g2.hitboxFor(f);
  };
  const spear = box('spear', 'thrust', { x: 1, y: 0 });
  const sword = box('sword', 'slash', { x: 1, y: 0 });
  check('thrust box is flagged spear, not blade', spear.spear === true && !spear.blade);
  check('spear head is thinner than a sword blade', spear.hh < sword.hh);
  check('spear reaches further than a sword', spear.dx + spear.hw > sword.dx + sword.hw);
  check('spear box leaves a dead zone short of the body', spear.dx - spear.hw > 20);

  const g2 = mkGame('spear');
  const c = g2.fighters[0];
  g2._startCharge(c, { dx: 1, dy: 0 });
  const hb = g2.hitboxFor(c);
  check('charging a thrust telegraphs the head', hb && hb.spear === true && hb.active === false);

  // whiffs up close (inside the dead zone), connects at real distance —
  // and reaches past where a sword's blade would already be whiffing
  const reach = (weapon, atk, victimX) => {
    const g3 = mkGame(weapon);
    const [f, o] = g3.fighters;
    f.x = 0; o.x = victimX; f.facing = 1; f.grounded = true; o.grounded = true;
    f.state = 'attack'; f.atk = atk; f.stateT = 0.19; f.atkDir = { x: 1, y: 0 };
    g3._resolveAttacks();
    return o.pct > 0;
  };
  check('spear whiffs a target standing too close', !reach('spear', 'thrust', 30));
  check('spear connects at proper spacing', reach('spear', 'thrust', 100));
  check('spear outreaches a sword at long range', reach('spear', 'thrust', 170) && !reach('sword', 'slash', 170));

  // high damage, medium knockback: more damage than any other weapon's
  // strong attack, but a launch between the sword's (weak) and fist's (huge)
  const dealt = (weapon, atk, victimX) => {
    const g4 = mkGame(weapon);
    const [f, o] = g4.fighters;
    f.x = 0; o.x = victimX; f.facing = 1; f.grounded = true; o.grounded = true;
    f.state = 'attack'; f.atk = atk; f.stateT = 0.19; f.atkDir = { x: 1, y: 0 };
    g4._resolveAttacks();
    return { dmg: o.pct, kb: Math.hypot(o.vx, o.vy) };
  };
  const spearHit = dealt('spear', 'thrust', 100);
  const swordHit = dealt('sword', 'slash', 65);
  const fistHit = dealt('unarmed', 'fsmash', 55);
  check('spear hits harder than sword or fists', spearHit.dmg > swordHit.dmg && spearHit.dmg > fistHit.dmg);
  check('spear knockback sits between sword and fists', spearHit.kb > swordHit.kb && spearHit.kb < fistHit.kb);
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
  // mana tracks power output, not a flat tax: an uncharged tap costs less
  check('cast drains mana proportional to its (low) power', a.mana > 65 && a.mana < 100);

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

// --- 5b. magic overcharge: hold past a standard charge for double power ---
{
  // full charge (k=1) — today's baseline peak
  const g1 = mkGame('magic');
  const a1 = g1.fighters[0];
  a1.mana = 100;
  g1._startAttack(a1, { kind: 'swipe', dx: 1, dy: 0 }, false, 1);
  const std = g1.projectiles[0];
  const stdCost = 100 - a1.mana;

  // overcharge (k=2) — double the hold time
  const g2 = mkGame('magic');
  const a2 = g2.fighters[0];
  a2.mana = 100;
  g2._startAttack(a2, { kind: 'swipe', dx: 1, dy: 0 }, false, 2);
  const over = g2.projectiles[0];
  const overCost = 100 - a2.mana;

  check('overcharge doubles damage', Math.abs(over.dmg - std.dmg * 2) < 1e-9);
  check('overcharge doubles knockback', Math.abs(over.kb - std.kb * 2) < 1e-9);
  check('overcharge doubles burst size', Math.abs(over.r - std.r * 2) < 1e-9);
  check('overcharge costs double the mana of a standard charge', Math.abs(overCost - stdCost * 2) < 1e-9);
  check('standard charge mana cost is unchanged', Math.abs(stdCost - 35) < 1e-9);

  // charging can actually be held out to 2x chargeMax before auto-release
  const g3 = mkGame('magic');
  const a3 = g3.fighters[0];
  const ia3 = blankInput();
  ia3.chg = { dx: 1, dy: 0 };
  g3.inputs.set('A', ia3);
  g3.inputs.set('B', blankInput());
  g3.step();                                        // arms the charge
  const chargeMax = g3._chargeMax(a3);
  for (let i = 0; i < Math.round(chargeMax * 1.9 * 60); i++) g3.step();
  check('magic keeps charging well past the old chargeMax', a3.state === 'charge');
  for (let i = 0; i < 60; i++) g3.step();
  check('magic auto-releases at the overcharge cap (2x)', a3.state !== 'charge');

  // mana scales smoothly with power across the whole 0..2 range, not a step
  const cost = k => {
    const g = mkGame('magic');
    const f = g.fighters[0];
    f.mana = 100;
    g._startAttack(f, { kind: 'swipe', dx: 1, dy: 0 }, false, k);
    return 100 - f.mana;
  };
  const c0 = cost(0), c05 = cost(0.5), c1 = cost(1), c15 = cost(1.5), c2 = cost(2);
  check('mana cost rises monotonically with charge', c0 < c05 && c05 < c1 && c1 < c15 && c15 < c2);
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

// --- 9. boomerang weapon: aimed returning blade, one in the air at a time ---
{
  const g = mkGame('boomerang');
  const [a, b] = g.fighters;
  a.x = 0; a.facing = 1; b.x = 120; b.y = a.y;
  g.inputs.set('A', blankInput()); g.inputs.set('B', blankInput());
  g._startAttack(a, { kind: 'swipe', dx: 1, dy: 0 });
  check('boomerang swipe is the throw', a.atk === 'rang');
  const pr = g.projectiles[0];
  check('the rang leaves the hand as a piercing blade',
    pr && pr.kind === 'boomerang' && pr.thru === true && pr.vx > 0);

  // a second release while it's out fizzles: nothing new leaves the hand
  a.state = 'air'; a.atk = null; a.stateT = 0;
  g._startAttack(a, { kind: 'swipe', dx: 1, dy: 0 });
  check('only one rang can be out at a time', g.projectiles.length === 1);

  // it cuts the victim on the way out, turns around, and is caught at home
  let hit = false, turned = false, caught = false;
  for (let i = 0; i < 120 && !caught; i++) {
    g.step();
    if (b.state === 'hitstun') hit = true;
    if (pr.vx < 0) turned = true;
    if (g.events.some(ev => ev.e === 'catch')) caught = true;
  }
  check('the outbound rang connects', hit);
  check('the rang turns around and is caught back home', turned && caught);
  check('the caught rang is gone from the air', !g.projectiles.includes(pr));

  // charge buys range and bite
  const at = k => {
    const g2 = mkGame('boomerang');
    g2._startAttack(g2.fighters[0], { kind: 'swipe', dx: 1, dy: 0 }, false, k);
    return g2.projectiles[0];
  };
  const soft = at(0), hard = at(1);
  check('a charged throw flies faster and bites harder',
    hard.vx > soft.vx && hard.dmg > soft.dmg && hard.kb > soft.kb && hard.ttl > soft.ttl);

  // an aimed throw returns along its own axis: thrown up, it comes back down
  const g3 = mkGame('boomerang');
  const c = g3.fighters[0];
  c.grounded = false; c.y = -300; c.vy = 0;
  g3._startAttack(c, { kind: 'swipe', dx: 0, dy: -1 });
  const up = g3.projectiles[0];
  check('an up-throw flies up', up.vy < 0);
  for (let i = 0; i < 40; i++) g3._stepProjectiles();
  check('...then swings back down toward the hand', up.vy > 0);
}

// --- 10. shield: ram lunge, big launch, rebound, guard while charging ---
{
  const g = mkGame('shield');
  const [a, b] = g.fighters;
  a.x = 0; a.facing = 1; b.x = 90; b.y = a.y;
  g.inputs.set('A', blankInput()); g.inputs.set('B', blankInput());
  g._startAttack(a, { kind: 'swipe', dx: 1, dy: 0 });
  check('shield swipe is the bash', a.atk === 'bash');
  check('the bash lunges harder than an uncharged slash', a.vx > 500);
  const spotX = b.x;
  let hit = false;
  for (let i = 0; i < 30 && !hit; i++) { g.step(); if (b.state === 'hitstun') hit = true; }
  check('the ram connects', hit);
  check('the victim gets blasted away hard', b.vx > 300);
  check('the wielder takes the victim\'s spot (no pass-through, no rebound)',
    Math.abs(a.x - spotX) < 5 && a.vx === 0);

  // a blocked ram can't trade places: the wielder stops with a nudge back
  const gB = mkGame('shield', 'unarmed');
  const [e1, e2] = gB.fighters;
  e1.x = 0; e1.facing = 1; e2.x = 60; e2.y = e1.y;
  e2.state = 'duck';
  const e1x = e1.x;
  gB._applyHit(e1, e2, { dmg: 7, kb: 310, ks: 21, bounce: true }, 0, 1);
  check('a blocked ram stops short with a shove back', e1.x === e1x && e1.vx < 0);

  // grounded down-bash rams forward instead of diving into the floor
  const g2 = mkGame('shield');
  const c = g2.fighters[0];
  g2._startAttack(c, { kind: 'swipe', dx: 0, dy: 1 });
  check('grounded down-bash flattens to a forward ram', c.atkDir.y === 0 && c.atkDir.x === c.facing);

  // winding up the bash keeps the shield raised: incoming damage is halved
  const pctAfter = charging => {
    const g3 = mkGame('shield', 'unarmed');
    const [v, w] = g3.fighters;
    if (charging) g3._startCharge(v, { dx: 1, dy: 0 });
    g3._applyHit(w, v, { dmg: 10, kb: 200, ks: 10 }, 0, -1);
    return v.pct;
  };
  check('a raised shield blunts damage', Math.abs(pctAfter(true) - 5) < 1e-9);
  check('...and takes it in full when down', Math.abs(pctAfter(false) - 10) < 1e-9);
}

// --- 11. brawler augment: the tap kit hits 25% harder, weapons don't ---
{
  const mk = () => new Game([
    { id: 'A', name: 'Alice', color: '#f00', build: { ...build(), augments: ['brawler'] } },
    { id: 'B', name: 'Bob', color: '#0f0', build: build() },
  ], 7, 'flatlands');
  const g = mk();
  const [a, b] = g.fighters;
  a.x = 0; a.facing = 1; b.x = 60; b.y = a.y;
  a.state = 'attack'; a.atk = 'jab'; a.stateT = 0.06; a.atkDir = { x: 1, y: 0 };
  g._resolveAttacks();
  check('brawler jab deals 25% extra (4 -> 5)', Math.abs(b.pct - 5) < 1e-9);
  const g2 = mk();
  const [c, d] = g2.fighters;
  c.x = 0; c.facing = 1; d.x = 60; d.y = c.y;
  c.state = 'attack'; c.atk = 'fsmash'; c.stateT = 0.17; c.atkDir = { x: 1, y: 0 };
  g2._resolveAttacks();
  check('brawler leaves weapon strikes alone', Math.abs(d.pct - 13) < 1e-9);
}

// --- 12. weapons flow through a full stepped fight without exploding ---
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

  const g4 = mkGame('boomerang', 'shield');
  const ic = blankInput(), id = blankInput();
  g4.inputs.set('A', ic); g4.inputs.set('B', id);
  for (let i = 0; i < 600; i++) {
    if (i % 40 === 0) ic.atk = { kind: 'swipe', dx: 1, dy: 0 };
    if (i % 55 === 0) id.atk = { kind: 'swipe', dx: -1, dy: 0 };
    g4.step();
  }
  const ok2 = g4.fighters.every(f => Number.isFinite(f.x) && Number.isFinite(f.y));
  check('600 rang/shield ticks stay finite', ok2);
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
