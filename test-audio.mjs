// Exercise the simulation -> cosmetic event -> instrument path without a speaker.
import assert from 'node:assert/strict';
import { Game, ENEMY_TYPES, weaponChargeTime } from './js/game.js';
import { WEAPONS } from './js/profile.js';
import { playEffect } from './js/audio-effects.js';

Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null }, configurable: true });
globalThis.document = { addEventListener() {}, hidden: false };
const { SFX } = await import('./js/sfx.js');
SFX.setMode('fight');
let phrases = [];
SFX.play = (cue, ev) => {
  const notes = [];
  playEffect({
    note: (...args) => notes.push(['note', ...args]),
    air: (...args) => notes.push(['air', ...args]),
  }, cue, ev);
  if (notes.length) phrases.push({ cue, notes });
};
function hear(events) {
  phrases = [];
  for (const ev of events) SFX.event(ev);
  return phrases;
}

const signatures = new Set();
for (const { id } of WEAPONS) {
  const game = new Game([{ id: 'p', build: { weapon: id } }], 3, 'flatlands');
  const fighter = game.fighters[0];
  game._startCharge(fighter, { dx: 1, dy: 0 });
  const charging = game.events.find(e => e.e === 'charge');
  assert.equal(charging.weapon, id);
  assert.equal(charging.span * charging.over, game._chargeCap(fighter));
  game.events.length = 0;
  game._releaseCharge(fighter);
  const release = hear(game.events);
  assert.equal(release.length, 1, id + ' sounds once on release');
  signatures.add(JSON.stringify(release[0].notes));

  if (id === 'boomerang' || id === 'bombs') {
    game.events.length = 0;
    for (let i = 0; i < 180; i++) game._stepProjectiles();
    const heard = hear(game.events).map(p => p.cue);
    assert.deepEqual(heard, id === 'bombs' ? ['fuse', 'bombboom'] : ['rangreturn', 'catch']);
  }
  if (id === 'hammer') {
    fighter.mana = 0;
    game.events.length = 0;
    game._startAttack(fighter, { kind: 'swipe', dx: 1, dy: 0 });
    assert.deepEqual(hear(game.events).map(p => p.cue), ['fizzle']);
  }
}
assert.equal(signatures.size, WEAPONS.length, 'distinct arrangement for every weapon');
const calls = Object.keys(ENEMY_TYPES).map(kind => hear([{ e: 'telegraph', kind }])[0].notes);
assert.equal(new Set(calls.map(call => JSON.stringify(call))).size, calls.length, 'distinct enemy calls');
assert.equal(hear([{ e: 'mend' }, { e: 'ability', ability: 'mend' }]).length, 1);

// A joining client can first see a charge halfway through. A burn tick can
// also land while the fighter keeps charging. Exercise both without sending
// a charge-start event, and verify that dropping the fighter stops each source.
let running = 0;
const param = () => ({ value: 0, setTargetAtTime(value) { this.value = value; } });
const node = () => ({ connect(to) { return to; }, disconnect() {} });
const ac = {
  currentTime: 0,
  createGain: () => ({ ...node(), gain: param() }),
  createStereoPanner: () => ({ ...node(), pan: param() }),
  createOscillator: () => ({ ...node(), frequency: param(), setPeriodicWave() {},
    start() { running++; }, stop() { running--; } }),
};
let chimes = 0;
SFX.synth = { ac, waves: {}, lane: node, voice: () => ({ note() { chimes++; } }) };
for (const { id } of WEAPONS) {
  const span = weaponChargeTime(id);
  const fighter = { id: 'p', x: 0, weapon: id, state: 'charge', stateT: span * .2999 };
  SFX.syncCharges([fighter]);
  assert.equal(running, 0, id + ' stays silent below 30%');
  SFX.syncCharges([{ ...fighter, state: 'attack' }]);
  assert.equal(SFX.charges.size, 0, 'a quick release skips the wind-up sound');
  fighter.stateT = span * .30;
  SFX.syncCharges([fighter]);
  const voice = SFX.charges.get('p');
  assert.ok(running > 0 && voice.body.value > 0, id + ' starts its wind-up sound at 30%');
  SFX.event({ e: 'burn', vic: 'p' });
  SFX.syncCharges([fighter]);
  assert.equal(SFX.charges.get('p'), voice, 'a continuing hold keeps the same voice');
  if (id === 'magic') {
    assert.equal(voice.sub.value, 0);
    fighter.stateT = 1.8;
    SFX.syncCharges([fighter]);
    assert.ok(voice.sub.value > 0 && chimes > 0, 'overcharge adds its low register and chime');
    const once = chimes;
    fighter.stateT += .1;
    SFX.syncCharges([fighter]);
    assert.equal(chimes, once, 'the threshold rings once per hold');
  }
  fighter.stateT = span * .29;
  SFX.syncCharges([fighter]);
  assert.equal(running, 0, 'a correction below the threshold silences the voice');
  fighter.stateT = span * .6;
  SFX.syncCharges([fighter]);
  assert.ok(running > 0, 'a client joining mid-charge hears the current wind-up');
  SFX.syncCharges([]);
  assert.equal(running, 0);
  assert.equal(SFX.charges.size, 0);
}
SFX.setMode('menu');
assert.equal(hear([{ e: 'strike', kind: 'brute' }]).length, 0, 'background combat stays quiet');
console.log('PASS  Held charges, Magic overcharge, weapon releases, projectile cues, enemy voices and paired events');
