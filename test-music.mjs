import assert from 'node:assert/strict';

const listeners = {};
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = {
  hidden: false,
  addEventListener(type, fn) { listeners[type] = fn; },
};

class FakeAudio {
  constructor() {
    this.paused = true;
    this.handlers = {};
    this.plays = 0;
  }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  play() { this.paused = false; this.plays++; return Promise.resolve(); }
  pause() { this.paused = true; }
  end() { this.paused = true; this.handlers.ended(); }
}
globalThis.Audio = FakeAudio;

const param = () => ({ value: 0, setTargetAtTime(value) { this.value = value; } });
const node = () => ({ connect(to) { this.output = to; return to; } });
class FakeContext {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 100; }
  createDynamicsCompressor() {
    return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() };
  }
  createGain() { return { ...node(), gain: param() }; }
  createPeriodicWave() { return {}; }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createConvolver() { return node(); }
  createStereoPanner() { return { ...node(), pan: param() }; }
  createMediaElementSource(audio) { this.media = audio; return this.source = node(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
globalThis.window = { AudioContext: FakeContext };

const { SFX } = await import('./js/sfx.js');
SFX.unlock();
const music = SFX.music;
assert.equal(SFX.ac.media, music);
assert.equal(SFX.ac.source.output, SFX.musicDuck, 'music shares the volume and ducking bus');
assert.equal(music.src, 'music/Pixel-Burst Groove.m4a');
assert.equal(music.plays, 1);
SFX.unlock();
assert.equal(music.plays, 1, 'subsequent gestures do not restart a playing track');

music.end();
assert.equal(music.src, 'music/Pixel-Burst Groove 2.m4a');
assert.equal(music.plays, 2);
music.end();
assert.equal(music.src, 'music/Pixel-Burst Groove.m4a');
assert.equal(music.plays, 3, 'playlist wraps to the first song');

SFX.setLevels({ music: .5, master: .7 });
assert.equal(SFX.musicBus.gain.value, .5 * .57);
assert.equal(SFX.master.gain.value, .7 * .82);
SFX.setMuted(true);
assert.equal(SFX.musicBus.gain.value, 0);
SFX.setMuted(false);
assert.equal(SFX.musicBus.gain.value, .5 * .57);

document.hidden = true;
listeners.visibilitychange();
assert.equal(music.paused, true);
assert.equal(SFX.ac.state, 'suspended');
document.hidden = false;
listeners.visibilitychange();
assert.equal(music.paused, false);
assert.equal(SFX.ac.state, 'running');
assert.equal(music.plays, 4, 'visibility resumes the current song');
clearInterval(SFX.timer);
console.log('PASS  Music playlist, audio controls and visibility');
