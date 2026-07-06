// SmackTown audio: every sound — UI blips, fight SFX, and the looping theme
// song — is synthesized with WebAudio at runtime. No audio files means
// nothing extra to download or precache, and one master gain mutes it all.
//
// Browsers refuse to start audio before a user gesture, so unlock() is
// called from the first pointerdown/keydown (main.js); it is idempotent.
// Game sounds ride the same event stream the renderer draws from
// (render.js calls SFX.event for every cosmetic event), so anything the
// players can see also makes noise, exactly once per client.

const MUTE_KEY = 'smacktown.muted';

// ---------- theme song ----------
// An upbeat 8-bar chiptune loop in A minor (Am F C G), ~130 BPM on an
// eighth-note grid: square lead, triangle bass, and a kick/snare/hat kit
// that only plays during fights ('fight' mode) so menus stay mellower.
const BPM = 130;
const STEP = 60 / BPM / 2;           // eighth note, seconds
const MEL = [ // midi note per step, 0 = rest
  76, 0, 76, 74, 72, 0, 69, 72,   77, 0, 77, 76, 72, 0, 69, 0,
  76, 0, 72, 76, 79, 0, 76, 72,   74, 76, 74, 71, 67, 0, 71, 74,
  76, 0, 76, 74, 72, 0, 74, 76,   81, 0, 79, 77, 76, 0, 72, 69,
  79, 76, 72, 76, 74, 71, 67, 71, 69, 0, 0, 67, 69, 0, 0, 0,
];
const BASS_ROOTS = [45, 41, 48, 43]; // A2 F2 C3 G2, one per bar, repeated
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

class Sfx {
  constructor() {
    this.ac = null;
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
    this.mode = 'menu';           // 'menu' | 'fight' — picks the drum layer
    this.lastPlay = new Map();    // throttle: sound name -> last play (ms)
    this.charges = new Map();     // fighter id -> live charge-whine nodes
    document.addEventListener('visibilitychange', () => {
      if (!this.ac) return;
      if (document.hidden) this.ac.suspend();
      else if (!this.muted) this.ac.resume();
    });
  }

  unlock() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ac.destination);
      this.sfxBus = this.ac.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ac.createGain();
      this.musicBus.gain.value = 0.30;
      this.musicBus.connect(this.master);
      // shared 1s white-noise buffer for every percussive/whoosh sound
      const len = this.ac.sampleRate;
      this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ac.state === 'suspended') this.ac.resume();
    this._startMusic();
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    if (this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ac.currentTime, 0.02);
    }
  }

  setMode(mode) { this.mode = mode; }

  // ---------- low-level voices ----------

  _tone({ type = 'square', f0 = 440, f1 = 0, t0 = 0, dur = 0.1, vol = 0.2, bus = null }) {
    const ac = this.ac; if (!ac) return null;
    const t = ac.currentTime + t0;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(bus || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.03);
    return { o, g };
  }

  _noise({ t0 = 0, dur = 0.15, vol = 0.25, type = 'lowpass', f0 = 1200, f1 = 0, q = 0.8, bus = null }) {
    const ac = this.ac; if (!ac) return;
    const t = ac.currentTime + t0;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const fl = ac.createBiquadFilter();
    fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(fl).connect(g).connect(bus || this.sfxBus);
    src.start(t); src.stop(t + dur + 0.03);
  }

  // ---------- one-shot sound bank ----------

  play(name) {
    if (!this.ac || this.muted) return;
    const now = performance.now();
    if (now - (this.lastPlay.get(name) || 0) < 35) return;   // anti-machinegun
    this.lastPlay.set(name, now);

    switch (name) {
      // --- UI ---
      case 'click':   this._tone({ f0: 880, f1: 660, dur: 0.05, vol: 0.10 }); break;
      case 'save':
        this._tone({ type: 'sine', f0: 660, dur: 0.09, vol: 0.16 });
        this._tone({ type: 'sine', f0: 990, t0: 0.08, dur: 0.14, vol: 0.16 });
        break;
      case 'ready':
        for (const [i, f] of [523, 659, 784].entries())
          this._tone({ type: 'triangle', f0: f, t0: i * 0.07, dur: 0.1, vol: 0.16 });
        break;
      case 'unready':
        for (const [i, f] of [784, 523].entries())
          this._tone({ type: 'triangle', f0: f, t0: i * 0.07, dur: 0.1, vol: 0.13 });
        break;
      case 'tick':    this._tone({ f0: 990, dur: 0.06, vol: 0.15 }); break;
      case 'go':
        for (const f of [523, 659, 784, 1047])
          this._tone({ type: 'square', f0: f, dur: 0.3, vol: 0.07 });
        this._noise({ type: 'highpass', f0: 2500, dur: 0.2, vol: 0.12 });
        break;

      // --- movement ---
      case 'jump':    this._tone({ type: 'triangle', f0: 260, f1: 540, dur: 0.13, vol: 0.16 }); break;
      case 'land':
        this._noise({ f0: 420, dur: 0.07, vol: 0.10 });
        this._tone({ type: 'sine', f0: 140, f1: 60, dur: 0.08, vol: 0.14 });
        break;
      case 'ledge':
        this._noise({ f0: 900, f1: 300, dur: 0.07, vol: 0.10 });
        this._tone({ type: 'triangle', f0: 330, f1: 430, dur: 0.07, vol: 0.12 });
        break;
      case 'roll':    this._noise({ f0: 700, f1: 250, dur: 0.20, vol: 0.14 }); break;
      case 'duck':    this._noise({ f0: 500, f1: 200, dur: 0.09, vol: 0.09 }); break;

      // --- combat ---
      case 'swing':   this._noise({ type: 'bandpass', f0: 700, f1: 2100, q: 1.6, dur: 0.11, vol: 0.16 }); break;
      case 'spin':
        for (const t0 of [0, 0.11, 0.22])
          this._noise({ type: 'bandpass', f0: 900, f1: 2400, q: 1.6, t0, dur: 0.10, vol: 0.13 });
        break;
      case 'hit':
        this._tone({ f0: 220, f1: 150, dur: 0.07, vol: 0.20 });
        this._noise({ f0: 1600, f1: 500, dur: 0.06, vol: 0.16 });
        break;
      case 'hitheavy':
        this._tone({ f0: 170, f1: 55, dur: 0.18, vol: 0.30 });
        this._noise({ f0: 2200, f1: 300, dur: 0.16, vol: 0.26 });
        break;
      case 'spike':
        this._tone({ type: 'sawtooth', f0: 1300, f1: 200, dur: 0.22, vol: 0.16 });
        this._tone({ f0: 150, f1: 50, t0: 0.05, dur: 0.16, vol: 0.26 });
        this._noise({ f0: 2000, f1: 250, t0: 0.05, dur: 0.14, vol: 0.2 });
        break;
      case 'block':
        this._tone({ f0: 1320, dur: 0.05, vol: 0.14 });
        this._noise({ type: 'highpass', f0: 3200, dur: 0.05, vol: 0.12 });
        break;
      case 'crush':
        this._tone({ type: 'sawtooth', f0: 420, f1: 70, dur: 0.32, vol: 0.2 });
        this._noise({ f0: 1800, f1: 200, dur: 0.3, vol: 0.18 });
        break;
      case 'counter':
        this._tone({ type: 'sine', f0: 1760, dur: 0.1, vol: 0.16 });
        this._tone({ type: 'sine', f0: 2350, t0: 0.06, dur: 0.14, vol: 0.13 });
        break;
      case 'ko':
        this._noise({ f0: 2400, f1: 90, dur: 0.55, vol: 0.4 });
        this._tone({ type: 'sine', f0: 300, f1: 38, dur: 0.5, vol: 0.3 });
        this._tone({ type: 'square', f0: 880, f1: 110, dur: 0.4, vol: 0.10 });
        break;
      case 'secondwind':
        this._tone({ type: 'sine', f0: 660, f1: 1320, dur: 0.25, vol: 0.15 });
        break;

      // --- abilities ---
      case 'ab:fireball': this._noise({ type: 'bandpass', f0: 400, f1: 1600, q: 1.2, dur: 0.22, vol: 0.2 }); break;
      case 'ab:blink':    this._tone({ type: 'sine', f0: 1400, f1: 300, dur: 0.14, vol: 0.15 }); break;
      case 'ab:mend': break;                        // the 'mend' event chimes
      case 'ab:shockwave': break;                   // the slam event booms
      case 'ab:gale': break;                        // the gale event whooshes
      case 'ab:bubble':   this._tone({ type: 'sine', f0: 500, f1: 980, dur: 0.2, vol: 0.14 }); break;
      case 'ab:boomerang':
        for (const t0 of [0, 0.09, 0.18])
          this._noise({ type: 'bandpass', f0: 1100, q: 3, t0, dur: 0.07, vol: 0.10 });
        break;
      case 'ab:volley':
        for (const t0 of [0, 0.05, 0.10])
          this._tone({ type: 'square', f0: 900, f1: 500, t0, dur: 0.07, vol: 0.09 });
        break;
      case 'ability':                               // generic zap fallback
        this._tone({ type: 'sawtooth', f0: 700, f1: 180, dur: 0.12, vol: 0.14 });
        break;
      case 'shockwave':
        this._tone({ type: 'sine', f0: 90, f1: 35, dur: 0.4, vol: 0.4 });
        this._noise({ f0: 1200, f1: 100, dur: 0.35, vol: 0.28 });
        break;
      case 'gale':    this._noise({ type: 'highpass', f0: 500, f1: 2500, dur: 0.45, vol: 0.2 }); break;
      case 'mend':
        this._tone({ type: 'sine', f0: 880, dur: 0.12, vol: 0.13 });
        this._tone({ type: 'sine', f0: 1175, t0: 0.09, dur: 0.18, vol: 0.13 });
        break;

      case 'gameover':
        for (const [i, f] of [523, 659, 784, 1047].entries())
          this._tone({ type: 'triangle', f0: f, t0: i * 0.13, dur: i === 3 ? 0.5 : 0.14, vol: 0.16 });
        break;
    }
  }

  // Charging smash: a rising whine that tracks the ~1.2s wind-up. It stops
  // early if the charge releases (swing) or gets interrupted (hit/crush/...).
  startCharge(id) {
    if (!this.ac || this.muted) return;
    this.stopCharge(id);
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(130, t);
    o.frequency.linearRampToValueAtTime(720, t + 1.25);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.15);
    o.connect(g).connect(this.sfxBus);
    o.start(t); o.stop(t + 1.4);
    o.onended = () => { if (this.charges.get(id)?.o === o) this.charges.delete(id); };
    this.charges.set(id, { o, g });
  }

  stopCharge(id) {
    const c = this.charges.get(id);
    if (!c) return;
    this.charges.delete(id);
    const t = this.ac.currentTime;
    c.g.gain.cancelScheduledValues(t);
    c.g.gain.setTargetAtTime(0.0001, t, 0.02);
    try { c.o.stop(t + 0.08); } catch (_) { /* already stopped */ }
  }

  // ---------- game event -> sound ----------

  event(ev) {
    switch (ev.e) {
      case 'hit':
        this.stopCharge(ev.vic);
        this.play(ev.spike ? 'spike' : ev.heavy ? 'hitheavy' : 'hit');
        break;
      case 'block':   this.stopCharge(ev.vic); this.play('block'); break;
      case 'ko':      this.stopCharge(ev.id); this.play('ko'); break;
      case 'swing':   this.stopCharge(ev.id); this.play(ev.atk === 'nspin' ? 'spin' : 'swing'); break;
      case 'charge':  this.startCharge(ev.id); break;
      case 'crush':   this.stopCharge(ev.id); this.play('crush'); break;
      case 'ledge':   this.stopCharge(ev.id); this.play('ledge'); break;
      case 'jump':    this.play('jump'); break;
      case 'land':    this.play('land'); break;
      case 'roll':    this.play('roll'); break;
      case 'duck':    this.play('duck'); break;
      case 'counter': this.play('counter'); break;
      case 'secondwind': this.play('secondwind'); break;
      case 'shockwave':  this.play('shockwave'); break;
      case 'gale':    this.play('gale'); break;
      case 'mend':    this.play('mend'); break;
      case 'ability': this.play(this._has('ab:' + ev.ability) ? 'ab:' + ev.ability : 'ability'); break;
      case 'gameover': this.play('gameover'); break;
    }
  }

  _has(name) {
    return ['ab:fireball', 'ab:blink', 'ab:mend', 'ab:shockwave', 'ab:gale',
      'ab:bubble', 'ab:boomerang', 'ab:volley'].includes(name);
  }

  // ---------- theme song sequencer ----------
  // Classic lookahead scheduling: a coarse timer books every voice a beat
  // or two ahead on the WebAudio clock, so playback stays glitch-free even
  // when the main thread hiccups.

  _startMusic() {
    if (this._musicTimer || !this.ac) return;
    this._step = 0;
    this._nextT = this.ac.currentTime + 0.1;
    this._musicTimer = setInterval(() => this._scheduleMusic(), 60);
  }

  _scheduleMusic() {
    if (this.ac.state !== 'running') { this._nextT = this.ac.currentTime + 0.1; return; }
    while (this._nextT < this.ac.currentTime + 0.25) {
      if (!this.muted) this._playStep(this._step % MEL.length, this._nextT - this.ac.currentTime);
      this._step++;
      this._nextT += STEP;
    }
  }

  _playStep(s, t0) {
    const bus = this.musicBus;
    // lead
    const m = MEL[s];
    if (m) this._tone({ type: 'square', f0: hz(m), t0, dur: STEP * 0.9, vol: 0.07, bus });
    // bass: root per bar with an octave bounce on the off-beats
    const bar = (s >> 3) & 3;
    const root = BASS_ROOTS[bar] + ((s & 7) === 2 || (s & 7) === 5 ? 12 : 0);
    this._tone({ type: 'triangle', f0: hz(root), t0, dur: STEP * 0.95, vol: 0.11, bus });
    // drums, fights only: kick on 1 & 3, snare on 2 & 4, hats on the 8ths
    if (this.mode !== 'fight') return;
    const q = s & 7;
    if (q === 0 || q === 4) this._tone({ type: 'sine', f0: 150, f1: 45, t0, dur: 0.1, vol: 0.4, bus });
    if (q === 2 || q === 6) this._noise({ type: 'bandpass', f0: 1900, q: 0.9, t0, dur: 0.08, vol: 0.16, bus });
    this._noise({ type: 'highpass', f0: 6500, t0, dur: 0.03, vol: q % 2 ? 0.03 : 0.05, bus });
  }
}

export const SFX = new Sfx();
