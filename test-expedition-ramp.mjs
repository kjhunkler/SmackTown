// Headless smoke test: expedition difficulty ramp. Creeps must hit harder,
// carry more hp, and chase faster as the run clock climbs — capped, applied
// once per damage path, riding host handoff, and leaving PvP untouched.
// Run: node test-expedition-ramp.mjs
import { Game, gameFromSnapshot, ENEMY_TYPES, MAPS } from './js/game.js';

let n = 0, fails = 0;
function check(name, ok) {
  n++;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}. ${name}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const build = () => ({ stats: { power: 0, speed: 0, defense: 0, agility: 0 }, abilities: [], augments: [] });
const players = [
  { id: 'A', name: 'Alice', color: '#f00', build: build() },
  { id: 'B', name: 'Bob', color: '#0f0', build: build() },
];
const TIER = 24;   // DIFF_STEP: run seconds per difficulty tier
const mkGame = () => new Game(players, 7, 'expanse');
const mkFoe = (g, kind, x, y, extra = {}) => {
  const t = ENEMY_TYPES[kind];
  return { eid: 9000 + n, kind, x, y, vx: 0, vy: 0, hw: t.w / 2, hh: t.h / 2,
    hp: t.hp, maxHp: t.hp, facing: 1, grounded: true, hurt: 0, windup: 0,
    atkCd: 0, stagger: 0, temperament: 'bold', focusId: null, elite: false,
    variant: 0, rushT: 0, rushHit: null, atkKind: 0, aimX: x + 200, aimY: y, ...extra };
};

// --- 1. the multipliers themselves ---
{
  const g = mkGame();
  check('damage mult starts at 1', g._enemyDmgMult() === 1);
  g.runT = 10 * TIER;
  check('ten tiers in, creeps hit 60% harder', near(g._enemyDmgMult(), 1.6));
  g.runT = 1000 * TIER;
  check('damage mult caps at 2.5', g._enemyDmgMult() === 2.5);
  check('elites stack a 1.25x bonus on the ramp', near(g._enemyDmgMult({ elite: true }), 2.5 * 1.25));
  g.runT = 0;
  check('speed mult starts at 1', g._enemySpdMult() === 1);
  g.runT = 10 * TIER;
  check('ten tiers in, commons chase 15% faster', near(g._enemySpdMult(), 1.15));
  g.runT = 1000 * TIER;
  check('speed mult caps at 1.35', g._enemySpdMult() === 1.35);
}

// --- 2. melee strikes scale with the clock ---
{
  const hpAfterStrike = runT => {
    const g = mkGame();
    g.runT = runT;
    const f = g.fighters[0];
    f.invuln = 0;
    const e = mkFoe(g, 'grunt', f.x - 60, f.y);
    g._enemyStrike(e, ENEMY_TYPES.grunt, [f]);
    return f.hp;
  };
  const full = mkGame().fighters[0].hp;
  const early = hpAfterStrike(0);
  const late = hpAfterStrike(10 * TIER);
  check('a fresh-run grunt strike lands base damage', near(full - early, ENEMY_TYPES.grunt.dmg, 0.01));
  check('the same strike ten tiers in hits 1.6x', near(full - late, ENEMY_TYPES.grunt.dmg * 1.6, 0.01));
}

// --- 3. shots scale too, elites on top ---
{
  const g = mkGame();
  const f = g.fighters[0];
  const shotDmg = (runT, elite) => {
    g.runT = runT;
    const e = mkFoe(g, 'slinger', f.x - 300, f.y, { elite });
    g._enemyFire(e, ENEMY_TYPES.slinger, f);
    return g.projectiles.at(-1).dmg;
  };
  check('a fresh slinger shot carries base damage', near(shotDmg(0, false), ENEMY_TYPES.slinger.shotDmg));
  check('ten tiers in the shot carries 1.6x', near(shotDmg(10 * TIER, false), ENEMY_TYPES.slinger.shotDmg * 1.6, 0.01));
  check('an elite slinger stacks 1.25x on top', near(shotDmg(10 * TIER, true), ENEMY_TYPES.slinger.shotDmg * 1.6 * 1.25, 0.01));
}

// --- 4. boss damage paths ride the same ramp ---
{
  const g = mkGame();
  const f = g.fighters[0];
  const bossHp = runT => {
    g.runT = runT;
    f.hp = f.maxHp; f.invuln = 0; f.guard = 100; f.state = 'idle';
    const e = mkFoe(g, 'colossus', f.x - 200, f.y);
    g._bossHit(e, ENEMY_TYPES.colossus, f, ENEMY_TYPES.colossus.dmg, 100, -100);
    return f.hp;
  };
  const full = f.maxHp;
  const early = full - bossHp(0);
  const late = full - bossHp(10 * TIER);
  check('boss contact hits scale 1.6x ten tiers in', near(late, early * 1.6, 0.01));
  g.runT = 10 * TIER;
  const e = mkFoe(g, 'warlock', f.x - 400, f.y);
  g._bossShots(e, ENEMY_TYPES.warlock, 3, 0.12, 1.2);
  check('boss volley shots carry variant x ramp', near(g.projectiles.at(-1).dmg, ENEMY_TYPES.warlock.shotDmg * 1.2 * 1.6, 0.01));
}

// --- 5. spawns: tougher hp with a higher ceiling, random elites deep in ---
{
  const g = mkGame();
  const live = [g.fighters[0]];
  const hpAt = level => {
    g.enemies.length = 0;
    g._spawnEnemy(live, level, 1, 0, 1, 'grunt');
    return g.enemies[0].maxHp;
  };
  check('level 0 grunts spawn at base hp', hpAt(0) === ENEMY_TYPES.grunt.hp);
  check('level 10 grunts spawn 1.8x tougher', hpAt(10) === Math.round(ENEMY_TYPES.grunt.hp * 1.8));
  check('hp ramp caps at 3x base', hpAt(999) === Math.round(ENEMY_TYPES.grunt.hp * 3));
  g.enemies.length = 0;
  for (let i = 0; i < 300; i++) g._spawnEnemy(live, 8, 1, 0, 1, 'grunt');
  const elites = g.enemies.filter(e => e.elite).length;
  check(`deep runs sprinkle in random elites (${elites}/300)`, elites > 0 && elites < 60);
  g.enemies.length = 0;
  for (let i = 0; i < 300; i++) g._spawnEnemy(live, 0, 1, 0, 1, 'grunt');
  check('fresh runs never roll random elites', g.enemies.every(e => !e.elite));
}

// --- 6. the difficulty clock survives host handoff ---
{
  const g = mkGame();
  g.runT = 123.4;
  const snap = g.snapshot();
  const g2 = gameFromSnapshot(players, snap, 7);
  check('runT rides the snapshot', near(g2.runT, 123.4, 0.11));
  check('the successor host resumes the same damage ramp', near(g2._enemyDmgMult(), g._enemyDmgMult()));
  const g3 = gameFromSnapshot(players, { ...snap, rt: undefined }, 7);
  check('old snapshots without the clock still restore clean', g3.runT === 0);
}

// --- 7. PvP untouched ---
{
  const g = new Game(players, 7, 'battlefield');
  for (let i = 0; i < 300; i++) g.step();
  check('PvP never accrues difficulty', g.runT === 0 && g._enemyDmgMult() === 1);
  check('PvP spawns no creeps', g.enemies.length === 0);
  check('expanse is still the co-op endless map', MAPS.expanse.coop && MAPS.expanse.infinite);
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
