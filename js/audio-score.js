// Sugar on the Wire • 108 BPM, 4/4. One two-bar call and answer throughout.
// The band changes its touch and density around the player's familiar hook.
export const STEP = 60 / 108 / 4;
const BARS = 32;
// Bm9, Gmaj9, D6/9, A6. Bass followed by the four keyboard voices.
const CHANGES = [
  [35, 57, 62, 66, 73],
  [31, 59, 62, 66, 69],
  [38, 57, 64, 66, 71],
  [33, 57, 61, 66, 71],
];
// [sixteenth, pitch, length]. F♯–A–B on beats one, two and three,
// then A–F♯ on one and three. Beat four of the answer is a breath.
const HOOK = [
  [[0, 66, 3], [4, 69, 3], [8, 71, 6]],
  [[0, 69, 6], [8, 66, 3]],
];

export function scoreStep(synth, step, time, fight) {
  const bar = Math.floor(step / 16) % BARS, beat = step % 16;
  const section = Math.floor(bar / 8), bridge = section === 2;
  const chorus = section === 1 || section === 3;
  const [root, ...keys] = CHANGES[bar % CHANGES.length];
  const v = synth.voice('music', time + (beat % 2 ? STEP * .105 : 0));
  for (const [on, pitch, length] of HOOK[bar % HOOK.length]) {
    if (beat !== on) continue;
    const dur = length * STEP;
    v.note(pitch, dur, bridge ? .15 : .18, {
      shape: 'felt', attack: .014, hold: .48, fm: .48, pan: -.18,
    });
    if (chorus) v.note(pitch, dur, .052, { shape: 'reed', attack: .065, hold: .46, pan: .28 });
  }

  // Thumbed electric bass. The upper partials keep the line on small speakers.
  if (beat === 0 || (beat === 10 && !bridge) || (fight && beat === 14 && bar % 2 === 1)) {
    const passing = beat === 14;
    const pitch = root + (passing ? 7 : beat === 10 && bar % 2 ? 12 : 0);
    v.note(pitch, beat === 0 ? STEP * (bridge ? 12 : 5.8) : STEP * 2.1,
      fight ? .37 : .29, { shape: 'bass', attack: .012, hold: .27, fm: .3 });
  }
  // Voiced ninths. Long, staggered attacks in the middle eight; short
  // offbeat chops elsewhere. Alternate inversions between left and right.
  if (beat === (bridge ? 0 : 2) || (!bridge && beat === 11)) {
    keys.forEach((m, i) => v.note(m, bridge ? STEP * 14 : beat === 2 ? .55 : .38,
      bridge ? .041 : .066, { shape: 'felt', delay: i * .014,
        attack: bridge ? .23 : .013, hold: bridge ? .45 : .08, pan: i % 2 ? .59 : -.59 }));
  }
  // A single high tine marks the same turnaround on every fourth bar.
  if (bar % 4 === 3 && beat === 12) {
    v.note(78, .38, .040, { fm: .8, ratio: 3, pan: .50 });
  }
  if (!fight) {
    if (!bridge && (beat === 4 || beat === 12)) v.air(1600, 950, .075, .062, { q: 1.1, pan: .28 });
    return;
  }
  if (beat === 0 || (!bridge && (beat === 10 || (chorus && beat === 7)))) {
    v.note(46, .24, .60, { end: 29, glide: .048, attack: .003, hold: .05 });
    v.air(900, 260, .039, .16, { type: 'lowpass' });
  }
  if (beat === 8 || (chorus && beat === 4)) {
    v.note(55, .14, .20, { end: 43, shape: 'hollow' });
    v.air(2100, 1050, .16, .27, { delay: .012, pan: -.2 });
    v.air(3200, 1900, .09, .12, { delay: .029, pan: .2 });
  }
  if (!bridge && (beat % 4 === 2 || (beat === 15 && bar % 2))) {
    v.air(6900, 4400, beat === 14 ? .12 : .052, beat % 8 === 2 ? .11 : .075,
      { type: 'highpass', attack: .003, pan: beat < 8 ? .48 : -.38 });
  }
}
