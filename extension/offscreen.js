/* The only Guardian audio renderer: one sound regardless of open-tab count. */
let ctx = null;
let loopId = 0;
let settings = AuraSoundCatalog.sanitizePreferences();
const playing = new Set();
let generation = 0;

async function beep(kind) {
  if (!settings.enabled && kind !== "away") return;
  const token = generation;
  const AC = self.AudioContext || self.webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") await ctx.resume();
  if (token !== generation) return;
  const stop = AuraSoundCatalog.play(ctx, settings.soundId, settings.volume, kind);
  playing.add(stop);
  setTimeout(() => playing.delete(stop), 2000);
}
function stopAudio() {
  generation++;
  if (loopId) clearInterval(loopId);
  loopId = 0;
  for (const stop of playing) stop();
  playing.clear();
}
chrome.runtime.onMessage.addListener(msg => {
  if (msg?.type === "AURA_AUDIO_UPDATE") {
    settings = AuraSoundCatalog.sanitizePreferences(msg.settings);
  }
  if (msg?.type === "AURA_AUDIO_PLAY") {
    settings = AuraSoundCatalog.sanitizePreferences(msg.settings);
    if (msg.loop) stopAudio();
    beep(msg.kind || "fatigue").catch(console.error);
    if (msg.loop) loopId = setInterval(() => beep(msg.kind || "away").catch(console.error), 1400);
  }
  if (msg?.type === "AURA_AUDIO_STOP") stopAudio();
});
