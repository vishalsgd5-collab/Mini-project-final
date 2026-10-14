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
  return t <= now + 15000;
}
