import { hz } from './audio-synth.js';

// Pitched tails borrow D-major / B-minor notes from the score. The noise
// attacks carry timing and material, so impacts still read inside a chord.
const COMBO = { jab: 50, cross: 47, knee: 42, roundh: 35, dash: 40 };
const CREATURES = {
  // [register, inflection, throat, number of syllables, space between them]
  grunt:    [47, -5, 'reed',   1, .08],
  runner:   [69, -7, 'hollow', 2, .047],
  brute:    [35, -4, 'bass',   2, .135],
  hopper:   [62, 12, 'hollow', 2, .083],
  flyer:    [78,  7, 'sine',   3, .051],
  slinger:  [59, -9, 'metal',  2, .105],
  colossus: [30, -5, 'bass',   3, .14],
  tempest:  [74, 12, 'reed',   3, .085],
  warlock:  [42,  7, 'metal',  2, .17],
};

function bells(v, notes, gap = .064, gain = .14, length = .32) {
  notes.forEach((m, i) => v.note(m, length * (i === notes.length - 1 ? 1.4 : 1), gain,
    { delay: i * gap, fm: .95, ratio: 3, pan: (i % 2 ? .16 : -.16) }));
}

// [body pitch, material, upper interval, pulses per second at the start].
// Even the heavy weapons have a fundamental that carries on a phone speaker.
const WINDUPS = {
  unarmed:   [50, 'hollow', 12, 2.5],
  sword:     [66, 'metal',   7, 3.0],
  magic:     [59, 'felt',   19, 1.7],
  spear:     [57, 'hollow', 12, 2.1],
  boomerang: [62, 'felt',    7, 3.6],
  shield:    [54, 'metal',  12, 2.0],
  hammer:    [47, 'bass',   19, 1.6],
  bombs:     [52, 'reed',   12, 2.8],
};

export class ChargeVoice {
  constructor(synth, weapon) {
    this.synth = synth;
    this.weapon = weapon;
    const [pitch, shape, interval, rate] = WINDUPS[weapon] || WINDUPS.unarmed;
    this.rate = rate;
    this.progress = -1;
    this.position = null;
    const { ac } = synth;
    this.gate = ac.createGain();
    this.gate.gain.value = 0;
    this.pan = ac.createStereoPanner();
    this.gate.connect(this.pan).connect(synth.lane('fx', 0));
    const pulse = ac.createGain(), depth = ac.createGain();
    pulse.gain.value = .78;
    depth.gain.value = .22;
    pulse.connect(this.gate);
    this.lfo = ac.createOscillator();
    this.lfo.frequency.value = rate;
    this.lfo.connect(depth).connect(pulse.gain);
    this.sources = [this.lfo];
    const partial = (note, wave, volume) => {
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.frequency.value = hz(note);
      if (wave) osc.setPeriodicWave(synth.waves[wave]);
      gain.gain.value = volume;
      osc.connect(gain).connect(pulse);
      this.sources.push(osc);
      return gain.gain;
    };
    this.body = partial(pitch, shape, .16);
    this.overtone = partial(pitch + interval, null, .018);
    if (weapon === 'magic') this.sub = partial(pitch - 12, 'bass', 0);
    for (const source of this.sources) source.start();
  }

  update(progress, offset) {
    const t = this.synth.ac.currentTime;
    // Smooth the small simulation steps and coarser remote snapshots.
    const k = Math.floor(Math.max(0, Math.min(2, progress)) * 40) / 40;
    if (k !== this.progress) {
      const full = Math.min(1, k), over = Math.max(0, k - 1);
      this.body.setTargetAtTime(.16 + .055 * full, t, .035);
      this.overtone.setTargetAtTime(.018 + .045 * full + .035 * over, t, .05);
      this.lfo.frequency.setTargetAtTime(this.rate + 1.65 * k, t, .05);
      if (this.sub) {
        this.sub.setTargetAtTime(.13 * over, t, .06);
        if (k >= 1 && !this.rang) {
          this.rang = true;
          const v = this.synth.voice('fx', t, 0, 1, this.gate);
          bells(v, [71, 78], .075, .14, .28);
        }
      }
      this.progress = k;
    }
    const pos = Math.round(offset * 20) / 20;
    if (this.position !== pos) {
      this.position = pos;
      this.pan.pan.setTargetAtTime(Math.max(-.86, Math.min(.86, pos * .76)), t, .025);
      this.gate.gain.setTargetAtTime(1 / (1 + Math.max(0, Math.abs(pos) - .5) * .85), t, .012);
    }
  }

  stop() {
    const t = this.synth.ac.currentTime;
    this.gate.gain.setTargetAtTime(0, t, .009);
    this.lfo.onended = () => this.gate.disconnect();
    for (const source of this.sources) source.stop(t + .065);
  }
}

function thump(v, pitch, volume, dur = .23) {
  v.note(pitch + 16, dur, volume, { shape: 'bass', end: pitch, glide: .046, attack: .003 });
  v.air(1350, 270, Math.min(dur, .12), volume * .68, { type: 'lowpass', attack: .003 });
}

function enemy(v, action, kind) {
  const [pitch, bend, shape, count, gap] = CREATURES[kind] || CREATURES.grunt;
  const warn = action === 'telegraph', fallen = action === 'enemyko';
  const register = pitch + (warn ? -2 : 0);
  const dur = fallen ? .27 : warn ? gap * 1.85 : gap * 1.4;
  for (let i = 0; i < (fallen ? 1 : count); i++) {
    const m = register + (i % 2 ? 3 : 0);
    v.note(m, dur, warn ? .105 : .145, { shape, delay: i * gap, attack: warn ? .022 : .006,
      end: m + (fallen ? -12 : warn ? -bend * .5 : bend), fm: kind === 'warlock' ? 1.9 : .48,
      ratio: kind === 'slinger' ? 2.7 : 1.5 });
  }
  if (action === 'strike') v.air(740, 1750, .10, .17);
  if (action === 'foefire') v.note(pitch + 14, .23, .13, { end: pitch - 5, shape: 'hollow', fm: 1.6 });
  if (fallen) v.air(1100, 310, .16, .095);
}

export function playEffect(v, cue, ev = {}) {
  const power = Math.max(0, Math.min(2, ev.chg || 0));
  if (cue in COMBO) {
    const pitch = COMBO[cue];
    v.air(480, 2200, .10, .22, { q: 1.3 });
    v.note(pitch + 7, .11, .17, { shape: 'hollow', end: pitch });
    return;
  }
  switch (cue) {
    case 'click': v.note(78, .105, .12, { shape: 'felt', fm: .45 }); break;
    case 'tick': v.note(74, .17, .16, { shape: 'hollow', fm: .9 }); break;
    case 'save': bells(v, [69,78], .075); break;
    case 'ready': bells(v, [66,69,71], .062); break;
    case 'unready': bells(v, [69,66], .066, .11); break;
    case 'go': thump(v, 35, .38); bells(v, [66,69,71,78], .055, .19); break;
    case 'gameover': case 'roadclear': case 'bossdown':
      thump(v, 38, .34, .45);
      bells(v, [66,69,71,78,76,74], .102, .18, .48); break;
    case 'runend':
      if (ev.won) bells(v, [66,69,71,78,74], .11, .16, .52);
      else bells(v, [71,69,66,59], .14, .13, .52);
      break;
    case 'jump':
      v.air(480, 1550, .13, .15);
      v.note(54, .14, .12, { end: 66, shape: 'hollow' }); break;
    case 'land': {
      const weight = Math.min(1, (ev.v ?? 600) / 1100);
      thump(v, 41, .07 + weight * .15, .11);
      v.air(1700, 600, .065, .06 + weight * .07); break;
    }
    case 'ledge': v.air(1800, 550, .10, .13); v.note(62, .10, .11, { shape: 'felt' }); break;
    case 'roll': v.air(520, 1500, .13, .20); v.air(1450, 370, .19, .15, { delay: .065 }); break;
    case 'duck': v.air(640, 230, .09, .14); break;
    case 'nspin': case 'rang':
      for (let i = 0; i < 3; i++) {
        v.air(720 + i * 190, 2450, .105, .18, { delay: i * .064, q: 1.45 });
        if (cue === 'rang') v.note(71 - i * 5, .12, .09, { end: 64 - i * 5, delay: i * .064, shape: 'hollow' });
      }
      break;
    case 'fsmash': case 'usmash': case 'dsmash': case 'dair':
      v.air(420, 2050, .19, .25);
      thump(v, 35, .23 + power * .1, .21); break;
    case 'slash':
      v.air(1050, 4800, .16, .37, { q: 1.6 });
      v.note(90, .30, .13, { end: 85, shape: 'metal', fm: .75, ratio: 2.76 });
      v.note(78, .16, .075, { delay: .026, end: 76 }); break;
    case 'thrust': case 'sweep':
      v.air(670, 3200, cue === 'sweep' ? .28 : .11, .32, { q: 1.45 });
      v.note(62, .14, .22, { shape: 'hollow', end: 54 });
      v.note(81, .12, .095, { shape: 'felt', delay: .035 }); break;
    case 'mcast':
      bells(v, [71,78,83], .035, .15, .29);
      v.note(50, .22 + power * .15, .15 + power * .09, { end: 35, shape: 'bass' }); break;
    case 'bash':
      thump(v, 42, .31 + power * .07, .22);
      v.note(57, .30, .23, { fm: 2.8, ratio: 1.42, shape: 'metal' }); break;
    case 'hammerslam':
      thump(v, 28, .49, .40);
      v.note(47, .46, .27, { shape: 'metal', fm: 2, ratio: 2.43 });
      v.note(66, .33, .09, { delay: .07, shape: 'metal', pan: .28 }); break;
    case 'bomb':
      v.note(66, .15, .18, { shape: 'hollow', end: 47 });
      v.air(4300, 1900, .25, .24, { delay: .035, q: 1.65 }); break;
    case 'fuse':
      v.air(3300, 1600, .18, .18);
      bells(v, [74,78], .083, .10, .10); break;
    case 'bombboom': {
      const size = Math.min(1, (ev.r ?? 48) / 48);
      thump(v, 38 - 12 * size, .33 + .27 * size, .22 + .41 * size);
      v.air(4200, 240, .23 + .29 * size, .26 + .22 * size, { type: 'lowpass', attack: .004 });
      v.air(1700, 350, .34, .16 * size, { delay: .12, pan: -.4 }); break;
    }
    case 'rangreturn':
      v.note(62, .19, .12, { shape: 'hollow', end: 74 });
      v.air(1850, 760, .17, .14); break;
    case 'catch': v.note(74, .15, .13, { shape: 'felt' }); v.air(2400, 560, .06, .14); break;
    case 'fizzle': v.air(1250, 270, .18, .16); v.note(54, .13, .10, { end: 47 }); break;
    case 'hit': case 'hitheavy': case 'spike': {
      const heavy = cue !== 'hit';
      thump(v, heavy ? 30 : 43, heavy ? .47 : .29, heavy ? .32 : .14);
      v.air(heavy ? 3200 : 2400, 780, heavy ? .17 : .08, heavy ? .37 : .27);
      if (cue === 'spike') v.note(78, .24, .17, { end: 42, shape: 'reed' });
      break;
    }
    case 'spikebounce': v.note(47, .24, .24, { end: 71, shape: 'hollow' }); break;
    case 'block': case 'parry':
      v.note(74, .20, .22, { fm: 2.3, ratio: 2.41 });
      if (cue === 'parry') bells(v, [81,85,90], .041, .14);
      break;
    case 'crush': case 'ko':
      thump(v, 28, .53, .52);
      v.air(2800, 210, .47, .36, { type: 'lowpass' });
      bells(v, cue === 'ko' ? [78,74,69,59] : [66,59], .052, .13, .28); break;
    case 'telegraph': case 'strike': case 'foefire': case 'enemyko': enemy(v, cue, ev.kind); break;
    case 'boss': case 'bosssig':
      enemy(v, 'telegraph', ev.kind);
      v.note(35, .80, .31, { shape: 'reed', end: 30, attack: .09, hold: .34 });
      v.note(42, .71, .14, { delay: .12, shape: 'bass' }); break;
    case 'stomp': case 'meteor': case 'shockwave': case 'eruption':
      thump(v, 28, .54, .52);
      v.air(cue === 'eruption' ? 3400 : 1900, 180, .41, .38, { type: 'lowpass' }); break;
    case 'lightning':
      v.air(4800, 900, .15, .48, { attack: .002 });
      thump(v, 32, .42, .52); break;
    case 'laserwarn': bells(v, [54,61,66], .16, .16, .28); break;
    case 'laserfire':
      v.note(78, .46, .28, { end: 47, fm: 2.2, shape: 'reed' });
      v.air(2800, 650, .53, .27); break;
    case 'burstboom': case 'burn': case 'fireskip': case 'hexpop':
      v.air(1900, 420, .19, .24, { type: 'lowpass' });
      if (cue === 'burstboom') thump(v, 35, .31, .28);
      v.note(ev.fire || cue === 'burn' ? 54 : 78, .19, .13, { fm: 1.5, end: cue === 'fireskip' ? 83 : 59 }); break;
    case 'fireball': v.air(430, 2600, .25, .28); v.note(54, .19, .15, { shape: 'reed', end: 66 }); break;
    case 'uppercut': case 'dashstrike':
      v.air(330, 2300, .22, .26);
      v.note(47, .24, .23, { end: cue === 'uppercut' ? 74 : 59, shape: 'bass' }); break;
    case 'gale': v.air(430, 2400, .46, .33, { attack: .06 }); break;
    case 'mend': case 'heart': case 'recovery':
      bells(v, cue === 'heart' ? [78,83] : [66,71,78], .075, .145, .36); break;
    case 'blink': case 'anchortp': bells(v, [83,78,71,83], .031, .13, .25); break;
    case 'bubble': v.note(62, .32, .17, { end: 74, fm: 1.8 }); bells(v, [81,85], .085, .09); break;
    case 'volley': bells(v, [74,78,81], .042, .13, .16); v.air(900, 2200, .21, .16); break;
    case 'hook': v.air(2300, 650, .17, .23); bells(v, [74,69], .036, .10, .09); break;
    case 'counter': case 'anchor': v.note(66, .35, .15, { fm: 1.2, shape: 'metal' }); break;
    case 'trap': case 'snag': v.air(2700, 570, .09, .29); v.note(62, .12, .17, { shape: 'metal', end: 47 }); break;
    case 'springtrap': case 'spring': v.note(54, .24, .18, { shape: 'hollow', end: 78, fm: 1.7 }); break;
    case 'summon': bells(v, ev.kind === 'flyer' ? [78,83,90] : [54,61,66], .043, .13); break;
    case 'summonout': v.air(1300, 350, .19, .12); break;
    case 'beacon': case 'patrol': case 'district':
      bells(v, cue === 'patrol' ? [47,54] : [66,69,71], .12, .13, .42); break;
    case 'beaconout': bells(v, [69,62], .12, .10); break;
    case 'augment':
      if (ev.aug === 'vampiric' || ev.aug === 'reaper') bells(v, [66,71], .052, .084, .18);
      else if (ev.aug === 'thorns' || ev.aug === 'bulwark') v.note(78, .14, .10, { shape: 'metal', fm: 1.5 });
      else if (ev.aug === 'acrobat') v.note(69, .15, .10, { shape: 'hollow', end: 81 });
      else if (ev.aug === 'executioner' || ev.aug === 'berserker') v.note(42, .19, .13, { shape: 'bass', end: 35 });
      else v.note(78, .19, .09, { fm: .8, shape: 'felt' });
      break;
  }
}
