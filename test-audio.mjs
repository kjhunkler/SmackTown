// Exercise the simulation -> cosmetic event -> instrument path without a speaker.
import assert from 'node:assert/strict';
import { Game, ENEMY_TYPES } from './js/game.js';
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
SFX.setMode('menu');
assert.equal(hear([{ e: 'strike', kind: 'brute' }]).length, 0, 'background combat stays quiet');
console.log('PASS  Weapon releases, projectile cues, enemy voices and paired events');
