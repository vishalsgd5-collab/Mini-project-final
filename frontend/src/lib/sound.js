const KEY = "aura_sound_on";
let ctx = null;

export function isSoundOn() {
  return localStorage.getItem(KEY) !== "0";
}

export function setSoundOn(on) {
  localStorage.setItem(KEY, on ? "1" : "0");
}

function audio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

export function unlockAudio() {
  const c = audio();
  if (c?.state === "suspended") c.resume().catch(() => {});
}

function tone(c, freq, start, dur, gain = 0.16) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

/** Two-note chime after 30s of sustained fatigue. Urgent = three rising notes. */
export function playFatigueBeep(urgent = false) {
  if (!isSoundOn()) return;
  const c = audio();
  if (!c) return;
  c.resume().catch(() => {});
  const t = c.currentTime + 0.01;
  if (urgent) {
    tone(c, 740, t, 0.18, 0.2);
    tone(c, 880, t + 0.16, 0.18, 0.2);
    tone(c, 988, t + 0.32, 0.28, 0.22);
  } else {
    tone(c, 659, t, 0.2, 0.18);
    tone(c, 831, t + 0.18, 0.32, 0.18);
  }
}

export function playRitualChime() {
  if (!isSoundOn()) return;
  const c = audio();
  if (!c) return;
  c.resume().catch(() => {});
  const t = c.currentTime + 0.01;
  tone(c, 523, t, 0.18, 0.12);
  tone(c, 659, t + 0.14, 0.22, 0.12);
}
