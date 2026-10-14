chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("aura-keep", { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("aura-keep", { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(() => {
  /* keep the worker alive while Chrome is open */
});

async function ensureOffscreen() {
  try {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play AURA fatigue and away alarms while you work in other tabs and apps.",
    });
  } catch {
    /* already created or unsupported */
  }
}

function broadcast(msg) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, msg, () => {
        void chrome.runtime.lastError;
      });
    }
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg?.type) return false;

  if (msg.type === "AURA_RITUAL" && msg.item) {
    chrome.storage.local.set({ lastRitual: msg.item, lastRitualAt: Date.now() });
    chrome.notifications.create(`aura-${Date.now()}`, {
      type: "basic",
      iconUrl: "icon128.png",
      title: `AURA · ${msg.item.title}`,
      message: msg.item.cue || msg.item.reason || "Take a 30–90 second pause.",
      priority: 2,
      requireInteraction: true,
    });
    broadcast(msg);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "AURA_LIVE" && msg.metrics) {
    chrome.storage.local.set({ live: msg.metrics, liveAt: Date.now() });
    broadcast({ type: "AURA_LIVE", metrics: msg.metrics });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "AURA_BEEP") {
    ensureOffscreen().then(() => {
      chrome.runtime.sendMessage(msg, () => {
        void chrome.runtime.lastError;
      });
    });
    broadcast(msg);
    const title =
      msg.kind === "away"
        ? "AURA · away from camera"
        : msg.kind === "docket"
          ? "Ember Docket · due now"
          : "AURA · fatigue";
    chrome.notifications.create(`aura-beep-${msg.kind || "fatigue"}`, {
      type: "basic",
      iconUrl: "icon128.png",
      title,
      message: "Same care as Live iris — look at the Guardian chip or return to AURA to Stop alarm.",
      priority: 2,
      requireInteraction: msg.kind === "away",
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "AURA_STOP_BEEP") {
    chrome.runtime.sendMessage(msg, () => {
      void chrome.runtime.lastError;
    });
    broadcast(msg);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "AURA_TYPING") {
    chrome.storage.local.set({ typing: { rpm: msg.rpm, wpm: msg.wpm, at: Date.now() } });
    broadcast({ type: "AURA_TYPING", rpm: msg.rpm, wpm: msg.wpm });
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
