// Sugar on the Wire • 108 BPM, 4/4. A thumb-piano pickup climbs F♯–A–B,
// then an electric reed answers it. The same five notes turn up in the UI,
// spell releases and the little exchange of bells after a win.
export const STEP = 60 / 108 / 4;
const BARS = 32;
const CHORDS = {
  Bm9:  [35, 57, 62, 66, 73],
  G9:   [31, 59, 62, 66, 69],
  D69:  [38, 57, 64, 66, 71],
  A6:   [33, 57, 61, 66, 71],
  Em9:  [40, 55, 62, 66, 71],
  Fsm7: [30, 57, 61, 64, 68],
};
const CHANGES = [
  'Bm9','G9','D69','A6', 'Bm9','G9','Em9','A6',
  'D69','A6','Bm9','G9', 'D69','Fsm7','G9','A6',
  'Em9','Bm9','G9','D69', 'Em9','Fsm7','G9','A6',
  'D69','A6','Bm9','G9', 'D69','G9','Em9','A6',
];
// Each line is a bar of [sixteenth, pitch, length in sixteenths].
const HOOK = [
  [[0,66,3],[3,69,1],[6,71,5],[13,74,2]],
  [[2,73,2],[4,71,3],[9,69,5]],
  [[0,66,3],[3,69,1],[6,71,3],[10,76,4]],
  [[1,73,4],[7,69,3],[13,64,2]],
  [[0,66,3],[3,69,1],[6,71,5],[12,78,3]],
  [[2,76,3],[6,74,4],[12,71,2]],
  [[0,67,4],[6,71,3],[10,74,4]],
  [[0,73,5],[8,69,3],[14,64,1]],
];
const REFRAIN = [
  [[0,78,5],[6,76,2],[9,74,4],[14,69,2]],
  [[1,73,4],[7,71,3],[12,69,3]],
  [[0,66,3],[3,69,1],[6,71,4],[12,74,3]],
  [[2,78,3],[6,76,2],[10,74,5]],
  [[0,81,5],[7,78,3],[12,76,3]],
  [[2,73,4],[8,69,5]],
  [[0,71,4],[6,74,3],[10,78,4]],
  [[0,76,5],[8,73,3],[13,69,2]],
];
const BRIDGE = [
  [[2,67,7],[12,71,3]], [[4,66,7]],
  [[1,62,5],[9,69,4]], [[2,66,8]],
  [[0,64,5],[8,67,4]], [[3,69,3],[9,73,4]],
  [[0,71,6],[10,74,4]], [[0,73,6],[12,66,2],[14,69,2]],
];

export function scoreStep(synth, step, time, fight) {
  const bar = Math.floor(step / 16) % BARS, beat = step % 16;
  const section = Math.floor(bar / 8), bridge = section === 2;
  const chorus = section === 1 || section === 3;
  const [root, ...keys] = CHORDS[CHANGES[bar]];
  const v = synth.voice('music', time + (beat % 2 ? STEP * .105 : 0));
  const notes = (bridge ? BRIDGE : chorus ? REFRAIN : HOOK)[bar % 8];
  for (const [on, pitch, length] of notes) {
    if (beat !== on) continue;
    const dur = length * STEP;
    v.note(pitch, dur + .18, chorus ? .20 : .18, {
      shape: chorus ? 'reed' : 'felt', attack: chorus ? .034 : .009,
      hold: chorus || bridge ? .47 : .2, fm: chorus ? .12 : .7, pan: -.18,
    });
    // A quiet answering reflection sits across the stereo field.
    v.note(pitch, dur + .09, .037, { delay: STEP * 3, shape: 'felt', pan: .65 });
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
  // The upper register answers only in the gaps left by the lead.
  if (bar % 4 === 1 && beat === 14) {
    v.note(keys[2] + 12, .48, .065, { fm: 1.2, ratio: 3, pan: .68 });
  }
  // In the last chorus a low marimba answers the lead's held syllables.
  if (section === 3 && bar % 2 === 0 && (beat === 4 || beat === 8 || beat === 11)) {
    const reply = beat === 4 ? keys[0] : beat === 8 ? keys[1] : keys[2];
    v.note(reply, .26, .106, { shape: 'hollow', fm: .75, ratio: 3, pan: .43 });
  }
  if ((bar === 15 || bar === 30) && beat === 12) {
    [78,81,78,76].forEach((m,i) => v.note(m, .26, .071 - i * .009,
      { delay: i * STEP * .58, fm: .95, pan: .58 - i * .32 }));
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
