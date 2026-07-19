// Headless smoke test: the 5-augment cap and the four new augments —
// Ironclad (damage shave, PvP and creep hits), Regrowth (percent bleed /
// hp knit), Skyborn (higher jumps), Scavenger (bounty + heart bonus).
// Run: node test-augments.mjs
import { Game, ENEMY_TYPES, blankInput } from './js/game.js';
import { AUGMENTS, MAX_AUGMENTS, sanitizeBuild, derivedStats, buildCost, MAX_BUILD_COST } from './js/profile.js';

let n = 0, fails = 0;
function check(name, ok) {
  n++;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}. ${name}`);
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const build = (augments = []) => ({ stats: { power: 0, speed: 0, defense: 0, agility: 0 }, weapon: 'unarmed', abilities: [], augments });
const pair = (augA = [], map = 'battlefield') => new Game([
  { id: 'A', name: 'Alice', color: '#f00', build: build(augA) },
  { id: 'B', name: 'Bob', color: '#0f0', build: build() },
], 5, map);

// --- 1. the cap: five augments, all live ---
{
  check('MAX_AUGMENTS is 5', MAX_AUGMENTS === 5);
  const five = ['ironclad', 'regrowth', 'skyborn', 'scavenger', 'thorns'];
  const b = sanitizeBuild(build([...five, 'vampiric']));
  check('sanitize keeps five augments and strips the sixth', b.augments.length === 5
    && five.every(id => b.augments.includes(id)));
  check('the five-augment build fits the structural ceiling', buildCost(b) <= MAX_BUILD_COST);
  check('derived stats carry all five', derivedStats(b).augments.length === 5);
  check('all four new augments are in the shop', ['ironclad', 'regrowth', 'skyborn', 'scavenger']
    .every(id => AUGMENTS.some(a => a.id === id)));
}

// --- 2. ironclad: 10% off both damage pipelines ---
{
  const hit = augments => {
    const g = pair();
    const [a, b] = g.fighters;
    b.baseBuild = build(augments); b.st = derivedStats(b.baseBuild);
    a.x = 0; b.x = 55; a.facing = 1; a.grounded = true; b.grounded = true;
    a.state = 'attack'; a.atk = 'jab'; a.stateT = 0.1; a.atkDir = { x: 1, y: 0 };
    g._resolveAttacks();
    return b.pct;
  };
  check('a jab lands full damage on a vanilla fighter', near(hit([]), 4));
  check('ironclad shaves the same jab 10%', near(hit(['ironclad']), 3.6));

  const strike = augments => {
    const g = new Game([{ id: 'A', name: 'A', color: '#f00', build: build(augments) },
      { id: 'B', name: 'B', color: '#0f0', build: build() }], 5, 'expanse');
    const f = g.fighters[0];
    f.invuln = 0;
    const t = ENEMY_TYPES.grunt;
    const e = { eid: 9, kind: 'grunt', x: f.x - 60, y: f.y, hw: t.w / 2, hh: t.h / 2, facing: 1, elite: false };
    g._enemyStrike(e, t, [f]);
    return f.maxHp - f.hp;
  };
  check('a grunt strike chips full hp normally', near(strike([]), 3, 0.01));
  check('ironclad shaves creep hits 10% too', near(strike(['ironclad']), 2.7, 0.01));
}

// --- 3. regrowth: percent bleeds off in PvP, hp knits in co-op ---
{
  const g = pair(['regrowth']);
  const [a, b] = g.fighters;
  a.pct = 50; b.pct = 50;
  for (let i = 0; i < 120; i++) g.step();
  check('regrowth bleeds ~2% off over two seconds', a.pct < 48.5 && a.pct > 47);
  check('a vanilla fighter stays hurt', b.pct === 50);

  const g2 = new Game([{ id: 'A', name: 'A', color: '#f00', build: build(['regrowth']) }], 5, 'expanse');
  const f = g2.fighters[0];
  for (let i = 0; i < 30; i++) g2.step();     // settle in
  f.hp = 50;
  const from = f.hp;
  for (let i = 0; i < 120; i++) g2.step();
  check('regrowth knits ~1 hp over two seconds on the road', f.hp > from + 0.8 && f.hp < from + 1.6);
}

// --- 4. skyborn: measurably higher jumps ---
{
  check('skyborn raises the jump multiplier 15%', near(derivedStats(build(['skyborn'])).jumpMult, 1.15));
  const apex = augments => {
    const g = pair(augments);
    const f = g.fighters[0];
    for (let i = 0; i < 30; i++) g.step();    // land the spawn-in
    const inp = blankInput(); inp.jump = true;
    g.setInput('A', inp);
    let top = 0;
    for (let i = 0; i < 80; i++) { g.step(); top = Math.min(top, f.y); }
    return top;
  };
  check('a skyborn fighter out-jumps a vanilla one by a clear margin', apex(['skyborn']) < apex([]) - 25);
}

// --- 5. scavenger: fatter bounties, heartier hearts ---
{
  const bounty = augments => {
    const g = new Game([{ id: 'A', name: 'A', color: '#f00', build: build(augments) }], 5, 'expanse');
    const f = g.fighters[0];
    const before = f.score.cr;
    g._enemyDied({ eid: 7, kind: 'grunt', hp: 0, cr: 10, elite: false, x: 0, y: 0 }, f);
    return f.score.cr - before;
  };
  check('a defeat pays its listed bounty', bounty([]) === 10);
  check('scavenger collects 30% extra', bounty(['scavenger']) === 13);

  const heal = augments => {
    const g = new Game([{ id: 'A', name: 'A', color: '#f00', build: build(augments) }], 5, 'expanse');
    const f = g.fighters[0];
    for (let i = 0; i < 30; i++) g.step();
    f.hp = 40;
    g._spawnHeart(f.x, f.y - 10, 0, 0);
    g.hearts[0].vy = 0; g.hearts[0].grounded = true;
    for (let i = 0; i < 30 && g.hearts.length; i++) g.step();
    return f.hp - 40;
  };
  const plain = heal([]);
  const scav = heal(['scavenger']);
  check(`hearts heal the base amount (${plain.toFixed(1)})`, plain >= 10 && plain < 11);
  check(`scavenger hearts heal half again more (${scav.toFixed(1)})`, scav >= 15 && scav < 16);
}

// --- 6. a five-augment build actually stacks in one fight ---
{
  const g = pair(['ironclad', 'regrowth', 'skyborn', 'thorns', 'heavy']);
  const f = g.fighters[0];
  check('all five augments ride the fighter', f.st.augments.length === 5);
  check('their stat effects compose', near(f.st.dmgTaken, 0.9) && near(f.st.jumpMult, 1.15)
    && near(f.st.kbTaken, 0.85));
  for (let i = 0; i < 300; i++) g.step();
  check('a five-augment fight sims clean', !g.over && g.fighters.every(x => Number.isFinite(x.x)));
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
