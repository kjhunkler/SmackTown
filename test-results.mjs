// Headless smoke test: match stats (KOs/damage), score snapshot round-trip,
// and rejoin dedupe via rebindFighter. Run: node test-results.mjs
import { Game, gameFromSnapshot, restoreFighter, platsAt, MAPS, MAP_IDS } from './js/game.js';

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
  { id: 'C', name: 'Cara', color: '#00f', build: build() },
];

// --- 1. damage accumulation ---
{
  const g = new Game(players, 7, 'arena');
  const [a, b] = g.fighters;
  g._applyHit(a, b, { dmg: 10, kb: 100, ks: 5 }, 0, 1);
  g._applyHit(a, b, { dmg: 20, kb: 100, ks: 5 }, 0, 1);
  check('attacker dmg accumulates', Math.abs(a.score.dmg - 30) < 0.01);
  check('victim taken accumulates', Math.abs(b.score.taken - 30) < 0.01);
  check('maxHit records biggest single hit', Math.abs(a.score.maxHit - 20) < 0.01);
  check('bystander untouched', g.fighters[2].score.dmg === 0 && g.fighters[2].score.taken === 0);
}

// --- 2. KO / fall / SD credit ---
{
  const g = new Game(players, 7, 'arena');
  const [a, b, c] = g.fighters;
  b.lastHitBy = 'A';
  b.x = g.stage.blast.l - 50;          // knocked off the left
  g._checkBlast();
  check('KO credited to last hitter', a.score.ko === 1);
  check('fall recorded on victim', b.score.fall === 1 && b.score.sd === 0);
  c.lastHitBy = null;
  c.y = g.stage.blast.b + 50;          // walked off with no attribution
  g._checkBlast();
  check('SD recorded when nobody hit them', c.score.sd === 1 && c.score.fall === 2 - 1);
  check('no KO credit on an SD', a.score.ko === 1 && b.score.ko === 0);
}

// --- 3. score snapshot round-trip ---
{
  const g = new Game(players, 7, 'arena');
  const [a, b] = g.fighters;
  g._applyHit(a, b, { dmg: 12.5, kb: 100, ks: 5 }, 0, 1);
  a.score.ko = 2; b.score.fall = 2; b.score.sd = 1;
  const snap = g.snapshot();
  const g2 = gameFromSnapshot(players, snap, 8);
  const a2 = g2.fighters.find(f => f.id === 'A');
  const b2 = g2.fighters.find(f => f.id === 'B');
  check('snapshot restores ko/fall/sd', a2.score.ko === 2 && b2.score.fall === 2 && b2.score.sd === 1);
  check('snapshot restores dmg totals', Math.abs(a2.score.dmg - 12.5) < 0.11 && Math.abs(b2.score.taken - 12.5) < 0.11);
  const f = { ...g2.fighters[0], score: { ko: 0, fall: 0, sd: 0, dmg: 0, taken: 0, maxHit: 0 } };
  restoreFighter(f, snap.f[0]);
  check('restoreFighter unpacks score column', f.score.ko === 2);
}

// --- 4. rebindFighter: rejoin keeps one seat, stats ride along ---
{
  const g = new Game(players, 7, 'arena');
  const b = g.fighters[1];
  b.score.ko = 3; b.score.dmg = 55;
  b.pct = 80; b.stocks = 2;
  const f = g.rebindFighter('B', { id: 'B2', name: 'Bob', color: '#0f0', build: build() });
  check('rebind keeps fighter count', g.fighters.length === 3);
  check('rebind moves id, keeps stats', f.id === 'B2' && f.score.ko === 3 && f.score.dmg === 55);
  check('rebind keeps live stocks/pct', f.stocks === 2 && f.pct === 80);
  check('inputs remapped to new id', g.inputs.has('B2') && !g.inputs.has('B'));
  check('no duplicate fighter ids', new Set(g.fighters.map(x => x.id)).size === 3);
}

// --- 5. rebind after disconnect-forfeit: re-admitted alive, stats intact ---
{
  const g = new Game(players, 7, 'arena');
  const b = g.fighters[1];
  b.score.ko = 1;
  b.dead = true; b.stocks = 0; b.state = 'dead';      // onRoster forfeit
  g.fighters[0].lastHitBy = 'B';
  const f = g.rebindFighter('B', { id: 'B2', name: 'Bob', color: '#0f0', build: build() });
  check('forfeited rejoiner comes back alive', !f.dead && f.stocks === 4 && f.state === 'respawn');
  check('forfeited rejoiner keeps score', f.score.ko === 1);
  check('lastHitBy attribution follows the rebind', g.fighters[0].lastHitBy === 'B2');
  check('rebind of unknown id falls back to addFighter', g.rebindFighter('ZZZ', { id: 'D', name: 'Dee', color: '#fff', build: build() }) !== null && g.fighters.length === 4);
}

// --- 5b. character switch: rebind adopts the new build, updateBuild swaps live ---
{
  const g = new Game(players, 7, 'arena');
  const speedy = { stats: { power: 0, speed: 5, defense: 0, agility: 0 }, abilities: ['fireball'], augments: [] };
  const f = g.rebindFighter('B', { id: 'B2', name: 'Bob', color: '#0f0', build: speedy });
  check('rebind adopts the new character build', Math.abs(f.st.speedMult - 1.3) < 0.01);
  const feather = { stats: { power: 0, speed: 0, defense: 0, agility: 0 }, abilities: [], augments: ['feather'] };
  g.updateBuild('B2', feather);
  check('updateBuild swaps a live kit', f.st.maxJumps === 3 && Math.abs(f.st.speedMult - 1) < 0.01);
  f.jumps = 3;
  g.updateBuild('B2', build());
  check('shrinking kits clamp air jumps', f.jumps <= f.st.maxJumps);
  check('updateBuild of unknown id is a no-op', g.updateBuild('nobody', build()) === null);
}

// --- 6. dash attack: momentum-gated tap conversion ---
{
  const g = new Game(players, 7, 'arena');
  const [a, b, c] = g.fighters;
  a.grounded = true; a.vx = 380; a.facing = 1;
  g._startAttack(a, { kind: 'tap', dx: 1, dy: 0 });
  check('running tap becomes dash attack', a.atk === 'dash');
  check('dash attack keeps the slide', a.vx === 380);
  check('dash launches along the run', a.atkDir && a.atkDir.x === 1);
  b.grounded = true; b.vx = 0;
  g._startAttack(b, { kind: 'tap', dx: 1, dy: 0 });
  check('standstill tap stays a jab', b.atk === 'jab');
  check('jab steps forward with a small lunge', b.vx > 100 && b.vx < 300);
  c.grounded = true; c.vx = 380; c.facing = 1;
  g._startAttack(c, { kind: 'tap', dx: -1, dy: 0 });
  check('backward tap opts out of the dash', c.atk === 'jab');
}

// --- 6b. spike bounce: a landed spike springs the attacker back up ---
{
  const g = new Game(players, 7, 'arena');
  const [a, b] = g.fighters;
  a.grounded = false; a.vy = 500; a.jumps = 0;      // falling, jumps spent
  g._applyHit(a, b, { dmg: 11, kb: 220, ks: 20 }, Math.PI / 2, 1, true);
  check('spike sends the victim down', b.vy > 0);
  check('spike bounces the attacker up', a.vy < 0 && !a.grounded);
  check('spike refreshes the attacker\'s jumps', a.jumps === a.st.maxJumps);
  check('spike bounce fires its event', g.events.some(e => e.e === 'spikebounce' && e.id === 'A'));
  // a plain (non-spike) hit leaves the attacker alone
  const g2 = new Game(players, 7, 'arena');
  const [a2, b2] = g2.fighters;
  a2.grounded = false; a2.vy = 500; a2.jumps = 0;
  g2._applyHit(a2, b2, { dmg: 10, kb: 100, ks: 5 }, 0, 1);
  check('normal hits do not bounce the attacker', a2.vy === 500 && a2.jumps === 0);
  // an already-rising attacker keeps their stronger lift
  const g3 = new Game(players, 7, 'arena');
  const [a3, b3] = g3.fighters;
  a3.grounded = false; a3.vy = -900; a3.jumps = 1;
  g3._applyHit(a3, b3, { dmg: 11, kb: 220, ks: 20 }, Math.PI / 2, 1, true);
  check('spike bounce never slows a rising attacker', a3.vy === -900);
}

// --- 7. unknown attack names (newer peer) fizzle instead of crashing ---
{
  const g = new Game(players, 7, 'arena');
  const a = g.fighters[0];
  a.state = 'attack'; a.atk = 'from-the-future'; a.stateT = 0.05;
  let ok = true;
  try { g.hitboxFor(a); g._resolveAttacks(); g.step(); } catch (_) { ok = false; }
  check('unknown attack never throws', ok);
  check('unknown attack fizzles to neutral', a.atk === null && a.state !== 'attack');
}

// --- 8. dodge roll out of a duck ---
{
  const g = new Game(players, 7, 'battlefield');
  const [a, b] = g.fighters;
  a.state = 'duck'; a.grounded = true; a.facing = -1;   // looking away from the roll
  const ia = g.inputs.get('A');
  ia.roll = 1; ia.bufR = 0.15;
  const x0 = a.x;
  g.step();
  check('duck + sideways = dodge roll', a.state === 'roll' && a.rollDir === 1);
  check('roll faces its direction from the first frame', a.facing === 1);
  check('roll grants i-frames', a.invuln > 0.2);
  check('roll bites the guard', Math.abs(a.guard - 78) < 0.01);
  for (let i = 0; i < 30; i++) g.step();
  check('roll travels the ground', a.x - x0 > 100);
  check('roll ends back in neutral', a.state === 'idle' && a.facing === 1);
  b.state = 'duck'; b.grounded = true; b.guard = 10;
  const ib = g.inputs.get('B');
  ib.roll = 1; ib.bufR = 0.15;
  g.step();
  check('worn-out guard cannot roll', b.state !== 'roll');
  const c = g.fighters[2];
  c.state = 'idle'; c.grounded = true;
  const ic = g.inputs.get('C');
  ic.roll = 1; ic.bufR = 0.15;
  g.step();
  check('no roll without a duck', c.state !== 'roll');
}

// --- 9. dodge roll on a platform stays on the platform ---
{
  const g = new Game(players, 7, 'battlefield');
  const a = g.fighters[0];
  const p = platsAt('battlefield', 1)[0];
  a.x = p.x + p.w / 2; a.y = p.y - 32; a.grounded = true; a.ridePlat = 0;
  a.state = 'duck';
  const ia = g.inputs.get('A');
  ia.roll = -1; ia.bufR = 0.15;
  for (let i = 0; i < 30; i++) g.step();
  const pNow = platsAt('battlefield', g.tick)[0];
  check('platform roll follows the platform top', Math.abs(a.y - (pNow.y - 32)) < 1);
  check('platform roll stops at the edge', a.x >= pNow.x && a.x <= pNow.x + pNow.w);
}

// --- 10. training room: free play on a hidden map ---
{
  check('training map exists but is out of rotation',
    !!MAPS.training && MAPS.training.hidden && !MAP_IDS.includes('training'));
  const g = new Game([
    players[0],
    { id: 'S', name: 'Sandbag', sandbag: true, build: build() },
  ], 7, 'training');
  check('training map id sticks (no fallback)', g.map === 'training');
  const [a, s] = g.fighters;
  check('sandbag flag rides the spawn', s.sandbag === true);
  for (let i = 0; i < 5; i++) {
    s.lastHitBy = 'A';
    s.state = 'air'; s.invuln = 0; s.grounded = false;
    s.x = g.stage.blast.l - 60;
    g._checkBlast();
  }
  check('sandbag respawns forever, no stock loss', s.stocks === 4 && !s.dead && s.state === 'respawn');
  check('KOs still tallied for practice feedback', a.score.ko === 5);
  a.state = 'air'; a.invuln = 0; a.grounded = false;
  a.y = g.stage.blast.b + 60;
  g._checkBlast();
  check('players fall free in training too', a.stocks === 4 && !a.dead);
  g.step();
  check('training never ends', !g.over && g.winner === null);
}

// --- 11. quick fall + waveland ---
{
  const g = new Game(players, 7, 'flatlands');
  const [a, b, c] = g.fighters;
  // quick fall: down mid-rise kills the rest of the jump
  a.grounded = false; a.state = 'air'; a.vy = -700; a.y = -200;
  g.inputs.get('A').ff = true;
  g.step();
  check('quick fall cancels the jump ascent', a.fastfall && a.vy >= 0);
  // …but never cancels a launch: hitstun keeps its lift
  const h = g.fighters[2];
  h.grounded = false; h.state = 'hitstun'; h.hitstunFor = 1; h.stateT = 0;
  h.vy = -900; h.y = -200;
  g.inputs.get('C').ff = true;
  g.step();
  check('quick fall cannot ditch hitstun lift', h.vy < -700);
  // waveland: fast-fallen landing with drift keeps sliding
  a.state = 'air'; a.grounded = false; a.fastfall = true;
  a.x = 0; a.y = -40; a.vy = 600; a.vx = 300;
  // plain landing at the same drift, no fastfall: control group
  b.state = 'air'; b.grounded = false; b.fastfall = false;
  b.x = 300; b.y = -40; b.vy = 600; b.vx = 300;
  g.step();
  check('waveland arms on a drifting fast-fall landing', a.grounded && a.slideT > 0);
  check('plain landings do not slide', b.grounded && b.slideT === 0);
  for (let i = 0; i < 10; i++) g.step();
  check('waveland keeps the slide slick', a.vx > 100 && b.vx < 40);
  // attacking mid-waveland skips the landing plant
  const v0 = a.vx;
  g._startAttack(a, { kind: 'tap', dx: 0, dy: 0 });
  check('waveland attack keeps its glide', a.vx === v0);
  // combo taps no longer plant: momentum sails through the swing
  c.grounded = true; c.vx = 250; c.facing = 1;
  g._startAttack(c, { kind: 'tap', dx: 0, dy: 0 });
  check('grounded tap glides through the swing', c.vx === 250);
}

// --- 12. parked fighters: asleep, untouchable, wake to the lowest stocks ---
{
  const g = new Game(players, 7, 'battlefield');
  const [a, b, c] = g.fighters;
  g.setParked('B', true);
  g.step();
  check('parked fighter is invulnerable', b.parked && b.invuln > 0);
  g._applyHit(a, b, { dmg: 10, kb: 100, ks: 5 }, 0, 1);
  check('parked fighter shrugs off direct hits', b.pct === 0 || b.invuln > 0);
  // melee resolution skips invulnerable victims entirely
  a.x = b.x - 30; a.state = 'attack'; a.atk = 'jab'; a.stateT = 0.06; a.facing = 1;
  g._resolveAttacks();
  check('melee never lands on a sleeper', !a.atkHit.has('B'));
  // wake-up price: match the lowest fighter still brawling
  a.stocks = 1; c.stocks = 2;
  g.setParked('B', false);
  check('waking matches the lowest stocks', !b.parked && b.stocks === 1);
  // never a refund: rejoining with fewer stocks keeps them
  g.setParked('A', true);
  g.setParked('A', false);
  check('waking never grants stocks back', a.stocks === 1);
  // parked flag survives the snapshot round-trip (host handoff)
  g.setParked('C', true);
  const g2 = gameFromSnapshot(players, g.snapshot(), 8);
  check('parked rides the snapshot', g2.fighters.find(f => f.id === 'C').parked === true);
}

// --- 13. sim still runs & finishes with scores ---
{
  const g = new Game(players.slice(0, 2), 7, 'arena');
  const [a, b] = g.fighters;
  for (let i = 0; i < 4; i++) {
    b.lastHitBy = 'A';
    b.x = g.stage.blast.l - 50;
    b.state = 'air'; b.invuln = 0;
    g._checkBlast();
  }
  g.step();
  check('game ends when stocks run out', g.over && g.winner?.id === 'A');
  check('winner holds 4 KOs', a.score.ko === 4 && b.score.fall === 4);
}

// --- 14. duck damage reduction scales with guard remaining ---
{
  const dmgAt = guard => {
    const g = new Game(players, 7, 'arena');
    const [a, b] = g.fighters;
    b.state = 'duck';
    b.guard = guard;
    g._applyHit(a, b, { dmg: 20, kb: 100, ks: 5 }, 0, 1);
    return { pct: b.pct, guardLeft: b.guard, state: b.state };
  };
  const full = dmgAt(100), empty = dmgAt(0), half = dmgAt(50), safe = dmgAt(60);
  check('full guard mitigates hardest (20 * 0.35 = 7)', Math.abs(full.pct - 7) < 0.01);
  check('empty guard barely mitigates (20 * 0.9 = 18)', Math.abs(empty.pct - 18) < 0.01);
  check('half guard sits at the midpoint (20 * 0.625 = 12.5)', Math.abs(half.pct - 12.5) < 0.01);
  check('mitigation strictly improves with more guard', full.pct < half.pct && half.pct < empty.pct);
  check('the guard meter always eats the RAW hit, independent of the mitigation curve',
    Math.abs(full.guardLeft - 80) < 0.01 && Math.abs(safe.guardLeft - 40) < 0.01);
  check('guard hitting zero still crushes, same as before', empty.state === 'crush' && empty.guardLeft === 0);
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
