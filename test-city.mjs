// Drive both routes through the same host ticks, room snapshots and door
// checks used by a live run. Resolve attacks immediately to isolate travel.
import assert from 'node:assert/strict';
import { Game, gameFromSnapshot } from './js/game.js';
import { CITY_ROOMS, cityOpen } from './js/city.js';

const players = ['a', 'b'].map(id => ({ id, name: id, color: '#fff', build: {} }));
for (const route of [['roofs', 'cistern'], ['cistern', 'roofs']]) {
  let g = new Game(players, 10, 'nightcity');
  function tick(n) { while (n-- > 0) g.step(); }
  function gather(x, y = -32) {
    for (const f of g.fighters.filter(f => !f.parked)) {
      f.x = x; f.y = y; f.vx = f.vy = 0; f.grounded = true;
    }
  }
  function fight() {
    const foes = [];
    for (let n = 0; n < 1800 && !cityOpen(g.cityRun) && !g.cityRun.relayReady; n++) {
      g.step();
      for (const e of g.enemies.filter(e => e.hp > 0)) {
        foes.push(e.kind);
        g._enemyDied(e, g.fighters[0]);
      }
    }
    return foes;
  }
  function cross(x, name) {
    gather(x); tick(55);
    assert.equal(g.cityRun.room, name);
  }
  assert.deepEqual(fight(), CITY_ROOMS.market.foes);
  g.fighters[0].x = -480; tick(80);
  assert.equal(g.cityRun.room, 'market', 'split party cannot cross');
  for (const id of route) {
    cross(CITY_ROOMS.market.doors.find(d => d.to === id).x, id);
    assert.deepEqual(fight(), CITY_ROOMS[id].foes);
    assert.ok(g.cityRun.relayReady);
    const relay = CITY_ROOMS[id].relay;
    gather(relay.x, relay.y - 32);
    tick(43);
    assert.ok(cityOpen(g.cityRun));
    const state = g.snapshot();
    g = gameFromSnapshot(players, state, 11);
    assert.deepEqual(g.cityRun, state.city);
    assert.deepEqual(g.platsNow(), CITY_ROOMS[id].plats);
    g.setParked('b', true);
    cross(CITY_ROOMS[id].doors[0].x, 'market');
    assert.ok(Math.abs(g.fighters[0].x - g.fighters[1].x) < 85);
    g.setParked('b', false);
  }
  const boss = fight();
  assert.equal(boss.length, 1);
  assert.ok(g.won);
  const joiner = g.addFighter({ ...players[1], id: 'late' });
  assert.ok(Math.abs(joiner.x - g.fighters[0].x) < 85);
  gather(0); tick(55);
  assert.equal(g.endReason, 'cleared');
}
console.log('Both relay routes, room-local geometry, party gates, parking, handoff, late join and extraction passed.');

const pump = new Game(players, 7, 'nightcity');
Object.assign(pump.cityRun, { room: 'cistern', pumpTick: 389 });
const [low, high] = pump.fighters;
high.x = 240; high.y = -130;
pump.step();
assert.ok(low.hp < low.maxHp && low.vy < 0, 'the pressure surge lifts and damages a fighter on the floor');
assert.equal(high.hp, high.maxHp, 'the pump platform is above the surge');
pump.setParked(low.id, true);
pump.setParked(high.id, true);
const paused = { ...pump.cityRun };
pump.step();
assert.deepEqual(pump.cityRun, paused, 'encounter timers pause with the whole crew away');
