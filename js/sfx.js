// SmackTown audio: every sound — UI blips, fight SFX, and the looping theme
// song — is synthesized with WebAudio at runtime. No audio files means
// nothing extra to download or precache, and one master gain mutes it all.
//
// Browsers refuse to start audio before a user gesture, so unlock() is
// called from the first pointerdown/keydown (main.js); it is idempotent.
// Game sounds ride the same event stream the renderer draws from
// (render.js calls SFX.event for every cosmetic event), so anything the
// players can see also makes noise, exactly once per client.

const MUTE_KEY = 'smacktown.muted';  // mutes the MUSIC only; SFX always play
const MUSIC_VOL = 0.30;

// ---------- theme song: 'Focus' ----------
// An adventure-overworld groove in E minor at 96 BPM: a jazzy synth-sax
// lead (sawtooth through a resonant lowpass, breathy attack, blooming
// vibrato, swung eighths), an arcade chip arpeggio sparkling up top, and a
// dubstep wobble bass + half-time kit that kick in during fights (menus
// get a calm sub bass instead).
//
// The song is an arrangement, not a loop of one melody: it cycles through
// 8-bar sections (FORM below) — verses where the sax sits back in the mix,
// grooves with NO melody at all so the low end and kit can breathe, a
// floaty bridge over new changes, and one double-time sax solo rampage.
const BPM = 96;

const VERSE_MEL = [ // sax verse: heroic Em phrases with jazz turns (0 = rest)
  64, 0, 67, 69, 71, 0, 74, 71,   72, 0, 71, 69, 67, 0, 64, 67,
  66, 0, 69, 71, 74, 0, 76, 74,   76, 0, 74, 71, 69, 71, 67, 64,
  64, 0, 64, 66, 67, 0, 71, 74,   72, 74, 72, 69, 67, 0, 69, 71,
  69, 0, 72, 76, 74, 72, 71, 69,  71, 0, 68, 66, 64, 0, 0, 0,
];
const BRIDGE_MEL = [ // floaty and sparse, hanging over the new changes
  74, 0, 0, 71, 0, 0, 67, 0,      76, 0, 0, 74, 0, 71, 69, 0,
  79, 0, 0, 76, 0, 0, 72, 74,     75, 0, 74, 0, 71, 0, 0, 0,
  74, 0, 0, 71, 0, 0, 67, 69,     76, 0, 0, 74, 0, 71, 69, 71,
  72, 0, 74, 0, 76, 0, 79, 0,     78, 0, 75, 0, 71, 0, 0, 0,
];
const SOLO_MEL = [ // the rampage, in four phrases that breathe like a player:
  // sneak in low with a bluesy climb, then WAIL on E5 and let it ring
  0, 0, 64, 66, 67, 69, 70, 71,   76, 0, 0, 0, 0, 0, 74, 76,
  // the answer up top — stabs around G5/A5, tumbling to a hanging A4
  79, 0, 76, 79, 81, 0, 79, 76,   74, 76, 74, 71, 69, 0, 0, 0,
  // the climb: straight up the horn to a screamed E6, held wide open
  64, 67, 69, 71, 74, 76, 79, 81, 83, 0, 86, 0, 88, 0, 0, 0,
  // bluesy fall — Bb leaning hard into B — and one last note rung out
  0, 86, 83, 81, 79, 76, 74, 70,  71, 0, 0, 0, 0, 0, 0, 0,
];
const VERSE_ROOTS = [40, 36, 38, 40, 40, 36, 33, 35];  // E2 C2 D2 E2 E2 C2 A1 B1
const BRIDGE_ROOTS = [43, 45, 36, 35, 43, 45, 36, 35]; // G2 A2 C2 B1, twice
const WOB = [3, 4, 2, 6, 3, 4, 8, 5];                  // wobble LFO Hz per bar

// The form: 8-bar (64-step) sections played in order, then looped. mel:null
// sections are the breathers — just bass, wobble, arp and drums.
const MEL_VOL = 0.085;   // sax sits back at half the level it used to play
const SOLO_VOL = 0.12;   // the solo leans in, still under the old level
const FORM = [
  { mel: VERSE_MEL,  roots: VERSE_ROOTS,  vol: MEL_VOL },
  { mel: null,       roots: VERSE_ROOTS },
  { mel: VERSE_MEL,  roots: VERSE_ROOTS,  vol: MEL_VOL },
  { mel: BRIDGE_MEL, roots: BRIDGE_ROOTS, vol: MEL_VOL },
  { mel: null,       roots: BRIDGE_ROOTS },
  { mel: SOLO_MEL,   roots: VERSE_ROOTS,  vol: SOLO_VOL, solo: true },
  { mel: null,       roots: VERSE_ROOTS },
];
const SONG_LEN = FORM.length * 64;

const SWING = 0.18;                  // off-eighths land late (jazz swing)
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
      else this.ac.resume();
    });
  }

  unlock() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ac.destination);
      this.sfxBus = this.ac.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ac.createGain();
      this.musicBus.gain.value = this.muted ? 0 : MUSIC_VOL;
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

  // Mutes the theme song only — game and UI sounds keep playing.
  setMuted(m) {
    this.muted = m;
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    if (this.musicBus) {
      this.musicBus.gain.setTargetAtTime(m ? 0 : MUSIC_VOL, this.ac.currentTime, 0.02);
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
    if (!this.ac) return;
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
      case 'burn':
        this._noise({ type: 'bandpass', f0: 300, f1: 2200, q: 1.1, dur: 0.3, vol: 0.22 });
        this._tone({ type: 'sawtooth', f0: 160, f1: 60, dur: 0.22, vol: 0.1 });
        break;
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
      case 'ab:hook':
        this._noise({ type: 'bandpass', f0: 2000, f1: 700, q: 4, dur: 0.16, vol: 0.14 });
        this._tone({ type: 'square', f0: 240, f1: 170, dur: 0.1, vol: 0.08 });
        break;
      case 'ab:trap':
        this._tone({ type: 'square', f0: 320, f1: 210, dur: 0.08, vol: 0.12 });
        this._tone({ type: 'square', f0: 520, t0: 0.07, dur: 0.05, vol: 0.09 });
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
    if (!this.ac) return;
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
      case 'burn':    this.stopCharge(ev.vic); this.play('burn'); break;
      case 'ledge':   this.stopCharge(ev.id); this.play('ledge'); break;
      case 'jump':    this.play('jump'); break;
      case 'spikebounce': this.play('jump'); break;
      case 'land':    this.play('land'); break;
      case 'roll':    this.play('roll'); break;
      case 'duck':    this.play('duck'); break;
      case 'counter': this.play('counter'); break;
      case 'secondwind': this.play('secondwind'); break;
      case 'augment': this.play(
        ev.aug === 'thorns' ? 'block'
        : ev.aug === 'acrobat' ? 'jump'
        : ev.aug === 'vampiric' || ev.aug === 'reaper' ? 'mend'
        : ev.aug === 'bulwark' ? 'block'
        : ev.aug === 'executioner' ? 'hitheavy'
        : 'ability'); break;
      case 'shockwave':  this.play('shockwave'); break;
      case 'gale':    this.play('gale'); break;
      case 'mend':    this.play('mend'); break;
      case 'ability': this.play(this._has('ab:' + ev.ability) ? 'ab:' + ev.ability : 'ability'); break;
      case 'gameover': this.play('gameover'); break;
    }
  }

  _has(name) {
    return ['ab:fireball', 'ab:blink', 'ab:mend', 'ab:shockwave', 'ab:gale',
      'ab:bubble', 'ab:boomerang', 'ab:volley', 'ab:hook', 'ab:trap'].includes(name);
  }

  // ---------- theme song sequencer ----------
  // Classic lookahead scheduling: a coarse timer books every voice a beat
  // or two ahead on the WebAudio clock, so playback stays glitch-free even
  // when the main thread hiccups.

  _startMusic() {
    if (this._musicTimer || !this.ac) return;
    this._step = 0;
    this._stepDur = 60 / BPM / 2;   // eighth note, seconds
    this._nextT = this.ac.currentTime + 0.1;
    this._musicTimer = setInterval(() => this._scheduleMusic(), 60);
  }

  _scheduleMusic() {
    if (this.ac.state !== 'running') { this._nextT = this.ac.currentTime + 0.1; return; }
    while (this._nextT < this.ac.currentTime + 0.3) {
      // muted still advances the step clock, so unmuting rejoins mid-song
      if (!this.muted) this._playStep(this._step % SONG_LEN, this._nextT - this.ac.currentTime);
      this._step++;
      this._nextT += this._stepDur;
    }
  }

  // One step of the arrangement: which 8-bar section we're in decides
  // whether the sax speaks at all, over which roots, and how loud.
  _playStep(step, t0) {
    const bus = this.musicBus, STEP = this._stepDur;
    const sec = FORM[(step / 64) | 0];
    const s = step % 64;
    const q = s & 7, bar = s >> 3;
    const swing = (s & 1) ? STEP * SWING : 0;   // off-eighths drag behind

    // sax melody (verse/bridge/solo sections only). Phrase-ending notes
    // ring out: a note holds through every rest that follows it, so the
    // wails at the ends of lines sustain instead of clipping off.
    const m = sec.mel && sec.mel[s];
    if (m) {
      let ring = 0;
      while (ring < 6 && !sec.mel[(s + 1 + ring) % 64]) ring++;
      const held = STEP * (0.95 + ring * 0.9);
      // held solo notes scoop up into pitch like a player leaning in
      this._sax(m, t0 + swing, held, sec.vol, sec.solo && ring >= 2);
      // solo rampage: double-time grace notes, but only mid-run — the
      // ringing phrase-enders stay clean
      if (sec.solo && (s & 3) === 2 && sec.mel[(s + 1) % 64]) {
        this._sax(m - 2, t0 + swing + STEP * 0.5, STEP * 0.45, sec.vol * 0.8);
      }
    }

    // low end, one note per half-bar: dubstep wobble in fights, calm sub
    // sine in the menus — same roots either way
    if (q === 0 || q === 4) {
      const root = sec.roots[bar];
      if (this.mode === 'fight') {
        this._wobble(root, t0, STEP * 3.9, WOB[bar] * (q ? 1.5 : 1), 0.15);
      } else {
        this._tone({ type: 'sine', f0: hz(root + 12), t0, dur: STEP * 3.6, vol: 0.10, bus });
      }
    }
    // arcade chip arpeggio sparkling over the harmony (root/fifth/octave)
    if (s & 1) {
      const off = [0, 7, 12, 7][(s >> 1) & 3];
      this._tone({ type: 'square', f0: hz(sec.roots[bar] + 24 + off), t0: t0 + swing, dur: STEP * 0.35, vol: 0.022, bus });
    }
    // half-time dubstep kit, fights only: kick on the one, fat snare on
    // the three, ticking swung hats
    if (this.mode !== 'fight') return;
    if (q === 0) this._tone({ type: 'sine', f0: 130, f1: 40, t0, dur: 0.14, vol: 0.45, bus });
    if (q === 4) {
      this._noise({ type: 'bandpass', f0: 1500, q: 0.8, t0, dur: 0.14, vol: 0.22, bus });
      this._tone({ type: 'triangle', f0: 210, f1: 120, t0, dur: 0.1, vol: 0.14, bus });
    }
    this._noise({ type: 'highpass', f0: 7500, t0: t0 + swing, dur: 0.025, vol: q % 2 ? 0.025 : 0.045, bus });
  }

  // Synth sax: a sawtooth pushed through a resonant lowpass with a soft,
  // breathy attack and vibrato that blooms in partway through the note.
  // scoop=true bends up into the pitch from below, like leaning into a wail;
  // long notes get slower-blooming, deeper vibrato so the ring-outs sing.
  _sax(m, t0, dur, vol, scoop = false) {
    const ac = this.ac;
    const t = ac.currentTime + t0;
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    if (scoop) {
      o.frequency.setValueAtTime(hz(m) * 0.92, t);
      o.frequency.exponentialRampToValueAtTime(hz(m), t + 0.09);
    } else {
      o.frequency.setValueAtTime(hz(m), t);
    }
    const vib = ac.createOscillator();
    vib.frequency.value = 5.2;
    const vg = ac.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(hz(m) * (dur > 0.8 ? 0.02 : 0.014),
      t + Math.min(0.5, dur * 0.6));
    vib.connect(vg).connect(o.frequency);
    const fl = ac.createBiquadFilter();
    fl.type = 'lowpass'; fl.Q.value = 2.5;
    fl.frequency.setValueAtTime(900, t);
    fl.frequency.linearRampToValueAtTime(1900, t + 0.06);  // breath opening up
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
    g.gain.setValueAtTime(vol, t + Math.max(0.06, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(fl).connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.05);
    vib.start(t); vib.stop(t + dur + 0.05);
  }

  // Dubstep wobble: saw + sub-octave sine under a resonant lowpass whose
  // cutoff is pumped by an LFO — the LFO rate is the "wub" speed.
  _wobble(m, t0, dur, rate, vol) {
    const ac = this.ac;
    const t = ac.currentTime + t0;
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(m);
    const sub = ac.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = hz(m - 12);
    const fl = ac.createBiquadFilter();
    fl.type = 'lowpass'; fl.Q.value = 7;
    fl.frequency.value = 750;
    const lfo = ac.createOscillator();
    lfo.frequency.value = rate;
    const lg = ac.createGain();
    lg.gain.value = 620;
    lfo.connect(lg).connect(fl.frequency);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + Math.max(0.05, dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(fl).connect(g);
    sub.connect(g);
    g.connect(this.musicBus);
    for (const n of [o, sub, lfo]) { n.start(t); n.stop(t + dur + 0.03); }
  }
}

export const SFX = new Sfx();
