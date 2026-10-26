const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(suspended = false) {
  let receive, resume;
  const notes = [], loops = new Map(), cancelled = [];
  let counter = 0;
  const context = vm.createContext({
    console,
    chrome: { runtime: { onMessage: { addListener: fn => { receive = fn; } } } },
    setInterval: fn => { loops.set(++counter, fn); return counter; },
    clearInterval: id => loops.delete(id),
    setTimeout: () => 0,
    AudioContext: class {
      currentTime = 0;
      state = suspended ? 'suspended' : 'running';
      destination = {};
      resume() { return new Promise(resolve => { resume = () => { this.state = 'running'; resolve(); }; }); }
      createOscillator() { return { frequency: { setValueAtTime: f => notes.push(f), linearRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop: at => { if (at === undefined) cancelled.push(true); } }; }
      createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } }; }
    },
  });
  context.self = context;
  vm.runInContext(fs.readFileSync('extension/sound-catalog.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('extension/offscreen.js', 'utf8'), context);
  return { send: msg => receive(msg), notes, loops, cancelled, resume: () => resume(), context };
}
const settings = { soundId: 'low-pulse', volume: .6, enabled: true };
test('offscreen renders the selected catalog sound exactly once per play request', () => {
  const h = setup();
  h.send({ type: 'AURA_AUDIO_PLAY', kind: 'fatigue', settings });
  assert.deepEqual(h.notes, [440, 440, 554]);
  assert.equal(h.loops.size, 0);
  // The public bridge request must not be played directly by this document.
  h.send({ type: 'AURA_BEEP', settings });
  assert.equal(h.notes.length, 3);
});
test('muted normal audio is silent, but fixed away loop survives preference and F8 updates until Stop', () => {
  const h = setup();
  h.send({ type: 'AURA_AUDIO_PLAY', kind: 'docket', settings: { ...settings, enabled: false } });
  assert.equal(h.notes.length, 0);
  h.send({ type: 'AURA_AUDIO_PLAY', kind: 'away', loop: true, settings: { ...settings, enabled: false } });
  assert.deepEqual(h.notes, [880, 698]);
  assert.equal(h.loops.size, 1);
  h.send({ type: 'AURA_AUDIO_UPDATE', settings: { ...settings, soundId: 'arcade-up', volume: .3, enabled: false } });
  [...h.loops.values()][0]();
  assert.deepEqual(h.notes, [880, 698, 880, 698]);
  h.send({ type: 'AURA_AUDIO_STOP' });
  assert.equal(h.loops.size, 0);
  assert.equal(h.cancelled.length, 4);
});
test('repeated start requests replace rather than multiply the away loop', () => {
  const h = setup();
  for (let i = 0; i < 3; i++) h.send({ type: 'AURA_AUDIO_PLAY', kind: 'away', loop: true, settings });
  assert.equal(h.loops.size, 1);
});
test('Stop also cancels audio waiting on a suspended context to resume', async () => {
  const h = setup(true);
  h.send({ type: 'AURA_AUDIO_PLAY', kind: 'away', loop: true, settings });
  h.send({ type: 'AURA_AUDIO_STOP' });
  h.resume();
  await vm.runInContext('Promise.resolve()', h.context);
  assert.equal(h.notes.length, 0);
  assert.equal(h.loops.size, 0);
});
