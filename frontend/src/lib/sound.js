const KEY = "aura_sound_on";
const VOL_KEY = "aura_sound_vol";
let ctx = null;
let unlocked = false;
const cache = {};

export function isSoundOn() {
  return localStorage.getItem(KEY) !== "0";
}
export function setSoundOn(on) {
  localStorage.setItem(KEY, on ? "1" : "0");
}
export function getVolume() {
  const v = Number(localStorage.getItem(VOL_KEY));
  return Number.isFinite(v) ? Math.min(1, Math.max(0.15, v)) : 0.75;
}
export function setVolume(v) {
  localStorage.setItem(VOL_KEY, String(v));
}
export function isAudioReady() {
  return unlocked;
}

function audioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function wavUrl(freq, dur) {
  const id = `${freq}-${dur}`;
  if (cache[id]) return cache[id];
  const sr = 22050;
  const n = Math.floor(sr * dur);
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const env = Math.min(i / (0.015 * sr), 1, (n - i) / (0.05 * sr));
    samples[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / sr) * env * 0.9 * 32767);
  }
  const bytes = 44 + n * 2;
  const buf = new ArrayBuffer(bytes);
  const v = new DataView(buf);
  const ascii = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  v.setUint32(4, bytes - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, samples[i], true);
  cache[id] = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return cache[id];
}

function playWav(freq, dur, when = 0) {
  const el = new Audio(wavUrl(freq, dur));
  el.volume = getVolume();
  window.setTimeout(() => {
    el.play().catch(() => {});
  }, when);
}

function playOsc(freq, startOff, dur) {
  const c = audioCtx();
  if (!c) return;
  const t = c.currentTime + startOff;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "triangle";
  o.frequency.value = freq;
  const vol = getVolume() * 0.45;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function unlockAudio() {
  unlocked = true;
  const c = audioCtx();
  if (c?.state === "suspended") c.resume().catch(() => {});
  try {
    const warm = new Audio(wavUrl(440, 0.05));
    warm.volume = 0.01;
    warm.play().then(() => {
      warm.pause();
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function armAudioUnlock() {
  const go = () => unlockAudio();
  window.addEventListener("pointerdown", go, { capture: true });
  window.addEventListener("keydown", go, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) unlockAudio();
  });
}

export function playFatigueBeep(urgent = false) {
  if (!isSoundOn()) return false;
  unlockAudio();
  try {
    if (urgent) {
      playWav(740, 0.2, 0);
      playWav(880, 0.2, 180);
      playWav(1046, 0.32, 360);
      playOsc(740, 0, 0.2);
      playOsc(880, 0.18, 0.2);
      playOsc(1046, 0.36, 0.3);
    } else {
      playWav(784, 0.22, 0);
      playWav(988, 0.35, 200);
      playOsc(784, 0, 0.22);
      playOsc(988, 0.2, 0.32);
    }
    return true;
  } catch {
    return false;
  }
}

export function playRitualChime() {
  if (!isSoundOn()) return;
  unlockAudio();
  playWav(523, 0.18, 0);
  playWav(659, 0.24, 160);
  playOsc(523, 0, 0.18);
  playOsc(659, 0.14, 0.24);
}

/** Away-from-desk alarm — ignores F8 mute. Only a Stop button should halt it. */
export function playAlarmBeep() {
  unlockAudio();
  try {
    playWav(880, 0.28, 0);
    playWav(698, 0.32, 260);
    playOsc(880, 0, 0.28);
    playOsc(698, 0.26, 0.32);
    return true;
  } catch {
    return false;
  }
}
