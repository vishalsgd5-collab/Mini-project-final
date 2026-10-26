importScripts("sound-catalog.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("aura-keep", { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("aura-keep", { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith("ember:")) enqueueSchedule(() => deliverSchedule(alarm.name.slice(6)));
  if (alarm.name === "aura-keep") enqueueSchedule(restoreSchedule);
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

let audioQueue = Promise.resolve();
function enqueueAudio(work) {
  const result = audioQueue.then(work);
  audioQueue = result.catch(console.error);
  return result;
}
async function saveAudioSettings(settings) {
  const safe = AuraSoundCatalog.sanitizePreferences(settings);
  await chrome.storage.local.set({ auraAudioSettings: safe });
  return safe;
}
async function playGuardianAudio(kind, loop = false, settings) {
  const stored = await chrome.storage.local.get("auraAudioSettings");
  const safe = settings ? await saveAudioSettings(settings) : AuraSoundCatalog.sanitizePreferences(stored.auraAudioSettings);
  // Muting does not cancel Windows notifications or the independent away alarm.
  if (!safe.enabled && kind !== "away") return;
  await ensureOffscreen();
  chrome.runtime.sendMessage({ type: "AURA_AUDIO_PLAY", kind, loop, settings: safe }, () => { void chrome.runtime.lastError; });
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

  if (msg.type === "AURA_ACTIVITY_PREFS") {
    if (!trustedScheduleSender(_sender.url)) { sendResponse({ ok: false }); return false; }
    const prefs = { enabled: msg.enabled === true, keyboard: msg.keyboard === true, mouse: msg.mouse === true, expiresAt: Date.now() + 90000 };
    chrome.storage.local.set({ auraActivityPrefs: prefs }).then(() => {
      broadcast({ type: "AURA_ACTIVITY_PREFS", prefs });
      sendResponse({ ok: true });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "AURA_ACTIVITY_GET_PREFS") {
    chrome.storage.local.get("auraActivityPrefs").then(({ auraActivityPrefs }) => sendResponse({ prefs: auraActivityPrefs || {} }));
    return true;
  }
  if (msg.type === "AURA_ACTIVITY_SAMPLE") {
    const s = msg.sample;
    if (!Number.isInteger(_sender.tab?.id) || _sender.tab.active === false || !s ||
        ![s.at, s.dt, s.keys, s.mouseDistance, s.mouseMs].every(Number.isFinite) ||
        Math.abs(Date.now() - s.at) > 4000 || s.dt <= 0 || s.dt > 2500) {
      sendResponse({ ok: false }); return false;
    }
    chrome.storage.local.get("auraActivityPrefs").then(({ auraActivityPrefs: prefs = {} }) => {
      if (!prefs.enabled || prefs.expiresAt <= Date.now()) { sendResponse({ ok: false }); return; }
      const sample = { at: s.at, dt: s.dt,
        keys: prefs.keyboard ? Math.max(0, Math.min(100, s.keys)) : 0,
        mouseDistance: prefs.mouse ? Math.max(0, Math.min(100000, s.mouseDistance)) : 0,
        mouseMs: prefs.mouse ? Math.max(0, Math.min(s.dt, s.mouseMs)) : 0 };
      // Do not expose cross-site activity totals to arbitrary website pages.
      chrome.tabs.query({}, tabs => {
        for (const tab of tabs) if (tab.id && trustedScheduleSender(tab.url)) {
          chrome.tabs.sendMessage(tab.id, { type: "AURA_ACTIVITY", sample }, () => { void chrome.runtime.lastError; });
        }
      });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "AURA_AUDIO_SETTINGS") {
    if (!trustedScheduleSender(_sender.url)) { sendResponse({ ok: false }); return false; }
    enqueueAudio(async () => {
      const settings = await saveAudioSettings(msg.settings);
      // Update a running away loop's volume without changing or stopping its tone.
      chrome.runtime.sendMessage({ type: "AURA_AUDIO_UPDATE", settings }, () => { void chrome.runtime.lastError; });
      sendResponse({ ok: true });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "AURA_SCHEDULE_SYNC") {
    if (!trustedScheduleSender(_sender.url)) { sendResponse({ ok: false }); return false; }
    enqueueSchedule(async () => {
      const { emberItems = [] } = await chrome.storage.local.get("emberItems");
      const items = (Array.isArray(msg.items) ? msg.items : []).slice(0, 500)
        .filter(it => typeof it.id === "string" && typeof it.title === "string" && Number.isFinite(Date.parse(it.when)))
        .map(it => {
          const previous = emberItems.find(row => row.id === it.id && row.when === it.when);
          return { id: it.id, title: it.title.slice(0, 200), note: String(it.note || "").slice(0, 500), when: it.when, done: !!it.done, notified: !!it.notified || !!previous?.notified };
        });
      await chrome.storage.local.set({ emberItems: items });
      await restoreSchedule();
      const stored = await chrome.storage.local.get("emberItems");
      sendResponse({ ok: true, items: stored.emberItems });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }

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
    if (!trustedScheduleSender(_sender.url)) { sendResponse({ ok: false }); return false; }
    enqueueAudio(() => playGuardianAudio(msg.kind || "fatigue", !!msg.loop, msg.settings));
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
    enqueueAudio(async () => {
      chrome.runtime.sendMessage({ type: "AURA_AUDIO_STOP" }, () => { void chrome.runtime.lastError; });
    });
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

// Persisted Chrome alarms wake the service worker; no open AURA tab is required.
let scheduleQueue = Promise.resolve();
function enqueueSchedule(work) {
  const result = scheduleQueue.then(work);
  scheduleQueue = result.catch(console.error);
  return result;
}
function trustedScheduleSender(url) {
  try {
    const u = new URL(url);
    return ["raw.githack.com", "cdn.jsdelivr.net", "vishalsgd5-collab.github.io", "localhost", "127.0.0.1"].includes(u.hostname)
      || u.hostname.endsWith(".e2b.app");
  } catch { return false; }
}
async function restoreSchedule() {
  const { emberItems = [] } = await chrome.storage.local.get("emberItems");
  const alarms = await chrome.alarms.getAll();
  for (const alarm of alarms) {
    if (alarm.name.startsWith("ember:")) await chrome.alarms.clear(alarm.name);
  }
  for (const item of emberItems) {
    if (item.done || item.notified) continue;
    const when = Date.parse(item.when);
    if (!Number.isFinite(when)) continue;
    if (when <= Date.now()) await deliverSchedule(item.id);
    else await chrome.alarms.create(`ember:${item.id}`, { when });
  }
}
async function deliverSchedule(id) {
  const { emberItems = [] } = await chrome.storage.local.get("emberItems");
  const item = emberItems.find(row => row.id === id);
  if (!item || item.done || item.notified) return;
  // Ignore stale alarms after editing a date.
  if (Date.parse(item.when) > Date.now()) {
    await chrome.alarms.create(`ember:${id}`, { when: Date.parse(item.when) });
    return;
  }
  await chrome.notifications.create(`ember:${id}`, {
    type: "basic", iconUrl: "icon128.png", title: "Ember Docket · scheduled reminder",
    message: `${item.title}${item.note ? " — " + item.note : ""}`,
    priority: 2, requireInteraction: true,
  });
  item.notified = true;
  await chrome.storage.local.set({ emberItems });
  broadcast({ type: "AURA_SCHEDULE_ACK", items: emberItems });
  broadcast({ type: "AURA_SCHEDULE_DUE", item });
  await enqueueAudio(() => playGuardianAudio("docket"));
}
chrome.runtime.onStartup.addListener(() => enqueueSchedule(restoreSchedule));
chrome.runtime.onInstalled.addListener(() => enqueueSchedule(restoreSchedule));
