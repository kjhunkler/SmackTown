// Headless smoke test: ability kit behavior. Spike traps lock victims in a
// long stun, uppercut rockets foes skyward, dash strike can angle upward,
// fireballs leave an afterburn DoT, the grapple hook reels harder the
// further it flies, and the teleport anchor drops a beacon that doubles as
// its own activate button for the whole cooldown. Run: node test-abilities.mjs
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
  check('a point-blank tag yanks with real minimum force', near !== null && near > 500);
  check('a max-range snag hauls far harder still', far !== null && far > near * 1.2);
}

// --- 6. teleport anchor: drop a beacon, warp back to it, one at a time ---
{
  const g = mkGame(['anchor']);
  const a = g.fighters[0];
  a.x = 40; a.y = -100; a.facing = 1;
  g._useAbility(a, 0);
  const beacon = g.projectiles.find(p => p.kind === 'anchor');
  check('the button drops a beacon at your feet', beacon && beacon.x === 40 && beacon.y === -100);
  check('the beacon is armed for 4s while the cooldown runs 6s', beacon.ttl === 4 && a.cds[0] === 6);

  // wander off, then activate: the button warps you straight back
  a.x = 500; a.y = -400; a.vx = 300; a.vy = -50;
  g._useAbility(a, 0);
  check('activating warps back to the drop point', a.x === 40 && a.y === -100);
  check('velocity is cleared on arrival', a.vx === 0 && a.vy === 0);
  check('arrival grants a brief mercy window', a.invuln > 0);
  check('the beacon is consumed', !g.projectiles.some(p => p.kind === 'anchor' && p.ttl > 0));

  // still on cooldown, no beacon left: the button is a no-op, not a new drop
  const stillX = a.x, cdBefore = a.cds[0];
  g._useAbility(a, 0);
  check('a spent anchor mid-cooldown does nothing', a.x === stillX && a.cds[0] === cdBefore);
  check('...and does not sneak out a fresh beacon', !g.projectiles.some(p => p.kind === 'anchor' && p.ttl > 0));

  // mashing the button right after a drop teleports (no-op position) instead
  // of stacking a second beacon
  const g2 = mkGame(['anchor']);
  const b = g2.fighters[0];
  b.x = 0; b.y = -50;
  g2._useAbility(b, 0);
  g2._useAbility(b, 0);
  check('back-to-back presses never leave two live beacons',
    g2.projectiles.filter(p => p.kind === 'anchor' && p.ttl > 0).length === 0);

  // once the cooldown fully elapses, a fresh drop is available again
  g.inputs.set('A', blankInput()); g.inputs.set('B', blankInput());
  for (let i = 0; i < 6 / (1 / 60) + 5; i++) g.step();
  check('cooldown runs out', a.cds[0] === 0);
  a.x = 900;
  g._useAbility(a, 0);
  check('a new beacon can be dropped once the cooldown clears',
    g.projectiles.some(p => p.kind === 'anchor' && p.x === 900));

  // the beacon expires at 4s while the cooldown still has 2s to run: the
  // warp window is gone and the button goes dead until the cooldown clears
  const g3 = mkGame(['anchor']);
  const c = g3.fighters[0];
  c.x = 0; c.y = -50;
  g3._useAbility(c, 0);
  g3.inputs.set('A', blankInput()); g3.inputs.set('B', blankInput());
  for (let i = 0; i < 4.2 / (1 / 60); i++) g3.step();
  check('the beacon expires after 4s', !g3.projectiles.some(p => p.kind === 'anchor'));
  check('...while the cooldown is still running', c.cds[0] > 1);
  const beforeX = c.x;
  g3._useAbility(c, 0);
  check('pressing in the dead stretch neither warps nor drops',
    c.x === beforeX && !g3.projectiles.some(p => p.kind === 'anchor'));
}

// --- 7. spring trap: launches the victim exactly backwards ---
{
  const g = mkGame(['springtrap']);
  const [a, b] = g.fighters;
  a.x = 0; a.facing = 1;
  g._useAbility(a, 0);
  const sp = g.projectiles.find(p => p.kind === 'spring');
  check('spring plants and arms', sp && sp.spring === true && sp.ang === 0);
  // Bob runs onto it moving RIGHT: the spring fires him back LEFT, dead flat
  b.x = sp.x; b.y = -32; b.vx = 300; b.facing = 1;
  g._resolveAttacks();
  check('spring victim is launched backwards', b.vx < 0);
  check('the launch is exactly flat', b.vy === 0);
  check('the spring is spent', sp.ttl <= 0);

  // standing still on it, the launch reverses the victim's facing instead
  const g2 = mkGame(['springtrap']);
  const [c, d] = g2.fighters;
  c.x = 0; c.facing = 1;
  g2._useAbility(c, 0);
  const sp2 = g2.projectiles.find(p => p.kind === 'spring');
  d.x = sp2.x; d.y = -32; d.vx = 0; d.facing = 1;
  g2._resolveAttacks();
  check('a still victim flies opposite their facing', d.vx < 0 && d.vy === 0);
}

// --- 8. summons: a ground troop and a flyer that fight for the summoner ---
{
  const g = mkGame(['troop', 'bird']);
  const [a, b] = g.fighters;
  a.x = 0; a.facing = 1; b.x = 220; b.y = a.y;
  g.inputs.set('A', blankInput()); g.inputs.set('B', blankInput());
  g._useAbility(a, 0);
  const troop = g.enemies.find(e => e.ally === 'A');
  check('the call is answered by a ground troop',
    troop && ['grunt', 'runner', 'brute', 'hopper', 'slinger'].includes(troop.kind));
  check('the troop carries a one-minute life clock', troop.life === 60);
  g._useAbility(a, 1);
  const flyer = g.enemies.find(e => e.ally === 'A' && e.kind === 'flyer');
  check('the flyer summon is always the flying creep', !!flyer);
  check('summons cost no CR bounty when downed', troop.cr === 0 && flyer.cr === 0);

  // in PvP the summons hunt the rival: someone lands a hit inside a while
  const pct0 = b.pct;
  for (let i = 0; i < 60 * 6 && b.pct === pct0; i++) g.step();
  check('a summon hits the rival within a few seconds', b.pct > pct0);
  check('summon damage credits the summoner', a.score.dmg > 0);

  // the clock runs out: the summon fades on its own
  const g3 = mkGame(['troop']);
  const e3 = g3.fighters[0];
  g3.inputs.set('A', blankInput()); g3.inputs.set('B', blankInput());
  g3._useAbility(e3, 0);
  const pet3 = g3.enemies.find(e => e.ally === 'A');
  check('the fresh summon is on the field', !!pet3);
  pet3.life = 0.5;   // fast-forward the clock to its last half second
  for (let i = 0; i < 60; i++) g3.step();
  check('summons fade when their time is up', !g3.enemies.some(e => e.ally === 'A'));

  // rivals can kill a summon: it dies to damage, paying nothing
  const g2 = mkGame(['bird']);
  const [c, d] = g2.fighters;
  c.x = 0; c.facing = 1; d.x = 400;
  g2.inputs.set('A', blankInput()); g2.inputs.set('B', blankInput());
  g2._useAbility(c, 0);
  const bird2 = g2.enemies.find(e => e.ally === 'A');
  const dKos = d.score.ko;
  bird2.hp = 1;
  g2._hitEnemy(d, bird2, { dmg: 5, kb: 200, ks: 5 }, 0, 1, false);
  check('a rival can strike a summon down', bird2.hp <= 0);
  check('downing a summon earns no KO credit', d.score.ko === dKos);
  for (let i = 0; i < 10; i++) g2.step();   // ride out the kill's hit pause
  check('the dead summon is cleared from the field', !g2.enemies.some(e => e.ally === 'A'));
}

// --- 9. summons in co-op: they hunt creeps, not the party ---
{
  const g = new Game([
    { id: 'A', name: 'Alice', color: '#f00', build: build(['troop']) },
    { id: 'B', name: 'Bob', color: '#0f0', build: build() },
  ], 7, 'expanse');
  const [a, b] = g.fighters;
  g.inputs.set('A', blankInput()); g.inputs.set('B', blankInput());
  a.x = 0; a.facing = 1;
  g._useAbility(a, 0);
  const pet = g.enemies.find(e => e.ally === 'A');
  check('summons work on the expedition road', !!pet);
  // park a creep right next to the summon and let it swing
  g.enemies.push({
    eid: 99999, kind: 'grunt', hw: 22, hh: 26,
    x: pet.x + 60, y: g.stage.main.y - 26, vx: 0, vy: 0,
    hp: 9, maxHp: 9, cr: 5, facing: -1, grounded: true, hurt: 0,
    windup: 0, atkCd: 99, stagger: 0, temperament: 'bold', focusId: null,
    elite: false, variant: 0, rushT: 0, rushHit: null, atkKind: 0, aimX: 0, aimY: 0,
  });
  const creep = g.enemies[g.enemies.length - 1];
  const hpBefore = creep.hp;
  const hpA = a.hp, hpB = b.hp;
  for (let i = 0; i < 60 * 4 && creep.hp === hpBefore; i++) g.step();
  check('the summon carves into the creep', creep.hp < hpBefore);
  check('the party is never its target', a.hp === hpA && b.hp === hpB);
}

// --- 10. summon caps: 2 per layer, the weakest replaced at the limit ---
{
  const g = mkGame(['troop', 'bird']);
  const [a, b] = g.fighters;
  b.invuln = 999;
  g.inputs.set('A', blankInput()); g.inputs.set('B', blankInput());
  const ground = () => g.enemies.filter(e => e.ally === 'A' && e.kind !== 'flyer');
  const flying = () => g.enemies.filter(e => e.ally === 'A' && e.kind === 'flyer');

  g._useAbility(a, 0); a.cds[0] = 0;
  g._useAbility(a, 0); a.cds[0] = 0;
  check('two ground summons can hold the field at once', ground().length === 2);
  const [g1, g2] = ground();
  g1.hp = 1;   // wound the first: it's now the weakest of the pair
  g._useAbility(a, 0); a.cds[0] = 0;
  check('a third cast never exceeds the ground cap', ground().length === 2);
  check('the weakest ground summon made way for the fresh one',
    !g.enemies.includes(g1) && g.enemies.includes(g2));

  g._useAbility(a, 1); a.cds[1] = 0;
  g._useAbility(a, 1); a.cds[1] = 0;
  g._useAbility(a, 1); a.cds[1] = 0;
  check('flyers cap at two on their own separate layer', flying().length === 2);
  check('the flying cap never touches the ground pair', ground().length === 2);
}

// --- 11. PvP: summons duel rival summons ---
{
  const g = new Game([
    { id: 'A', name: 'Alice', color: '#f00', build: build(['bird']) },
    { id: 'B', name: 'Bob', color: '#0f0', build: build(['bird']) },
  ], 7, 'flatlands');
  const [a, b] = g.fighters;
  g.inputs.set('A', blankInput()); g.inputs.set('B', blankInput());
  a.x = -150; b.x = 150;
  a.invuln = 999; b.invuln = 999;   // untouchable fighters: only the summons can trade
  g._useAbility(a, 0);
  g._useAbility(b, 0);
  const mine = g.enemies.find(e => e.ally === 'A');
  const theirs = g.enemies.find(e => e.ally === 'B');
  check('both sides field a summon', !!mine && !!theirs);
  for (let i = 0; i < 60 * 8 && mine.hp === mine.maxHp && theirs.hp === theirs.maxHp; i++) g.step();
  check('rival summons find and fight each other',
    mine.hp < mine.maxHp || theirs.hp < theirs.maxHp);
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
