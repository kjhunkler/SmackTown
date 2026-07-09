// Persisted player settings: audio levels and input bindings.
//
// Sound levels feed the WebAudio gain buses (sfx.js); the key/pad bindings
// feed the input layer (input.js). Everything lives under one localStorage
// key and falls back to the shipped defaults when absent or malformed.
//
// Touch is deliberately NOT rebindable: the mobile controls are continuous
// drags and flicks, not discrete keys, so remapping them would mean redoing
// the gesture engine. The settings UI lists them read-only instead.

const KEY = 'smacktown.settings.v1';

// 0..1 multipliers. Master scales everything; music/sfx scale their bus.
export const AUDIO_DEFAULTS = { master: 1, music: 1, sfx: 1 };

// Logical actions and their default keyboard keys (lowercased `event.key`).
// Movement keys are read as held state; the rest edge-trigger on press.
// A note marks where a rebind reaches past the obvious action.
export const KEY_ACTIONS = [
  { id: 'left',  name: 'Move Left',      keys: ['arrowleft', 'a'] },
  { id: 'right', name: 'Move Right',     keys: ['arrowright', 'd'] },
  { id: 'up',    name: 'Aim Up',        keys: ['arrowup', 'w'] },
  { id: 'down',  name: 'Duck / Fast-fall', keys: ['arrowdown', 's'],
    note: 'also drops through platforms' },
  { id: 'jump',  name: 'Jump',           keys: [' '] },
  { id: 'tap',   name: 'Quick Attack',   keys: ['j', 'z'] },
  { id: 'smash', name: 'Smash (hold to charge)', keys: ['k', 'x'] },
  { id: 'ab0',   name: 'Ability 1',      keys: ['l', 'c'] },
  { id: 'ab1',   name: 'Ability 2',      keys: [';', 'v'] },
];

// Gamepad actions keyed to standard-mapping button indices. Movement stays
// the stick / dpad and is not rebindable. Defaults mirror the classic pad
// layout (A jab, B smash, Y jump, X/bumpers ability 1, triggers ability 2).
export const PAD_ACTIONS = [
  { id: 'jump',  name: 'Jump',         btns: [3] },        // Y
  { id: 'tap',   name: 'Quick Attack', btns: [0] },        // A
  { id: 'swipe', name: 'Smash',        btns: [1] },        // B
  { id: 'ab0',   name: 'Ability 1',    btns: [2, 4, 5] },  // X / LB / RB
  { id: 'ab1',   name: 'Ability 2',    btns: [6, 7] },     // LT / RT
];

// Friendly labels for standard-mapping button indices, for the pad UI.
export const PAD_BTN_LABELS = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
  8: 'Back', 9: 'Start', 10: 'L3', 11: 'R3',
  12: 'D↑', 13: 'D↓', 14: 'D←', 15: 'D→', 16: 'Home',
};
export function padBtnLabel(i) { return PAD_BTN_LABELS[i] || ('B' + i); }

const clamp01 = v => Math.max(0, Math.min(1, v));
const clone = x => JSON.parse(JSON.stringify(x));

function freshDefaults() {
  return {
    audio: { ...AUDIO_DEFAULTS },
    keys: Object.fromEntries(KEY_ACTIONS.map(a => [a.id, [...a.keys]])),
    pad: Object.fromEntries(PAD_ACTIONS.map(a => [a.id, [...a.btns]])),
  };
}

function load() {
  const d = freshDefaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      if (raw.audio) for (const k of Object.keys(d.audio)) {
        if (typeof raw.audio[k] === 'number') d.audio[k] = clamp01(raw.audio[k]);
      }
      if (raw.keys) for (const a of KEY_ACTIONS) {
        if (Array.isArray(raw.keys[a.id])) d.keys[a.id] = raw.keys[a.id].map(String);
      }
      if (raw.pad) for (const a of PAD_ACTIONS) {
        if (Array.isArray(raw.pad[a.id])) {
          d.pad[a.id] = raw.pad[a.id].map(Number).filter(Number.isInteger);
        }
      }
    }
  } catch (_) { /* fall back to defaults */ }
  return d;
}

class Settings {
  constructor() {
    this.state = load();
    this._subs = new Set();
    this._rebuild();
  }

  // Reverse lookups the input layer polls every frame / keypress.
  _rebuild() {
    this._keyMap = {};   // lowercased key -> action id
    for (const a of KEY_ACTIONS) for (const k of this.state.keys[a.id]) this._keyMap[k] = a.id;
    this._padMap = {};   // button index -> action id
    for (const a of PAD_ACTIONS) for (const b of this.state.pad[a.id]) this._padMap[b] = a.id;
  }

  _save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (_) {}
  }

  _changed() { this._rebuild(); this._save(); for (const cb of this._subs) cb(this); }

  onChange(cb) { this._subs.add(cb); return () => this._subs.delete(cb); }

  // ---- audio ----
  getAudio() { return { ...this.state.audio }; }
  setAudio(which, v) {
    if (!(which in this.state.audio)) return;
    this.state.audio[which] = clamp01(v);
    this._changed();
  }

  // ---- keyboard ----
  keysFor(id) { return this.state.keys[id] || []; }
  keyAction(key) { return this._keyMap[key] || null; }
  // Assign a fresh key list to an action, stripping that key off any other
  // action so one physical key never drives two things.
  setKeys(id, keys) {
    if (!this.state.keys[id]) return;
    const set = [...new Set(keys.map(String))];
    for (const a of KEY_ACTIONS) {
      if (a.id === id) continue;
      this.state.keys[a.id] = this.state.keys[a.id].filter(k => !set.includes(k));
    }
    this.state.keys[id] = set;
    this._changed();
  }
  // Bind the captured key to `id`, clearing it from wherever it lived before.
  bindKey(id, key) { this.setKeys(id, [String(key)]); }

  // ---- gamepad ----
  padButtonsFor(id) { return this.state.pad[id] || []; }
  padAction(index) { return this._padMap[index] ?? null; }
  bindPad(id, index) {
    if (!this.state.pad[id]) return;
    for (const a of PAD_ACTIONS) {
      if (a.id === id) continue;
      this.state.pad[a.id] = this.state.pad[a.id].filter(b => b !== index);
    }
    this.state.pad[id] = [index];
    this._changed();
  }

  // ---- reset ----
  reset() { this.state = freshDefaults(); this._changed(); }
  resetKeys() {
    this.state.keys = Object.fromEntries(KEY_ACTIONS.map(a => [a.id, [...a.keys]]));
    this._changed();
  }
  resetPad() {
    this.state.pad = Object.fromEntries(PAD_ACTIONS.map(a => [a.id, [...a.btns]]));
    this._changed();
  }
}

export const settings = new Settings();
