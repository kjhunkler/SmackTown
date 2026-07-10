import { Game, expanseBiomeAt, interpolateEnemyRows, packEnemyDelta, unpackEnemyDelta } from './js/game.js';

const build = {
  stats: { power: 0, speed: 0, defense: 0, agility: 0 },
  weapon: 'unarmed', abilities: [], augments: [],
};
const enemyCount = 48;
const biome = expanseBiomeAt(7, 0);
const blendBiome = expanseBiomeAt(7, 3500);
if (biome.id === biome.next || blendBiome.blend <= 0 || blendBiome.blend >= 1) throw new Error('Expedition biome sequence is not deterministic or blended');
const players = Array.from({ length: 8 }, (_, i) => ({ id: String.fromCharCode(65 + i), name: `Fighter ${i + 1}`, color: '#fff', build }));
const game = new Game(players, 7, 'expanse');
for (let i = 0; i < enemyCount; i++) {
  game.enemies.push({
    eid: i + 1, kind: 'grunt', hw: 22, hh: 26,
    x: i * 20, y: -26, vx: 0, vy: 0, hp: 9, maxHp: 9,
    facing: 1, grounded: true, touchCd: 0, hurt: 0, windup: 0, atkCd: 0, temperament: 'bold', elite: false,
  });
}

const before = game.snapshot();
for (let i = 0; i < 3; i++) game.step();
const after = game.snapshot();
const half = interpolateEnemyRows(before.en, after.en, 0.5);
if (half.length !== after.en.length) throw new Error('Enemy interpolation changed entity count');
for (let i = 0; i < half.length; i++) {
  const lo = Math.min(before.en[i][1], after.en[i][1]);
  const hi = Math.max(before.en[i][1], after.en[i][1]);
  if (half[i].x < lo || half[i].x > hi) throw new Error('Enemy interpolation overshot authority');
}

const samples = [];
for (let run = 0; run < 20; run++) {
  const start = performance.now();
  for (let i = 0; i < 600; i++) game.step();
  samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
const snapshotBytes = new TextEncoder().encode(JSON.stringify(game.snapshot())).byteLength;
const cache = { p: new Map(), en: new Map(), ht: new Map() };
game.snapshotDelta(cache, 0, 1800);
const idleDelta = game.snapshotDelta(cache, 0, 1800);
const idleDeltaBytes = new TextEncoder().encode(JSON.stringify(idleDelta)).byteLength;
if (idleDelta.dp[0].length || idleDelta.den[0].length || idleDelta.dht[0].length) throw new Error('Idle delta retained unchanged entities');
const activeDelta = game.snapshotDelta({ p: new Map(), en: new Map(), ht: new Map() }, null, Infinity);
const enemyBinary = packEnemyDelta(activeDelta.den);
const unpackedEnemyDelta = unpackEnemyDelta(enemyBinary);
if (JSON.stringify(unpackedEnemyDelta) !== JSON.stringify(activeDelta.den)) throw new Error('Binary enemy delta round-trip failed');
for (const f of game.fighters) {
  f.state = 'attack'; f.atk = 'jab'; f.stateT = 0.08;
}
const loadStart = performance.now();
let serializedBytes = 0;
for (let i = 0; i < 120; i++) {
  game.step();
  const snapshot = game.snapshot();
  serializedBytes += new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
  interpolateEnemyRows(before.en, snapshot.en, 0.5);
}
const combatLoadMs = performance.now() - loadStart;
console.log(JSON.stringify({
  enemies: game.enemies.length,
  ticksPerRun: 600,
  medianMs: +samples[10].toFixed(2),
  p95Ms: +samples[18].toFixed(2),
  medianUsPerTick: +(samples[10] * 1000 / 600).toFixed(2),
  fullSnapshotBytes: snapshotBytes,
  idleDeltaBytes,
  enemyDeltaBytes: enemyBinary.byteLength,
  players: players.length,
  combatLoadMs: +combatLoadMs.toFixed(2),
  averageSnapshotBytes: Math.round(serializedBytes / 120),
  interpolation: 'PASS',
}));