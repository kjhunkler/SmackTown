// Headless smoke test: the expedition campaign. Acts advance per felled
// boss (variants follow the act), the third boss wins the run, extraction
// beacons bank it, a full party wipe ends it, and every bit of campaign
// state survives snapshots for host handoff. PvP stays untouched.
// Run: node test-expedition-campaign.mjs
import { Game, gameFromSnapshot, ENEMY_TYPES, EXPEDITION_ACTS, blankInput } from './js/game.js';

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
];
const mkGame = () => new Game(players, 11, 'expanse');
const settle = g => { for (let i = 0; i < 5; i++) g.step(); };   // land the spawn-in

// Fell a live boss the honest way: spawn it, zero its hp via the death path.
const fellBoss = (g, att = null) => {
  g._spawnBoss(g.fighters.filter(f => !f.dead && !f.parked), 0);
  const boss = g.enemies.findLast(e => (ENEMY_TYPES[e.kind] || {}).boss);
  boss.hp = 0;
  g._enemyDied(boss, att);
  return boss;
};

// --- 1. acts: bosses felled advance the campaign, variants follow the act ---
{
  const g = mkGame();
  settle(g);
  check('a run starts at act 1, unwon', g.bossesDown === 0 && !g.won && !g.beacon);
  const b1 = fellBoss(g, g.fighters[0]);
  check('act 1 boss is always the base variant', b1.variant === 0);
  check('felling it clears the act and lights a beacon', g.bossesDown === 1 && !!g.beacon && !g.won);
  check('the beacon burns where the boss fell', g.beacon.x === b1.x && g.beacon.charge === 0);
  g.beacon = null;
  const b2 = fellBoss(g);
  check('act 2 boss is the mid variant', b2.variant === 1);
  g.beacon = null;
  const b3 = fellBoss(g);
  check('the act-3 capstone is the nastiest variant', b3.variant === 2);
  check('felling it wins the run: Road Cleared', g.won && g.bossesDown === EXPEDITION_ACTS);
  check('victory does not end the sim by itself', !g.over);
  const b4 = fellBoss(g);
  check('victory-lap bosses stay at the top variant', b4.variant === 2);
  check('the run reports its acts honestly', g.bossesDown === 4);
}

// --- 2. extraction: hold the light together to bank the run ---
{
  const g = mkGame();
  settle(g);
  fellBoss(g);
  const b = g.beacon;
  for (const f of g.fighters) { f.x = b.x; f.y = b.y - 30; }
  let steps = 0;
  while (!g.over && steps++ < 60 * 6) {
    for (const f of g.fighters) { f.x = b.x; f.y = b.y - 30; }   // hold the light
    g.step();
  }
  check('everyone holding the beacon banks the run in a few seconds', g.over && steps < 60 * 5);
  check('an unwon run extracts', g.endReason === 'extracted');
  check('the podium event fired', !!g.endReason);
}

// --- 3. extraction needs the whole standing party ---
{
  const g = mkGame();
  settle(g);
  fellBoss(g);
  const b = g.beacon;
  g.fighters[0].x = b.x; g.fighters[0].y = b.y - 30;
  g.fighters[1].x = b.x + 2000;                     // one straggler far away
  for (let i = 0; i < 60 * 22 && !g.over; i++) {   // outlive the 20s burn
    g.fighters[0].x = b.x; g.fighters[1].x = b.x + 2000;
    g.step();
    if (!g.beacon) break;
  }
  check('a split party never charges the beacon', !g.over);
  check('the beacon gutters out after its burn time', !g.beacon);
  check('the run rolls on after a missed beacon', !g.over && !g.endReason);
}

// --- 4. a parked straggler does not block extraction ---
{
  const g = mkGame();
  settle(g);
  fellBoss(g);
  const b = g.beacon;
  g.fighters[1].parked = true;
  for (let i = 0; i < 60 * 4 && !g.over; i++) {
    g.fighters[0].x = b.x; g.fighters[0].y = b.y - 30;
    g.step();
  }
  check('the standing party can extract while a friend shops', g.over && g.endReason === 'extracted');
}

// --- 5. winning then extracting is a clear ---
{
  const g = mkGame();
  settle(g);
  g.bossesDown = EXPEDITION_ACTS - 1;
  fellBoss(g);
  check('the staged capstone won the run', g.won);
  const b = g.beacon;
  for (let i = 0; i < 60 * 4 && !g.over; i++) {
    for (const f of g.fighters) { f.x = b.x; f.y = b.y - 30; }
    g.step();
  }
  check('extracting a won run ends it as cleared', g.over && g.endReason === 'cleared');
}

// --- 6. wipe: everyone down at once ends the run ---
{
  const g = mkGame();
  settle(g);
  for (const f of g.fighters) g._downFighter(f);
  g.step();
  check('a full party wipe ends the run', g.over && g.endReason === 'wiped');
  const hp = g.fighters.map(f => f.dead);
  for (let i = 0; i < 60 * 9; i++) g.step();
  check('nobody quietly respawns after the wipe', g.fighters.every((f, i) => f.dead === hp[i]));
}
{
  const g = mkGame();
  settle(g);
  g._downFighter(g.fighters[0]);
  g.step();
  check('one fighter down is not a wipe', !g.over);
  for (let i = 0; i < 60 * 9 && g.fighters[0].dead; i++) g.step();
  check('the downed fighter still revives while a friend stands', !g.fighters[0].dead);
}
{
  const g = mkGame();
  settle(g);
  g.fighters[1].parked = true;
  g._downFighter(g.fighters[0]);
  g.step();
  check('the last fighter on the road falling is a wipe (parked friends are absent)', g.over && g.endReason === 'wiped');
}

// --- 7. campaign state survives host handoff ---
{
  const g = mkGame();
  settle(g);
  fellBoss(g);
  fellBoss(g);
  g.beacon.t = 12.5; g.beacon.charge = 0.4;
  const g2 = gameFromSnapshot(players, g.snapshot(), 11);
  check('acts survive the snapshot', g2.bossesDown === 2);
  check('the beacon survives, mid-burn and mid-charge', !!g2.beacon
    && Math.abs(g2.beacon.t - 12.5) < 0.02 && Math.abs(g2.beacon.charge - 0.4) < 0.02
    && g2.beacon.x === g.beacon.x);
  g.bossesDown = EXPEDITION_ACTS;
  g.won = true;
  g.endReason = 'cleared';
  g.over = true;
  const g3 = gameFromSnapshot(players, g.snapshot(), 11);
  check('the win, the ending, and the freeze all survive', g3.won && g3.endReason === 'cleared' && g3.over);
  const g4 = gameFromSnapshot(players, { ...g.snapshot(), bd: undefined, wn: undefined, end: undefined, bc: undefined, over: false }, 11);
  check('old snapshots without campaign fields restore clean', g4.bossesDown === 0 && !g4.won && !g4.beacon && !g4.endReason);
}

// --- 8. victory lap floods elites ---
{
  const g = mkGame();
  settle(g);
  const live = [g.fighters[0]];
  g.enemies.length = 0;
  for (let i = 0; i < 300; i++) g._spawnEnemy(live, 0, 1, 0, 1, 'grunt');
  check('an unwon low-tier run rolls no random elites', g.enemies.every(e => !e.elite));
  g.won = true;
  g.enemies.length = 0;
  for (let i = 0; i < 300; i++) g._spawnEnemy(live, 0, 1, 0, 1, 'grunt');
  const elites = g.enemies.filter(e => e.elite).length;
  check(`the victory lap floods elites in (${elites}/300)`, elites > 15);
}

// --- 9. PvP untouched ---
{
  const g = new Game(players, 11, 'battlefield');
  for (let i = 0; i < 300; i++) g.step();
  check('PvP has no campaign, beacon, or run ending', g.bossesDown === 0 && !g.beacon && !g.endReason);
  const inp = blankInput();
  g.setInput('A', inp);
  check('PvP sims still run clean', !g.over);
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nAll ${n} checks passed.`);
process.exit(fails ? 1 : 0);
