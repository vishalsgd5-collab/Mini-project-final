import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BEEP_SOUNDS, getVolume, setVolume, setSoundOn, getBeepSound, setBeepSound, playFatigueBeep, playRitualChime, playAlarmBeep, previewBeep, stopBeepPreview } from '../src/lib/sound.js';

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
};
const sounds = [], peaks = [], frequencies = [], contexts = [], messages = [];
let stops = 0;
globalThis.Audio = class {
  constructor() { sounds.push(this); }
  play() { return Promise.resolve(); }
  pause() { stops++; }
};
globalThis.window = {
  postMessage: msg => messages.push(msg),
  AudioContext: class {
    constructor() { contexts.push(this); }
    currentTime = 0;
    state = 'running';
    destination = {};
    resume() { return Promise.resolve(); }
    createOscillator() {
      return { frequency: { setValueAtTime: f => frequencies.push(f), linearRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() { stops++; } };
    }
    createGain() {
      return {
        connect() {}, disconnect() {},
        gain: { setValueAtTime() {}, linearRampToValueAtTime(value) { if (value > 0.001) peaks.push(value); } },
      };
    }
  },
};
test('fresh or blank preference defaults to full volume; saved levels are bounded', () => {
  store.clear(); assert.equal(getVolume(), 1);
  store.set('aura_sound_vol', ''); assert.equal(getVolume(), 1);
  setVolume(.7); assert.equal(getVolume(), .7);
  setVolume(5); assert.equal(getVolume(), 1);
  setVolume(-1); assert.equal(getVolume(), .15);
  setVolume('invalid'); assert.equal(getVolume(), 1);
});
test('eight distinct sound options produce valid bounded WAV previews', () => {
  assert.equal(BEEP_SOUNDS.length, 8);
  assert.equal(new Set(BEEP_SOUNDS.map(s => s.id)).size, 8);
  const signatures = new Set();
  for (const sound of BEEP_SOUNDS) {
    const wav = globalThis.AuraSoundCatalog.buildWav(sound.id), view = new DataView(wav);
    assert.equal(Buffer.from(wav).toString('ascii', 0, 4), 'RIFF');
    assert.equal(view.getUint32(24, true), 22050);
    assert.equal(view.getUint32(40, true), wav.byteLength - 44);
    let peak = 0;
    for (let i = 44; i < wav.byteLength; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)));
    assert.ok(peak > 1000 && peak <= 32767);
    signatures.add(Buffer.from(wav).toString('base64'));
  }
  assert.equal(signatures.size, 8);
});
test('selection is persisted, restores from storage, and syncs to Guardian with volume/mute', () => {
  store.clear(); assert.equal(getBeepSound(), 'bright-triple');
  setVolume(.6); setBeepSound('glass-chime');
  assert.equal(store.get('aura_beep_sound'), 'glass-chime');
  assert.equal(getBeepSound(), 'glass-chime');
  assert.equal(messages.at(-1).type, 'AURA_AUDIO_SETTINGS');
  assert.deepEqual(messages.at(-1).settings, { soundId: 'glass-chime', volume: .6, enabled: true });
  store.set('aura_beep_sound', 'radar-ping'); assert.equal(getBeepSound(), 'radar-ping');
  setBeepSound('nonexistent'); assert.equal(getBeepSound(), 'bright-triple');
});
test('every chosen sound renders its own notes for normal, urgent and ritual alerts', () => {
  store.clear(); setSoundOn(true); setVolume(.75);
  for (const sound of BEEP_SOUNDS) {
    setBeepSound(sound.id);
    for (const action of [() => playFatigueBeep(false), () => playFatigueBeep(true), playRitualChime]) {
      const start = frequencies.length, audioStart = sounds.length;
      assert.equal(action(), true);
      assert.deepEqual(frequencies.slice(start), sound.notes.map(n => n.frequency));
      assert.equal(sounds.length, audioStart, 'do not layer a WAV over functioning Web Audio');
      assert.ok(peaks.slice(-sound.notes.length).every(peak => Math.abs(peak - .6) < .0001));
    }
  }
});
test('F8 mute suppresses fatigue/ritual alerts; away uses the fixed alarm regardless of chosen sound', () => {
  setSoundOn(false); setBeepSound('arcade-up');
  const before = frequencies.length;
  assert.equal(playFatigueBeep(), false); assert.equal(playRitualChime(), false);
  assert.equal(frequencies.length, before);
  assert.equal(playAlarmBeep(), true);
  assert.deepEqual(frequencies.slice(before), [880, 698]);
});
test('preview works while muted, does not change selection, and stops/replaces previous preview', () => {
  setSoundOn(false); setBeepSound('soft-double');
  assert.equal(previewBeep('radar-ping'), true);
  assert.equal(getBeepSound(), 'soft-double');
  const before = stops;
  previewBeep('digital-pulse');
  assert.ok(stops > before);
  const next = stops; stopBeepPreview(); assert.ok(stops > next);
});
test('suspended Web Audio falls back to a single WAV at saved volume', () => {
  contexts[0].state = 'suspended'; setSoundOn(true); setVolume(.45);
  const start = frequencies.length, before = sounds.length;
  assert.equal(playFatigueBeep(), true);
  assert.equal(sounds.length, before + 1);
  assert.equal(sounds.at(-1).volume, .45);
  assert.equal(frequencies.length, start);
  contexts[0].state = 'running';
});
test('Guardian loads the shared catalog and content scripts never duplicate audio per tab', () => {
  const html = readFileSync(new URL('../../extension/offscreen.html', import.meta.url), 'utf8');
  const offscreen = readFileSync(new URL('../../extension/offscreen.js', import.meta.url), 'utf8');
  const content = readFileSync(new URL('../../extension/content.js', import.meta.url), 'utf8');
  assert.ok(html.indexOf('sound-catalog.js') < html.indexOf('offscreen.js'));
  assert.match(offscreen, /AuraSoundCatalog\.play/);
  assert.match(offscreen, /AURA_AUDIO_PLAY/);
  assert.doesNotMatch(content, /createOscillator|AudioContext|function playBeep/);
  assert.match(content, /AURA_AUDIO_SETTINGS/);
});
