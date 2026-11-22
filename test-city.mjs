// Exercise district changes through the host tick, including handoff mid-rally.
import assert from 'node:assert/strict';
import { Game, ENEMY_TYPES, gameFromSnapshot } from './js/game.js';
import { CITY_ROOMS } from './js/city.js';

const players = ['a', 'b'].map(id => ({ id, name: id, color: '#fff', build: {} }));
let g = new Game(players, 10, 'nightcity');
function tick(n) { while (n-- > 0) g.step(); }
function place(f, x, mx = 0, my = 0) {
  Object.assign(f, { x, y: -32, vx: 0, vy: 0, grounded: true, invuln: 5 });
  g.setInput(f.id, { mx, my });
}
function gather(side) {
  const x = side * CITY_ROOMS[g.cityRun.room].limit;
  for (const f of g.fighters) place(f, x, side);
}
function handoff() {
  const snap = g.snapshot();
  g = gameFromSnapshot(players, snap, 11);
  assert.deepEqual(g.cityRun, snap.city);
}

// The whole party can push the opening boundary without getting a travel
// prompt. Backtracking from the alley does not unlock the shortcut either.
gather(-1); tick(30);
assert.equal(g.cityRun.room, 'market');
assert.equal(g.cityRun.left, 0);
assert.equal(g.cityRun.hold, 0);
gather(1); tick(26);
assert.equal(g.cityRun.room, 'alley');
gather(-1); tick(26);
assert.equal(g.cityRun.room, 'market');
handoff();
gather(-1); tick(30);
assert.equal(g.cityRun.room, 'market');
assert.equal(g.cityRun.reachedTrain, false);

g = new Game(players, 10, 'nightcity');
tick(35);
assert.equal(g.cityRun.wave, 1);
assert.equal(g.enemies.length, 6);
assert.ok(g.enemies.every(e => e.y < -450 && e.hp <= 5));
tick(155);
assert.ok(g.enemies.every(e => e.y > -400), 'ceiling pack descends');
const follower = g.enemies[0];
follower.hp = 1;
place(g.fighters[0], 565, 1);
tick(32);
assert.equal(g.cityRun.room, 'market');
assert.equal(g.cityRun.right, 1);
assert.equal(g.cityRun.required, 2);
place(g.fighters[1], -565, -1); tick(1);
assert.equal(g.cityRun.left, 0);
assert.equal(g.cityRun.right, 1);
place(g.fighters[1], 500);
tick(10);
handoff();
g.setInput('a', { mx: 1, my: 0 });
tick(18);
assert.equal(g.cityRun.room, 'alley');
const carried = g.enemies.find(e => e.eid === follower.eid);
assert.equal(carried.hp, 1);
assert.ok(carried.x < g.fighters[0].x, 'surviving enemy follows through entry edge');

for (const room of ['roofs', 'parking', 'cistern', 'factory', 'lab', 'cars', 'train', 'market']) {
  gather(1); tick(26);
  assert.equal(g.cityRun.room, room);
  if (room === 'train') assert.ok(g.cityRun.reachedTrain);
  if (room === 'cars') {
    assert.equal(g.cityRun.reachedTrain, false);
    const roof = CITY_ROOMS.cars.plats.at(-2);
    const f = g.fighters[0];
    assert.ok(roof.x > 2000);
    place(f, roof.x + 30);
    g.setInput(f.id, { mx: 0, my: 0, jump: true });
    tick(110);
    assert.ok(f.grounded && f.y === roof.y - 32, 'jump lands atop a distant car');
    const late = g.addFighter({ ...players[0], id: 'late' });
    assert.ok(Math.abs(late.x - f.x) < 85);
    g.setParked('late', true);
  }
}

assert.ok(g.cityRun.reachedTrain);
const saved = g.snapshot();
g = gameFromSnapshot([...players, { ...players[0], id: 'late' }], saved, 11);
assert.ok(g.cityRun.reachedTrain, 'market shortcut survives host handoff');
gather(-1); tick(26);
assert.equal(g.cityRun.room, 'train', 'the unlocked market exit leads to Last Train');
const legacy = g.snapshot();
delete legacy.city.reachedTrain;
assert.ok(gameFromSnapshot(players, legacy, 11).cityRun.reachedTrain);
gather(-1); tick(26);
assert.equal(g.cityRun.room, 'cars');
gather(1); tick(26);
assert.equal(g.cityRun.room, 'train');
for (const f of g.fighters) place(f, 0);
tick(90);
assert.equal(g.over, false, 'crossing the boarding area does not end a run');

g.cityRun.wave = 5; g.cityRun.wait = 0;
g.enemies.length = 0;
tick(1);
assert.equal(g.cityRun.wave, 6);
assert.ok(g.cityRun.locked);
gather(1); tick(35);
assert.equal(g.cityRun.room, 'train');
for (const f of g.fighters) place(f, 0, 0, 1);
tick(65);
assert.equal(g.cityRun.boarding, 0);
const boss = g.enemies.find(e => ENEMY_TYPES[e.kind].boss);
g._enemyDied(boss, g.fighters[0]);
place(g.fighters[1], 150);
tick(65);
assert.ok(!g.cityRun.locked && !g.over);
place(g.fighters[1], 0, 0, 1);
tick(65);
assert.equal(g.endReason, 'cleared');

g = new Game(players, 7, 'nightcity');
for (let wave = 1; wave <= 100; wave++) {
  tick(50);
  assert.equal(g.cityRun.wave, wave);
  assert.equal(g.cityRun.room, 'market');
  assert.ok(g.enemies.length <= 17);
  if (wave === 2 || wave === 3) assert.ok(g.enemies.every(e => Math.abs(e.x) > 565));
  for (const e of g.enemies) g._enemyDied(e, null);
}
Object.assign(g.cityRun, { room: 'cistern', pumpTick: 389 });
const [low, high] = g.fighters;
high.x = 240; high.y = -130;
g.step();
assert.ok(low.hp < low.maxHp && low.vy < 0);
assert.equal(high.hp, high.maxHp);
g.setParked(low.id, true); g.setParked(high.id, true);
const paused = { ...g.cityRun };
g.step();
assert.deepEqual(g.cityRun, paused);
console.log('Endless swarms, pursuit, boss lock, party travel, roof traversal, boarding and handoff passed.');

g = new Game([players[0]], 3, 'nightcity');
const striker = g.fighters[0];
place(striker, 0);
striker.facing = 1;
for (let i = 0; i < 3; i++) {
  g._spawnEnemy([striker], 0, 1, i, 3, 'grunt');
  g.enemies.at(-1).x = 32 + i * 24;
}
g.setInput(striker.id, { mx: 0, my: 0, atk: { kind: 'tap', dx: 1, dy: 0 } });
tick(18);
assert.equal(striker.score.ko, 3, 'one jab can clear the front of a packed swarm');
