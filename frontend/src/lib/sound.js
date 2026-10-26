import "../../../extension/sound-catalog.js";
import { tellGuardian } from "./bridge.js";

const catalog = globalThis.AuraSoundCatalog;
export const BEEP_SOUNDS = catalog.sounds;
let ctx = null;
let unlocked = false;
let stopPreview = null;
const wavCache = new Map();

export function getAudioSettings() { return catalog.readPreferences(localStorage); }
export function isSoundOn() { return getAudioSettings().enabled; }
export function getVolume() { return getAudioSettings().volume; }
export function getBeepSound() { return getAudioSettings().soundId; }
export function isAudioReady() { return unlocked; }

export function syncAudioPreferences() {
  const settings = getAudioSettings();
  tellGuardian({ type: "AURA_AUDIO_SETTINGS", settings });
  try { window.dispatchEvent(new CustomEvent("aura-audio-settings", { detail: settings })); } catch { /* not a browser */ }
}
export function setSoundOn(on) {
  localStorage.setItem("aura_sound_on", on ? "1" : "0");
  syncAudioPreferences();
}
export function setVolume(value) {
  localStorage.setItem("aura_sound_vol", String(catalog.sanitizePreferences({ volume: value }).volume));
  syncAudioPreferences();
}
export function setBeepSound(id) {
  localStorage.setItem("aura_beep_sound", catalog.getSound(id).id);
  syncAudioPreferences();
}

function audioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}
export function unlockAudio() {
  unlocked = true;
  const c = audioCtx();
  if (c?.state === "suspended") c.resume().catch(() => {});
}
function wavUrl(id, kind) {
  const key = `${id}:${kind}`;
  if (!wavCache.has(key)) {
    wavCache.set(key, URL.createObjectURL(new Blob([catalog.buildWav(id, kind)], { type: "audio/wav" })));
  }
  return wavCache.get(key);
}
function playChoice(id, kind = "fatigue") {
  unlockAudio();
  const c = audioCtx();
  if (c?.state === "running") return catalog.play(c, id, getVolume(), kind);
  // One audio path at a time: no parallel WAV/oscillator amplification or per-tab stacking.
  const audio = new Audio(wavUrl(id, kind));
  let cancelled = false;
  audio.volume = getVolume();
  audio.play().catch(() => {
    if (cancelled) return;
    try { window.dispatchEvent(new Event("aura-audio-blocked")); } catch { /* ignore */ }
  });
  return () => { cancelled = true; audio.pause(); audio.currentTime = 0; };
}
export function stopBeepPreview() {
  stopPreview?.();
  stopPreview = null;
}
export function previewBeep(id = getBeepSound()) {
  stopBeepPreview();
  try {
    stopPreview = playChoice(catalog.getSound(id).id);
    return true;
  } catch { return false; }
}
export function playFatigueBeep(_urgent = false) {
  if (!isSoundOn()) return false;
  stopBeepPreview();
  try { playChoice(getBeepSound()); return true; } catch { return false; }
}
export function playRitualChime() {
  return playFatigueBeep();
}
/** Fixed, recognizable away alarm: F8 cannot mute it; Stop alarm halts its repeating timer. */
export function playAlarmBeep() {
  stopBeepPreview();
  try { playChoice(getBeepSound(), "away"); return true; } catch { return false; }
}
export function armAudioUnlock() {
  const go = () => { unlockAudio(); syncAudioPreferences(); };
  window.addEventListener("pointerdown", go, { capture: true });
  window.addEventListener("keydown", go, { capture: true });
  window.addEventListener("storage", event => {
    if (["aura_beep_sound", "aura_sound_vol", "aura_sound_on"].includes(event.key)) syncAudioPreferences();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) go(); });
  syncAudioPreferences();
}
