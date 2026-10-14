let swReady = null;

export function registerGuardian() {
  if (!("serviceWorker" in navigator)) return;
  const url = new URL("sw.js", window.location.href);
  swReady = navigator.serviceWorker.register(url.href).catch(() => null);
}

export async function enableAlerts() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "denied") return false;
  if (Notification.permission !== "granted") {
    const p = await Notification.requestPermission();
    if (p !== "granted") return false;
  }
  registerGuardian();
  return true;
}

export async function pushWindows(title, body, tag = "aura") {
  const ok = typeof Notification !== "undefined" && Notification.permission === "granted";
  if (!ok) return false;
  const icon = new URL("icon128.png", window.location.href).href;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(title, {
        body,
        tag,
        icon,
        badge: icon,
        requireInteraction: true,
        silent: false,
      });
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const n = new Notification(title, { body, tag, icon, requireInteraction: true, silent: false });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export async function pushRitual(item) {
  await pushWindows(
    `AURA · ${item.title || "Take a pause"}`,
    item.cue || item.reason || "A 30–90 second wellness ritual is due.",
    "aura-ritual"
  );
  try {
    window.postMessage({ type: "AURA_RITUAL", item }, "*");
  } catch {
    /* ignore */
  }
}

export async function testWindowsAlert() {
  const granted = await enableAlerts();
  if (!granted) return false;
  return pushWindows(
    "AURA · Windows alert is on",
    "This toast should appear in the Windows notification corner — not only on the website.",
    "aura-test"
  );
}
