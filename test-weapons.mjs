// Headless smoke test: the weapons system. Strong attacks route through the
// equipped weapon — bare fists keep the smash kit, swords lunge-slash with a
// fast charge, magic casts mana-fueled knockback bursts whose range scales
// with charge, boomerangs throw a returning blade, and the shield rams with
// a rebound. The hammer leaves one lingering, interactive hex. Run: node test-weapons.mjs
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

  // grounded down-smash: a both-sides haft sweep that covers point-blank —
  // the range the thrust can't touch — with no dead zone on either side
  const g5 = mkGame('spear');
  const e5 = g5.fighters[0];
  e5.grounded = true;
  check('grounded down aim swings the sweep', g5._weaponAttack(e5, 0, 1) === 'sweep');
  e5.grounded = false;
  check('airborne down aim still thrusts', g5._weaponAttack(e5, 0, 1) === 'thrust');
  const sweepClose = (victimX) => {
    const g6 = mkGame('spear');
    const [f, o] = g6.fighters;
    f.x = 0; o.x = victimX; f.facing = 1; f.grounded = true; o.grounded = true;
    f.state = 'attack'; f.atk = 'sweep'; f.stateT = 0.16; f.atkDir = { x: 0, y: 1 };
    g6._resolveAttacks();
    return o.pct > 0;
  };
  check('the sweep connects point-blank where the thrust whiffs', sweepClose(30));
  check('the sweep covers both sides', sweepClose(-60) && sweepClose(60));
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
  check('magic launches harder than sword', magic > sword * 1.1);
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

// --- 10. shield: controlled ram lunge, launch, spot-swap, guard while charging ---
{
  const g = mkGame('shield');
  const [a, b] = g.fighters;
  a.x = 0; a.facing = 1; b.x = 90; b.y = a.y;
  g.inputs.set('A', blankInput()); g.inputs.set('B', blankInput());
  g._startAttack(a, { kind: 'swipe', dx: 1, dy: 0 });
  check('shield swipe is the bash', a.atk === 'bash');
  check('the bash still lunges hard', a.vx > 450);
  const spotX = b.x;
  let hit = false;
  for (let i = 0; i < 30 && !hit; i++) { g.step(); if (b.state === 'hitstun') hit = true; }
  check('the ram connects', hit);
  check('the victim gets knocked away', b.vx > 260);
  check('the wielder takes the victim\'s spot (no pass-through, no rebound)',
    Math.abs(a.x - spotX) < 5 && a.vx === 0);

  // up-bash: a climbing ram, with its vertical climb toned down
  const gU = mkGame('shield');
  const u = gU.fighters[0];
  u.grounded = false; u.y = -200; u.vy = 0;
  gU._startAttack(u, { kind: 'swipe', dx: 0, dy: -1 });
  const gS = mkGame('sword');
  const s = gS.fighters[0];
  s.grounded = false; s.y = -200; s.vy = 0;
  gS._startAttack(s, { kind: 'swipe', dx: 0, dy: -1 });
  check('aerial up-bash still climbs', u.vy < -800);
  check('...with less extreme vertical launch than before', u.vy > -1100);
  check('...still outclimbs the sword\'s up-lunge', u.vy < s.vy);
  check('up-bash arms the rise cooldown (no infinite climbing)', u.riseT > 0);

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

// --- 10b. shield: PvP bash victims do not become body-slam hazards ---
{
  const g = new Game([
    { id: 'A', name: 'Alice', color: '#f00', build: build('shield') },
    { id: 'B', name: 'Bob', color: '#0f0', build: build() },
    { id: 'C', name: 'Cara', color: '#00f', build: build() },
  ], 7, 'flatlands');
  const [a, b, c] = g.fighters;
  a.x = 0; a.facing = 1; b.x = 90; b.y = a.y; c.x = 5000;
  g.inputs.set('A', blankInput()); g.inputs.set('B', blankInput()); g.inputs.set('C', blankInput());
  g._startAttack(a, { kind: 'swipe', dx: 1, dy: 0 });
  let hit = false;
  for (let i = 0; i < 30 && !hit; i++) { g.step(); if (b.state === 'hitstun') hit = true; }
  check('the ram connects', hit);
  check('the PvP victim carries no slam hazard', !b.melee);
  check('the wielder is standing right where the victim was, but is not hit', a.state !== 'hitstun');

  // drop a bystander exactly where the flying victim now is: without a slam
  // hitbox on the impacted PvP player, the overlap is harmless.
  a.state = 'idle'; a.atk = null; a.atkHit.clear();
  c.x = b.x; c.y = b.y; c.state = 'idle'; c.invuln = 0;
  g._resolveAttacks();
  check('a bystander in the flight path is not hit by the victim', c.state !== 'hitstun');
}

// --- 11. brawler augment: the tap kit hits 40% harder, weapons don't ---
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
  check('brawler jab deals 40% extra (4 -> 5.6)', Math.abs(b.pct - 5.6) < 1e-9);
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

// --- the rang's return leg bites softer than the throw ---
{
  const g = mkGame('boomerang');
  const a = g.fighters[0];
  a.x = 0; a.facing = 1; g.fighters[1].x = 800;
  g._startAttack(a, { kind: 'swipe', dx: 1, dy: 0 });
  let out = 0, back = 0;
  for (let i = 0; i < 200; i++) {
    const pr = g.projectiles.find(p => p.kind === 'boomerang');
    if (pr) {
      const outbound = pr.vx * pr.lnx + pr.vy * pr.lny > 0;
      if (outbound) out = pr.dmg; else { back = pr.dmg; break; }
    }
    g.step();
  }
  check('rang outbound damage is the full throw', out > 0);
  check('the return leg carries 60% of the bite', back > 0 && Math.abs(back - out * 0.6) < 1e-9);
}

// --- hammer: one lingering launch hex, mana, and redirect chains ---
{
  const g = mkGame('hammer');
  const a = g.fighters[0];
  check('hammer has the slowest standard wind-up', g._chargeMax(a) > g._chargeMax(mkGame('magic').fighters[0]));
  check('hammer uses one directional launch on the ground', g._weaponAttack(a, 1, 0) === 'hthrust');
  g._startAttack(a, { kind: 'swipe', dx: 1, dy: 0 }, false, 1);
  const waves = g.projectiles.filter(p => p.kind === 'hammerwave');
  check('hammer releases one body-centered ground hex', waves.length === 1 && waves[0].x === a.x && waves[0].y === a.y);
  const tapRadius = mkGame('hammer');
  tapRadius._startAttack(tapRadius.fighters[0], { kind: 'swipe', dx: 1, dy: 0 }, false, 0);
  check('holding charge makes the hex much larger', waves[0].r > tapRadius.projectiles[0].r * 2);
  check('full charge makes the launch substantially stronger', a.vx > 1400 && a.vy === 0);
  check('hammer release consumes charge-scaled mana', a.mana < tapRadius.fighters[0].mana);
  a.hammerFlight = null; // isolate the field from the damaging launched body
  const victim = g.fighters[1]; victim.x = waves[0].x; victim.y = waves[0].y; victim.invuln = 0;
  const pctBefore = victim.pct;
  g._resolveAttacks();
  check('hammer hexes have no burn or touch damage', victim.pct === pctBefore && !victim.burn);
  for (let i = 0; i < 40; i++) g._resolveAttacks();
  check('remaining inside a hammer hex stays harmless', victim.pct === pctBefore && !victim.burn);
  // Caught in your OWN hex: suspended and centered, no longer boosted by a
  // held direction. Re-enter after having left the hex once.
  a.x = waves[0].x + waves[0].r + 100;
  g._resolveAttacks();
  a.x = waves[0].x; a.y = waves[0].y - 40; a.moveIntent = { x: 0, y: 0 };
  g._resolveAttacks();
  check('re-entering your own hex catches and suspends you', a.hammerCatch && a.vx === 0 && a.vy === 0);
  g._stepFighter(a, blankInput());
  check('a caught wielder is snapped to the hex center', a.x === waves[0].x && a.y === waves[0].y);
  const held = blankInput(); held.my = -1;
  for (let i = 0; i < 8; i++) g._stepFighter(a, held);
  check('holding a direction keeps you pinned instead of boosting', a.hammerCatch && a.vx === 0 && a.vy === 0);
  // An uncharged tap launches you straight out of your own hex, for free.
  const manaBeforeTap = a.mana;
  const tap = blankInput(); tap.atk = { kind: 'swipe', dx: 0, dy: -1 }; tap.my = -1;
  g._stepFighter(a, tap);
  check('an uncharged tap launches you out of your own hex', !a.hammerCatch && a.vy < 0 && a.hammerFlight);
  check('an uncharged hex launch spends no mana', a.mana >= manaBeforeTap);
  check('a launch leaves the hex behind (not consumed)', waves[0].ttl > 0);
  victim.x = a.x; victim.y = a.y; victim.invuln = 0;
  g._resolveAttacks();
  check('a hex-launched wielder has a body-sized projectile hitbox', a.hammerFlight.hit.has(victim.id));

  // Bounce economics: launching leaves the hex behind, costs no mana, and its
  // speed scales with the hex's size — so two hexes can be bounced between free.
  const bg = mkGame('hammer');
  const ba = bg.fighters[0];
  bg._startAttack(ba, { kind: 'swipe', dx: 1, dy: 0 }, false, 1);   // a big (charged) hex
  const bhex = bg.projectiles.find(p => p.kind === 'hammerwave');
  ba.x = bhex.x + bhex.r + 100; bg._resolveAttacks();
  ba.x = bhex.x; ba.y = bhex.y; ba.moveIntent = { x: 0, y: 0 }; bg._resolveAttacks();
  ba.mana = 60; const bMana = ba.mana;
  const bTap = blankInput(); bTap.atk = { kind: 'swipe', dx: 0, dy: -1 }; bTap.my = -1;
  bg._stepFighter(ba, bTap);
  check('a launch leaves the hex behind to bounce off', bhex.ttl > 0 && !ba.hammerCatch && ba.hammerFlight);
  check('a launch costs no mana', ba.mana >= bMana);
  check('launch speed scales with the hex size', Math.abs(ba.vy) > 1200);

  // Entering a hex while a strong attack is charging must cancel that charge —
  // it must NOT fire a whole new hex when you later launch out.
  const xg = mkGame('hammer');
  const xp = xg.fighters[0];
  xg._startAttack(xp, { kind: 'swipe', dx: 1, dy: 0 }, false, 1);   // hex A; xp launches out
  const hexA = xg.projectiles.find(p => p.kind === 'hammerwave');
  xp.x = hexA.x + hexA.r + 200; xp.hammerFlight = null; xg._resolveAttacks();   // leave hex A
  xp.mana = 100;
  xg._startCharge(xp, { dx: 1, dy: 0 });                            // begin a new directional charge
  const heldX = xg.inputs.get(xp.id); heldX.chg = { dx: 1, dy: 0 }; heldX.chgArm = false;
  check('a hammer charge is in progress before entry', xp.state === 'charge' && xp.atk === 'hthrust');
  const manaAtEntry = xp.mana;
  xp.x = hexA.x; xp.y = hexA.y; xp.moveIntent = { x: 0, y: 0 }; xg._resolveAttacks();   // enter hex A mid-charge
  check('entering a hex cancels the in-progress charge', xp.hammerCatch && xp.state !== 'charge' && xp.atk !== 'hthrust');
  check('canceling a charge on hex entry does not lose mana', xp.mana === manaAtEntry);
  check('a held attack immediately begins charging the caught hex', xp.hammerCatch?.charging);
  const hexCountBefore = xg.projectiles.filter(p => p.kind === 'hammerwave').length;
  const continueX = blankInput(); continueX.chg = { dx: 0, dy: -1 };
  for (let i = 0; i < 12; i++) xg._stepFighter(xp, continueX);      // same uninterrupted hold charges the hex
  xg._stepFighter(xp, blankInput());                                // release and launch out
  for (let i = 0; i < 10; i++) xg._stepFighter(xp, blankInput());   // let any stale charge try to fire
  check('no phantom second hex spawns after launching out',
    xg.projectiles.filter(p => p.kind === 'hammerwave').length === hexCountBefore);

  // Bug: the smash release ALSO queues a swipe-attack edge. When you release an
  // inflate-charge inside a hex, that buffered edge must be consumed — otherwise
  // it fires a normal hthrust and spawns a second hex the frame you launch out.
  const yg = mkGame('hammer');
  const yp = yg.fighters[0];
  yg._startAttack(yp, { kind: 'swipe', dx: 1, dy: 0 }, false, 0);   // hex A
  const yhex = yg.projectiles.find(p => p.kind === 'hammerwave');
  yp.x = yhex.x + yhex.r + 100; yp.hammerFlight = null; yg._resolveAttacks();
  yp.x = yhex.x; yp.y = yhex.y; yp.moveIntent = { x: 0, y: 0 }; yg._resolveAttacks();   // caught in A
  yp.mana = 100;
  const yr = blankInput(); yr.chg = { dx: 0, dy: -1 }; yr.chgArm = true; yr.my = -1;
  yg._stepFighter(yp, yr); yr.chgArm = false;
  for (let i = 0; i < 10; i++) yg._stepFighter(yp, yr);            // inflate the hex
  yr.chg = null; yr.atk = { kind: 'swipe', dx: 0, dy: -1 }; yr.bufA = 0.15;   // release (queues a swipe edge)
  yg._stepFighter(yp, yr);
  check('releasing an inflate-charge launches you out', !yp.hammerCatch && yp.hammerFlight);
  const yHexCount = yg.projectiles.filter(p => p.kind === 'hammerwave').length;
  for (let i = 0; i < 8; i++) yg._stepFighter(yp, yr);            // buffer decays; a leak would fire a hthrust
  check('the release edge does not leak a second hex',
    yg.projectiles.filter(p => p.kind === 'hammerwave').length === yHexCount);

  // Charging a pinned hex drains mana into its life, pumps it bigger (capped),
  // and the release is a very powerful launch scaled by the charge.
  const cg = mkGame('hammer');
  const ca = cg.fighters[0];
  cg._startAttack(ca, { kind: 'swipe', dx: 1, dy: 0 }, false, 0);   // cheap uncharged hex
  const chex = cg.projectiles.find(p => p.kind === 'hammerwave');
  ca.x = chex.x + chex.r + 100; cg._resolveAttacks();
  ca.x = chex.x; ca.y = chex.y; ca.moveIntent = { x: 0, y: 0 }; cg._resolveAttacks();
  ca.mana = 100;
  const baseR = chex.r, manaBeforeCharge = ca.mana;
  const chg = blankInput(); chg.chg = { dx: 0, dy: -1 }; chg.chgArm = true; chg.my = -1;
  cg._stepFighter(ca, chg); chg.chgArm = false;
  check('charging a pinned hex drains mana into its life', ca.mana < manaBeforeCharge && ca.hammerCatch);
  const ttlBeforeCharge = chex.ttl;
  for (let i = 0; i < 140; i++) cg._stepFighter(ca, chg);
  check('charging fills hex life without spending past its cap',
    chex.ttl > ttlBeforeCharge && chex.ttl <= 6 && ca.mana > manaBeforeCharge - 30);
  check('the inflated hex has a medium-large size cap', chex.r > baseR && chex.r <= 120);
  check('the inflated hex has a life cap', chex.ttl <= 6 && chex.life <= 6);
  const rel = blankInput(); rel.my = -1;
  cg._stepFighter(ca, rel);
  check('a fully charged hex launch reaches but does not exceed its power cap',
    !ca.hammerCatch && ca.vy <= -1750 && ca.vy >= -1800 && ca.hammerFlight && chex.ttl > 0);

  // A maxed hex remains chargeable, but can only consume the mana required to
  // replace ongoing decay. It must not bank extra life or auto-release.
  const capped = mkGame('hammer');
  const cappedFighter = capped.fighters[0];
  capped._startAttack(cappedFighter, { kind: 'swipe', dx: 1, dy: 0 }, false, 0);
  const cappedHex = capped.projectiles.find(p => p.kind === 'hammerwave');
  cappedFighter.x = cappedHex.x + cappedHex.r + 100; capped._resolveAttacks();
  cappedFighter.x = cappedHex.x; cappedFighter.y = cappedHex.y;
  cappedFighter.moveIntent = { x: 0, y: 0 }; capped._resolveAttacks();
  cappedHex.r = cappedHex.r0 = 120; cappedHex.ttl = cappedHex.life = 6;
  cappedFighter.mana = 100;
  const cappedCharge = blankInput();
  cappedCharge.chg = { dx: 0, dy: -1 }; cappedCharge.chgArm = true; cappedCharge.my = -1;
  capped._stepFighter(cappedFighter, cappedCharge); cappedCharge.chgArm = false;
  check('a full hex does not waste mana on overcharge',
    cappedFighter.mana === 100 && cappedHex.ttl === 6 && cappedFighter.hammerCatch?.charging);
  for (let i = 0; i < 60; i++) {
    capped._stepProjectiles();
    capped._stepFighter(cappedFighter, cappedCharge);
  }
  check('holding a maxed charge only pays maintenance',
    cappedFighter.hammerCatch?.charging && cappedHex.ttl <= 6
      && cappedHex.ttl > 5.9 && cappedFighter.mana > 99);

  // Regression: aging happens in _stepProjectiles, so a real frame ages the
  // hex. A nearly-expired hex must NOT vanish once you start charging — the
  // mana you pour in banks life. Drive whole frames (step order: fighter, then
  // projectiles) and confirm it survives to a strong launch.
  const vg = mkGame('hammer');
  const va = vg.fighters[0];
  vg._startAttack(va, { kind: 'swipe', dx: 1, dy: 0 }, false, 0);
  const vhex = vg.projectiles.find(p => p.kind === 'hammerwave');
  va.x = vhex.x + vhex.r + 100; vg._resolveAttacks();
  va.x = vhex.x; va.y = vhex.y; va.moveIntent = { x: 0, y: 0 }; vg._resolveAttacks();
  va.mana = 100; vhex.ttl = 0.3;   // almost gone when the charge starts
  const vchg = blankInput(); vchg.chg = { dx: 0, dy: -1 }; vchg.chgArm = true; vchg.my = -1;
  vg._stepFighter(va, vchg); vg._stepProjectiles(); vchg.chgArm = false;
  let survived = va.hammerCatch != null;
  for (let i = 0; i < 100 && va.hammerCatch; i++) {
    vg._stepFighter(va, vchg);
    vg._stepProjectiles();
    if (!vg.projectiles.some(p => p.eid === vhex.eid)) survived = false;
  }
  check('a growing pinned hex banks life and does not vanish mid-charge', survived && va.hammerCatch);
  const vrel = blankInput(); vrel.my = -1;
  vg._stepFighter(va, vrel);
  check('the rescued charge still launches strongly', !va.hammerCatch && va.hammerFlight && va.vy < -1500);

  // Launching is always free, even near-empty: a low-mana wielder can still
  // charge (regen trickles in) and launch out.
  const dryGame = mkGame('hammer');
  const da = dryGame.fighters[0];
  dryGame._startAttack(da, { kind: 'swipe', dx: 1, dy: 0 }, false, 0);
  const dryHex = dryGame.projectiles.find(p => p.kind === 'hammerwave');
  da.x = dryHex.x + dryHex.r + 100; dryGame._resolveAttacks();
  da.x = dryHex.x; da.y = dryHex.y; da.moveIntent = { x: 0, y: 0 }; dryGame._resolveAttacks();
  da.mana = 0;
  const dryCharge = blankInput(); dryCharge.chg = { dx: 0, dy: -1 }; dryCharge.chgArm = true; dryCharge.my = -1;
  dryGame._stepFighter(da, dryCharge); dryCharge.chgArm = false;
  for (let i = 0; i < 10; i++) dryGame._stepFighter(da, dryCharge);
  check('a charge started near-empty still runs', da.hammerCatch?.charging && da.mana < 5);
  const dryRel = blankInput(); dryRel.my = -1;
  dryGame._stepFighter(da, dryRel);
  check('launching from the hex is free', !da.hammerCatch && da.vy < 0 && da.hammerFlight && da.mana < 5);

  // Holding a hex is net-zero mana (regen covers the maintenance trickle), so
  // it stays the same size and holds against decay while you sit in it — even
  // at empty mana, since regen keeps paying the trickle.
  const tg = mkGame('hammer');
  const ta = tg.fighters[0];
  tg._startAttack(ta, { kind: 'swipe', dx: 1, dy: 0 }, false, 0);
  const thex = tg.projectiles.find(p => p.kind === 'hammerwave');
  ta.x = thex.x + thex.r + 100; tg._resolveAttacks();
  ta.x = thex.x; ta.y = thex.y; ta.moveIntent = { x: 0, y: 0 }; tg._resolveAttacks();
  ta.mana = 50; thex.ttl = 0.5;
  const hold = blankInput();
  const manaBeforeHold = ta.mana;
  for (let i = 0; i < 30 && ta.hammerCatch; i++) { tg._stepFighter(ta, hold); tg._stepProjectiles(); }
  check('holding a hex is net-zero mana and keeps it alive', ta.hammerCatch && Math.abs(ta.mana - manaBeforeHold) < 2 && thex.ttl > 0.3);
  ta.mana = 0;
  for (let i = 0; i < 40 && ta.hammerCatch; i++) { tg._stepFighter(ta, hold); tg._stepProjectiles(); }
  check('an occupied hex is sustained even at empty mana', ta.hammerCatch && tg.projectiles.some(p => p.eid === thex.eid));

  // An unoccupied hex just decays on its own and vanishes (nobody feeding it).
  const ug = mkGame('hammer');
  ug._startAttack(ug.fighters[0], { kind: 'swipe', dx: 1, dy: 0 }, false, 0);
  const uhex = ug.projectiles.find(p => p.kind === 'hammerwave');
  uhex.ttl = 0.4;
  let uvanished = false;
  for (let i = 0; i < 40; i++) { ug._stepProjectiles(); if (!ug.projectiles.some(p => p.eid === uhex.eid)) uvanished = true; }
  check('an unoccupied hex decays away on its own', uvanished);

  // Radius is the energy gauge: it falls continuously with life, reaches a
  // tiny spark before removal, and the same smaller radius produces less
  // launch force.
  const eg = mkGame('hammer');
  const eo = eg.fighters[0];
  eg._startAttack(eo, { kind: 'swipe', dx: 1, dy: 0 }, false, 1);
  const ehex = eg.projectiles.find(p => p.kind === 'hammerwave');
  const freshR = ehex.r;
  ehex.ttl = ehex.life / 2;
  eg._stepProjectiles();
  check('a half-spent hex visibly shrinks', ehex.r < freshR && ehex.r > 8);
  eo.hammerCatch = { eid: ehex.eid, aim: { x: 0, y: -1 } };
  eg._hexLaunch(eo, ehex);
  const fadedLaunch = Math.abs(eo.vy);

  const fg = mkGame('hammer');
  const fo = fg.fighters[0];
  fg._startAttack(fo, { kind: 'swipe', dx: 1, dy: 0 }, false, 1);
  const fhex = fg.projectiles.find(p => p.kind === 'hammerwave');
  fo.hammerCatch = { eid: fhex.eid, aim: { x: 0, y: -1 } };
  fg._hexLaunch(fo, fhex);
  check('a faded hex launches with less force', fadedLaunch < Math.abs(fo.vy));

  ehex.ttl = 1.1 / 60;
  eg._stepProjectiles();
  check('a positive-energy hex remains as a tiny spark',
    eg.projectiles.some(p => p.eid === ehex.eid) && ehex.r < 9);
  eg._stepProjectiles();
  check('a hex disappears only when its energy reaches zero',
    !eg.projectiles.some(p => p.eid === ehex.eid));

  // Re-aiming mid-charge (unique to the hammer) steers the launch, and the hex
  // rim glows toward the current aim so you can see where you'll go.
  const ag = mkGame('hammer');
  const aa = ag.fighters[0];
  ag._startAttack(aa, { kind: 'swipe', dx: 1, dy: 0 }, false, 0);
  const ahex = ag.projectiles.find(p => p.kind === 'hammerwave');
  aa.x = ahex.x + ahex.r + 100; ag._resolveAttacks();
  aa.x = ahex.x; aa.y = ahex.y; aa.moveIntent = { x: 0, y: 0 }; ag._resolveAttacks();
  aa.mana = 100;
  const upChg = blankInput(); upChg.chg = { dx: 0, dy: -1 }; upChg.chgArm = true; upChg.my = -1;
  ag._stepFighter(aa, upChg); upChg.chgArm = false;
  for (let i = 0; i < 20; i++) ag._stepFighter(aa, upChg);
  check('the pinned hex glows toward the launch aim', ahex.glow && ahex.aimY < 0 && Math.abs(ahex.aimX) < 0.01);
  const leftChg = blankInput(); leftChg.chg = { dx: 0, dy: -1 }; leftChg.mx = -1;
  for (let i = 0; i < 20; i++) ag._stepFighter(aa, leftChg);
  check('the launch aim can be changed mid-charge', ahex.aimX < 0 && aa.hammerCatch);
  const relLeft = blankInput(); relLeft.mx = -1;
  ag._stepFighter(aa, relLeft);
  check('releasing after re-aim launches in the new direction', !aa.hammerCatch && aa.vx < 0 && aa.hammerFlight);

  // Ordinary hammer wind-ups also accept unlimited changes from the same hold.
  const rg = mkGame('hammer');
  const ra = rg.fighters[0];
  rg._startCharge(ra, { dx: 1, dy: 0 });
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 1], [-1, -1]]) {
    const redirect = blankInput(); redirect.chg = { dx, dy };
    rg._stepFighter(ra, redirect);
    check(`held hammer charge redirects to ${dx},${dy}`,
      ra.state === 'charge' && ra.chgAim.dx === dx && ra.chgAim.dy === dy);
  }

  // A jump dislodges a caught wielder naturally once the pause has passed.
  const jg = mkGame('hammer');
  const ja = jg.fighters[0];
  jg._startAttack(ja, { kind: 'swipe', dx: 1, dy: 0 }, false, 1);
  const jhex = jg.projectiles.find(p => p.kind === 'hammerwave');
  ja.x = jhex.x + jhex.r + 100; jg._resolveAttacks();
  ja.x = jhex.x; ja.y = jhex.y; ja.moveIntent = { x: 0, y: 0 }; jg._resolveAttacks();
  for (let i = 0; i < 8; i++) jg._stepFighter(ja, blankInput());
  check('a caught wielder holds still with no input', ja.hammerCatch && ja.vy === 0);
  const jump = blankInput(); jump.jump = true; ja.jumps = ja.st.maxJumps;
  jg._stepFighter(ja, jump);
  check('a jump dislodges a caught wielder', !ja.hammerCatch && ja.vy < 0 && !ja.hammerFlight);

  const expiring = mkGame('hammer');
  const ex = expiring.fighters[0];
  ex.y = -200; ex.grounded = false;
  expiring._startAttack(ex, { kind: 'swipe', dx: 1, dy: 0 });
  const fading = expiring.projectiles[0];
  ex.x = fading.x + fading.r + 100; expiring._resolveAttacks();
  ex.moveIntent = { x: 0, y: 0 }; ex.x = fading.x; expiring._resolveAttacks();
  fading.ttl = 0;
  expiring._stepProjectiles();
  expiring._stepFighter(ex, blankInput());
  check('a neutral catch lasts until its hex decays', !ex.hammerCatch && ex.vy > 0);

  const limited = mkGame('hammer');
  const lm = limited.fighters[0]; lm.mana = 36;
  const chargeInput = blankInput(); chargeInput.chg = { dx: 1, dy: 0 }; chargeInput.chgArm = false;
  limited._startCharge(lm, chargeInput.chg);
  for (let i = 0; i < 120 && lm.state === 'charge'; i++) limited._stepFighter(lm, chargeInput);
  check('hammer auto-releases at its available mana', lm.state === 'attack' && limited.projectiles.some(p => p.kind === 'hammerwave'));
  check('mana-limited auto-release does not fizzle or overdraw', lm.mana >= 0 && !limited.events.some(e => e.e === 'fizzle'));

  const dry = mkGame('hammer');
  dry.fighters[0].mana = 20;
  dry._startAttack(dry.fighters[0], { kind: 'swipe', dx: 1, dy: 0 }, false, 0);
  check('dry hammer cannot create a hex or launch', dry.projectiles.length === 0 && dry.fighters[0].vx === 0);

  const down = mkGame('hammer');
  const d = down.fighters[0]; d.grounded = true;
  down._startAttack(d, { kind: 'swipe', dx: 0, dy: 1 }, false, 1);
  const split = down.projectiles.filter(p => p.kind === 'hammerwave');
  check('grounded down hammer still makes one centered hex', split.length === 1 && split[0].x === d.x && split[0].y === d.y);

  const up = mkGame('hammer');
  const u = up.fighters[0]; u.grounded = true;
  up._startAttack(u, { kind: 'swipe', dx: 0, dy: -1 }, false, 1);
  check('grounded up hammer launches through one hex', u.atk === 'hthrust' && u.vy < 0 && up.projectiles.filter(p => p.kind === 'hammerwave').length === 1);

  const diag = mkGame('hammer');
  const dg = diag.fighters[0]; dg.grounded = true;
  diag._startAttack(dg, { kind: 'swipe', dx: 1, dy: -1 }, false, 1);
  check('diagonal-up hammer thrust carries both axes', dg.atk === 'hthrust' && dg.vx > 0 && dg.vy < 0);

  const air = mkGame('hammer');
  const ar = air.fighters[0]; ar.grounded = false;
  check('every aerial hammer direction selects thrust', [[1, 0], [0, 1], [-1, -1]].every(([dx, dy]) => air._weaponAttack(ar, dx, dy) === 'hthrust'));
  air._startCharge(ar, { dx: 1, dy: 0 });
  const short = air.hitboxFor(ar);
  const charged = mkGame('hammer');
  const ch = charged.fighters[0]; ch.grounded = false;
  charged._startCharge(ch, { dx: 1, dy: 0 }); ch.stateT = charged._chargeMax(ch);
  const long = charged.hitboxFor(ch);
  check('hammer charge exposes its hex telegraph', short.hammerThrust && !short.active);
  check('aerial hammer telegraph is centered on the wielder', short.hammerAir && short.dx === 0 && short.dy === 0);
  check('hammer telegraph retains equal-size hex data', long.hw === short.hw && long.hh === short.hh);
  charged._releaseCharge(ch);
  const airWaves = charged.projectiles.filter(p => p.kind === 'hammerwave');
  check('aerial hammer releases only one body-centered hex', airWaves.length === 1 && airWaves[0].x === ch.x && airWaves[0].y === ch.y);

  const chain = mkGame('hammer');
  const c = chain.fighters[0];
  chain._startAttack(c, { kind: 'swipe', dx: 1, dy: 0 });
  c.stateT = .35; chain.step();
  chain._startAttack(c, { kind: 'swipe', dx: 0, dy: -1 });
  check('a redirected uncharged follow-up creates one more hex', chain.projectiles.filter(p => p.kind === 'hammerwave').length === 2 && c.hammerChainN === 1);
  check('hammer attack has no recovery delay', c.atk === 'hthrust' && c.stateT === 0);
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
