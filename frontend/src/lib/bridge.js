import "../../../extension/sound-catalog.js";

/** Talk to the AURA Guardian extension (every website) and any same-origin tabs. */

export function tellGuardian(payload) {
  const msg = { ...payload, aura: true, at: Date.now() };
  try {
    window.postMessage(msg, "*");
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem("aura_bridge", JSON.stringify(msg));
  } catch {
    /* ignore */
  }
}

export function tellLive(metrics) {
  tellGuardian({ type: "AURA_LIVE", metrics });
}

export function tellBeep(kind = "fatigue", loop = false) {
  tellGuardian({ type: "AURA_BEEP", kind, loop, settings: globalThis.AuraSoundCatalog.readPreferences(localStorage) });
}

export function tellStopBeep() {
  tellGuardian({ type: "AURA_STOP_BEEP" });
}

export function tellHud(line) {
  tellGuardian({ type: "AURA_HUD", line });
}
