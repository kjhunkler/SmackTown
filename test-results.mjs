// Headless smoke test: match stats (KOs/damage), score snapshot round-trip,
// and rejoin dedupe via rebindFighter. Run: node test-results.mjs
import { Game, gameFromSnapshot, restoreFighter, platsAt } from './js/game.js';

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
  check('forfeited rejoiner comes back alive', !f.dead && f.stocks === 3 && f.state === 'respawn');
  check('forfeited rejoiner keeps score', f.score.ko === 1);
  check('lastHitBy attribution follows the rebind', g.fighters[0].lastHitBy === 'B2');
  check('rebind of unknown id falls back to addFighter', g.rebindFighter('ZZZ', { id: 'D', name: 'Dee', color: '#fff', build: build() }) !== null && g.fighters.length === 4);
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
  check('jab still plants (speed cut)', b.vx === 0);
  c.grounded = true; c.vx = 380; c.facing = 1;
  g._startAttack(c, { kind: 'tap', dx: -1, dy: 0 });
  check('backward tap opts out of the dash', c.atk === 'jab');
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

// --- 10. sim still runs & finishes with scores ---
{
  const g = new Game(players.slice(0, 2), 7, 'arena');
  const [a, b] = g.fighters;
  for (let i = 0; i < 3; i++) {
    b.lastHitBy = 'A';
    b.x = g.stage.blast.l - 50;
    b.state = 'air'; b.invuln = 0;
    g._checkBlast();
  }
  g.step();
  check('game ends when stocks run out', g.over && g.winner?.id === 'A');
  check('winner holds 3 KOs', a.score.ko === 3 && b.score.fall === 3);
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
