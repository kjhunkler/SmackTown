import { Game, interpolateEnemyRows } from './js/game.js';

const build = {
  stats: { power: 0, speed: 0, defense: 0, agility: 0 },
  weapon: 'unarmed', abilities: [], augments: [],
};
const game = new Game([{ id: 'A', name: 'Alice', color: '#fff', build }], 7, 'expanse');
for (let i = 0; i < 100; i++) {
  game.enemies.push({
    eid: i + 1, x: i * 20, y: 0, vx: 0, vy: 0, hp: 30, maxHp: 30,
    facing: 1, grounded: true, touchCd: 0, hurt: 0,
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
console.log(JSON.stringify({
  enemies: game.enemies.length,
  ticksPerRun: 600,
  medianMs: +samples[10].toFixed(2),
  p95Ms: +samples[18].toFixed(2),
  medianUsPerTick: +(samples[10] * 1000 / 600).toFixed(2),
  interpolation: 'PASS',
}));