import { Synth } from './audio-synth.js';
import { scoreStep, STEP } from './audio-score.js';
import { ChargeVoice, playEffect } from './audio-effects.js';
import { weaponChargeTime } from './game.js';
import { landscape, Scenery } from './audio-scenery.js';

const MUTE_KEY = 'smacktown.muted';
const MUSIC = .57, FX = .87;
const OUTPUT = .82; // transient headroom after compression for simultaneous impacts
const BIG = new Set(['ko', 'boss', 'bosssig', 'bossdown', 'gameover', 'runend', 'bombboom']);
const CROWD = { telegraph: .19, strike: .095, foefire: .13, enemyko: .11, burn: .12, heart: .13, augment: .18 };
// The dedicated simulation event supplies the actual sound in each case.
const CAST_EVENTS = new Set(['shockwave', 'gale', 'mend', 'bird', 'troop']);
const CHARGE_SOUND_START = .30; // fraction of a normal charge, before overcharge

function chargeProgress(fighter) {
  if (fighter.state !== 'charge' || fighter.dead || fighter.parked) return 0;
  return (fighter.stateT || 0) / weaponChargeTime(fighter.weapon);
}

class Sfx {
  constructor() {
    this.ac = null;
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
    this.vol = { master: 1, music: 1, sfx: 1, ambience: 1 };
    this.mode = 'menu';
    this.charges = new Map();
    this.lastPlay = new Map();
    this.center = 0;
    this.halfWidth = 650;
    this.setting = null;
    this.scenery = null;
    document.addEventListener('visibilitychange', () => {
      if (!this.ac) return;
      if (document.hidden) {
        this._clearCharges();
        this.ac.suspend().catch(() => {});
      } else this.ac.resume().catch(() => {});
    });
  }

  unlock() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = this.ac = new AC();
      const glue = ac.createDynamicsCompressor();
      glue.threshold.value = -12; glue.knee.value = 10; glue.ratio.value = 5;
      glue.attack.value = .004; glue.release.value = .16;
      this.master = ac.createGain();
      glue.connect(this.master).connect(ac.destination);
      this.musicBus = ac.createGain();
      this.musicDuck = ac.createGain();
      this.musicDuck.connect(this.musicBus).connect(glue);
      this.fxBus = ac.createGain(); this.fxBus.connect(glue);
      this.ambientBus = ac.createGain(); this.ambientBus.connect(this.fxBus);
      this.synth = new Synth(ac, this.musicDuck, this.fxBus);
      this.master.gain.value = this.vol.master * OUTPUT;
      this.fxBus.gain.value = this.vol.sfx * FX;
      this.ambientBus.gain.value = this.vol.ambience;
      this.musicBus.gain.value = this.muted ? 0 : this.vol.music * MUSIC;
      this.step = 0;
      this.next = ac.currentTime + .065;
      this.timer = setInterval(() => this._schedule(), 55);
      this._syncScenery();
    }
    if (this.ac.state === 'suspended' || this.ac.state === 'interrupted') this.ac.resume().catch(() => {});
  }

  setLevels(levels = {}) {
    for (const key of Object.keys(this.vol)) {
      if (Number.isFinite(levels[key])) this.vol[key] = Math.max(0, Math.min(1, levels[key]));
    }
    if (!this.ac) return;
    const t = this.ac.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master * OUTPUT, t, .018);
    this.musicBus.gain.setTargetAtTime(this.muted ? 0 : this.vol.music * MUSIC, t, .025);
    this.fxBus.gain.setTargetAtTime(this.vol.sfx * FX, t, .018);
    this.ambientBus.gain.setTargetAtTime(this.vol.ambience, t, .06);
    if (!this.vol.master || !this.vol.sfx) this._clearCharges();
    this._syncScenery();
  }

  setMuted(value) {
    this.muted = value;
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
    this.setLevels();
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode !== 'fight') {
      this._clearCharges();
      this.setting = null;
      this.lastPlay.clear();
    }
    this._syncScenery();
  }

  setStage(id, center, halfWidth) {
    this.center = center;
    this.halfWidth = Math.max(240, halfWidth);
    const kind = landscape(id);
    if (this.setting === kind) return;
    this.setting = kind;
    this._syncScenery();
  }

  _syncScenery() {
    if (!this.synth) return;
    const wanted = this.mode === 'fight' && this.vol.master && this.vol.sfx && this.vol.ambience ? this.setting : null;
    if ((this.scenery?.kind ?? null) === wanted) return;
    const t = this.ac.currentTime;
    this.scenery?.stop(t);
    this.scenery = wanted ? new Scenery(this.synth, this.ambientBus, wanted, t) : null;
  }

  _schedule() {
    if (this.ac.state !== 'running' || document.hidden) return;
    const now = this.ac.currentTime;
    // After a long frame, skip missed notes instead of playing a burst.
    if (this.next < now) {
      const missed = Math.ceil((now - this.next) / STEP);
      this.step += missed; this.next += missed * STEP;
    }
    while (this.next < now + .19) {
      if (!this.muted && this.vol.master && this.vol.music) scoreStep(this.synth, this.step, this.next, this.mode === 'fight');
      this.next += STEP; this.step++;
    }
    this.scenery?.tick(now);
  }

  play(cue, ev = {}) {
    if (!this.ac || document.hidden || !this.vol.master || !this.vol.sfx) return;
    const t = this.ac.currentTime;
    const x = ev.x ?? (ev.x0 != null ? (ev.x0 + ev.x1) / 2 : this.center);
    const offset = (x - this.center) / this.halfWidth;
    const pan = Math.max(-.86, Math.min(.86, offset * .76));
    const level = 1 / (1 + Math.max(0, Math.abs(offset) - .5) * .85);
    // Offscreen swarms shouldn't reserve every slot for footsteps and calls.
    if (level < .32 && !BIG.has(cue)) return;
    const crowd = CROWD[cue];
    const key = cue + (crowd && Math.abs(offset) > 1 ? ':far' : '');
    if (t - (this.lastPlay.get(key) ?? -Infinity) < (crowd || .036)) return;
    this.lastPlay.set(key, t);
    if (BIG.has(cue)) {
      const gain = this.musicDuck.gain;
      gain.cancelScheduledValues(t);
      gain.setTargetAtTime(.71, t, .013);
      gain.setTargetAtTime(1, t + .17, .17);
    }
    playEffect(this.synth.voice('fx', t, pan, BIG.has(cue) ? Math.max(.65, level) : level), cue, ev);
  }

  syncCharges(fighters) {
    if (!this.synth || this.mode !== 'fight' || document.hidden || !this.vol.master || !this.vol.sfx) return;
    // A charge is a held state. Local prediction, late joins and interrupted
    // holds all use the same fighter view that drives the on-screen wind-up.
    for (const [id, voice] of this.charges) {
      const f = fighters.find(f => f.id === id);
      if (!f || f.weapon !== voice.weapon || chargeProgress(f) < CHARGE_SOUND_START) {
        voice.stop();
        this.charges.delete(id);
      }
    }
    for (const f of fighters) {
      const progress = chargeProgress(f);
      if (progress < CHARGE_SOUND_START) continue;
      let voice = this.charges.get(f.id);
      if (!voice) {
        voice = new ChargeVoice(this.synth, f.weapon);
        this.charges.set(f.id, voice);
      }
      voice.update(progress, (f.x - this.center) / this.halfWidth);
    }
  }

  _clearCharges() {
    for (const voice of this.charges.values()) voice.stop();
    this.charges.clear();
  }

  event(ev) {
    if (this.mode !== 'fight' || document.hidden) return;
    let cue = ev.e;
    switch (ev.e) {
      case 'charge': return; // syncCharges follows the held state
      case 'swing':
        // A successful hammer cast emits hammerslam; an empty one fizzles.
        if (ev.atk === 'hthrust') return;
        cue = ev.atk || 'jab'; break;
      case 'hit':
        cue = ev.spike ? 'spike' : ev.heavy ? 'hitheavy' : 'hit'; break;
      case 'ability':
        if (CAST_EVENTS.has(ev.ability)) return;
        cue = ev.ability; break;
      case 'counter': cue = 'parry'; break;
      case 'snag': if (ev.kind === 'spring') cue = 'spring'; break;
      case 'sweep': case 'roadclear': return; // paired swing or bossdown
    }
    this.play(cue, ev);
  }
}

export const SFX = new Sfx();
