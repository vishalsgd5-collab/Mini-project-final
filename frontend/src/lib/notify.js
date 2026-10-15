let swReady = null;

export function registerGuardian() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const url = new URL("sw.js", window.location.href.split("#")[0]);
    swReady = navigator.serviceWorker.register(url.href, { scope: "./" }).catch(() => null);
  } catch {
    swReady = null;
  }
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

function iconUrl() {
  try {
    return new URL("icon128.png", window.location.href.split("#")[0]).href;
  } catch {
    return undefined;
  }
}

/** Always try the classic Notification API — that is what Windows shows in the corner. */
export async function pushWindows(title, body, tag = "aura") {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") {
    try {
      const p = await Notification.requestPermission();
      if (p !== "granted") return false;
    } catch {
      return false;
    }
  }
  const icon = iconUrl();
  let shown = false;
  try {
    const n = new Notification(title, {
      body,
      tag,
      icon,
      requireInteraction: true,
      silent: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    /* continue */
  }
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(title, {
        body,
        tag,
        icon,
        requireInteraction: true,
        silent: false,
      });
      shown = true;
    }
  } catch {
    /* ignore */
  }
  return shown;
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
    "AURA · Windows notification",
    "Look at the bottom-right of your screen — this should be a Windows toast, not only a website banner.",
    "aura-test"
  );
}
