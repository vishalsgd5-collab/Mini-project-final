import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getVolume, setVolume, setSoundOn, playFatigueBeep, playAlarmBeep } from '../src/lib/sound.js';

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
};
const sounds = [], peaks = [];
globalThis.Audio = class {
  constructor() { sounds.push(this); }
  play() { return Promise.resolve(); }
  pause() {}
};
globalThis.window = {
  setTimeout: fn => { fn(); return 0; },
  AudioContext: class {
    currentTime = 0;
    state = 'running';
    destination = {};
    createOscillator() { return { frequency: {}, connect() {}, start() {}, stop() {} }; }
    createGain() {
      return {
        connect() {},
        gain: { setValueAtTime() {}, linearRampToValueAtTime(value) { if (value > 0.001) peaks.push(value); } },
      };
    }
  },
};
test('fresh or blank preference defaults to full volume, not the old 15%', () => {
  store.clear();
  assert.equal(getVolume(), 1);
  store.set('aura_sound_vol', '');
  assert.equal(getVolume(), 1);
});
test('saved volume is respected, invalid settings recover, levels are bounded', () => {
  setVolume(0.7); assert.equal(getVolume(), 0.7);
  setVolume(5); assert.equal(getVolume(), 1);
  setVolume(-1); assert.equal(getVolume(), 0.15);
  setVolume('invalid'); assert.equal(getVolume(), 1);
});
test('fatigue beep uses full WAV volume and boosted Web Audio gain', () => {
  store.clear(); setSoundOn(true);
  const before = sounds.length;
  assert.equal(playFatigueBeep(true), true);
  const alerts = sounds.slice(before).filter(sound => sound.volume !== 0.01);
  assert.equal(alerts.length, 3);
  assert.ok(alerts.every(sound => sound.volume === 1));
  assert.ok(peaks.slice(-3).every(value => value === 0.6));
});
test('F8-style fatigue mute still suppresses beep; away alarm remains audible', () => {
  setSoundOn(false);
  const before = sounds.length;
  assert.equal(playFatigueBeep(), false);
  assert.equal(sounds.length, before);
  assert.equal(playAlarmBeep(), true);
  assert.ok(sounds.length > before);
});
test('Guardian uses louder bounded gain targets in both audio paths', () => {
  const offscreen = readFileSync(new URL('../../extension/offscreen.js', import.meta.url), 'utf8');
  const content = readFileSync(new URL('../../extension/content.js', import.meta.url), 'utf8');
  assert.match(offscreen, /exponentialRampToValueAtTime\(0\.40,/);
  assert.match(content, /exponentialRampToValueAtTime\(0\.35,/);
});
