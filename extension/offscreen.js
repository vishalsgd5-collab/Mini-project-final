let ctx = null;
let loopId = 0;

function audio() {
  const AC = self.AudioContext || self.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function beep(kind) {
  const ac = audio();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume();
  const now = ac.currentTime;
  const freqs = kind === "away" ? [880, 698] : kind === "docket" ? [523, 659] : [784, 988];
  freqs.forEach((f, i) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.40, now + 0.02 + i * 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28 + i * 0.2);
    o.connect(g);
    g.connect(ac.destination);
    o.start(now + i * 0.18);
    o.stop(now + 0.32 + i * 0.2);
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "AURA_BEEP") {
    beep(msg.kind || "fatigue");
    if (msg.loop) {
      if (loopId) clearInterval(loopId);
      loopId = setInterval(() => beep(msg.kind || "away"), 1400);
    }
  }
  if (msg?.type === "AURA_STOP_BEEP") {
    if (loopId) clearInterval(loopId);
    loopId = 0;
  }
});
