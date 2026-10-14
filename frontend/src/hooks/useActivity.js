import { useEffect, useRef, useState } from "react";

export function useActivity(enabled) {
  const [stats, setStats] = useState({
    typingRpm: 0,
    typingWpm: 0,
    mouseIntensity: 0,
    idleRatio: 0,
    lookAwayRatio: 0,
  });
  const keys = useRef([]);
  const moves = useRef([]);
  const lastInput = useRef(performance.now());
  const idleMs = useRef(0);
  const lastTick = useRef(performance.now());
  const hiddenMs = useRef(0);
  const hiddenAt = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const onKey = () => {
      const t = performance.now();
      keys.current.push(t);
      lastInput.current = t;
    };
    const onMove = () => {
      const t = performance.now();
      moves.current.push(t);
      lastInput.current = t;
    };
    const onVis = () => {
      if (document.hidden) hiddenAt.current = performance.now();
      else if (hiddenAt.current) {
        hiddenMs.current += performance.now() - hiddenAt.current;
        hiddenAt.current = null;
      }
    };

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keypress", onKey, true);
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVis);

    const id = setInterval(() => {
      const now = performance.now();
      const cutoff = now - 60000;
      keys.current = keys.current.filter((t) => t >= cutoff);
      moves.current = moves.current.filter((t) => t >= cutoff);
      const dt = now - lastTick.current;
      lastTick.current = now;
      if (now - lastInput.current > 4000) idleMs.current += dt;
      const windowMs = 60000;
      setStats({
        typingRpm: keys.current.length,
        typingWpm: Math.round(keys.current.length / 5),
        mouseIntensity: Math.min(1, moves.current.length / 180),
        idleRatio: Math.min(1, idleMs.current / windowMs),
        lookAwayRatio: Math.min(1, hiddenMs.current / windowMs),
      });
      idleMs.current *= 0.92;
      hiddenMs.current *= 0.92;
    }, 1000);

    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keypress", onKey, true);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(id);
    };
  }, [enabled]);

  return stats;
}
