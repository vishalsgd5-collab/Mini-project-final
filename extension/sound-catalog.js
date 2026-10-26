/* Shared by Vite, the extension worker and its offscreen document. No network assets. */
(function (root) {
  const note = (frequency, at, duration, endFrequency = frequency, wave = "sine") =>
    ({ frequency, at, duration, endFrequency, wave });
  const sounds = [
    { id: "soft-double", name: "Soft double beep", detail: "Rounded two-note reminder", notes: [note(660, 0, .24), note(880, .37, .36)] },
    { id: "bright-triple", name: "Bright triple beep", detail: "Three clear ascending notes", notes: [note(740, 0, .22, 740, "triangle"), note(880, .28, .22, 880, "triangle"), note(1046, .56, .38, 1046, "triangle")] },
    { id: "digital-pulse", name: "Digital pulse", detail: "Four crisp attention pulses", notes: [0, .26, .52, .78].map(t => note(988, t, .15, 988, "triangle")) },
    { id: "rising-alert", name: "Rising alert", detail: "Two smooth upward sweeps", notes: [note(560, 0, .50, 1120), note(560, .70, .50, 1120)] },
    { id: "glass-chime", name: "Glass chime", detail: "Light, high-pitched descending chimes", notes: [note(1568, 0, .28), note(1318, .36, .28), note(1046, .72, .35)] },
    { id: "radar-ping", name: "Radar ping", detail: "Two spaced descending pings", notes: [note(1200, 0, .24, 750), note(1200, .55, .24, 750)] },
    { id: "low-pulse", name: "Low pulse", detail: "Lower-pitched three-beat alert", notes: [note(440, 0, .22, 440, "triangle"), note(440, .32, .22, 440, "triangle"), note(554, .64, .30, 554, "triangle")] },
    { id: "arcade-up", name: "Arcade up", detail: "Quick five-note ascending sequence", notes: [523, 659, 784, 1046, 1318].map((f, i) => note(f, i * .16, .12, f, "triangle")) },
  ];
  const DEFAULT_SOUND = "bright-triple";
  const awayNotes = [note(880, 0, .28), note(698, .35, .32)];
  const getSound = id => sounds.find(s => s.id === id) || sounds.find(s => s.id === DEFAULT_SOUND);
  function sanitizePreferences(value = {}) {
    if (!value || typeof value !== "object") value = {};
    const v = Number(value.volume);
    return {
      soundId: getSound(value.soundId).id,
      volume: Number.isFinite(v) ? Math.min(1, Math.max(.15, v)) : 1,
      enabled: value.enabled !== false,
    };
  }
  function readPreferences(storage) {
    try {
      const raw = storage.getItem("aura_sound_vol");
      return sanitizePreferences({
        soundId: storage.getItem("aura_beep_sound"),
        volume: raw === null || raw.trim() === "" ? 1 : Number(raw),
        enabled: storage.getItem("aura_sound_on") !== "0",
      });
    } catch { return sanitizePreferences(); }
  }
  function getNotes(id, kind) { return kind === "away" ? awayNotes : getSound(id).notes; }
  function play(context, id, volume = 1, kind = "fatigue") {
    const notes = getNotes(id, kind);
    const nodes = [];
    for (const n of notes) {
      const t = context.currentTime + n.at;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = n.wave;
      oscillator.frequency.setValueAtTime(n.frequency, t);
      if (n.endFrequency !== n.frequency) oscillator.frequency.linearRampToValueAtTime(n.endFrequency, t + n.duration);
      gain.gain.setValueAtTime(.0001, t);
      gain.gain.linearRampToValueAtTime(Math.min(1, Math.max(0, volume)) * .80, t + .018);
      gain.gain.setValueAtTime(Math.min(1, Math.max(0, volume)) * .80, t + Math.max(.02, n.duration - .065));
      gain.gain.linearRampToValueAtTime(.0001, t + n.duration);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(t); oscillator.stop(t + n.duration + .01);
      nodes.push(oscillator);
    }
    return () => { for (const o of nodes) { try { o.stop(); } catch { /* already ended */ } } };
  }
  // WAV fallback and downloadable previews use the same notes and envelope.
  function buildWav(id, kind = "fatigue") {
    const notes = getNotes(id, kind);
    const sr = 22050;
    const count = Math.ceil((Math.max(...notes.map(n => n.at + n.duration)) + .15) * sr);
    const samples = new Float32Array(count);
    for (const n of notes) {
      let phase = 0;
      const offset = Math.round(n.at * sr);
      for (let i = 0; i < Math.floor(n.duration * sr); i++) {
        const t = i / sr;
        phase += 2 * Math.PI * (n.frequency + (n.endFrequency - n.frequency) * t / n.duration) / sr;
        const value = n.wave === "triangle" ? (2 / Math.PI) * Math.asin(Math.sin(phase)) : Math.sin(phase);
        const envelope = Math.max(0, Math.min(1, t / .018, (n.duration - t) / .065));
        samples[offset + i] += value * envelope * .98;
      }
    }
    const buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
    const ascii = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    ascii(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); ascii(8, "WAVE");
    ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    ascii(36, "data"); view.setUint32(40, count * 2, true);
    samples.forEach((v, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, v)) * 32767), true));
    return buffer;
  }
  root.AuraSoundCatalog = Object.freeze({ sounds, DEFAULT_SOUND, getSound, sanitizePreferences, readPreferences, play, buildWav });
})(globalThis);
