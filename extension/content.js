(function () {
  const keyTimes = [];
  window.addEventListener(
    "keydown",
    () => {
      const now = Date.now();
      keyTimes.push(now);
      while (keyTimes.length && now - keyTimes[0] > 60000) keyTimes.shift();
      const rpm = keyTimes.length;
      const wpm = Math.round(rpm / 5);
      try {
        chrome.runtime.sendMessage({ type: "AURA_TYPING", rpm, wpm });
      } catch {
        /* ignore */
      }
      window.postMessage({ type: "AURA_TYPING", rpm, wpm }, "*");
    },
    true
  );


  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || (data.type !== "AURA_RITUAL" && data.type !== "AURA_LIVE")) return;
    try {
      chrome.runtime.sendMessage(data);
    } catch {
      /* extension context invalidated */
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "AURA_RITUAL" && msg.item) showOverlay(msg.item);
    if (msg?.type === "AURA_TYPING") {
      window.postMessage({ type: "AURA_TYPING", rpm: msg.rpm, wpm: msg.wpm }, "*");
    }
  });

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
})();
