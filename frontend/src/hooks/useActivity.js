import { useCallback, useEffect, useRef, useState } from "react";
import { tellGuardian } from "../lib/bridge.js";
import { InputSampler, PersonalPace } from "../lib/activity.js";

export function useActivity(enabled, { keyboard = true, mouse = true } = {}) {
  const tracker = useRef(null);
  if (!tracker.current) tracker.current = new PersonalPace();
  const [stats, setStats] = useState(() => tracker.current.read());
  const resetBaseline = useCallback(() => {
    tracker.current.reset();
    setStats(tracker.current.read());
  }, []);

  useEffect(() => {
    // Preference changes discard earlier input and start a new opt-in calibration.
    tracker.current.reset();
    setStats(tracker.current.read());
  }, [keyboard, mouse]);

  useEffect(() => {
    tellGuardian({ type: "AURA_ACTIVITY_PREFS", enabled, keyboard, mouse });
    if (!enabled) { setStats(tracker.current.read()); return undefined; }
    const sampler = new InputSampler();
    let lastSync = Date.now();
    const focused = () => !document.hidden && document.hasFocus();
    const onKey = e => { if (keyboard && focused()) sampler.key(e); };
    const onMove = e => { if (mouse && focused()) sampler.move(e); };
    const onFocus = () => {
      sampler.reset(Date.now());
      tellGuardian({ type: "AURA_ACTIVITY_PREFS", enabled, keyboard, mouse });
    };
    const onMessage = e => {
      // Local and Guardian samples are alternatives, never summed/maxed together.
      if (e.source !== window) return;
      if (e.data?.type === "AURA_ACTIVITY_READY") {
        tellGuardian({ type: "AURA_ACTIVITY_PREFS", enabled, keyboard, mouse }); return;
      }
      if (e.data?.type !== "AURA_ACTIVITY" || focused()) return;
      tracker.current.ingest(e.data.sample, Date.now(), { keyboard, mouse });
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("message", onMessage);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const id = setInterval(() => {
      const now = Date.now(), sample = sampler.sample(now);
      if (now - lastSync >= 15000) {
        tellGuardian({ type: "AURA_ACTIVITY_PREFS", enabled, keyboard, mouse });
        lastSync = now;
      }
      if (focused()) tracker.current.ingest(sample, now, { keyboard, mouse });
      setStats(tracker.current.read(now));
    }, 1000);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(id);
      sampler.reset(Date.now());
      tracker.current.suspend();
      tellGuardian({ type: "AURA_ACTIVITY_PREFS", enabled: false, keyboard: false, mouse: false });
    };
  }, [enabled, keyboard, mouse]);
  return { ...stats, resetBaseline };
}
