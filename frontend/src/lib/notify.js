export async function enableAlerts() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const p = await Notification.requestPermission();
  return p === "granted";
}

export function pushRitual(item) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(`AURA · ${item.title}`, {
        body: item.cue || item.reason || "A short wellness pause is due.",
        tag: "aura-ritual",
        requireInteraction: true,
      });
    }
  } catch {
    /* ignore */
  }
  try {
    window.postMessage({ type: "AURA_RITUAL", item }, "*");
  } catch {
    /* ignore */
  }
  try {
    new BroadcastChannel("aura-guardian").postMessage({ type: "ritual", item });
  } catch {
    /* ignore */
  }
}
