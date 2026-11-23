// Shared instruments for the band, Foley and scenery. Pitches are MIDI notes,
// times are on the audio clock, and each voice has a position on the stage.
export const hz = note => 440 * 2 ** ((note - 69) / 12);
const FLOOR = 0.00001;
const PAN = [-0.86, -0.58, -0.28, 0, 0.28, 0.58, 0.86];
const PARTIALS = {
  felt: [1, .28, .075, .025],       // a rounded electric piano tine
  reed: [1, .29, .36, .09, .12, .025, .04],
  bass: [1, .48, .22, .095, .035],
  metal: [1, .045, .3, .02, .16, .02, .08],
  hollow: [1, .035, .34, .015, .09],
};

function envelope(param, t, duration, peak, attack, hold) {
  const top = t + Math.min(attack, duration * .45);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, top);
  if (hold) param.linearRampToValueAtTime(peak * .8, Math.max(top, t + duration * hold));
  param.exponentialRampToValueAtTime(Math.max(FLOOR, peak * .006), t + duration);
  param.linearRampToValueAtTime(0, t + duration + .004);
}

export class Synth {
  constructor(ac, music, effects) {
    this.ac = ac;
    this.waves = {};
    for (const [name, partials] of Object.entries(PARTIALS)) {
      const imag = Float32Array.from([0, ...partials]);
      this.waves[name] = ac.createPeriodicWave(new Float32Array(imag.length), imag);
    }
    this.noise = ac.createBuffer(1, Math.round(ac.sampleRate * 2.7), ac.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

    // Reuse the stereo positions and a tiny stereo room. Each return goes
    // through its own fader, so muting music also mutes its reverberation.
    const length = Math.round(ac.sampleRate * .68);
    const impulse = ac.createBuffer(2, length, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let soft = 0;
      for (let i = Math.floor(ac.sampleRate * (.018 + ch * .006)); i < length; i++) {
        soft = .62 * soft + .38 * (Math.random() * 2 - 1);
        data[i] = soft * (1 - i / length) ** 3.8;
      }
    }
    this.lanes = {};
    for (const [name, bus, wet] of [['music', music, .18], ['fx', effects, .095]]) {
      const room = ac.createConvolver();
      room.buffer = impulse;
      const send = ac.createGain();
      send.gain.value = wet;
      send.connect(room).connect(bus);
      this.lanes[name] = PAN.map(pan => {
        const p = ac.createStereoPanner();
        p.pan.value = pan;
        p.connect(bus);
        p.connect(send);
        return p;
      });
    }
  }

  lane(bus, pan) {
    return this.lanes[bus][Math.max(0, Math.min(6, Math.round(3 + pan * 3.5)))];
  }

  voice(bus, time, pan = 0, level = 1, output = null) {
    return new Voice(this, bus, time, pan, level, output);
  }
}

class Voice {
  constructor(synth, bus, time, pan, level, output) {
    this.synth = synth;
    this.bus = bus;
    this.time = time;
    this.pan = pan;
    this.level = level;
    this.output = output;
  }

  note(pitch, dur, volume, { shape = 'sine', end = pitch, delay = 0,
    attack = .006, hold = 0, glide = dur * .85, fm = 0, ratio = 2, pan = 0 } = {}) {
    const { ac, waves } = this.synth;
    const t = this.time + delay, f = hz(pitch);
    const osc = ac.createOscillator();
    if (waves[shape]) osc.setPeriodicWave(waves[shape]);
    else osc.type = shape;
    osc.frequency.setValueAtTime(f, t);
    if (end !== pitch) osc.frequency.exponentialRampToValueAtTime(hz(end), t + glide);
    if (fm) {
      // A struck tine starts bright and settles to the fundamental.
      const mod = ac.createOscillator(), depth = ac.createGain();
      mod.frequency.value = f * ratio;
      depth.gain.setValueAtTime(f * fm, t);
      depth.gain.exponentialRampToValueAtTime(.01, t + dur * .64);
      mod.connect(depth).connect(osc.frequency);
      mod.start(t); mod.stop(t + dur);
    }
    this._sound(osc, osc, t, dur, volume, attack, hold, pan);
  }

  air(from, to, dur, volume, { type = 'bandpass', q = .8, delay = 0, attack = .008, pan = 0 } = {}) {
    const { ac, noise } = this.synth;
    const src = ac.createBufferSource(), filter = ac.createBiquadFilter();
    const t = this.time + delay;
    src.buffer = noise; src.loop = true;
    filter.type = type; filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    src.connect(filter);
    this._sound(src, filter, t, dur, volume, attack, 0, pan, Math.random() * noise.duration);
  }

  _sound(source, tail, t, dur, volume, attack, hold, pan, offset) {
    const gain = this.synth.ac.createGain();
    envelope(gain.gain, t, dur, Math.max(FLOOR, volume * this.level), attack, hold);
    tail.connect(gain).connect(this.output || this.synth.lane(this.bus, this.pan + pan));
    if (offset === undefined) source.start(t);
    else source.start(t, offset);
    source.stop(t + dur + .004);
  }
}
