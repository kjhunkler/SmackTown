// Exercise every illustrated stage through voting, simulation and host handoff.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Game, MAPS, MAP_IDS, MAP_SIZES, LEGACY_MAP_IDS, mapsOfSize, tallyMapVotes,
  gameFromSnapshot, platsAt, hazardsAt, blankInput } from './js/game.js';
import { ARENA_ART, arenaImage } from './js/arena-art.js';

const originals = 'battlefield skyline foundry shrine galleon observatory flatlands ruins garden docks canyon market temple frostspire coliseum citadel reactor roots'.split(' ');
assert.deepEqual([...LEGACY_MAP_IDS].sort(), originals.sort());
const additions = MAP_IDS.filter(id => !LEGACY_MAP_IDS.includes(id));
assert.equal(additions.length, 18);
assert.deepEqual(Object.keys(ARENA_ART).sort(), [...additions].sort());
const serviceWorker = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
const players = ['A', 'B', 'C', 'D'].map(id => ({ id, name: id, build: {}, color: '#bb4400' }));
for (const size of MAP_SIZES) {
  assert.equal(mapsOfSize(size).filter(id => additions.includes(id)).length, 6);
}
for (const id of additions) {
  const m = MAPS[id];
  assert.equal(tallyMapVotes([id]), id);
  assert.ok(existsSync(new URL(arenaImage(id), import.meta.url)));
  assert.ok(serviceWorker.includes("'" + arenaImage(id) + "'"));
  for (const p of m.plats) {
    const dx = Math.abs(p.move?.dx || 0), dy = Math.abs(p.move?.dy || 0);
    assert.ok(p.x - dx > m.blast.l && p.x + p.w + dx < m.blast.r);
    assert.ok(p.y - dy > m.blast.t && p.y + dy < m.main.y);
  }
  const g = new Game(players, 31, id);
  for (const f of g.fighters) {
    assert.ok(f.x > m.main.x && f.x < m.main.x + m.main.w);
    g.setInput(f.id, blankInput());
  }
  for (let tick = 0; tick < 210; tick++) g.step();
  assert.ok(g.fighters.every(f => !f.dead && Number.isFinite(f.x) && Number.isFinite(f.y)));
  const recovered = gameFromSnapshot(players, g.snapshot());
  assert.equal(recovered.map, id);
  assert.deepEqual(platsAt(recovered.map, recovered.tick), platsAt(id, g.tick));
  console.log('PASS', m.name);
}
assert.equal(hazardsAt('caldera', 0).filter(h => h.state === 'warn').length, 1);
assert.equal(hazardsAt('caldera', 120).filter(h => h.state === 'erupt').length, 1);
