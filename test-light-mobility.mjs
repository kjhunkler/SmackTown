import assert from 'node:assert/strict';
import { Game, blankInput, gameFromSnapshot } from './js/game.js';
import { emptyBuild } from './js/profile.js';
const players = ['A', 'B'].map(id => ({ id, name: id, color: '#38b6ff', build: emptyBuild() }));
function setup(speed = 380) {
  const g = new Game(players, 3, 'flatlands');
  const f = g.fighters[0];
  f.x = 0; f.vx = speed; f.invuln = 0;
  g.fighters[1].x = 800;
  return { g, f };
}
function step(g, mx, ticks = 1) {
  for (let i = 0; i < ticks; i++) { const inp = blankInput(); inp.mx = mx; g.setInput('A', inp); g.step(); }
}
for (const stage of [0, 1, 2, 3]) {
  const {g, f} = setup(250);
  f.comboN = stage; f.comboT = stage ? 0.6 : 0;
  g._startAttack(f, {kind:'tap',dx:0,dy:0});
  assert.ok(f.vx >= 250, `stage ${stage} preserves entry momentum`);
  const before = f.vx;
  f.dashT = 0; // compare steering after any initial combo lunge
  step(g, 1);
  assert.ok(f.vx >= before || f.vx >= 380, `stage ${stage} keeps moving forward`);
  assert.equal(f.state, 'attack');
}
{
  const {g, f} = setup();
  g._startAttack(f, {kind:'tap',dx:1,dy:0});
  assert.equal(f.atk,'dash');
  step(g, 1, 12);
  assert.equal(f.vx,380);
  assert.equal(f.state,'attack');
  step(g, 0, 7);
  assert.equal(f.vx,0, 'release uses normal braking');
}
{
  const {g, f} = setup(200);
  g._startAttack(f, {kind:'tap',dx:0,dy:0});
  step(g, 1);
  assert.ok(f.vx > 200 && f.vx < 200+3400/60, 'steering is weaker than normal running');
  const before=f.vx;
  step(g,-1);
  assert.ok(f.vx < before && f.vx > 0, 'reversal is gradual');
  assert.equal(f.facing,1, 'steering does not rotate the active swing');
}
{
  const {g, f} = setup(250);
  g._startAttack(f, {kind:'swipe',dx:0,dy:1});
  const before=f.vx;
  step(g,1);
  assert.ok(f.vx < before, 'heavy attacks still brake despite held direction');
}
{
  const {g, f} = setup();
  g._startAttack(f, {kind:'tap',dx:1,dy:0});
  step(g,1,4);
  const restored=gameFromSnapshot(players,g.snapshot(),3);
  step(g,-1,8); step(restored,-1,8);
  assert.deepEqual(restored.snapshot().f,g.snapshot().f, 'handoff retains light attack movement');
}
console.log('PASS light mobility: combo momentum, sustained dash, release braking, reduced steering, committed aim, heavy attacks, host handoff');
