chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("aura-keep", { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("aura-keep", { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(() => {
  /* keep the worker alive while Chrome is open */
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "AURA_RITUAL" && msg.item) {
    broadcastRitual(msg.item);
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "AURA_LIVE" && msg.metrics) {
    chrome.storage.local.set({ live: msg.metrics, liveAt: Date.now() });
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "AURA_TYPING") {
    chrome.storage.local.set({ typing: { rpm: msg.rpm, wpm: msg.wpm, at: Date.now() } });
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (!tab.id) continue;
        chrome.tabs.sendMessage(tab.id, { type: "AURA_TYPING", rpm: msg.rpm, wpm: msg.wpm }, () => {
          void chrome.runtime.lastError;
        });
      }
    });
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

function broadcastRitual(item) {
  chrome.storage.local.set({ lastRitual: item, lastRitualAt: Date.now() });
  chrome.notifications.create(`aura-${Date.now()}`, {
    type: "basic",
    iconUrl: "icon128.png",
    title: `AURA · ${item.title}`,
    message: item.cue || item.reason || "Take a 30–90 second pause.",
    priority: 2,
    requireInteraction: true,
  });
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: "AURA_RITUAL", item }, () => {
        void chrome.runtime.lastError;
      });
    }
  });
}
