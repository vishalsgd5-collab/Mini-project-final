(function () {
  const BRIDGE = "AURA_RITUAL";

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
