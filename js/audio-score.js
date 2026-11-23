// Sugar on the Wire • 108 BPM, 4/4. Verse, chorus, bridge, chorus reprise, reset.
export const STEP = 60 / 108 / 4;

// Bass followed by four keyboard voices. The chorus walks D–C♯–B in
// the bass while the upper voices stay close enough to ring into each other.
const Bm9 = [35, 57, 62, 66, 73], Gmaj9 = [31, 59, 62, 66, 69];
const D69 = [38, 57, 64, 66, 71], A69 = [33, 57, 61, 66, 71];
const AOverCSharp = [37, 57, 61, 64, 71], DOverFSharp = [42, 57, 62, 64, 69];
const Em9 = [40, 55, 62, 66, 71], Asus = [33, 57, 62, 64, 71];

// Each bar pairs its chord with [sixteenth, melody pitch, length] notes.
const call = [[0, 66, 3], [4, 69, 3], [8, 71, 6]];
const answer = [[0, 69, 6], [8, 66, 3]];
const refrain = [
  [D69, [[0, 74, 5], [6, 74, 2], [8, 76, 3], [12, 78, 4]]],
  [AOverCSharp, [[0, 76, 7], [8, 71, 3], [12, 69, 3]]],
  [Bm9, [[0, 71, 5], [6, 71, 2], [8, 74, 3], [12, 78, 4]]],
  [Gmaj9, [[0, 76, 4], [4, 74, 7]]],
];
const passage = (part, bars) => bars.map(([chord, melody], index) => ({ part, index, chord, melody }));
const SCORE = [
  ...passage('verse', [
    [Bm9, call], [Gmaj9, answer],
    [D69, call], [A69, [[0, 69, 4], [6, 66, 2], [8, 64, 5]]],
    [Bm9, call], [Gmaj9, answer],
    [D69, [[0, 66, 3], [4, 69, 3], [8, 71, 3], [12, 74, 3]]], [A69, [[0, 71, 6], [8, 69, 5]]],
  ]),
  ...passage('chorus', [
    ...refrain, ...refrain.slice(0, 3),
    [Gmaj9, [[0, 76, 4], [4, 74, 4], [8, 71, 6]]],
  ]),
  ...passage('bridge', [
    [Em9, [[0, 66, 7], [8, 64, 6]]], [Gmaj9, [[0, 62, 10]]],
    [DOverFSharp, [[4, 62, 3], [8, 66, 6]]], [Asus, [[0, 64, 10]]],
    [Em9, [[0, 66, 7], [8, 64, 6]]], [Gmaj9, [[0, 62, 6], [8, 59, 6]]],
    [Asus, [[4, 62, 3], [8, 64, 6]]], [A69, [[0, 69, 7], [8, 71, 4]]],
  ]),
  ...passage('chorus', refrain),
  ...passage('reset', [
    [Gmaj9, [[0, 74, 6], [8, 71, 5]]], [DOverFSharp, [[0, 69, 7], [8, 66, 5]]],
    [Em9, [[0, 64, 10]]], [Asus, [[14, 64, 1.5]]],
  ]),
];

export function scoreStep(synth, step, time, fight) {
  const beat = step % 16;
  const { part, index, chord, melody } = SCORE[Math.floor(step / 16) % SCORE.length];
  const chorus = part === 'chorus', reset = part === 'reset';
  const sparse = part === 'bridge' || reset;
  const lastBar = reset && index === 3;
  const [root, ...keys] = chord;
  const v = synth.voice('music', time + (beat % 2 ? STEP * .105 : 0));
  for (const [on, pitch, length] of melody) {
    if (beat !== on) continue;
    const dur = length * STEP;
    v.note(pitch, dur, sparse ? .15 : .18, {
      shape: 'felt', attack: sparse ? .026 : .014, hold: .48, fm: sparse ? .32 : .48, pan: -.18,
    });
    if (chorus) v.note(pitch, dur, .052, { shape: 'reed', attack: .065, hold: .46, pan: .28 });
  }

  // Thumbed electric bass. The upper partials keep the line on small speakers.
  if (beat === 0 || (beat === 10 && !sparse) || (fight && !reset && beat === 14 && index % 2 === 1)) {
    const passing = beat === 14;
    const pitch = root + (passing ? 7 : beat === 10 && index % 2 ? 12 : 0);
    v.note(pitch, beat === 0 ? STEP * (sparse && !lastBar ? 12 : 5.8) : STEP * 2.1,
      fight ? .37 : .29, { shape: 'bass', attack: .012, hold: .27, fm: .3 });
  }
  // Spread the chords across the stereo field. The bridge and reset let
  // them sustain, while the verse and chorus chop on the offbeats.
  if (beat === (sparse ? 0 : 2) || (!sparse && beat === 11)) {
    const dur = sparse ? STEP * (lastBar ? 6 : 14) : beat === 2 ? .55 : .38;
    keys.forEach((m, i) => v.note(m, dur,
      sparse ? .041 : .066, { shape: 'felt', delay: i * .014,
        attack: sparse ? .18 : .013, hold: sparse ? .45 : .08, pan: i % 2 ? .59 : -.59 }));
  }
  // Let the cadence shed its drums and leave room before the E pickup.
  if (reset && index >= 2) return;
  if (!sparse && index % 4 === 3 && beat === 12) {
    v.note(78, .38, .040, { fm: .8, ratio: 3, pan: .50 });
  }
  if (!fight) {
    if (!sparse && (beat === 4 || beat === 12)) v.air(1600, 950, .075, .062, { q: 1.1, pan: .28 });
    return;
  }
  if (beat === 0 || (!sparse && (beat === 10 || (chorus && beat === 7)))) {
    v.note(46, .24, .60, { end: 29, glide: .048, attack: .003, hold: .05 });
    v.air(900, 260, .039, .16, { type: 'lowpass' });
  }
  if (beat === 8 || (chorus && beat === 4)) {
    v.note(55, .14, .20, { end: 43, shape: 'hollow' });
    v.air(2100, 1050, .16, .27, { delay: .012, pan: -.2 });
    v.air(3200, 1900, .09, .12, { delay: .029, pan: .2 });
  }
  if (!sparse && (beat % 4 === 2 || (beat === 15 && index % 2))) {
    v.air(6900, 4400, beat === 14 ? .12 : .052, beat % 8 === 2 ? .11 : .075,
      { type: 'highpass', attack: .003, pan: beat < 8 ? .48 : -.38 });
  }
}
