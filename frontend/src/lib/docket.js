import { tellGuardian } from "./bridge";

const KEY = "aura_ember_docket";

export function loadDocket() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveDocket(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
  tellGuardian({ type: "AURA_SCHEDULE_SYNC", items });
  try {
    window.dispatchEvent(new CustomEvent("aura-docket"));
  } catch {
    /* ignore */
  }
}

export function newItem(partial = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    note: "",
    when: "",
    tag: "focus",
    done: false,
    notified: false,
    createdAt: Date.now(),
    ...partial,
  };
}

export function dueSoon(item, now = Date.now()) {
  if (!item.when || item.done || item.notified) return false;
  const t = new Date(item.when).getTime();
  if (!Number.isFinite(t)) return false;
  return t <= now;
}

// The extension owns delivery once it acknowledges this tab. Browser timers are fallback only.
let guardianReady = false;
export function scheduleManaged() { return guardianReady; }
export function connectSchedule() {
  const receive = (event) => {
    if (event.source !== window || event.data?.type !== "AURA_SCHEDULE_ACK") return;
    guardianReady = true;
    const updates = event.data.items || [];
    const current = loadDocket();
    const next = current.map(item => {
      const remote = updates.find(r => r.id === item.id);
      return remote && remote.when === item.when && remote.notified
        ? { ...item, notified: true } : item;
    });
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("aura-docket"));
  };
  window.addEventListener("message", receive);
  tellGuardian({ type: "AURA_SCHEDULE_SYNC", items: loadDocket() });
  return () => { guardianReady = false; window.removeEventListener("message", receive); };
}
