// Continuous, slowly breathing stereo beds. Every few seconds a single
// detail surfaces on one side: a drop, a relay, a cricket, a wheel joint.
const LOCATIONS = {
  skyline:'rain', citadel:'rain', alley:'rain', parking:'rain',
  whalefall:'water', papersea:'water', koicrossing:'water', cistern:'water', docks:'water', galleon:'water',
  ruins:'forge', foundry:'forge', caldera:'forge', factory:'forge',
  roots:'garden', garden:'garden', mothmill:'garden', glasshouse:'garden', shrine:'garden',
  flatlands:'wind', canyon:'wind', frostspire:'ice', saltworks:'ice',
  reactor:'current', eclipse:'current', pocketplanet:'current', observatory:'current', lab:'current', deadair:'current',
  train:'rail', cars:'rail', switchback:'rail', sleepercircuit:'rail',
  market:'lantern', parade:'lantern', belfry:'lantern', temple:'lantern', coliseum:'lantern',
  pinball:'arcade', needledrop:'arcade', lastscoop:'arcade', training:'room',
};
export const landscape = id => LOCATIONS[id] || 'wind';

// Filter shape, center frequency, bed gain, shortest interval between details.
const BEDS = {
  rain:    ['lowpass',  2800, .063, 2.5],
  water:   ['lowpass',   680, .105, 3.4],
  forge:   ['lowpass',   330, .15,  3.8],
  garden:  ['bandpass', 1460, .034, 3.1],
  wind:    ['bandpass',  550, .072, 5.8],
  ice:     ['bandpass', 1040, .047, 4.7],
  current: ['lowpass',   440, .085, 4.9],
  rail:    ['lowpass',   520, .12,  2.4],
  lantern: ['bandpass',  670, .054, 4.7],
  arcade:  ['bandpass',  840, .041, 4.9],
  room:    ['lowpass',   780, .035, 6.6],
};

export class Scenery {
  constructor(synth, output, kind, t) {
    this.synth = synth;
    this.kind = kind;
    const { ac } = synth;
    const [type, cutoff, volume, interval] = BEDS[kind];
    this.next = t + 1.3 + Math.random() * interval;
    this.sides = [-.74, .74].map((pan, i) => {
      const gain = ac.createGain(), filter = ac.createBiquadFilter();
      gain.gain.setValueAtTime(0, t);
      gain.gain.setTargetAtTime(1, t, .34);
      const position = ac.createStereoPanner();
      position.pan.value = pan;
      gain.connect(position).connect(output);
      const bed = ac.createBufferSource(), level = ac.createGain();
      bed.buffer = synth.noise; bed.loop = true;
      bed.playbackRate.value = i ? .79 : .93;
      level.gain.value = volume;
      filter.type = type; filter.frequency.value = cutoff; filter.Q.value = .65;
      const breeze = ac.createOscillator(), depth = ac.createGain();
      breeze.frequency.value = (kind === 'water' ? .16 : .068) * (i ? 1 : .76);
      depth.gain.value = cutoff * .34;
      breeze.connect(depth).connect(filter.frequency);
      bed.connect(filter).connect(level).connect(gain);
      breeze.start(t); bed.start(t, i * .91);
      return { bed, breeze, gain };
    });
  }

  tick(t) {
    if (t < this.next) return;
    const interval = BEDS[this.kind][3];
    this.next = t + interval * (1 + Math.random() * 1.3);
    const side = this.sides[Math.random() < .5 ? 0 : 1];
    const v = this.synth.voice('fx', t, 0, .72 + Math.random() * .27, side.gain);
    const high = Math.random() < .5;
    switch (this.kind) {
      case 'rain': case 'water': {
        const m = (high ? 78 : 71) - (this.kind === 'water' ? 12 : 0);
        v.note(m, .17, .055, { end: m + 5, fm: .65 });
        v.air(1700, 820, .065, .046, { delay: .032 }); break;
      }
      case 'garden':
        for (const delay of [0, .09, .28]) v.note(high ? 95 : 90, .078, .023,
          { delay, end: high ? 97 : 93, shape: 'hollow', attack: .017 });
        break;
      case 'forge':
        v.air(2300, 860, .25, .074);
        v.note(high ? 66 : 59, .47, .033, { fm: 2.1, ratio: 1.42, delay: .1 }); break;
      case 'rail':
        for (const delay of [0, .105, .45, .555]) v.air(530, 150, .10, .13, { delay, type: 'lowpass' });
        break;
      case 'current':
        v.note(high ? 47 : 42, 1.15, .036, { shape: 'reed', attack: .29, hold: .48 });
        v.air(2350, 1300, .10, .043); break;
      case 'ice': case 'lantern': case 'arcade':
        v.note((high ? 78 : 71) + (this.kind === 'ice' ? 12 : 0), .78, .039,
          { fm: this.kind === 'arcade' ? 1.8 : .56, ratio: 3 });
        break;
      case 'wind': case 'room':
        v.air(360, high ? 1380 : 820, 1.6, .06, { attack: .43 }); break;
    }
  }

  stop(t) {
    for (const { gain, breeze, bed } of this.sides) {
      gain.gain.setTargetAtTime(0, t, .16);
      bed.stop(t + .95); breeze.stop(t + .95);
      bed.onended = () => gain.disconnect();
    }
  }
}
