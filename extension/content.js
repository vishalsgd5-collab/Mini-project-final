(function () {
  let hud = null;
  let activityPrefs = { enabled: false, keyboard: false, mouse: false };
  const sampler = new AuraActivitySampler.InputSampler();
  const focused = () => !document.hidden && document.hasFocus();
  const capturing = () => activityPrefs.enabled && activityPrefs.expiresAt > Date.now();
  window.addEventListener("keydown", e => {
    if (capturing() && activityPrefs.keyboard && focused()) sampler.key(e);
  }, true);
  window.addEventListener("mousemove", e => {
    if (capturing() && activityPrefs.mouse && focused()) sampler.move(e);
  }, { passive: true });
  const resetSampler = () => sampler.reset(Date.now());
  window.addEventListener("blur", resetSampler);
  window.addEventListener("focus", resetSampler);
  document.addEventListener("visibilitychange", resetSampler);
  const updatePrefs = prefs => {
    const next = { enabled: prefs?.enabled === true, keyboard: prefs?.keyboard === true, mouse: prefs?.mouse === true,
      expiresAt: Number(prefs?.expiresAt) || 0 };
    if (["enabled", "keyboard", "mouse"].some(key => next[key] !== activityPrefs[key])) resetSampler();
    activityPrefs = next;
  };
  try {
    chrome.runtime.sendMessage({ type: "AURA_ACTIVITY_GET_PREFS" }, reply => {
      if (!chrome.runtime.lastError) {
        updatePrefs(reply?.prefs);
        window.postMessage({ type: "AURA_ACTIVITY_READY" }, window.location.origin);
      }
    });
  } catch { /* unloaded extension */ }
  setInterval(() => {
    const sample = sampler.sample();
    if (!capturing() || !focused() || !sample) return;
    try { chrome.runtime.sendMessage({ type: "AURA_ACTIVITY_SAMPLE", sample }, () => { void chrome.runtime.lastError; }); }
    catch { /* extension reloaded */ }
  }, 1000);

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || !data.type) return;
    if (
      data.type === "AURA_ACTIVITY_PREFS" ||
      data.type === "AURA_AUDIO_SETTINGS" ||
      data.type === "AURA_SCHEDULE_SYNC" ||
      data.type === "AURA_RITUAL" ||
      data.type === "AURA_LIVE" ||
      data.type === "AURA_BEEP" ||
      data.type === "AURA_STOP_BEEP"
    ) {
      try {
        chrome.runtime.sendMessage(data, (reply) => {
          if (chrome.runtime.lastError) return;
          if (data.type === "AURA_SCHEDULE_SYNC" && reply?.ok) {
            window.postMessage({ type: "AURA_SCHEDULE_ACK", items: reply.items }, window.location.origin);
          }
        });
      } catch {
        /* extension context invalidated */
      }
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "AURA_ACTIVITY_PREFS") updatePrefs(msg.prefs);
    if (msg?.type === "AURA_ACTIVITY") window.postMessage(msg, window.location.origin);
    if (msg?.type === "AURA_SCHEDULE_ACK") {
      window.postMessage(msg, window.location.origin);
    }
    if (msg?.type === "AURA_SCHEDULE_DUE") showOverlay({ title: msg.item.title, category: "scheduled reminder", cue: msg.item.note || "Your scheduled task is due.", duration_sec: 0 });
    if (msg?.type === "AURA_RITUAL" && msg.item) showOverlay(msg.item);
    if (msg?.type === "AURA_LIVE" && msg.metrics) paintHud(msg.metrics);
    if (msg?.type === "AURA_TYPING") {
      window.postMessage({ type: "AURA_TYPING", rpm: msg.rpm, wpm: msg.wpm }, "*");
    }
    // Sound is played once by the offscreen document, not once per open tab.
  });

  function ensureHud() {
    if (hud && document.body.contains(hud)) return hud;
    hud = document.getElementById("aura-site-hud");
    if (hud) return hud;
    hud = document.createElement("div");
    hud.id = "aura-site-hud";
    hud.innerHTML = `<span class="aura-dot"></span><strong>AURA</strong><em>waiting for Live iris</em>`;
    (document.body || document.documentElement).appendChild(hud);
    return hud;
  }

  function paintHud(m) {
    const el = ensureHud();
    const score = Math.round(m.score ?? m.fatigue ?? 0);
    const present = m.present !== false;
    const line = present
      ? `${score} fatigue · ${Math.round(m.attention ?? 100)} attn`
      : "NO FACE · away timer";
    el.classList.toggle("hot", score >= 50);
    el.classList.toggle("away", !present);
    el.innerHTML = `<span class="aura-dot"></span><strong>AURA</strong><em>${line}</em>`;
  }

  function showOverlay(item) {
    document.getElementById("aura-guardian-root")?.remove();
    const root = document.createElement("div");
    root.id = "aura-guardian-root";
    root.innerHTML = `
      <aside class="aura-card">
        <div class="aura-kicker">AURA · ${escapeHtml(item.category || "pause")} · ${item.duration_sec || 40}s</div>
        <h3>${escapeHtml(item.title || "Wellness pause")}</h3>
        <p>${escapeHtml(item.reason || item.cue || "A short reset now costs less than the crash later.")}</p>
        <ol>${(item.steps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
        <div class="aura-actions">
          <button class="aura-go" type="button">Begin</button>
          <button class="aura-skip" type="button">Not now</button>
        </div>
      </aside>`;
    document.documentElement.appendChild(root);
    root.querySelector(".aura-skip").onclick = () => root.remove();
    root.querySelector(".aura-go").onclick = () => {
      root.querySelector("h3").textContent = item.cue || "Breathe.";
      root.querySelector(".aura-go").textContent = "Done";
      root.querySelector(".aura-go").onclick = () => root.remove();
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureHud);
  } else {
    ensureHud();
  }
})();
